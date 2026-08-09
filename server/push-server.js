/**
 * LetsHunt Push Notification Server
 *
 * Companion server for the LetsHunt PWA that enables push notifications even
 * when the app is closed. Uses the Web Push API (RFC 8030) with VAPID.
 *
 * Flow:
 *   1. Browser subscribes to Push API → sends subscription to POST /subscribe
 *   2. Server stores subscription + location + notification prefs
 *   3. Every CHECK_INTERVAL minutes: fetches weather from Open-Meteo, detects
 *      weather alerts, and sends push notifications via web-push
 *
 * Deployment: run `node push-server.js` (or deploy to Render, Railway, etc.)
 * Set PORT env var to change the port (default 3001).
 *
 * The VAPID keys in vapid.json are used to authenticate with browser push
 * services. Keep the private key secure.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const CHECK_INTERVAL_MINUTES = 15;
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');
const VAPID_FILE = path.join(__dirname, 'vapid.json');

const HOUR_MS = 3600 * 1000;
const SEVERE_CODES = new Set([65, 95, 96, 99]);

// ── VAPID setup ──────────────────────────────────────────────────────────────
//
// Render's free tier wipes the filesystem on every restart, which would
// regenerate the VAPID keys and silently invalidate every existing browser
// subscription. Prefer stable keys from environment variables when present
// (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the Render dashboard); fall
// back to the local vapid.json file (generated on first run).

let vapidKeys;
const envPublicKey = process.env.VAPID_PUBLIC_KEY;
const envPrivateKey = process.env.VAPID_PRIVATE_KEY;
if (envPublicKey && envPrivateKey) {
  vapidKeys = { publicKey: envPublicKey, privateKey: envPrivateKey };
  console.log('[push-server] Using VAPID keys from environment variables (stable across restarts).');
} else {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
  } catch {
    // Generate on first run if vapid.json is missing
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    console.log('[push-server] VAPID keys generated and saved to vapid.json');
  }
}

webpush.setVapidDetails(
  'mailto:letshunt@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

console.log(`[push-server] VAPID public key: ${vapidKeys.publicKey.substring(0, 20)}...`);

// ── Subscription storage ─────────────────────────────────────────────────────

/** @typedef {{ endpoint: string, keys: { p256dh: string, auth: string } }} PushSubscription */

/**
 * @typedef {{
 *   subscription: PushSubscription,
 *   location: { name: string, latitude: number, longitude: number },
 *   prefs: { leadTimeHours: number, coldFront: boolean, weatherFront: boolean,
 *            rainBreak: boolean, primeDay: boolean, severeWeather: boolean },
 *   units: string,
 *   createdAt: number
 * }} StoredSubscription
 */

/** @returns {StoredSubscription[]} */
function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'));
    }
  } catch (e) { console.error('[push-server] Failed to load subscriptions:', e); }
  return [];
}

/** @param {StoredSubscription[]} subs */
function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
  } catch (e) { console.error('[push-server] Failed to save subscriptions:', e); }
}

// ── Weather alert detection (mirrors notificationService.ts logic) ────────────

/**
 * Fetches a 5-day forecast from Open-Meteo and returns raw daily/hourly data.
 * @param {{ latitude: number, longitude: number }} location
 * @returns {Promise<object|null>}
 */
async function fetchForecast(location) {
  const { latitude: lat, longitude: lon } = location;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max,winddirection_10m_dominant,sunrise,sunset&hourly=temperature_2m,pressure_msl,surface_pressure,precipitation_probability,precipitation,weathercode,windspeed_10m,winddirection_10m&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`[push-server] Weather fetch failed for ${location.name}:`, e.message);
    return null;
  }
}

/**
 * Simple alert detection from raw Open-Meteo data. Mirrors the logic in
 * notificationService.ts detectWeatherAlerts() but works directly on raw
 * API JSON to avoid needing the full hunting engine.
 *
 * @param {object} raw - Open-Meteo API response
 * @param {{ leadTimeHours: number, coldFront: boolean, weatherFront: boolean,
 *          rainBreak: boolean, primeDay: boolean, severeWeather: boolean }} prefs
 * @param {boolean} isMetric
 * @returns {{ id: string, title: string, body: string }[]}
 */
