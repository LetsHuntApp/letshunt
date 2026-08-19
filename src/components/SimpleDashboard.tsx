import React, { useRef, useState } from 'react';
import {
  DailyForecast,
  Location,
  UnitSystem,
  ThemeVariantMode,
  PressureUnit,
  HourlyForecast,
} from '../types';
import { DeerIcon } from './DeerIcon';
import { PressureChart } from './PressureChart';
import { DetailedPredictionView } from './DetailedPredictionView';
import { SimpleWindMap } from './SimpleWindMap';
import {
  getHour12Label,
  getRatingFromScore,
  getWeatherDetails,
  isSignificantColdFront,
  RATING_THRESHOLDS,
} from '../utils/huntingEngine';
import {
  Sun,
  SunMedium,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  Snowflake,
  CloudLightning,
  Moon,
  Wind,
  Sunrise,
  Sunset,
  BarChart3,
  CalendarDays,
  Star,
  ArrowRight,
} from 'lucide-react';

interface SimpleDashboardProps {
  daily: DailyForecast[];
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  lastRefreshed?: Date | null;
  onSwitchToFullDashboard?: () => void;
}

const getWeatherIcon = (iconName: string, className: string) => {
  switch (iconName) {
    case 'Sun':
      return <Sun className={className} />;
    case 'SunMedium':
      return <SunMedium className={className} />;
    case 'CloudSun':
      return <CloudSun className={className} />;
    case 'Cloud':
      return <Cloud className={className} />;
    case 'CloudFog':
      return <CloudFog className={className} />;
    case 'CloudDrizzle':
      return <CloudDrizzle className={className} />;
    case 'CloudRain':
      return <CloudRain className={className} />;
    case 'CloudRainWind':
      return <CloudRainWind className={className} />;
    case 'Snowflake':
      return <Snowflake className={className} />;
    case 'CloudLightning':
      return <CloudLightning className={className} />;
    default:
      return <CloudSun className={className} />;
  }
};

/** Wind direction (deg) to 16-point cardinal text for the hero's downwind hint. */
const getDownwindText = (deg: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
};

/** Score-to-bar color used by the hourly and daily bars. */
const getScoreBarColor = (score: number): string => {
  if (score >= RATING_THRESHOLDS.excellent) return '#2f8f68';
  if (score >= RATING_THRESHOLDS.good) return '#69a86f';
  if (score >= RATING_THRESHOLDS.okay) return '#d9a92c';
  if (score >= RATING_THRESHOLDS.slow) return '#d38a3a';
  return '#c45b53';
};

/** Compact day label used across the simple dashboard cards. */
const dayLabel = (d: DailyForecast) =>
  d.dayName === 'Today' ? 'Today' : d.dayName === 'Tomorrow' ? 'Tmrw' : d.dayName;

/** Day label for the daily bars: "Today" for today, the actual weekday for
    every other day — so Tomorrow renders as "Wed 19" like the rest. */
const getDayBarLabel = (d: DailyForecast): string => {
  if (d.dayName === 'Today') return 'Today';
  const dt = new Date(`${d.date}T00:00:00`);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.dayName;
};

/** Color tone for the daily-bar weather icon, keyed off the WMO code. */
const getWeatherIconTone = (code: number): string => {
  if (code >= 95) return 'text-purple-500';
  if (code >= 80 && code <= 82) return 'text-sky-500';
  if (code >= 71 && code <= 75) return 'text-sky-400';
  if (code >= 51 && code <= 65) return 'text-sky-500';
  if (code === 45 || code === 48) return 'text-slate-400';
  if (code === 0 || code === 1) return 'text-amber-500';
  if (code === 2 || code === 3) return 'text-slate-500';
  return 'text-slate-500';
};

/** True when the day has meaningful wet weather (rain, snow, or storms). */
const isWetDay = (d: DailyForecast): boolean => {
  const c = d.weatherCode;
  const precipitating =
    (c >= 51 && c <= 65) || (c >= 71 && c <= 75) || (c >= 80 && c <= 82) || c >= 95;
  return precipitating || d.precipSumMm > 0 || d.precipSumInches > 0;
};

