# Batch 3 — Consistency & Housekeeping

**Status:** Not started · **Scope:** `src/utils/huntingEngine.ts`, `src/components/DayDetailView.tsx`, `src/components/ForecastCards.tsx`, `src/components/DetailedPredictionView.tsx`, `changes.md`, `package.json`, `README.md`

## Goal

Make the rating scale have a **single source of truth**, fix the documentation/code
mismatch, and tidy three small professionalization items. Pure cleanup — zero behavior
change for users (except the intended threshold decision below).

## Why

1. **The rating thresholds disagree with the changelog.** `changes.md` documents the
   intended scale as:
   - 0–39 Poor · 40–65 Fair · 66–89 Good · 90+ Excellent
   But the code (`getRatingFromScore` in `huntingEngine.ts`) uses:
   - 90+ Excellent · 76–89 Good · 46–75 Fair · ≤45 Poor
   Worse, `getDetailedConditionExplanation` has its **own third set** of internal bands
   (`score >= 70`, `>= 45`). Three different scales floating around = confusing verdicts
   that contradict the dial.
2. **`package.json` is still named `react-example`** — shows up in DevTools/build output
   and looks unprofessional.
3. **`README.md` is thin** and uses a generic "Google AI" banner image that says nothing
   about LetsHunt.

## Current behavior

- `src/utils/huntingEngine.ts` → `getRatingFromScore(score)`:
  `score >= 90 → Excellent` · `>= 76 → Good` · `>= 46 → Fair` · else `Poor`.
- `src/utils/huntingEngine.ts` → `calculateHuntScore` verdict block repeats the same
  bands (`>= 90`, `>= 76`, `>= 46`).
- `src/utils/huntingEngine.ts` → `getDetailedConditionExplanation`: `score >= 70`,
  `score >= 45` bands (different numbers).
- `changes.md` documents 90/66/40 bands.
- UI components color-code ratings; verify which thresholds each uses
  (`DayDetailView.tsx`, `ForecastCards.tsx`, `DetailedPredictionView.tsx`).

## Proposed change

1. **Centralize the scale.** Export constants from `huntingEngine.ts`:
   - `export const RATING_THRESHOLDS = { excellent: 90, good: 66, fair: 40 }` (or
     `76/46` — see decision below)
   - `getRatingFromScore` and the verdict block read from these constants.
   - `getDetailedConditionExplanation`'s internal bands either read from the constants or
     are documented as intentionally different (better: align them to the same bands).
   - UI components import `getRatingFromScore` / thresholds instead of hard-coding
     numbers.
2. **Decide the scale, then update `changes.md` to match the code** (or vice versa).
   Recommendation: adopt the code's current behavior (90/76/46) as truth if you believe
   newer builds intentionally tightened "Good", then fix `changes.md`; otherwise set
   constants to 90/66/40 and update the code. Either way, **one** number set survives.
3. **Rename the package:** `package.json` → `"name": "letshunt"` (and update any script
   references; nothing should break — vite reads the name only for metadata).
4. **README refresh:** replace the generic banner with a real LetsHunt description
   (features, tech stack, how to run the push server, link to `fixes/`), so a stranger
   can run and understand the project.

## Files affected

- `src/utils/huntingEngine.ts` — constants + single source of truth.
- `src/components/DayDetailView.tsx`, `src/components/ForecastCards.tsx`,
  `src/components/DetailedPredictionView.tsx` — use shared thresholds.
- `changes.md` — reconcile the documented scale.
- `package.json` — name.
- `README.md` — rewrite.

## Open questions / decisions

- **Which scale is intended?** (code's 90/76/46 vs. changelog's 90/66/40). This is the one
  user-facing decision in this batch — everything else is mechanical.

## Acceptance criteria

- [ ] `npm run lint` and `npm run build` pass.
- [ ] Searching the repo finds rating thresholds in exactly one place (`huntingEngine.ts`),
      plus UI imports — no magic numbers in components.
- [ ] `changes.md` matches the code's actual behavior.
- [ ] `package.json` name is `letshunt`.
- [ ] README renders without the generic banner and documents the project.

## Rollback

Trivial — revert the constants/imports, restore `changes.md`/README/package name.
