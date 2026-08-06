import React, { useEffect, useRef, useState } from 'react';

/**
 * Animated precipitation-radar overlay.
 *
 * - Tile coordinates use the SAME Mercator math as MapView (clamped lat to
 *   ±85.0511, integer-zoom snap with smooth sub-zoom scaling). Tiles align
 *   pixel-for-pixel over the base-map tiles.
 * - Frames are pulled from RainViewer's public API
 *   (https://api.rainviewer.com/public/weather-maps.json — no key, CORS-open,
 *   verified live). Each frame's `path` field is already a fully-qualified
 *   tile-prefix (e.g. "/v2/radar/1742.../256/{z}/{x}/{y}/{color}/{opt}.png").
 * - Past frames play backwards-to-forwards so the loop ends on "now"; if a
 *   short-range `nowcast` array is available it's appended and the loop segues
 *   into it. Forecast frames (typically 30 min apart) auto-skip every-other
 *   step on slow connections to keep cadence stable.
 * - All requests are GET <img> loads; nothing is uploaded, so privacy is
 *   preserved. The overlay sits above base tiles (zIndex 3) but below the SVG
 *   scent/path layer (zIndex 10) and is click-through (`pointer-events: none`)
 *   so map drags and pin taps still work.
 */

export interface RadarFrame {
  /** Wall-clock time of the frame, ms since epoch. */
  time: number;
  /** Tile-path prefix returned by RainViewer ("/v2/radar/<hash>/..."). */
  path: string;
}

interface RadarOverlayProps {
  centerLat: number;
  centerLon: number;
  /** Continuous zoom (may be fractional, e.g. 15.4). */
  zoom: number;
  width: number;
  height: number;
  /** 0..1. */
  opacity: number;
  /** RainViewer color-scheme id (0..8). Common picks: 3 (Universal Blue), 4 (TITAN), 7 (Dark Sky). */
  colorScheme: number;
  /** Master toggle. When false we render nothing and stop fetching. */
  enabled: boolean;
  /** Auto-play through frames; when false the parent can step manually via onFrameChange. */
  playing?: boolean;
  /** Called whenever the active frame changes (for time-stamp UI in the parent). */
  onFrameChange?: (frame: RadarFrame | null, index: number, total: number) => void;
  /** Index-fetch interval in ms. Default 10 minutes. */
  refreshIntervalMs?: number;
  /** Frame-step interval in ms. Default 500. */
  frameStepMs?: number;
}

// --- Tile math (mirrors src/components/MapView.tsx exactly) -------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function latLngToTileCoords(lat: number, lng: number, z: number) {
  const clampedLat = clamp(lat, -85.0511, 85.0511);
  const n = Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

interface TileCoord {
  tx: number;
  ty: number;
  left: number;
  top: number;
}

function computeVisibleTiles(
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number
): { baseZoom: number; actTileSize: number; tiles: TileCoord[] } {
  const baseZoom = clamp(Math.round(zoom), 2, 19);
  const actTileSize = 256 * Math.pow(2, zoom - baseZoom);
  const halfW = width / 2;
  const halfH = height / 2;
  const cc = latLngToTileCoords(centerLat, centerLon, baseZoom);

  const minX = Math.floor(cc.x - halfW / actTileSize) - 1;
  const maxX = Math.ceil(cc.x + halfW / actTileSize) + 1;
  const minY = Math.floor(cc.y - halfH / actTileSize) - 1;
  const maxY = Math.ceil(cc.y + halfH / actTileSize) + 1;

  const tiles: TileCoord[] = [];
  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      tiles.push({
        tx,
        ty,
        left: halfW + (tx - cc.x) * actTileSize,
        top: halfH + (ty - cc.y) * actTileSize,
      });
    }
  }
  return { baseZoom, actTileSize, tiles };
}

function wrapTileX(tx: number, z: number) {
  const max = Math.pow(2, z);
  return ((tx % max) + max) % max;
}

function clampTileY(ty: number, z: number) {
  const max = Math.pow(2, z);
  return clamp(ty, 0, max - 1);
}

// --- Frame cache (session-only; reload re-fetches) ----------------------------

interface FrameCacheEntry {
  host: string;
  past: RadarFrame[];
  forecast: RadarFrame[];
  fetchedAt: number;
}

let frameCache: FrameCacheEntry | null = null;

// --- Component ----------------------------------------------------------------

