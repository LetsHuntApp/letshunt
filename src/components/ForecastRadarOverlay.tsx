import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchPrecipGrid,
  viewportHalfExtents,
  type PrecipGridResult,
  type PrecipHour,
  type PrecipPoint,
} from '../services/forecastRadarService';

/**
 * 5-Day Precipitation Forecast overlay (canvas-rendered).
 *
 * - Pulls a 2-D grid of (lat, lng) hourly precipitation values from Open-Meteo
 *   (model preference: `gfs_seamless` → HRRR → ECMWF IFS → DWD ICON).
 * - Paints each grid cell at its *actual snapped* latitude/longitude — never
 *   stretched, shifted, or interpolated to a fake position. Cities therefore
 *   receive precipitation only when the model predicts precipitation over
 *   those cities, matching MSN Weather / Windy / Ventusky.
 * - Uses Google-splat radial gradients with `lighter` blending so overlapping
 *   cells brighten smoothly without inventing precipitation between cells.
 * - Frame index (0..119) is driven by the parent (`selectedDayIndex × 24 +
 *   selectedHour`) so the existing hourly slider + day buttons scrub the
 *   forecast. Auto-play overrides that.
 * - Renders a status pill at the top of the canvas showing model + frame time.
 *
 * Coordinate math is shared with `MapView.lng/lat` to pixel conversion: the
 * canvas's clip rectangle is mapped to the current viewport's tile-coord
 * frame, and each grid point is projected through `latLngToTileCoords(center)`
 * scaled by `(256 × 2^(zoom − baseZoom))`. Fractional zoom is supported.
 */

interface ForecastRadarOverlayProps {
  centerLat: number;
  centerLon: number;
  zoom: number;
  width: number;
  height: number;
  /** 0..1 — master alpha for every painted splat. */
  opacity: number;
  /** Master toggle: fetches stop and nothing renders when false. */
  enabled: boolean;
  /** 0..23 — currently-selected hour on the existing hourly slider. */
  selectedHour: number;
  /** 0..4 — currently-selected forecast day index (0 = today). */
  selectedDayIndex: number;
  /** "Today"/"Tomorrow"/"Wed"… — used by the status pill. */
  selectedDayName?: string;
  /** Called whenever the active frame changes (parent UI hooks). */
  onFrameChange?: (info: {
    frame: number;
    total: number;
    model: string;
    validTimeMs: number;
    msFromNow: number;
  }) => void;
}

// --- Math helpers (must match MapView's latLngToTileCoords / tileXToLng /
// tileYToLat and the pan-math fix) ---

