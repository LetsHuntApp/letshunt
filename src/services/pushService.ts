/**
 * LetsHunt Push Service (Client)
 *
 * Manages browser Push API subscriptions for background notifications.
 * When enabled, the browser registers with the browser vendor's push service
 * and sends the subscription to the LetsHunt push server. The server then
 * periodically checks weather and sends push notifications even when the
 * app is closed.
 *
 * Requires the companion push server (server/push-server.js) to be running.
 */

// The push server URL — the deployed companion server that delivers background
// alerts while the app is closed. Hardcoded so no manual setup is needed; a
// localStorage override (Settings → Push Server URL) is still honored for
// custom/self-hosted deployments.
export const DEFAULT_PUSH_SERVER_URL = 'https://letshunt-push.onrender.com';
const PUSH_SERVER_KEY = 'letshunt_push_server_url';
// Tracks which VAPID public key the current push subscription was created with,
// so we can detect when the server rotates its keys (Render's free tier wipes
// vapid.json on restart and regenerates keys, which silently invalidates every
// existing browser subscription).
const VAPID_KEY_STORAGE = 'letshunt_push_vapid_key';

export function getPushServerUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_PUSH_SERVER_URL;
  try {
    const stored = localStorage.getItem(PUSH_SERVER_KEY);
    if (stored) return stored;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_PUSH_SERVER_URL;
}

function getStoredVapidKey(): string | null {
  try {
    return localStorage.getItem(VAPID_KEY_STORAGE);
  } catch {
    return null;
  }
}

function setStoredVapidKey(key: string): void {
  try {
    localStorage.setItem(VAPID_KEY_STORAGE, key);
  } catch { /* storage unavailable */ }
}

/**
 * Resolve the service-worker registration only if one actually exists.
 * Unlike `navigator.serviceWorker.ready`, this never hangs when no SW is
 * registered (e.g. local development, where we intentionally skip SW
 * registration) — it resolves to null instead.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/**
 * Convert a base64url-encoded VAPID public key to a Uint8Array for
 * PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Fetch the VAPID public key from the push server.
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${getPushServerUrl()}/vapid-public-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
}

/**
 * Subscribe the browser to push notifications and register with the
 * push server.
 *
 * @param location - The user's hunting location (lat/lng/name)
 * @param prefs - Notification preferences (lead time, event types)
 * @param units - Unit system ('imperial' or 'metric')
 * @returns true if subscription succeeded, false otherwise
 */
export async function subscribeUserToPush(
  location: { name: string; latitude: number; longitude: number },
  prefs: {
    leadTimeHours: number;
    coldFront: boolean;
    weatherFront: boolean;
    rainBreak: boolean;
    primeDay: boolean;
    severeWeather: boolean;
  },
  units: string = 'imperial'
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[pushService] Push API not supported in this browser.');
    return false;
  }

  try {
    // Get VAPID public key from server
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.warn('[pushService] Could not fetch VAPID public key. Is the push server running?');
      return false;
    }

    // Get the service worker registration (null when none exists, e.g. dev)
    const reg = await getSwRegistration();
    if (!reg) {
      console.warn('[pushService] No service worker registered.');
      return false;
    }

    // Check existing subscription
    let subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      // If the server's VAPID key changed since this subscription was created
      // (Render free tier regenerates keys on every restart), the old
      // subscription is dead — 401s on send. Drop it and re-subscribe with the
      // current key so background push keeps working after a server restart.
      const prevKey = getStoredVapidKey();
      if (prevKey !== null && prevKey !== vapidPublicKey) {
        console.log('[pushService] VAPID key rotated — re-subscribing with new key.');
        // If the browser refuses to unsubscribe (rare), the old subscription is
        // dead anyway (401 on send), so drop the reference and create a fresh
        // one rather than reusing a subscription the server can no longer push to.
        try {
          await subscription.unsubscribe();
        } catch {
          /* ignore */
        }
        subscription = null;
      }
    }

    if (!subscription) {
      // Subscribe to push
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      setStoredVapidKey(vapidPublicKey);
      console.log('[pushService] Push subscription created.');
    } else {
      // Already subscribed — update the server with latest prefs
      setStoredVapidKey(vapidPublicKey);
      console.log('[pushService] Already subscribed, updating prefs on server.');
    }

    // Send subscription + location + prefs to the push server
    const serverUrl = getPushServerUrl();
    console.log('[pushService] Registering with push server:', serverUrl);
    const res = await fetch(`${serverUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        location,
        prefs,
        units,
      }),
    });

    if (!res.ok) {
      console.error('[pushService] Failed to register with push server:', res.status);
      return false;
    }

    console.log('[pushService] Push subscription registered with server.');
    return true;
  } catch (err: any) {
    console.error('[pushService] Push subscription failed:', err.message || err);
    return false;
  }
}

/**
 * Unsubscribe the browser from push notifications and notify the server.
 */
export async function unsubscribeUserFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const reg = await getSwRegistration();
    if (!reg) return true;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      // Tell the server to remove this subscription
      try {
        await fetch(`${getPushServerUrl()}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch {
        // Server may be unreachable — still unsubscribe locally
      }

      await subscription.unsubscribe();
      console.log('[pushService] Push subscription removed.');
    }

    return true;
  } catch (err: any) {
    console.error('[pushService] Push unsubscription failed:', err.message || err);
    return false;
  }
}

