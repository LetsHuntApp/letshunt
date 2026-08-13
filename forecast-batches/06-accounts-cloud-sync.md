# Batch 6 — Accounts & Cloud Sync (Roadmap)

**Status:** In progress — Phases 0–2 partially shipped (Supabase auth + HuntClubs
in onboarding, data bundle publish/pull, B2 photo storage via the `b2-sign` edge
function). Remaining: continuous background sync (Phase 3), push server (Phase 4),
launch hardening (Phase 5). · **Scope:** project-wide (new backend + auth + sync layer) ·
**Nature:** this is a **design document / phased roadmap**, not a single apply-able diff.
Expect multiple working sessions.

## Goal

Let users sign in and have their **hunting grounds, pins, polygons, paths, harvest logs,
trail cam photos, insights/profile, and settings** follow them across devices — with
offline-first behavior (the app keeps working with no signal) and a clean migration path
for the ~2 dozen `localStorage` keys + IndexedDB stores the app already uses.

## Why

- Today **everything lives on one device**: `localStorage` (`letshunt_*` keys — see
  `dataBackupService.ts`'s `LOCAL_STORAGE_KEYS`) and IndexedDB (`LetsHuntTrailCams`,
  stores: photos, fullImages, weatherCache, cameraLocations, targets, analyticsCache).
  A lost phone = years of trail-cam intel gone. The JSON backup/restore is a power-user
  band-aid, not sync.
- Huntwise/DeerCast are cross-device by default. This is the single biggest
  "app → product" gap.
- Bonus unlocked by accounts: server-side push targeting a user's real locations, opt-in
  sharing (buddy groups / lease sharing), and a future paid tier.

## Current behavior (data inventory to migrate)

- `localStorage` keys (from `src/services/dataBackupService.ts`):
  `letshunt_theme[_variant|_mode]`, `letshunt_units`, `letshunt_pressure_unit`,
  `letshunt_default_location`, `letshunt_location`, `letshunt_favorites`,
  `letshunt_custom_background`, `letshunt_bg_opacity`, `letshunt_bg_blur`,
  `letshunt_deer_kill_logs`, `letshunt_saved_pins`, `letshunt_saved_polygons`,
  `letshunt_saved_paths`, `letshunt_push_server_url`, `letshunt_map_style`,
  `letshunt_show_preferred_wind`, `letshunt_show_scent_cone`,
  `letshunt_show_property_boundaries`, `letshunt_show_zones`, `letshunt_show_paths`,
  `letshunt_show_pins`, `letshunt_trailcam_default_loc`, notification prefs
  (`letshunt_notification_prefs`), push VAPID key, etc.
- IndexedDB `LetsHuntTrailCams` (v2): photos (+ full-size blobs, thumbnails), weather
  cache, camera locations, targets, analytics cache.
- The existing `LetsHuntBackup` JSON format (export/import in `dataBackupService.ts`)
  is a ready-made schema for the first cloud sync payload — reuse its structure.

## Proposed phases

### Phase 0 — Decide the backend (recommend Supabase)
- **Supabase** (free tier: auth, Postgres, storage, generous limits) — recommended:
  matches the React SPA, realtime sync possible later, Row Level Security fits per-user
  data. **Firebase** is the alternative if team familiarity or Firestore wins.
- Prereq: a `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env setup (never commit keys),
  following the repo's established env-loader convention.

### Phase 1 — Schema & data model
- Map each `localStorage` key → a table (e.g. `user_settings(user_id, key, value_json,
  updated_at)`) and each IndexedDB store → a table (photos → `trail_cam_photos(...)` with
  metadata; blobs → object storage bucket).
- Add `updated_at` timestamps to every row. Reuse the `LetsHuntBackup` versioning concept
  (`BACKUP_VERSION`) as a migration version counter.

### Phase 2 — Auth
- Email/password + magic-link (Supabase auth), plus **anonymous → upgrade** flow so
  existing local-only users can attach their device data to a new account instead of
  starting empty.
- Guard all queries with RLS (`user_id = auth.uid()`).

### Phase 3 — Sync engine (the hard part)
- **Offline-first:** local storage remains the source of truth while offline; a sync
  queue records mutations; on reconnect, push changed rows and pull remote rows.
- **Conflict policy:** per-key/per-row **last-write-wins by `updated_at`** for settings;
  for photos/logs/pins, **merge by ID** with client timestamps (existing IDs are already
  unique — `crypto.randomUUID()`-style). Surface rare conflicts with a simple "keep
  this device / keep cloud" picker rather than auto-resolving silently.
- Full photo blobs stay in object storage; IndexedDB keeps thumbnails + a local cache of
  recently viewed full images.

### Phase 4 — Push server integration
- `server/push-server.js` gains user-scoped subscriptions (`user_id` on the `/subscribe`
  payload) and per-user locations/prefs pulled from the database instead of the
  filesystem `subscriptions.json` (which Render's free tier wipes). Move VAPID keys fully
  to env vars (already supported).

### Phase 5 — Migration & launch
- On first sign-in from a device with local data: offer "Upload my on-device data"
  (reuse `exportBackupData`-style harvesting) → write to cloud, then enable sync.
- Keep the JSON export/import feature as a manual escape hatch.
- Privacy: document what syncs (everything you create) and add account deletion that
  removes all rows + storage objects.

## Files affected (when implemented)

- New: Supabase client (`src/services/supabaseService.ts`), sync engine
  (`src/services/syncService.ts`), auth UI in `SettingsView.tsx`, `.env` handling.
- Modified: `src/services/dataBackupService.ts` (upload path), `trailCameraService.ts`
  (write-through queue), `server/push-server.js` (DB-backed subs), `App.tsx`
  (auth/sync state), `settings` views.

## Open questions / decisions

- **Supabase vs Firebase** (Phase 0) — the biggest fork in the road.
- Scope of first release: settings + pins/logs/paths first, trail cam photos second
  (blobs are the expensive/storage-heavy part), or everything together?
- Should the Personal Movement Index (Batch 5) profile sync as part of "data" or be
  recomputed per device? (Recommend: sync the raw photos/logs, recompute locally.)

## Acceptance criteria (eventual, per phase)

- [ ] Sign in on phone A, add a pin + log a photo, sign in on laptop B → both appear.
- [ ] Airplane-mode edit on A, then reconnect → edits merge with no data loss and a clear
      conflict resolution path.
- [ ] Fresh install → sign in → full restore of settings, map data, logs, and photo
      gallery without a manual backup file.
- [ ] Logout on one device doesn't delete another device's local copy (sync is merge, not mirror).
- [ ] Push notifications keep working after a Render restart (DB-backed subscriptions).
- [ ] Account deletion removes all cloud data.

## Rollback / sequencing

This batch is **additive by phase** — each phase ships behind a feature flag/sign-in
gate, and local-only users are untouched until they opt in. Never make cloud a hard
dependency of the local app.
