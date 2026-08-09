import { DailyForecast, HourlyForecast, PressureTrend, ScoreFactor, SolunarInfo, UnitSystem, PressureUnit, Location, SavedPin } from '../types';
import { getRutPhase } from './rutEngine';
import { calculateMoonTimes } from './solunar';
import { safeGetJSON } from './storage';

// Convert hPa to inHg
export function hpaToInHg(hpa: number): number {
  return Number((hpa * 0.02953).toFixed(2));
}

// Convert °C to °F
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

// Convert km/h to mph
export function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

// Degrees to Cardinal wind direction
export function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

// Weather Code mapping to human description & lucide icon name
export function getWeatherDetails(code: number): { desc: string; icon: string } {
  switch (code) {
    case 0:
      return { desc: 'Clear Skies', icon: 'Sun' };
    case 1:
      return { desc: 'Mostly Clear', icon: 'SunMedium' };
    case 2:
      return { desc: 'Partly Cloudy', icon: 'CloudSun' };
    case 3:
      return { desc: 'Overcast', icon: 'Cloud' };
    case 45:
    case 48:
      return { desc: 'Foggy / Low Scent Visibility', icon: 'CloudFog' };
    case 51:
    case 53:
    case 55:
      return { desc: 'Light Drizzle', icon: 'CloudDrizzle' };
    case 61:
    case 63:
      return { desc: 'Rain', icon: 'CloudRain' };
    case 65:
      return { desc: 'Heavy Rain', icon: 'CloudRainWind' };
    case 71:
    case 73:
    case 75:
      return { desc: 'Snowfall', icon: 'Snowflake' };
    case 80:
    case 81:
    case 82:
      return { desc: 'Passing Showers', icon: 'CloudRain' };
    case 95:
    case 96:
    case 99:
      return { desc: 'Thunderstorms', icon: 'CloudLightning' };
    default:
      return { desc: 'Overcast', icon: 'Cloud' };
  }
}