function detectAlerts(raw, prefs, isMetric) {
  if (!raw || !raw.daily) return [];
  const daily = raw.daily;
  const hourly = raw.hourly;
  const now = Date.now();
  const horizon = now + prefs.leadTimeHours * HOUR_MS;
  const alerts = [];
  const tempDropThreshold = isMetric ? 5 : 9;
  const tempUnit = isMetric ? '°C' : '°F';

  for (let d = 0; d < Math.min(7, daily.time.length); d++) {
    const dateStr = daily.time[d];
    const dayStart = new Date(dateStr + 'T00:00:00').getTime();
    if (dayStart + 24 * HOUR_MS < now || dayStart > horizon) continue;

    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayName = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Calculate 24h temp drop
    let tempDrop24h = 0;
    if (d > 0 && daily.temperature_2m_max[d - 1] !== undefined) {
      tempDrop24h = (daily.temperature_2m_max[d - 1] * 9/5 + 32) - (daily.temperature_2m_max[d] * 9/5 + 32);
    }

    // Cold front
    if (prefs.coldFront && tempDrop24h >= tempDropThreshold) {
      alerts.push({
        id: `cold_front_${dateStr}`,
        title: `❄️ Cold Front ${dayName}`,
        body: `${dateFormatted} — 24h temp drop of ${Math.round(tempDrop24h)}${tempUnit}. Cold-air surge triggers heavy feeding movement. Get on stand early.`,
      });
    }

    // Barometric front — check surface pressure trend across a few hours
    if (prefs.weatherFront && hourly && hourly.surface_pressure) {
      const dayStartIdx = d * 24;
      const endIdx = Math.min(dayStartIdx + 24, hourly.time.length);
      const pressures = hourly.surface_pressure.slice(dayStartIdx, endIdx);
      if (pressures.length >= 6) {
        const early = pressures.slice(0, Math.min(3, pressures.length)).reduce((a,b)=>a+b,0) / Math.min(3, pressures.length);
        const late = pressures.slice(Math.max(0, pressures.length - 3)).reduce((a,b)=>a+b,0) / 3;
        const change = late - early;
        if (change <= -2.5 || change >= 2.5) {
          const dropping = change <= -2.5;
          alerts.push({
            id: `weather_front_${dateStr}`,
            title: `🌬️ Barometric Front ${dayName}`,
            body: `${dateFormatted} — pressure ${dropping ? 'falling ahead of rain. Deer feed hard before the storm arrives.' : 'rising post-front. Clear, stable air sparks daylight travel.'}`,
          });
        }
      }
    }

    // Severe weather
    if (prefs.severeWeather && SEVERE_CODES.has(daily.weathercode?.[d])) {
      alerts.push({
        id: `severe_weather_${dateStr}`,
        title: `⛈️ Severe Weather ${dayName}`,
        body: `${dateFormatted} — heavy weather expected. Deer will hunker down in thick cover; adjust your hunt plan.`,
      });
    }

    // Prime day — simplified heuristic: no severe weather, light wind, no rain,
    // and rising/steady pressure (proxies the full hunt-score engine).
    if (prefs.primeDay) {
      const dayCode = daily.weathercode?.[d];
      const dayWind = daily.windspeed_10m_max?.[d] || 99;
      const dayPrecip = daily.precipitation_sum?.[d] || 0;
      const isPrime =
        !SEVERE_CODES.has(dayCode) &&
        dayWind < 12 &&
        dayPrecip < 2 &&
        alerts.filter(a => a.id.startsWith('weather_front_') && a.id.endsWith(dateStr)).length === 0;
      if (isPrime) {
        alerts.push({
          id: `prime_day_${dateStr}`,
          title: `🎯 Prime Hunt Day ${dayName}`,
          body: `${dateFormatted} — light wind, dry, stable pressure. Great conditions for deer movement.`,
        });
      }
    }

    // Rain break
    if (prefs.rainBreak && hourly && hourly.precipitation && hourly.time) {
      const dayStartIdx = d * 24;
      const endIdx = Math.min(dayStartIdx + 24, hourly.time.length);
      for (let i = dayStartIdx + 1; i < endIdx; i++) {
        const hTime = new Date(hourly.time[i]).getTime();
        if (hTime < now || hTime > horizon) continue;
        const recentRain = hourly.precipitation.slice(Math.max(dayStartIdx, i - 3), i).some(p => p >= 0.2);
        if (!recentRain || (hourly.precipitation[i] || 0) >= 0.1) continue;
        if (alerts.some(a => a.type === 'rain_break' && a.id.includes(dateStr))) continue;
        const hourLabel = new Date(hourly.time[i]).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        alerts.push({
          id: `rain_break_${dateStr}_${i}`,
          title: `☔ Break in the Rain ${dayName}`,
          body: `${dateFormatted} ${hourLabel} — rain lets up. Deer surge out to feed and stretch. Prime setup window.`,
        });
      }
    }
  }

  return alerts;
}

// ── Notification dedup (server-side, uses subscription-level state) ───────────

