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
 * Resolve the service-worker registration when it already exists or while the
 * production app is finishing its first registration. The timeout keeps local
 * development (where SW registration is intentionally skipped) from hanging.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  // The app registers sw.js on window load. If a hunter enables alerts during
  // that first visit, wait briefly for the registration instead of failing
  // because the service worker has not finished installing yet.
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
  } catch {
    return null;
  }
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
    return { ok: false, reachedServer: false, message: 'Alerts are not available in this browser.' };
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
      message: 'Alerts are not set up yet. Turn Weather Alerts off and back on, then try the test again.',
    };
  }

  onStateChange?.('waking', 'Getting your alerts ready…');

  // Generous timeout — Render free-tier cold starts regularly take 25-40s to
  // boot, and a 10s timeout here would just look broken to the user.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    onStateChange?.('sending', 'Sending a test alert…');
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
          'Test alert sent. Close LetsHunt now — you should still receive the alert within seconds.',
      };
    }

    // Map common server errors to friendly copy
    if (res.status === 410 || (data && data.error === 'subscription_expired')) {
      return {
        ok: false,
        reachedServer: true,
        status: res.status,
        message:
          'Your alert connection needs refreshing. Turn Weather Alerts off and back on, then try again.',
      };
    }
    if (data && data.error === 'push_send_failed') {
      return {
        ok: false,
        reachedServer: true,
        status: res.status,
        message:
          'Your alert connection needs refreshing. Turn Weather Alerts off and back on, then try again.',
      };
    }
    if (res.status === 0 || /failed to fetch|networkerror/i.test(String(data?.message || ''))) {
      return {
        ok: false,
        reachedServer: false,
        message:
          "The alert service is waking up. Please try the test again in a few seconds.",
      };
    }
    return {
      ok: false,
      reachedServer: true,
      status: res.status,
      message: 'The alert service could not send that test. Please turn Weather Alerts off and back on, then try again.',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === 'AbortError';
    if (isAbort) {
      return {
        ok: false,
        reachedServer: false,
        message:
          'The alert service did not respond in time. Please try again in a few seconds.',
      };
    }
    return {
      ok: false,
      reachedServer: false,
      message:
        'The alert service could not be reached. Please try again in a few seconds.',
    };
  }
}
