import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HourlyForecast, Location, UnitSystem, ThemeVariantMode } from '../types';
import { Wind, Crosshair, ZoomIn, ZoomOut, RotateCcw, MapPin, Navigation, CalendarDays } from 'lucide-react';
import { getHour12Label } from '../utils/huntingEngine';

interface SimpleWindMapProps {
  location: Location;
  hourly: HourlyForecast[];
  units: UnitSystem;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedDayName?: string;
  selectedDateFormatted?: string;
}

// Coordinate conversions for Web Mercator (Slippy Map Tiles)
function latLngToTileCoords(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileXToLng(x: number, zoom: number) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

// Generate an SVG path for a filled sector (cone) centered at the hunter marker.
function getSvgArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const angleDiff = (endAngle - startAngle + 360) % 360;
  const largeArcFlag = angleDiff <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

export const SimpleWindMap: React.FC<SimpleWindMapProps> = ({
  location,
  hourly,
  units,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedDayName,
  selectedDateFormatted,
}) => {
  // Hour selected by the map's own compact slider. This is intentionally
  // local to the map so scrubbing the map never changes the hero, the
  // hourly score bars, or the pressure chart — those follow the hourly-card
  // slider instead.
  const [mapHour, setMapHour] = useState<number>(() => new Date().getHours());
  // When the displayed day changes (new hourly array), reset the map hour
  // to the live hour so the map never points at a stale hour of the old day.
  useEffect(() => {
    setMapHour(new Date().getHours());
  }, [hourly]);

  const [zoom, setZoom] = useState(15);
  const defaultLat = location?.latitude ?? 39.8283;
  const defaultLng = location?.longitude ?? -98.5795;
  const [centerLat, setCenterLat] = useState(defaultLat);
  const [centerLng, setCenterLng] = useState(defaultLng);

  // Keep the map centered on the active location whenever it changes.
  useEffect(() => {
    setCenterLat(location.latitude);
    setCenterLng(location.longitude);
  }, [location]);

  // Drag-to-pan state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchGestureRef = useRef<{ startX: number; startY: number; axis: 'undecided' | 'vertical' | 'horizontal' } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Dimensions of the map container (measured with ResizeObserver).
  const [dimensions, setDimensions] = useState({ width: 320, height: 280 });
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const containerWidth = dimensions.width;
  const containerHeight = dimensions.height;
  const halfW = containerWidth / 2;
  const halfH = containerHeight / 2;

  const centerTile = useMemo(() => latLngToTileCoords(centerLat, centerLng, zoom), [centerLat, centerLng, zoom]);
  const centerX = centerTile.x;
  const centerY = centerTile.y;

  // Active hour data (fall back to the first hour if out of range).
  const hourData = hourly[mapHour] || hourly[0] || null;
  const windDeg = hourData ? hourData.windDirectionDeg : 0;
  const windMph = hourData ? hourData.windSpeedMph : 0;
  const windText = hourData ? hourData.windDirectionText : getWindDirectionText(windDeg);
  // Scent blows downwind (away from the source), so flip the wind vector.
  const downwindDeg = (windDeg + 180) % 360;
  const scentSpread = 45;
  const startAngle = downwindDeg - scentSpread / 2;
  const endAngle = downwindDeg + scentSpread / 2;
  const plumeRadius = Math.min(150, Math.max(90, Math.min(containerWidth, containerHeight) * 0.42));

  // Drag handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY };
  };
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    dragStartRef.current = { x: clientX, y: clientY };
    const dTileX = -dx / 256;
    const dTileY = -dy / 256;
    const newLng = tileXToLng(centerX + dTileX, zoom);
    const newLat = tileYToLat(centerY + dTileY, zoom);
    setCenterLat(newLat);
    setCenterLng(newLng);
  };
  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    handleDragStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    handleDragEnd();
    touchGestureRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, axis: 'undecided' };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !touchGestureRef.current) return;
    const touch = e.touches[0];
    const gesture = touchGestureRef.current;
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (gesture.axis === 'undecided') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (gesture.axis !== 'horizontal') return;
    e.preventDefault();
    if (!isDraggingRef.current) handleDragStart(gesture.startX, gesture.startY);
    handleDragMove(touch.clientX, touch.clientY);
  };
  const handleTouchEnd = () => {
    touchGestureRef.current = null;
    handleDragEnd();
  };

  // Tile list for the current center/zoom/size.
  const tileList = useMemo(() => {
    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    const spanX = Math.ceil(containerWidth / 256) + 1;
    const spanY = Math.ceil(containerHeight / 256) + 1;
    const startX = Math.floor(centerX) - Math.floor(spanX / 2);
    const endX = Math.floor(centerX) + Math.ceil(spanX / 2);
    const startY = Math.floor(centerY) - Math.floor(spanY / 2);
    const endY = Math.floor(centerY) + Math.ceil(spanY / 2);
    const maxTile = Math.pow(2, zoom);
    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
        if (ty < 0 || ty >= maxTile) continue;
        tiles.push({
          key: `${zoom}-${tx}-${ty}`,
          url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedTx}`,
          left: halfW + (tx - centerX) * 256,
          top: halfH + (ty - centerY) * 256,
        });
      }
    }
    return tiles;
  }, [centerX, centerY, zoom, containerWidth, containerHeight]);

  const handleZoomIn = () => setZoom((prev) => Math.min(18, prev + 1));
  const handleZoomOut = () => setZoom((prev) => Math.max(12, prev - 1));
  const handleReset = () => {
    setCenterLat(defaultLat);
    setCenterLng(defaultLng);
  };

  const speedVal = units === 'metric'
    ? Math.round(hourData ? hourData.windSpeedKmh : 0)
    : Math.round(windMph);
  const unitLabel = units === 'metric' ? 'km/h' : 'mph';

  return (
    <div
      className={`flex flex-col rounded-2xl border shadow-md transition-colors overflow-hidden ${
        isDark
          ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
          : theme === 'hunting'
          ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-xl border-[#d4c4a8] text-[#2a1b0e]'
          : theme === 'olive'
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl border-[#d8d2c0] text-[#1e2e1b]'
          : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-xl' : 'bg-white'} border-slate-200 text-slate-900`
      }`}
    >
      {/* Header */}
      <div className={`px-3 sm:px-4 py-2.5 border-b flex items-center justify-between gap-2 ${
        isDark ? 'border-slate-800' : theme === 'hunting' ? 'border-[#d4c4a8]' : theme === 'olive' ? 'border-[#d8d2c0]' : 'border-slate-100'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isDark ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
          }`}>
            <Navigation className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-xs font-black uppercase tracking-wider truncate">Wind & Scent Map</div>
              {selectedDayName && (
                <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                  isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                }`}>
                  <CalendarDays className="w-2.5 h-2.5" />
                  {selectedDayName}{selectedDateFormatted ? ` (${selectedDateFormatted})` : ''}
                </span>
              )}
            </div>
            <div className="text-[11px] font-semibold opacity-70 truncate">
              Satellite · {location.name} · {getHour12Label(mapHour)}
            </div>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${
          isDark ? 'bg-slate-950/60 border-slate-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <Wind className="w-3 h-3" /> {windText} @ {speedVal} {unitLabel}
        </span>
      </div>

      {/* Map canvas */}
      <div
        ref={mapContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`relative w-full h-56 sm:h-64 overflow-hidden select-none touch-pan-y ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tileList.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              className="absolute border-none select-none"
              style={{ left: `${tile.left}px`, top: `${tile.top}px`, width: '256px', height: '256px' }}
              onError={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? '#1e293b' : '#e2e8f0';
              }}
            />
          ))}
        </div>

        {/* Scent plume overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <radialGradient id="simpleScentFade" cx={halfW} cy={halfH} r={plumeRadius} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="40%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d={getSvgArcPath(halfW, halfH, plumeRadius, startAngle, endAngle)}
            fill="url(#simpleScentFade)"
          />
          {/* Pulsing concentric scent waves */}
          <g className="animate-pulse">
            <path d={getSvgArcPath(halfW, halfH, plumeRadius * 0.45, startAngle, endAngle)} fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeDasharray="4,4" opacity="0.6" />
            <path d={getSvgArcPath(halfW, halfH, plumeRadius * 0.75, startAngle, endAngle)} fill="none" stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="6,6" opacity="0.4" />
          </g>
          {/* Cardinal labels */}
          <text x={halfW} y={20} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">N</text>
          <text x={containerWidth - 15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">E</text>
          <text x={halfW} y={containerHeight - 12} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">S</text>
          <text x={15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">W</text>
        </svg>

        {/* Center hunter marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full border-2 border-emerald-400 bg-emerald-950/90 flex items-center justify-center shadow-lg">
          <Crosshair className="w-4 h-4 text-emerald-300" />
        </div>

        {/* Zoom / reset controls */}
        <div className="absolute bottom-2.5 right-2.5 z-30 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-emerald-400 flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Center on location"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Drag hint */}
        <div className="absolute bottom-2.5 left-2.5 z-30 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] font-black uppercase text-white shadow-sm">
            <MapPin className="w-3 h-3 text-emerald-400" /> Drag to pan
          </span>
        </div>
      </div>

      {/* Compact hour slider — scrub to preview wind direction through the day */}
      <div className={`px-3 sm:px-4 py-2.5 border-t flex items-center gap-2.5 ${
        isDark ? 'border-slate-800 bg-slate-950/[var(--card-opacity)]' : theme === 'hunting' ? 'border-[#d4c4a8] bg-[#eae1cf]/[var(--card-opacity)]' : theme === 'olive' ? 'border-[#d8d2c0] bg-[#efebd9]/[var(--card-opacity)]' : 'border-slate-100 bg-slate-50/[var(--card-opacity)]'
      }`}>
        <span className={`shrink-0 w-[54px] whitespace-nowrap text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-emerald-300' : theme === 'hunting' ? 'text-[#7a3208]' : theme === 'olive' ? 'text-[#3d4f21]' : 'text-emerald-700'}`}>
          {getHour12Label(mapHour)}
        </span>
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={mapHour}
          onChange={(e) => setMapHour(parseInt(e.target.value, 10))}
          aria-label="Wind map hour slider"
          className={`flex-1 min-w-0 h-1.5 cursor-pointer ${isDark ? 'accent-emerald-400' : 'accent-emerald-600'}`}
        />
        <span className={`shrink-0 w-[76px] text-right whitespace-nowrap text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {windText} {speedVal} {unitLabel}
        </span>
      </div>
    </div>
  );
};
