import { DailyForecast, UnitSystem } from '../types';

export type NotificationEventType =
  | 'cold_front'
  | 'weather_front'
  | 'rain_break'
  | 'prime_day'
  | 'severe_weather';

export interface NotificationPrefs {
  enabled: boolean;
  coldFront: boolean;
  weatherFront: boolean;
  rainBreak: boolean;
  primeDay: boolean;
  severeWeather: boolean;
  leadTimeHours: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  coldFront: true,
  weatherFront: true,
  rainBreak: true,
  primeDay: true,
  severeWeather: true,
  leadTimeHours: 48,
};

export interface WeatherAlertEvent {
  id: string;
  type: NotificationEventType;
  label: string; // short human label, e.g. "Cold Front Tomorrow"
  title: string; // full notification title with emoji
  body: string; // full notification body
  fireAt: number; // best-effort timestamp to alert about this event
  dateStr: string; // YYYY-MM-DD
}

const PREFS_KEY = 'letshunt_notification_prefs';
const NOTIFIED_KEY = 'letshunt_notified_events';
const HOUR_MS = 3600 * 1000;

const SEVERE_CODES = new Set([65, 95, 96, 99]);

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// --- Deduplication (prevents re-notifying the same event on every forecast refresh) ---

export function wasNotified(key: string, withinMs: number = 24 * HOUR_MS): boolean {
  try {
    const rec = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    const t = rec[key];
    return typeof t === 'number' && Date.now() - t < withinMs;
  } catch {
    return false;
  }
}

export function markNotified(key: string): void {
  try {
    const rec = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    rec[key] = Date.now();
    const cutoff = Date.now() - 4 * 24 * HOUR_MS;
    for (const k of Object.keys(rec)) {
      if (rec[k] < cutoff) delete rec[k];
    }
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(rec));
  } catch {
    /* storage unavailable */
  }
}

// --- Display ---

export function showSystemNotification(title: string, body: string, tag = 'letshunt-alert'): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return false;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/LetsHunt/icon-192.png',
      badge: '/LetsHunt/icon-192.png',
      tag,
    });
    notification.onclick = () => {
      window.focus();
      if (window.location.pathname !== '/LetsHunt/') {
        window.location.assign('/LetsHunt/');
      }
    };
    return true;
  } catch {
    return false;
  }
}

export function sendTestNotification(): boolean {
  return showSystemNotification(
    'LetsHunt Notifications Working 🔔',
    'This is a test alert. You will be notified here when cold fronts, barometric front shifts, breaks in the rain, or prime hunting days approach your grounds.',
    'letshunt-test'
  );
}

// --- Event detection ---

export function detectWeatherAlerts(
  daily: DailyForecast[],
  prefs: NotificationPrefs,
  units: UnitSystem = 'imperial'
): WeatherAlertEvent[] {
  if (!daily || daily.length === 0) return [];
  const now = Date.now();
  const horizon = now + prefs.leadTimeHours * HOUR_MS;
  const events: WeatherAlertEvent[] = [];
  const isMetric = units === 'metric';
  const tempDropThreshold = isMetric ? 5 : 9; // ~9°F / 5°C, matches hunting engine cold-front threshold
  const tempUnit = isMetric ? '°C' : '°F';

  for (const day of daily) {
    const dayStart = new Date(day.date + 'T00:00:00').getTime();
    if (dayStart + 24 * HOUR_MS < now) continue; // day already over

    if (prefs.coldFront && day.tempDrop24h >= tempDropThreshold) {
      events.push({
        id: `cold_front_${day.date}`,
        type: 'cold_front',
        label: `Cold Front ${day.dayName}`,
        title: `❄️ Cold Front ${day.dayName}`,
        body: `${day.dateFormatted} — 24h temp drop of ${Math.round(day.tempDrop24h)}${tempUnit}. Cold-air surge triggers heavy feeding movement. Get on stand early.`,
        fireAt: dayStart + 5 * HOUR_MS, // pre-dawn reminder on the event day
        dateStr: day.date,
      });
    }

    if (prefs.weatherFront && (day.pressureTrend === 'rapid_drop' || day.pressureTrend === 'rapid_rise')) {
      const dropping = day.pressureTrend === 'rapid_drop';
      events.push({
        id: `weather_front_${day.date}`,
        type: 'weather_front',
        label: `Baro Front Shift ${day.dayName}`,
        title: `🌬️ Barometric Front ${day.dayName}`,
        body: `${day.dateFormatted} — pressure ${dropping ? 'falling ahead of rain. Deer feed hard before the storm arrives.' : 'rising post-front. Clear, stable air sparks daylight travel.'}`,
        fireAt: dayStart + 5 * HOUR_MS,
        dateStr: day.date,
      });
    }

    if (prefs.severeWeather && SEVERE_CODES.has(day.weatherCode)) {
      events.push({
        id: `severe_weather_${day.date}`,
        type: 'severe_weather',
        label: `Severe Weather ${day.dayName}`,
        title: `⛈️ Severe Weather ${day.dayName}`,
        body: `${day.dateFormatted} — ${day.weatherDesc} expected. Deer will hunker down in thick cover; adjust your hunt plan.`,
        fireAt: dayStart + 5 * HOUR_MS,
        dateStr: day.date,
      });
    }

    if (prefs.primeDay && day.rating === 'Excellent') {
      events.push({
        id: `prime_day_${day.date}`,
        type: 'prime_day',
        label: `Prime Hunt Day ${day.dayName}`,
        title: `🎯 Prime Hunt Day ${day.dayName}`,
        body: `${day.dateFormatted} — ${day.huntScore}/100 Excellent rating. Best windows: ${day.morningPrime} & ${day.eveningPrime}.`,
        fireAt: dayStart + 5 * HOUR_MS,
        dateStr: day.date,
      });
    }

    if (prefs.rainBreak && day.hourly) {
      for (let i = 1; i < day.hourly.length; i++) {
        const hour = day.hourly[i];
        if (hour.timestamp < now || hour.timestamp > horizon) continue;
        // A dry hour only counts as a rain break when rain fell within the prior 3 hours
        const recentRain = day.hourly.slice(Math.max(0, i - 3), i).some((h) => h.precipMm >= 0.2);
        if (!recentRain || hour.precipMm >= 0.1) continue;
        if (events.some((e) => e.type === 'rain_break' && e.dateStr === day.date)) continue; // first break of the day only
        events.push({
          id: `rain_break_${day.date}_${i}`,
          type: 'rain_break',
          label: `Break in Rain ${day.dayName} ${hour.time}`,
          title: `☔ Break in the Rain ${day.dayName}`,
          body: `${day.dateFormatted} ${hour.time} — rain lets up. Deer surge out to feed and stretch. Prime setup window.`,
          fireAt: hour.timestamp - 30 * 60 * 1000, // 30-minute heads-up
          dateStr: day.date,
        });
      }
    }
  }

  return events.filter((e) => e.fireAt <= horizon).sort((a, b) => a.fireAt - b.fireAt);
}

export function buildDigestNotification(
  events: WeatherAlertEvent[],
  locationName: string
): { title: string; body: string } {
  const shown = events.slice(0, 4);
  const body =
    shown.map((e) => `• ${e.label}`).join('\n') +
    (events.length > shown.length ? `\n• +${events.length - shown.length} more…` : '');
  return {
    title: `${events.length} Weather Alert${events.length > 1 ? 's' : ''} — ${locationName}`,
    body,
  };
}
