import { DailyForecast, UnitSystem } from '../types';
import { getPeakHuntScore, isPrimeDay } from '../utils/huntingEngine';

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

export async function showSystemNotification(title: string, body: string, tag = 'letshunt-alert'): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return false;

  // Relative paths resolve correctly from both the page (dev: /, Pages: /LetsHunt/)
  // and the service worker scope.
  // Android only accepts raster (PNG) notification icons — the `badge` is the
  // monochrome silhouette Android tints for the status bar; `icon` is the large
  // image shown on the notification itself.
  const options: NotificationOptions = {
    body,
    icon: './push-icon-192.png',
    badge: './push-badge-96.png',
    tag,
  };

  // Fallback for browsers without an active service worker registration.
  // Note: on Android (especially installed PWAs) page-context `new Notification()`
  // is suppressed — the service-worker path below is the reliable one there.
  const showViaPage = (): boolean => {
    try {
      const notification = new Notification(title, options);
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
  };

  try {
    if ('serviceWorker' in navigator) {
      // Prefer the active service worker registration: `registration.showNotification()`
      // is required for reliable display on Android. Resolves with the real
      // outcome so callers only mark an event notified after it actually shows —
      // a silently dropped alert must be retried, not consumed.
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          // Generous timeout: on a cold load the SW can take a few seconds to
          // install/activate, and Android is exactly the platform that needs it.
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw-not-ready')), 15000)),
        ]);
        await reg.showNotification(title, options);
        return true;
      } catch {
        return showViaPage();
      }
    }
    return showViaPage();
  } catch {
    return false;
  }
}

export async function sendTestNotification(): Promise<boolean> {
  return showSystemNotification(
    'LetsHunt Notifications Working 🔔',
    'This is a test alert. You will hear from us when cold fronts, weather changes, rain breaks, or great hunting days are headed your way.',
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

    const peakHuntScore = getPeakHuntScore(day);

    if (prefs.coldFront && day.tempDrop24h >= tempDropThreshold) {
      events.push({
        id: `cold_front_${day.date}`,
        type: 'cold_front',
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
        title: `🌬️ Weather Front ${day.dayName}`,
        body: `${day.dateFormatted} — the barometer ${dropping ? 'is falling ahead of rain. Deer often feed hard before the storm arrives.' : 'is rising after the front. Clear, stable air can get deer moving in daylight.'}`,
        fireAt: dayStart + 5 * HOUR_MS,
        dateStr: day.date,
      });
    }

    if (prefs.severeWeather && SEVERE_CODES.has(day.weatherCode)) {
      events.push({
        id: `severe_weather_${day.date}`,
        type: 'severe_weather',
        title: `⛈️ Severe Weather ${day.dayName}`,
        body: `${day.dateFormatted} — ${day.weatherDesc} expected. Deer will hunker down in thick cover; adjust your hunt plan.`,
        fireAt: dayStart + 5 * HOUR_MS,
        dateStr: day.date,
      });
    }

    if (prefs.primeDay && isPrimeDay(peakHuntScore)) {
      events.push({
        id: `prime_day_${day.date}`,
        type: 'prime_day',
        title: `🎯 Prime Hunt Day ${day.dayName}`,
        body: `${day.dateFormatted} — best deer movement score ${peakHuntScore}/100. Best windows: ${day.morningPrime} & ${day.eveningPrime}.`,
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
          title: `☔ Break in the Rain ${day.dayName}`,
          body: `${day.dateFormatted} ${hour.time} — rain lets up. Deer surge out to feed and stretch. Good time to get set up.`,
          fireAt: hour.timestamp - 30 * 60 * 1000, // 30-minute heads-up
          dateStr: day.date,
        });
      }
    }
  }

  return events.filter((e) => e.fireAt <= horizon).sort((a, b) => a.fireAt - b.fireAt);
}
