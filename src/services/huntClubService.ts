/**
 * HuntClub — create/join clubs, publish & pull the club's data bundle.
 *
 * A HuntClub is exactly what the user asked for: a named dataset that is the
 * same `LetsHuntBackup` JSON the app already exports/imports. Creating a club
 * publishes the current device's data (including full-res trail cam photos to
 * Backblaze B2); joining with an invite code pulls that bundle and imports it
 * locally, then reloads the app just like a manual restore.
 *
 * Local storage stays the source of truth while the app is offline; manual
 * "sync now" actions remain available, and the app schedules a debounced sync
 * whenever local data changes while an active club is selected.
 */
import { supabase, getCurrentUser } from './supabaseService';
import { exportBackupData, importBackupData, type BackupSummary, type LetsHuntBackup } from './dataBackupService';
import { getAllPhotos, getFullImageBlob, saveFullImageBlob } from './trailCameraService';
import { getPhotoDownloadUrl, uploadPhotoBlob } from './b2Service';
import type { ActiveClub, HuntClub, HuntClubRole, PublishResult } from '../types';
import { safeGetJSON, safeSetJSON, safeRemove } from '../utils/storage';

const ACTIVE_CLUB_KEY = 'letshunt_active_club';
const SYNC_VERSION_KEY_PREFIX = 'letshunt_club_sync_version:';
const uploadedPhotoKeys = new Set<string>();

interface ClubDataRow {
  payload: unknown;
  updated_at: string;
}

function syncVersionKey(clubId: string): string {
  return `${SYNC_VERSION_KEY_PREFIX}${clubId}`;
}

function getKnownClubVersion(clubId: string): string | null {
  try {
    return localStorage.getItem(syncVersionKey(clubId));
  } catch {
    return null;
  }
}

// Sync bookkeeping must not emit DATA_CHANGED_EVENT: changing this marker is
// not user data and must never schedule another cloud upload.
function rememberClubVersion(clubId: string, updatedAt: string | null): void {
  try {
    if (updatedAt) localStorage.setItem(syncVersionKey(clubId), updatedAt);
    else localStorage.removeItem(syncVersionKey(clubId));
  } catch {
    /* localStorage may be unavailable in private/embedded browsers */
  }
}

async function fetchClubDataRow(clubId: string): Promise<ClubDataRow | null> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { data, error } = await supabase
    .from('hunt_club_data')
    .select('payload, updated_at')
    .eq('club_id', clubId)
    .maybeSingle();
  if (error) throw new Error(`Could not fetch club data: ${error.message}`);
  if (!data?.payload) return null;
  return data as ClubDataRow;
}

