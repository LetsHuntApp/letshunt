import React, { useState } from 'react';
import { DailyForecast, Location, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { WindCompass } from './WindCompass';
import { PressureChart } from './PressureChart';
import { DeerIcon } from './DeerIcon';
import { RutStatusModal } from './RutStatusModal';
import { RutPhaseIcon } from './RutPhaseIcon';
import { PaperTexture } from './PaperTexture';
import { getHour12Label, getRatingFromScore, getWeatherDetails, getBestHuntTime, calculateHuntScore, getBestStandForWind, getDetailedConditionExplanation } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import {
  Sunrise,
  Sunset,
  ChevronDown,
  ChevronUp,
  Moon,
  Clock,
  Compass,
  Gauge,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  Wind,
  Droplets,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning,
  Info,
  Calendar,
  Star,
  Undo2,
  Crosshair,
  MapPin,
  BarChart3,
} from 'lucide-react';

interface DayDetailViewProps {
  day: DailyForecast;
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  forecastCards?: React.ReactNode;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
  isToday?: boolean;
  onResetToToday?: () => void;
  onSelectLocation?: (loc: Location) => void;
  hasCustomBackground?: boolean;
}

const getWeatherIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'Sun':
    case 'SunMedium':
      return <Sun className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'CloudSun':
      return <CloudSun className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case 'Cloud':
      return <Cloud className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    case 'CloudFog':
      return <CloudFog className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    case 'CloudDrizzle':
      return <CloudDrizzle className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'CloudRain':
    case 'CloudRainWind':
      return <CloudRain className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    case 'Snowflake':
      return <Snowflake className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    case 'CloudLightning':
      return <CloudLightning className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    default:
      return <Cloud className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  }
};

