# LetsHunt — Fix & Improvement Batches

This folder contains explanatory "fix" documents for improvements we identified while
reviewing the app. Each file describes **what** to change, **why**, **where** (exact files
and functions), and **how to verify** — but nothing here has been applied yet.

> **Status convention:** `Not started` → `In progress` → `Applied`. We update this table
> as batches get applied.

## How to apply a batch

1. Tell us which batch to apply (e.g. *"apply batch 2"*).
2. We implement only that batch's changes, following its **Proposed change** section.
3. We verify with:
   - `npm run lint` (TypeScript check, `tsc --noEmit`)
   - `npm run build` (production build)
   - Manual checks listed in the batch's **Acceptance criteria**
4. We update this README's status column and commit the batch as its own change.

## Batch index

| Batch | File | Scope | Dependencies | Status |
|-------|------|-------|--------------|--------|
| 1 | `01-score-engine-accuracy.md` | Season-relative temperature scoring + humidity/scent factor + wind gusts in the hunt score | none | Applied |
| 2 | `02-solunar-accuracy.md` | Real lunar transit-based solunar periods (replaces sunrise/sunset-offset heuristic) | none | Applied |
| 3 | `03-consistency-housekeeping.md` | Single source of truth for rating thresholds; fix `changes.md` mismatch; `package.json` name; README | none | Applied |
| 4 | `04-radar-overlay.md` | Live precipitation radar overlay on the Map view (RainViewer tiles) | none | Applied |
| 5 | `05-personal-movement-index.md` | Per-property movement model from trail cam + harvest data, blended into scores | 1 (types), 2 (nice-to-have) | Not started |
| 6 | `06-accounts-cloud-sync.md` | Accounts + cloud sync roadmap (design document, phased) | none (large effort) | Not started |

## Recommended apply order

- **Quick, independent wins first:** Batch 3 (tiny), Batch 4 (medium).
- **Batches 1 and 2 applied** — core scoring accuracy (season-relative temp, humidity/scent factor, wind gusts) and real astronomy-based solunar.
- **Then Batch 5** (builds on Batch 1's factor architecture).
- **Batch 6** is a large roadmap — do it last, or as its own project.

### Applied batch notes

- **Batches 1 + 2 implementation summary** (added by the implementation pass):
  - `package.json`: added `astronomy-engine` dependency (^2.1.19) for real lunar transit / rise / set calculations.
  - `src/utils/solunar.ts` (new): thin wrapper around astronomy-engine returning `{upperTransit, lowerTransit, moonrise, moonset, moonPhase, moonPhaseName, moonIllumination}`. Safe try/catch + per-window fallback to the legacy heuristic.
  - `src/types.ts`: added optional `humidity`, `windGustMph`, `windGustKmh` to `HourlyForecast`; optional `humidityAvg` to `DailyForecast`.
  - `src/utils/huntingEngine.ts`:
    - `calculateSolunar` rewritten to use real transit/rise/set windows (±1h around each event), falling back window-by-window to the legacy sunrise/sunset-offset heuristic. Phase/illumination stay consistent.
    - `calculateHuntScore` extended with optional `tempDeltaF`, `humidity`, `windGustMph` parameters.
    - Factor 1 (Temperature) now uses deviation-from-normal bands when `tempDeltaF` is provided; falls back to the legacy absolute thresholds (78/73/66) when not.
    - Factor 3 (Wind Speed) adds a `-4` gust penalty when `gust - sustained > 15 mph` (suppressed when sustained winds are already penalised as strong).
    - New Factor 9 (Scent & Humidity) with humidity-based bands (60–95% → +3..+6, <35% → −3, fog → +3).
  - `src/services/weatherService.ts`:
    - Added `windgusts_10m` + `relativehumidity_2m` mapping into the Open-Meteo URL.
    - New `fetchClimateNormal(lat, lon)` helper backed by the Open-Meteo Archive API with a 24h localStorage cache (returns °F, key by lat/lon).
    - Computes `tempDeltaF`, `humidityAvg`, and `gustMaxMph` per day; threads them into daily and hourly `calculateHuntScore` calls.
    - Updated `generateFallbackForecast` to include `humidity`, `windGustMph/Kmh`, and `humidityAvg` placeholders so the offline path also satisfies the new types.
  - **Verified:** `npm run lint` (tsc --noEmit) passes; `npm run build` (vite) succeeds.

- **Batches 3 + 4 implementation summary** (added by the implementation pass):
  - **Batch 3 (consistency):**
    - `src/utils/huntingEngine.ts` now exports `RATING_THRESHOLDS = { excellent: 90, good: 76, fair: 46 }`. `getRatingFromScore`, the verdict block in `calculateHuntScore`, and the score-bucket in `getDetailedConditionExplanation` now read from the constant. (Per user call: code's 90/76/46 wins over `changes.md`'s 90/66/40.)
    - `src/components/DayDetailView.tsx`, `src/components/ForecastCards.tsx`, `src/components/DetailedPredictionView.tsx` all import and reference `RATING_THRESHOLDS` instead of literal `90/76/46`.
    - `changes.md`: top entry now mentions 90/76/46 scale.
    - `package.json`: name renamed to `letshunt`.
    - `README.md`: rewritten from a generic Vite/React scaffold blurb into a real LetsHunt description (features, stack, install + dev + deploy).
  - **Batch 4 (radar overlay):**
    - `src/components/RadarOverlay.tsx` (new): animated precipitation radar using RainViewer's free keyless API. Same Mercator tile math as MapView (clamp ±85.0511, integer-zoom snap, 256-tile sub-zoom scaling). Module-level session cache (10-min refresh), 500 ms frame cadence. Auto-walks past → forecast frames; click-through (`pointer-events: none`); mounted at `z-[6]` (above base tiles at z=5, below the SVG scent/path layer at z=10).
    - `src/components/MapView.tsx`: persistent `showRadar` / `radarOpacity` / `radarColorScheme` state (each saved to `localStorage`); mounted `<RadarOverlay>` inside the map container right after `{allTileElements}`; new layers-dropdown toggle + opacity slider + palette button row (palettes 0–8 via `RADAR_SCHEMES` + `RADAR_SCHEME_NAMES`).
  - **Verified:** `npm run lint` (tsc --noEmit) passes; `npm run build` (vite) succeeds. Code-reviewer caught and we fixed: (a) radar z-index so it sits above base tiles, (b) animation start index so the first tick doesn't jump from "now" back to "oldest."

## Notes

## Notes

- Batch files reference current code as of commit `8ae58c4` (Batches 1 + 2) and then updated to reflect Batches 3 + 4. If code shifts, re-verify line references before applying.
- Every batch is designed to be revertible on its own (no batch depends on another
  batch's applied state except as noted).
