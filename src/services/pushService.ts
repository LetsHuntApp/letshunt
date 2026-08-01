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

// The push server URL — set this to your deployed server.
//
// FREE deployment options (just run `node server/push-server.js`):
//   Local dev:    http://localhost:3001
//   Your PC:      http://localhost:3001 (works while your computer is on)
//
// FREE always-on options (deploy server/push-server.js):
//   Render:       https://letshunt-push.onrender.com
//   Fly.io:       https://letshunt-push.fly.dev
//
// Override at runtime via the browser console:
//   localStorage.setItem('letshunt_push_server_url', 'https://your-url.com')
const PUSH_SERVER_URL = (typeof window !== 'undefined' &&
  localStorage.getItem('letshunt_push_server_url')) ||
  'http://localhost:3001';

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
    const res = await fetch(`${PUSH_SERVER_URL}/vapid-public-key`);
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

    // Get the service worker registration
    const reg = await navigator.serviceWorker.ready;

    // Check existing subscription
    let subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      // Already subscribed — update the server with latest prefs
      console.log('[pushService] Already subscribed, updating prefs on server.');
    } else {
      // Subscribe to push
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      console.log('[pushService] Push subscription created.');
    }

    // Send subscription + location + prefs to the push server
    const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
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
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      // Tell the server to remove this subscription
      try {
        await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
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
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  } catch {
    return null;
  }
}
