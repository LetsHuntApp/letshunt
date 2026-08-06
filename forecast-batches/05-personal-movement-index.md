# Batch 5 — Personal Movement Index (the differentiator)

**Status:** Not started · **Scope:** new `src/utils/movementIndex.ts`, `src/types.ts`,
`src/services/weatherService.ts`, `src/utils/huntingEngine.ts`, `src/App.tsx`,
`src/components/SettingsView.tsx`, dashboard UI · **Dependencies:** Batch 1 (types/factor
architecture), Batch 2 (nice-to-have)

## Goal

Turn the user's own trail-cam detections and harvest logs into a **per-property movement
model** ("on *your* ground, deer move most when X") and blend it into the daily/hourly hunt
score as an optional personal factor. This is the moat: DeerCast predicts generic deer
movement; this predicts *your* deer, from data only you have.

## Why

- The app already collects everything needed: `TrailCameraPhoto.weather`
  (`HistoricalWeatherData`: wind dir/speed, temp, pressure + trend, humidity, moon phase,
  weather code) with exact `dateTime` per photo, and `DeerKillLog` entries (stand, weather,
  timestamp). Nothing compares model predictions against actual detections — the insights
  tab even admits this by only counting "most photos under X".
- Current insights (`generateInsights` in `trailCameraService.ts`, ~line 1196) are
  **un-normalized**: "most photos captured under NW wind" is biased by how many daylight
  hours each condition occurred and when cameras were deployed. "Peak activity time" is
  biased toward daylight simply because cams capture mostly in daylight.
- The killer framing competitors can't copy: a **lift score** — *"your property sees 2.3×
  more deer when pressure is falling than average"* — computed from the user's own data.

## Current behavior

- `src/services/trailCameraService.ts`:
  - `fetchHistoricalWeather(lat, lon, dateTimeStr)` (~line 698) — backfills weather per
    photo (already includes `relativehumidity_2m`, `pressure_msl`, `weathercode`,
    `windspeed_10m`, `winddirection_10m`).
  - `importPhotos(...)` (~line 818) — writes photos + weather to IndexedDB.
  - `computeAnalytics(photos, units, pressureUnit)` (line 1045) → `AnalyticsData` with
    `byWindDirection`, `byWindSpeed`, `byTemperatureRange`, `byWeatherCondition`,
    `byPressureRange`, `byMoonPhase`, `byMonth`, `byHourOfDay`, `totalPhotos`,
    `withWeather`.
  - `generateInsights(photos, analytics)` → `PatternInsight[]` (label/detail/confidence)
    — top-wind/temp/pressure/moon/hour/month, rain-vs-dry comparison, pressure-trend
    pattern. **All are raw counts, no normalization, no lift vs. baseline.**
- `src/types.ts` — `HistoricalWeatherData`, `TrailCameraPhoto`, `DeerKillLog` (stand,
  weather, dateTime).
- Hunt score (`calculateHuntScore`) has no notion of the user's property.

## Proposed change — three phases

### Phase A — Normalized property profile (foundation)

New `src/utils/movementIndex.ts` with:

