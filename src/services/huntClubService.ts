/**
 * HuntClub — create/join clubs, publish & pull the club's data bundle.
 *
 * A HuntClub is exactly what the user asked for: a named dataset that is the
 * same `LetsHuntBackup` JSON the app already exports/imports. Creating a club
 * publishes the current device's data (including full-res trail cam photos to
 * Backblaze B2); joining with an invite code pulls that bundle and imports it
 * locally, then reloads the app just like a manual restore.
 *
 * Local storage stays the source of truth while the app is offline; these
 * functions are the explicit "sync now" actions. Continuous background sync
 * is the next phase (see forecast-batches/06-accounts-cloud-sync.md).
 */
import { supabase, getCurrentUser } from './supabaseService';
import { exportBackupData, importBackupData, type BackupSummary } from './dataBackupService';
import { getAllPhotos, getFullImageBlob } from './trailCameraService';
import { uploadPhotoBlob } from './b2Service';
import type { ActiveClub, HuntClub, HuntClubRole, PublishResult } from '../types';
import { safeGetJSON, safeSetJSON, safeRemove } from '../utils/storage';

const ACTIVE_CLUB_KEY = 'letshunt_active_club';

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

  // 1. Data bundle → hunt_club_data (jsonb).
  const { json } = await exportBackupData();
  const payload = JSON.parse(json) as unknown;
  const { error: dataErr } = await supabase
    .from('hunt_club_data')
    .upsert(
      {
        club_id: clubId,
        payload,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id' }
    );
  if (dataErr) throw new Error(`Could not save club data: ${dataErr.message}`);

  // 2. Full-res photos → B2 (keyed by photo id), metadata mirrored to
  //    trail_cam_photos so the club gallery can list without the bundle.
  const photos = await getAllPhotos();
  let uploadedPhotos = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    try {
      const blob = await getFullImageBlob(p.id);
      if (blob) {
        await uploadPhotoBlob(clubId, p.id, blob, blob.type);
        uploadedPhotos++;
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
    dataBytes: json.length,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Pull the club's data bundle and import it into this device. Returns the
 * backup summary, or null when the club hasn't published data yet.
 * Callers reload the app after a non-null import.
 */
export async function pullClubData(clubId: string): Promise<BackupSummary | null> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { data, error } = await supabase
    .from('hunt_club_data')
    .select('payload')
    .eq('club_id', clubId)
    .maybeSingle();
  if (error) throw new Error(`Could not fetch club data: ${error.message}`);
  if (!data?.payload) return null;
  return importBackupData(JSON.stringify(data.payload));
}
