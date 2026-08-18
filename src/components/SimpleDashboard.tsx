import React, { useState } from 'react';
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
  getRatingFromScore,
  getWeatherDetails,
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
  Wind,
  Sunrise,
  Sunset,
  LayoutDashboard,
  BarChart3,
  CalendarDays,
  MapPin,
  Star,
  RefreshCw,
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

/** Theme-aware hunt-score stroke color, matching the existing dashboard dials. */
const getScoreStroke = (score: number, theme: ThemeVariantMode, isDark: boolean): string => {
  if (theme === 'hunting') {
    if (score >= RATING_THRESHOLDS.excellent) return '#556b2f';
    if (score >= RATING_THRESHOLDS.good) return '#556b2f';
    if (score >= RATING_THRESHOLDS.fair) return isDark ? '#d08a4d' : '#c85a17';
    return isDark ? '#c5675c' : '#8b3a3a';
  }
  if (theme === 'olive') {
    if (score >= RATING_THRESHOLDS.excellent) return isDark ? '#9aae71' : '#2d4a27';
    if (score >= RATING_THRESHOLDS.good) return isDark ? '#7f984e' : '#556b2f';
    if (score >= RATING_THRESHOLDS.fair) return isDark ? '#c18a4d' : '#b87333';
    return isDark ? '#c05a52' : '#8b3a3a';
  }
  if (isDark) {
    if (score >= RATING_THRESHOLDS.excellent) return '#34d399';
    if (score >= RATING_THRESHOLDS.good) return '#10b981';
    if (score >= RATING_THRESHOLDS.fair) return '#d97706';
    return '#f43f5e';
  }
  if (score >= RATING_THRESHOLDS.excellent) return '#047857';
  if (score >= RATING_THRESHOLDS.good) return '#059669';
  if (score >= RATING_THRESHOLDS.fair) return '#d97706';
  return '#f43f5e';
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
  if (score >= RATING_THRESHOLDS.fair) return '#d38a3a';
  return '#c45b53';
};