/** Map of subscription endpoint → last-notified timestamps for alert IDs */
const notifiedMap = new Map();

/** @param {string} endpoint @param {string} alertId @returns {boolean} */
function wasNotifiedRecently(endpoint, alertId) {
  const map = notifiedMap.get(endpoint);
  if (!map) return false;
  const t = map[alertId];
  return typeof t === 'number' && Date.now() - t < 24 * HOUR_MS;
}

/** @param {string} endpoint @param {string} alertId */
function markNotified(endpoint, alertId) {
  if (!notifiedMap.has(endpoint)) notifiedMap.set(endpoint, {});
  const map = notifiedMap.get(endpoint);
  map[alertId] = Date.now();
  // Prune entries older than 4 days
  const cutoff = Date.now() - 4 * 24 * HOUR_MS;
  for (const k of Object.keys(map)) {
    if (map[k] < cutoff) delete map[k];
  }
}

// ── Push sending ─────────────────────────────────────────────────────────────

/** @param {PushSubscription} subscription @param {{ title: string, body: string, tag: string }} payload */
async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: '/LetsHunt/',
    }));
    return true;
  } catch (e) {
    // 410 Gone means the subscription is expired — should be removed
    if (e.statusCode === 410 || e.statusCode === 404) {
      console.log('[push-server] Subscription expired, will be removed on next cleanup.');
      return 'expired';
    }
    console.error(`[push-server] Push send failed (${e.statusCode}):`, e.message);
    return false;
  }
}

// ── Main check loop ──────────────────────────────────────────────────────────

async function checkAndNotify() {
  const subs = loadSubscriptions();
  if (subs.length === 0) {
    console.log(`[push-server] No subscriptions to check.`);
    return;
  }

  console.log(`[push-server] Checking weather for ${subs.length} subscription(s)...`);
  const expired = new Set();

  for (const entry of subs) {
    const { subscription, location, prefs, units } = entry;
    const isMetric = units === 'metric';

    try {
      const raw = await fetchForecast(location);
      if (!raw) continue;

      const alerts = detectAlerts(raw, prefs, isMetric);
      const freshAlerts = alerts.filter(a => !wasNotifiedRecently(subscription.endpoint, a.id));

      for (const alert of freshAlerts) {
        const result = await sendPush(subscription, {
          title: alert.title,
          body: alert.body,
          tag: alert.id,
        });

        if (result === 'expired') {
          expired.add(subscription.endpoint);
          break;
        }

        if (result === true) {
          markNotified(subscription.endpoint, alert.id);
          console.log(`[push-server] Sent: ${alert.title}`);
        }

        // Rate-limit: small delay between pushes to the same endpoint
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      console.error(`[push-server] Error checking ${location.name}:`, e.message);
    }
  }

  // Remove expired subscriptions
  if (expired.size > 0) {
    const kept = subs.filter(s => !expired.has(s.subscription.endpoint));
    if (kept.length < subs.length) {
      saveSubscriptions(kept);
      console.log(`[push-server] Removed ${subs.length - kept.length} expired subscription(s).`);
    }
  }
}

// ── Express server ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// CORS: allow the PWA (any origin, since it may be on GitHub Pages or localhost)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// GET /vapid-public-key — allows the client to fetch the VAPID public key
app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// POST /subscribe — browser sends its PushSubscription + location + prefs
app.post('/subscribe', (req, res) => {
  const { subscription, location, prefs, units } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing push subscription' });
  }
  if (!location || !location.latitude || !location.longitude) {
    return res.status(400).json({ error: 'Missing location' });
  }

  const subs = loadSubscriptions();
  // Replace existing subscription for same endpoint (user may re-subscribe)
  const idx = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
  const entry = {
    subscription,
    location,
    prefs: prefs || { leadTimeHours: 48, coldFront: true, weatherFront: true, rainBreak: true, primeDay: true, severeWeather: true },
    units: units || 'imperial',
    createdAt: Date.now(),
  };
  if (idx >= 0) subs[idx] = entry;
  else subs.push(entry);

  saveSubscriptions(subs);
  console.log(`[push-server] Subscribed: ${location.name} (total: ${subs.length})`);
  res.json({ ok: true, count: subs.length });
});

// POST /unsubscribe — browser removes its subscription
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  let subs = loadSubscriptions();
  const before = subs.length;
  subs = subs.filter(s => s.subscription.endpoint !== endpoint);
  saveSubscriptions(subs);
  notifiedMap.delete(endpoint);
  console.log(`[push-server] Unsubscribed (${before} → ${subs.length})`);
  res.json({ ok: true, count: subs.length });
});

