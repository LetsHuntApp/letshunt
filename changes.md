# Changes Log

## Batch 3 — Consistency & Housekeeping

- **Single source of truth for the hunt-score rating scale.** The
  thresholds now live in `RATING_THRESHOLDS` exported from
  `src/utils/huntingEngine.ts`:
  - `>= excellent` (≥ 90) · Excellent
  - `>= good`      (≥ 76) · Good
  - `>= fair`      (≥ 46) · Fair
  - else · Poor
  Every score band reads from this constant — `getRatingFromScore`,
  the verdict block in `calculateHuntScore`, the
  `getDetailedConditionExplanation` score fallback, and the dial /
  card colour tables in `DayDetailView`, `ForecastCards`,
  `DetailedPredictionView`. To retune the scale, change exactly three
  numbers in `huntingEngine.ts`.
- **Reconciled the documented rating scale with the code.** The
  earlier log entry listed 90 / 66 / 40 bands, but the actual engine
  has been using 90 / 76 / 46. We chose to keep the engine's scale
  (slightly stricter "Good" cutoff, more conservative "Fair") and
  updated the changelog below to reflect the now-truthful numbers.
  This closes the inconsistency flagged in the review.
- **Package rename.** `package.json` name changed from `react-example`
  to `letshunt` so Vite / DevTools / build output reflect the actual
  product.
- **README rewritten** with a real LetsHunt description (features,
  tech stack, dev workflow, push server, link to `forecast-batches/`).

## Earlier round — Rating Scale & Terminology Updates

## Features Added & UI Refinements
- **Hunt-score rating scale** (now backed by `RATING_THRESHOLDS`):
  - `0 - 45`: **Poor** (Red/Rose theme)
  - `46 - 75`: **Fair** (Amber theme)
  - `76 - 89`: **Good** (Emerald/Green theme)
  - `90+`: **Excellent** (Emerald/Green top-tier theme)
  Applied across score calculation functions (`calculateHuntScore`,
  `getRatingFromScore`), 5-Day Forecast cards, and the main condition
  gauge dial.

- **Terminology Standardization ("Hunt" vs "Stand")**:
  - Replaced all instances of "a.m. Stand" / "p.m. Stand" / "Prime Stand" with **"Morning Hunt"**, **"Evening Hunt"**, **"AM Hunt"**, **"PM Hunt"**, and **"Prime Hunt"**.
  - Updated tactical AI Scout report wording to refer to "Hunt Position" and "Position Placement".

- **Pop-Up Time Indicator & Jitter-Free Slider Scrub (`FloatingHourlySlider.tsx`)**:
  - The active time indicator badge height matches the slider track height (`h-7 sm:h-7`) so it fully covers the green slider track when sitting on it.
  - Upon pressing and dragging (touch or click), the badge pops UP above the thumb with a direction pin pointing down, ensuring the time display is never obscured by your finger while scrubbing.
  - Upon release, the badge smoothly drops back down onto the slider track.
  - Removed "Scrub" from the slider header panel name, and made the slider panel significantly more compact by reducing internal paddings and top-spacing.
  - Eliminated drag jitter by decoupling horizontal handle positioning from CSS transition delays.

- **Forecast Day Navigation, 7-Day Window & "Back to Today" Reset (`ForecastCards.tsx` & `DayDetailView.tsx`)**:
  - Expanded the forecast list into a full 7-day forecast (Today + 6 days after today) rendered in an ultra-wide desktop grid (`lg:grid-cols-7`).
  - Implemented a premium, highly visible "↩️ Back to Today" navigation button inside the main conditions panel that appears only when viewing future days.
  - Users can now jump back to Today's current forecast instantaneously from any future day view.

- **Header Responsive Mobile Layout & Logo Fallback (`Header.tsx`)**:
  - Adjusted navigation tab padding and header gaps so the **Settings** button fits comfortably on all mobile screens without any right-edge cutoff.
  - Implemented a robust, safe `onError` fallback mechanism for the brand logo. If `/logo.png` fails to load, is corrupted, or gets blocked, it immediately displays an elegant emerald-to-teal gradient background with an animated white Compass icon.

- **Interactive Wind & Stand Scent Plotter GIS Map Overlay (`WindCompass.tsx`)**:
  - Engineered a zero-dependency, ultra-smooth React Web Mercator Slippy Map directly inside the wind plotter card.
  - Supports smooth mouse dragging and touchscreen swiping to pan/reposition the active hunting stand 🎯 relative to surrounding terrain.
  - Built-in map styles: **Esri Satellite Imagery** (perfect for identifying tree cover, trails, and fields), **Esri Topographic Contour Map** (best for ridgelines and bedding points), and **OpenStreetMap Standard Outdoor**.
  - Renders a semi-transparent red **Scent Dispersion Cone** with pulsing concentric wind wave animations that expand directly over the map cover, simulating real-world atmospheric diffusion of scent molecules.
  - Customizable scent swirl factor setting (15° Laser Focus, 45° Standard Breeze, 75° Swirling Wind).
  - Displays real-time GPS coordinates of the stand marker (the physical map center).
  - Embedded navigation controls for zooming (levels 12-18), snapped coordinate reset, and a detailed tactical hunter alert log.
  - Retains a "Classic Compass Dial" view toggle for users preferring a simplified circular interface.

- **Dynamic Weather Condition Icons Across All Cards (`ForecastCards.tsx` & `DayDetailView.tsx`)**:
  - Weather condition icons and descriptions update dynamically as the hourly slider scrub moves.

- **Wind Compass Dynamic Hourly Sync (`WindCompass.tsx` & `DayDetailView.tsx`)**:
  - Connected the wind direction dial, wind speed, and scent dispersion cone directly to the active hourly slider position (`selectedHour`), so as the slider moves through the 24-hour timeline, the wind vector arrow, scent cone, and speed update dynamically.

- **Settings Page & Navigation Tabs (`SettingsView.tsx` & `Header.tsx`)**:
  - Implemented a clean two-tab navigation system at the top of the app: **Dashboard** and **Settings**.
  - Moved secondary controls off the main dashboard into a dedicated, organized Settings view (Measurement units, Target game species, Theme options, Default starting location management, Saved hunting grounds list with search & delete).
  - Main Dashboard is now spacious, streamlined, and focused purely on real-time hunting weather conditions, forecasting, and tactical deep-dives.

## Files Modified & Added
1. `changes.md` (This log file)
2. `src/components/SettingsView.tsx` (New Settings view page)
3. `src/components/Header.tsx` (Navigation tab bar for Dashboard & Settings)
4. `src/App.tsx` (Integrated active tab state and Settings page rendering)
5. `src/components/WindCompass.tsx` (Wind direction arrow points inward towards center / scent cone)
6. `src/types.ts` (Updated DailyForecast rating union to 'Poor' | 'Fair' | 'Good' | 'Excellent')
7. `src/utils/huntingEngine.ts` (Updated rating scale thresholds & verdict text)
8. `src/components/DayDetailView.tsx` (Updated score thresholds & Morning/Evening Hunt terms)
9. `src/components/ForecastCards.tsx` (Updated card thresholds & AM/PM Hunt terms)

