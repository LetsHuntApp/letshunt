/**
 * 5-Day Precipitation Forecast overlay — data source.
 *
 * Fetches a 2-D grid of hourly precipitation from Open-Meteo's bulk endpoint.
 * Each grid cell's latitude/longitude is snapped by the model to its native
 * grid (GFS = 0.25° ≈ 27 km, HRRR = 3 km, ECMWF = 0.25°). We Plot precipitation
 * exactly at those snapped coordinates so the overlay appears where the
 * weather model actually predicts rain — never stretched or interpolated to a
 * fake location.
 *
 * Why Open-Meteo (free, no key):
 *   • Bulk endpoint accepts comma-separated lat/lng lists and returns a JSON
 *     array — one entity per requested coordinate, with `latitude` /
 *     `longitude` fields reporting the model's chosen grid cell.
 *   • `models=gfs_seamless` exposes NOAA GFS (preferred) plus the seamless
 *     GFS→HRRR merge for short-range US coverage.
 *   • `forecast_hours=120` anchors the response on "now", so frame index 0
 *     maps to the current hour, index 119 = 5 days from now.
 *
 * Model preference chain (matches the spec):
 *   Primary  : gfs_seamless  (NOAA GFS primary)
 *   Fallback : gfs_hrrr      (only when within its 18-h window — outside of
 *              which the API returns null arrays and we'd skip ahead to the
 *              next model)
 *   Fallback : ecmwf_ifs025  (ECMWF IFS 0.25°)
 *   Fallback : icon_seamless (DWD ICON)
 *
 * Geographic accuracy: we Plot precipitation at the lat/lng the model *snapped*
 * to (returned by Open-Meteo in the response) — never at a stretched /
 * interpolated / shifted position. Cities show rain only when the model
 * predicts rain over those cities.
 */

export interface PrecipHour {
  /** ISO 8601 UTC string (no `:00` seconds) — as Open-Meteo returns it. */
  time: string;
  /** ms since epoch — derived at ingest for cheap comparisons. 0 if invalid. */
  ms: number;
  /** Precipitation (mm/h) — liquid equivalent. null-tolerant → 0. */
  precipMm: number;
  /** Snowfall (cm/h) — drives the snow colour band. null-tolerant → 0. */
  snowfallCm: number;
  /** 0–100 — model precipitation_probability. null-tolerant → 0. */
  probability: number;
}

export interface PrecipPoint {
  /** Latitude *the model actually used* (snapped to nearest grid cell). */
  lat: number;
  /** Longitude *the model actually used* (snapped to nearest grid cell). */
  lng: number;
  /** 120 hours of precipitation values starting at the forecast-now hour. */
  hours: PrecipHour[];
  /** True if every precip/snow/probability value was non-null. */
  fullyPopulated: boolean;
}

export interface PrecipGridResult {
  /** Snapped grid coordinates returned by the model — one entry per request. */
  points: PrecipPoint[];
  /** Model identifier that successfully served the request. */
  model: string;
  /** First forecast hour (ISO UTC) — corresponds to "~now" for the model. */
  startTime: string;
  /** Last forecast hour (ISO UTC) — startTime + 119 h. */
  endTime: string;
  /** Wall-clock ms of frame 0 (== parse(startTime) || Date.now()). */
  startMs: number;
}

interface CacheEntry {
  result: PrecipGridResult;
  fetchedAt: number;
}

/** Open-Meteo base URL — free forecast endpoint (no auth). */
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/** Cache TTL — GFS cycles every 6 h so a 30-min cache prevents redundant
 *  fetches across navigation while still refreshing for the next model run. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Bucket size for viewport cache key. ~1° ≈ 110 km. A small pan inside the
 *  same coverage area reuses the cached grid without re-fetching. */
const BUCKET_DEG = 1.0;

/** Ordered fallback chain. First success wins; empty/null hourly arrays
 *  (HRRR outside CONUS, HRRR beyond its 18-h window, etc.) count as failures
 *  so we fall through to the next model. */
const MODEL_CHAIN: string[] = [
  'gfs_seamless',
  'gfs_hrrr',
  'ecmwf_ifs025',
  'icon_seamless',
];

/** In-memory cache keyed by (preferredModel|bucketCentre|bucketHalfW/H|zoomBucket|gridN). */
const cache = new Map<string, CacheEntry>();

function bucketKey(value: number, sizeDeg: number): number {
  return Math.round(value / sizeDeg) * sizeDeg;
}

