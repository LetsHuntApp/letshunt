import { DailyForecast, HourlyForecast, Location, PressureTrend, UnitSystem, PressureUnit } from '../types';
import {
  calculateHuntScore,
  calculateSolunar,
  celsiusToFahrenheit,
  format12HourTime,
  formatTimeRange12h,
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

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max,winddirection_10m_dominant,sunrise,sunset&hourly=temperature_2m,pressure_msl,surface_pressure,relativehumidity_2m,precipitation_probability,precipitation,weathercode,windspeed_10m,winddirection_10m&timezone=auto`;

  let rawData;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Weather API request failed');
    }
    rawData = await response.json();
  } catch (err) {
    console.warn('Weather API fetch failed, using robust fallback forecast data:', err);
    return generateFallbackForecast(location, units);
  }

  const dailyRaw = rawData.daily;
  const hourlyRaw = rawData.hourly;

  const dailyForecasts: DailyForecast[] = [];

  // We take 7 days (Today + 6 upcoming forecast days)
  const daysCount = Math.min(7, dailyRaw.time.length);

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

    const weatherCode = dailyRaw.weathercode[d];
    const { desc: weatherDesc, icon: weatherIcon } = getWeatherDetails(weatherCode);

    const precipSumMm = dailyRaw.precipitation_sum[d];
    const precipSumInches = Number((precipSumMm * 0.0393701).toFixed(2));

    const sunriseStr = dailyRaw.sunrise[d];
    const sunsetStr = dailyRaw.sunset[d];

    // Safe defensive extraction of hourly arrays to prevent TypeError if API response omits keys
    const timeArr = hourlyRaw.time || [];
    const tempArr = hourlyRaw.temperature_2m || [];
    const pressArr = hourlyRaw.pressure_msl || hourlyRaw.surface_pressure || [];
    const windSpeedArr = hourlyRaw.windspeed_10m || [];
    const windDirArr = hourlyRaw.winddirection_10m || [];
    const precipProbArr = hourlyRaw.precipitation_probability || [];
    const precipArr = hourlyRaw.precipitation || [];
    const weatherCodeArr = hourlyRaw.weathercode || [];

    const dayStartIdx = d * 24;
    const dayEndIdx = Math.min(dayStartIdx + 24, timeArr.length || 24);

    const dayHourlyRaw = {
      time: timeArr.slice(dayStartIdx, dayEndIdx),
      temp: tempArr.slice(dayStartIdx, dayEndIdx),
      pressure: pressArr.slice(dayStartIdx, dayEndIdx),
      windSpeed: windSpeedArr.slice(dayStartIdx, dayEndIdx),
      windDir: windDirArr.slice(dayStartIdx, dayEndIdx),
      precipProb: precipProbArr.slice(dayStartIdx, dayEndIdx),
      precip: precipArr.slice(dayStartIdx, dayEndIdx),
      weatherCode: weatherCodeArr.slice(dayStartIdx, dayEndIdx),
    };

    // Calculate average pressure and pressure trend
    let pressureSumHpa = 0;
    dayHourlyRaw.pressure.forEach((p: number) => (pressureSumHpa += p));
    const pressureAvgHpa = Math.round(pressureSumHpa / (dayHourlyRaw.pressure.length || 1));
    const pressureAvgInHg = hpaToInHg(pressureAvgHpa);

    // Use a smoothed late-afternoon trend for the daily summary. Hourly scores
    // below calculate their own local trend instead of inheriting this value.
    const pressureTrend = getPressureTrend(dayHourlyRaw.pressure, 18);

    // Check post-storm effect & rain break (any rainy day with a break/stop in rain)
    const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
    const hasRainHour = dayHourlyRaw.precip.some((p: number) => p > 0.1) || rainyCodes.includes(weatherCode);
    const hasDryHour = dayHourlyRaw.precip.some((p: number) => p < 0.1);
    const hasRainBreak = hasRainHour && hasDryHour;

    const morningRain = dayHourlyRaw.precip.slice(0, 10).some((p: number) => p > 0.5);
    const afternoonClear = dayHourlyRaw.precip.slice(12, 20).every((p: number) => p < 0.2);
    const isPostStorm = morningRain && afternoonClear;

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

    // Daily maximum wind is often a brief gust. Score the daily outlook using
    // the average wind during the actual morning/evening hunting windows.
    const primeWindKmh = dayHourlyRaw.time
      .map((time: string, idx: number) => ({ timestamp: new Date(time).getTime(), wind: dayHourlyRaw.windSpeed[idx] }))
      .filter(({ timestamp }) => isPrimeTimestamp(timestamp))
      .map(({ wind }) => wind)
      .filter((wind: number) => Number.isFinite(wind));
    const scoringWindMph = kmhToMph(average(primeWindKmh.length ? primeWindKmh : dayHourlyRaw.windSpeed));

    // Calculate Hunt Score
    const maxTemp = units === 'imperial' ? rawMaxTempF : Math.round(rawMaxTempC);
    const minTemp = units === 'imperial' ? rawMinTempF : Math.round(rawMinTempC);
    const tempDrop = units === 'imperial' ? tempDrop24h : Math.round((tempDrop24h * 5) / 9);

    const { score, rating, verdict, factors } = calculateHuntScore({
      tempDrop24h: tempDrop,
      maxTempF: maxTemp,
      minTempF: minTemp,
      pressureInHg: pressureAvgInHg,
      pressureTrend,
      windMph: scoringWindMph,
      weatherCode,
      isPostStorm,
      hasRainBreak: isPostStorm,
      solunar,
      units,
      pressureUnit,
      dateStr,
      location,
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
      const hWindDeg = dayHourlyRaw.windDir[idx];

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

      const isPrimeWindow = isPrimeTimestamp(hDate.getTime());
      // A dry hour only earns a rain-break signal when rain occurred in the
      // immediately preceding three hours; a dry afternoon after dawn rain is
      // not an automatic movement surge.
      const recentRain = dayHourlyRaw.precip.slice(Math.max(0, idx - 3), idx).some((p: number) => p >= 0.2);
      const isRainBreakHour = recentRain && (dayHourlyRaw.precip[idx] || 0) < 0.1;
      const hourlyPressureTrend = getPressureTrend(dayHourlyRaw.pressure, idx);

      // Calculate exact hourly hunt score using 7-factor model
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
        hour,
        isPrimeWindow,
        units,
        pressureUnit,
        dateStr,
        location,
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
        windDirectionDeg: hWindDeg,
        windDirectionText: getWindDirectionText(hWindDeg),
        precipProbability: dayHourlyRaw.precipProb[idx] || 0,
        precipMm: dayHourlyRaw.precip[idx] || 0,
        weatherCode: dayHourlyRaw.weatherCode[idx] || 0,
        weatherDesc: isRainBreakHour ? 'Rain Break (Dry Window)' : getWeatherDetails(dayHourlyRaw.weatherCode[idx] || 0).desc,
        huntScore: hScore,
        isPrimeWindow,
        solunarRating: isPrimeWindow || isRainBreakHour ? 'High' : hour === 12 ? 'Medium' : 'Normal',
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
    const rating: 'Poor' | 'Fair' | 'Good' | 'Excellent' = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
    const verdict = score >= 80 ? 'Prime hunting conditions with optimal wind and barometric pressure.' : 'Moderate conditions. Focus on transition areas.';

    const hourly: HourlyForecast[] = [];
    for (let h = 0; h < 24; h++) {
      const hDate = new Date(dateObj);
      hDate.setHours(h, 0, 0, 0);
      const isPrimeWindow = (h >= 5 && h <= 9) || (h >= 16 && h <= 20);
      const hourlyCode = (h >= 14 && h <= 17 && (dayCode === 80 || dayCode === 61 || dayCode === 51)) ? dayCode : (h % 5 === 0 ? 2 : 0);
      const hourlyDetails = getWeatherDetails(hourlyCode);

      const hPressureHpa = Math.round(1013 + 5 * Math.sin(((h + d * 3) / 24) * 2 * Math.PI));
      const hPressureInHg = hpaToInHg(hPressureHpa);

      hourly.push({
        time: format12HourTime(hDate),
        timestamp: hDate.getTime(),
        temp: units === 'imperial' ? minTemp + Math.round((maxTemp - minTemp) * Math.sin((h / 24) * Math.PI)) : 15,
        tempDrop24h: Math.round(4 + 3 * Math.cos((h / 12) * Math.PI)),
        pressureHpa: hPressureHpa,
        pressureInHg: hPressureInHg,
        windSpeedMph: windSpeedMaxMph,
        windSpeedKmh: Math.round(windSpeedMaxMph * 1.60934),
        windDirectionDeg,
        windDirectionText,
        precipProbability: hourlyCode >= 51 ? 60 : h % 3 === 0 ? 10 : 0,
        precipMm: hourlyCode >= 51 ? 1.5 : 0,
        weatherCode: hourlyCode,
        weatherDesc: hourlyDetails.desc,
        huntScore: isPrimeWindow ? score + 10 : score - 5,
        isPrimeWindow,
        solunarRating: isPrimeWindow ? 'High' : 'Normal',
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
      huntScore: score,
      rating,
      verdict,
      factors: [
        { name: 'Barometric Trend', score: 20, maxScore: 25, description: 'Stable pressure reading.', status: 'optimal' },
        { name: 'Wind Condition', score: 25, maxScore: 30, description: `${windDirectionText} breeze (${windSpeedMaxMph} mph)`, status: 'optimal' },
        { name: 'Temperature', score: 15, maxScore: 20, description: `Comfortable range (${minTemp}° - ${maxTemp}°)`, status: 'good' },
        { name: 'Solunar', score: 10, maxScore: 15, description: 'Favorable Crescent moon phase.', status: 'good' },
      ],
      morningPrime: '6:15 AM - 9:30 AM',
      eveningPrime: '4:45 PM - 7:15 PM',
      solunar: {
        moonPhase: 0.5,
        moonPhaseName: 'First Quarter',
        moonIllumination: 50,
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
