import {
  DeerKillLog,
  Location,
  SavedPath,
  SavedPin,
  SavedPolygon,
  ThemeMode,
  TrailCameraLocation,
  TrailCameraPhoto,
  TrailCameraTarget,
  UnitSystem,
  PressureUnit,
} from '../types';
import {
  getAllPhotos,
  getCameraLocations,
  getTargets,
  getThumbnailUrl,
  saveCameraLocation,
  savePhotoWithThumbnail,
  saveTarget,
} from './trailCameraService';
import { NotificationPrefs, getNotificationPrefs, saveNotificationPrefs } from './notificationService';

const BACKUP_TYPE = 'letshunt-backup';
const BACKUP_VERSION = 1;

// localStorage keys that are part of the backup (settings + user data).
const LOCAL_STORAGE_KEYS = {
  theme: 'letshunt_theme',
  units: 'letshunt_units',
  pressureUnit: 'letshunt_pressure_unit',
  defaultLocation: 'letshunt_default_location',
  currentLocation: 'letshunt_location',
  favorites: 'letshunt_favorites',
  customBackground: 'letshunt_custom_background',
  bgOpacity: 'letshunt_bg_opacity',
  bgBlur: 'letshunt_bg_blur',
  logs: 'letshunt_deer_kill_logs',
  pins: 'letshunt_saved_pins',
  polygons: 'letshunt_saved_polygons',
  paths: 'letshunt_saved_paths',
  pushServerUrl: 'letshunt_push_server_url',
  mapStyle: 'letshunt_map_style',
  showPreferredWind: 'letshunt_show_preferred_wind',
  showScentCone: 'letshunt_show_scent_cone',
  showPropertyBoundaries: 'letshunt_show_property_boundaries',
  showZones: 'letshunt_show_zones',
  showPaths: 'letshunt_show_paths',
  showPins: 'letshunt_show_pins',
  trailcamDefaultLoc: 'letshunt_trailcam_default_loc',
} as const;

export interface BackupSummary {
  logs: number;
  pins: number;
  polygons: number;
  paths: number;
  favorites: number;
  targets: number;
  locations: number;
  photos: number;
  exportedAt: string;
}

