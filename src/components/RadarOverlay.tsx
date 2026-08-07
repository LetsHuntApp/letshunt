import React, { useEffect, useState, useMemo } from 'react';

/**
 * Interactive precipitation-radar overlay tied to the hourly weather slider
 * and the forecast day buttons.
 *
 * Behaviour
 * ---------
 * - LIVE mode — the selected day is today AND the selected hour falls inside
 *   the RainViewer window (≈2 h back to ≈30 min ahead of now): the nearest
 *   radar frame is shown at full opacity with its capture time, and dragging
 *   the hourly slider scrubs through the available frames.
 * - FORECAST mode — today but outside the live window, or a different day: no
 *   radar exists for that moment, so the nearest available frame is shown
 *   dimmed while the status pill reports the exact Open-Meteo forecast for the
 *   selected day + hour (probability + mm). The overlay therefore visibly
 *   reacts to every slider tick and day-button press instead of appearing
 *   frozen on one radar image.
 * - A play/pause control animates through the frames like a classic radar app.
 *
 * Tile coordinates use the same Mercator math as MapView, capped at
 * RainViewer's documented maximum z7 (the base map can zoom far closer, so
 * radar tiles are requested at the cap and scaled to align).
 */

export interface RadarFrame {
  time: number; // ms since epoch
  path: string; // e.g. "/v2/radar/<hash>"
}

function normalizeFrame(raw: { time?: unknown; path?: unknown }): RadarFrame | null {
  const seconds = Number(raw.time);
  const path = String(raw.path ?? '');
  if (!Number.isFinite(seconds) || !path.startsWith('/v2/radar/')) return null;
  return { time: seconds * 1000, path };
}

interface RadarOverlayProps {
  centerLat: number;
  centerLon: number;
  zoom: number;
  width: number;
  height: number;
  /** 0..1 */
  opacity: number;
  /** RainViewer palette id (0–8). */
  colorScheme: number;
  /** Master toggle — renders nothing and stops fetching when false. */
  enabled: boolean;
  /** Hour selected on the 0–23 hourly slider. */
  selectedHour: number;
  /** Date string of the selected forecast day (YYYY-MM-DD). */
  selectedDayDate?: string;
  /** Human label of the selected day ("Today", "Tomorrow", "Tue", …). */
  selectedDayName?: string;
  /** True when the selected forecast day is today (passed from the parent —
   *  more reliable than re-deriving the date string, which can drift across
   *  timezones vs. Open-Meteo's UTC date strings). */
  isToday: boolean;
  /** Precipitation probability for the selected hour (0–100). */
  precipProbability: number;
  /** Precipitation amount in mm for the selected hour. */
  precipMm: number;
  /** Called whenever the active frame changes (for time-stamp UI in the parent). */
  onFrameChange?: (frame: RadarFrame | null, index: number, total: number) => void;
  /** Index-fetch interval in ms. Default 10 minutes. */
  refreshIntervalMs?: number;
  /** Frame-step interval in ms while auto-playing. Default 2000. */
  frameStepMs?: number;
}

const MAX_RADAR_ZOOM = 7;

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
        tx, ty,
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

// --- Frame cache (session-only; reload re-fetches) ---

interface FrameCacheEntry {
  host: string;
  past: RadarFrame[];
  forecast: RadarFrame[];
  fetchedAt: number;
}

let frameCache: FrameCacheEntry | null = null;

// --- Time helpers ---

/**
 * Build the wall-clock moment the hourly slider points at: the selected hour
 * on the selected day, in local time. Comparing its epoch ms against the
 * RainViewer frame timestamps is timezone-safe.
 */
