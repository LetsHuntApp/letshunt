/**
 * Pre-fetch map tiles around a location at several zoom levels so they are
 * already in the browser's HTTP cache when the user opens the Map tab.
 *
 * Strategy:
 *  - Satellite imagery is the priority: all satellite tiles are fetched first
 *    and at higher priority; street tiles only follow afterwards.
 *  - Cover zoom 12 → 16 (regional → street-level) which spans the typical
 *    range a hunter will browse.
 *  - At each zoom, load enough tiles to fill a generous viewport plus a
 *    buffer so the user can pan slightly without triggering new requests.
 *  - Satellite requests use `priority: 'high'` so the browser schedules them
 *    ahead of other background work; street tiles use default priority.
 *  - The prefetch is restartable per location: if the user switches to a
 *    different default location, the new location's tiles are prefetched too.
 */

// Web Mercator helpers (duplicated from MapView to avoid a circular import)
function latLngToTileCoords(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function getSatelliteTileUrl(z: number, ty: number, tx: number): string {
  const maxTile = Math.pow(2, z);
  const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
  const clampedTy = Math.max(0, Math.min(maxTile - 1, ty));
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`;
}

function getStreetTileUrl(z: number, ty: number, tx: number): string {
  const maxTile = Math.pow(2, z);
  const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
  const clampedTy = Math.max(0, Math.min(maxTile - 1, ty));
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`;
}

const PREFETCH_ZOOMS = [12, 13, 14, 15, 16];
const VIEWPORT_TILE_WIDTH = 5;  // ~1280px viewport ÷ 256
const VIEWPORT_TILE_HEIGHT = 4; // ~1024px viewport ÷ 256
const BUFFER = 2;               // extra tiles each side for panning

const prefetchedLocations = new Set<string>();

function collectTileUrls(
  lat: number,
  lng: number,
  urlFor: (z: number, ty: number, tx: number) => string,
): string[] {
  const urls: string[] = [];
  for (const zoom of PREFETCH_ZOOMS) {
    const center = latLngToTileCoords(lat, lng, zoom);
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const halfW = Math.floor(VIEWPORT_TILE_WIDTH / 2) + BUFFER;
    const halfH = Math.floor(VIEWPORT_TILE_HEIGHT / 2) + BUFFER;
    const maxTile = Math.pow(2, zoom);

    for (let dy = -halfH; dy <= halfH; dy++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (ty < 0 || ty >= maxTile) continue;
        urls.push(urlFor(zoom, ty, tx));
      }
    }
  }
  return urls;
}

function fetchBatched(urls: string[], priority: RequestPriority): void {
  // Stagger requests in small batches to avoid overwhelming the network
  // and triggering browser connection limits.
  const BATCH = 8;
  let i = 0;
  const nextBatch = () => {
    const end = Math.min(i + BATCH, urls.length);
    for (; i < end; i++) {
      fetch(urls[i], {
        mode: 'cors',
        credentials: 'omit',
        priority,
      }).catch(() => { /* best-effort */ });
    }
    if (i < urls.length) {
      setTimeout(nextBatch, 30);
    }
  };
  nextBatch();
}

/**
 * Kick off background tile prefetches for a given location.
 * Satellite tiles are fetched first at high priority; street tiles follow
 * afterwards at low priority. Safe to call multiple times — satellite tiles
 * are prefetched once per location, and switching to a new location triggers
 * a fresh prefetch for that location.
 */
export function prefetchMapTiles(lat: number, lng: number): void {
  const locKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (prefetchedLocations.has(locKey)) return;
  prefetchedLocations.add(locKey);

  // Use requestIdleCallback when available so we never compete with
  // initial render / forecast fetch; fall back to a short setTimeout.
  const schedule = (fn: () => void) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fn, { timeout: 5000 });
    } else {
      setTimeout(fn, 800);
    }
  };

  schedule(() => {
    // Satellite tiles first, at high priority — satellite imagery is the
    // default map style and the one users wait on.
    const satelliteUrls = collectTileUrls(lat, lng, getSatelliteTileUrl);
    fetchBatched(satelliteUrls, 'high');

    // Street tiles follow afterwards at low priority.
    const streetUrls = collectTileUrls(lat, lng, getStreetTileUrl);
    fetchBatched(streetUrls, 'low');
  });
}