export const SimpleDashboard: React.FC<SimpleDashboardProps> = ({
  daily,
  location,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  lastRefreshed,
  onSwitchToFullDashboard,
}) => {
  // Which day's hourly bars are shown in the "Hourly Hunt Score" card.
  const [activeDayDate, setActiveDayDate] = useState<string>('');
  // Day-detail (factor breakdown) subpage state, opened by "View detailed forecast".
  const [detailDayDate, setDetailDayDate] = useState<string | null>(null);
  const [detailHour, setDetailHour] = useState<number>(() => new Date().getHours());
  // Wind-map slider state (independent from the removed global hourly slider).
  const [windHour, setWindHour] = useState<number>(() => new Date().getHours());

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

  // Current hour (hero + dial) uses the live local clock hour for "now".
  const currentLocalHour = new Date().getHours();
  const nowHour: HourlyForecast | null = today.hourly?.[currentLocalHour] ?? today.hourly?.[0] ?? null;
  const heroScore = nowHour ? nowHour.huntScore : today.huntScore;
  const heroRating = getRatingFromScore(heroScore);
  const stroke = getScoreStroke(heroScore, theme as ThemeVariantMode, isDark);
  const nowDetails = nowHour ? getWeatherDetails(nowHour.weatherCode) : getWeatherDetails(today.weatherCode);
  const nowDesc = nowHour ? nowHour.weatherDesc : today.weatherDesc;
  const nowTemp = nowHour ? nowHour.temp : today.maxTemp;
  const nowWindText = nowHour ? nowHour.windDirectionText : today.windDirectionText;
  const nowWindSpeed = nowHour
    ? units === 'imperial' ? nowHour.windSpeedMph : nowHour.windSpeedKmh
    : units === 'imperial' ? today.windSpeedMaxMph : today.windSpeedMaxKmh;
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

  const dayLabel = (d: DailyForecast) =>
    d.dayName === 'Today' ? 'Today' : d.dayName === 'Tomorrow' ? 'Tmrw' : d.dayName;

  return (
    <div className="w-full space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Compact header strip */}
      <div className={`rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-lg ${cardSurface}`}>
        <div className="min-w-0 flex items-center gap-2">
          <LayoutDashboard className={`w-4 h-4 shrink-0 ${accentText}`} />
          <div className="min-w-0">
            <div className="text-sm font-black leading-tight flex items-center gap-1.5">
              Simple Dashboard
              <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold opacity-70`}>
                <MapPin className="w-3 h-3" /> {location.name}
              </span>
            </div>
            <div className="text-[11px] font-semibold opacity-70 flex items-center gap-1">
              {location.name} · {today.dayName} {today.dateFormatted}
              {lastRefreshed && (
                <>
                  <span className="opacity-50">·</span>
                  <RefreshCw className="w-2.5 h-2.5" />
                  {lastRefreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </>
              )}
            </div>
          </div>
        </div>
        {onSwitchToFullDashboard && (
          <button
            type="button"
            onClick={onSwitchToFullDashboard}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 ${
              isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800 focus-visible:ring-emerald-400'
                : theme === 'hunting'
                ? 'border-[#c85a17]/40 text-[#7a3208] hover:bg-[#c85a17]/10 focus-visible:ring-[#c85a17]'
                : theme === 'olive'
                ? 'border-[#556b2f]/40 text-[#3d4f21] hover:bg-[#556b2f]/10 focus-visible:ring-[#556b2f]'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 focus-visible:ring-emerald-600'
            }`}
          >
            Full Dashboard
          </button>
        )}
      </div>

      {/* 1. Compact hero */}
      <div className={`rounded-3xl border p-3 sm:p-4 shadow-xl relative overflow-hidden ${cardSurface}`}>
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-3 sm:gap-5 relative z-10">
          {/* Score dial */}
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 100 100" role="img" aria-label={`Hunt score ${heroScore} out of 100, rated ${heroRating}`}>
              <circle
                cx="50" cy="50" r="40" fill="transparent"
                stroke={isDark ? (theme === 'hunting' ? '#4a3320' : theme === 'olive' ? '#2a3620' : '#1e293b') : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#ded8c8' : '#e2e8f0'}
                strokeWidth="9"
              />
              <circle
                cx="50" cy="50" r="40" fill="transparent"
                stroke={stroke}
                strokeWidth="9"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - heroScore / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-out"
              />
            </svg>
            <div className="score-dial-content text-center z-10 flex flex-col items-center justify-center">
              <DeerIcon className="w-7 h-7 -mb-0.5" style={{ color: stroke, fill: stroke }} />
              <div className="text-2xl sm:text-3xl font-black tracking-tight leading-none" style={{ color: stroke }}>
                {heroScore}
              </div>
              <div className="text-[11px] font-black uppercase tracking-wider leading-tight mt-0.5 flex items-center justify-center gap-1" style={{ color: stroke }}>
                {heroScore >= RATING_THRESHOLDS.excellent && <Star className="w-3 h-3" style={{ color: stroke, fill: stroke }} />}
                <span>{heroRating}</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest opacity-80" style={{ color: stroke }}>
                HUNT SCORE
              </div>
            </div>
          </div>

          {/* Current conditions grid */}
          <div className="flex-1 grid grid-cols-2 gap-2 min-w-0 w-full">
            {/* Condition + temp */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              {getWeatherIcon(nowDetails.icon, 'w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0')}
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Now</div>
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
                <div className="text-[10px] font-semibold opacity-60">scent blows {getDownwindText(((nowHour ? nowHour.windDirectionDeg : today.windDirectionDeg) + 180) % 360)}</div>
              </div>
            </div>

            {/* Sunrise */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              <Sunrise className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Sunrise</div>
                <div className="text-xs font-black truncate">{today.solunar?.sunrise || '6:30 AM'}</div>
              </div>
            </div>

            {/* Sunset */}
            <div className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-2 min-w-0 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/70' : theme === 'hunting' ? 'bg-[#f4eee1]/70 border-[#d4c4a8]' : theme === 'olive' ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]' : 'bg-slate-50 border-slate-200'
            }`}>
              <Sunset className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Sunset</div>
                <div className="text-xs font-black truncate">{today.solunar?.sunset || '6:45 PM'}</div>
              </div>
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
              {activeDay.dayName} · {activeDay.dateFormatted} — movement by hour
            </p>
            <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap mt-1.5">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(90) }} /> Great</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(80) }} /> Good</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(60) }} /> Fair</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(30) }} /> Poor</span>
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

        <div className="flex items-end gap-[2px] h-24 sm:h-28" aria-hidden="true">
          {activeDay.hourly.slice(0, 24).map((h, i) => (
            <div
              key={`${h.time}-${i}`}
              title={`${h.time} · ${h.huntScore}/100 (${getRatingFromScore(h.huntScore)})`}
              className="flex-1 rounded-t-sm min-w-0 transition-opacity hover:opacity-80"
              style={{ height: `${Math.max(6, h.huntScore)}%`, backgroundColor: getScoreBarColor(h.huntScore) }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-black text-slate-400 mt-1.5 leading-none select-none">
          <span>12 AM</span>
          <span>3 AM</span>
          <span className={accentText}>6 AM</span>
          <span>9 AM</span>
          <span>12 PM</span>
          <span>3 PM</span>
          <span className={accentText}>6 PM</span>
          <span>9 PM</span>
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
          <div className="flex items-stretch gap-1.5 sm:gap-2 h-24 sm:h-28 min-w-[560px]">
            {daily.map((d) => {
              const isSelected = d.date === (activeDayDate || today.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setActiveDayDate((prev) => (prev === d.date ? '' : d.date))}
                  title={`${d.dayName} ${d.dateFormatted} · ${d.huntScore}/100 (${d.rating})`}
                  className={`group flex-1 h-full flex flex-col items-center min-w-0 rounded-lg px-0.5 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected ? (isDark ? 'bg-slate-800/60' : 'bg-slate-100') : 'hover:bg-slate-500/5'
                  }`}
                >
                  <div className="relative flex-1 w-full flex items-end justify-center">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-sm flex items-start justify-center overflow-hidden"
                      style={{
                        height: `${Math.max(16, d.huntScore)}%`,
                        backgroundColor: getScoreBarColor(d.huntScore),
                        boxShadow: isSelected ? `0 0 0 2px ${stroke}` : undefined,
                      }}
                    >
                      <span className="text-[10px] font-black leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] mt-1">
                        {d.huntScore}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold leading-none whitespace-nowrap opacity-70 group-hover:opacity-100 mt-1 mb-0.5">
                    {dayLabel(d)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Current day pressure + precipitation */}
      <PressureChart
        hourly={today.hourly}
        units={units}
        pressureUnit={pressureUnit}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={hasCustomBackground}
        selectedHour={windHour}
        onSelectHour={setWindHour}
        selectedDayName={today.dayName}
        selectedDateFormatted={today.dateFormatted}
      />

      {/* 5. Satellite wind map with scent cone + hourly slider */}
      <SimpleWindMap
        location={location}
        hourly={today.hourly}
        units={units}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={hasCustomBackground}
        selectedHour={windHour}
        onSelectHour={setWindHour}
      />
    </div>
  );
};
