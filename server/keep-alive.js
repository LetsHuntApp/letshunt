/**
 * Render Cron Job - keep the LetsHunt push server alive.
 *
 * Render's free tier spins down web services after ~15 minutes of zero HTTP
 * traffic. Without this ping, the in-process setInterval(checkAndNotify)
 * loop never fires while LetsHunt is closed, and no background push
 * reaches the browser. This script is invoked on a schedule by the cron
 * entry in `render.cron-example.yaml` (every 14 minutes) and pings the
 * sibling web service so it stays awake.
 *
 * Auto-discovery: if Render exposes the web service URL via env (it does,
 * as `LETSHUNT_PUSH_URL` for sibling services), we use it; otherwise we
 * fall back to the documented production URL.
 *
 * Run standalone with `npm run keep-alive` from the `server/` directory.
 */

const FALLBACK_URL = 'https://letshunt-push.onrender.com';

function resolveUrl() {
  // Render injects `${SERVICE_NAME_UNDERSCORED}_URL` for sibling services
  // inside the same Blueprint workspace.
  const fromEnv = process.env.LETSHUNT_PUSH_URL;
  if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/+$/, '');
  return FALLBACK_URL;
}

function timeoutSignal(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`timed out after ${ms}ms`)), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

async function ping() {
  // Log the resolved URL up-front so misconfiguration (renamed Render
  // service without the LETSHUNT_PUSH_URL env var) is obvious in deploy
  // logs instead of just being "the ping is failing forever".
  const base = resolveUrl();
  if (base === FALLBACK_URL) {
    console.log(`[keep-alive] Using fallback URL ${FALLBACK_URL} - set the LETSHUNT_PUSH_URL env var on this service if your web service has a different name.`);
  } else {
    console.log(`[keep-alive] Pinging sibling service at ${base} (resolved from LETSHUNT_PUSH_URL env var).`);
  }

  const url = `${base}/health`;
  // Render cold starts regularly take 30-40s. Generous timeout keeps the
  // first ping after every deploy / restart cycle from spuriously failing.
  const { signal, clear } = timeoutSignal(60_000);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal, headers: { 'x-keep-alive': '1' } });
    clear();
    const elapsed = Date.now() - startedAt;
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    if (res.ok) {
      console.log(
        `[keep-alive] OK ${url} -> HTTP ${res.status} ` +
        `(subscriptions=${body?.subscriptions ?? '?'}, ` +
        `uptime=${body?.uptime?.toFixed?.(1) ?? '?'}s, ` +
        `elapsed=${elapsed}ms)`
      );
      process.exit(0);
    }
    console.warn(`[keep-alive] WARN ${url} -> HTTP ${res.status} in ${elapsed}ms`);
    process.exit(1);
  } catch (err) {
    clear();
    const msg = err && err.message ? err.message : String(err);
    const elapsed = Date.now() - startedAt;
    // Exit 0 even on failure: cron jobs that exit non-zero get marked
    // failed in Render's dashboard, and the next scheduled run will
    // naturally retry. One missed poke per 14 minutes is much cheaper
    // than a noisy alert.
    console.warn(`[keep-alive] FAIL ${url} -> ${msg} in ${elapsed}ms (will retry in 14m)`);
    process.exit(0);
  }
}

ping();