/**
 * Check if the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
}

/**
 * Get the current push subscription (if any), for debugging.
 */
export async function getCurrentSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await getSwRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  } catch {
    return null;
  }
}

/**
 * Result of attempting to send a background-test push. The server
 * acknowledgement only means the push was handed to the browser
 * vendor's push service — delivery to the device is still asynchronous.
 */
export interface BackgroundTestResult {
  ok: boolean;
  reachedServer: boolean;
  message: string;
  status?: number;
}

/**
 * Drive the *closed-app* push pipeline: ask the push server to fire a real
 * web-push notification to the current browser subscription right now. This
 * is what proves the VAPID keys, subscription, push-service handoff, and
 * service-worker `push` handler are all wired up — even with LetsHunt closed.
 *
 * @param onStateChange optional callback for incremental feedback
 *   ('waking' | 'sending')
 */
export async function sendTestClosedAppPush(
  location?: { name: string; latitude: number; longitude: number },
  prefs?: {
    leadTimeHours: number;
    coldFront: boolean;
    weatherFront: boolean;
    rainBreak: boolean;
    primeDay: boolean;
    severeWeather: boolean;
  },
  units: string = 'imperial',
  onStateChange?: (state: 'waking' | 'sending', info?: string) => void
): Promise<BackgroundTestResult> {
  if (!isPushSupported()) {
    return { ok: false, reachedServer: false, message: 'Push API not supported in this browser.' };
  }

  let subscription: PushSubscriptionJSON | null;
  try {
    const reg = await getSwRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    subscription = sub ? sub.toJSON() : null;
  } catch {
    subscription = null;
  }

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return {
      ok: false,
      reachedServer: false,
      message: "No active push subscription in this browser. Toggle 'Enable Push Notifications' on once, then try this test again.",
    };
  }

  onStateChange?.('waking', 'Waking up push server (cold start on Render free plan can take ~30s)…');

  // Generous timeout — Render free-tier cold starts regularly take 25-40s to
  // boot, and a 10s timeout here would just look broken to the user.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    onStateChange?.('sending', 'Sending web-push through your browser\'s push service…');
    const url = `${getPushServerUrl()}/send-test`;
    const body: Record<string, unknown> = { subscription };
    if (location) body.location = location;
    if (prefs) body.prefs = prefs;
    if (units) body.units = units;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Try to parse JSON; some failure modes (proxies, 502s) return HTML.
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body */
    }

    if (res.ok && data && data.ok) {
      return {
        ok: true,
        reachedServer: true,
        status: res.status,
        message:
          'Test push sent! The browser push service has accepted it. The OS will deliver the notification within seconds — ' +
          'it should appear even if LetsHunt is closed or the screen is locked.',
      };
    }

    // Map common server errors to friendly copy
    const reason = data?.message || data?.error || `Server responded ${res.status}`;
    if (res.status === 410 || (data && data.error === 'subscription_expired')) {
      return {
        ok: false,
        reachedServer: true,
        status: res.status,
        message:
          'This browser subscription is no longer valid (server reported it as expired). Open LetsHunt, flip the master toggle off and back on to register a fresh subscription.',
      };
    }
    if (data && data.error === 'push_send_failed') {
      return {
        ok: false,
        reachedServer: true,
        status: res.status,
        message:
          'Server reached, but web-push refused the send. The server likely has new VAPID keys while the browser still holds an old subscription — toggle alerts off then back on once.',
      };
    }
    if (res.status === 0 || /failed to fetch|networkerror/i.test(String(data?.message || ''))) {
      return {
        ok: false,
        reachedServer: false,
        message:
          "Couldn't reach the push server. On Render's free tier the service sleeps after 15 minutes — first request takes ~30s to cold-start.",
      };
    }
    return { ok: false, reachedServer: true, status: res.status, message: reason };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === 'AbortError';
    if (isAbort) {
      return {
        ok: false,
        reachedServer: false,
        message:
          'Push server did not respond within 60s. Render free tier cold-starts take 25-40s — try again, or check the Render dashboard for the service status.',
      };
    }
    return {
      ok: false,
      reachedServer: false,
      message:
        "Couldn't reach the push server (" +
        (err?.message || 'network error') +
        '). Is it deployed and reachable?',
    };
  }
}