/** Max chance of precipitation across the day's hourly forecasts. */
const getMaxPrecipProb = (d: DailyForecast): number =>
  d.hourly && d.hourly.length > 0
    ? Math.max(...d.hourly.map((h) => h.precipProbability || 0))
    : 0;

/** Hourly-axis labels, centered under their representative hour bar. */
const HOUR_TICKS: { hour: number; label: string; accent?: boolean }[] = [
  { hour: 0, label: '12 AM' },
  { hour: 3, label: '3 AM' },
  { hour: 6, label: '6 AM', accent: true },
  { hour: 9, label: '9 AM' },
  { hour: 12, label: '12 PM' },
  { hour: 15, label: '3 PM' },
  { hour: 18, label: '6 PM', accent: true },
  { hour: 21, label: '9 PM' },
];

export const SimpleDashboard: React.FC<SimpleDashboardProps> = ({
  daily,
  location,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
}) => {
  // Which day's hourly bars are shown in the "Hourly Hunt Score" card.
  const [activeDayDate, setActiveDayDate] = useState<string>('');
  // Day-detail (factor breakdown) subpage state, opened by "View detailed forecast".
  const [detailDayDate, setDetailDayDate] = useState<string | null>(null);
  const [detailHour, setDetailHour] = useState<number>(() => new Date().getHours());
  // Hero preview hour, driven by the small hourly-card scrubber.
  const [heroHour, setHeroHour] = useState<number>(() => new Date().getHours());

  // Custom scrubber geometry: a 24-cell track mirroring the bar chart so the
  // thumb lines up exactly under the selected hour's bar.
  const hourlySliderRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const setHeroHourFromClientX = (clientX: number) => {
    const el = hourlySliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setHeroHour(Math.max(0, Math.min(23, Math.round(ratio * 24 - 0.5))));
  };

  const today = daily[0];
  const detailDay = daily.find((d) => d.date === detailDayDate) || null;

  // Day detail subpage: reuse the existing detailed prediction view (factor
  // breakdown, pressure/precip chart, and wind/scent plotter all live there).
  if (detailDay) {
    return (
      <DetailedPredictionView
        day={detailDay}
        location={location}
        units={units}
        pressureUnit={pressureUnit}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={hasCustomBackground}
        selectedHour={detailHour}
        onSelectHour={setDetailHour}
        onBack={() => {
          setDetailDayDate(null);
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
      />
    );
  }

  if (!today) return null;

  // The day powering the hourly bar (defaults to today).
  const activeDay = daily.find((d) => d.date === activeDayDate) || today;

  // The 24 bars shared by the bar chart and its aligned scrubber track.
  const hourlyBars = activeDay.hourly.slice(0, 24);

  // Live local clock hour, used to detect the "now" state for the hero.
  const currentLocalHour = new Date().getHours();
  // The hero previews the hour selected by the small hourly-card scrubber.
  const heroHourData: HourlyForecast | null = activeDay.hourly?.[heroHour] ?? activeDay.hourly?.[0] ?? null;
  const isLiveNow = activeDay.date === today.date && heroHour === currentLocalHour;
  const heroScore = heroHourData ? heroHourData.huntScore : activeDay.huntScore;
  const heroRating = getRatingFromScore(heroScore);
  // The hero progress bar uses the exact same scoring shades as the hourly
  // and daily bar graphs, so a score reads the same color everywhere.
  const stroke = getScoreBarColor(heroScore);
  // Muted track behind the score fill (matches the old dial's ring background).
  const trackColor = isDark
    ? theme === 'hunting' ? '#4a3320' : theme === 'olive' ? '#2a3620' : '#1e293b'
    : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#ded8c8' : '#e2e8f0';
  const nowDetails = heroHourData ? getWeatherDetails(heroHourData.weatherCode) : getWeatherDetails(activeDay.weatherCode);
  const nowDesc = heroHourData ? heroHourData.weatherDesc : activeDay.weatherDesc;
  const nowTemp = heroHourData ? heroHourData.temp : activeDay.maxTemp;
  const nowWindText = heroHourData ? heroHourData.windDirectionText : activeDay.windDirectionText;
  const nowWindSpeed = heroHourData
    ? units === 'imperial' ? heroHourData.windSpeedMph : heroHourData.windSpeedKmh
    : units === 'imperial' ? activeDay.windSpeedMaxMph : activeDay.windSpeedMaxKmh;
  const windUnit = units === 'imperial' ? 'mph' : 'km/h';
  const tempUnit = units === 'imperial' ? '°F' : '°C';

  // Shared glass-card surface.
  const cardSurface = isDark
    ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
    : theme === 'hunting'
    ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-xl border-[#d4c4a8] text-[#2a1b0e]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl border-[#d8d2c0] text-[#1e2e1b]'
    : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-xl' : 'bg-white'} border-slate-200 text-slate-900`;

  const accentText = isDark
    ? 'text-emerald-400'
    : theme === 'hunting'
    ? 'text-[#7a3208]'
    : theme === 'olive'
    ? 'text-[#3d4f21]'
    : 'text-emerald-700';

  return (
    <div className="w-full space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Page title — Oswald/display face on the Hunting theme, standard
          sans elsewhere (h1 picks it up automatically). Follows the
          selected day so the header always labels whose data is shown. */}
      <h1 className={`text-2xl sm:text-3xl font-black tracking-tight leading-tight ${
        isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'
      }`}>
        {activeDay.dayName === 'Today' ? "Today's" : `${activeDay.dayName}'s`} Hunt
      </h1>

      {/* 1. Compact hero */}
      <div className={`rounded-3xl border p-3 sm:p-4 shadow-xl relative overflow-hidden ${cardSurface}`}>
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3 relative z-10">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
            isDark ? 'bg-slate-950/60 border-slate-700 text-slate-200'
            : theme === 'hunting' ? 'bg-[#f4eee1]/80 border-[#d4c4a8] text-[#2a1b0e]'
            : theme === 'olive' ? 'bg-[#f7f5ed]/90 border-[#d8d2c0] text-[#1e2e1b]'
            : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <CalendarDays className="w-3 h-3" /> {dayLabel(activeDay)} · {activeDay.dateFormatted}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {isLiveNow ? 'Live conditions' : `${getHour12Label(heroHour)} conditions`}
          </span>
        </div>
        {/* Score progress bar (compact, replaces the dial) */}
        <div className="flex items-center gap-2.5 sm:gap-3 relative z-10 mb-2.5 sm:mb-3">
          <DeerIcon className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" style={{ color: stroke, fill: stroke }} />
          <div
            className="relative flex-1 min-w-0 h-8 sm:h-9 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={heroScore}
            aria-label={`Hunt score ${heroScore} out of 100, rated ${heroRating}`}
          >
            <div className="absolute inset-0" style={{ backgroundColor: trackColor }} />
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out flex items-center justify-end"
              style={{ width: `${heroScore}%`, backgroundColor: stroke }}
            >
              <span className="text-white text-sm sm:text-base font-black leading-none pr-2.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                {heroScore}
              </span>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 leading-none" style={{ color: stroke }}>
            {heroScore >= RATING_THRESHOLDS.excellent && <Star className="w-3 h-3" style={{ color: stroke, fill: stroke }} />}
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">{heroRating}</span>
          </div>
        </div>

        {/* Current conditions grid */}
        <div className="grid grid-cols-2 gap-2 min-w-0 w-full relative z-10">
            {/* Condition + temp */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              {getWeatherIcon(nowDetails.icon, 'w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0')}
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">{isLiveNow ? 'Now' : getHour12Label(heroHour)}</div>
                <div className="text-xs font-black truncate">{nowDesc}</div>
                <div className="text-xs font-extrabold">{nowTemp}{tempUnit}</div>
              </div>
            </div>

            {/* Wind */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              <Wind className="w-6 h-6 sm:w-7 sm:h-7 text-sky-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Wind</div>
                <div className="text-xs font-black truncate">{nowWindText} {nowWindSpeed} {windUnit}</div>
                <div className="text-[10px] font-semibold opacity-60">scent blows {getDownwindText(((heroHourData ? heroHourData.windDirectionDeg : activeDay.windDirectionDeg) + 180) % 360)}</div>
              </div>
            </div>

            {/* Sunrise */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              <Sunrise className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Sunrise</div>
                <div className="text-xs font-black truncate">{activeDay.solunar?.sunrise || '6:30 AM'}</div>
              </div>
            </div>

            {/* Sunset */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              <Sunset className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Sunset</div>
                <div className="text-xs font-black truncate">{activeDay.solunar?.sunset || '6:45 PM'}</div>
              </div>
            </div>
          </div>
      </div>

      {/* 2. Hourly hunt score bar */}
      <div className={`rounded-2xl border p-3 sm:p-4 shadow-md ${cardSurface}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h2 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${accentText}`}>
              <BarChart3 className="w-4 h-4" /> Hourly Hunt Score
            </h2>
            <p className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {activeDay.dayName} · {activeDay.dateFormatted} — tap a bar to preview that hour
            </p>
            <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap mt-1.5">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(90) }} /> Great</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(70) }} /> Good</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(50) }} /> Okay</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(33) }} /> Slow</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(15) }} /> Very Slow</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setDetailHour(new Date().getHours());
              setDetailDayDate(activeDay.date);
              window.scrollTo({ top: 0, behavior: 'auto' });
            }}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 ${
              isDark
                ? 'border-slate-600 text-emerald-300 hover:bg-emerald-500/10 focus-visible:ring-emerald-400'
                : theme === 'hunting'
                ? 'border-[#c85a17]/40 text-[#7a3208] hover:bg-[#c85a17]/10 focus-visible:ring-[#c85a17]'
                : theme === 'olive'
                ? 'border-[#556b2f]/40 text-[#3d4f21] hover:bg-[#556b2f]/10 focus-visible:ring-[#556b2f]'
                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-600'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5" /> View detailed forecast
          </button>
        </div>

        <div className="flex items-end gap-[2px] h-24 sm:h-28">
          {hourlyBars.map((h, i) => {
            const selected = i === heroHour;
            return (
              <div
                key={`${h.time}-${i}`}
                title={`${h.time} · ${h.huntScore}/100 (${getRatingFromScore(h.huntScore)}) — tap to preview this hour`}
                onClick={() => setHeroHour(i)}
                role="button"
                tabIndex={-1}
                aria-label={`${h.time} — hunt score ${h.huntScore}, ${getRatingFromScore(h.huntScore)}. Tap to preview this hour.`}
                className={`flex-1 rounded-t-sm min-w-0 cursor-pointer transition-all ${selected ? 'z-10' : 'hover:brightness-110'}`}
                style={{
                  height: `${Math.max(6, h.huntScore)}%`,
                  backgroundColor: getScoreBarColor(h.huntScore),
                  // Bars always show their true score color; the selected
                  // hour just glows a little brighter than the rest.
                  boxShadow: selected
                    ? `0 0 10px 2px ${getScoreBarColor(h.huntScore)}cc`
                    : 'none',
                }}
              />
            );
          })}
        </div>
        <div className="flex gap-[2px] mt-1.5 leading-none select-none" aria-hidden="true">
          {hourlyBars.map((h, i) => {
            const tick = HOUR_TICKS.find((t) => t.hour === i);
            return (
              <div key={`tick-${h.time}-${i}`} className="flex-1 min-w-0 relative h-3">
                {tick && (
                  <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black ${tick.accent ? accentText : 'text-slate-400'}`}>
                    {tick.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Minimal hour scrubber — previews the hero dial, wind, and conditions. */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`shrink-0 whitespace-nowrap leading-none text-[10px] font-black uppercase tracking-wider ${isLiveNow ? accentText : isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {isLiveNow ? 'Now' : getHour12Label(heroHour)}
            </span>
            {!isLiveNow && (
              <button
                type="button"
                onClick={() => {
                  // "Back to Now" also returns to today when another day's
                  // bars are being previewed.
                  setHeroHour(currentLocalHour);
                  setActiveDayDate('');
                }}
                className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                  isDark ? 'text-amber-400 border-amber-500/40 hover:bg-amber-500/10' : 'text-amber-600 border-amber-500/40 hover:bg-amber-500/10'
                }`}
              >
                Back to Now
              </button>
            )}
          </div>

          {/* Slider track: thin sectional rail with the same 24-column flex
              geometry as the bars above, so the drag pointer sits exactly
              under the selected hour's bar. Fills up to the selected hour
              like a normal slider; the rounded pointer marks the position. */}
          <div
            ref={hourlySliderRef}
            role="slider"
            tabIndex={0}
            aria-label="Hourly hunt score slider"
            aria-valuemin={0}
            aria-valuemax={23}
            aria-valuenow={heroHour}
            onPointerDown={(e) => {
              isScrubbingRef.current = true;
              setHeroHourFromClientX(e.clientX);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (isScrubbingRef.current) setHeroHourFromClientX(e.clientX);
            }}
            onPointerUp={() => { isScrubbingRef.current = false; }}
            onPointerCancel={() => { isScrubbingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { setHeroHour((h) => Math.max(0, h - 1)); e.preventDefault(); }
              else if (e.key === 'ArrowRight') { setHeroHour((h) => Math.min(23, h + 1)); e.preventDefault(); }
              else if (e.key === 'Home') { setHeroHour(0); e.preventDefault(); }
              else if (e.key === 'End') { setHeroHour(23); e.preventDefault(); }
            }}
            className="relative h-7 cursor-pointer select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full"
          >
            <div className="flex h-full items-center gap-[2px]">
              {hourlyBars.map((h, i) => {
                const selected = i === heroHour;
                const filled = i <= heroHour;
                return (
                  <div
                    key={`${h.time}-${i}`}
                    className={`relative flex-1 h-1.5 rounded-full transition-colors ${
                      filled
                        ? (isDark ? 'bg-emerald-400/80' : theme === 'hunting' ? 'bg-[#c85a17]/80' : theme === 'olive' ? 'bg-[#556b2f]/80' : 'bg-emerald-600/80')
                        : (isDark ? 'bg-slate-700/40' : theme === 'hunting' ? 'bg-[#d4c4a8]/40' : theme === 'olive' ? 'bg-[#d8d2c0]/50' : 'bg-slate-200')
                    }`}
                  >
                    {selected && (
                      <span
                        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-md ring-2 ${
                          isDark ? 'ring-emerald-400' : theme === 'hunting' ? 'ring-[#c85a17]' : theme === 'olive' ? 'ring-[#556b2f]' : 'ring-emerald-600'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Daily hunt score bar */}
      <div className={`rounded-2xl border p-3 sm:p-4 shadow-md ${cardSurface}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h2 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${accentText}`}>
              <CalendarDays className="w-4 h-4" /> Daily Hunt Score
            </h2>
            <p className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Tap a bar to see its hourly hunt score
            </p>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex items-start gap-1 sm:gap-1.5 min-w-[560px]">
            {daily.map((d) => {
              const isSelected = d.date === (activeDayDate || today.date);
              const wet = isWetDay(d);
              const maxPrecipProb = getMaxPrecipProb(d);
              const precipAmount = units === 'imperial'
                ? `${(d.precipSumInches || 0).toFixed(2)} in`
                : `${(d.precipSumMm || 0).toFixed(1)} mm`;
              const coldFront = isSignificantColdFront(d.tempDrop24h, units);
              const coldFrontDrop = Math.round((d.tempDrop24h || 0) * 10) / 10;
              const hasMoonBadge = d.solunar?.moonPhaseName === 'Full Moon';
              // Day-of-month for the bar label, e.g. "Fri 13".
              const dayNum = parseInt(d.date.split('-')[2], 10);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setActiveDayDate((prev) => (prev === d.date ? '' : d.date));
                    setHeroHour(new Date().getHours());
                  }}
                  title={`${d.dayName} ${d.dateFormatted} · ${d.huntScore}/100 (${d.rating})`}
                  className={`group flex-1 min-w-[80px] flex flex-col items-center rounded-lg transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected ? (isDark ? 'bg-slate-800/60' : 'bg-slate-100') : 'hover:bg-slate-500/5'
                  }`}
                >
                  <div className="relative w-full h-24 sm:h-28 flex items-end justify-center">
                    {hasMoonBadge && (
                      <div
                        className={`absolute top-0.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wide whitespace-nowrap shadow-sm border ${
                          isDark
                            ? 'bg-slate-950/85 text-amber-300 border-amber-400/40'
                            : 'bg-white/95 text-amber-600 border-amber-400/60'
                        }`}
                      >
                        <Moon className="w-2.5 h-2.5 shrink-0 fill-current" />
                        Full Moon
                      </div>
                    )}
                    {coldFront && (
                      <div
                        title={`Significant 24-hour temperature drop: ${coldFrontDrop}°${units === 'imperial' ? 'F' : 'C'}`}
                        className={`absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wide whitespace-nowrap shadow-sm border ${
                          hasMoonBadge ? 'top-[21px]' : 'top-0.5'
                        } ${
                          isDark
                            ? 'bg-slate-950/85 text-sky-300 border-sky-400/50'
                            : 'bg-white/95 text-sky-600 border-sky-400/60'
                        }`}
                      >
                        <Snowflake className="w-2.5 h-2.5 shrink-0" />
                        Cold Front!
                      </div>
                    )}
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-sm flex items-start justify-center overflow-hidden"
                      style={{
                        // Tall enough to always fit the deer icon + score.
                        height: `${Math.max(50, d.huntScore)}%`,
                        backgroundColor: getScoreBarColor(d.huntScore),
                      }}
                    >
                      <div className="flex flex-col items-center gap-[2px] mt-1 leading-none">
                        {d.huntScore >= RATING_THRESHOLDS.excellent && (
                          <Star className="w-3 h-3 text-white fill-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                        )}
                        <DeerIcon className="w-5 h-5 shrink-0 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                        <span className="text-xl font-black text-white leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                          {d.huntScore}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center w-full mt-1.5 h-14">
                    <div className="flex items-center justify-center gap-0.5 h-6 leading-none">
                      {getWeatherIcon(d.weatherIcon, `w-6 h-6 shrink-0 ${getWeatherIconTone(d.weatherCode)}`)}
                      {wet && (
                        <span className={`text-[8px] font-black leading-none ${isDark ? 'text-sky-400' : 'text-sky-500'}`}>
                          {maxPrecipProb}%
                        </span>
                      )}
                    </div>
                    <div className="h-3.5 flex items-center justify-center">
                      {wet && (
                        <span className={`text-[8px] font-bold leading-none whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {precipAmount}
                        </span>
                      )}
                    </div>
                    <span className="mt-auto text-xs font-bold leading-none whitespace-nowrap opacity-70 group-hover:opacity-100">
                      {getDayBarLabel(d)} <span className="opacity-60">{dayNum}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Selected day pressure + precipitation */}
      <PressureChart
        hourly={activeDay.hourly}
        units={units}
        pressureUnit={pressureUnit}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={hasCustomBackground}
        selectedHour={heroHour}
        onSelectHour={setHeroHour}
        selectedDayName={activeDay.dayName}
        selectedDateFormatted={activeDay.dateFormatted}
      />

      {/* 5. Satellite wind map with scent cone, following the selected day + hour */}
      {/* The map's own slider controls only the map hour; the hero, hourly
          bars, and pressure chart keep following the hourly-card slider. */}
      <SimpleWindMap
        location={location}
        hourly={activeDay.hourly}
        units={units}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={hasCustomBackground}
        selectedDayName={dayLabel(activeDay)}
        selectedDateFormatted={activeDay.dateFormatted}
      />
    </div>
  );
};
