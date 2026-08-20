import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  isHourlyRainBreak,
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
  Lightbulb,
  ChevronDown,
} from 'lucide-react';
import { getRutPhase } from '../utils/rutEngine';

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

/**
 * Builds a day's "Daily Tip": a short, ultra-specific, down-to-earth rundown
 * of the standout conditions a hunter should act on — big cold front, moon
 * phase, wet weather, wind, temperature, and rut. When an hour is supplied
 * (the hour selected in the hourly scrubber) the tip keys off that hour's
 * weather, temperature, and wind so it stays specific to the day/hour shown.
 * Returns up to 3 sentences; always returns at least one.
 */
const buildDailyTip = (
  day: DailyForecast,
  units: UnitSystem,
  location: Location,
  hour?: HourlyForecast | null,
  hourIndex?: number,
): string[] => {
  const tips: string[] = [];
  const isMetric = units === 'metric';
  const tempUnit = isMetric ? '°C' : '°F';
  const isHourly = !!hour;

  // Hour-specific values when the tip is for a selected hour; day-level
  // fallbacks keep the function working for a day-only context.
  const windSpeed = Math.round(
    isMetric ? (hour?.windSpeedKmh ?? day.windSpeedMaxKmh) : (hour?.windSpeedMph ?? day.windSpeedMaxMph),
  );
  const windUnit = isMetric ? 'km/h' : 'mph';
  const temp = Math.round(hour?.temp ?? day.maxTemp);
  const tempDrop = Math.round(day.tempDrop24h || 0);
  const moonName = day.solunar?.moonPhaseName || '';
  const code = hour?.weatherCode ?? day.weatherCode;
  const isRaining = (code >= 51 && code <= 65) || (code >= 80 && code <= 82);
  const isSnowing = code >= 71 && code <= 75;
  const isStorming = code >= 95;
  const rainJustStopped = hour
    ? isHourlyRainBreak(day, code, hourIndex)
    : (day.hasRainBreak || day.isPostStorm) && !isRaining && !isSnowing && !isStorming;
  const coldFront = isSignificantColdFront(day.tempDrop24h, units);
  const downwindDir = getDownwindText(((hour?.windDirectionDeg ?? day.windDirectionDeg) + 180) % 360);
  const rut = getRutPhase(day.date, location);

  // 1. Big cold front — the single biggest daylight-movement trigger.
  if (coldFront) {
    tips.push(`A big cold front is here — temps dropped ${tempDrop}${tempUnit}! Deer will be up on their feet feeding. Get in the stand!`);
  }

  // 2. Moon phase.
  if (moonName === 'Full Moon') {
    tips.push("It's a full moon tonight — deer may move earlier in the evening. Be in the stand before dark!");
  } else if (moonName === 'New Moon') {
    tips.push("New moon tonight — dark nights push deer to move more in daylight. Hunt the first and last hours of light.");
  }

  // 3. Wet weather — a rain break is a goldmine.
  if (rainJustStopped) {
    tips.push("Rain just let up — the woods are wet and quiet, and deer love stepping out to feed right after a break.");
  } else if (isStorming) {
    tips.push("Thunderstorms are rolling in — deer will hunker down until it passes. If you go, hunt the edge of the storm.");
  } else if (isSnowing) {
    tips.push("Snow is falling — deer feed hard before and after a snow. Sit on field edges and food sources.");
  } else if (isRaining) {
    tips.push("It's raining — deer usually stay tucked in thick cover until it slacks off. Hunt the lulls.");
  }

  // 4. Rut phase — only when it really matters.
  if (rut.phaseId === 'peak_rut') {
    tips.push("The rut is on — bucks are chasing does in broad daylight. Sit all day near funnels and doe bedding.");
  } else if (rut.phaseId === 'pre_rut') {
    tips.push("Pre-rut is heating up — scrape lines are popping up. Try a mock scrape or some light rattling.");
  }

  // 5. Temperature extremes — use the selected hour's temp when available.
  if (temp >= (isMetric ? 29 : 85)) {
    tips.push(`It's hot ${isHourly ? 'this hour' : 'today'} (${temp}${tempUnit}) — deer will move early and late. Get in the stand before first light.`);
  } else if (temp <= (isMetric ? -7 : 20)) {
    tips.push(`Bitter cold (${temp}${tempUnit}) — deer need heavy calories. Sit on food: corn, beans, or acorns.`);
  }

  // 6. Wind & scent — only when there's room so headline tips stay on top.
  if (tips.length < 2) {
    if (windSpeed >= (isMetric ? 30 : 19)) {
      tips.push(`Wind is ripping at ${windSpeed} ${windUnit} — deer will be holed up in thick cover. Hunt the downwind edge.`);
    } else if (windSpeed <= (isMetric ? 5 : 3)) {
      tips.push("It's dead calm — your scent will hang right on you. Use a ground blind or play the thermals.");
    } else {
      tips.push(`Scent is blowing to the ${downwindDir} — set up so your smell carries away from where deer will come.`);
    }
  }

  // 7. Never leave the tip empty — fall back to the day's rating.
  if (tips.length <= 1) {
    if (day.huntScore >= RATING_THRESHOLDS.excellent) {
      tips.push("It's a Great day in the woods — get in the stand and stay there!");
    } else if (day.huntScore >= RATING_THRESHOLDS.good) {
      tips.push("It's a good day — be in the stand for first light and the last hour before dark.");
    } else {
      tips.push("Movement looks slow today — your best bet is first light and the last hour of daylight near thick cover.");
    }
  }

  return tips.slice(0, 3);
};