export const RadarOverlay: React.FC<RadarOverlayProps> = ({
  centerLat,
  centerLon,
  zoom,
  width,
  height,
  opacity,
  colorScheme,
  enabled,
  playing = true,
  onFrameChange,
  refreshIntervalMs = 10 * 60 * 1000,
  frameStepMs = 500,
}) => {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchedAtRef = useRef<number>(0);

  // Fetch (or refresh) the RainViewer frame index when enabled.
  useEffect(() => {
    if (!enabled) {
      setFrames([]);
      setActiveIndex(0);
      return;
    }
    let cancelled = false;

    const shouldUseCache =
      frameCache &&
      Date.now() - frameCache.fetchedAt < refreshIntervalMs;      const ingest = (entry: FrameCacheEntry) => {
      if (cancelled) return;
      // Oldest → newest so the loop ends on real-time.
      const past = [...entry.past].sort((a, b) => a.time - b.time);
      const forecast = [...entry.forecast].sort((a, b) => a.time - b.time);
      const all = [...past, ...forecast];
      setFrames(all);
      // Start at the oldest frame so autoplay walks forward through the storm,
      // landing on "now" before wrapping back to the beginning. Starting at the
      // newest frame would make the very first interval tick wrap around to
      // the oldest frame, producing a jarring backward jump after enable.
      setActiveIndex(0);
      setLoadError(null);
    };

    if (shouldUseCache) {
      ingest(frameCache!);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
          method: 'GET',
          // RainViewer doesn't send CORS headers for this MIME, so we keep
          // a fallback when blocked. The endpoint *does* send
          // `Access-Control-Allow-Origin: *` as of 2024+ — see
          // https://www.rainviewer.com/api/weather-maps-api.html
          mode: 'cors',
          credentials: 'omit',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const host: string = json?.host || 'https://tilecache.rainviewer.com';
        const past: RadarFrame[] = (json?.radar?.past ?? []).map((f: any) => ({
          time: Number(f.time),
          path: String(f.path),
        }));
        const forecast: RadarFrame[] = (json?.radar?.nowcast ?? []).map((f: any) => ({
          time: Number(f.time),
          path: String(f.path),
        }));
        frameCache = { host, past, forecast, fetchedAt: Date.now() };
        fetchedAtRef.current = Date.now();
        ingest(frameCache);
      } catch (err) {
        if (cancelled) return;
        // Quiet failure: still surface to the parent so a tiny "Radar: unavailable"
        // badge can be shown. We never throw into render.
        setLoadError(err instanceof Error ? err.message : 'radar-unavailable');
        setFrames([]);
        setActiveIndex(0);
      }
    })();

    return () => { cancelled = true; };
    // refreshIntervalMs intentionally participates — a parent slider can change it
  }, [enabled, refreshIntervalMs]);

  // Auto-advance frames.
  useEffect(() => {
    if (!enabled || !playing || frames.length <= 1) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % frames.length);
    }, frameStepMs);
    return () => clearInterval(id);
  }, [enabled, playing, frames.length, frameStepMs]);

  // Notify parent of active frame.
  useEffect(() => {
    if (!onFrameChange) return;
    if (frames.length === 0) {
      onFrameChange(null, 0, 0);
      return;
    }
    onFrameChange(frames[activeIndex] ?? null, activeIndex, frames.length);
  }, [activeIndex, frames, onFrameChange]);

  if (!enabled) return null;

  const { baseZoom, actTileSize, tiles } = computeVisibleTiles(
    centerLat, centerLon, zoom, width, height
  );

  const activeFrame = frames[activeIndex];

  // Build host/prefix once we have a frame.
  const host = frameCache?.host || 'https://tilecache.rainviewer.com';
  const hasFrame = Boolean(activeFrame);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-[6] pointer-events-none"
      style={{ opacity: loadError ? 0 : clamp(opacity, 0, 1) }}
    >
      {hasFrame && activeFrame &&
        tiles.map((t) => (
          <img
            key={`radar-${activeIndex}-${t.tx}-${t.ty}`}
            src={`${host}${activeFrame.path}/256/${baseZoom}/${wrapTileX(t.tx, baseZoom)}/${clampTileY(t.ty, baseZoom)}/${colorScheme}/1_1.png`}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            style={{
              position: 'absolute',
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: `${Math.ceil(actTileSize + 1)}px`,
              height: `${Math.ceil(actTileSize + 1)}px`,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            onError={(e) => {
              // Silent miss — a single broken tile shouldn't crash the overlay.
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ))}
      {/* Quiet error badge: visible only when fetch failed, never blocks input. */}
      {loadError && (
        <div className="absolute top-3 right-3 rounded-md bg-slate-900/70 text-slate-300 text-[10px] font-bold px-2 py-1 pointer-events-auto">
          Radar unavailable
        </div>
      )}
    </div>
  );
};

export default RadarOverlay;