function latLngToTileCoords(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

// --- Color ramp ---
//   light blue  ≤ 0.5 mm/h
//   green       ≤ 2   mm/h
//   yellow      ≤ 6   mm/h
//   orange      ≤ 12  mm/h
//   red         > 12  mm/h
//   white       snowfall ≥ 0.1 cm/h
//   purple      mixed rain + snow
function colorForHour(h: PrecipHour): { r: number; g: number; b: number; a: number } {
  const rain = Math.max(0, h.precipMm);
  const snow = Math.max(0, h.snowfallCm);
  const prob = Math.max(0, Math.min(100, h.probability));

  let r = 0, g = 0, b = 0;
  if (rain > 0 && snow > 0) {
    r = 168; g = 85; b = 247; // purple-500
  } else if (snow >= 0.1) {
    r = 245; g = 248; b = 255; // very cool white (snow)
  } else if (rain > 0) {
    const v = rain;
    if (v <= 0.5) { r = 125; g = 211; b = 252; } // sky-300
    else if (v <= 2) { r = 34; g = 197; b = 94; } // emerald-500
    else if (v <= 6) { r = 250; g = 204; b = 21; } // yellow-400
    else if (v <= 12) { r = 249; g = 115; b = 22; } // orange-500
    else { r = 239; g = 68; b = 68; } // red-500
  } else {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Probability boost so trace rain (0.05 mm, 50% chance) still glows.
  const probBoost = rain > 0 && prob > 0 ? 0.35 + (prob / 100) * 0.65 : 0;
  // Base alpha by intensity. Snow gets its own ramp.
  let baseAlpha: number;
  if (snow > 0) {
    baseAlpha = 0.6;
  } else if (rain > 12) baseAlpha = 0.78;
  else if (rain > 6) baseAlpha = 0.68;
  else if (rain > 2) baseAlpha = 0.6;
  else if (rain > 0.5) baseAlpha = 0.5;
  else if (rain > 0.1) baseAlpha = 0.36;
  else baseAlpha = 0.22;

  const a = rain > 0 ? Math.min(0.9, baseAlpha * Math.max(0.35, probBoost)) : baseAlpha;
  return { r, g, b, a };
}

function formatRelativeHour(msFromNow: number): string {
  if (!Number.isFinite(msFromNow)) return '—';
  const hours = Math.round(msFromNow / 3_600_000);
  if (hours <= 0) return 'Now';
  if (hours < 24) return `+${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `+${days}d ${rem}h` : `+${days}d`;
}

function formatWallClock(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatModelRun(startIso: string, modelName: string) {
  if (!startIso) return { label: '—', utcLabel: '' };
  const d = new Date(startIso.endsWith('Z') ? startIso : `${startIso}Z`);
  if (isNaN(d.getTime())) return { label: startIso, utcLabel: startIso };
  const utcLabel = `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
  // Friendly label: "GFS · Aug 7 04:00Z"
  const friendly = `${modelName.replace('_seamless', '').replace('_ifs025', '').toUpperCase()} · ${utcLabel}`;
  return { label: friendly, utcLabel };
}

// --- Component ---

export const ForecastRadarOverlay: React.FC<ForecastRadarOverlayProps> = ({
  centerLat,
  centerLon,
  zoom,
  width,
  height,
  opacity,
  enabled,
  selectedHour,
  selectedDayIndex,
  selectedDayName,
  onFrameChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [grid, setGrid] = useState<PrecipGridResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoplayFrame, setAutoplayFrame] = useState(0);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1); // 1× = 1 h/s, 2×, 4×
  const [loop, setLoop] = useState(true);

  // Stable auto-play refs so the rAF tick mutates without re-binding.
  const autoPlayIdxRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Viewport signature for cache-bucketed fetches.
  const viewportSig = useMemo(() => {
    const half = viewportHalfExtents(centerLat, centerLon, zoom, width, height);
    const cLatBucket = Math.round(centerLat * 2) / 2;
    const cLngBucket = Math.round(centerLon * 2) / 2;
    return `${cLatBucket.toFixed(1)},${cLngBucket.toFixed(1)}|h${half.halfHeightDeg.toFixed(2)},${half.halfWidthDeg.toFixed(2)}|z${Math.round(zoom)}`;
  }, [centerLat, centerLon, zoom, width, height]);

  // 1) DEBOUNCED FETCH. We don't cancel an in-flight XHR (the browser handles
  //    that natively when the user pans; we only marshal the *next* fetch
  //    attempt through this guard so two rapid signature changes don't write
  //    to state in reverse temporal order.
  useEffect(() => {
    if (!enabled) return;
    let activeSig = viewportSig;
    const controller = { sig: activeSig };

    const timer = window.setTimeout(() => {
      setIsLoading(true);

      const half = viewportHalfExtents(centerLat, centerLon, zoom, width, height);
      // Grid sizing: city-scope (z >= 12) → 12×12 = 144 cells; regional
      // (z 7–11) → 16×16; world view (z < 7) → 18×18. Cap 18 to keep URL
      // size reasonable (~3.5 KB ≈ 320 entries).
      const gridN = zoom >= 12 ? 12 : zoom >= 8 ? 16 : 18;

      fetchPrecipGrid(
        centerLat,
        centerLon,
        half.halfWidthDeg,
        half.halfHeightDeg,
        gridN
      )
        .then((result) => {
          // Drop the response if a newer fetch started after us.
          if (controller.sig !== viewportSig) return;
          setGrid(result);
          setLoadError(null);
          // If there is no rain anywhere in the first frame, keep going —
          // the user probably just needs to scrub forward. Don't show
          // "no rain" as an error.
        })
        .catch((err) => {
          if (controller.sig !== viewportSig) return;
          setLoadError(
            err instanceof Error ? err.message : 'forecast-unavailable'
          );
          setGrid(null);
        })
        .finally(() => {
          if (controller.sig === viewportSig) setIsLoading(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.sig = `cancelled:${Math.random()}`;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, viewportSig]);

  // 2) TOTAL FRAMES = 120 (5 days × 24 h) or however many the API actually
  //    returned — degrade gracefully if it's less.
  const totalFrames = useMemo(() => {
    return grid?.points?.[0]?.hours?.length ?? 120;
  }, [grid]);

  // 3) FRAME INDEX. Find the forecast hour whose UTC ms is closest to the
  //    user's selected DAY-INDEX × 24 + hour-of-day target.
  //
  //    The naive formula (`selectedDayIndex * 24 + selectedHour`) only matches
  //    when the model's frame[0] sits at exactly the user's local midnight.
  //    Open-Meteo's `forecast_hours=120` response starts at the model's
  //    "now" hour (in UTC, e.g. 04:00Z = 23:00 CDT), so picking "today 11 PM"
  //    needs to resolve to frame 0, not frame 23. We compute the absolute
  //    moment in the user's local timezone (Date constructor with explicit
  //    year/month/day/hour applies the browser's TZ offset) and snap to
  //    the nearest frame the model actually returned.
  const targetLocalMs = useMemo(() => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + selectedDayIndex,
      selectedHour,
      0,
      0,
      0
    );
    return target.getTime();
  }, [selectedDayIndex, selectedHour]);

  const sliderFrame = useMemo(() => {
    const hours = grid?.points?.[0]?.hours ?? [];
    if (hours.length === 0) return 0;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < hours.length; i++) {
      const t = hours[i].ms;
      if (!t) continue;
      const dist = Math.abs(t - targetLocalMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return Math.max(0, Math.min(hours.length - 1, bestIdx));
  }, [targetLocalMs, grid, totalFrames]);

  const activeFrameIdx = autoPlay ? autoplayFrame : sliderFrame;

  // Snap auto-play cursor back to the slider when not playing.
  useEffect(() => {
    if (!autoPlay) {
      autoPlayIdxRef.current = sliderFrame;
      setAutoplayFrame(sliderFrame);
    }
  }, [autoPlay, sliderFrame]);

  // Slider / day change → stop auto-play.
  useEffect(() => {
    setAutoPlay(false);
  }, [selectedHour, selectedDayIndex]);

  // Auto-play rAF loop. Frame increment once per (~1 hour of model time)/
  // (speed). 1× ≈ one model-hour per real second.
  useEffect(() => {
    if (!enabled || !autoPlay || !grid) return;
    lastTickRef.current = performance.now();
    autoPlayIdxRef.current = sliderFrame;
    const stepMs = Math.max(120, 1000 / speed);

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;
      if (elapsed >= stepMs) {
        lastTickRef.current = now;
        autoPlayIdxRef.current += 1;
        if (autoPlayIdxRef.current >= totalFrames) {
          if (loop) autoPlayIdxRef.current = 0;
          else {
            autoPlayIdxRef.current = totalFrames - 1;
            setAutoplayFrame(autoPlayIdxRef.current);
            setAutoPlay(false);
            return;
          }
        }
        setAutoplayFrame(autoPlayIdxRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, autoPlay, speed, loop, totalFrames, grid, sliderFrame]);

  // 4) CANVAS RENDER. Runs whenever the visible viewport, grid, or active
  //    frame shifts. proj() must match MapView's pixel math; we use the
  //    same fractional-zoom divisor (256 · 2^(zoom − baseZoom)).
  useEffect(() => {
    if (!enabled || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const W = Math.max(1, Math.round(width * dpr));
    const H = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Projections — must match MapView.lng/lat to pixel conversion.
    const baseZoom = Math.max(2, Math.min(18, Math.round(zoom)));
    const actTileSize = 256 * Math.pow(2, zoom - baseZoom);
    const center = latLngToTileCoords(centerLat, centerLon, baseZoom);

    const project = (lat: number, lng: number) => {
      const c = latLngToTileCoords(lat, lng, baseZoom);
      return {
        x: width / 2 + (c.x - center.x) * actTileSize,
        y: height / 2 + (c.y - center.y) * actTileSize,
      };
    };

    const onFrame =
      grid?.points?.[0]?.hours?.[activeFrameIdx] ?? null;

    // Notify parent of frame metadata (UI hooks).
    if (grid && onFrame) {
      const validMs = onFrame.ms || Date.now();
      if (onFrameChange) {
        onFrameChange({
          frame: activeFrameIdx,
          total: totalFrames,
          model: grid.model,
          validTimeMs: validMs,
          msFromNow: validMs - Date.now(),
        });
      }
    }

    if (!grid) return; // nothing to draw yet

    // Splat radius: a bit larger than the spacing between grid cells so
    // adjacent cells overlap (creating smooth bands). If the grid only has
    // a couple of cells (degenerate cache hit) we set a minimum.
    const splats = grid.points.map((p) => ({
      p,
      px: project(p.lat, p.lng),
    }));
    let minSpacingPx = Infinity;
    for (let i = 0; i < splats.length; i++) {
      for (let j = i + 1; j < splats.length; j++) {
        const d = Math.hypot(splats[i].px.x - splats[j].px.x, splats[i].px.y - splats[j].px.y);
        if (d > 0 && d < minSpacingPx) minSpacingPx = d;
      }
    }
    if (!Number.isFinite(minSpacingPx) || minSpacingPx < 6) minSpacingPx = 6;
    const splatRadius = Math.max(10, minSpacingPx * 1.05);

    // Lighter blending: brighter colour where cells overlap (MSN/Windy/
    // Ventusky behavior).
    ctx.globalCompositeOperation = 'lighter';

    for (const s of splats) {
      const hour: PrecipHour | undefined = s.p.hours[activeFrameIdx];
      if (!hour) continue;
      const c = colorForHour(hour);
      if (c.a <= 0.001) continue;
      // Skip splats outside the visible canvas (band-aid for low zooms).
      if (s.px.x + splatRadius < 0 || s.px.x - splatRadius > width) continue;
      if (s.px.y + splatRadius < 0 || s.px.y - splatRadius > height) continue;
      const grad = ctx.createRadialGradient(s.px.x, s.px.y, 0, s.px.x, s.px.y, splatRadius);
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${Math.min(0.98, c.a * 1.2)})`);
      grad.addColorStop(0.55, `rgba(${c.r},${c.g},${c.b},${c.a * 0.7})`);
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.px.x, s.px.y, splatRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }, [
    enabled, grid, activeFrameIdx,
    centerLat, centerLon, zoom,
    width, height, opacity, onFrameChange, totalFrames,
  ]);

  if (!enabled) return null;

  const frameHour: PrecipHour | undefined =
    grid?.points?.[0]?.hours?.[activeFrameIdx];
  const validMs = frameHour?.ms || 0;
  const msFromNow = validMs ? validMs - Date.now() : 0;
  const wallLabel = frameHour ? formatWallClock(validMs) : '—';
  const model = grid?.model ?? 'gfs_seamless';
  const runInfo = formatModelRun(grid?.startTime ?? '', model);
  const dayLabel = selectedDayName ?? `Day ${selectedDayIndex}`;
  const statusSubtitle =
    grid && frameHour
      ? `${model.replace('_seamless', '').toUpperCase()} · ${runInfo.utcLabel || '—'} · ${activeFrameIdx + 1}/${totalFrames} · ${dayLabel} ${wallLabel} (${formatRelativeHour(msFromNow)})`
      : isLoading
        ? 'Loading forecast grid…'
        : loadError
          ? `Forecast unavailable (${loadError})`
          : 'No active frame';

  return (
    <div
      className="absolute inset-0 z-[6] pointer-events-auto"
      style={{
        opacity: Math.max(0, Math.min(1, opacity)),
        transition: 'opacity 0.3s ease',
      }}
      aria-label="5-day precipitation forecast overlay"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 select-none"
        style={{ pointerEvents: 'none' }}
      />

      {/* Status pill (top-right, doesn't collide with the existing radar
          status chip because that one is bottom-centred). */}
      <div
        role="status"
        aria-live="polite"
        className={`absolute top-2 right-2 px-2.5 py-1.5 rounded-full border shadow-2xl backdrop-blur-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap max-w-[90vw] overflow-hidden max-md:text-[9px] ${
          loadError
            ? 'bg-slate-900/90 border-rose-500/60 text-rose-300'
            : !grid
              ? 'bg-slate-900/90 border-amber-400/50 text-amber-200'
              : 'bg-slate-900/90 border-sky-500/50 text-sky-300'
        }`}
        title={statusSubtitle}
      >
        {loadError
          ? 'Forecast unavailable'
          : !grid
            ? isLoading ? 'Loading forecast…' : 'Awaiting forecast'
            : (
              <>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${frameHour && colorForHour(frameHour).a > 0 ? 'bg-sky-400 animate-pulse' : 'bg-slate-400'}`} />
                FORECAST · {dayLabel} {wallLabel} {frameHour ? `· ${formatRelativeHour(msFromNow)}` : ''}
              </>
            )}
      </div>

      {/* Playback controls (bottom-right, doesn't collide with the HOURLY WEATHER toggle). */}
      {grid && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-1 bg-slate-900/85 border border-sky-500/40 rounded-full shadow-2xl backdrop-blur-md">
          <button
            onClick={() => setAutoPlay((p) => !p)}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 transition-colors cursor-pointer pointer-events-auto"
            aria-label={autoPlay ? 'Pause forecast animation' : 'Play forecast animation'}
            title={autoPlay ? 'Pause animation' : 'Play 1× / hour'}
          >
            {autoPlay ? (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><rect x="1" y="1" width="2.4" height="7" rx="0.5" /><rect x="5.6" y="1" width="2.4" height="7" rx="0.5" /></svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><polygon points="1,0 8,4.5 1,9" /></svg>
            )}
          </button>

          {/* Speed cycle: 1× → 2× → 4× */}
          <button
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            className="px-1.5 h-6 text-[10px] font-black text-sky-200 hover:bg-sky-500/30 rounded-full transition-colors cursor-pointer pointer-events-auto"
            title="Cycle speed (1× / 2× / 4×)"
          >
            {speed}×
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setLoop((l) => !l)}
            className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer pointer-events-auto ${loop ? 'bg-sky-500/30 text-sky-200' : 'bg-slate-700/40 text-slate-400'}`}
            aria-label={loop ? 'Looping animation on' : 'Looping animation off'}
            title={loop ? 'Loop on' : 'Loop off — stops at end'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 6 a4 4 0 0 1 4-4 h3 v2 m-2-2 2 2 m-2 2 v-2 h-3 a4 4 0 0 0 4 4 h3 v2 m-2-2 2 2" /></svg>
          </button>

          {/* Step back / forward (1 hour) */}
          <button
            onClick={() => {
              setAutoPlay(false);
              const next = Math.max(0, sliderFrame - 1);
              setAutoplayFrame(next);
              autoPlayIdxRef.current = next;
            }}
            className="flex items-center justify-center w-6 h-6 rounded-full text-sky-200 hover:bg-sky-500/30 transition-colors cursor-pointer pointer-events-auto"
            aria-label="Step backward one hour"
            title="Step backward 1 hour"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><polygon points="8,1 8,8 2,4.5" /><rect x="1" y="1" width="1" height="7" rx="0.4" /></svg>
          </button>
          <button
            onClick={() => {
              setAutoPlay(false);
              const next = Math.min(totalFrames - 1, sliderFrame + 1);
              setAutoplayFrame(next);
              autoPlayIdxRef.current = next;
            }}
            className="flex items-center justify-center w-6 h-6 rounded-full text-sky-200 hover:bg-sky-500/30 transition-colors cursor-pointer pointer-events-auto"
            aria-label="Step forward one hour"
            title="Step forward 1 hour"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><polygon points="1,1 1,8 7,4.5" /><rect x="7" y="1" width="1" height="7" rx="0.4" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default ForecastRadarOverlay;

/** Friendly helpers re-exported for parent pills. */
export const forecastHelpers = {
  colorForHour,
  formatRelativeHour,
  formatWallClock,
  formatModelRun,
};