export const DayDetailView: React.FC<DayDetailViewProps> = ({
  day,
  location,
  units,
  pressureUnit,
  theme,
  forecastCards,
  selectedHour,
  onSelectHour,
  isToday = true,
  onResetToToday,
  onSelectLocation,
  hasCustomBackground = false,
}) => {
  const [showFactors, setShowFactors] = useState(true);
  const [isRutModalOpen, setIsRutModalOpen] = useState(false);
  const [showWeatherExplanation, setShowWeatherExplanation] = useState(false);

  const isDark = theme === 'dark';
  const rutInfo = getRutPhase(day.date, location);

  const hourData = selectedHour !== undefined && day.hourly && day.hourly[selectedHour] ? day.hourly[selectedHour] : null;
  const currentScore = hourData ? hourData.huntScore : day.huntScore;
  const currentRating = hourData ? getRatingFromScore(hourData.huntScore) : day.rating;
  const currentIconName = hourData ? getWeatherDetails(hourData.weatherCode).icon : day.weatherIcon;
  const currentWindDeg = hourData ? hourData.windDirectionDeg : day.windDirectionDeg;
  const currentWindSpeed = hourData ? hourData.windSpeedMph : day.windSpeedMaxMph;
  const currentWindText = hourData ? hourData.windDirectionText : day.windDirectionText;

  const condExplanation = getDetailedConditionExplanation(day, hourData, units, pressureUnit);

  const isExcellentDay = currentScore >= 90;
  const isGoodDay = currentScore >= 76 && currentScore < 90;
  const isModerateDay = currentScore >= 46 && currentScore < 76;
  const isPoorDay = currentScore < 46;

  const activeFactors = React.useMemo(() => {
    if (selectedHour !== undefined && day.hourly && day.hourly[selectedHour]) {
      const h = day.hourly[selectedHour];
      return calculateHuntScore({
        tempDrop24h: h.tempDrop24h !== undefined ? h.tempDrop24h : day.tempDrop24h,
        maxTempF: h.temp,
        minTempF: day.minTemp,
        pressureInHg: h.pressureInHg,
        pressureTrend: day.pressureTrend,
        windMph: h.windSpeedMph,
        weatherCode: h.weatherCode,
        isPostStorm: day.isPostStorm,
        solunar: day.solunar,
        hour: selectedHour,
        isPrimeWindow: h.isPrimeWindow,
        units,
        pressureUnit,
        dateStr: day.date,
        location,
      }).factors;
    }
    return day.factors;
  }, [selectedHour, day, units, pressureUnit, location]);

  const scoreStrokeColor =
    theme === 'hunting'
      ? (currentScore >= 90 ? '#1a6b3c' : currentScore >= 76 ? '#4a8c5e' : currentScore >= 46 ? '#c85a17' : '#8b3a3a')
      : (theme === 'olive' || theme === 'hunting')
      ? (currentScore >= 90 ? '#2d4a27' : currentScore >= 76 ? '#556b2f' : currentScore >= 46 ? '#b87333' : '#8b3a3a')
      : theme === 'backwoods'
      ? (currentScore >= 90 ? '#2f4a1f' : currentScore >= 76 ? '#3d5a2a' : currentScore >= 46 ? '#c44a17' : '#8a3424')
      : currentScore >= 90
      ? (isDark ? '#34d399' : '#047857') // emerald-400 (Vibrant Green) vs emerald-700 (Pine Forest Green)
      : currentScore >= 76
      ? (isDark ? '#10b981' : '#059669') // emerald-500 (Sage Green) vs emerald-600
      : currentScore >= 46
      ? '#d97706' // amber-600 (Warm Amber)
      : '#f43f5e'; // rose-500 (Terracotta)

  const scoreTextColor =
    theme === 'hunting'
      ? (currentScore >= 90 ? 'text-[#1a6b3c]' : currentScore >= 76 ? 'text-[#4a8c5e]' : currentScore >= 46 ? 'text-[#c85a17]' : 'text-[#8b3a3a]')
      : (theme === 'olive' || theme === 'hunting')
      ? 'text-[#1e2e1b]'
      : theme === 'backwoods'
      ? (currentScore >= 90 ? 'text-[#2f4a1f]' : currentScore >= 76 ? 'text-[#3d5a2a]' : currentScore >= 46 ? 'text-[#c44a17]' : 'text-[#8a3424]')
      : currentScore >= 90
      ? 'text-emerald-800 dark:text-emerald-400'
      : currentScore >= 76
      ? 'text-emerald-600 dark:text-emerald-400'
      : currentScore >= 46
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="w-full space-y-3 sm:space-y-4 animate-fadeIn">
      {/* Hero Overview Header Card */}
      <div
        className={`rounded-3xl p-3 sm:p-4 border shadow-xl relative overflow-hidden transition-colors backdrop-blur-xl ${
          theme === 'hunting'
            ? 'bg-gradient-to-br from-[#f4eee1]/[var(--card-opacity)] via-[#eae1cf]/[var(--card-opacity)] to-[#e0d6c0]/[var(--card-opacity)] border-2 border-[#c85a17]/40 text-[#2a1b0e] shadow-lg ring-1 ring-[#c85a17]/20'
            : (theme === 'olive' || theme === 'hunting')
            ? 'bg-gradient-to-br from-[#f7f5ed]/[var(--card-opacity)] via-[#efebd9]/[var(--card-opacity)] to-[#e8e4d5]/[var(--card-opacity)] border-2 border-[#556b2f]/40 text-[#1e2e1b] shadow-lg ring-1 ring-[#556b2f]/20'
            : isExcellentDay
            ? isDark
              ? 'bg-gradient-to-br from-emerald-950/50 via-slate-900/[var(--card-opacity)] to-slate-950/[var(--card-opacity)] border-emerald-600/50 text-slate-100'
              : 'bg-gradient-to-br from-emerald-50/95 via-white/[var(--card-opacity)] to-emerald-50/45 border-emerald-300 text-slate-900 shadow-sm'
            : isGoodDay
            ? isDark
              ? 'bg-gradient-to-br from-emerald-950/30 via-slate-900/[var(--card-opacity)] to-slate-950/[var(--card-opacity)] border-emerald-500/35 text-slate-100'
              : 'bg-gradient-to-br from-emerald-50/80 via-white/[var(--card-opacity)] to-emerald-50/30 border-emerald-200 text-slate-900 shadow-sm'
            : isModerateDay
            ? isDark
              ? 'bg-gradient-to-br from-amber-950/40 via-slate-900/[var(--card-opacity)] to-slate-950/[var(--card-opacity)] border-amber-500/40 text-slate-100'
              : 'bg-gradient-to-br from-amber-50/80 via-white/[var(--card-opacity)] to-amber-50/50 border-amber-200 text-slate-900 shadow-sm'
            : isDark
            ? 'bg-gradient-to-br from-rose-950/40 via-slate-900/[var(--card-opacity)] to-slate-950/[var(--card-opacity)] border-rose-500/40 text-slate-100'
            : 'bg-gradient-to-br from-rose-50/80 via-white/[var(--card-opacity)] to-rose-50/50 border-rose-200 text-slate-900 shadow-sm'
        }`}
      >
        {/* Glow backdrop */}
        <div
          className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
            theme === 'hunting'
              ? 'bg-[#c85a17]/15'
              : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#556b2f]/15'
              : isExcellentDay
              ? 'bg-emerald-700/10'
              : isGoodDay
              ? 'bg-emerald-500/10'
              : isModerateDay
              ? 'bg-amber-500/10'
              : 'bg-rose-500/10'
          }`}
        />

        {/* Backwoods-only: ink wash + topographic fragment in the upper
            right of the hero card so the field-guide vibe carries into the
            most prominent surface of the app. */}
        {theme === 'backwoods' && (
          <>
            <PaperTexture
              variant="wash"
              opacity={0.18}
              blendMode="multiply"
              tone="#5a3a1f"
              className="absolute -top-4 -right-6 w-56 h-28"
            />
            <PaperTexture
              variant="leaflet"
              opacity={0.28}
              blendMode="multiply"
              tone="#5a3a1f"
              className="absolute bottom-3 right-4 w-40 h-28"
            />
          </>
        )}

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4 relative z-10">
          {/* Left: Score Dial, Date, Badges & Verdict */}
          <div className="flex flex-col items-center sm:items-start gap-2 w-full lg:w-auto">
            <div className="flex flex-row items-center justify-center gap-3 sm:gap-5 flex-shrink-0 self-center sm:self-auto">
              {/* Circular Gauge Score */}
              <div className={`relative flex items-center justify-center shrink-0 transition-all ${
                theme === 'hunting'
                  ? 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-[#eae1cf] border-2 border-[#c85a17] shadow-xl ring-4 ring-[#c85a17]/25'
                  : (theme === 'olive' || theme === 'hunting')
                  ? 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-[#f2efe4] border-2 border-[#556b2f] shadow-xl ring-4 ring-[#556b2f]/25'
                  : 'w-32 h-32 sm:w-36 sm:h-36'
              }`}>
                {/* SVG Circle Track */}
                <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={isDark ? '#1e293b' : theme === 'hunting' ? '#d4c4a8' : (theme === 'olive' || theme === 'hunting') ? '#ded8c8' : '#e2e8f0'}
                    strokeWidth="8"
                  />
                  {/* Colored Indicator */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={scoreStrokeColor}
                    strokeWidth={theme === 'hunting' ? "10" : (theme === 'olive' || theme === 'hunting') ? "10" : "8"}
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - currentScore / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-300 ease-out"
                  />
                </svg>
                <div className="text-center z-10 flex flex-col items-center justify-center">
                  <DeerIcon 
                    className={`w-9 h-9 sm:w-11 sm:h-11 fill-current ${scoreTextColor} -mb-0.5`} 
                    style={{ color: isDark || theme === 'hunting' || (theme === 'olive' || theme === 'hunting') || theme === 'backwoods' ? scoreStrokeColor : undefined }}
                  />
                  <div className={`font-black tracking-tight leading-none ${theme === 'hunting' ? 'text-3xl sm:text-4xl text-[#2a1b0e]' : (theme === 'olive' || theme === 'hunting') ? 'text-3xl sm:text-4xl text-[#1e2e1b]' : 'text-2xl sm:text-3xl'}`}>
                    {currentScore}
                  </div>
                  <div 
                    className={`text-[10px] sm:text-xs font-black uppercase tracking-wider leading-tight mt-0.5 flex items-center justify-center gap-1 ${
                      theme === 'hunting' ? 'text-[#2a1b0e]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#2d4a27]' : scoreTextColor
                    }`}
                    style={{ color: isDark || theme === 'hunting' || (theme === 'olive' || theme === 'hunting') || theme === 'backwoods' ? scoreStrokeColor : undefined }}
                  >
                    {isExcellentDay && <Star className="w-3 h-3 fill-current text-amber-500 dark:text-amber-400" />}
                    <span>{getRatingFromScore(currentScore)}</span>
                  </div>
                  <div className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${theme === 'hunting' ? 'text-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : isDark ? 'text-slate-400' : 'text-slate-500'} -mt-0.5 opacity-90`}>
                    SCORE
                  </div>
                </div>
              </div>

              {/* Smaller Wind Dial */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
                <div
                  className={`absolute inset-0 rounded-full border shadow-sm flex items-center justify-center ${
                    isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white/80'
                  }`}
                >
                  {/* Cardinal Labels */}
                  <span className={`absolute top-1 text-[9px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>N</span>
                  <span className={`absolute right-1.5 text-[9px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>E</span>
                  <span className={`absolute bottom-1 text-[9px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>S</span>
                  <span className={`absolute left-1.5 text-[9px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>W</span>

                  {/* Tick Marks */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((tick) => (
                    <div
                      key={tick}
                      className={`absolute w-0.5 h-1 ${isDark ? 'bg-slate-800/80' : 'bg-slate-200'}`}
                      style={{
                        transform: `rotate(${tick}deg) translateY(-${isDark ? 42 : 46}px)`,
                      }}
                    />
                  ))}
                  
                  {/* Central Text displaying Wind Speed and Direction */}
                  <div className="text-center z-10 flex flex-col items-center justify-center">
                    <span className="text-xs sm:text-sm font-black tracking-tighter leading-none text-amber-500">
                      {units === 'metric'
                        ? `${hourData ? Math.round(hourData.windSpeedKmh ?? hourData.windSpeedMph * 1.60934) : Math.round(day.windSpeedMaxKmh ?? day.windSpeedMaxMph * 1.60934)}`
                        : `${Math.round(hourData ? hourData.windSpeedMph : day.windSpeedMaxMph)}`
                      }
                    </span>
                    <span className={`text-[8px] sm:text-[9px] font-bold opacity-80 uppercase leading-none mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {units === 'metric' ? 'km/h' : 'mph'}
                    </span>
                    <span className="text-[10px] sm:text-xs font-black tracking-tight leading-none text-emerald-500 mt-1">
                      {currentWindText}
                    </span>
                  </div>

                  {/* Wind Direction Arrow */}
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${currentWindDeg}deg)` }}
                  >
                    <div className="flex flex-col items-center -translate-y-[34px] sm:-translate-y-[40px]">
                      <div className="w-0.5 h-4 bg-amber-500 rounded-full shadow-xs" />
                      <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[7px] border-t-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Date Display: ALWAYS directly below the score dial / dials, and ALWAYS above the pill style badges */}
            <div className={`text-xs sm:text-[13px] font-black uppercase tracking-wider flex items-center gap-1.5 self-center sm:self-auto ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{day.dayName}, {day.dateFormatted}</span>
              {selectedHour !== undefined && (
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/10 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-lg border border-emerald-500/35">
                  @ {getHour12Label(selectedHour)}
                </span>
              )}
            </div>

            {/* Pill style badges */}
            <div className="flex flex-col items-center sm:items-start gap-1.5 w-full">
              {/* Top Row Badges */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 w-full">
                <span
                  className={`px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-black uppercase tracking-wider border flex items-center gap-1 ${
                    isExcellentDay
                      ? 'bg-emerald-800 text-white border-emerald-600'
                      : isGoodDay
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : isModerateDay
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-rose-500 text-white border-rose-400'
                  }`}
                >
                  {isExcellentDay && <Star className="w-3 h-3 fill-current text-amber-300" />}
                  <span>{currentRating} Hunt Forecast</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsRutModalOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-black uppercase tracking-wider border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-xs ring-2 ring-transparent hover:ring-amber-500/40 ${rutInfo.badgeStyle}`}
                  title="Click for Rut Phase Breakdown & Hunter Tips"
                >
                  <RutPhaseIcon iconName={rutInfo.iconName} className="w-4 h-4 flex-shrink-0" />
                  <span>{rutInfo.name}</span>
                  <Info className="w-3.5 h-3.5 opacity-80 shrink-0" />
                </button>
                {!isToday && onResetToToday && (
                  <button
                    onClick={onResetToToday}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-xs border ring-2 cursor-pointer ${
                      theme === 'hunting'
                        ? 'bg-[#c85a17] hover:bg-[#b34e12] active:bg-[#a34610] text-white border-[#e08a5a] ring-[#c85a17]/20'
                        : (theme === 'olive' || theme === 'hunting')
                        ? 'bg-[#556b2f] hover:bg-[#4a5e27] active:bg-[#3f5221] text-white border-[#8a9a5b] ring-[#556b2f]/20'
                        : isDark
                        ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 border-emerald-300 ring-emerald-500/20'
                        : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border-emerald-300 ring-emerald-500/20'
                    }`}
                  >
                    <Undo2 className="w-4 h-4" /> Back to Today
                  </button>
                )}
              </div>

              {/* Centered Best Hunt Time Badge */}
              <div className="flex items-center justify-center w-full">
                <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <Crosshair className="w-3.5 h-3.5" /> Best Hunt: {getBestHuntTime(day)}
                </span>
              </div>
            </div>

            {/* Verdict and Target */}
            <div className="flex flex-col items-center sm:items-start space-y-1 w-full">
              <h2 className={`text-lg sm:text-xl font-black leading-snug text-center sm:text-left ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {condExplanation.headline}
              </h2>

              <div className="w-full flex justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => setShowWeatherExplanation((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-extrabold transition-all shrink-0 cursor-pointer shadow-sm ${
                    showWeatherExplanation
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                  } active:scale-95`}
                  title="Click to view weather factors driving this score"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{showWeatherExplanation ? 'Hide weather analysis ▲' : 'What drives this score? ▼'}</span>
                </button>
              </div>

              <p className={`text-xs flex flex-wrap items-center justify-center sm:justify-start gap-2 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {location.name} {location.admin1 ? `(${location.admin1})` : ''}</span>
                <span>• Whitetail Deer Forecast</span>
              </p>

              {/* Specific Weather Score Rationale Box - Only shown when clicked */}
              {showWeatherExplanation && (
                <div className={`w-full p-2.5 rounded-xl border ${condExplanation.badgeColor} backdrop-blur-sm text-left mt-1 shadow-sm space-y-0.5`}>
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    Weather Factor Breakdown
                  </div>
                  <p className={`text-xs font-medium leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {condExplanation.detail}
                  </p>
                </div>
              )}

              {/* Current Weather Metrics Badges */}
              <div className="w-full grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5 sm:gap-2 mt-2 pt-2 border-t border-slate-500/20">
                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  {getWeatherIconComponent(currentIconName)}
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Condition</div>
                    <div className="text-xs font-black truncate">{hourData ? hourData.weatherDesc : day.weatherDesc}</div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  <Thermometer className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Temperature</div>
                    <div className="text-xs font-black truncate">
                      {hourData ? `${hourData.temp}°${units === 'imperial' ? 'F' : 'C'}` : `${day.maxTemp}° / ${day.minTemp}°${units === 'imperial' ? 'F' : 'C'}`}
                    </div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  <Wind className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Wind</div>
                    <div className="text-xs font-black truncate">
                      {hourData
                        ? `${units === 'imperial' ? `${hourData.windSpeedMph} mph` : `${hourData.windSpeedKmh} km/h`} ${hourData.windDirectionText}`
                        : `${units === 'imperial' ? `${day.windSpeedMaxMph} mph` : `${day.windSpeedMaxKmh} km/h`} ${day.windDirectionText}`}
                    </div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  <Gauge className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Barometer</div>
                    <div className="text-xs font-black truncate">
                      {hourData 
                        ? (pressureUnit === 'inHg' ? `${hourData.pressureInHg} inHg` : `${hourData.pressureHpa} hPa`)
                        : (pressureUnit === 'inHg' ? `${day.pressureAvgInHg} inHg` : `${day.pressureAvgHpa} hPa`)
                      }
                    </div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  <Sunrise className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Sunrise</div>
                    <div className="text-xs font-black truncate">
                      {day.solunar?.sunrise || '6:30 AM'}
                    </div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xs'}`}>
                  <Sunset className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60">Sunset</div>
                    <div className="text-xs font-black truncate">
                      {day.solunar?.sunset || '6:45 PM'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Prime Hunt Windows Quick Card */}
          <div
            className={`w-full lg:w-auto rounded-2xl p-2.5 sm:p-3 border flex flex-col sm:flex-row lg:flex-col gap-2 min-w-[250px] ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-slate-50/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 font-bold shrink-0">
                  <Sunrise className="w-4 h-4" />
                </div>
                <div>
                  <div className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Morning Hunt</div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">{day.morningPrime}</div>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold shrink-0">
                Peak Dawn
              </span>
            </div>

            <div
              className={`flex items-center justify-between gap-2.5 text-xs pt-1.5 sm:pt-0 lg:pt-1.5 border-t sm:border-t-0 lg:border-t ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 font-bold shrink-0">
                  <Sunset className="w-4 h-4" />
                </div>
                <div>
                  <div className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Evening Hunt</div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">{day.eveningPrime}</div>
                </div>
              </div>
              <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold shrink-0">
                Peak Dusk
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast Strip Directly Below Current Conditions */}
      {forecastCards}

      {/* Main responsive grid: pressure, score factors, wind, and solunar context */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column: Pressure Chart & Factor Breakdown */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* 24-Hour Barometer Chart */}
          <PressureChart
            hourly={day.hourly}
            units={units}
            pressureUnit={pressureUnit}
            theme={theme}
                hasCustomBackground={hasCustomBackground}
            selectedHour={selectedHour}
            onSelectHour={onSelectHour}
            selectedDayName={day.dayName}
            selectedDateFormatted={day.dateFormatted}
          />

          {/* Factor Breakdown */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div
              className="flex items-center justify-between cursor-pointer select-none mb-2"
              onClick={() => setShowFactors(!showFactors)}
            >
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Deer Movement Factor Breakdown</span>
                </h3>
                <p className={`text-[11px] sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Variables driving prediction score for {day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted})
                  {selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}
                </p>
              </div>

              <button className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                {showFactors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>

            {showFactors && (
              <div className={`space-y-3 mt-3 divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {/* Selected Day/Time Indicator */}
                <div className="pb-1.5 border-b-0 flex items-center">
                  <div className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full border ${
                    isDark ? 'bg-slate-950/60 border-slate-800 text-emerald-400' : 'bg-slate-50 border-slate-200/80 text-emerald-700'
                  }`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      Selected Time: {day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted})
                      {selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}
                    </span>
                  </div>
                </div>

                {activeFactors.map((factor, idx) => {
                  const isPositive = factor.score > 0;
                  return (
                    <div key={idx} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{factor.name}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                              factor.status === 'optimal'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                                : factor.status === 'good'
                                ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40'
                                : factor.status === 'poor'
                                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {factor.status.toUpperCase()}
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

        {/* Right column: scent compass and solunar context */}
        <div className="space-y-4 sm:space-y-6">
          {/* Active Day Scent Vector Label */}
          <div className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 px-3 py-2.5 rounded-2xl border ${
            isDark ? 'bg-slate-950/40 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="leading-normal">
              Wind Map Display: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted}){selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}</span>
            </span>
          </div>

          {/* Wind & Scent Compass */}
          <WindCompass
            deg={currentWindDeg}
            speedMph={hourData ? hourData.windSpeedMph : day.windSpeedMaxMph}
            speedKmh={hourData ? hourData.windSpeedKmh : day.windSpeedMaxKmh}
            directionText={currentWindText}
            units={units}
            theme={theme}
                hasCustomBackground={hasCustomBackground}
            location={location}
          />

          {/* Solunar & Moon Card */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] text-[#1e2e1b]' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Moon className="w-4 h-4 text-amber-500" />
                <span>Solunar & Moon Activity</span>
              </h3>
              <span className="text-xs text-amber-600 dark:text-amber-300 font-bold">{day.solunar.moonPhaseName}</span>
            </div>

            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs mb-3 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-slate-50/[var(--card-opacity)] backdrop-blur-md border-slate-200'
              }`}
            >
              <div>
                <span className={`block text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Moon Illumination</span>
                <span className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{day.solunar.moonIllumination}%</span>
              </div>
              <div className="text-right">
                <span className={`block text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sunrise / Sunset</span>
                <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {day.solunar.sunrise} / {day.solunar.sunset}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block">Major Period #1 (2 Hrs)</span>
                  <span className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{day.solunar.major1}</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                  High Feed
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block">Major Period #2 (2 Hrs)</span>
                  <span className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{day.solunar.major2}</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                  High Feed
                </span>
              </div>

              <div
                className={`p-2 rounded-xl border flex items-center justify-between text-[11px] ${
                  isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Minor Periods:</span>
                <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {day.solunar.minor1} • {day.solunar.minor2}
                </span>
              </div>
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
                hasCustomBackground={hasCustomBackground}
      />
    </div>
  );
};

