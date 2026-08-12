import { DailyForecast, HourlyForecast, Location, PressureTrend, UnitSystem, PressureUnit } from '../types';
import {
  calculateHuntScore,
  calculateSolunar,
  celsiusToFahrenheit,
  format12HourTime,
  formatTimeRange12h,
  getRatingFromScore,
  isPrimeDay,
  getSolunarRating,
  getWeatherDetails,
  getWindDirectionText,
  hpaToInHg,
  kmhToMph,
} from '../utils/huntingEngine';

const DEFAULT_LOCATION: Location = {
  name: 'Madison',
  admin1: 'Wisconsin',
  country: 'United States',
  latitude: 43.0731,
  longitude: -89.4012,
};

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/**
 * Compute a representative daily weather condition from the 24 hourly weather
 * codes. Open-Meteo's daily `weathercode` picks the "most significant" code
 * for the whole day, which can be misleading — e.g. a single hour of passing
 * showers (code 80) makes the entire day show "Passing Showers" even when
 * 23 out of 24 hours are clear.
 *
 * Strategy:
 * 1. Count hours by category (rain, fog, clear, cloudy).
 * 2. Detect rain patterns: single block vs scattered on-and-off.
 * 3. Pick the most representative description based on the pattern.
 */
function computeRepresentativeDailyWeather(
  hourlyCodes: number[],
  fallbackCode: number,
): { code: number; desc: string; icon: string } {
  if (!hourlyCodes || hourlyCodes.length === 0) {
    return { code: fallbackCode, ...getWeatherDetails(fallbackCode) };
  }

  const isRain = (c: number) =>
    (c >= 51 && c <= 65) || (c >= 80 && c <= 82) || c >= 95;
  const isFog = (c: number) => c === 45 || c === 48;
  const isClear = (c: number) => c <= 1;
  const isCloudy = (c: number) => c === 2 || c === 3;
  const isHeavyRain = (c: number) => c === 63 || c === 65 || c >= 95;
  const isLightRain = (c: number) => (c >= 51 && c <= 55) || c === 61 || (c >= 80 && c <= 82);

  let rainHours = 0;
  let fogHours = 0;
  let clearHours = 0;
  let cloudyHours = 0;
  let heavyRainHours = 0;
  let lightRainHours = 0;
  const total = hourlyCodes.length;

  // Track rain blocks: count transitions from non-rain → rain → non-rain
  let rainBlocks = 0;
  let wasRaining = false;
  let worstRainCode = 0;
  // Track longest dry gap between rain blocks
  let maxDryGap = 0;
  let currentDryGap = 0;
  let inRainBlock = false;
  let firstRainIdx = -1;
  let lastRainIdx = -1;

  for (let i = 0; i < total; i++) {
    const c = hourlyCodes[i];
    if (isRain(c)) {
      rainHours++;
      if (isHeavyRain(c)) heavyRainHours++;
      else lightRainHours++;
      if (c > worstRainCode) worstRainCode = c;
      if (firstRainIdx === -1) firstRainIdx = i;
      lastRainIdx = i;
      if (!wasRaining) rainBlocks++;
      wasRaining = true;
      currentDryGap = 0;
      inRainBlock = true;
    } else {
      if (isFog(c)) fogHours++;
      else if (isClear(c)) clearHours++;
      else if (isCloudy(c)) cloudyHours++;
      wasRaining = false;
      if (inRainBlock) {
        currentDryGap++;
        if (currentDryGap > maxDryGap) maxDryGap = currentDryGap;
      }
      if (currentDryGap >= 2) inRainBlock = false; // gap is long enough to be a break
    }
  }

  const rainPct = rainHours / total;
  const dryHours = total - rainHours;

  // --- Pattern 1: Minimal rain (< 4 h) — mostly fair ---
  if (rainPct < 4 / 24) {
    if (fogHours >= clearHours && fogHours >= cloudyHours && fogHours > 0) {
      return { code: 45, ...getWeatherDetails(45) };
    }
    if (clearHours >= cloudyHours) {
      return { code: clearHours > total / 2 ? 0 : 1, ...getWeatherDetails(clearHours > total / 2 ? 0 : 1) };
    }
    return { code: 3, ...getWeatherDetails(3) };
  }

  // --- Pattern 2: On-and-off rain with clear breaks (scattered showers) ---
  // Rain occurs in 2+ separate blocks with meaningful dry gaps between them.
  if (rainBlocks >= 2 && maxDryGap >= 2) {
    if (heavyRainHours > 0) {
      return { code: worstRainCode, desc: 'Rainy with clear breaks', icon: 'CloudRain' };
    }
    return { code: 80, desc: 'Showers with sunny intervals', icon: 'CloudRain' };
  }

  // --- Pattern 3: Rain is the dominant condition ---
  if (rainPct >= 0.5) {
    // More than half the day is rainy
    if (heavyRainHours > rainHours * 0.3) {
      return { code: worstRainCode, ...getWeatherDetails(worstRainCode) };
    }
    // Mostly light rain/drizzle
    if (clearHours >= 2) {
      return { code: 61, desc: 'Rainy with clear breaks', icon: 'CloudRain' };
    }
    return { code: worstRainCode, ...getWeatherDetails(worstRainCode) };
  }

  // --- Pattern 4: Moderate rain (4-50% of day) with clear breaks ---
  if (clearHours >= 3 && rainHours >= 4) {
    // Significant dry windows exist between rain
    if (heavyRainHours > 0) {
      return { code: worstRainCode, desc: 'Rainy with clear breaks', icon: 'CloudRain' };
    }
    return { code: 80, desc: 'Showers with sunny intervals', icon: 'CloudRain' };
  }

  // --- Pattern 5: Brief light showers (< 25% of day) ---
  if (rainPct < 0.25 && lightRainHours === rainHours) {
    // All rain is light — soften to partly cloudy
    return { code: 2, ...getWeatherDetails(2) };
  }

  // --- Fallback: use the worst rain code ---
  return { code: worstRainCode, ...getWeatherDetails(worstRainCode) };
}