export interface LetsHuntBackup {
  app: 'LetsHunt';
  type: typeof BACKUP_TYPE;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  settings: {
    theme: ThemeMode;
    units: UnitSystem;
    pressureUnit: PressureUnit;
    defaultLocation: Location | null;
    currentLocation: Location | null;
    favorites: Location[];
    customBackground: string | null;
    bgOpacity: number;
    bgBlur: number;
    notificationPrefs: NotificationPrefs;
    pushServerUrl: string;
  };
  logs: DeerKillLog[];
  map: {
    pins: SavedPin[];
    polygons: SavedPolygon[];
    paths: SavedPath[];
  };
  trailCams: {
    targets: TrailCameraTarget[];
    locations: TrailCameraLocation[];
    photos: (TrailCameraPhoto & { thumbnailUrl?: string })[];
  };
  // Small UI preferences (map style, layer visibility, trail-cam default location)
  preferences: {
    mapStyle: string | null;
    showPreferredWind: string | null;
    showScentCone: string | null;
    showPropertyBoundaries: string | null;
    showZones: string | null;
    showPaths: string | null;
    showPins: string | null;
    trailcamDefaultLoc: string | null;
  };
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage full or unavailable — ignore during import */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function numOr(key: string, fallback: number): number {
  const raw = safeGet(key);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// ---- Export ----
export async function exportBackupData(): Promise<{ json: string; summary: BackupSummary }> {
  const [photos, targets, locations] = await Promise.all([getAllPhotos(), getTargets(), getCameraLocations()]);

  // Attach thumbnails so an imported backup keeps the gallery usable without the
  // full-res blobs (which are intentionally excluded to keep the JSON small).
  const photosWithThumbs: (TrailCameraPhoto & { thumbnailUrl?: string })[] = [];
  for (const p of photos) {
    const thumb = await getThumbnailUrl(p.id);
    photosWithThumbs.push({ ...p, thumbnailUrl: thumb || undefined });
  }

  const exportedAt = new Date().toISOString();

  const backup: LetsHuntBackup = {
    app: 'LetsHunt',
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt,
    settings: {
      theme: (safeGet(LOCAL_STORAGE_KEYS.theme) as ThemeMode) || 'dark',
      units: (safeGet(LOCAL_STORAGE_KEYS.units) as UnitSystem) || 'imperial',
      pressureUnit: (safeGet(LOCAL_STORAGE_KEYS.pressureUnit) as PressureUnit) || 'inHg',
      defaultLocation: readJSON<Location | null>(LOCAL_STORAGE_KEYS.defaultLocation, null),
      currentLocation: readJSON<Location | null>(LOCAL_STORAGE_KEYS.currentLocation, null),
      favorites: readJSON<Location[]>(LOCAL_STORAGE_KEYS.favorites, []),
      customBackground: safeGet(LOCAL_STORAGE_KEYS.customBackground),
      bgOpacity: numOr(LOCAL_STORAGE_KEYS.bgOpacity, 90),
      bgBlur: numOr(LOCAL_STORAGE_KEYS.bgBlur, 12),
      notificationPrefs: getNotificationPrefs(),
      pushServerUrl: safeGet(LOCAL_STORAGE_KEYS.pushServerUrl) || '',
    },
    logs: readJSON<DeerKillLog[]>(LOCAL_STORAGE_KEYS.logs, []),
    map: {
      pins: readJSON<SavedPin[]>(LOCAL_STORAGE_KEYS.pins, []),
      polygons: readJSON<SavedPolygon[]>(LOCAL_STORAGE_KEYS.polygons, []),
      paths: readJSON<SavedPath[]>(LOCAL_STORAGE_KEYS.paths, []),
    },
    trailCams: { targets, locations, photos: photosWithThumbs },
    preferences: {
      mapStyle: safeGet(LOCAL_STORAGE_KEYS.mapStyle),
      showPreferredWind: safeGet(LOCAL_STORAGE_KEYS.showPreferredWind),
      showScentCone: safeGet(LOCAL_STORAGE_KEYS.showScentCone),
      showPropertyBoundaries: safeGet(LOCAL_STORAGE_KEYS.showPropertyBoundaries),
      showZones: safeGet(LOCAL_STORAGE_KEYS.showZones),
      showPaths: safeGet(LOCAL_STORAGE_KEYS.showPaths),
      showPins: safeGet(LOCAL_STORAGE_KEYS.showPins),
      trailcamDefaultLoc: safeGet(LOCAL_STORAGE_KEYS.trailcamDefaultLoc),
    },
  };

  const summary: BackupSummary = {
    logs: backup.logs.length,
    pins: backup.map.pins.length,
    polygons: backup.map.polygons.length,
    paths: backup.map.paths.length,
    favorites: backup.settings.favorites.length,
    targets: targets.length,
    locations: locations.length,
    photos: photosWithThumbs.length,
    exportedAt,
  };

  return { json: JSON.stringify(backup, null, 2), summary };
}

// ---- Import ----
export async function importBackupData(json: string): Promise<BackupSummary> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const backup = parsed as Partial<LetsHuntBackup>;
  if (backup?.app !== 'LetsHunt' || backup?.type !== BACKUP_TYPE) {
    throw new Error('That file does not look like a LetsHunt backup.');
  }
  if (backup?.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version (${backup?.version}). Please update LetsHunt and try again.`);
  }

  const settings = backup.settings || ({} as LetsHuntBackup['settings']);

  // Settings — validate enum values so a hand-edited backup can't corrupt state.
  const validThemes: ThemeMode[] = ['dark', 'light', 'olive', 'hunting'];
  const validUnits: UnitSystem[] = ['imperial', 'metric'];
  const validPressure: PressureUnit[] = ['inHg', 'hPa'];
  if (validThemes.includes(settings.theme as ThemeMode)) safeSet(LOCAL_STORAGE_KEYS.theme, settings.theme);
  if (validUnits.includes(settings.units as UnitSystem)) safeSet(LOCAL_STORAGE_KEYS.units, settings.units);
  if (validPressure.includes(settings.pressureUnit as PressureUnit)) safeSet(LOCAL_STORAGE_KEYS.pressureUnit, settings.pressureUnit);
  if (settings.defaultLocation) safeSet(LOCAL_STORAGE_KEYS.defaultLocation, JSON.stringify(settings.defaultLocation));
  if (settings.currentLocation) safeSet(LOCAL_STORAGE_KEYS.currentLocation, JSON.stringify(settings.currentLocation));
  if (Array.isArray(settings.favorites)) safeSet(LOCAL_STORAGE_KEYS.favorites, JSON.stringify(settings.favorites));
  if (settings.customBackground) {
    safeSet(LOCAL_STORAGE_KEYS.customBackground, settings.customBackground);
  } else {
    safeRemove(LOCAL_STORAGE_KEYS.customBackground);
  }
  if (typeof settings.bgOpacity === 'number') safeSet(LOCAL_STORAGE_KEYS.bgOpacity, String(settings.bgOpacity));
  if (typeof settings.bgBlur === 'number') safeSet(LOCAL_STORAGE_KEYS.bgBlur, String(settings.bgBlur));
  if (settings.notificationPrefs) saveNotificationPrefs(settings.notificationPrefs);
  if (settings.pushServerUrl) {
    safeSet(LOCAL_STORAGE_KEYS.pushServerUrl, settings.pushServerUrl);
  } else {
    safeRemove(LOCAL_STORAGE_KEYS.pushServerUrl);
  }

  // Harvest logs + map layers
  if (Array.isArray(backup.logs)) safeSet(LOCAL_STORAGE_KEYS.logs, JSON.stringify(backup.logs));
  if (Array.isArray(backup.map?.pins)) safeSet(LOCAL_STORAGE_KEYS.pins, JSON.stringify(backup.map.pins));
  if (Array.isArray(backup.map?.polygons)) safeSet(LOCAL_STORAGE_KEYS.polygons, JSON.stringify(backup.map.polygons));
  if (Array.isArray(backup.map?.paths)) safeSet(LOCAL_STORAGE_KEYS.paths, JSON.stringify(backup.map.paths));

  // Trail cams (IndexedDB)
  const targets = Array.isArray(backup.trailCams?.targets) ? backup.trailCams.targets : [];
  const locations = Array.isArray(backup.trailCams?.locations) ? backup.trailCams.locations : [];
  const photos = Array.isArray(backup.trailCams?.photos) ? backup.trailCams.photos : [];

  for (const t of targets) {
    if (t?.id) await saveTarget(t);
  }
  for (const l of locations) {
    if (l?.id) await saveCameraLocation(l);
  }
  for (const p of photos) {
    if (p?.id) await savePhotoWithThumbnail(p as TrailCameraPhoto, p.thumbnailUrl);
  }

  // Preferences (map style, layer visibility, trail-cam default location)
  const prefs = backup.preferences || ({} as LetsHuntBackup['preferences']);
  const prefKeys: { key: keyof LetsHuntBackup['preferences']; lsKey: string }[] = [
    { key: 'mapStyle', lsKey: LOCAL_STORAGE_KEYS.mapStyle },
    { key: 'showPreferredWind', lsKey: LOCAL_STORAGE_KEYS.showPreferredWind },
    { key: 'showScentCone', lsKey: LOCAL_STORAGE_KEYS.showScentCone },
    { key: 'showPropertyBoundaries', lsKey: LOCAL_STORAGE_KEYS.showPropertyBoundaries },
    { key: 'showZones', lsKey: LOCAL_STORAGE_KEYS.showZones },
    { key: 'showPaths', lsKey: LOCAL_STORAGE_KEYS.showPaths },
    { key: 'showPins', lsKey: LOCAL_STORAGE_KEYS.showPins },
    { key: 'trailcamDefaultLoc', lsKey: LOCAL_STORAGE_KEYS.trailcamDefaultLoc },
  ];
  for (const { key, lsKey } of prefKeys) {
    const val = prefs[key];
    if (typeof val === 'string' && val) {
      safeSet(lsKey, val);
    } else {
      safeRemove(lsKey);
    }
  }

  return {
    logs: Array.isArray(backup.logs) ? backup.logs.length : 0,
    pins: Array.isArray(backup.map?.pins) ? backup.map.pins.length : 0,
    polygons: Array.isArray(backup.map?.polygons) ? backup.map.polygons.length : 0,
    paths: Array.isArray(backup.map?.paths) ? backup.map.paths.length : 0,
    favorites: Array.isArray(settings.favorites) ? settings.favorites.length : 0,
    targets: targets.length,
    locations: locations.length,
    photos: photos.length,
    exportedAt: backup.exportedAt || new Date().toISOString(),
  };
}

// Download helper shared by the UI
export function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function defaultBackupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `letshunt-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
