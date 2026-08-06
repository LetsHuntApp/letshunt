# Batch 1 — Hunt Score Engine Accuracy

**Status:** Not started · **Scope:** `src/utils/huntingEngine.ts`, `src/services/weatherService.ts`, `src/types.ts`

## Goal

Make the 0–100 hunt score reflect *season-relative* and *scent-relevant* conditions instead
of fixed absolute thresholds, and add the two data inputs we already collect but ignore
(humidity, wind gusts).

## Why

Three accuracy problems in the current engine:

1. **Temperature is scored with absolute thresholds.** Factor 1 in `calculateHuntScore`
   uses `maxTemp >= 78°F → −20`, `>= 73°F → −10`, `>= 66°F → +5`, else `+15`. A 72°F day in
   September (normal) and a 72°F day in December (heat wave) score identically. The same
   goes for the "High Heat Warning" branch in `getDetailedConditionExplanation`
   (`tempF >= 78`). Deer movement tracks *deviation from normal* for the season, not the
   raw number.
2. **Humidity is fetched but never scored.** `weatherService.ts` already requests
   `relativehumidity_2m` in the hourly URL, but the value is discarded — `HourlyForecast`
   has no humidity field. Humidity drives scent-holding and ground noise; it's a
   no-cost factor to add.
3. **Gusts are ignored.** The Open-Meteo request doesn't ask for `windgusts_10m`, and the
   wind factor only uses sustained wind. Gusts (wind-sustained delta) spook deer more than
   steady wind.

## Current behavior

- `src/utils/huntingEngine.ts` → `calculateHuntScore`, **Factor 1: Temperature**:
  - `maxTempCheckF >= 78` → `tempScore = -20` ("poor")
  - `maxTempCheckF >= 73` → `-10`
  - `maxTempCheckF >= 66` → `+5` ("good")
  - else (≤65°F) → `+15` ("optimal")
- `src/utils/huntingEngine.ts` → `getDetailedConditionExplanation`: `if (tempF >= 78)` →
  "High Heat Warning" headline.
- `src/services/weatherService.ts` → `fetch5DayHuntingForecast`: hourly params include
  `relativehumidity_2m` but the mapped `HourlyForecast` objects never store it; no
  `windgusts_10m` in the request at all.
- `src/types.ts` → `HourlyForecast`: no `humidity`, no gust fields.

## Proposed change

### 1. Season-relative temperature scoring

**Add a climatological baseline** for the location, then score the deviation from it.

- Fetch a rolling normal from the free Open-Meteo **Archive API** (no key required):
  `https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={today-30d}&end_date={today-1d}&daily=temperature_2m_max&timezone=auto`
- Compute `normalMaxF = mean(daily.temperature_2m_max)` over ~30 days, and the day's
  deviation `deltaF = forecastMaxF - normalMaxF`.
- **Cache the normal** per location in `localStorage` (e.g. key
  `letshunt_climate_normal_{lat}_{lon}` with a `fetchedAt` timestamp, TTL ~24h) so we
  don't hit the archive API on every forecast refresh. If the fetch fails, fall back to
  the existing absolute thresholds.
- **New scoring bands** (weights are proposals — tune after Batch 5 gives us data):
  - `deltaF >= +12` → `-20` "Unseasonably warm for this time of year"
  - `deltaF >= +6` → `-10`
  - `-6 < deltaF < +6` → `+5` "Near normal for the season"
  - `deltaF <= -6` → `+10` "Well below seasonal normal"
  - `deltaF <= -14` (and forecast max < ~25°F) → `+5` (extreme cold can suppress too —
    cap the bonus so the factor stays honest)
- Apply the same deviation logic in `getDetailedConditionExplanation` (replace the
  `tempF >= 78` check with `deltaF >= +12`).
- Surface the normal in the UI copy, e.g. *"12°F below normal for {date}"* — this is
  the kind of detail hunters quote.

### 2. Humidity / scent factor

- Add `humidity` to `HourlyForecast` in `types.ts` and populate it in
  `weatherService.ts` (data already arrives; just stop discarding it). Add a daily
  `humidityAvg` to `DailyForecast` (average of the day's hourly values).
- New **Factor "Scent & Humidity"** in `calculateHuntScore` (max `+6`, mirrors existing
  factor style):
  - Humidity `75–95%` → `+6` "High humidity holds scent in the thermals and dampens
    ground noise"
  - `60–75%` → `+3` "Moderate humidity, good scent conditions"
  - `< 35%` → `-3` "Dry air: crunchy leaves and sinking scent"
  - `> 95%` (with fog codes 45/48) → `+3` "Foggy: still woods, but reduced visibility"
  - else `0`
- Add humidity to the hourly detail display (DayDetailView / DetailedPredictionView) and
  to `getDetailedConditionExplanation` copy where relevant.

### 3. Wind gusts

- Add `windgusts_10m` to the hourly request URL in `weatherService.ts` and to
  `HourlyForecast` (`windGustMph` / `windGustKmh`).
- In the **Wind Speed** factor, add a gust penalty: if `gust - sustained > 15 mph`
  (≈ 24 km/h) → `-4` "Gusty — swirling scent and noisy woods". Keep the existing
  sustained-wind logic unchanged.

## Files affected

- `src/types.ts` — add `humidity`, `windGustMph`, `windGustKmh` to `HourlyForecast`;
  `humidityAvg` to `DailyForecast`.
- `src/services/weatherService.ts` — request `windgusts_10m`; map humidity + gusts into
  hourly objects; compute `humidityAvg`; new `fetchClimateNormal()` helper with
  localStorage cache; pass `deltaF` into `calculateHuntScore`.
- `src/utils/huntingEngine.ts` — replace Factor 1 temperature thresholds with deviation
  bands; add Scent & Humidity factor; add gust penalty in Wind factor; update
  `getDetailedConditionExplanation` high-heat check.
- `src/services/weatherService.ts` → `generateFallbackForecast` (the offline fallback
  builder lives in this file, not `huntingEngine.ts`) — must still satisfy the new
  `HourlyForecast` fields (add `humidity: 60`, `windGustMph: windSpeedMaxMph + 5` style
  placeholders).

## Open questions / decisions

- **Confirm the deviation thresholds** (above) or provide your own; they're the core
  scientific claim of this batch.
- Should the climate baseline use the *past 30 days* or the *same calendar window across
  prior years*? 30-day rolling is simpler and free; multi-year normals are more accurate
  but need heavier history.
- Where should humidity/gust show in the UI? (Suggest: hourly slider detail + the
  detailed day view's conditions row.)

## Acceptance criteria

- [ ] `npm run lint` and `npm run build` pass.
- [ ] A 70°F day in December scores lower than a 70°F day in September at the same
      location (i.e., deviation logic is active, not absolute).
- [ ] Hourly forecast objects now include `humidity` and gust values (spot-check in
      DevTools).
- [ ] Dashboard shows a "°F above/below normal" hint in the temperature factor
      description.
- [ ] Rating scale and verdict text unchanged in spirit (Batch 3 handles the threshold
      consistency separately).
- [ ] Offline/fallback forecast still renders with no `undefined` values.

## Rollback

Reverting this batch = restoring `calculateHuntScore` Factor 1 to absolute thresholds and
removing the new fields from the hourly mapping. Isolated to the three files above.
