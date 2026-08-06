# Batch 2 — Real Solunar Periods (Lunar Transit)

**Status:** Not started · **Scope:** `src/utils/huntingEngine.ts` (+ optional new `src/utils/solunar.ts`)

## Goal

Replace the approximate solunar major/minor periods with **real astronomy**: major periods
centered on the moon's actual overhead transit (and underfoot, +12h), minor periods on the
real moonrise/moonset. Keep the same public interface so nothing downstream changes.

## Why

The current `calculateSolunar()` derives major/minor windows by nudging **sunrise/sunset**
by `(moonPhase * 2 - 1)` hours. That's a rough approximation:

- The moon's transit time depends on the moon's actual position and the observer's
  longitude/latitude, not just the phase — so the "major period" can be several hours off
  the real event.
- The classic solunar model hunters trust is: **Major = moon overhead/underfoot, Minor =
  moonrise/moonset.** We're not computing either event; we're simulating them.
- Solunar feeds three outputs: the `SolunarInfo` ranges on the dashboard, the hourly
  `solunarRating` (`getSolunarRating`), and the small Solunar factor in the score. All of
  them inherit the same error, so fixing the source fixes all three.

## Current behavior

- `src/utils/huntingEngine.ts` → `calculateSolunar(dateStr, lat, lon, sunriseStr, sunsetStr)`:
  - Moon phase from a fixed reference new moon (2024-01-11) and the synodic month —
    *this part is fine* (cyclical, accurate to ~a day).
  - `major1/2` = sunrise/sunset ± `(moonPhase*2-1)` hours ± 1h, spanning 2h.
  - `minor1/2` = sunrise − 2h (1h span) and sunset + 1.5h (1h span) — i.e., the minor
    periods aren't tied to moonrise/moonset at all.
- Downstream consumers (unchanged by this batch):
  - `getSolunarRating(timestamp, solunar)` in `huntingEngine.ts`
  - `SolunarInfo` fields rendered in `DayDetailView` / `DetailedPredictionView`
  - Solunar factor in `calculateHuntScore`

## Proposed change

1. **Add a tiny astronomy helper** (either hand-rolled NOAA sunrise/moonrise algorithm or
   the `astronomy-engine` npm package — ~no deps, MIT, well-tested). A dedicated
   `src/utils/solunar.ts` keeps `huntingEngine.ts` from growing.
   - Compute per date/location: moon phase (fraction + illumination + name), **moonrise,
     moonset**, and **upper transit** (when the moon crosses the observer's meridian).
   - Lower transit (underfoot) = upper transit + 12h.
2. **Rewrite the period windows inside `calculateSolunar`** (keep the same signature and
   return shape so `weatherService.ts` and the UI don't change):
   - `major1` = upper transit − 1h … + 1h (classic 2h window)
   - `major2` = lower transit − 1h … + 1h
   - `minor1` = moonrise − 1h … + 1h (fall back to a transit offset if moonrise doesn't
     occur that day — days with no moonrise are normal)
   - `minor2` = moonset − 1h … + 1h
   - `moonPhaseName` / `moonIllumination` / `sunrise` / `sunset` output unchanged.
3. **Graceful fallback:** if the astronomy computation throws (invalid date, weird lat),
   keep the current sunrise/sunset-offset heuristic so solunar never disappears.
4. **Sanity-check copy:** the dashboard labels already say "major/minor"; consider a small
   footnote like *"based on actual moon transit times"* in the solunar card.

## Files affected

- `src/utils/solunar.ts` (new) — astronomy calculations (phase, rise/set, transit).
- `src/utils/huntingEngine.ts` — `calculateSolunar` uses the new helper; exports unchanged.
- Optional: `package.json` — add `astronomy-engine` if we don't hand-roll it.
- No changes needed in `weatherService.ts`, `types.ts`, or UI components (interface kept).

## Open questions / decisions

- **Hand-roll vs. library?** `astronomy-engine` is the reliable option; hand-rolling the
  NOAA lunar algorithm is ~150 lines and zero deps. Recommend the library.
- Do you want solunar *confidence* surfaced (e.g., when a day has no moonrise, we show a
  smaller minor window)? Recommend yes, low priority.

## Acceptance criteria

- [ ] `npm run lint` and `npm run build` pass.
- [ ] For a known date/location, the major period lands within ~30 min of the published
      lunar transit time (spot-check against a moon calculator like timeanddate.com).
- [ ] Minor periods now coincide with moonrise/moonset ± 1h, not sunrise/sunset.
- [ ] Hourly `solunarRating` ('High'/'Medium'/'Normal') still populates correctly across
      a full 7-day forecast (no missing/`undefined` windows).
- [ ] Fallback path exercised (temporarily throw in the astronomy helper) renders the old
      heuristic, no crash.

## Rollback

Remove `src/utils/solunar.ts`, revert `calculateSolunar` to the sunrise/sunset-offset
logic, drop the dependency. Isolated to `huntingEngine.ts` + package manifest.