// GET /health — simple health check + warm-up ping target.
// NOTE: Render's free-tier web services spin down after ~15 minutes of zero
// HTTP traffic. Routers and the setInterval loop only run while the service
// is awake. The companion render.yaml cron job (server/keep-alive.js) pings
// this endpoint every 14 minutes so the service never sleeps — that is what
// makes closed-app push delivery reliable on the free plan. Users can also
// point UptimeRobot / cron-job.org at this URL as a dropping-in replacement.
app.get('/health', (req, res) => {
  const subs = loadSubscriptions();
  res.json({ ok: true, subscriptions: subs.length, uptime: process.uptime() });
});

// POST /trigger — manual trigger for testing or external cron
app.post('/trigger', async (req, res) => {
  res.json({ ok: true, message: 'Check started' });
  await checkAndNotify();
});

/**
 * POST /send-test — manually fire a web-push to a specific client
 * subscription RIGHT NOW, bypassing the weather-check loop. This is the
 * definitive test of the closed-app pipeline: if this delivers while the
 * LetsHunt tab/app is closed, VAPID + subscription + push-service + service
 * worker are all working end-to-end.
 *
 * Body: { subscription: { endpoint, keys: { p256dh, auth } },
 *         location?: {...}, prefs?: {...}, units?: 'imperial'|'metric' }
 *
 * Tags: `letshunt-bg-test-<timestamp>` so every press shows a fresh
 *       notification (the OS collapses repeats keyed on `tag`).
 */
app.post('/send-test', async (req, res) => {
  const { subscription, location, prefs, units } = req.body || {};

  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({
      ok: false,
      error: 'subscription_missing',
      message: 'Send { subscription: { endpoint, keys: { p256dh, auth } } } — get it via pushManager.getSubscription().toJSON() in the browser.',
    });
  }

  // Re-register this subscription on the server so the next weather check
  // can also push to it (defensive sync — fixes wiped-filesystem edge cases
  // when the user opened the app, lost power, then opened settings without
  // changing prefs/location/units).
  try {
    if (location && location.latitude && location.longitude) {
      const subs = loadSubscriptions();
      const idx = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint);
      const entry = {
        subscription,
        location,
        prefs: prefs || { leadTimeHours: 48, coldFront: true, weatherFront: true, rainBreak: true, primeDay: true, severeWeather: true },
        units: units || 'imperial',
        createdAt: Date.now(),
      };
      if (idx >= 0) subs[idx] = entry;
      else subs.push(entry);
      saveSubscriptions(subs);
    }
  } catch (e) {
    console.warn('[push-server] Test re-register failed (non-blocking):', e.message);
  }

  const tag = `letshunt-bg-test-${Date.now()}`;
  const payload = {
    title: '🔔 LetsHunt Background Test',
    body: 'If you see this with LetsHunt closed, background push is wired up correctly. Alerts will arrive here when fronts shift and conditions prime up.',
    tag,
    url: '/LetsHunt/',
  };

  try {
    const result = await sendPush(subscription, payload);
    if (result === 'expired') {
      console.warn(`[push-server] /send-test refused: subscription expired (endpoint ${subscription.endpoint.substring(0, 40)}…)`);
      return res.status(410).json({
        ok: false,
        error: 'subscription_expired',
        message: 'This browser subscription is no longer valid. Open LetsHunt and re-enable alerts.',
      });
    }
    if (result === true) {
      console.log(`[push-server] Test push delivered to ${subscription.endpoint.substring(0, 40)}…`);
      return res.json({ ok: true, queued: true, delivered: 'browser_push_service', tag });
    }
    // result === false — most common cause is a VAPID-key mismatch after a
    // server restart that regenerated vapid.json (free tier wipes FS).
    console.warn(`[push-server] /send-test refused: web-push could not deliver to endpoint ${subscription.endpoint.substring(0, 40)}… — likely VAPID key rotation; user must re-subscribe in the browser.`);
    return res.status(502).json({
      ok: false,
      error: 'push_send_failed',
      message: 'Web-push library did not confirm delivery. The browser subscription is likely invalidated by a recent VAPID key rotation on the server — toggle alerts off and back on once.',
    });
  } catch (e) {
    console.error('[push-server] /send-test crashed:', e);
    return res.status(500).json({ ok: false, error: 'internal', message: e.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[push-server] LetsHunt push server running on port ${PORT}`);
  console.log(`[push-server] Checking weather every ${CHECK_INTERVAL_MINUTES} minutes`);

  // Run initial check after a short delay
  setTimeout(checkAndNotify, 5000);

  // Periodic check
  setInterval(checkAndNotify, CHECK_INTERVAL_MINUTES * 60 * 1000);
});