function pressureTrendFromChange(changeHpa: number): PressureTrend {
  // Compare short averages rather than individual readings to avoid reacting
  // to noise. Thresholds are deliberately conservative (hPa over ~3 hours).
  if (changeHpa >= 2.5) return 'rapid_rise';
  if (changeHpa >= 1) return 'rising';
  if (changeHpa <= -2.5) return 'rapid_drop';
  if (changeHpa <= -1) return 'falling';
  return 'steady';
}

function getPressureTrend(pressures: number[], endIndex: number): PressureTrend {
  const current = average(pressures.slice(Math.max(0, endIndex - 2), endIndex + 1));
  const previous = average(pressures.slice(Math.max(0, endIndex - 5), Math.max(0, endIndex - 2)));
  return current && previous ? pressureTrendFromChange(current - previous) : 'steady';
}

export async function searchLocations(query: string): Promise<Location[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query.trim()
      )}&count=8&language=en&format=json`
    );
    if (!response.ok) throw new Error('Failed to fetch geocoding data');
    const data = await response.json();
    if (!data.results) return [];

    return data.results.map((item: any) => ({
      name: item.name,
      admin1: item.admin1 || item.admin2 || '',
      country: item.country || '',
      latitude: item.latitude,
      longitude: item.longitude,
    }));
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

export async function fetch5DayHuntingForecast(
  location: Location = DEFAULT_LOCATION,
  units: UnitSystem = 'imperial',
  pressureUnit: PressureUnit = 'inHg'
): Promise<DailyForecast[]> {
  const { latitude: lat, longitude: lon } = location;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max,winddirection_10m_dominant,sunrise,sunset&hourly=temperature_2m,pressure_msl,surface_pressure,relativehumidity_2m,precipitation_probability,precipitation,weathercode,windspeed_10m,windgusts_10m,winddirection_10m&forecast_days=14&timezone=auto`;

  // Batch 1: rolling 30-day climate normal for the location, fetched from
  // the Open-Meteo Archive API (free, no API key). Used to score the
  // Temperature factor against deviation (`tempDeltaF`) instead of fixed
  // absolute thresholds. Cached ~24h per location to avoid hitting the
  // archive endpoint on every forecast refresh. Always returned in °F;
  // the caller converts if needed when the user has metric units.
  const normalMaxF = await fetchClimateNormal(lat, lon);

  let rawData;
  let lastErr: unknown;
  // Retry transient network failures before falling back to synthetic data:
  // a single dropped request (cold start, flaky mobile signal) should not
  // leave users looking at non-real forecasts until the 5-minute refresh.
  const maxAttempts = typeof navigator !== 'undefined' && navigator.onLine === false ? 1 : 3;
  // Abort hung requests (stalled mobile connections) so a dead network can't
  // multiply the retry latency; degrades to no timeout on old browsers.
  const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, hasTimeout ? { signal: AbortSignal.timeout(10000) } : undefined);
      if (!response.ok) {
        throw new Error('Weather API request failed');
      }
      rawData = await response.json();
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        // Backoff between retries: 0.7s, then 1.4s.
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      }
    }
  }
  if (!rawData) {
    console.warn('Weather API fetch failed, using robust fallback forecast data:', lastErr);
    return generateFallbackForecast(location, units);
  }

  const dailyRaw = rawData.daily;
  const hourlyRaw = rawData.hourly;

  const dailyForecasts: DailyForecast[] = [];

  // We process up to 14 days (1-2 weeks out) so the dashboard can offer a
  // 14-day forecast view on demand, without breaking callers that only
  // render the first 7 cards. Open-Meteo's daily + hourly arrays always
  // cover the same span, so it's safe to parallelize the per-day loop up to
  // 14 even if a caller only consumes the first slice.
  const daysCount = Math.min(14, dailyRaw.time.length);

  for (let d = 0; d < daysCount; d++) {
    const dateStr = dailyRaw.time[d];
    const dateObj = new Date(dateStr + 'T12:00:00');

    let dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    if (d === 0) dayName = 'Today';
    else if (d === 1) dayName = 'Tomorrow';

    const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Raw metric values
    const rawMaxTempC = dailyRaw.temperature_2m_max[d];
    const rawMinTempC = dailyRaw.temperature_2m_min[d];
    const rawMaxTempF = celsiusToFahrenheit(rawMaxTempC);
    const rawMinTempF = celsiusToFahrenheit(rawMinTempC);

    // Calculate 24h temperature drop compared to previous day
    let tempDrop24h = 0;
    if (d > 0) {
      const prevMaxF = celsiusToFahrenheit(dailyRaw.temperature_2m_max[d - 1]);
      tempDrop24h = prevMaxF - rawMaxTempF; // positive if temp dropped
    }

    const windSpeedMaxKmh = dailyRaw.windspeed_10m_max[d];
    const windSpeedMaxMph = kmhToMph(windSpeedMaxKmh);
    const windDirectionDeg = dailyRaw.winddirection_10m_dominant[d];
    const windDirectionText = getWindDirectionText(windDirectionDeg);

    const rawWeatherCode = dailyRaw.weathercode[d];

    const precipSumMm = dailyRaw.precipitation_sum[d];
    const precipSumInches = Number((precipSumMm * 0.0393701).toFixed(2));

    const sunriseStr = dailyRaw.sunrise[d];
    const sunsetStr = dailyRaw.sunset[d];

    // Safe defensive extraction of hourly arrays to prevent TypeError if API response omits keys
    const timeArr = hourlyRaw.time || [];
    const tempArr = hourlyRaw.temperature_2m || [];
    const pressArr = hourlyRaw.pressure_msl || hourlyRaw.surface_pressure || [];
    const windSpeedArr = hourlyRaw.windspeed_10m || [];
    const windGustArr = hourlyRaw.windgusts_10m || []; // Batch 1: optional gust
    const windDirArr = hourlyRaw.winddirection_10m || [];
    const precipProbArr = hourlyRaw.precipitation_probability || [];
    const precipArr = hourlyRaw.precipitation || [];
    const weatherCodeArr = hourlyRaw.weathercode || [];
    const humidityArr = hourlyRaw.relativehumidity_2m || []; // Batch 1: previously discarded

    const dayStartIdx = d * 24;
    const dayEndIdx = Math.min(dayStartIdx + 24, timeArr.length || 24);

    // Compute a representative daily condition from the hourly weather codes
    // instead of using the API's single "most significant" code, which can be
    // misleading when rain only occurs for a brief window.
    const dayHourlyCodes = (hourlyRaw.weathercode || []).slice(dayStartIdx, dayEndIdx);
    const { code: weatherCode, desc: weatherDesc, icon: weatherIcon } =
      computeRepresentativeDailyWeather(dayHourlyCodes, rawWeatherCode);

    const dayHourlyRaw = {
      time: timeArr.slice(dayStartIdx, dayEndIdx),
      temp: tempArr.slice(dayStartIdx, dayEndIdx),
      pressure: pressArr.slice(dayStartIdx, dayEndIdx),
      windSpeed: windSpeedArr.slice(dayStartIdx, dayEndIdx),
      gust: windGustArr.slice(dayStartIdx, dayEndIdx),
      windDir: windDirArr.slice(dayStartIdx, dayEndIdx),
      precipProb: precipProbArr.slice(dayStartIdx, dayEndIdx),
      precip: precipArr.slice(dayStartIdx, dayEndIdx),
      weatherCode: weatherCodeArr.slice(dayStartIdx, dayEndIdx),
      humidity: humidityArr.slice(dayStartIdx, dayEndIdx),
    };

    // Calculate average pressure and pressure trend
    let pressureSumHpa = 0;
    dayHourlyRaw.pressure.forEach((p: number) => (pressureSumHpa += p));
    const pressureAvgHpa = Math.round(pressureSumHpa / (dayHourlyRaw.pressure.length || 1));
    const pressureAvgInHg = hpaToInHg(pressureAvgHpa);

    // Use a smoothed late-afternoon trend for the daily summary. Hourly scores
    // below calculate their own local trend instead of inheriting this value.
    const pressureTrend = getPressureTrend(dayHourlyRaw.pressure, 18);

    // Batch 1: day's average relative humidity (0-100) and peak wind gust
    // (mph) — both feed the new Scent & Humidity factor and the wind gust
    // penalty respectively. clamp finite values only; if Open-Meteo
    // omits the field, we fall through to zero and let the factor take
    // its "unavailable" branch.
    const humidityValid = dayHourlyRaw.humidity.filter((v: any) => typeof v === 'number' && Number.isFinite(v));
    const humidityAvg = humidityValid.length > 0
      ? Math.round(humidityValid.reduce((a: number, b: number) => a + b, 0) / humidityValid.length)
      : null;
    const gustValid = dayHourlyRaw.gust.filter((v: any) => typeof v === 'number' && Number.isFinite(v));
    const gustMaxKmh = gustValid.length > 0 ? Math.max(...gustValid) : null;
    const gustMaxMph = gustMaxKmh !== null ? kmhToMph(gustMaxKmh) : null;

    // Day-level temperature deviation (only meaningful when the cache hit).
    const tempDeltaF = normalMaxF !== null ? rawMaxTempF - normalMaxF : null;

    // Check post-storm effect & rain break (any rainy day with a break/stop in rain)
    const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
    const hasRainHour = dayHourlyRaw.precip.some((p: number) => p > 0.1) || rainyCodes.includes(weatherCode);
    const hasDryHour = dayHourlyRaw.precip.some((p: number) => p < 0.1);
    const hasRainBreak = hasRainHour && hasDryHour;

    // Detect any rain-then-clear pattern: find the last hour with meaningful
    // rain (> 0.2 mm), then check that at least 2 consecutive dry hours follow.
    let lastRainIdx = -1;
    for (let i = dayHourlyRaw.precip.length - 1; i >= 0; i--) {
      if ((dayHourlyRaw.precip[i] || 0) > 0.2) { lastRainIdx = i; break; }
    }
    const lastRainHour = lastRainIdx; // 0-23 hour index, or -1
    const isPostStorm = lastRainIdx >= 0 && lastRainIdx < dayHourlyRaw.precip.length - 2 &&
      dayHourlyRaw.precip.slice(lastRainIdx + 1, lastRainIdx + 3).every((p: number) => (p || 0) < 0.1);

    // Calculate Solunar Info
    const solunar = calculateSolunar(dateStr, lat, lon, sunriseStr, sunsetStr);

    // Match prime windows to the forecasted local sunrise and sunset, rather
    // than fixed clock hours. This matters significantly outside mid-latitude
    // autumn dates.
    const srObj = sunriseStr ? new Date(sunriseStr) : new Date(dateObj.setHours(6, 30));
    const ssObj = sunsetStr ? new Date(sunsetStr) : new Date(dateObj.setHours(18, 45));
    const morningStart = new Date(srObj.getTime() - 30 * 60000);
    const morningEnd = new Date(srObj.getTime() + 150 * 60000);
    const eveningStart = new Date(ssObj.getTime() - 150 * 60000);
    const eveningEnd = new Date(ssObj.getTime() + 30 * 60000);
    const isPrimeTimestamp = (timestamp: number) =>
      (timestamp >= morningStart.getTime() && timestamp <= morningEnd.getTime()) ||
      (timestamp >= eveningStart.getTime() && timestamp <= eveningEnd.getTime());

    // Batch 4: score the daily outlook from the conditions the hunter will
    // actually sit in — the morning/evening prime windows — instead of the
    // day's extremes. A 90°F afternoon must not tank a day whose 6-9 AM
    // window is a perfect 62°F, and rain at 2 PM shouldn't hide the fact
    // that the prime windows are also wet.
    const primeHourIndices = dayHourlyRaw.time
      .map((time: string, idx: number) => ({ timestamp: new Date(time).getTime(), idx }))
      .filter(({ timestamp }) => isPrimeTimestamp(timestamp))
      .map(({ idx }) => idx);

    // Average temperature across prime windows (in °F).
    const primeTempF = primeHourIndices
      .map((idx) => celsiusToFahrenheit(dayHourlyRaw.temp[idx]))
      .filter((t: number) => Number.isFinite(t));
    const primeAvgTempF = average(primeTempF.length ? primeTempF : [rawMaxTempF]);

    // Representative weather code across only the prime-window hours.
    const primeCodes = primeHourIndices
      .map((idx) => dayHourlyRaw.weatherCode[idx])
      .filter((c: number) => typeof c === 'number' && Number.isFinite(c));
    const primeWeatherCode = computeRepresentativeDailyWeather(primeCodes, weatherCode).code;

    // Average humidity and peak gust across prime windows (fall back to the
    // full-day values when no prime hours carry data).
    const primeHumidityValid = primeHourIndices
      .map((idx) => dayHourlyRaw.humidity[idx])
      .filter((v: any) => typeof v === 'number' && Number.isFinite(v));
    const primeHumidity = primeHumidityValid.length > 0
      ? Math.round(primeHumidityValid.reduce((a: number, b: number) => a + b, 0) / primeHumidityValid.length)
      : humidityAvg;
    const primeGustKmh = primeHourIndices
      .map((idx) => dayHourlyRaw.gust[idx])
      .filter((v: any) => typeof v === 'number' && Number.isFinite(v));
    const primeGustMph = primeGustKmh.length > 0 ? kmhToMph(Math.max(...primeGustKmh)) : gustMaxMph;

    // Rain-break / post-storm signals scoped to the prime windows: only a
    // dry prime hour right after rain (or a day that cleared before prime
    // time) earns the movement surge — not rain that broke at 2 PM.
    const primeRainBreak = primeHourIndices.some((idx) => {
      const recentRain = dayHourlyRaw.precip.slice(Math.max(0, idx - 3), idx).some((p: number) => p >= 0.2);
      return recentRain && (dayHourlyRaw.precip[idx] || 0) < 0.1;
    });
    const lastPrimeIdx = primeHourIndices.length ? Math.max(...primeHourIndices) : -1;
    const allPrimeDry = primeHourIndices.every((idx) => (dayHourlyRaw.precip[idx] || 0) < 0.1);
    const primeIsPostStorm = isPostStorm && lastRainIdx >= 0 && lastRainIdx < lastPrimeIdx && allPrimeDry;

    // Temperature deviation for the daily dial is now vs the prime-window
    // average, not the day's max.
    const primeTempDeltaF = normalMaxF !== null ? primeAvgTempF - normalMaxF : null;

    // Whether a real solunar window overlaps the morning/evening prime
    // windows — the daily Moon Activity factor rewards this overlap.
    const primeSolunarRating: 'High' | 'Medium' | 'Normal' = (() => {
      const w = solunar.solunarWindows;
      if (!w) return 'Normal';
      const morningMs = morningStart.getTime();
      const morningEndMs = morningEnd.getTime();
      const eveningMs = eveningStart.getTime();
      const eveningEndMs = eveningEnd.getTime();
      const overlaps = (r?: { start: number; end: number }) => {
        if (!r) return false;
        return (r.start <= morningEndMs && r.end >= morningMs) ||
               (r.start <= eveningEndMs && r.end >= eveningMs);
      };
      if (overlaps(w.major1) || overlaps(w.major2)) return 'High';
      if (overlaps(w.minor1) || overlaps(w.minor2)) return 'Medium';
      return 'Normal';
    })();

    // Daily maximum wind is often a brief gust. Score the daily outlook using
    // the average wind during the actual morning/evening hunting windows.
    const primeWindKmh = primeHourIndices
      .map((idx) => dayHourlyRaw.windSpeed[idx])
      .filter((w: number) => Number.isFinite(w));
    const scoringWindMph = kmhToMph(average(primeWindKmh.length ? primeWindKmh : dayHourlyRaw.windSpeed));

    // Calculate Hunt Score
    const minTemp = units === 'imperial' ? rawMinTempF : Math.round(rawMinTempC);
    const tempDrop = units === 'imperial' ? tempDrop24h : Math.round((tempDrop24h * 5) / 9);

    const { score, rating, verdict, factors } = calculateHuntScore({
      tempDrop24h: tempDrop,
      maxTempF: units === 'imperial' ? primeAvgTempF : Math.round(((primeAvgTempF - 32) * 5) / 9),
      minTempF: minTemp,
      pressureInHg: pressureAvgInHg,
      pressureTrend,
      windMph: scoringWindMph,
      weatherCode: primeWeatherCode,
      isPostStorm: primeIsPostStorm,
      hasRainBreak: primeRainBreak,
      solunar,
      solunarRating: primeSolunarRating,
      units,
      pressureUnit,
      dateStr,
      location,
      // Batch 1 + 4: deviation-based temperature scoring (falls back
      // gracefully when the climate normal is unavailable), humidity factor,
      // gust penalty — all now measured across the prime windows.
      tempDeltaF: primeTempDeltaF,
      humidity: primeHumidity,
      windGustMph: primeGustMph,
    });

    // Build Prime Time windows (Morning 30m before sunrise to +2.5h; Evening 2.5h before sunset to dusk)
    const morningPrime = formatTimeRange12h(morningStart, morningEnd);
    const eveningPrime = formatTimeRange12h(eveningStart, eveningEnd);

    // Build hourly list for day
    const hourlyForecasts: HourlyForecast[] = dayHourlyRaw.time.map((tStr: string, idx: number) => {
      const hDate = new Date(tStr);
      const hour = hDate.getHours();
      const hTempC = dayHourlyRaw.temp[idx];
      const hTempF = celsiusToFahrenheit(hTempC);
      const hPressHpa = dayHourlyRaw.pressure[idx];
      const hPressInHg = hpaToInHg(hPressHpa);
      const hWindKmh = dayHourlyRaw.windSpeed[idx];
      const hWindMph = kmhToMph(hWindKmh);
      const hGustKmhRaw = dayHourlyRaw.gust[idx];
      const hGustMph = typeof hGustKmhRaw === 'number' && Number.isFinite(hGustKmhRaw) ? kmhToMph(hGustKmhRaw) : undefined;
      const hGustKmh = typeof hGustKmhRaw === 'number' && Number.isFinite(hGustKmhRaw) ? Math.round(hGustKmhRaw) : undefined;
      const hWindDeg = dayHourlyRaw.windDir[idx];
      const hHumidityRaw = dayHourlyRaw.humidity[idx];
      const hHumidity = typeof hHumidityRaw === 'number' && Number.isFinite(hHumidityRaw) ? Math.round(hHumidityRaw) : undefined;

      // Calculate hourly 24h temperature drop
      const globalHourIdx = d * 24 + idx;
      let hTempDrop24hF = tempDrop24h;
      const hourlyTimeArr = hourlyRaw.time || [];
      const hourlyTempArr = hourlyRaw.temperature_2m || [];
      if (globalHourIdx >= 24 && hourlyTempArr[globalHourIdx - 24] !== undefined) {
        const prev24hC = hourlyTempArr[globalHourIdx - 24];
        const prev24hF = celsiusToFahrenheit(prev24hC);
        hTempDrop24hF = prev24hF - hTempF;
      }
      const hTempDrop24h = units === 'imperial' ? hTempDrop24hF : Math.round((hTempDrop24hF * 5) / 9);

      // Hour-level deviation from the rolling normal lets a cool morning
      // score appropriately even when the day's peak is at/near normal.
      const hTempDeltaF = normalMaxF !== null ? hTempF - normalMaxF : null;

      const isPrimeWindow = isPrimeTimestamp(hDate.getTime());
      // A dry hour only earns a rain-break signal when rain occurred in the
      // immediately preceding three hours; a dry afternoon after dawn rain is
      // not an automatic movement surge.
      const recentRain = dayHourlyRaw.precip.slice(Math.max(0, idx - 3), idx).some((p: number) => p >= 0.2);
      const isRainBreakHour = recentRain && (dayHourlyRaw.precip[idx] || 0) < 0.1;
      const hourlyPressureTrend = getPressureTrend(dayHourlyRaw.pressure, idx);

      // Batch 4: the hour's solunar rating (major/minor window membership)
      // feeds both the Moon Activity score factor and the stored rating.
      const hSolunarRating = getSolunarRating(hDate.getTime(), solunar);

      // Calculate exact hourly hunt score using 9-factor model (Batch 1: humidity + gusts)
      const { score: hScore } = calculateHuntScore({
        tempDrop24h: hTempDrop24h,
        maxTempF: units === 'imperial' ? hTempF : Math.round(hTempC),
        minTempF: minTemp,
        pressureInHg: hPressInHg,
        pressureTrend: hourlyPressureTrend,
        windMph: hWindMph,
        weatherCode: dayHourlyRaw.weatherCode[idx] || 0,
        isPostStorm: isPostStorm && isRainBreakHour,
        hasRainBreak: isRainBreakHour,
        solunar,
        solunarRating: hSolunarRating,
        hour,
        isPrimeWindow,
        units,
        pressureUnit,
        dateStr,
        location,
        tempDeltaF: hTempDeltaF,
        humidity: hHumidity ?? null,
        windGustMph: hGustMph ?? null,
      });

      return {
        time: format12HourTime(hDate),
        timestamp: hDate.getTime(),
        temp: units === 'imperial' ? hTempF : Math.round(hTempC),
        tempDrop24h: hTempDrop24h,
        pressureHpa: hPressHpa,
        pressureInHg: hPressInHg,
        windSpeedMph: hWindMph,
        windSpeedKmh: Math.round(hWindKmh),
        windGustMph: hGustMph,
        windGustKmh: hGustKmh,
        windDirectionDeg: hWindDeg,
        windDirectionText: getWindDirectionText(hWindDeg),
        precipProbability: dayHourlyRaw.precipProb[idx] || 0,
        precipMm: dayHourlyRaw.precip[idx] || 0,
        humidity: hHumidity,
        pressureTrend: hourlyPressureTrend,
        weatherCode: dayHourlyRaw.weatherCode[idx] || 0,
        weatherDesc: isRainBreakHour ? 'Rain Break (Dry Window)' : getWeatherDetails(dayHourlyRaw.weatherCode[idx] || 0).desc,
        huntScore: hScore,
        isPrimeWindow,
        solunarRating: hSolunarRating,
      };
    });

    dailyForecasts.push({
      date: dateStr,
      dayName,
      dateFormatted,
      maxTemp: units === 'imperial' ? rawMaxTempF : Math.round(rawMaxTempC),
      minTemp: units === 'imperial' ? rawMinTempF : Math.round(rawMinTempC),
      tempDrop24h: units === 'imperial' ? tempDrop24h : Math.round((tempDrop24h * 5) / 9),
      pressureAvgInHg,
      pressureAvgHpa,
      pressureTrend,
      windSpeedMaxMph,
      windSpeedMaxKmh: Math.round(windSpeedMaxKmh),
      windDirectionDeg,
      windDirectionText,
      precipSumMm,
      precipSumInches,
      weatherCode,
      weatherDesc,
      weatherIcon,
      isPostStorm,
      hasRainBreak,
      lastRainHour,
      humidityAvg: humidityAvg ?? undefined, // Batch 1: undefined => unavailable
      huntScore: score,
      rating,
      verdict,
      factors,
      morningPrime,
      eveningPrime,
      solunar,
      hourly: hourlyForecasts,
    });
  }

  return dailyForecasts;
}

