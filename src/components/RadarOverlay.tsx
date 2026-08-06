import React, { useEffect, useState } from 'react';

/**
 * Latest-frame precipitation-radar overlay with optional throttled playback.
 *
 * - Tile coordinates use the SAME Mercator math as MapView (clamped lat to
 *   ±85.0511, integer-zoom snap with smooth sub-zoom scaling). Radar tiles are
 *   capped at RainViewer's documented maximum z7 and scaled to align with the
 *   higher-resolution base map.
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
  /** Tile-path prefix returned by RainViewer ("/v2/radar/<hash>"). */
  path: string;
}

function normalizeFrame(raw: { time?: unknown; path?: unknown }): RadarFrame | null {
  const seconds = Number(raw.time);
  const path = String(raw.path ?? '');
  if (!Number.isFinite(seconds) || !path.startsWith('/v2/radar/')) return null;
  return {
    // RainViewer's index uses Unix seconds; the component exposes milliseconds
    // so Date and any parent timestamp display remain correct.
    time: seconds * 1000,
    path,
  };
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
  /** Auto-play through frames; disabled by default to avoid rate-limiting tile providers. */
  playing?: boolean;
  /** Called whenever the active frame changes (for time-stamp UI in the parent). */
  onFrameChange?: (frame: RadarFrame | null, index: number, total: number) => void;
  /** Index-fetch interval in ms. Default 10 minutes. */
  refreshIntervalMs?: number;
  /** Frame-step interval in ms. Default 500. */
  frameStepMs?: number;
}

// RainViewer's documented radar tile service supports z0–z7 only. The base
// satellite map can be much closer (usually z16), so radar tiles must be
// requested at this capped zoom and scaled over the base map. Requesting the
// map zoom directly produces out-of-range radar URLs and an apparently empty
// overlay even when the <img> request itself completes.
const MAX_RADAR_ZOOM = 7;

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
  const baseZoom = clamp(Math.round(zoom), 2, MAX_RADAR_ZOOM);
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
  playing = false,
  onFrameChange,
  refreshIntervalMs = 10 * 60 * 1000,
  frameStepMs = 500,
}) => {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tileStats, setTileStats] = useState({ frameKey: '', failed: 0 });

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
      Date.now() - frameCache.fetchedAt < refreshIntervalMs;

    const ingest = (entry: FrameCacheEntry) => {
      if (cancelled) return;
      // Oldest → newest so the loop ends on real-time.
      const past = [...entry.past].sort((a, b) => a.time - b.time);
      const forecast = [...entry.forecast].sort((a, b) => a.time - b.time);
      const all = [...past, ...forecast];
      setFrames(all);
      // Show the newest available observation immediately. The map used to
      // start at the oldest frame and advance every 500ms, which remounted all
      // visible tile images dozens of times per minute and quickly exhausted
      // RainViewer's public tile quota before the current frame could render.
      setActiveIndex(Math.max(0, all.length - 1));
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
        const past: RadarFrame[] = (json?.radar?.past ?? [])
          .map((f: unknown) => normalizeFrame(f as { time?: unknown; path?: unknown }))
          .filter((frame: RadarFrame | null): frame is RadarFrame => frame !== null);
        const forecast: RadarFrame[] = (json?.radar?.nowcast ?? [])
          .map((f: unknown) => normalizeFrame(f as { time?: unknown; path?: unknown }))
          .filter((frame: RadarFrame | null): frame is RadarFrame => frame !== null);
        const normalizedHost = typeof host === 'string' && /^https?:\/\//.test(host)
          ? host.replace(/\/$/, '')
          : 'https://tilecache.rainviewer.com';
        frameCache = { host: normalizedHost, past, forecast, fetchedAt: Date.now() };
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

  // Optional animation. It is intentionally opt-in: one visible frame is the
  // reliable default for the public RainViewer endpoint. Animating 30+ tiles
  // every 500ms can make a browser request hundreds of uncached images per
  // minute, causing the entire layer to look blank after HTTP 429 responses.
  useEffect(() => {
    if (!enabled || !playing || frames.length <= 1) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % frames.length);
    }, Math.max(2000, frameStepMs));
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

  const { baseZoom, actTileSize, tiles } = computeVisibleTiles(
    centerLat, centerLon, zoom, width, height
  );

  const activeFrame = frames[activeIndex];

  // Build host/prefix once we have a frame. The API's host is authoritative;
  // keep the fallback only for older/offline responses that omitted it.
  const host = frameCache?.host || 'https://tilecache.rainviewer.com';
  const hasFrame = Boolean(activeFrame);
  const frameKey = activeFrame ? `${activeFrame.time}-${baseZoom}-${colorScheme}` : '';

  useEffect(() => {
    setTileStats({ frameKey, failed: 0 });
  }, [frameKey]);

  const frameTimeLabel = activeFrame
    ? new Date(activeFrame.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  if (!enabled) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[6] pointer-events-none overflow-hidden"
        style={{ opacity: loadError ? 0 : clamp(opacity, 0, 1) }}
      >
        {hasFrame && activeFrame &&
          tiles.map((t) => (
            <img
              key={`radar-${t.tx}-${t.ty}`}
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
              onLoad={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
                // A successful frame tile is visible; no state update is needed.
                // Keeping this handler explicit also restores a tile that may
                // have been hidden after a transient provider error.
              }}
              onError={(e) => {
                // Hide only the failed tile, but keep enough state to explain a
                // provider outage instead of presenting an apparently empty map.
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                setTileStats((previous) => previous.frameKey === frameKey
                  ? { ...previous, failed: previous.failed + 1 }
                  : previous
                );
              }}
            />
          ))}
      </div>

      {/* Live / unavailable status chip — top-center, below the app header.
          The old badge sat at top-right where the LAYERS button sits on top of
          it, so a failed fetch looked like a silently-broken overlay. The chip
          also proves the overlay is running even when the region is dry
          (tiles are transparent when there's no precipitation to draw), which
          is the usual reason a radar toggle appears to "show nothing". */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[40] pointer-events-none">
        <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-2xl backdrop-blur-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
          loadError || (hasFrame && tileStats.frameKey === frameKey && tileStats.failed >= tiles.length && tiles.length > 0)
            ? 'bg-slate-900/85 border-rose-500/50 text-rose-300'
            : !hasFrame
            ? 'bg-slate-900/85 border-slate-600/60 text-slate-300'
            : hasFrame && tileStats.frameKey === frameKey && tileStats.failed > 0
            ? 'bg-slate-900/85 border-amber-400/50 text-amber-200'
            : 'bg-slate-900/85 border-sky-500/50 text-sky-300'
        }`}>
          {loadError || (hasFrame && tileStats.frameKey === frameKey && tileStats.failed >= tiles.length && tiles.length > 0) ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              Radar unavailable
            </>
          ) : hasFrame && tileStats.frameKey === frameKey && tileStats.failed > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
              Radar partial · {tileStats.failed} tile{tileStats.failed === 1 ? '' : 's'} unavailable
            </>
          ) : !hasFrame ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
              Radar loading…
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              Radar live · {frameTimeLabel} · frame {activeIndex + 1}/{frames.length}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default RadarOverlay;
