/**
 * Safe localStorage helpers.
 *
 * Every localStorage access in the app goes through these functions. Rationale:
 *   - `localStorage.getItem` throws a `SecurityError` in some embedded contexts
 *     (private browsing, blocked third-party storage on iOS Safari).
 *   - `JSON.parse` throws `SyntaxError` on a corrupted/truncated key — and
 *     several components run that on first render, which would white-screen the
 *     whole app on a single bad write.
 *   - `localStorage.setItem` throws `QuotaExceededError` if the payload is too
 *     large. The custom-background photo path stores a base64 data URL that
 *     can blow past the ~5 MB quota on high-res photos.
 *
 * Each helper returns a safe sentinel (`null`, the fallback, or `false`) on
 * failure instead of throwing, so callers can degrade silently.
 */

export function safeGetString(key: string, fallback: string | null = null): string | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Read a JSON value or return `fallback` on missing / corrupted / blocked storage.
 * Validates the parsed result is an object/array to guard against `JSON.parse('"x"')`
 * silently returning a string where an object was expected.
 */
export function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    // Reject primitives where the caller expected an object/array (defensive).
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Write a string to localStorage. Returns `true` on success, `false` if
 * quota-exceeded / storage-blocked — callers can toast / log accordingly.
 */
export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a JSON-serialisable object. Returns the same boolean sentinel as `safeSet`.
 * Serialisation happens before the write so a thrown `JSON.stringify` (cyclic object)
 * is converted into an explicit `false` rather than crashing the surrounding render.
 */
export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage blocked — nothing meaningful to do */ }
}

/**
 * True iff localStorage is usable in the current context. Used by SettingsView
 * to decide whether to show a "storage unavailable" notice (private mode, embeds).
 */
export function isStorageAvailable(): boolean {
  try {
    const probe = '__letshunt_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
