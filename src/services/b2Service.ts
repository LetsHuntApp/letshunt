/**
 * Backblaze B2 photo storage for LetsHunt.
 *
 * The browser NEVER holds a B2 credential. To upload or download a photo it
 * asks the `b2-sign` Supabase Edge Function for a short-lived presigned URL
 * (the function verifies the user's JWT + club membership server-side), then
 * streams the bytes straight to/from B2.
 *
 * Object layout in the bucket:  {clubId}/{photoId}  (photoId is sanitized).
 */
import { supabase } from './supabaseService';

const FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/b2-sign`
  : '';

const downloadUrlCache = new Map<string, { url: string; expiresAt: number }>();

interface SignResponse {
  url: string;
  method: 'PUT' | 'GET';
  expiresIn: number;
}

async function requestSignedUrl(
  action: 'upload' | 'download',
  clubId: string,
  photoId: string
): Promise<string> {
  if (!supabase || !FUNCTION_URL) {
    throw new Error('Cloud storage is not configured.');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in first.');

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, clubId, photoId }),
  });

  if (!res.ok) {
    let msg = `Signing failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }

  const data2 = (await res.json()) as SignResponse;
  return data2.url;
}

/** Upload a full-res photo blob to the club's B2 folder. */
export async function uploadPhotoBlob(
  clubId: string,
  photoId: string,
  blob: Blob,
  contentType?: string
): Promise<void> {
  const url = await requestSignedUrl('upload', clubId, photoId);
  const res = await fetch(url, {
    method: 'PUT',
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Photo upload failed (${res.status})`);
  }
}

/**
 * A short-lived (1h) URL that streams the full-res photo from B2.
 * Cached per club/photo so the gallery doesn't re-sign on every render.
 */
export async function getPhotoDownloadUrl(clubId: string, photoId: string): Promise<string> {
  const cacheKey = `${clubId}:${photoId}`;
  const cached = downloadUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const url = await requestSignedUrl('download', clubId, photoId);
  downloadUrlCache.set(cacheKey, { url, expiresAt: Date.now() + urlExpiryMs(url) });
  return url;
}

/** Download and validate a full-resolution club photo for local caching. */
export async function downloadPhotoBlob(clubId: string, photoId: string): Promise<Blob> {
  const url = await getPhotoDownloadUrl(clubId, photoId);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Photo download failed (${response.status})`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Photo download returned an empty file.');
  return blob;
}

/** Rough expiry from the presigned URL's X-Amz-Expires (default 3600s). */
function urlExpiryMs(url: string): number {
  const m = /X-Amz-Expires=(\d+)/.exec(url);
  const seconds = m ? parseInt(m[1], 10) : 3600;
  return seconds * 1000;
}