function mergeById<T extends { id: string }>(remoteItems: T[] | undefined, localItems: T[] | undefined): T[] {
  const merged = new Map<string, T>();
  for (const item of remoteItems ?? []) {
    if (item?.id) merged.set(item.id, item);
  }
  // The local device wins for an existing record, while records created on
  // either device are retained. This prevents a stale full-bundle upload from
  // deleting a pin/path/polygon that another device just added.
  for (const item of localItems ?? []) {
    if (item?.id) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

function mergeCloudBackup(local: LetsHuntBackup, remotePayload: unknown): LetsHuntBackup {
  const remote = remotePayload as Partial<LetsHuntBackup> | null;
  if (!remote || remote.app !== 'LetsHunt' || remote.type !== 'letshunt-backup') return local;

  return {
    ...local,
    logs: mergeById(remote.logs, local.logs),
    map: {
      ...local.map,
      pins: mergeById(remote.map?.pins, local.map?.pins),
      polygons: mergeById(remote.map?.polygons, local.map?.polygons),
      paths: mergeById(remote.map?.paths, local.map?.paths),
    },
    trailCams: {
      ...local.trailCams,
      targets: mergeById(remote.trailCams?.targets, local.trailCams?.targets),
      locations: mergeById(remote.trailCams?.locations, local.trailCams?.locations),
      photos: mergeById(remote.trailCams?.photos, local.trailCams?.photos),
    },
  };
}

// Compare bundles independently of export time, object-key order, or the order
// IndexedDB happens to return records. This keeps background sync quiet after
// a reload instead of manufacturing a new cloud version for identical data.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    if (items.every((item) => item !== null && typeof item === 'object' && 'id' in item)) {
      return items.sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
    }
    return items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'exportedAt')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function sameBundle(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

async function restoreClubData(clubId: string, row: ClubDataRow): Promise<BackupSummary> {
  const backup = row.payload as LetsHuntBackup;
  const summary = await importBackupData(JSON.stringify(row.payload));
  // Mark the version before the optional B2 downloads. A background poll must
  // not start the same metadata import again while large photos are restoring.
  rememberClubVersion(clubId, row.updated_at);

  // JSON intentionally carries thumbnails only. Restore each matching B2
  // object as well so the gallery and photo preview have the original image
  // locally after a HuntClub load, rather than stopping at the low-res copy.
  const cloudPhotos = Array.isArray(backup.trailCams?.photos)
    ? backup.trailCams.photos
    : [];
  for (const photo of cloudPhotos) {
    if (!photo?.id) continue;
    try {
      if (await getFullImageBlob(photo.id)) continue;

      const url = await getPhotoDownloadUrl(clubId, photo.id);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const blob = await response.blob();
      if (blob.size > 0) await saveFullImageBlob(photo.id, blob);
    } catch (err) {
      console.warn(`[club] full-resolution download failed for photo \"${photo.id}\":`, err);
    }
  }

  return summary;
}

export interface ClubPullResult {
  changed: boolean;
  summary: BackupSummary | null;
  updatedAt: string | null;
}

// ---- Row mapping (snake_case DB → camelCase UI) ----
interface ClubRow {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
}

function mapClub(row: ClubRow): HuntClub {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export interface MyClub extends HuntClub {
  role: HuntClubRole;
}

// ---- Active club (this device) ----
export function setActiveClub(club: ActiveClub | null): void {
  if (club) {
    safeSetJSON(ACTIVE_CLUB_KEY, club);
  } else {
    safeRemove(ACTIVE_CLUB_KEY);
  }
}

export function getActiveClub(): ActiveClub | null {
  return safeGetJSON<ActiveClub | null>(ACTIVE_CLUB_KEY, null);
}

// ---- Queries ----
/** All clubs the signed-in user belongs to, with their role. */
export async function getMyClubs(): Promise<MyClub[]> {
  if (!supabase) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('hunt_clubs')
    .select('*, hunt_club_members!inner(role)')
    .eq('hunt_club_members.user_id', user.id);
  if (error) {
    console.error('[club] getMyClubs failed:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    ...mapClub(row),
    role: row.hunt_club_members?.[0]?.role ?? 'member',
  }));
}

// ---- Mutations ----
/** Create a club owned by the current user (server-side RPC, atomic). */
export async function createHuntClub(name: string): Promise<HuntClub> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in first.');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Please give your HuntClub a name.');

  const { data, error } = await supabase.rpc('create_club_with_membership', {
    cname: trimmed,
  });
  if (error) throw new Error(error.message);
  return mapClub(data as ClubRow);
}

/** Join a club by invite code (e.g. "XK9F-7B2A"). Server-side RPC, idempotent. */
export async function joinHuntClub(inviteCode: string): Promise<HuntClub> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in first.');

  const code = inviteCode.trim().toUpperCase().replace(/\s+/g, '-');
  const { data, error } = await supabase.rpc('join_club_by_code', { code });
  if (error) {
    // PostgREST surfaces the RAISE EXCEPTION message in error.message.
    throw new Error(
      error.message.includes('No HuntClub found')
        ? error.message
        : `Could not join that club: ${error.message}`
    );
  }
  return mapClub(data as ClubRow);
}

/**
 * Push this device's full data bundle (the LetsHuntBackup JSON) to the club,
 * and upload any full-res trail cam photos to B2 that aren't there yet.
 * Returns a summary for the toast.
 */