export async function fetchHistoricalWeather(
  latitude: number,
  longitude: number,
  dateTimeStr: string,
  units: UnitSystem = 'imperial'
): Promise<{ temperature: number; windSpeed: number; windDirection: string } | null> {
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return null;

    const dateStr = d.toISOString().split('T')[0];
    const targetHour = d.getHours();

    const now = new Date();
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);

    let url = '';
    if (diffDays > 5) {
      url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,windspeed_10m,winddirection_10m&timezone=auto`;
    } else {
      url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,windspeed_10m,winddirection_10m&timezone=auto`;
    }

    let response = await fetch(url);
    if (!response.ok) {
      const altUrl = url.includes('archive-api')
        ? `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,windspeed_10m,winddirection_10m&timezone=auto`
        : `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,windspeed_10m,winddirection_10m&timezone=auto`;
      response = await fetch(altUrl);
      if (!response.ok) return null;
    }

    const data = await response.json();
    if (!data || !data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      return null;
    }

    const times: string[] = data.hourly.time;
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
      const hDate = new Date(times[i]);
      const diff = Math.abs(hDate.getHours() - targetHour);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    const rawTempC = data.hourly.temperature_2m[closestIndex];
    const rawWindKmh = data.hourly.windspeed_10m[closestIndex];
    const windDeg = data.hourly.winddirection_10m[closestIndex];

    const temperature = units === 'imperial' ? celsiusToFahrenheit(rawTempC) : Math.round(rawTempC);
    const windSpeed = units === 'imperial' ? kmhToMph(rawWindKmh) : Math.round(rawWindKmh);
    const windDirection = getWindDirectionText(windDeg);

    return {
      temperature,
      windSpeed,
      windDirection,
    };
  } catch (error) {
    console.error('Error fetching historical weather:', error);
    return null;
  }
}

