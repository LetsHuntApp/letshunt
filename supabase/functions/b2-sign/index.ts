// ============================================================================
// b2-sign — Backblaze B2 presigned-URL signer for LetsHunt
//
// WHY THIS EXISTS
//   A Backblaze application key is a full credential. It can NEVER live in
//   the browser bundle — anyone could read it from DevTools and take over
//   the bucket. So the browser asks THIS function (which runs server-side,
//   holds the B2 key as a Supabase secret, and verifies the user's JWT)
//   for a short-lived upload/download URL, then talks to B2 directly.
//
// ENDPOINT
//   POST {SUPABASE_URL}/functions/v1/b2-sign
//   Authorization: Bearer <user JWT>
//   Body: { "action": "upload" | "download", "clubId": "...", "photoId": "..." }
//   ->   { "url": "https://s3..../letshuntbucket/...?X-Amz-...", "method": "PUT" }
//
// SECRETS (set once via `supabase secrets set`):
//   B2_KEY_ID          the application key ID
//   B2_APPLICATION_KEY the application key (never expose to the client)
//   B2_BUCKET          bucket name (defaults to letshuntbucket)
//   B2_ENDPOINT        S3 endpoint host (defaults to s3.us-east-005.backblazeb2.com)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const B2_KEY_ID = Deno.env.get('B2_KEY_ID') ?? '';
const B2_APP_KEY = Deno.env.get('B2_APPLICATION_KEY') ?? '';
const B2_BUCKET = Deno.env.get('B2_BUCKET') ?? 'letshuntbucket';
const B2_ENDPOINT = Deno.env.get('B2_ENDPOINT') ?? 's3.us-east-005.backblazeb2.com';
const B2_REGION = B2_ENDPOINT.replace(/^s3\./, '').replace(/\.backblazeb2\.com$/, '');

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  // Production GitHub Pages site.
  'https://benptrs2007-spec.github.io',
];

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

// ---------------------------------------------------------------------------
// AWS SigV4 query-string presigning (implemented by hand, no SDK needed).
// Works with the Backblaze B2 S3-compatible API.
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((k) => crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}

// RFC 3986 unreserved characters stay literal; everything else %-encodes.
function uriEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function presign(method: 'PUT' | 'GET', key: string, expiresSeconds: number) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${B2_REGION}/s3/aws4_request`;

  const host = B2_ENDPOINT;
  const uri = `/${B2_BUCKET}/${key.split('/').map(uriEncode).join('/')}`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${B2_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&');

  const canonicalRequest = [
    method,
    uri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(`AWS4${B2_APP_KEY}`, dateStamp);
  const kRegion = await hmac(kDate, B2_REGION);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
        status: 401,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Verify the JWT against Supabase auth.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action, clubId, photoId } = body as {
      action?: string;
      clubId?: string;
      photoId?: string;
    };
    if (!clubId || !photoId || !action) {
      return new Response(JSON.stringify({ error: 'clubId, photoId and action are required' }), {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Membership check — runs with the user's JWT so RLS applies.
    const { data: member, error: memberErr } = await supabase
      .from('hunt_club_members')
      .select('club_id')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (memberErr || !member) {
      return new Response(JSON.stringify({ error: 'Not a member of this club' }), {
        status: 403,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Sanitize photoId to [A-Za-z0-9._-] so it can't escape the club folder.
    const safePhotoId = photoId.replace(/[^A-Za-z0-9._-]/g, '_');
    const key = `${clubId}/${safePhotoId}`;
    const expiresIn = action === 'upload' ? 3600 : 3600;

    const url =
      action === 'upload'
        ? await presign('PUT', key, expiresIn)
        : await presign('GET', key, expiresIn);

    return new Response(
      JSON.stringify({ url, method: action === 'upload' ? 'PUT' : 'GET', expiresIn }),
      {
        status: 200,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