function parseIsoUtcMs(iso: string): number {
  if (!iso) return 0;
  // Open-Meteo returns "YYYY-MM-DDTHH:MM" with no seconds and no `Z`. Treat as
  // UTC explicitly so the rendered frame time is timezone-stable.
  const ms = Date.parse(/Z$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Fetch a single model for the given list of lat/lng. Throws on
 *  non-2xx HTTP, on length mismatch, or on per-point empty/all-null hourly
 *  (treated as "this model has nothing for these points"). */
async function fetchModel(
  latLngs: { lat: number; lng: number }[],
  model: string
): Promise<PrecipGridResult> {
  const lats = latLngs.map((p) => p.lat.toFixed(4)).join(',');
  const lngs = latLngs.map((p) => p.lng.toFixed(4)).join(',');

  // forecast_hours=120 anchors frame 0 on "~now" rather than on the next
  // UTC midnight. Combined with `timezone=UTC` this gives a stable window.
  // Cell selection `land` is implicit (we don't ask for marine cells).
  const url =
    `${OPEN_METEO_BASE}?latitude=${lats}` +
    `&longitude=${lngs}` +
    `&hourly=precipitation,snowfall,precipitation_probability` +
    `&forecast_hours=120` +
    `&models=${encodeURIComponent(model)}` +
    `&timezone=UTC`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
  } catch (err) {
    throw new Error(
      `forecast network error for ${model}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) throw new Error(`forecast HTTP ${res.status} for ${model}`);

  const json = await res.json();
  if (!json) throw new Error(`forecast empty body for ${model}`);

  // Bulk endpoint returns Array<{...}> for multi-coord, or a bare {...}
  // for single-coord. Normalise both shapes to an array.
  const arr: any[] = Array.isArray(json) ? json : [json];

  if (arr.length !== latLngs.length) {
    throw new Error(
      `forecast length mismatch for ${model}: expected ${latLngs.length}, got ${arr.length}`
    );
  }

  const points: PrecipPoint[] = arr.map((entry: any, idx: number): PrecipPoint => {
    const reqLat = latLngs[idx].lat;
    const reqLng = latLngs[idx].lng;

    // Open-Meteo reports the lat/lng it *snapped* to — that's the lat/lng we
    // paint at. Fall back to the requested coordinate only if the response
    // omits the field (shouldn't happen but defensive coding).
    const mLat: number =
      typeof entry?.latitude === 'number' && Number.isFinite(entry.latitude)
        ? entry.latitude
        : reqLat;
    const mLng: number =
      typeof entry?.longitude === 'number' && Number.isFinite(entry.longitude)
        ? entry.longitude
        : reqLng;

    const hourly = entry?.hourly ?? {};
    const times: string[] = Array.isArray(hourly.time) ? hourly.time : [];
    const precipArr: any[] = Array.isArray(hourly.precipitation) ? hourly.precipitation : [];
    const snowArr: any[] = Array.isArray(hourly.snowfall) ? hourly.snowfall : [];
    const probArr: any[] = Array.isArray(hourly.precipitation_probability)
      ? hourly.precipitation_probability
      : [];

    let fullyPopulated = true;
    if (times.length === 0) {
      // Some endpoints signal "no data here" with `error: true` and empty
      // arrays — re-throw to trigger the fallback chain.
      throw new Error(`forecast ${model} returned empty hourly at idx ${idx}`);
    }

    const hours: PrecipHour[] = times.map((t: string, i: number) => {
      const pIn = precipArr[i];
      const sIn = snowArr[i];
      const probIn = probArr[i];
      if (pIn === null || sIn === null || probIn === null) {
        fullyPopulated = false;
      }
      return {
        time: t,
        ms: parseIsoUtcMs(t),
        precipMm: numOrZero(pIn),
        snowfallCm: numOrZero(sIn),
        probability: numOrZero(probIn),
      };
    });

    return { lat: mLat, lng: mLng, hours, fullyPopulated };
  });

  // Treat per-point empty hours or any null values as a hard failure —
  // HRRR returns null arrays beyond 18 h, so gfs_hrrr would otherwise
  // mis-Plot frame 80+ as "no rain everywhere". Falling back to
  // gfs_seamless (which runs end-to-end) is the right behavior.
  const anyHalfEmpty = points.some(
    (p) => !p.fullyPopulated || p.hours.length < 100
  );
  if (anyHalfEmpty && model !== 'gfs_seamless') {
    throw new Error(`forecast ${model} returned null/short arrays — falling back`);
  }

  const startTime = points[0].hours[0]?.time ?? '';
  const endTime =
    points[0].hours[points[0].hours.length - 1]?.time ?? '';
  const startMs =
    points[0].hours[0]?.ms ?? (parseIsoUtcMs(startTime) || Date.now());

  return { points, model, startTime, endTime, startMs };
}

/**
 * Fetch the 5-day hourly precipitation grid for the visible viewport.
 * Returning the cached answer (≤30 min old) for the same buckets + zoom +
 * grid size; otherwise tries models in the fallback chain until one returns
 * populated data.
 */
export async function fetchPrecipGrid(
  centerLat: number,
  centerLng: number,
  halfWidthDeg: number,
  halfHeightDeg: number,
  gridN: number = 14,
  preferredModel?: string
): Promise<PrecipGridResult> {
  // Clamp so a misbehaving caller can't ask for an entire hemisphere.
  const safeHalfW = Math.max(0.05, Math.min(halfWidthDeg, 90));
  const safeHalfH = Math.max(0.05, Math.min(halfHeightDeg, 30));

  const stepN = Math.max(4, Math.min(gridN, 24));
  const dLat = (2 * safeHalfH) / (stepN - 1);
  const dLng = (2 * safeHalfW) / (stepN - 1);
  const ordered: { lat: number; lng: number }[] = [];
  for (let i = 0; i < stepN; i++) {
    for (let j = 0; j < stepN; j++) {
      const lat = centerLat - safeHalfH + i * dLat;
      let lng = centerLng - safeHalfW + j * dLng;
      // International date line wrap so the lower 3 cells stay inside ±180°.
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      const clampedLat = Math.max(-85, Math.min(85, lat));
      ordered.push({ lat: clampedLat, lng });
    }
  }

  const cacheKey =
    `v2|${preferredModel ?? 'auto'}|` +
    `${bucketKey(centerLat, BUCKET_DEG).toFixed(1)},${bucketKey(centerLng, BUCKET_DEG).toFixed(1)}|` +
    `${Math.round(safeHalfH * 10)},${Math.round(safeHalfW * 10)}|` +
    `${stepN}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const modelsToTry = preferredModel
    ? [preferredModel, ...MODEL_CHAIN.filter((m) => m !== preferredModel)]
    : MODEL_CHAIN;

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const result = await fetchModel(ordered, model);
      cache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Fall through to next model — non-fatal so a model outage doesn't
      // block the rest of the radar UI.
    }
  }

  throw lastError ?? new Error('forecast: no model returned usable forecast data');
}

/** Drop the in-memory cache (e.g. on user location change). */
export function clearForecastRadarCache(): void {
  cache.clear();
}

/**
 * Compute the viewport's bbox in degrees of latitude/longitude for a given
 * zoom + pixel size. The math is the inverse of MapView's render math:
 *
 *   tx = ((lng + 180) / 360) * 2^zoom
 *   ty = ((1 − log(tan(latRad) + 1/cos(latRad)) / π) / 2) * 2^zoom
 *   lat = atan(sinh(π − 2π·ty/2^zoom)) · 180/π
 *
 * Returning half-extents matches the sign convention fetchPrecipGrid uses
 * when sampling the grid (centre ± half-extent).
 */
export function viewportHalfExtents(
  centerLat: number,
  centerLng: number,
  zoom: number,
  widthPx: number,
  heightPx: number
): { halfWidthDeg: number; halfHeightDeg: number } {
  const latClamped = Math.max(-85.0511, Math.min(85.0511, centerLat));
  const n = Math.pow(2, zoom);

  // East-west half-width is purely linear in pixel space — longitude lines
  // are parallel in Mercator so this is exact at any zoom.
  const halfWidthDeg = ((widthPx / 2) / 256) * 360 / n;

  // North-south needs the inverse Mercator.
  const centerTileY =
    ((1 -
      Math.log(
        Math.tan((latClamped * Math.PI) / 180) +
          1 / Math.cos((latClamped * Math.PI) / 180)
      ) / Math.PI) /
      2) *
    n;
  const halfHeightTiles = heightPx / 2 / 256;
  const topY = centerTileY - halfHeightTiles;
  const bottomY = centerTileY + halfHeightTiles;
  const topLat =
    (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * topY) / n)) * 180) / Math.PI;
  const bottomLat =
    (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * bottomY) / n)) * 180) / Math.PI;
  const halfHeightDeg = Math.abs(topLat - bottomLat) / 2;

  return { halfWidthDeg, halfHeightDeg };
}