/**
 * Fetch a rolling 30-day climatological normal max temperature for a
 * location from Open-Meteo's free Archive API (no API key required).
 * Backed by a 24-hour localStorage cache keyed by lat/lon so we don't
 * hit the archive endpoint on every forecast refresh.
 *
 * Returns the normal in °F (imperial) regardless of caller unit; the
 * temperature scoring engine compares °F deviations internally.
 * Returns null on any failure (network, bad JSON, missing fields) — the
 * caller should fall back to the legacy absolute-threshold scoring.
 */
async function fetchClimateNormal(lat: number, lon: number): Promise<number | null> {
  const cacheKey = `letshunt_climate_normal_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const TTL_MS = 24 * 3600 * 1000;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.normalMaxF === 'number' &&
        Number.isFinite(parsed.normalMaxF) &&
        typeof parsed?.fetchedAt === 'number' &&
        Date.now() - parsed.fetchedAt < TTL_MS
      ) {
        return parsed.normalMaxF;
      }
    }
  } catch {
    /* storage unavailable, treat as cache miss */
  }

  // 30-day window ending yesterday so we never include today (which has
  // a partial forecast). ISO date strings (YYYY-MM-DD) keep the URL tidy.
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max&timezone=auto`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    const arr: number[] | undefined = data?.daily?.temperature_2m_max;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const valid = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return null;
    const avgC = valid.reduce((a, b) => a + b, 0) / valid.length;
    const normalMaxF = celsiusToFahrenheit(avgC);
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ normalMaxF, fetchedAt: Date.now() })
      );
    } catch {
      /* storage full or unavailable, just skip caching */
    }
    return normalMaxF;
  } catch {
    return null;
  }
}