/** Score-to-bar color used by the hourly and daily bars. */
const getScoreBarColor = (score: number): string => {
  if (score >= RATING_THRESHOLDS.excellent) return '#2f8f68';
  if (score >= RATING_THRESHOLDS.good) return '#69a86f';
  if (score >= RATING_THRESHOLDS.okay) return '#d9a92c';
  if (score >= RATING_THRESHOLDS.slow) return '#d38a3a';
  return '#c45b53';
};

/** Pull a clock time out of a morning/evening prime-window summary
    string (e.g. "6:00 AM - 9:00 AM"). Returns minutes since local
    midnight; callers choose first vs. last to read either bound out
    of the same parser. */
const parsePrimeTimeToken = (
  str: string | undefined,
  position: 'first' | 'last',
  fallback: number,
): number => {
  if (!str) return fallback;
  const matches = Array.from(str.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi));
  if (matches.length === 0) return fallback;
  const m = position === 'last' ? matches[matches.length - 1] : matches[0];
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

/** Compute AM and PM hunt scores by averaging the day's hourly entries
    that fall inside the existing morning/evening prime windows (the
    same `weatherService` uses for the daily score). Falls back to the
    daily `huntScore` when hourly data is missing so the cards still
    render on legacy / sparse days. */
const computeAmPmScores = (
  d: DailyForecast,
): { am: number; pm: number; amHours: number; pmHours: number } => {
  if (!d.hourly || d.hourly.length === 0) {
    return { am: d.huntScore, pm: d.huntScore, amHours: 0, pmHours: 0 };
  }
  const amStart = parsePrimeTimeToken(d.morningPrime, 'first', 360);   // 6:00 AM
  const amEnd = parsePrimeTimeToken(d.morningPrime, 'last', 540);      // 9:00 AM
  const pmStart = parsePrimeTimeToken(d.eveningPrime, 'first', 990);  // 4:30 PM
  const pmEnd = parsePrimeTimeToken(d.eveningPrime, 'last', 1170);     // 7:30 PM

  const inWindow = (ts: number, start: number, end: number) => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const dt = new Date(ts);
    const minOfDay = dt.getHours() * 60 + dt.getMinutes();
    return minOfDay >= lo && minOfDay <= hi;
  };

  const amScores = d.hourly
    .filter((h) => inWindow(h.timestamp, amStart, amEnd))
    .map((h) => h.huntScore);
  const pmScores = d.hourly
    .filter((h) => inWindow(h.timestamp, pmStart, pmEnd))
    .map((h) => h.huntScore);

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);

  return {
    am: amScores.length > 0 ? avg(amScores) : d.huntScore,
    pm: pmScores.length > 0 ? avg(pmScores) : d.huntScore,
    amHours: amScores.length,
    pmHours: pmScores.length,
  };
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
  // Daily-tip badge dropdown visibility.
  const [tipOpen, setTipOpen] = useState(false);
  // Fixed-position panel placement. The panel is positioned in viewport
  // coordinates (position: fixed) with every side clamped inside the screen,
  // so it physically cannot run off a phone — regardless of font scaling,
  // title wrapping, or rotation.
  const [tipPos, setTipPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPanelRef = useRef<HTMLDivElement>(null);

  // Anchor the panel just below the badge, clamped to the viewport: width is
  // capped to the screen, left is nudged right if the badge sits too far left,
  // and top is lifted if the rendered panel would run past the bottom.
  const updateTipPos = () => {
    if (!tipRef.current) return;
    const badgeRect = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(320, vw - 16);
    const left = Math.max(8, Math.min(badgeRect.left, vw - width - 8));
    let top = badgeRect.bottom + 8;
    if (tipPanelRef.current) {
      const panelHeight = tipPanelRef.current.getBoundingClientRect().height;
      if (top + panelHeight > vh - 8) {
        top = Math.max(8, vh - panelHeight - 8);
      }
    }
    setTipPos({ left, top, width });
  };
  const toggleTip = () => {
    if (tipOpen) {
      setTipOpen(false);
      return;
    }
    // Position before the panel exists (height unknown — top will be clamped
    // again by the layout effect below once it has rendered).
    updateTipPos();
    setTipOpen(true);
  };

  // Once the panel has rendered, re-clamp so its bottom never leaves the
  // screen either.
  useLayoutEffect(() => {
    if (tipOpen) updateTipPos();
  }, [tipOpen]);

  // Close the tip dropdown on outside tap/click or Escape; re-clamp the panel
  // on resize while open so rotating the phone can't push it off-screen.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        setTipOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTipOpen(false);
    };
    const onResize = () => {
      if (tipOpen) updateTipPos();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [tipOpen]);

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
  // Tip sentences for the Daily Tip dropdown — keyed to the selected day and
  // hour so the advice matches exactly what's on screen.
  const activeTips = buildDailyTip(activeDay, units, location, heroHourData, heroHour);
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
  // Keep the hero's condition badge compact: rain-break hours read as the
  // short "Rain Break" label.
  const nowDesc = heroHourData
    ? isHourlyRainBreak(activeDay, heroHourData.weatherCode, heroHour)
      ? 'Rain Break'
      : heroHourData.weatherDesc
    : activeDay.weatherDesc;
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
          selected day so the header always labels whose data is shown. The
          Daily Tip badge sits to the right of the selected day's title and
          opens a dropdown with an ultra-specific tip for that day/hour. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h1 className={`text-2xl sm:text-3xl font-black tracking-tight leading-tight ${
          isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'
        }`}>
          {activeDay.dayName === 'Today' ? "Today's" : `${activeDay.dayName}'s`} Hunt
        </h1>
          <div className="relative inline-flex" ref={tipRef}>
            <button
              type="button"
              onClick={toggleTip}
              aria-expanded={tipOpen}
              aria-haspopup="true"
              aria-label={`${activeDay.dayName === 'Today' ? "Today's" : `${activeDay.dayName}'s`} daily tip`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 ${
                isDark
                  ? 'bg-slate-950/70 border-amber-400/40 text-amber-300 hover:bg-slate-800/80 focus-visible:ring-amber-400'
                  : theme === 'hunting'
                  ? 'bg-[#f4eee1]/90 border-[#c85a17]/50 text-[#7a3208] hover:bg-[#eae1cf] focus-visible:ring-[#c85a17]'
                  : theme === 'olive'
                  ? 'bg-[#f7f5ed]/90 border-[#556b2f]/50 text-[#3d4f21] hover:bg-[#efebd9] focus-visible:ring-[#556b2f]'
                  : 'bg-amber-50 border-amber-400/60 text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-600'
              }`}
            >
              <Lightbulb className="w-3 h-3" />
              Daily Tip
              <ChevronDown className={`w-3 h-3 transition-transform ${tipOpen ? 'rotate-180' : ''}`} />
            </button>
            {tipOpen && tipPos && (
              <div
                ref={tipPanelRef}
                style={{ left: tipPos.left, top: tipPos.top, width: tipPos.width }}
                className={`fixed z-50 rounded-2xl border p-3.5 shadow-2xl ${
                  isDark
                    ? 'bg-slate-900/95 backdrop-blur-xl border-slate-700 text-slate-100'
                    : theme === 'hunting'
                    ? 'bg-[#f4eee1] border-[#d4c4a8] text-[#2a1b0e]'
                    : theme === 'olive'
                    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <div className={`text-[10px] font-black uppercase tracking-wider mb-2 ${
                  isDark ? 'text-amber-300' : theme === 'hunting' ? 'text-[#7a3208]' : theme === 'olive' ? 'text-[#3d4f21]' : 'text-amber-600'
                }`}>
                  {activeDay.dayName === 'Today' ? "Today's" : `${activeDay.dayName}'s`} Daily Tip · {activeDay.dateFormatted}
                </div>
                <div className="space-y-1.5">
                  {activeTips.map((tip) => (
                    <p key={tip} className="text-sm leading-snug">
                      {tip}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
      </div>

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
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(80) }} /> Good</span>
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
                        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white shadow-md ring-2 ${
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

      {/* 3. Daily hunt score — compact AM + PM card per day. */}
      <div className={`rounded-2xl border p-3 sm:p-4 shadow-md ${cardSurface}`}>
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <h2 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${accentText}`}>
              <CalendarDays className="w-4 h-4" /> Daily Hunt Score
            </h2>
            <p className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Morning and evening at a glance
            </p>
          </div>
        </div>

        <div className="overflow-x-auto pb-1.5 -mx-1 px-1">
          <div className="flex items-stretch gap-2 sm:gap-2.5 min-w-[560px]">
            {daily.map((d) => {
              const isSelected = d.date === (activeDayDate || today.date);
              const wet = isWetDay(d);
              const maxPrecipProb = getMaxPrecipProb(d);
              const precipAmount = units === 'imperial'
                ? `${(d.precipSumInches || 0).toFixed(2)} in`
                : `${(d.precipSumMm || 0).toFixed(1)} mm`;
              const coldFront = isSignificantColdFront(d.tempDrop24h, units);
              const hasMoonBadge = d.solunar?.moonPhaseName === 'Full Moon';
              const { am, pm } = computeAmPmScores(d);
              const amRating = getRatingFromScore(am);
              const pmRating = getRatingFromScore(pm);
              const amColor = getScoreBarColor(am);
              const pmColor = getScoreBarColor(pm);
              const ringClass = isSelected
                ? (isDark ? 'ring-2 ring-emerald-400/80 bg-slate-800/55'
                  : theme === 'hunting' ? 'ring-2 ring-[#7a3208]/55 bg-[#f4eee1]/80'
                  : theme === 'olive' ? 'ring-2 ring-[#556b2f]/55 bg-[#f7f5ed]/80'
                  : 'ring-2 ring-emerald-500/70 bg-emerald-50/60')
                : (isDark ? 'bg-slate-800/30 hover:bg-slate-800/60 ring-1 ring-slate-700/40'
                  : theme === 'hunting' ? 'bg-[#f4eee1]/40 hover:bg-[#f4eee1]/80 ring-1 ring-[#d4c4a8]/60'
                  : theme === 'olive' ? 'bg-[#f7f5ed]/40 hover:bg-[#f7f5ed]/80 ring-1 ring-[#d8d2c0]/60'
                  : 'bg-slate-50 hover:bg-slate-100 ring-1 ring-slate-200');
              const subText = isDark ? 'text-slate-300' : 'text-slate-600';
              const headText = isDark ? 'text-slate-100'
                : theme === 'hunting' ? 'text-[#2a1b0e]'
                : theme === 'olive' ? 'text-[#1e2e1b]'
                : 'text-slate-800';
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setActiveDayDate((prev) => (prev === d.date ? '' : d.date));
                    setHeroHour(new Date().getHours());
                  }}
                  title={`${d.dayName} ${d.dateFormatted} · AM ${am} (${amRating}) · PM ${pm} (${pmRating})`}
                  className={`group flex-1 min-w-[112px] flex flex-col rounded-xl transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${ringClass}`}
                >
                  {/* Day header — compact day label + subtle status icons */}
                  <div className="px-2 pt-2 pb-1.5 text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5 h-3.5">
                      {hasMoonBadge && <Moon className="w-3 h-3 text-amber-400 fill-amber-400" aria-label="Full moon" />}
                      {coldFront && (
                        <Snowflake className="w-3 h-3 text-sky-400" aria-label="Cold front" />
                      )}
                    </div>
                    <div className={`text-[11px] font-black uppercase tracking-wider ${headText}`}>
                      {d.dayName === 'Today' ? 'Today' : d.dayName}
                    </div>
                    <div className={`text-[9px] font-bold uppercase tracking-wider opacity-60 ${subText}`}>
                      {d.dateFormatted}
                    </div>
                  </div>

                  {/* AM score row — sunrise icon + score chip */}
                  <div className="px-2 pb-1.5 flex items-stretch gap-1.5">
                    <div className="flex flex-col items-center justify-center shrink-0 w-5">
                      <Sunrise className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className={`text-[9px] font-black uppercase tracking-wider leading-none mt-0.5 ${subText}`}>AM</span>
                    </div>
                    <div
                      className="flex-1 min-w-0 rounded-md px-1.5 py-1 flex flex-col items-center justify-center leading-none"
                      style={{ backgroundColor: amColor }}
                    >
                      <div className="flex items-center gap-1">
                        <DeerIcon
                          className="w-3.5 h-3.5 shrink-0 text-white"
                          style={{ fill: 'white', color: 'white' }}
                        />
                        <span className="text-base font-black text-white leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">{am}</span>
                      </div>
                      <span className="mt-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white leading-none whitespace-nowrap">
                        {amRating}
                      </span>
                    </div>
                  </div>

                  {/* PM score row — sunset icon + score chip */}
                  <div className="px-2 pb-2 flex items-stretch gap-1.5">
                    <div className="flex flex-col items-center justify-center shrink-0 w-5">
                      <Sunset className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className={`text-[9px] font-black uppercase tracking-wider leading-none mt-0.5 ${subText}`}>PM</span>
                    </div>
                    <div
                      className="flex-1 min-w-0 rounded-md px-1.5 py-1 flex flex-col items-center justify-center leading-none"
                      style={{ backgroundColor: pmColor }}
                    >
                      <div className="flex items-center gap-1">
                        <DeerIcon
                          className="w-3.5 h-3.5 shrink-0 text-white"
                          style={{ fill: 'white', color: 'white' }}
                        />
                        <span className="text-base font-black text-white leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">{pm}</span>
                      </div>
                      <span className="mt-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white leading-none whitespace-nowrap">
                        {pmRating}
                      </span>
                    </div>
                  </div>

                  {/* Weather footer — icon + precip prob + precip amount */}
                  <div className={`flex items-center justify-center gap-1.5 px-2 py-1.5 border-t ${
                    isDark ? 'border-slate-700/70'
                      : theme === 'hunting' ? 'border-[#d4c4a8]'
                      : theme === 'olive' ? 'border-[#d8d2c0]'
                      : 'border-slate-200'
                  }`}>
                    {getWeatherIcon(d.weatherIcon, `w-5 h-5 sm:w-6 sm:h-6 shrink-0 ${getWeatherIconTone(d.weatherCode)}`)}
                    {wet ? (
                      <div className="flex items-baseline gap-1 leading-none">
                        <span className={`text-[11px] sm:text-xs font-black ${isDark ? 'text-sky-400' : 'text-sky-500'}`}>{maxPrecipProb}%</span>
                        <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{precipAmount}</span>
                      </div>
                    ) : (
                      <span className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider opacity-70 truncate ${subText}`}>
                        {d.weatherDesc}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Shared rating legend — same score thresholds and colors as the
            hourly bars and the hero progress bar. */}
        <div className={`flex items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1 text-[9px] sm:text-[10px] font-bold flex-wrap mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(90) }} />
            86+ Great
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(80) }} />
            71–85 Good
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(50) }} />
            41–70 Okay
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(33) }} />
            26–40 Slow
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreBarColor(15) }} />
            Below 26 Very Slow
          </span>
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
