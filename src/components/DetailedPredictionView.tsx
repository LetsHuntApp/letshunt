import React, { useState, useEffect, useRef } from 'react';
import { DailyForecast, Location, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { WindCompass } from './WindCompass';
import { PressureChart } from './PressureChart';
import { DeerIcon } from './DeerIcon';
import { RutStatusModal } from './RutStatusModal';
import { RutPhaseIcon } from './RutPhaseIcon';
import { getHour12Label, getRatingFromScore, getWeatherDetails, calculateHuntScore, celsiusToFahrenheit, getBestStandForWind, RATING_THRESHOLDS } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Sunrise,
  Sunset,
  Award,
  ChevronUp,
  ChevronDown,
  Clock,
  Gauge,
  Wind,
  TrendingUp,
  Sliders,
  Calendar,
  Info,
  Star,
  BarChart3,
} from 'lucide-react';

interface DetailedPredictionViewProps {
  day: DailyForecast;
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onBack: () => void;
}

export const DetailedPredictionView: React.FC<DetailedPredictionViewProps> = ({
  day,
  location,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedHour,
  onSelectHour,
  onBack,
}) => {
  const [showFactors, setShowFactors] = useState(true);
  const [hoveredHourIdx, setHoveredHourIdx] = useState<number | null>(null);
  const [isRutModalOpen, setIsRutModalOpen] = useState(false);
  const movementChartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Extract hour-specific weather data for the selected hour
  const hourData = day.hourly[selectedHour] || day.hourly[0] || null;

  const activeScore = hourData ? hourData.huntScore : day.huntScore;
  const isExcellentDay = activeScore >= RATING_THRESHOLDS.excellent;
  const isGoodDay = activeScore >= RATING_THRESHOLDS.good && activeScore < RATING_THRESHOLDS.excellent;
  const isModerateDay = activeScore >= RATING_THRESHOLDS.okay && activeScore < RATING_THRESHOLDS.good;
  const isSlowDay = activeScore >= RATING_THRESHOLDS.slow && activeScore < RATING_THRESHOLDS.okay;
  const isPoorDay = activeScore < RATING_THRESHOLDS.slow;

  // Compute active factors dynamically
  const activeFactors = (() => {
    if (!hourData) return day.factors;

    // Recompute factors using calculateHuntScore based on selected hour parameters
    const calcResult = calculateHuntScore({
      tempDrop24h: hourData.tempDrop24h !== undefined ? hourData.tempDrop24h : day.tempDrop24h,
      maxTempF: hourData.temp,
      minTempF: day.minTemp,
      pressureInHg: hourData.pressureInHg,
      pressureTrend: hourData.pressureTrend ?? day.pressureTrend,
      windMph: hourData.windSpeedMph,
      weatherCode: hourData.weatherCode,
      isPostStorm: day.isPostStorm && hourData.weatherDesc === 'Rain Break (Dry Window)',
      humidity: hourData.humidity ?? null,
      cloudCover: hourData.cloudCover ?? null,
      tempDeltaF: hourData.tempDeltaF ?? null,
      windGustMph: hourData.windGustMph ?? null,
      // Use the exact per-hour rain-break signal weatherService stamped on
      // the hour so the factor panel always agrees with the dial's score.
      hasRainBreak: hourData.weatherDesc === 'Rain Break (Dry Window)',
      solunar: day.solunar,
      solunarRating: hourData.solunarRating,
      hour: selectedHour,
      isPrimeWindow: hourData.isPrimeWindow,
      units,
      pressureUnit,
      dateStr: day.date,
      location,
    });

    return calcResult.factors;
  })();

  // Setup wind variables based on selected hour or fallback to daily average
  const currentWindDeg = hourData ? hourData.windDirectionDeg : day.windDirectionDeg;
  const currentWindSpeed = hourData
    ? units === 'imperial'
      ? hourData.windSpeedMph
      : hourData.windSpeedKmh
    : units === 'imperial'
    ? day.windSpeedMaxMph
    : day.windSpeedMaxKmh;
  const currentWindText = hourData ? hourData.windDirectionText : day.windDirectionText;

  // Weather description
  const weatherDetails = hourData ? getWeatherDetails(hourData.weatherCode) : getWeatherDetails(day.weatherCode);

  // Score gauge color helper — Backwoods gets its own palette (mirroring the
  // dashboard dial) so the ring and every center element share one exact
  // color per theme × mode. Center elements use the returned stroke hex
  // directly, avoiding theme utility overrides that could break the match.
  const getScoreColorClasses = (score: number) => {
    if (score >= RATING_THRESHOLDS.excellent) { // Great - Deep Pine Green (emerald-800)
      return {
        bg: 'bg-emerald-800/10 dark:bg-emerald-500/15',
        border: 'border-emerald-800/20 dark:border-emerald-500/30',
        ring: 'ring-emerald-800/10 dark:ring-emerald-500/10',
        stroke: theme === 'hunting' ? '#556b2f' : isDark ? '#34d399' : '#047857', // theme-aware Great score color
      };
    } else if (score >= RATING_THRESHOLDS.good) { // Good - Sage Green (emerald-500/600)
      return {
        bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        border: 'border-emerald-500/20 dark:border-emerald-500/30',
        ring: 'ring-emerald-500/10 dark:ring-emerald-500/10',
        stroke: theme === 'hunting' ? '#556b2f' : isDark ? '#10b981' : '#059669', // theme-aware Good score color
      };
    } else if (score >= RATING_THRESHOLDS.okay) { // Okay - Yellow (amber-400/500)
      return {
        bg: 'bg-yellow-500/10 dark:bg-yellow-500/15',
        border: 'border-yellow-500/20 dark:border-yellow-500/30',
        ring: 'ring-yellow-500/10 dark:ring-yellow-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#d9b64a' : '#b8860b') : isDark ? '#fbbf24' : '#ca8a04', // theme-aware Okay score color
      };
    } else if (score >= RATING_THRESHOLDS.slow) { // Slow - Orangish/Amber (amber-600)
      return {
        bg: 'bg-orange-500/10 dark:bg-orange-500/15',
        border: 'border-orange-500/20 dark:border-orange-500/30',
        ring: 'ring-orange-500/10 dark:ring-orange-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#d08a4d' : '#c85a17') : '#d97706', // theme-aware Slow score color
      };
    } else { // Very Slow - Dusty Terracotta/Rose (rose-500/600)
      return {
        bg: 'bg-rose-500/10 dark:bg-rose-500/15',
        border: 'border-rose-500/20 dark:border-rose-500/30',
        ring: 'ring-rose-500/10 dark:ring-rose-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#c5675c' : '#8b3a3a') : '#f43f5e', // theme-aware Very Slow score color
      };
    }
  };

  const colors = getScoreColorClasses(activeScore);
  const chartAccent = isDark && theme === 'hunting' ? '#c77942' : '#10b981';
  const ratingBadgeClasses = theme === 'hunting'
    ? isExcellentDay
      ? 'bg-[#556b2f] text-white ring-2 ring-[#556b2f]/40'
      : isGoodDay
      ? 'bg-[#556b2f] text-white ring-2 ring-[#556b2f]/35'
      : isModerateDay
      ? 'bg-[#b8860b] text-white ring-2 ring-[#d9b64a]/35'
      : isSlowDay
      ? 'bg-[#c85a17] text-white ring-2 ring-[#e08a5a]/35'
      : 'bg-[#8b3a3a] text-white ring-2 ring-[#b56b6b]/35'
    : isExcellentDay
    ? 'bg-emerald-800 text-white ring-2 ring-emerald-800/25'
    : isGoodDay
    ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-500/20'
    : isModerateDay
    ? 'bg-yellow-500 text-slate-950 ring-2 ring-yellow-500/20'
    : isSlowDay
    ? 'bg-orange-600 text-white ring-2 ring-orange-500/25'
    : 'bg-rose-500 text-white ring-2 ring-rose-500/20';
  const rutInfo = getRutPhase(day.date, location);

  // Setup 24-hour Hunt Score Chart parameters
  const chartWidth = 800;
  const chartHeight = 200;
  const paddingX = 40;
  const paddingTop = 25;
  const paddingBottom = 40;

  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Convert scores to SVG coordinate points
  const points = day.hourly.map((h, i) => {
    const x = paddingX + (i / (day.hourly.length - 1)) * innerWidth;
    const score = h.huntScore;
    const y = chartHeight - paddingBottom - (score / 100) * innerHeight;
    return { x, y, score, hourStr: h.time, isPrime: h.isPrimeWindow, h, index: i };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x},${chartHeight - paddingBottom} L ${points[0].x},${chartHeight - paddingBottom} Z`;

  // Determine active point (either hovered hour or selected hour)
  const activeIdx = hoveredHourIdx !== null ? hoveredHourIdx : selectedHour;
  const activePoint = points[activeIdx] || null;

  // Keep the selected slider hour visible on narrow screens. The SVG has a
  // minimum width, so the chart can overflow horizontally on phones; follow
  // the selected point just like PressureChart does for its hourly graph.
  useEffect(() => {
    const container = movementChartScrollRef.current;
    const selectedPoint = points[selectedHour];
    if (!container || !selectedPoint) return;

    const pointPx = (selectedPoint.x / chartWidth) * container.scrollWidth;
    const targetScrollLeft = Math.max(
      0,
      Math.min(container.scrollWidth - container.clientWidth, pointPx - container.clientWidth / 2)
    );

    container.scrollTo({
      left: targetScrollLeft,
      behavior: 'auto',
    });
  }, [selectedHour, points, chartWidth]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Header Back Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className={`px-4 py-2 text-xs sm:text-sm font-extrabold uppercase tracking-wider rounded-xl border flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            isDark
              ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Calendar className="w-4 h-4" />
          <span>{day.dayName}, {day.dateFormatted} Day Details</span>
        </div>
      </div>

      {/* Hero Header Area: Overall Day Score */}
      <div
        className={`rounded-3xl border p-6 sm:p-8 flex flex-col items-center gap-6 sm:gap-8 shadow-xl relative overflow-hidden transition-all duration-300 ${
          // Theme-aware card surface, matching the other cards on this page
          // (no solid rating tint — the border below carries the band color).
          isDark
            ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl' : 'bg-slate-900/90'} text-slate-100`
            : theme === 'hunting'
            ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-xl text-[#2a1b0e]'
            : theme === 'olive'
            ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl text-[#1e2e1b]'
            : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-xl' : 'bg-white'} text-slate-900`
        } ${
          // Rating-tinted border keeps the score-band signal.
          isExcellentDay
            ? 'border-emerald-600/40'
            : isGoodDay
            ? 'border-emerald-500/35'
            : isModerateDay
            ? 'border-yellow-500/40'
            : isSlowDay
            ? 'border-orange-500/40'
            : 'border-rose-500/40'
        }`}
      >
        {/* Keep the primary score immediately at the top of the hero, matching the dashboard hierarchy. */}
        <div className="flex flex-col items-center justify-center space-y-2 shrink-0 z-10">
          <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center">
            <svg
              className="absolute w-full h-full transform -rotate-90"
              viewBox="0 0 100 100"
              role="img"
              aria-label={`Hunt score ${activeScore} out of 100, rated ${getRatingFromScore(activeScore)}`}
            >
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={isDark ? (theme === 'hunting' ? '#4a3320' : '#1e293b') : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#ded8c8' : '#e2e8f0'}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={colors.stroke}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - activeScore / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-out"
              />
            </svg>
            <div className="detailed-score-dial-content text-center z-10 flex flex-col items-center justify-center">
              <DeerIcon
                className="w-9 h-9 sm:w-11 sm:h-11 fill-current -mb-0.5"
                style={{ color: colors.stroke, fill: colors.stroke }}
              />
              <div
                className="text-3xl sm:text-4xl font-black tracking-tight leading-none"
                style={{ color: colors.stroke }}
              >
                {activeScore}
              </div>
              <div
                className="text-xs sm:text-xs font-black uppercase tracking-wider leading-tight mt-0.5 flex items-center justify-center gap-1"
                style={{ color: colors.stroke }}
              >
                {isExcellentDay && <Star className="w-3.5 h-3.5" style={{ color: colors.stroke, fill: colors.stroke }} />}
                <span>{getRatingFromScore(activeScore)}</span>
              </div>
              <div
                className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest -mt-0.5 opacity-90"
                style={{ color: colors.stroke }}
              >
                HUNT SCORE
              </div>
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col items-center text-center space-y-4 max-w-3xl z-10">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Today's Hunting Plan
              </span>
              <div className={`text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 ${
                ratingBadgeClasses
              }`}>
                {isExcellentDay && <Star className="w-3 h-3 fill-current text-amber-300" />}
                <span>{getRatingFromScore(activeScore)} {selectedHour !== undefined ? `at ${getHour12Label(selectedHour)}` : 'Day'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRutModalOpen(true)}
                className={`inline-flex items-center gap-1 text-xs sm:text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider border cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xs ring-2 ring-transparent hover:ring-amber-500/40 ${rutInfo.badgeStyle}`}
                title="Click for Rut Phase Breakdown & Hunter Tips"
              >
                <RutPhaseIcon iconName={rutInfo.iconName} className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{rutInfo.name}</span>
                <Info className="w-3 h-3 ml-0.5 opacity-80" />
              </button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              {day.dayName === 'Today' ? 'Today\'s' : `${day.dayName}'s`} Hunting Guide
            </h1>
          </div>

          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {day.verdict}
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'}`}>
              <Sunrise className="w-3.5 h-3.5" /> Sunrise: {day.solunar?.sunrise || '6:30 AM'}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'}`}>
              <Sunset className="w-3.5 h-3.5" /> Sunset: {day.solunar?.sunset || '6:45 PM'}
            </span>
          </div>

          <div className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800/85 text-slate-100' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 shadow-xs'
          }`}>
            <RutPhaseIcon iconName={rutInfo.iconName} className="w-7 h-7 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-extrabold text-[12px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Rut: {rutInfo.name} ({rutInfo.description})
              </div>
              <p className={`mt-1 font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {rutInfo.hunterTip}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Center Column: Interactive Score Graph & Factor Breakdown */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* 24-Hour Deer Movement Score Graph */}
          <div className="order-3">
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><TrendingUp className="w-4 h-4" /> When Deer May Move</span>
                </h3>
                <p className={`text-xs sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  A simple 0–100 guide to when deer may move. Tap a time or use the slider to see what is happening.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500/25 border border-emerald-500 inline-block" />
                  <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Best Window</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-emerald-500 rounded-full inline-block" />
                  <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Movement Score</span>
                </div>
              </div>
            </div>

            <div ref={movementChartScrollRef} className="relative w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto min-w-[550px] select-none">
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartAccent} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={chartAccent} stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="primeWindowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartAccent} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={chartAccent} stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Prime Time Window Highlights */}
                <rect
                  x={paddingX + (5 / 23) * innerWidth}
                  y={paddingTop}
                  width={(4 / 23) * innerWidth}
                  height={innerHeight}
                  fill="url(#primeWindowGrad)"
                  rx="4"
                />
                <rect
                  x={paddingX + (16 / 23) * innerWidth}
                  y={paddingTop}
                  width={(4 / 23) * innerWidth}
                  height={innerHeight}
                  fill="url(#primeWindowGrad)"
                  rx="4"
                />

                {/* Horizontal Grid lines */}
                {[0, 25, 50, 75, 100].map((score) => {
                  const y = chartHeight - paddingBottom - (score / 100) * innerHeight;
                  return (
                    <g key={score}>
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={chartWidth - paddingX}
                        y2={y}
                        stroke={isDark ? '#334155' : '#e2e8f0'}
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text x={paddingX - 8} y={y + 3} fill={isDark ? '#94a3b8' : '#64748b'} fontSize="10" textAnchor="end" className="font-semibold">
                        {score}
                      </text>
                    </g>
                  );
                })}

                {/* Area Fill under score line */}
                <path d={areaD} fill="url(#scoreGrad)" />

                {/* Main Movement Score Line */}
                <path d={pathD} fill="none" stroke={chartAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Interactive Hourly Dots */}
                {points.map((pt, i) => {
                  const isCurrentSelected = selectedHour === i;
                  const isCurrentlyHovered = hoveredHourIdx === i;
                  return (
                    <g
                      key={i}
                      className="cursor-pointer animate-fadeIn"
                      onMouseEnter={() => setHoveredHourIdx(i)}
                      onMouseLeave={() => setHoveredHourIdx(null)}
                      onClick={() => onSelectHour(i)}
                    >
                      {/* Transparent wider tracking rect for hover ease */}
                      <rect
                        x={pt.x - innerWidth / 48}
                        y={paddingTop}
                        width={innerWidth / 24}
                        height={innerHeight}
                        fill="transparent"
                      />

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isCurrentlyHovered || isCurrentSelected ? 6.5 : pt.isPrime ? 4 : 2}
                        fill={isCurrentlyHovered || isCurrentSelected ? '#3b82f6' : pt.isPrime ? chartAccent : '#64748b'}
                        stroke={isDark ? '#0f172a' : '#ffffff'}
                        strokeWidth={isCurrentlyHovered || isCurrentSelected ? 2.5 : 1}
                      />

                      {i % 3 === 0 && (
                        <text x={pt.x} y={chartHeight - 12} fill={isDark ? '#94a3b8' : '#64748b'} fontSize="10" textAnchor="middle" className="font-bold">
                          {pt.hourStr}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Hover line indicator */}
                {activePoint && (
                  <g className="pointer-events-none">
                    <line
                      x1={activePoint.x}
                      y1={paddingTop}
                      x2={activePoint.x}
                      y2={chartHeight - paddingBottom}
                      stroke="#3b82f6"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <circle cx={activePoint.x} cy={activePoint.y} r="8" fill="#3b82f6" stroke="#ffffff" strokeWidth="2.5" />
                  </g>
                )}
              </svg>
            </div>

            {/* Selected Hourly details card directly below graph */}
            {activePoint && (
              <div
                className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn ${
                  isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-500 font-extrabold rounded-lg border border-blue-500/30 text-xs">
                    ⏰ {activePoint.hourStr} Details
                  </span>
                  <div>
                    <div className={`font-black text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <span>Movement: {activePoint.score}/100</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        activePoint.score >= 86 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                        activePoint.score >= 61 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        activePoint.score >= 41 ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' :
                        activePoint.score >= 26 ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                        'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {getRatingFromScore(activePoint.score)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Temp: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{activePoint.h.temp}°{units === 'imperial' ? 'F' : 'C'}</span>
                  </div>
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Wind: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {activePoint.h.windDirectionText} {units === 'metric' ? `${activePoint.h.windSpeedKmh} km/h` : `${activePoint.h.windSpeedMph} mph`}
                    </span>
                  </div>
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Precip: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{activePoint.h.precipProbability}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          </div>

          {/* 24-Hour Precipitation & Barometric Pressure Chart */}
          <div className="order-2">
          <PressureChart
            hourly={day.hourly}
            units={units}
            pressureUnit={pressureUnit}
            theme={theme}
            isDark={isDark}
            hasCustomBackground={hasCustomBackground}
            selectedHour={selectedHour}
            onSelectHour={onSelectHour}
            selectedDayName={day.dayName}
            selectedDateFormatted={day.dateFormatted}
          />
          </div>

          {/* Factor Breakdown Section */}
          <div className="order-1">
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div
              className="flex items-center justify-between cursor-pointer select-none mb-3"
              onClick={() => setShowFactors(!showFactors)}
            >
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><BarChart3 className="w-4 h-4" /> What may get deer moving</span>
                </h3>
                <p className={`text-xs sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Weather, moon, wind, and local details behind this hunt score
                </p>
              </div>

              <button className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                {showFactors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>

            {showFactors && (
              <div className={`space-y-3.5 mt-3 divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {activeFactors.map((factor, idx) => {
                  const isPositive = factor.score > 0;
                  return (
                    <div key={idx} className="pt-3.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{factor.name}</span>
                          <span
                            className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                              factor.status === 'optimal'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                                : factor.status === 'good'
                                ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40'
                                : factor.status === 'poor'
                                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {factor.status === 'optimal' ? 'Best' : factor.status === 'good' ? 'Good' : factor.status === 'poor' ? 'Tough' : 'Normal'}
                          </span>
                        </div>
                        <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{factor.description}</p>
                      </div>

                      <div className="flex-shrink-0 self-end sm:self-center font-extrabold text-right">
                        <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : factor.score < 0 ? 'text-rose-500' : 'text-slate-400'}>
                          {isPositive ? `+${factor.score}` : factor.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Right Column: Scent Compass, Solunar times, and hourly controls */}
        <div className="space-y-6">
          {/* Active Day Scent Vector Label */}
          <div className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 px-3 py-2.5 rounded-2xl border ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="leading-normal">
              Wind & Scent: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted}){selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}</span>
            </span>
          </div>
          
          {/* Scent & Wind Direction Compass */}
          <WindCompass
            deg={currentWindDeg}
            speedMph={hourData ? hourData.windSpeedMph : day.windSpeedMaxMph}
            speedKmh={hourData ? hourData.windSpeedKmh : day.windSpeedMaxKmh}
            directionText={currentWindText}
            units={units}
            theme={theme}
            isDark={isDark}
          hasCustomBackground={hasCustomBackground}
            location={location}
          />

          {/* Quick Metrics Panel */}
          <div
            className={`rounded-2xl p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-4">
              ⏱️ Moon & Best Activity Times
            </h4>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Moon:</span>
                <span className="font-black text-right">{day.solunar?.moonPhaseName} ({Math.round(day.solunar?.moonIllumination || 0)}%)</span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Morning Hunt:</span>
                <span className="font-black text-emerald-500">{day.morningPrime}</span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Evening Hunt:</span>
                <span className="font-black text-amber-500">{day.eveningPrime}</span>
              </div>

              {day.solunar?.major1 && (
                <div className="flex flex-col gap-1 pb-3 border-b border-slate-500/10">
                  <span className="font-semibold text-slate-400">Best Moon Window:</span>
                  <span className="font-bold text-slate-300">{day.solunar.major1}</span>
                </div>
              )}

              {day.solunar?.minor1 && (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-400">Other Moon Window:</span>
                  <span className="font-bold text-slate-400">{day.solunar.minor1}</span>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>

      {/* Rut Phase Modal Breakdown */}
      <RutStatusModal
        isOpen={isRutModalOpen}
        onClose={() => setIsRutModalOpen(false)}
        rutInfo={rutInfo}
        location={location}
        dateFormatted={`${day.dayName}, ${day.dateFormatted}`}
        theme={theme}
        isDark={isDark}
          hasCustomBackground={hasCustomBackground}
      />
    </div>
  );
};