function generateFallbackForecast(location: Location, units: UnitSystem): DailyForecast[] {
  const forecasts: DailyForecast[] = [];
  const today = new Date();
  for (let d = 0; d < 7; d++) {
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() + d);
    const dateStr = dateObj.toISOString().split('T')[0];
    let dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    if (d === 0) dayName = 'Today';
    else if (d === 1) dayName = 'Tomorrow';
    const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const maxTemp = units === 'imperial' ? 68 - d : 20 - Math.round(d * 0.5);
    const minTemp = units === 'imperial' ? 48 - d : 9 - Math.round(d * 0.5);
    const windSpeedMaxMph = 8 + (d % 4) * 3;
    const windDirectionDeg = (d * 45) % 360;
    const windDirectionText = getWindDirectionText(windDirectionDeg);

    const dayWeatherCodes = [2, 80, 51, 3, 0, 61, 1];
    const dayCode = dayWeatherCodes[d % dayWeatherCodes.length];
    const { desc: weatherDesc, icon: weatherIcon } = getWeatherDetails(dayCode);

    const score = Math.max(40, Math.min(95, 75 + (d % 3) * 7 - (d % 2) * 10));
    // Use the app-wide rating thresholds so the offline fallback stays
    // consistent with getRatingFromScore used by the dial and cards.
    const rating: 'Poor' | 'Fair' | 'Good' | 'Great' = getRatingFromScore(score);
    const verdict = isPrimeDay(score)
      ? "Get in the woods — it's a great day! The wind and barometer are lining up."
      : "It's an okay day to hunt. Focus on the edges between bedding and feeding areas.";

    const hourly: HourlyForecast[] = [];
    for (let h = 0; h < 24; h++) {
      const hDate = new Date(dateObj);
      hDate.setHours(h, 0, 0, 0);
      const isPrimeWindow = (h >= 5 && h <= 9) || (h >= 16 && h <= 20);
      const hourlyCode = (h >= 14 && h <= 17 && (dayCode === 80 || dayCode === 61 || dayCode === 51)) ? dayCode : (h % 5 === 0 ? 2 : 0);
      const hourlyDetails = getWeatherDetails(hourlyCode);

      const hPressureHpa = Math.round(1013 + 5 * Math.sin(((h + d * 3) / 24) * 2 * Math.PI));
      const hPressureInHg = hpaToInHg(hPressureHpa);

      // Batch 1 fallback placeholders — keep the scoring engine happy
      // when it can't reach the real Open-Meteo endpoints. Linear humidity
      // swing between 75% morning / 55% evening crudely mimics diurnal
      // drying, and a small gust bump above sustained wind gives the
      // Wind Speed factor a representative sample.
      const hHumidity = 55 + Math.round(20 * Math.sin((h / 24) * Math.PI));
      const hGustMph = windSpeedMaxMph + 6;

      hourly.push({
        time: format12HourTime(hDate),
        timestamp: hDate.getTime(),
        temp: units === 'imperial' ? minTemp + Math.round((maxTemp - minTemp) * Math.sin((h / 24) * Math.PI)) : 15,
        tempDrop24h: Math.round(4 + 3 * Math.cos((h / 12) * Math.PI)),
        pressureHpa: hPressureHpa,
        pressureInHg: hPressureInHg,
        windSpeedMph: windSpeedMaxMph,
        windSpeedKmh: Math.round(windSpeedMaxMph * 1.60934),
        windGustMph: hGustMph,
        windGustKmh: Math.round(hGustMph * 1.60934),
        windDirectionDeg,
        windDirectionText,
        precipProbability: hourlyCode >= 51 ? 60 : h % 3 === 0 ? 10 : 0,
        precipMm: hourlyCode >= 51 ? 1.5 : 0,
        humidity: hHumidity,
        weatherCode: hourlyCode,
        weatherDesc: hourlyDetails.desc,
        huntScore: isPrimeWindow ? score + 10 : score - 5,
        isPrimeWindow,
        solunarRating: isPrimeWindow ? 'High' : 'Normal',
        // Note: The fallback does not compute true solunar periods; it uses a loose
        // prime-window proxy for the solunar rating. Real Open-Meteo data applies
        // the full getSolunarRating function.
      });
    }

    forecasts.push({
      date: dateStr,
      dayName,
      dateFormatted,
      maxTemp,
      minTemp,
      tempDrop24h: 3,
      pressureAvgInHg: 30.0,
      pressureAvgHpa: 1016,
      pressureTrend: 'steady',
      windSpeedMaxMph,
      windSpeedMaxKmh: Math.round(windSpeedMaxMph * 1.60934),
      windDirectionDeg,
      windDirectionText,
      precipSumMm: dayCode >= 51 ? 3.5 : 0,
      precipSumInches: dayCode >= 51 ? 0.14 : 0,
      weatherCode: dayCode,
      weatherDesc,
      weatherIcon,
      isPostStorm: false,
      // Batch 1: dry period => humidity stays around 65%, no temp deviation
      // (no climate normal available in offline mode).
      humidityAvg: 65,
      huntScore: score,
      rating,
      verdict,
      factors: [
        { name: 'Barometer', score: 2, maxScore: 4, description: 'The barometer is steady.', status: 'good' },
        { name: 'Wind & Scent', score: 7, maxScore: 7, description: `${windDirectionText} breeze (${windSpeedMaxMph} mph)`, status: 'optimal' },
        { name: 'Temperature', score: 3, maxScore: 6, description: `Comfortable range (${minTemp}° - ${maxTemp}°)`, status: 'good' },
        { name: 'Moon Activity', score: 2, maxScore: 6, description: 'The moon looks favorable for movement.', status: 'good' },
      ],
      morningPrime: '6:15 AM - 9:30 AM',
      eveningPrime: '4:45 PM - 7:15 PM',
      solunar: {
        moonPhase: 0.5,
        moonPhaseName: 'Full Moon',
        moonIllumination: 100,
        major1: '6:30 AM - 8:30 AM',
        major2: '7:00 PM - 9:00 PM',
        minor1: '12:15 AM - 1:15 AM',
        minor2: '12:45 PM - 1:45 PM',
        sunrise: '6:45 AM',
        sunset: '6:15 PM',
      },
      hourly,
    });
  }
  return forecasts;
}