export function format12HourTime(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : '12:00 AM';

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

export function getHour12Label(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${ampm}`;
}

/**
 * Batch 3 — single source of truth for the hunt-score rating scale.
 *
 * Chosen to keep the code's existing 90 / 76 / 46 thresholds rather than
 * the older 90 / 66 / 40 documented in `changes.md` (we've reconciled
 * `changes.md` separately). Every score-band branch in the app reads
 * from this constant: the verdict block in `calculateHuntScore`, the
 * `Great / Good / Fair / Poor` rating returned by `getRatingFromScore`,
 * the score-based headline fallback in `getDetailedConditionExplanation`,
 * and the dial / card colour tables in `DayDetailView`,
 * `ForecastCards` and `DetailedPredictionView`.
 */
export const RATING_THRESHOLDS = {
  excellent: 90,
  good: 76,
  fair: 46,
} as const;

export function getRatingFromScore(score: number): 'Poor' | 'Fair' | 'Good' | 'Great' {
  if (score >= RATING_THRESHOLDS.excellent) return 'Great';
  if (score >= RATING_THRESHOLDS.good) return 'Good';
  if (score >= RATING_THRESHOLDS.fair) return 'Fair';
  return 'Poor';
}

/**
 * Prime is a stricter peak-movement signal than the Great rating: a day
 * earns it when its daily summary or any hourly forecast reaches 95+.
 */
export const PRIME_DAY_THRESHOLD = 95;

export function isPrimeDay(score: number): boolean {
  return score >= PRIME_DAY_THRESHOLD;
}

/**
 * Returns the strongest movement opportunity available in a day, considering
 * both the daily summary and every hourly score. Best Day and Prime badges use
 * this same value so those labels cannot point at different days.
 */
export function getPeakHuntScore(day: Pick<DailyForecast, 'huntScore' | 'hourly'>): number {
  if (!day.hourly || day.hourly.length === 0) return day.huntScore;
  return Math.max(day.huntScore, ...day.hourly.map((hour) => hour.huntScore));
}

/**
 * True when a specific hour represents a break in the rain / post-storm
 * clearing. This is used by the display-side condition explanation to show
 * "Rain Just Stopped" — so it must only fire for hours that are actually
 * near when rain stopped, NOT any dry hour on a rainy day.
 *
 * The hourly weather service already computes `isRainBreakHour` which checks
 * that rain occurred in the preceding 3 hours. This function is the
 * display-side mirror: it should be consistent with that signal.
 *
 * Returns true only when:
 *  - The current hour is NOT currently precipitating, AND
 *  - The day has a rain break (rain occurred then stopped), AND
 *  - The day-level weather suggests rain was significant (code >= 61 or
 *    isPostStorm), so this isn't just scattered light drizzle.
 */
export function isHourlyRainBreak(day: DailyForecast, weatherCode: number, hourIndex?: number): boolean {
  const precipitating =
    weatherCode === 51 || weatherCode === 53 || weatherCode === 55 ||
    weatherCode === 61 || weatherCode === 63 || weatherCode === 65 ||
    (weatherCode >= 71 && weatherCode <= 75) ||
    (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;
  if (precipitating) return false;
  // Require that rain actually stopped recently (within 3 hours). The
  // hourly `isRainBreakHour` in weatherService checks the preceding 3 hours;
  // this function must be consistent: "Rain Just Stopped" should only appear
  // when rain actually stopped within the last few hours, not any dry hour
  // on a rainy day.
  if (day.lastRainHour !== undefined && day.lastRainHour >= 0 && hourIndex !== undefined) {
    const hoursSinceRain = hourIndex - day.lastRainHour;
    // Rain stopped 1-3 hours ago → this is the "just stopped" window.
    // Also allow the hour AFTER rain stops (hoursSinceRain === 0 means
    // this hour had rain, which is already filtered above).
    if (hoursSinceRain >= 0 && hoursSinceRain <= 3) {
      return day.hasRainBreak === true;
    }
    return false;
  }
  // Fallback: if lastRainHour is unavailable, use the day-level weather code
  // to determine if rain was significant enough to warrant the signal.
  return day.hasRainBreak === true &&
    (day.weatherCode >= 61 || day.weatherCode === 80 || day.weatherCode === 81 || day.weatherCode === 82 || day.isPostStorm);
}

export function formatTimeRange12h(start: Date | string, end: Date | string): string {
  return `${format12HourTime(start)} - ${format12HourTime(end)}`;
}

/**
 * Calculates Solunar times & moon phase for a given date and location.
 *
 * Batch 2: now uses real lunar astronomy (transit, rise/set) via
 * astronomy-engine. Falls back to the legacy sunrise/sunset-offset
 * heuristic whenever the real calculation produces null values or the
 * astronomy library throws, so solunar never disappears from the
 * dashboard.
 */
export function calculateSolunar(dateStr: string, lat: number, lon: number, sunriseStr: string, sunsetStr: string): SolunarInfo {
  const date = new Date(dateStr);

  // Parse sunrise & sunset
  const sunriseTime = sunriseStr ? format12HourTime(sunriseStr) : '6:30 AM';
  const sunsetTime = sunsetStr ? format12HourTime(sunsetStr) : '6:45 PM';

  // --- Real astronomy (preferred path) ---
  const moonTimes = calculateMoonTimes(date, lat, lon);

  // Major periods: moon overhead (upper transit) and underfoot (lower transit).
  // Each is a 2-hour window centered on the transit time.
  const major1Start = moonTimes.upperTransit ? new Date(moonTimes.upperTransit.getTime() - 3600000) : null;
  const major1End = moonTimes.upperTransit ? new Date(moonTimes.upperTransit.getTime() + 3600000) : null;

  const major2Start = moonTimes.lowerTransit ? new Date(moonTimes.lowerTransit.getTime() - 3600000) : null;
  const major2End = moonTimes.lowerTransit ? new Date(moonTimes.lowerTransit.getTime() + 3600000) : null;

  // Minor periods: moonrise and moonset, each ±1h.
  const minor1Start = moonTimes.moonrise ? new Date(moonTimes.moonrise.getTime() - 3600000) : null;
  const minor1End = moonTimes.moonrise ? new Date(moonTimes.moonrise.getTime() + 3600000) : null;

  const minor2Start = moonTimes.moonset ? new Date(moonTimes.moonset.getTime() - 3600000) : null;
  const minor2End = moonTimes.moonset ? new Date(moonTimes.moonset.getTime() + 3600000) : null;

  // --- Legacy phase / window fallback ---
  // Phase is computed from a fixed reference new moon (Jan 11, 2024)
  // and the synodic month — same formula the real calculator uses
  // underneath, so we keep it as a guaranteed fallback for when
  // astronomy throws.
  const refDate = new Date('2024-01-11').getTime();
  const diffDays = (date.getTime() - refDate) / (1000 * 60 * 60 * 24);
  const moonCycle = (diffDays % 29.530588 + 29.530588) % 29.530588;
  const fallbackPhase = moonCycle / 29.530588;
  const fallbackIllumination = Math.round((1 - Math.cos(fallbackPhase * 2 * Math.PI)) / 2 * 100);

  let fallbackPhaseName = 'New Moon';
  if (fallbackPhase > 0.03 && fallbackPhase < 0.22) fallbackPhaseName = 'Waxing Crescent';
  else if (fallbackPhase >= 0.22 && fallbackPhase <= 0.28) fallbackPhaseName = 'First Quarter';
  else if (fallbackPhase > 0.28 && fallbackPhase < 0.47) fallbackPhaseName = 'Waxing Gibbous';
  else if (fallbackPhase >= 0.47 && fallbackPhase <= 0.53) fallbackPhaseName = 'Full Moon';
  else if (fallbackPhase > 0.53 && fallbackPhase < 0.72) fallbackPhaseName = 'Waning Gibbous';
  else if (fallbackPhase >= 0.72 && fallbackPhase <= 0.78) fallbackPhaseName = 'Last Quarter';
  else if (fallbackPhase > 0.78 && fallbackPhase < 0.97) fallbackPhaseName = 'Waning Crescent';

  const srDate = sunriseStr ? new Date(sunriseStr) : new Date(new Date(dateStr).setHours(6, 30));
  const ssDate = sunsetStr ? new Date(sunsetStr) : new Date(new Date(dateStr).setHours(18, 45));

  const fallbackMajor1Start = new Date(srDate.getTime() + (fallbackPhase * 2 - 1) * 3600000 - 3600000);
  const fallbackMajor1End = new Date(fallbackMajor1Start.getTime() + 7200000);
  const fallbackMajor2Start = new Date(ssDate.getTime() + (fallbackPhase * 2 - 1) * 3600000 - 3600000);
  const fallbackMajor2End = new Date(fallbackMajor2Start.getTime() + 7200000);
  const fallbackMinor1Start = new Date(srDate.getTime() - 7200000);
  const fallbackMinor1End = new Date(fallbackMinor1Start.getTime() + 3600000);
  const fallbackMinor2Start = new Date(ssDate.getTime() + 5400000);
  const fallbackMinor2End = new Date(fallbackMinor2Start.getTime() + 3600000);

  return {
    // Nullish coalescing (??) on purpose — a real new moon has phase 0
    // and 0% illumination, so the || operator would falsely fall back to
    // the heuristic.
    moonPhase: moonTimes.moonPhase ?? fallbackPhase,
    moonPhaseName: moonTimes.moonPhaseName ?? fallbackPhaseName,
    moonIllumination: moonTimes.moonIllumination ?? fallbackIllumination,
    major1: major1Start && major1End ? formatTimeRange12h(major1Start, major1End) : formatTimeRange12h(fallbackMajor1Start, fallbackMajor1End),
    major2: major2Start && major2End ? formatTimeRange12h(major2Start, major2End) : formatTimeRange12h(fallbackMajor2Start, fallbackMajor2End),
    minor1: minor1Start && minor1End ? formatTimeRange12h(minor1Start, minor1End) : formatTimeRange12h(fallbackMinor1Start, fallbackMinor1End),
    minor2: minor2Start && minor2End ? formatTimeRange12h(minor2Start, minor2End) : formatTimeRange12h(fallbackMinor2Start, fallbackMinor2End),
    sunrise: sunriseTime,
    sunset: sunsetTime,
  };
}

/**
 * Calculates deer movement hunt score (0-100) and breakdown factors
 *
 * Batch 1 (season-aware scoring + humidity + gusts):
 *   - `tempDeltaF` (optional): the day's max temperature deviation from a
 *     rolling 30-day climatological normal for the location. When
 *     provided, the Temperature factor scores against deviation bands
 *     instead of absolute thresholds. When null/undefined, the legacy
 *     absolute thresholds are used so existing callers keep working.
 *   - `humidity` (optional): relative humidity 0-100. Powers the new
 *     Scent & Humidity factor.
 *   - `windGustMph` (optional): 10m wind gust. Adds a swirling-scent
 *     penalty to the Wind Speed factor when gust - sustained > 15 mph.
 */
export function calculateHuntScore(params: {
  tempDrop24h: number; // in °F or °C drop (positive if drop/cooling)
  maxTempF: number;
  minTempF: number;
  pressureInHg: number;
  pressureTrend: PressureTrend;
  windMph: number;
  weatherCode: number;
  isPostStorm: boolean;
  hasRainBreak?: boolean;
  solunar: SolunarInfo;
  hour?: number;
  isPrimeWindow?: boolean;
  units?: UnitSystem;
  pressureUnit?: PressureUnit;
  dateStr?: string;
  location?: Location;
  // Batch 1 additions:
  tempDeltaF?: number | null;
  humidity?: number | null;
  windGustMph?: number | null;
}): { score: number; rating: DailyForecast['rating']; verdict: string; factors: ScoreFactor[] } {
  // Start at an intentionally neutral midpoint. Forecast conditions can help
  // choose *when* to hunt, but they cannot reliably predict animal movement
  // with the precision implied by the former, very large bonuses.
  let totalScore = 50;
  const factors: ScoreFactor[] = [];

  const isHourly = params.hour !== undefined;
  const hourLabel = isHourly ? getHour12Label(params.hour!) : '';

  const isMetric = params.units === 'metric';
  const isHpa = params.pressureUnit === 'hPa';

  const tempUnitStr = isMetric ? '°C' : '°F';
  const tempDropVal = params.tempDrop24h;
  const maxTempDisp = params.maxTempF;
  const minTempDisp = params.minTempF;

  // Convert to Fahrenheit for threshold checking if inputs are metric
  const maxTempCheckF = isMetric ? Math.round((params.maxTempF * 9) / 5 + 32) : params.maxTempF;
  const minTempCheckF = isMetric ? Math.round((params.minTempF * 9) / 5 + 32) : params.minTempF;
  const tempDropCheckF = isMetric ? Math.round((params.tempDrop24h * 9) / 5) : params.tempDrop24h;

  const pressUnitStr = isHpa ? 'hPa' : 'inHg';
  const pressDisp = isHpa ? Math.round(params.pressureInHg / 0.02953) : params.pressureInHg;

  const windUnitStr = isMetric ? 'km/h' : 'mph';
  const windDisp = isMetric ? Math.round(params.windMph * 1.60934) : params.windMph;

  // Factor 1: Temperature (Cooler vs Hot, season-relative when tempDeltaF provided)
  let tempScore = 0;
  let tempDesc = '';
  let tempStatus: ScoreFactor['status'] = 'neutral';

  const useSeasonRelative = typeof params.tempDeltaF === 'number' && Number.isFinite(params.tempDeltaF);
  if (useSeasonRelative) {
    // Deviation from the location's 30-day rolling normal (Batch 1).
    // Deer movement tracks deviation, not absolute degrees — a 72°F day in
    // December and a 72°F day in September should not score identically.
    const deltaF = params.tempDeltaF as number;
    const roundingPositive = (n: number) => Math.round(Math.abs(n));
    if (deltaF >= 12) {
      tempScore = -20;
      tempStatus = 'poor';
      tempDesc = `Unseasonably warm (+${roundingPositive(deltaF)}${tempUnitStr} above recent normal). High heat suppresses daylight travel.`;
    } else if (deltaF >= 6) {
      tempScore = -10;
      tempStatus = 'poor';
      tempDesc = `Warmer than normal (+${roundingPositive(deltaF)}${tempUnitStr}). Slightly limits open daylight movement.`;
    } else if (deltaF > -6) {
      // within ±6°F of normal
      tempScore = 5;
      tempStatus = 'good';
      tempDesc = `Near seasonal normal (${deltaF >= 0 ? '+' : ''}${Math.round(deltaF)}${tempUnitStr}). Typical activity expected.`;
    } else if (deltaF > -14) {
      tempScore = 10;
      tempStatus = 'optimal';
      tempDesc = `Below seasonal normal (-${roundingPositive(deltaF)}${tempUnitStr}). Cooler air drives active feeding.`;
    } else {
      // Very cold anomaly — movement bonus still applies but cap strength so
      // extreme cold doesn't fake a perfect score.
      tempScore = 5;
      tempStatus = 'good';
      tempDesc = `Far below seasonal normal (-${roundingPositive(deltaF)}${tempUnitStr}). Cold-front surge, but extreme cold can also suppress travel.`;
    }
  } else {
    // Legacy absolute thresholds (Batch 1 fallback when no climate normal).
    if (maxTempCheckF >= 78) {
      tempScore = -20;
      tempStatus = 'poor';
      tempDesc = `Unseasonably warm (${maxTempDisp}${tempUnitStr}). High heat suppresses daytime travel; deer remain bedded in shaded cover.`;
    } else if (maxTempCheckF >= 73) {
      tempScore = -10;
      tempStatus = 'poor';
      tempDesc = `Warm temperature (${maxTempDisp}${tempUnitStr}). Slightly limits open daylight movement.`;
    } else if (maxTempCheckF >= 66) {
      tempScore = 5;
      tempStatus = 'good';
      tempDesc = `Moderate temperature (${maxTempDisp}${tempUnitStr}). Normal seasonal activity expected.`;
    } else {
      // <= 65°F (18°C)
      tempScore = 15;
      tempStatus = 'optimal';
      tempDesc = `Cool crisp temperature (${maxTempDisp}${tempUnitStr}). Ideal thermal range for active daylight movement.`;
    }
  }

  totalScore += tempScore;
  factors.push({
    name: 'Temperature',
    score: tempScore,
    maxScore: 15,
    description: tempDesc,
    status: tempStatus,
  });

  // Factor 2: Temperature Trend. A day-to-day temperature change is useful
  // context, but it is less reliable than the current temperature and should
  // not dominate a score on its own.
  let trendScore = 0;
  let trendDesc = '';
  let trendStatus: ScoreFactor['status'] = 'neutral';

  if (tempDropCheckF >= 15) {
    trendScore = 8;
    trendStatus = 'optimal';
    trendDesc = `Major Cold Front! A sharp 24h temp drop of ${tempDropVal}${tempUnitStr} triggers massive feeding movement.`;
  } else if (tempDropCheckF >= 9) {
    trendScore = 6;
    trendStatus = 'optimal';
    trendDesc = `Rapid cooling trend! Temperature drop of ${tempDropVal}${tempUnitStr} (5–10°C) encourages active daylight travel.`;
  } else if (tempDropCheckF >= 4) {
    trendScore = 3;
    trendStatus = 'good';
    trendDesc = `Slight cooling trend (-${tempDropVal}${tempUnitStr} drop) favors daylight movement.`;
  } else if (tempDropCheckF <= -9) {
    trendScore = -6;
    trendStatus = 'poor';
    trendDesc = `Rapid warming trend (+${Math.abs(tempDropVal)}${tempUnitStr}). Sudden heat spike suppresses daylight activity.`;
  } else if (tempDropCheckF <= -5) {
    trendScore = -3;
    trendStatus = 'poor';
    trendDesc = `Warming trend (+${Math.abs(tempDropVal)}${tempUnitStr} increase) reduces open daytime movement.`;
  } else {
    trendScore = 0;
    trendStatus = 'neutral';
    trendDesc = `Stable 24h temperature trend (${tempDropVal === 0 ? '0' : tempDropVal > 0 ? `-${tempDropVal}` : `+${Math.abs(tempDropVal)}`}${tempUnitStr}).`;
  }

  totalScore += trendScore;
  factors.push({
    name: 'Temperature Trend',
    score: trendScore,
    maxScore: 8,
    description: trendDesc,
    status: trendStatus,
  });

  // Factor 3: Wind Speed (Light to moderate 8-20 km/h vs Dead calm <5 km/h or Strong >30 km/h)
  // Batch 1: also penalizes gusty conditions (gust - sustained > 15 mph),
  // which spook deer via swirling scent even when sustained winds are calm.
  let windScore = 0;
  let windDesc = '';
  let windStatus: ScoreFactor['status'] = 'neutral';

  const windKmh = Math.round(params.windMph * 1.60934);

  if (windKmh >= 8 && windKmh <= 20) { // 5 to 12.5 mph
    windScore = 10;
    windStatus = 'optimal';
    windDesc = `Ideal light to moderate wind (${windDisp} ${windUnitStr}). Provides steady scent stream without making deer skittish.`;
  } else if (windKmh < 5) { // < 3 mph
    windScore = -6;
    windStatus = 'poor';
    windDesc = `Dead calm wind (${windDisp} ${windUnitStr}). Stagnant air pools human scent around position and alerts skittish deer.`;
  } else if (windKmh > 30) { // > 19 mph
    windScore = -12;
    windStatus = 'poor';
    windDesc = `Very strong winds (${windDisp} ${windUnitStr}). Swirling scents and noisy woods force deer into thick sheltered cover.`;
  } else if (windKmh >= 5 && windKmh < 8) {
    windScore = 3;
    windStatus = 'good';
    windDesc = `Light breeze (${windDisp} ${windUnitStr}). Minimal wind noise; good for undetected movement.`;
  } else { // 21 to 30 km/h
    windScore = -3;
    windStatus = 'neutral';
    windDesc = `Breezy conditions (${windDisp} ${windUnitStr}). Focus on lee-sides of ridges and sheltered oak thickets.`;
  }

  // Gust penalty (Batch 1). Apply only when the sustained wind itself is
  // not already penalised as "strong" — strong sustained + gusts would
  // double-count. Cap the penalty at -4 so a gust spike can't outweigh a
  // calm-wind penalty.
  if (typeof params.windGustMph === 'number' && Number.isFinite(params.windGustMph)) {
    const gustMph = params.windGustMph as number;
    const gustDelta = Math.round(gustMph - params.windMph);
    if (gustDelta > 15 && windKmh <= 30) {
      const gustPenalty = -4;
      windScore += gustPenalty;
      windDesc = windDesc
        ? `${windDesc} Gusts to ${Math.round(gustMph)} mph (-${Math.abs(gustPenalty)}).`
        : `Gusty conditions: sustained ${Math.round(params.windMph)} mph, gusts ${Math.round(gustMph)} mph.`;
      if (windStatus === 'optimal') windStatus = 'good';
    }
  }

  totalScore += windScore;
  factors.push({
    name: 'Wind Speed',
    score: windScore,
    maxScore: 10,
    description: windDesc,
    status: windStatus,
  });

  // Factor 4: Barometric Pressure. Pressure is included as a small trend cue;
  // absolute station pressure varies substantially by elevation.
  let baroScore = 0;
  let baroDesc = '';
  let baroStatus: ScoreFactor['status'] = 'neutral';

  const isStormCode = params.weatherCode === 63 || params.weatherCode === 65 || params.weatherCode >= 95;

  if (params.pressureTrend === 'rapid_rise' || (params.pressureInHg >= 30.00 && params.pressureTrend === 'rising')) {
    baroScore = 6;
    baroStatus = 'optimal';
    baroDesc = `High / rising pressure (${pressDisp} ${pressUnitStr}). Clear post-front stability triggers heavy daylight movement.`;
  } else if (params.pressureTrend === 'rapid_drop' && isStormCode) {
    baroScore = -6;
    baroStatus = 'poor';
    baroDesc = `Rapidly falling pressure (${pressDisp} ${pressUnitStr}) before heavy storm. Atmospheric depression suppresses travel.`;
  } else if (params.pressureTrend === 'rapid_drop' || params.pressureTrend === 'falling') {
    baroScore = 4;
    baroStatus = 'good';
    baroDesc = `Falling barometric pressure (${pressDisp} ${pressUnitStr}). Pre-front shift prompts deer to feed before rain.`;
  } else if (params.pressureInHg >= 29.90) {
    baroScore = 3;
    baroStatus = 'good';
    baroDesc = `High barometric pressure (${pressDisp} ${pressUnitStr}). Favorable atmospheric stability.`;
  } else if (params.pressureInHg < 29.70) {
    baroScore = -3;
    baroStatus = 'poor';
    baroDesc = `Low barometric pressure (${pressDisp} ${pressUnitStr}). Low atmospheric pressure slows daytime travel.`;
  } else {
    baroScore = 0;
    baroStatus = 'neutral';
    baroDesc = `Moderate barometric pressure (${pressDisp} ${pressUnitStr}). Normal baseline activity.`;
  }

  totalScore += baroScore;
  factors.push({
    name: 'Barometric Pressure',
    score: baroScore,
    maxScore: 6,
    description: baroDesc,
    status: baroStatus,
  });

  // Factor 5: Precipitation. A rain break is only meaningful for the specific
  // dry hour immediately after measurable rain; callers should not flag an
  // entire mixed-weather day as a post-storm event.
  let precipScore = 0;
  let precipDesc = '';
  let precipStatus: ScoreFactor['status'] = 'neutral';

  const isCurrentlyPrecipitating = params.weatherCode === 51 || 
                                   params.weatherCode === 53 || 
                                   params.weatherCode === 55 || 
                                   params.weatherCode === 61 || 
                                   params.weatherCode === 63 || 
                                   params.weatherCode === 65 || 
                                   (params.weatherCode >= 71 && params.weatherCode <= 75) || 
                                   (params.weatherCode >= 80 && params.weatherCode <= 82) || 
                                   params.weatherCode >= 95;

  if ((params.hasRainBreak || params.isPostStorm) && !isCurrentlyPrecipitating) {
    precipScore = 8;
    precipStatus = 'optimal';
    precipDesc = 'Rain break / Post-storm clearing! Sudden stop in precipitation triggers an immediate surge in deer movement and feeding.';
  } else if (params.weatherCode === 51 || params.weatherCode === 53 || params.weatherCode === 55 || params.weatherCode === 45 || params.weatherCode === 48) {
    precipScore = 3;
    precipStatus = 'optimal';
    precipDesc = 'Light drizzle & mist. Damp ground silences footsteps while overcast sky encourages bold daylight cruising.';
  } else if (params.weatherCode >= 71 && params.weatherCode <= 75) {
    precipScore = 4;
    precipStatus = 'good';
    precipDesc = 'Active snowfall. Fresh snow and cold air trigger metabolic feeding surges near field edges.';
  } else if (params.weatherCode === 65 || params.weatherCode >= 95) {
    precipScore = -12;
    precipStatus = 'poor';
    precipDesc = 'Heavy rain / severe storms. High downpours and lightning force deer to remain bedded down.';
  } else if (params.weatherCode === 61 || params.weatherCode === 63) {
    precipScore = -4;
    precipStatus = 'poor';
    precipDesc = 'Steady active rain. Deer hold tight in thick thermal cover until precipitation eases.';
  } else {
    precipScore = 0;
    precipStatus = 'neutral';
    precipDesc = 'Fair conditions with clear skies or light cloud cover.';
  }

  totalScore += precipScore;
  factors.push({
    name: 'Precipitation',
    score: precipScore,
    maxScore: 12,
    description: precipDesc,
    status: precipStatus,
  });

  // Factor 6: Time of Day (Dawn/dusk prime hours vs Midday outside rut)
  let timeScore = 0;
  let timeDesc = '';
  let timeStatus: ScoreFactor['status'] = 'neutral';

  const rutInfo = params.dateStr ? getRutPhase(params.dateStr, params.location) : null;
  const isPeakRut = rutInfo?.phaseId === 'peak_rut' || rutInfo?.phaseId === 'pre_rut';

  if (isHourly) {
    const hr = params.hour!;
    if (params.isPrimeWindow) {
      timeScore = 16;
      timeStatus = 'optimal';
      timeDesc = `Prime window (${hourLabel})! First 2 hours after sunrise or last 2 hours before sunset are peak travel hours.`;
    } else if (hr >= 11 && hr <= 14) {
      if (isPeakRut) {
        timeScore = 3;
        timeStatus = 'good';
        timeDesc = `Midday shift during Peak Rut (${hourLabel}). Bucks actively cruise bedding areas all day seeking estrous does.`;
      } else {
        timeScore = -8;
        timeStatus = 'poor';
        timeDesc = `Midday lull (${hourLabel}). Outside the rut, deer remain bedded in deep security cover during warm midday hours.`;
      }
    } else {
      timeScore = 0;
      timeStatus = 'neutral';
      timeDesc = `Standard movement hour (${hourLabel}). Moon phase: ${params.solunar.moonPhaseName}.`;
    }
  } else {
    timeScore = 6;
    timeStatus = 'good';
    timeDesc = `Dawn and dusk shifts offer primary movement windows. Solunar moon phase: ${params.solunar.moonPhaseName}.`;
  }

  totalScore += timeScore;
  factors.push({
    name: 'Time of Day',
    score: timeScore,
    maxScore: 16,
    description: timeDesc,
    status: timeStatus,
  });

  // Factor 7: Rut Phase (Pre-rut, seeking, chasing, peak rut vs early/post-rut/summer)
  let rutScore = 0;
  let rutDesc = '';
  let rutStatus: ScoreFactor['status'] = 'neutral';

  if (rutInfo) {
    if (rutInfo.phaseId === 'peak_rut' || rutInfo.phaseId === 'pre_rut') {
      rutScore = 8;
      rutStatus = 'optimal';
      rutDesc = `Prime Rut Phase (${rutInfo.name}): Pre-rut scraping, seeking, and chasing frenzy! Daylight buck movement is at its seasonal peak.`;
    } else if (rutInfo.phaseId === 'lockdown') {
      rutScore = 2;
      rutStatus = 'good';
      rutDesc = `Lockdown Phase: Bucks are paired with receptive does in thick cover. Cruising drops but trophy bucks are present.`;
    } else if (rutInfo.phaseId === 'early' || rutInfo.phaseId === 'post_rut') {
      rutScore = 0;
      rutStatus = 'neutral';
      rutDesc = `${rutInfo.name}: Early or post-rut patterns. Buck daylight travel is moderate and tightly tied to feeding areas.`;
    } else {
      rutScore = -2;
      rutStatus = 'poor';
      rutDesc = `${rutInfo.name}: Outside active rut periods. Bucks follow strict bed-to-feed nocturnal or low-activity routines.`;
    }
  } else {
    rutScore = 0;
    rutStatus = 'neutral';
    rutDesc = 'Standard seasonal patterns apply.';
  }

  totalScore += rutScore;
  factors.push({
    name: 'Rut Phase',
    score: rutScore,
    maxScore: 8,
    description: rutDesc,
    status: rutStatus,
  });

  // Factor 8: Solunar activity. Moon phase and the calculated feeding periods
  // are a supporting signal; cap their contribution so they complement rather
  // than override current weather, wind, and the time of day.
  let solunarScore = 0;
  let solunarDesc = '';
  let solunarStatus: ScoreFactor['status'] = 'neutral';

  const moonPhaseName = params.solunar?.moonPhaseName || 'New Moon';
  const moonIllumination = params.solunar?.moonIllumination !== undefined ? params.solunar.moonIllumination : 0;

  if (moonPhaseName === 'Full Moon') {
    solunarScore = 5;
    solunarStatus = 'optimal';
    solunarDesc = `Full Moon (${moonIllumination}% illumination). Strong solunar conditions can increase movement around the listed major periods.`;
  } else if (moonPhaseName === 'New Moon') {
    solunarScore = 3;
    solunarStatus = 'good';
    solunarDesc = `New Moon (${moonIllumination}% illumination). Favorable dark-night conditions support normal dawn and dusk movement.`;
  } else if (moonPhaseName === 'Waxing Gibbous' || moonPhaseName === 'Waning Gibbous') {
    solunarScore = 2;
    solunarStatus = 'good';
    solunarDesc = `Gibbous moon (${moonIllumination}% illumination). Moderate solunar lift, especially near the major periods.`;
  } else {
    solunarScore = 1;
    solunarStatus = 'neutral';
    solunarDesc = `${moonPhaseName} (${moonIllumination}% illumination). A small solunar contribution; prioritize the forecasted weather and wind.`;
  }

  totalScore += solunarScore;
  factors.push({
    name: 'Solunar',
    score: solunarScore,
    maxScore: 5,
    description: solunarDesc,
    status: solunarStatus,
  });

  // Factor 9 (Batch 1): Scent & Humidity. Humidity is already fetched from
  // Open-Meteo (relativehumidity_2m) but was previously discarded; this
  // makes it a small but meaningful driver of deer scent-detection
  // conditions. Wet ground silences footsteps, high humidity holds scent
  // in thermals; very dry air means crunchy leaves and sinking scent.
  let scentScore = 0;
  let scentDesc = '';
  let scentStatus: ScoreFactor['status'] = 'neutral';

  if (typeof params.humidity === 'number' && Number.isFinite(params.humidity)) {
    const humidity = params.humidity as number;
    const fogCode = params.weatherCode === 45 || params.weatherCode === 48;
    if (humidity >= 75 && humidity <= 95) {
      scentScore = 6;
      scentStatus = 'optimal';
      scentDesc = `High humidity (${Math.round(humidity)}%) holds scent in thermals and dampens ground noise.`;
    } else if (humidity >= 60 && humidity < 75) {
      scentScore = 3;
      scentStatus = 'good';
      scentDesc = `Moderate humidity (${Math.round(humidity)}%) keeps scent workable.`;
    } else if (humidity > 95 && fogCode) {
      scentScore = 3;
      scentStatus = 'good';
      scentDesc = `Foggy and very humid (${Math.round(humidity)}%) — woods stay still but visibility drops.`;
    } else if (humidity > 95) {
      scentScore = 0;
      scentStatus = 'neutral';
      scentDesc = `Very humid (${Math.round(humidity)}%) without fog. Scent holds but conditions feel heavy.`;
    } else if (humidity < 35) {
      scentScore = -3;
      scentStatus = 'poor';
      scentDesc = `Dry air (${Math.round(humidity)}%) — crunchy leaves and sinking scent work against you.`;
    } else {
      scentScore = 0;
      scentStatus = 'neutral';
      scentDesc = `Average humidity (${Math.round(humidity)}%). No strong scent signal either way.`;
    }
  } else {
    // No humidity supplied by caller (legacy callers / fallback forecast).
    scentScore = 0;
    scentStatus = 'neutral';
    scentDesc = 'Humidity data unavailable.';
  }

  totalScore += scentScore;
  factors.push({
    name: 'Scent & Humidity',
    score: scentScore,
    maxScore: 6,
    description: scentDesc,
    status: scentStatus,
  });

  // Clamp final score between 15 and 99
  const finalScore = Math.min(99, Math.max(15, Math.round(totalScore)));

  let rating: DailyForecast['rating'] = 'Fair';
  let verdict = '';

  if (finalScore >= RATING_THRESHOLDS.excellent) {
    rating = 'Great';
    verdict = 'GO HUNTING! Cold front, pressure shift, or post-storm clearing creates top-tier buck movement.';
  } else if (finalScore >= RATING_THRESHOLDS.good) {
    rating = 'Good';
    verdict = 'High-probability hunt day. Key movement expected during early morning and late afternoon hunt shifts.';
  } else if (finalScore >= RATING_THRESHOLDS.fair) {
    rating = 'Fair';
    verdict = 'Moderate activity expected. Pay close attention to Solunar major/minor feeding periods.';
  } else {
    rating = 'Poor';
    verdict = 'Challenging conditions due to high heat, high wind, or low stagnant pressure. Focus on deep bedding thickets.';
  }

  return {
    score: finalScore,
    rating,
    verdict,
    factors,
  };
}

/**
 * Returns a specific, detailed explanation for why the score dial is what it is
 * based on current or selected weather, precipitation, rain breaks, wind, and temp.
 */
export function getDetailedConditionExplanation(
  day: DailyForecast,
  hourData: HourlyForecast | null,
  units: UnitSystem = 'imperial',
  pressureUnit: PressureUnit = 'inHg'
): { headline: string; detail: string; badgeColor: string } {
  const weatherCode = hourData ? hourData.weatherCode : day.weatherCode;
  const windMph = hourData ? hourData.windSpeedMph : day.windSpeedMaxMph;
  const tempF = hourData ? hourData.temp : day.maxTemp;
  const pressureTrend = day.pressureTrend;
  const score = hourData ? hourData.huntScore : day.huntScore;
  
  // Check if it is currently precipitating at the active/selected hour
  const isPrecipitating = weatherCode === 51 || weatherCode === 53 || weatherCode === 55 || weatherCode === 61 || weatherCode === 63 || weatherCode === 65 || (weatherCode >= 71 && weatherCode <= 75) || (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;

  const isPostStorm = hourData
    ? (day.isPostStorm && !isPrecipitating)
    : day.isPostStorm;
  const tempDrop = day.tempDrop24h;

  // Check if current hour or day represents a break in the rain.
  // Pass the hour index so isHourlyRainBreak can verify rain stopped recently.
  const hourIndex = hourData?.timestamp ? new Date(hourData.timestamp).getHours() : undefined;
  const hasRainBreak = hourData
    ? isHourlyRainBreak(day, hourData.weatherCode, hourIndex)
    // Day-level fallback: only show rain break if rain stopped within the
    // last few hours (lastRainHour check) or the day is a post-storm day.
    : (day.hasRainBreak === true && day.isPostStorm);

  // 1. Heavy Rain & Storms (Codes 65, 95, 96, 99)
  if (weatherCode === 65 || weatherCode >= 95) {
    return {
      headline: 'Poor time to hunt - Heavy Rain & Storms',
      detail: 'Heavy precipitation and active storm conditions force deer to stay bedded down in thick thermal cover to conserve heat and avoid heavy downpours.',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 2. Break in the rain / Rain Stopped / Post Storm
  if (hasRainBreak || (isPostStorm && weatherCode <= 3)) {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Unfavorable Post-Rain Conditions',
        detail: 'Although the rain has stopped, other negative factors (such as extreme temperatures or highly unfavorable wind directions) are keeping active travel extremely low.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Great time to hunt - Rain Just Stopped',
      detail: 'The rain has stopped and skies are clearing. The sudden break in precipitation triggers deer to leave bedding cover immediately to feed, stretch, and groom.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 3. Steady Active Rain (Codes 61, 63)
  if (weatherCode === 61 || weatherCode === 63) {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Active Steady Rain',
        detail: 'Steady rain is falling, and other negative parameters have combined to keep deer firmly bedded down in heavy shelter.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Fair time to hunt - Active Rain',
      detail: 'Steady rain dampens scent and silences woods, but keeps deer bedded in thick cover. Be positioned and ready for a surge as soon as the rain eases up.',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    };
  }

  // 4. Light Drizzle / Fog (Codes 51, 53, 55, 45, 48)
  if (weatherCode === 51 || weatherCode === 53 || weatherCode === 55 || weatherCode === 45 || weatherCode === 48) {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Low Activity with Drizzle/Fog',
        detail: 'Despite quiet damp ground, extremely warm temperatures or bad wind alignments are canceling out any potential feeding activity.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Good time to hunt - Light Drizzle & Fog',
      detail: 'Light drizzle and damp ground silence footsteps while high humidity and overcast conditions encourage deer to travel openly before dark.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 5. Snowfall (Codes 71-75)
  if (weatherCode >= 71 && weatherCode <= 75) {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Stormy Snowfall Conditions',
        detail: 'Active snowfall is occurring, but severe swirling wind gusts or intense temperature dips have forced deer to seek deep security cover.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Good time to hunt - Active Snowfall',
      detail: 'Fresh snowfall and cold air trigger metabolic feeding surges before and after snow accumulation along field edges and timber cuts.',
      badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    };
  }

  // 6. High Heat (tempF >= 78°F)
  if (tempF >= 78) {
    return {
      headline: 'Poor time to hunt - High Heat Warning',
      detail: `Unseasonably warm temperatures (${tempF}°F) suppress daytime deer travel. Deer stay bedded in dense shade near water sources until dusk.`,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 7. High Gusty Winds (windMph >= 18)
  if (windMph >= 18) {
    return {
      headline: 'Poor time to hunt - High Swirling Winds' ,
      detail: `Strong gusty winds (${windMph} mph) create extremely noisy woods and unstable swirling scent corridors, shutting down active daytime movement.`,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 8. Barometric Pressure Trends
  if (pressureTrend === 'rapid_drop') {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Front Swirling Winds',
        detail: 'The barometer is dropping, but other severe negative parameters like poor wind direction or high heat are holding deer bedded.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Great time to hunt - Barometer Falling Rapidly',
      detail: 'Rapidly falling barometric pressure ahead of a weather front prompts deer to move heavily to feed before bad weather arrives.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  if (pressureTrend === 'rapid_rise') {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Ineffective Rising Barometer',
        detail: 'Pressure is rising post-front, but severe heat or bad winds are canceling out the standard feeding surge.',
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Great time to hunt - Barometer Rising Post-Front',
      detail: 'Rising barometric pressure behind a passing weather front brings clear, high-pressure air that stimulates active daylight feeding movement.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 9. Cold Front Hit
  if (tempDrop >= 8) {
    if (score < 46) {
      return {
        headline: 'Poor time to hunt - Suppressed Cold Front',
        detail: `The temperature dropped by ${tempDrop}°F, but other negative weather patterns or poor wind directions have suppressed deer travel.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'Great time to hunt - Cold Front Hit',
      detail: `A sharp 24-hour temperature drop of ${tempDrop}°F triggers a cold front surge, prompting bucks to move heavily in daylight to generate thermal energy.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 10. Default Score-Based Explanations
  // Batch 3: aligned to the centralised RATING_THRESHOLDS so the headline
  // copy never contradicts the dial rating.
  if (score >= RATING_THRESHOLDS.excellent) {
    return {
      headline: 'Great time to hunt - Top-Tier Conditions',
      detail: 'Almost every factor lines up. A cold front, post-storm clearing, or ideal seasonal conditions are converging for a top-tier window.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  } else if (score >= RATING_THRESHOLDS.good) {
    return {
      headline: 'Great time to hunt - Ideal Weather Alignment',
      detail: 'Cool temperatures, favorable barometric pressure, and steady wind vectors align to create optimal atmospheric conditions for daylight deer travel.',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  } else if (score >= RATING_THRESHOLDS.fair) {
    return {
      headline: 'Good time to hunt - Moderate Weather Conditions',
      detail: 'Steady weather parameters. Focus on key twilight transition hours when temperatures cool and thermal winds stabilize.',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    };
  } else {
    return {
      headline: 'Poor time to hunt - Unfavorable Weather Conditions',
      detail: 'Warm air temperatures, stagnant pressure, or erratic wind currents limit open daylight travel. Target dense security bedding cover.',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }
}

/**
 * Determines the absolute Best Hunt of the Day time range.
 * Compares morning and evening hourly temperatures, wind, and precipitation
 * to choose the highest-rated time window.
 */
export function getBestHuntTime(day: DailyForecast): string {
  if (!day.hourly || day.hourly.length === 0) {
    return day.morningPrime;
  }

  let bestHour: HourlyForecast | null = null;
  let bestScore = -Infinity;

  for (const h of day.hourly) {
    let score = h.huntScore * 10;

    // Penalize extreme heat
    score -= h.temp;

    // Favor ideal wind (4-12 mph)
    if (h.windSpeedMph >= 4 && h.windSpeedMph <= 12) {
      score += 15;
    } else if (h.windSpeedMph > 20) {
      score -= 30;
    }

    // Penalize high precipitation
    score -= h.precipProbability * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestHour = h;
    }
  }

  if (!bestHour) {
    return day.morningPrime;
  }

  const hDate = new Date(bestHour.timestamp);
  const hourNum = hDate.getHours();

  if (hourNum < 12) {
    return day.morningPrime;
  } else {
    return day.eveningPrime;
  }
}

const DIRECTION_DEGREES: Record<string, number> = {
  'N': 0,
  'NNE': 22.5,
  'NE': 45,
  'ENE': 67.5,
  'E': 90,
  'ESE': 112.5,
  'SE': 135,
  'SSE': 157.5,
  'S': 180,
  'SSW': 202.5,
  'SW': 225,
  'WSW': 247.5,
  'W': 270,
  'WNW': 292.5,
  'NW': 315,
  'NNW': 337.5,
};

export function getBestStandForWind(windDeg: number): { name: string; type: string; idealWind: string } | null {
  try {
    const pins: SavedPin[] = safeGetJSON<SavedPin[]>('letshunt_saved_pins', []);
    if (pins.length === 0) return null;
    // Home / Cabin is a starting point, not a hunting location, so it can never
    // be recommended as the best stand for the current wind direction.
    const standsWithWind = pins.filter(p => p.type !== 'home' && ((p.preferredWindDeg !== undefined) || (p.preferredWind && p.preferredWind.length > 0)));
    if (standsWithWind.length === 0) return null;

    let bestPin: SavedPin | null = null;
    let minDiff = Infinity;
    let bestIdealWind = '';

    for (const pin of standsWithWind) {
      if (pin.preferredWindDeg !== undefined) {
        const diff = Math.abs(pin.preferredWindDeg - windDeg);
        const shortestDiff = Math.min(diff, 360 - diff);
        if (shortestDiff < minDiff) {
          minDiff = shortestDiff;
          bestPin = pin;
          bestIdealWind = `${Math.round(pin.preferredWindDeg)}° (${getWindDirectionText(pin.preferredWindDeg)})`;
        }
      }
      if (pin.preferredWind) {
        for (const w of pin.preferredWind) {
          const pDeg = DIRECTION_DEGREES[w.toUpperCase()] ?? 0;
          const diff = Math.abs(pDeg - windDeg);
          const shortestDiff = Math.min(diff, 360 - diff);
          if (shortestDiff < minDiff) {
            minDiff = shortestDiff;
            bestPin = pin;
            bestIdealWind = w;
          }
        }
      }
    }

    if (!bestPin) return null;
    return {
      name: bestPin.name,
      type: bestPin.type,
      idealWind: bestIdealWind,
    };
  } catch (e) {
    return null;
  }
}

function parseSolunarTimeRange(
  rangeStr: string,
  referenceDate: Date
): { start: number; end: number } | null {
  const parts = rangeStr.split(' - ');
  if (parts.length !== 2) return null;

  const parseToMs = (timeStr: string): number | null => {
    const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(referenceDate);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  };

  const start = parseToMs(parts[0]);
  const end = parseToMs(parts[1]);
  if (start === null || end === null) return null;
  return { start, end };
}

export function getSolunarRating(
  timestamp: number,
  solunar: SolunarInfo
): 'High' | 'Medium' | 'Normal' {
  const date = new Date(timestamp);
  const major1 = parseSolunarTimeRange(solunar.major1, date);
  const major2 = parseSolunarTimeRange(solunar.major2, date);
  const minor1 = parseSolunarTimeRange(solunar.minor1, date);
  const minor2 = parseSolunarTimeRange(solunar.minor2, date);

  if (major1 && timestamp >= major1.start && timestamp <= major1.end) return 'High';
  if (major2 && timestamp >= major2.start && timestamp <= major2.end) return 'High';
  if (minor1 && timestamp >= minor1.start && timestamp <= minor1.end) return 'Medium';
  if (minor2 && timestamp >= minor2.start && timestamp <= minor2.end) return 'Medium';

  return 'Normal';
}
