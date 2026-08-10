import React, { useState, useEffect, useRef } from 'react';
import { HourlyForecast, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { Droplets, Activity } from 'lucide-react';

interface PressureChartProps {
  hourly: HourlyForecast[];
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
  selectedDayName?: string;
  selectedDateFormatted?: string;
}

export const PressureChart: React.FC<PressureChartProps> = ({
  hourly,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedHour,
  onSelectHour,
  selectedDayName,
  selectedDateFormatted,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!hourly || hourly.length === 0) return null;

  // Extract pressure and precipitation series
  const pressures = hourly.map((h) => (pressureUnit === 'inHg' ? h.pressureInHg : h.pressureHpa));

  const minP = Math.min(...pressures);
  const maxP = Math.max(...pressures);
  const rangeP = Math.max(0.05, maxP - minP);

  // SVG dimensions - padded for dual Y-axes
  const width = 850;
  const height = 250;
  const paddingLeft = 52;
  const paddingRight = 52;
  const paddingTop = 30;
  const paddingBottom = 48;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Convert points to SVG coordinates
  const points = hourly.map((h, i) => {
    const x = paddingLeft + (i / (hourly.length - 1)) * chartWidth;
    const valP = pressureUnit === 'inHg' ? h.pressureInHg : h.pressureHpa;
    const normP = (valP - minP) / rangeP;
    const yP = height - paddingBottom - normP * (chartHeight - 15);

    const precipProb = Math.min(100, Math.max(0, h.precipProbability || 0));
    const normPrecip = precipProb / 100;
    const yPrecip = height - paddingBottom - normPrecip * (chartHeight - 15);

    return {
      x,
      yP,
      yPrecip,
      valP,
      precipProb,
      precipMm: h.precipMm || 0,
      hourStr: h.time,
      score: h.huntScore,
      isPrime: h.isPrimeWindow,
      h,
    };
  });

  // SVG Path for Barometric Pressure Line
  const pressureLineD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.yP}` : `${acc} L ${pt.x},${pt.yP}`;
  }, '');

  const pressureAreaD = `${pressureLineD} L ${points[points.length - 1].x},${height - paddingBottom} L ${points[0].x},${height - paddingBottom} Z`;

  // SVG Path for Rain Precipitation Forecast Line
  const precipLineD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.yPrecip}` : `${acc} L ${pt.x},${pt.yPrecip}`;
  }, '');

  const precipAreaD = `${precipLineD} L ${points[points.length - 1].x},${height - paddingBottom} L ${points[0].x},${height - paddingBottom} Z`;

  const activeIdx = hoveredIdx !== null ? hoveredIdx : (selectedHour !== undefined ? selectedHour : null);
  const activePoint = activeIdx !== null && points[activeIdx] ? points[activeIdx] : null;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Smoothly pan scroll container when selected hour changes from slider, avoiding animation frame conflicts
  useEffect(() => {
    // If user is hovering directly on chart with mouse, don't force scroll
    if (hoveredIdx !== null) return;

    const activeHourIdx = selectedHour !== undefined ? selectedHour : null;
    if (activeHourIdx === null) return;

    const container = scrollContainerRef.current;
    if (!container || !points[activeHourIdx]) return;

    const activePt = points[activeHourIdx];
    const containerScrollWidth = container.scrollWidth;
    const containerClientWidth = container.clientWidth;

    if (containerScrollWidth > containerClientWidth) {
      const pointPx = (activePt.x / width) * containerScrollWidth;
      const targetScrollLeft = Math.max(
        0,
        Math.min(containerScrollWidth - containerClientWidth, pointPx - containerClientWidth / 2)
      );

      // Use 'auto' behavior to sync continuously with slider updates without animation fighting/glitching
      container.scrollTo({
        left: targetScrollLeft,
        behavior: 'auto',
      });
    }
  }, [selectedHour, hoveredIdx, width, points]);

  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
        isDark
          ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
          : theme === 'hunting'
          ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] text-[#1e2e1b]'
          : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-md' : 'bg-white'} border-slate-200 text-slate-900`
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-2"><Activity className="w-4 h-4" /> Rain & Barometer</span>
            {selectedDayName && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                  isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'
                }`}
              >
                {selectedDayName} ({selectedDateFormatted})
              </span>
            )}
          </h3>
          <p className={`text-xs sm:text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            The last 24 hours of rain and barometer readings, with the best hunting windows marked
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs font-bold flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500 inline-block" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Best Hunt Hours</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-amber-500 rounded-full inline-block" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Barometer ({pressureUnit})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-cyan-400 rounded-full inline-block" />
            <span className="text-cyan-500 dark:text-cyan-400 flex items-center gap-0.5">
              <Droplets className="w-3 h-3 inline" /> Rain Precip (%)
            </span>
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[600px] select-none"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="pressureGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
            </linearGradient>

            <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="primeWindowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Prime Time Window Highlights */}
          <rect
            x={paddingLeft + (5 / 23) * chartWidth}
            y={paddingTop}
            width={(4 / 23) * chartWidth}
            height={chartHeight}
            fill="url(#primeWindowGrad)"
            rx="6"
          />
          <rect
            x={paddingLeft + (16 / 23) * chartWidth}
            y={paddingTop}
            width={(4 / 23) * chartWidth}
            height={chartHeight}
            fill="url(#primeWindowGrad)"
            rx="6"
          />

          {/* Horizontal Grid lines with Left (Barometer) and Right (Rain Precip %) Axes */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
            const y = height - paddingBottom - ratio * (chartHeight - 15);
            const valP = minP + ratio * rangeP;
            const valPrecip = Math.round(ratio * 100);

            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke={isDark ? '#334155' : '#e2e8f0'}
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                {/* Left Axis: Pressure */}
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill={isDark ? '#f59e0b' : '#d97706'}
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="end"
                >
                  {valP.toFixed(pressureUnit === 'inHg' ? 2 : 0)}
                </text>
                {/* Right Axis: Rain Precip % */}
                <text
                  x={width - paddingRight + 8}
                  y={y + 4}
                  fill={isDark ? '#22d3ee' : '#0284c7'}
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="start"
                >
                  {valPrecip}%
                </text>
              </g>
            );
          })}

          {/* Area Fill under Barometric Pressure line */}
          <path d={pressureAreaD} fill="url(#pressureGrad)" />

          {/* Area Fill under Rain Precipitation line */}
          <path d={precipAreaD} fill="url(#precipGrad)" />

          {/* Barometric Pressure Line */}
          <path
            d={pressureLineD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Rain Precipitation Line */}
          <path
            d={precipLineD}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2.5"
            strokeDasharray="5 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hourly Nodes & X-Axis Time Labels */}
          {points.map((pt, i) => {
            const isHovered = hoveredIdx === i;
            const isSelected = activeIdx === i;

            return (
              <g
                key={i}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onClick={() => onSelectHour && onSelectHour(i)}
              >
                {/* Wide invisible interaction block for easy hover/touch */}
                <rect
                  x={pt.x - chartWidth / 48}
                  y={paddingTop}
                  width={chartWidth / 24}
                  height={chartHeight}
                  fill="transparent"
                />

                {/* Rain Precip Point Node */}
                <circle
                  cx={pt.x}
                  cy={pt.yPrecip}
                  r={isHovered ? 5.5 : pt.precipProb > 30 ? 3.5 : 2}
                  fill="#06b6d4"
                  stroke={isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={1.5}
                />

                {/* Barometer Point Node */}
                <circle
                  cx={pt.x}
                  cy={pt.yP}
                  r={isHovered ? 6 : pt.isPrime ? 4.5 : 3}
                  fill={pt.isPrime ? '#10b981' : '#f59e0b'}
                  stroke={isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={1.5}
                />

                {/* X-Axis Time Labels (Slightly larger font size for readability) */}
                {i % 3 === 0 && (
                  <text
                    x={pt.x}
                    y={height - 12}
                    fill={isDark ? '#e2e8f0' : '#334155'}
                    fontSize="13"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {pt.hourStr}
                  </text>
                )}
              </g>
            );
          })}

          {/* Active Hover / Selected Hour Cursor Line */}
          {activePoint && (
            <g className="pointer-events-none">
              <line
                x1={activePoint.x}
                y1={paddingTop}
                x2={activePoint.x}
                y2={height - paddingBottom}
                stroke="#0284c7"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              {/* Pressure Active Ring */}
              <circle
                cx={activePoint.x}
                cy={activePoint.yP}
                r="7"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              {/* Precip Active Ring */}
              <circle
                cx={activePoint.x}
                cy={activePoint.yPrecip}
                r="6"
                fill="#06b6d4"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Active Hover / Hour Detail Card */}
      {activePoint ? (
        <div
          className={`mt-4 p-3.5 sm:p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm animate-fadeIn ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/80 text-slate-100' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-amber-500/20 text-amber-600 dark:text-amber-300 font-extrabold rounded-lg border border-amber-500/40 text-xs sm:text-sm">
              ⏰ {activePoint.hourStr}
            </span>
            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Barometer: </span>
              <span className={`font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                {activePoint.valP} {pressureUnit}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 sm:gap-5 flex-wrap font-bold">
            <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
              <Droplets className="w-4 h-4 inline shrink-0" />
              <span>
                Rain Precip: <span className="font-black text-cyan-500">{activePoint.precipProb}%</span>
                {activePoint.precipMm > 0 && (
                  <span className="text-xs opacity-90 ml-1">
                    ({units === 'imperial' ? `${(activePoint.precipMm / 25.4).toFixed(2)} in` : `${activePoint.precipMm.toFixed(1)} mm`})
                  </span>
                )}
              </span>
            </div>

            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Temp: </span>
              <span className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {activePoint.h.temp}°{units === 'imperial' ? 'F' : 'C'}
              </span>
            </div>

            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Wind: </span>
              <span className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {activePoint.h.windDirectionText} @{' '}
                {units === 'metric' ? `${activePoint.h.windSpeedKmh} km/h` : `${activePoint.h.windSpeedMph} mph`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Movement: </span>
              <span
                className={`px-2.5 py-0.5 rounded-md font-black ${
                  activePoint.score >= 80
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                    : activePoint.score >= 60
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                    : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                {activePoint.score}/100
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className={`text-xs text-center mt-2.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Hover or tap any hour to see rain, the barometer, wind, and when deer may move.
        </p>
      )}
    </div>
  );
};