export async function publishClubData(
  clubId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<PublishResult> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in first.');

  // 1. Data bundle → hunt_club_data (jsonb). Merge collection records with
  // the current cloud bundle first, so two devices adding map elements close
  // together do not overwrite one another with stale full-bundle snapshots.
  const remoteRow = await fetchClubDataRow(clubId);
  const { json: localJson } = await exportBackupData();
  const localPayload = JSON.parse(localJson) as LetsHuntBackup;
  const payload = mergeCloudBackup(localPayload, remoteRow?.payload);
  const payloadJson = JSON.stringify(payload, null, 2);
  const requestedUpdatedAt = new Date().toISOString();
  const remotePayload = remoteRow?.payload as Partial<LetsHuntBackup> | null;
  const contentIsUnchanged = Boolean(remoteRow && sameBundle(payload, remotePayload));
  let savedUpdatedAt = remoteRow?.updated_at || requestedUpdatedAt;

  // Do not bump the cloud version when a page reload merely re-emits its
  // persisted settings. Without this guard, two devices would continuously
  // trigger one another's background pull/reload cycle.
  if (!contentIsUnchanged) {
    const { data: savedData, error: dataErr } = await supabase
      .from('hunt_club_data')
      .upsert(
        {
          club_id: clubId,
          payload,
          updated_by: user.id,
          updated_at: requestedUpdatedAt,
        },
        { onConflict: 'club_id' }
      )
      .select('updated_at')
      .single();
    if (dataErr) throw new Error(`Could not save club data: ${dataErr.message}`);
    savedUpdatedAt = (savedData as { updated_at?: string } | null)?.updated_at || requestedUpdatedAt;
  }
  rememberClubVersion(clubId, savedUpdatedAt);

  // 2. Full-res photos → B2 (keyed by photo id), metadata mirrored to
  //    trail_cam_photos so the club gallery can list without the bundle.
  const photos = await getAllPhotos();
  let uploadedPhotos = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    try {
      const blob = await getFullImageBlob(p.id);
      if (blob) {
        // Avoid re-uploading unchanged image bytes on every debounced settings,
        // map, or log update. A new page session will verify the current bundle
        // by uploading each photo once again.
        const uploadKey = `${clubId}:${p.id}:${blob.size}:${blob.type}`;
        if (!uploadedPhotoKeys.has(uploadKey)) {
          await uploadPhotoBlob(clubId, p.id, blob, blob.type);
          uploadedPhotoKeys.add(uploadKey);
          uploadedPhotos++;
        }
      }
      await supabase.from('trail_cam_photos').upsert(
        {
          id: p.id,
          club_id: clubId,
          file_name: p.fileName,
          date_time: p.dateTime ?? null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          camera_location_name: p.cameraLocationName ?? null,
          is_favorite: p.isFavorite,
        },
        { onConflict: 'id' }
      );
    } catch (err) {
      console.warn(`[club] publish failed for photo "${p.id}":`, err);
    }
    onProgress?.(i + 1, photos.length);
  }

  return {
    uploadedPhotos,
    dataBytes: payloadJson.length,
    updatedAt: savedUpdatedAt,
  };
}

/**
 * Pull the club's data bundle and import it into this device. Returns the
 * backup summary, or null when the club hasn't published data yet.
 * Callers reload the app after a non-null import.
 */
export async function pullClubData(clubId: string): Promise<BackupSummary | null> {
  const row = await fetchClubDataRow(clubId);
  if (!row) {
    rememberClubVersion(clubId, null);
    return null;
  }
  return restoreClubData(clubId, row);
}

/** Pull only when Supabase has a version this device has not seen. */
export async function pullClubDataIfChanged(clubId: string): Promise<ClubPullResult> {
  const row = await fetchClubDataRow(clubId);
  if (!row) return { changed: false, summary: null, updatedAt: null };

  const knownVersion = getKnownClubVersion(clubId);
  if (knownVersion === row.updated_at) {
    return { changed: false, summary: null, updatedAt: row.updated_at };
  }

  const summary = await restoreClubData(clubId, row);
  return { changed: true, summary, updatedAt: row.updated_at };
}
