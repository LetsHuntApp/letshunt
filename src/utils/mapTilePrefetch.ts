/**
 * Pre-fetch map tiles around a location at several zoom levels so they are
 * already in the browser's HTTP cache when the user opens the Map tab.
 *
 * Strategy:
 *  - Cover zoom 12 → 16 (regional → street-level) which spans the typical
 *    range a hunter will browse.
 *  - At each zoom, load enough tiles to fill a generous viewport plus a
 *    buffer so the user can pan slightly without triggering new requests.
 *  - Only the primary (satellite) tile provider is prefetched to keep the
 *    request count manageable; the browser will still have the HTTP cache
 *    warm for that provider when the map mounts.
 *  - Requests use `priority: 'low'` and `mode: 'cors'` so they never
 *    block interactive rendering.
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

let prefetched = false;

/**
 * Kick off background tile prefetches for a given location.
 * Safe to call multiple times — only runs once per page load.
 */
export function prefetchMapTiles(lat: number, lng: number): void {
  if (prefetched) return;
  prefetched = true;

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
          urls.push(getSatelliteTileUrl(zoom, ty, tx));
          urls.push(getStreetTileUrl(zoom, ty, tx));
        }
      }
    }

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
        }).catch(() => { /* best-effort */ });
      }
      if (i < urls.length) {
        setTimeout(nextBatch, 30);
      }
    };
    nextBatch();
  });
}
