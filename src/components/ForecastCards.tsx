import React, { useState } from 'react';
import { DailyForecast, UnitSystem, ThemeMode, PressureUnit, Location } from '../types';
import { DeerIcon } from './DeerIcon';
import { getHour12Label, getRatingFromScore, getWeatherDetails, getBestHuntTime, getBestStandForWind } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import { motion } from 'motion/react';
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
  TrendingDown,
  TrendingUp,
  Minus,
  ArrowDownRight,
  ArrowUpRight,
  Wind,
  Gauge,
  Sunrise,
  Sunset,
  Clock,
  Award,
  ChevronDown,
  Droplets,
  Calendar,
  Target,
  Zap,
  RefreshCw,
  Trees,
  Compass,
  Sparkles,
  Flame,
  Lock,
  ShieldCheck,
  Moon,
  Star,
  Maximize2,
} from 'lucide-react';

interface ForecastCardsProps {
  daily: DailyForecast[];
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  units: UnitSystem;
  pressureUnit?: PressureUnit;
  theme: ThemeMode;
  selectedHour?: number;
  onOpenDetails?: (dateStr: string) => void;
  location?: Location;
  hasCustomBackground?: boolean;
  lastRefreshed?: Date | null;
}

export const ForecastCards: React.FC<ForecastCardsProps> = ({
  daily,
  selectedDate,
  onSelectDate,
  units,
  pressureUnit = 'inHg',
  theme,
  selectedHour,
  onOpenDetails,
  location,
  hasCustomBackground = false,
  lastRefreshed,
}) => {
  // Which 7-day card the Best Day banner auto-expanded — kept separate from the
  // real selection so tapping the banner never swaps the top forecast card.
  const [autoExpandedDate, setAutoExpandedDate] = useState<string | null>(null);

  if (!daily || daily.length === 0) return null;

  const isDark = theme === 'dark';

  // Heading text color is always theme-driven so it pops against the heading's
  // theme-aware card: dark theme → light text, light/olive/hunting → dark ink.
  const headerLightOnDark = isDark;

  const headerTextColor = headerLightOnDark
    ? 'text-white'
    : theme === 'hunting'
    ? 'text-[#2a1b0e]'
    : theme === 'olive'
    ? 'text-[#1e2e1b]'
    : 'text-slate-900';

  const headerIconColor = headerLightOnDark ? 'text-emerald-400' : 'text-emerald-600';

  // Soft drop shadow behind the header text whenever a photo is present — keeps
  // it legible even over busy sections of the image (and covers the unmeasured
  // fallback case too). Dark text themes get a much subtler shadow so it doesn't
  // muddy the heading in light/olive/hunting.
  const headerShadow = hasCustomBackground
    ? isDark
      ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]'
      : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
    : '';

  // Find max score day
  const maxScore = Math.max(...daily.map((d) => d.huntScore));
  const bestDay = daily.find((d) => d.huntScore === maxScore) || daily[0];

  // Peak hourly deer-movement score for the best day, e.g. "93% chance at 5 PM".
  const bestDayPeak = (() => {
    if (!bestDay.hourly || bestDay.hourly.length === 0) return null;
    let peak = bestDay.hourly[0];
    for (const h of bestDay.hourly) {
      if (h.huntScore > peak.huntScore) peak = h;
    }
    return {
      score: peak.huntScore,
      label: getHour12Label(new Date(peak.timestamp).getHours()).replace(':00 ', ' '),
    };
  })();

  const renderWeatherIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sun':
        return <Sun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'SunMedium':
        return <SunMedium className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'CloudSun':
        return <CloudSun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'Cloud':
        return <Cloud className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />;
      case 'CloudFog':
        return <CloudFog className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />;
      case 'CloudDrizzle':
        return <CloudDrizzle className="w-7 h-7 sm:w-8 sm:h-8 text-sky-500" />;
      case 'CloudRain':
        return <CloudRain className="w-7 h-7 sm:w-8 sm:h-8 text-sky-600" />;
      case 'CloudRainWind':
        return <CloudRainWind className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />;
      case 'Snowflake':
        return <Snowflake className="w-7 h-7 sm:w-8 sm:h-8 text-sky-400" />;
      case 'CloudLightning':
        return <CloudLightning className="w-7 h-7 sm:w-8 sm:h-8 text-amber-600" />;
      default:
        return <CloudSun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
    }
  };

  const getPressureTrendIcon = (trend: DailyForecast['pressureTrend']) => {
    switch (trend) {
      case 'rapid_drop':
        return <ArrowDownRight className="w-4 h-4 text-emerald-500" title="Rapid Barometric Drop" />;
      case 'rapid_rise':
        return <ArrowUpRight className="w-4 h-4 text-emerald-500" title="Rapid Barometric Rise Post-Front" />;
      case 'rising':
        return <TrendingUp className="w-4 h-4 text-sky-500" title="Barometer Rising" />;
      case 'falling':
        return <TrendingDown className="w-4 h-4 text-amber-500" title="Barometer Falling" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" title="Barometer Steady" />;
    }
  };

  const renderRutIcon = (iconName: string, className = "w-3 h-3 shrink-0") => {
    switch (iconName) {
      case 'Trees':
        return <Trees className={className} />;
      case 'Compass':
        return <Compass className={className} />;
      case 'Sparkles':
        return <Sparkles className={className} />;
      case 'Flame':
        return <Flame className={className} />;
      case 'Lock':
        return <Lock className={className} />;
      case 'ShieldCheck':
        return <ShieldCheck className={className} />;
      case 'Snowflake':
        return <Snowflake className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

const getScoreBadgeColor = (score: number) => {
    if (theme === 'hunting') {
      if (score >= 90) return 'bg-[#1a6b3c] text-white border-[#1a6b3c] shadow-sm';
      if (score >= 76) return 'bg-[#4a8c5e] text-white border-[#4a8c5e] shadow-sm';
      if (score >= 46) return 'bg-[#c85a17] text-white border-[#c85a17] shadow-sm';
      return 'bg-[#8b3a3a] text-white border-[#a85a5a] shadow-sm';
    } else if ((theme === 'olive' || theme === 'hunting')) {
      if (score >= 90) return 'bg-[#2d4a27] text-white border-[#556b2f] shadow-sm';
      if (score >= 76) return 'bg-[#556b2f] text-white border-[#8a9a5b] shadow-sm';
      if (score >= 46) return 'bg-[#b87333] text-white border-[#d4a373] shadow-sm';
      return 'bg-[#8b3a3a] text-white border-[#a85a5a] shadow-sm';
    }
    if (score >= 90) return 'bg-emerald-800 text-white border-emerald-600 shadow-emerald-950/30';
    if (score >= 76) return 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-emerald-900/10';
    if (score >= 46) return 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-900/20';
    return 'bg-rose-500 text-white border-rose-400 shadow-rose-900/20';
  };

  const getCardHueClasses = (score: number, isSelected: boolean) => {
    const glass = 'backdrop-blur-md';

    if (score >= 90) { // Excellent - Dark green
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-emerald-700 ring-2 ring-emerald-700/40 shadow-lg shadow-emerald-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#1a6b3c] ring-2 ring-[#1a6b3c]/40 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#2d4a27] ring-2 ring-[#556b2f]/40 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-emerald-600 ring-2 ring-emerald-600/30 shadow-md shadow-emerald-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-700/30 hover:border-emerald-700/60 shadow-md shadow-emerald-950/20 hover:shadow-emerald-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/35 hover:border-[#d4c4a8]/60 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/35 hover:border-[#556b2f]/60 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-600/25 hover:border-emerald-600/50 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all ${glass}`;
    }

    if (score >= 76) { // Good - Sage green
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#4a8c5e] ring-2 ring-[#4a8c5e]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#556b2f] ring-2 ring-[#556b2f]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-emerald-500 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-500/30 hover:border-emerald-500/60 shadow-md shadow-emerald-950/20 hover:shadow-emerald-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/30 hover:border-[#d4c4a8]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/30 hover:border-[#556b2f]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-500/25 hover:border-emerald-500/50 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all ${glass}`;
    }

    if (score >= 46) { // Fair - Amber/Ochre
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#c85a17] ring-2 ring-[#c85a17]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#b87333] ring-2 ring-[#b87333]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-amber-500 ring-2 ring-amber-500/30 shadow-md shadow-amber-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-amber-500/30 hover:border-amber-500/60 shadow-md shadow-amber-950/20 hover:shadow-amber-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/30 hover:border-[#d4c4a8]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#b87333]/30 hover:border-[#b87333]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-amber-500/25 hover:border-amber-500/50 shadow-sm hover:shadow-md hover:shadow-amber-500/5 transition-all ${glass}`;
    }

    // Poor (< 46) - Red
    if (isSelected) {
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] border-rose-500 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 scale-[1.01] z-10 ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#8b3a3a] ring-2 ring-[#8b3a3a]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#8b3a3a] ring-2 ring-[#8b3a3a]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
        : `bg-white/[var(--card-opacity)] border-rose-500 ring-2 ring-rose-500/30 shadow-md shadow-rose-500/5 scale-[1.01] z-10 ${glass}`;
    }
    return isDark
      ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-rose-500/30 hover:border-rose-500/60 shadow-md shadow-rose-950/20 hover:shadow-rose-500/5 transition-all ${glass}`
      : theme === 'hunting'
      ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#8b3a3a]/30 hover:border-[#8b3a3a]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
      : (theme === 'olive' || theme === 'hunting')
      ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#8b3a3a]/30 hover:border-[#8b3a3a]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
      : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-rose-500/25 hover:border-rose-500/50 shadow-sm hover:shadow-md hover:shadow-rose-500/5 transition-all ${glass}`;
  };

  return (
    <div className="w-full">
      {/* Best Day Banner — highlights the top-scoring day of the week. Uses the
          same theme-aware card background as the forecast cards (respects the
          custom-background opacity & blur settings) instead of a hard gradient. */}
      {bestDay && (
        <button
          onClick={() => {
            // Expand the best day's 7-day card WITHOUT changing the selected day
            // (that would swap the top forecast card), then smooth-scroll to it.
            setAutoExpandedDate(bestDay.date);
            document.getElementById(`forecast-card-${bestDay.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className={`w-full mb-3 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-all hover:scale-[1.002] cursor-pointer backdrop-blur-md ${
            isDark
              ? 'bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-500/50 ring-1 ring-emerald-500/20'
              : theme === 'hunting'
              ? 'bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#1a6b3c]/50 text-[#2a1b0e]'
              : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/50 text-[#1e2e1b]'
              : 'bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-300 shadow-sm'
          }`}
          title="Tap to jump to the best day"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-500 to-amber-600 shadow-md`}>
              <Award className="w-5 h-5 sm:w-6 sm:h-6 fill-slate-950 text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className={`text-[10px] sm:text-xs font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : theme === 'hunting' ? 'text-[#1a6b3c]' : theme === 'olive' ? 'text-[#2d4a27]' : 'text-emerald-700'}`}>
                Best Day
              </div>
              <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                <span className={`text-xl sm:text-2xl font-black leading-tight ${isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>
                  {bestDay.dayName}
                </span>
                <span className={`text-xs sm:text-sm font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {bestDay.dateFormatted}
                </span>
              </div>
              <div className={`text-[11px] sm:text-xs font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {bestDayPeak
                  ? `${bestDayPeak.score}% chance of deer movement at ${bestDayPeak.label}`
                  : `${bestDay.huntScore}% chance of deer movement`}
              </div>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 -rotate-90 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
        </button>
      )}

      {/* Section heading on a theme-aware card so the title stays legible over
          any custom background photo (card respects opacity/blur settings). */}
      <div className={`mb-3 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 backdrop-blur-md transition-colors duration-300 ${
        isDark
          ? 'bg-slate-900/[var(--card-opacity)] border-slate-700/60'
          : theme === 'hunting'
          ? 'bg-[#eee6d6]/[var(--card-opacity)] border-[#d4c4a8]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-[#d8d2c0]'
          : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-sm'
      }`}>
        <h2 className={`text-base sm:text-lg font-black flex items-center gap-2 transition-colors duration-300 ${headerTextColor} ${headerShadow}`}>
          <Calendar className={`w-5 h-5 shrink-0 ${headerIconColor}`} />
          <span>7-Day Deer Hunting Forecast</span>
        </h2>
        <div className="flex flex-col items-end gap-0.5">
          {lastRefreshed && (
            <span className={`text-[10px] font-bold flex items-center gap-1 transition-colors duration-300 ${headerTextColor}`}>
              <RefreshCw className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </span>
          )}
          <span className={`text-[10px] sm:text-[13px] font-medium transition-colors duration-300 ${headerTextColor} opacity-75`}>
            Tap any day to expand full hourly & solar details
          </span>
        </div>
      </div>

      {/* Vertical Stacked Card List */}
      <div className="flex flex-col gap-3.5">
        {daily.map((day) => {
          const isSelected = day.date === selectedDate;
          const isExpanded = isSelected || day.date === autoExpandedDate;
          const hourData = selectedHour !== undefined && day.hourly && day.hourly[selectedHour] ? day.hourly[selectedHour] : null;
          const cardScore = hourData ? hourData.huntScore : day.huntScore;
          const cardRating = hourData ? getRatingFromScore(hourData.huntScore) : day.rating;
          const cardWeatherIcon = hourData ? getWeatherDetails(hourData.weatherCode).icon : day.weatherIcon;
          const cardWeatherDesc = hourData ? hourData.weatherDesc : day.weatherDesc;
          const cardWindDirText = hourData ? hourData.windDirectionText : day.windDirectionText;
          const cardWindSpeed = hourData
            ? (units === 'metric' ? `${hourData.windSpeedKmh} km/h` : `${hourData.windSpeedMph} mph`)
            : (units === 'metric' ? `${day.windSpeedMaxKmh} km/h` : `${day.windSpeedMaxMph} mph`);
          const cardPressure = hourData
            ? (pressureUnit === 'hPa' ? `${hourData.pressureHpa} hPa` : `${hourData.pressureInHg} inHg`)
            : (pressureUnit === 'hPa' ? `${day.pressureAvgHpa} hPa` : `${day.pressureAvgInHg} inHg`);
          const isTopDay = cardScore === maxScore && maxScore >= 66;
          const dayRut = getRutPhase(day.date, location);

          // Calculate maximum precipitation probability for the day
          const maxPrecipProb = day.hourly && day.hourly.length > 0
            ? Math.max(...day.hourly.map((h) => h.precipProbability || 0))
            : 0;

          return (
            <div
              key={day.date}
              id={`forecast-card-${day.date}`}
              onClick={() => {
                setAutoExpandedDate(null);
                onSelectDate(isSelected ? '' : day.date);
              }}
              className={`w-full rounded-2xl border transition-all hover:scale-[1.002] cursor-pointer flex flex-col overflow-hidden ${getCardHueClasses(
                cardScore,
                isSelected
              )}`}
            >
              {/* COMPACT CARD HEADER (always visible, click-toggleable) */}
              <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
                {/* Left side: Date, Sunrise/Sunset + Weather mini summary */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="flex flex-col min-w-[95px] sm:min-w-[110px] shrink-0">
                    <span className={`text-[15px] sm:text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {day.dateFormatted}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5 text-[10px] sm:text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1 whitespace-nowrap" title="Sunrise">
                        <Sunrise className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>{day.solunar?.sunrise || '6:30 AM'}</span>
                      </span>
                      <span className="flex items-center gap-1 whitespace-nowrap" title="Sunset">
                        <Sunset className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span>{day.solunar?.sunset || '6:45 PM'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-l pl-3.5 border-slate-700/20 min-w-0">
                    <div className="flex-shrink-0 scale-95">
                      {renderWeatherIcon(cardWeatherIcon)}
                    </div>
                    <div className="text-xs sm:text-sm min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-black block text-[13px] sm:text-[15px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {day.maxTemp}° / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full border transition-colors ${
                            maxPrecipProb >= 40
                              ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/40'
                              : maxPrecipProb > 0
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                              : isDark
                              ? 'bg-slate-800/60 text-slate-400 border-slate-700/50'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                          title={`Max Rain Probability: ${maxPrecipProb}%`}
                        >
                          <Droplets className="w-3 h-3 text-cyan-500 shrink-0" />
                          <span>{maxPrecipProb}% precip</span>
                        </span>
                      </div>
                      <span className={`text-xs font-bold block truncate max-w-[140px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {cardWeatherDesc}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-extrabold block text-emerald-600 dark:text-emerald-400 mt-0.5 whitespace-nowrap flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Best Hunt: {getBestHuntTime(day)}</span>
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-extrabold block text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap flex items-center gap-1">
                        {renderRutIcon(dayRut.iconName, "w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0")}
                        <span>Rut: {dayRut.name}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Score badge, Prime badge, Full Moon badge, and Dropdown arrow */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 sm:gap-2.5 shrink-0 ml-auto max-w-full">
                  {/* Badges container (Full Moon, Prime) - flex-wrap ensures no overflow off card bounds */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                    {day.solunar?.moonPhaseName === 'Full Moon' && (
                      <div className={`text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1 border whitespace-nowrap ${
                        isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        <Moon className="w-3 h-3 fill-current text-amber-500 shrink-0" />
                        <span>Full Moon</span>
                      </div>
                    )}

                    {isTopDay && (
                      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1 border border-amber-300 whitespace-nowrap">
                        <Award className="w-3 h-3 fill-slate-950 shrink-0" />
                        <span>Prime</span>
                      </div>
                    )}
                  </div>

                  {/* Fixed-width Score Badge & Arrow for 100% left-to-right alignment across all cards */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <div
                      className={`w-[140px] sm:w-[155px] shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl border font-black shadow-xs flex items-center justify-center gap-1 sm:gap-1.5 ${getScoreBadgeColor(
                        cardScore
                      )}`}
                    >
                      <DeerIcon className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0" />
                      {cardScore >= 90 && <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-amber-350 shrink-0" />}
                      <span className="text-sm sm:text-base leading-none font-black">{cardScore}</span>
                      <span className="text-[10px] sm:text-xs uppercase tracking-wider font-extrabold opacity-95 whitespace-nowrap">{cardRating}</span>
                    </div>

                    {/* Dropdown Arrow */}
                    <div className={`w-6 sm:w-7 h-6 sm:h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-500/10 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <ChevronDown
                        className={`w-5 h-5 transition-transform duration-300 ease-in-out ${
                          isExpanded ? 'rotate-180' : 'rotate-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPANDED CONTENT AREA WITH SLIDE DOWN ANIMATION */}
              <motion.div
                initial={false}
                animate={{
                  height: isExpanded ? 'auto' : 0,
                  opacity: isExpanded ? 1 : 0,
                }}
                transition={{
                  duration: isExpanded ? 0.35 : 0,
                  ease: [0.04, 0.62, 0.23, 0.98], // elegant spring-like ease
                }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-slate-500/15">
                  {/* Highlight & Status Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3.5 mb-3.5">
                    {/* Semi-rectangular Pill Style Badge for Rut Status */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                        isDark
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/45'
                          : 'bg-purple-50 text-purple-800 border-purple-200 shadow-2xs'
                      }`}
                    >
                      {renderRutIcon(dayRut.iconName, "w-3.5 h-3.5 shrink-0 text-purple-500 dark:text-purple-300")}
                      <span>Rut Status: {dayRut.name}</span>
                    </span>

                    {day.tempDrop24h >= 5 && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <Snowflake className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-300" />
                        <span>-{day.tempDrop24h}°{units === 'imperial' ? 'F' : 'C'} Drop</span>
                      </span>
                    )}
                    {day.isPostStorm && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <CloudRain className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-300" />
                        <span>Post-Storm Activity</span>
                      </span>
                    )}
                    {(day.pressureTrend === 'rapid_drop' || day.pressureTrend === 'rapid_rise') && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
                        <span>Baro Front Shift</span>
                      </span>
                    )}
                  </div>

                  {/* Detailed Prediction Button — top of expanded view for quick access */}
                  {onOpenDetails && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetails(day.date);
                      }}
                      className={`w-full mt-2 py-2.5 font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] ring-2 ${
                        theme === 'hunting'
                          ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white ring-[#c85a17]/10'
                          : theme === 'olive'
                          ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white ring-[#556b2f]/10'
                          : isDark
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 ring-emerald-500/10'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white ring-emerald-500/10'
                      }`}
                    >
                      <Maximize2 className="w-4 h-4 shrink-0" />
                      <span>View Detailed Prediction</span>
                    </button>
                  )}

                  {/* Weather & Temp */}
                  <div className="flex items-center gap-3.5 my-3">
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      {renderWeatherIcon(cardWeatherIcon)}
                    </div>
                    <div>
                      <div className={`text-xl sm:text-2xl font-black flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {hourData ? (
                          <>
                            <span>{hourData.temp}°</span>
                            <span className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              ({day.maxTemp}° / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'})
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{day.maxTemp}°</span>
                            <span className={`text-base font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'}
                            </span>
                          </>
                        )}
                      </div>
                      <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {cardWeatherDesc}
                      </p>
                    </div>
                  </div>

                  {/* Barometer, Wind & Rain Precip Grid */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 gap-3 my-3 py-3 border-y text-[13px] sm:text-sm ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    }`}
                  >
                    {/* Barometer */}
                    <div className="flex items-center gap-2.5">
                      <Gauge className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <div>
                        <div className={`flex items-center gap-1 font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          <span>{cardPressure}</span>
                          {getPressureTrendIcon(day.pressureTrend)}
                        </div>
                        <span className={`text-xs capitalize font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {day.pressureTrend.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Wind */}
                    <div className="flex items-center gap-2.5">
                      <Wind className="w-5 h-5 text-sky-500 flex-shrink-0" />
                      <div>
                        <div className={`font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {cardWindDirText} {cardWindSpeed}
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Wind Vector</span>
                      </div>
                    </div>

                    {/* Rain Precip */}
                    <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
                      <Droplets className="w-5 h-5 text-cyan-500 flex-shrink-0" />
                      <div>
                        <div className={`font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {maxPrecipProb}% <span className="text-xs font-normal opacity-80">({units === 'imperial' ? `${day.precipSumInches || 0} in` : `${day.precipSumMm || 0} mm`})</span>
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Precip Risk</span>
                      </div>
                    </div>
                  </div>

                  {/* Sunrise & Sunset Row */}
                  <div
                    className={`mt-2 pt-2 border-t text-[13px] sm:text-sm flex items-center justify-between font-bold ${
                      isDark ? 'border-slate-800/60 text-slate-300' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sunrise className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs uppercase font-extrabold opacity-75">Sunrise:</span>
                      <span className="text-sm">{day.solunar?.sunrise || '6:30 AM'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Sunset className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <span className="text-xs uppercase font-extrabold opacity-75">Sunset:</span>
                      <span className="text-sm">{day.solunar?.sunset || '6:45 PM'}</span>
                    </span>
                  </div>

                  {/* Hunt Windows Preview */}
                  <div
                    className={`mt-2.5 pt-2.5 border-t text-[13px] sm:text-sm flex flex-col gap-1.5 ${
                      isDark ? 'border-slate-800/40' : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4.5 h-4.5" /> AM Morning Hunt:
                      </span>
                      <span>{day.morningPrime}</span>
                    </div>
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4.5 h-4.5" /> PM Evening Hunt:
                      </span>
                      <span>{day.eveningPrime}</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