function buildSelectedDateTime(dayStr: string | undefined, hour: number): Date {
  const [y, m, d] = (dayStr || '').split('-').map(Number);
  const now = new Date();
  const valid = Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const base = valid
    ? new Date(y, m - 1, d, hour, 0, 0, 0)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  return base;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// --- Component ---

export const RadarOverlay: React.FC<RadarOverlayProps> = ({
  centerLat,
  centerLon,
  zoom,
  width,
  height,
  opacity,
  colorScheme,
  enabled,
  selectedHour,
  selectedDayDate,
  selectedDayName,
  isToday,
  precipProbability,
  precipMm,
  onFrameChange,
  refreshIntervalMs = 10 * 60 * 1000,
  frameStepMs = 2000,
}) => {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayIdx, setAutoPlayIdx] = useState(0);

  // The exact moment selected by the slider + day buttons.
  const selectedDateTime = useMemo(() => {
    return buildSelectedDateTime(selectedDayDate, selectedHour);
  }, [selectedDayDate, selectedHour]);

  // Nearest RainViewer frame to the selected moment.
  const nearestFrameIdx = useMemo(() => {
    if (frames.length === 0) return -1;
    const target = selectedDateTime.getTime();
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const dist = Math.abs(frames[i].time - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }, [frames, selectedDateTime]);

  // The active frame: from auto-play, or scrubbed by the slider.
  const activeIndex = isAutoPlaying ? autoPlayIdx : nearestFrameIdx;

  // Whether the selected moment is covered by live radar data (today only).
  const isWithinRadarRange = useMemo(() => {
    if (frames.length < 2 || !isToday) return false;
    const first = frames[0].time;
    const last = frames[frames.length - 1].time;
    const t = selectedDateTime.getTime();
    const tolerance = 30 * 60 * 1000;
    return t >= first - tolerance && t <= last + tolerance;
  }, [frames, selectedDateTime, isToday]);

  // Fetch (or refresh) the RainViewer frame index when enabled.
  useEffect(() => {
    if (!enabled) {
      setFrames([]);
      return;
    }
    let cancelled = false;

    const shouldUseCache = frameCache && Date.now() - frameCache.fetchedAt < refreshIntervalMs;

    const ingest = (entry: FrameCacheEntry) => {
      if (cancelled) return;
      const past = [...entry.past].sort((a, b) => a.time - b.time);
      const forecast = [...entry.forecast].sort((a, b) => a.time - b.time);
      setFrames([...past, ...forecast]);
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
          mode: 'cors',
          credentials: 'omit',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const host: string = json?.host || 'https://tilecache.rainviewer.com';
        const past: RadarFrame[] = (json?.radar?.past ?? [])
          .map((f: unknown) => normalizeFrame(f as { time?: unknown; path?: unknown }))
          .filter((f): f is RadarFrame => f !== null);
        const forecast: RadarFrame[] = (json?.radar?.nowcast ?? [])
          .map((f: unknown) => normalizeFrame(f as { time?: unknown; path?: unknown }))
          .filter((f): f is RadarFrame => f !== null);
        const normalizedHost = typeof host === 'string' && /^https?:\/\//.test(host)
          ? host.replace(/\/$/, '')
          : 'https://tilecache.rainviewer.com';
        frameCache = { host: normalizedHost, past, forecast, fetchedAt: Date.now() };
        ingest(frameCache);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'radar-unavailable');
        setFrames([]);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, refreshIntervalMs]);

  // Auto-play: advance through frames at frameStepMs.
  useEffect(() => {
    if (!enabled || !isAutoPlaying || frames.length <= 1) return;
    const id = setInterval(() => {
      setAutoPlayIdx((i) => (i + 1) % frames.length);
    }, Math.max(1500, frameStepMs));
    return () => clearInterval(id);
  }, [enabled, isAutoPlaying, frames.length, frameStepMs]);

  // Stop auto-play when the user manually moves the slider or switches days.
  useEffect(() => {
    setIsAutoPlaying(false);
  }, [selectedHour, selectedDayDate]);

  // When auto-play stops, snap back to the frame for the selected hour.
  useEffect(() => {
    if (!isAutoPlaying) {
      setAutoPlayIdx(nearestFrameIdx >= 0 ? nearestFrameIdx : Math.max(0, frames.length - 1));
    }
  }, [isAutoPlaying, nearestFrameIdx, frames.length]);

  // Notify the parent of the active frame (for any external time-stamp UI).
  useEffect(() => {
    if (!onFrameChange) return;
    if (frames.length === 0 || activeIndex < 0) {
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
  const host = frameCache?.host || 'https://tilecache.rainviewer.com';
  const hasFrame = Boolean(activeFrame) && activeIndex >= 0 && activeIndex < frames.length;

  // Dim the radar whenever the selected moment has no live coverage so the
  // user can tell "this is the live picture" from "this is the forecast".
  const baseOpacity = clamp(opacity, 0, 1);
  const radarLayerOpacity = isWithinRadarRange ? baseOpacity : baseOpacity * 0.3;

  const frameTimeLabel = activeFrame ? formatTime(activeFrame.time) : '';
  const selectedTimeLabel = formatTime(selectedDateTime.getTime());
  const coverageStart = frames.length ? formatTime(frames[0].time) : '';
  const coverageEnd = frames.length ? formatTime(frames[frames.length - 1].time) : '';

  const inForecastMode = !isToday || !isWithinRadarRange;
  const canAnimate = isToday && frames.length > 1;

  return (
    <>
      {/* Radar tile layer — today only. Full opacity in live mode, dimmed in
          forecast mode so the overlay keeps moving with the controls even
          when no radar exists for the selected moment. */}
      {hasFrame && isToday && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[6] pointer-events-none overflow-hidden"
          style={{ opacity: radarLayerOpacity, transition: 'opacity 0.3s ease' }}
        >
          {tiles.map((t) => (
            <img
              key={`radar-${t.tx}-${t.ty}-${activeFrame!.time}`}
              src={`${host}${activeFrame!.path}/256/${baseZoom}/${wrapTileX(t.tx, baseZoom)}/${clampTileY(t.ty, baseZoom)}/${colorScheme}/1_1.png`}
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
            />
          ))}
        </div>
      )}

      {/* Status chip — top-center: live radar info, or the exact forecast for
          the selected day + hour. Play/pause animates the frames. */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[40] pointer-events-auto">
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-2xl backdrop-blur-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap max-w-[92vw] overflow-hidden ${
            loadError
              ? 'bg-slate-900/90 border-rose-500/60 text-rose-300'
              : inForecastMode
              ? 'bg-slate-900/90 border-amber-400/50 text-amber-200'
              : 'bg-slate-900/90 border-sky-500/50 text-sky-300'
          }`}
          title={
            isToday && frames.length > 1
              ? `Live radar coverage: ${coverageStart} – ${coverageEnd}. The slider scrubs the nearest frame; outside the window, the dimmed image is the nearest available observation and the numbers are the Open-Meteo forecast for that day + hour.`
              : 'Live radar covers only the past ~2 hours and next ~30 minutes — other times show the Open-Meteo forecast'
          }
        >
          {/* Play / pause — animate through the radar frames */}
          {canAnimate && (
            <button
              onClick={() => setIsAutoPlaying((p) => !p)}
              className="flex items-center justify-center w-4 h-4 rounded-full bg-sky-500/20 hover:bg-sky-500/40 transition-colors text-sky-300 flex-shrink-0 cursor-pointer"
              aria-label={isAutoPlaying ? 'Pause radar animation' : 'Play radar animation'}
              title={isAutoPlaying ? 'Pause' : 'Animate frames'}
            >
              {isAutoPlaying ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect x="1" y="1" width="2.2" height="6" rx="0.5"/><rect x="4.8" y="1" width="2.2" height="6" rx="0.5"/></svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><polygon points="1,0 7,4 1,8"/></svg>
              )}
            </button>
          )}

          {loadError ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>Radar unavailable</span>
            </>
          ) : !isToday ? (
            /* Other days — no radar exists; the forecast responds immediately to the day buttons */
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>
                FORECAST · {selectedDayName ? `${selectedDayName} ` : ''}{selectedTimeLabel} · {precipProbability}% rain · {precipMm.toFixed(1)} mm
              </span>
            </>
          ) : frames.length === 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
              <span>Radar loading…</span>
            </>
          ) : isAutoPlaying ? (
            /* Animating — show the playing frame, not the slider's forecast */
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span>RADAR · {frameTimeLabel} · {activeIndex + 1}/{frames.length}</span>
            </>
          ) : inForecastMode ? (
            /* Forecast for the selected day + hour — visibly tracks the slider/day buttons */
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>
                FORECAST · {selectedDayName && !isToday ? `${selectedDayName} ` : ''}{selectedTimeLabel} · {precipProbability}% rain · {precipMm.toFixed(1)} mm
              </span>
            </>
          ) : (
            /* Live radar frame scrubbed by the slider */
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span>
                RADAR · {frameTimeLabel} · frame {activeIndex + 1}/{frames.length}
              </span>
              {precipProbability > 0 && (
                <span className="text-slate-400"> · {precipProbability}%</span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default RadarOverlay;
