# LetsHunt accounts & HuntClubs — setup guide

The app code is done. These are the one-time steps only you can do
(they need access to your Supabase and Backblaze accounts). Each takes a few
minutes. Do them in order.

---

## 1. Run the database migration (2 min)

1. Open the Supabase Dashboard → **SQL Editor** → **New query**.
2. Paste the entire contents of `migrations/001_init.sql`.
3. Click **Run**.

This creates `profiles`, `hunt_clubs`, `hunt_club_members`, `hunt_club_data`,
and `trail_cam_photos`, plus all Row-Level Security policies, and wires
profile auto-creation on signup.

## 2. Enable email sign-in (1 min)

Supabase Dashboard → **Authentication** → **Providers** → **Email** →
make sure **Email** is enabled. Recommended while testing:

- **Confirm email**: turn it ON for production (users must click a link),
  or OFF while you test so sign-ups log straight in.

## 3. Deploy the `b2-sign` edge function (5 min)

This function holds your Backblaze key server-side and hands the app
short-lived upload/download URLs. Install the Supabase CLI once:

```bash
npm install -g supabase
supabase login
```

Then from this repo folder:

```bash
supabase link --project-ref fkgtugufktuvvuvaujxy
supabase secrets set B2_KEY_ID=a561a3d5c3f7 B2_APPLICATION_KEY=005a628c26d65ac0e190e97e65c293f2458088500a
supabase functions deploy b2-sign
```

> ⚠️ That B2 key is your **Master Application Key** — it can access every
> bucket and every capability in your whole Backblaze account. Please generate
> a **scoped application key** (Backblaze → App Keys → Add a New Application
> Key) that can only read/write the `letshuntbucket` bucket, and use that one
> in `supabase secrets set` instead. Never put any B2 key in the frontend.

The function reads `B2_BUCKET` / `B2_ENDPOINT` from env too (it defaults to
`letshuntbucket` / `s3.us-east-005.backblazeb2.com`, so no need to set them).

## 4. Allow the app's origin to upload to B2 (2 min)

The browser uploads photos straight from the app to Backblaze, so the bucket
needs a CORS rule for your app's origin.

Backblaze → Buckets → `letshuntbucket` → **Bucket Settings** → **CORS Rules**
→ add:

```
Allowed origins:  http://localhost:5173  (and your deployed site, e.g. https://your-domain.com)
Allowed operations: s3_head, s3_get, s3_put
Allowed headers:  *
Max age: 3600
```

## 5. Test it end-to-end

1. `npm run dev` → the onboarding now asks for an account, then a HuntClub.
2. Create an account, create a club ("My First Club") → your current data
   publishes, photos upload to B2.
3. Open the app in a second browser/incognito, sign in, join with the club's
   invite code → the club data loads.
4. Settings → **Account & HuntClub** → **Sync My Data Up** / **Load Club Data**
   to push/pull on demand.

## Notes

- The club invite code is shown on the club card in Settings — share it with
  hunting buddies.
- Photos: full-res images go to B2 under `{clubId}/{photoId}`; the JSON bundle
  (pins, logs, settings, thumbnails) lives in `hunt_club_data`. The app keeps
  working fully offline. When a signed-in user has an active HuntClub, local
  changes automatically schedule a debounced sync to Supabase and B2; the
  manual sync button remains available in Settings as a retry/force-sync option.
- If you deploy the app somewhere other than `localhost`, add that origin to
  `ALLOWED_ORIGINS` at the top of `functions/b2-sign/index.ts` and re-deploy.