1. **Exposure-aware normalization.** Estimate camera daylight exposure per day
   (sunrise→sunset from the day's forecast or a helper) and compute
   `detectionsPerDaylightHour` per condition bucket. This removes the "more daylight
   hours = more photos" bias.
2. **Lift metric.** For each bucket (wind direction, temp band, pressure trend, hour,
   moon phase), compute `lift = bucketRate / overallRate`. Report buckets with
   `lift > 1.15` as "above your property's average" and `lift < 0.85` as "below".
3. **Per-property profile** `PropertyProfile`:
   - `bestWindDirections: string[]` (highest-lift, min sample count)
   - `peakHours: number[]` (daylight-normalized)
   - `productivePressureTrends: string[]`
   - `productiveTempRangeC/F`
   - `rainBreakLift: number` (detections in the 2h after rain vs. baseline)
   - `sampleCount`, `withWeatherCount`, `confidence: 'high' | 'medium' | 'low' | 'none'`
   - minimum sample gate (e.g. ≥ 25 weather-matched photos for 'medium', ≥ 60 for
     'high'; below 5 → `none` — reuse the existing `MIN_SAMPLES` spirit).
4. **Merge with harvest logs:** `DeerKillLog` entries add tiny but high-value samples
   (an actual kill = a movement event); weight each log entry ~2× a photo and fold them
   into the wind/temp/pressure buckets.
5. Cache the profile in IndexedDB/localStorage (recompute when photos import or logs
   change, not on every forecast refresh).

### Phase B — Blend into the hunt score

- Add an optional **"Property Signal"** factor (max `±8`) to `calculateHuntScore`:
  - For each of the day's/hour's conditions (wind dir, pressure trend, temp band, hour),
    add `+2` if it matches a high-confidence profile bucket, `-2` if it contradicts,
    capped at `±8`.
  - Confidence gating: no signal at all when `confidence === 'none'` → score unchanged
    (default behavior for every new user; the factor simply doesn't appear).
- `weatherService.ts`'s `fetch5DayHuntingForecast` needs the profile. Cleanest: `App.tsx`
  loads the cached profile before `loadForecast()` and passes it down; or the service
  reads it from IndexedDB synchronously-ish (cache in a module-level variable updated by
  import/backup events).
  **Note:** `fetch5DayHuntingForecast` is also called directly from `MapView.tsx` for
  per-pin forecasts (`pinWeatherCache`, when a stand pin is selected) — the profile must
  be threaded through those calls too, or pin forecasts silently miss the Property Signal.
- Add a Settings toggle: **"Use my trail cam data in hunt scores"** (default on,
  greyed out with an explanation when no photos exist yet).

### Phase C — Surface it in the UI

- Dashboard card: **"Your Property Says"** — the top 2–3 high-confidence insights with
  the lift framing, e.g. *"On your ground, deer move 2.3× more when pressure is falling —
  today's pressure is falling ✓"*, plus `sampleCount` ("based on 214 trail cam photos").
- Detailed day view: show a small "Matches your property patterns" line when the
  Property Signal factor is active.
- Insights tab: upgrade `generateInsights` copy to use lift language instead of raw
  counts (keep the existing cards, change the wording + add "vs. your property average").

## Files affected

- `src/utils/movementIndex.ts` (new) — profile computation + lift logic.
- `src/types.ts` — `PropertyProfile` type (+ confidence union).
- `src/services/trailCameraService.ts` — expose photo/log access helpers the profile
  computation needs; optionally migrate `generateInsights` wording.
- `src/services/weatherService.ts` / `src/App.tsx` — thread the cached profile into
  `fetch5DayHuntingForecast` → `calculateHuntScore`.
- `src/utils/huntingEngine.ts` — Property Signal factor in `calculateHuntScore`.
- `src/components/SettingsView.tsx` — toggle; `src/components/DayDetailView.tsx` +
  new dashboard card — display.

## Open questions / decisions

- **Weight range:** `±8` proposal — small enough not to overpower weather, large enough
  to matter. Confirm or adjust.
- **Harvest-log weighting** (2× a photo?) — harvests are sparse; a single log shouldn't
  dominate a bucket. Consider a cap (e.g. logs contribute ≤ 25% of any bucket count).
- Should the profile be **per-location** (your whole property) or **per-camera**? Start
  per-location; per-camera ("cam 3 is a morning cam") is a natural follow-up.
- Privacy: all of this stays on-device (localStorage/IndexedDB) — consistent with the
  current no-account model. Batch 6 must decide how profiles sync if accounts arrive.

## Acceptance criteria

- [ ] `npm run lint` and `npm run build` pass.
- [ ] With < 5 weather-matched photos, the score is byte-identical to today (factor
      absent) and the dashboard card shows the "import more photos" empty state.
- [ ] With a seeded dataset (e.g. 100 photos skewed to NW wind), the profile reports NW
      as best wind, and a forecast day with NW wind scores higher than one with SE wind.
- [ ] Lift numbers are daylight-normalized (verify by seeding photos only in daylight
      hours — peak-hours insight shouldn't just echo sunrise→sunset).
- [ ] Importing new photos or adding a harvest log refreshes the profile (cache invalidation).
- [ ] Settings toggle off → scores revert to today's behavior instantly.
- [ ] Insights tab reads in lift language ("2.3× more") not just raw counts.

## Rollback

Phases A/B/C map to separate commits. Reverting = remove the factor + card + toggle;
profile computation is a new file with no existing-code changes except the threading
points (all additive).
