# Changes Log

## Batch 14 — Simple Dashboard Is Now the Default + "Today's Hunt" Title

- **The Simple Dashboard is now the app-wide default.** New visitors (and anyone who never explicitly switched) land on the compact glance-first view; users who turned on the full dashboard keep their saved choice. The Settings toggle is now labeled **Advanced Dashboard** — flipping it on swaps in the full-featured view (factor breakdowns, prime windows, 14-day forecast).
- **"Today's Hunt" title added** above the hero card on the Simple Dashboard, in a theme-appropriate display face (Oswald on the Hunting theme, standard sans elsewhere). The title follows the selected day ("Today's Hunt", "Friday's Hunt", …) so it always labels whose data is shown.
- **Hourly hunt-score bars always show their true score color.** The old behavior dimmed every unselected bar to 60%; now all 24 bars render at full color and the selected hour simply glows (a soft color-matched halo) so it stands out without muting the rest.

## Batch 13 — Okay Band Widened to 41–70 + Wind-Map Slider Smoothness

- **Okay band widened to 41–70** (was 41–60); **Good is now 71–85** and Great stays 86+. Only `RATING_THRESHOLDS.good` moved (61 → 71) — every rating, verdict, explanation, and color table across both dashboards, day-detail pages, forecast cards, and charts reads from the shared constant.
- **Wind-map hour slider no longer jitters.** The time and wind readouts beside the slider now sit in fixed-width slots, so the slider track's width no longer breathes as the label text changes (the thumb used to shift ~17px mid-drag).

## Batch 12 — Five-Band Hunt-Score Ratings (Very Slow → Great)

- **New five-band movement scale across the whole app** (both dashboards, day-detail, forecast cards, sliders, and charts): **Great 86+**, **Good 61–85**, **Okay 41–60**, **Slow 26–40**, **Very Slow 0–25**. `RATING_THRESHOLDS` in `huntingEngine.ts` is the single source of truth — the verdict copy, ratings, explanation thresholds, and every color table read from it.
- **New color coding** that follows each theme: **Great = deep green**, **Good = green**, **Okay = yellow**, **Slow = orangish**, **Very Slow = red**. Applies to the score bar/dial, hourly & daily bars, forecast-card badges and borders, the extended-range rating pills, the pressure-chart movement chip, and the simple-dashboard legend.
- The simple dashboard legend now lists all five bands, and its hero bar labels use the new names (e.g. `OKAY`). Great (86+) still earns the star.

## Batch 11 — Toggleable Simple Dashboard

- **Added a new "Simple Dashboard" that is opt-in from Settings.** The regular dashboard is unchanged and remains the default. Under "Dashboard Style", flipping **Simple Dashboard** on swaps the dashboard tab to a compact, glance-first layout.
- **Compact hero card.** A small hunt-score dial sits beside the current conditions: live weather icon and temperature, wind direction and speed, and sunrise/sunset — all in one tight card.
- **Hourly hunt-score bar.** A color-coded bar for every hour of today shows movement quality at a glance (Great / Good / Fair / Poor), with no hourly slider needed.
- **Daily hunt-score bar.** A color-coded bar per day; tapping one opens that day's full breakdown (factor panel, rain & barometer chart, and wind/scent plotter).
- **Today's rain & barometer chart.** The existing combined pressure/precipitation chart is shown below the daily bar and labeled for the current day.
- **Compact satellite wind map.** A small Esri-satellite map centered on the current location shows a red scent cone pointing downwind, with zoom/pan/reset controls and an embedded hourly slider so you can scrub the wind through the day.
- The simple-dashboard preference is persisted and included in JSON backups.

## Batch 10 — Usability: Decluttered Header & Larger Mobile Text/Touch Targets

- **Header simplified to the essentials.** Removed the quick units (°F/°C)
  toggle and the theme-cycle (Sun) button from the header on every screen
  size. The header now shows only the logo, GPS locate, and location search;
  units and theme were already reachable in Settings under clearly labeled
  "Unit System" and "Theme & Interface" sections, so switching °F/°C or
  Standard/Olive/Hunter is one tap away in one place instead of two.
- **Icon-only header controls now have accessible names.** The GPS button,
  the location star (save to grounds), and the home (set default) button got
  real `aria-label`s, and the search input is labeled — tooltips alone were
  invisible on touch devices.
- **Minimum text size raised across the app.** Swept every sub-12px class in
  the 21 component files: the old `text-[8px]`/`text-[9px]`/`text-[10px]`/
  `text-[11px]` micro-labels are now 11px–12px (most content text is 12px,
  i.e. `text-xs`). This matters for a hunting app used outdoors — bright
  sunlight, gloves, low light.
- **Bigger touch targets.** The header GPS button is now a 40px fixed-size
  target, the search field is taller, the mobile bottom-nav buttons are
  taller, the location-badge buttons (star/home) grew from ~20px to ~32px,
  and small map/trail-cam inline buttons got more padding. Verified on the
  running app: no horizontal overflow or clipped labels at mobile width.

## Batch 9 — Location Permission Prompt

- **Added a clear location-access prompt on startup.** If the browser has not
  already granted geolocation access, LetsHunt explains why it needs location
  for GPS hunting grounds and map tools before opening the browser permission
  request.
- **Handles denied and unsupported browsers.** Users can dismiss the prompt,
  retry after changing browser site settings, or continue by searching for a
  hunting ground manually. Previously granted access does not interrupt startup.

## Batch 8 — Simplified Account Access & Automatic Cloud Sync

- **Simplified the account controls.** Sign up/sign in is now a compact switch instead of two large mode buttons, and the magic-link action is labeled **Send Secret Link** with a Lucide mail icon in both login surfaces.
- **Automatic HuntClub sync is now enabled.** When a signed-in device has an active HuntClub, local settings, map pins/zones/paths, harvest logs, trail-cam records, and new photo imports schedule a debounced upload automatically. The complete data bundle is saved to Supabase and full-resolution trail-cam photos are uploaded to the configured Backblaze B2 bucket.
- **Sync remains offline-safe.** Local storage/IndexedDB stay usable when disconnected; failed cloud syncs are logged and retried by the next local change, while manual sync controls remain available in Settings.

## Batch 7 — Notification Pause & Cold Front Forecast Badge

- **Removed weather notifications for now.** System-alert code, notification controls
  in Settings, notification backup data, and the service-worker notification handler
  are gone. The app remains focused on the in-app forecast and hunting plan.
- **Added a clear cold-front forecast badge.** A day with a significant 24-hour
  temperature drop (at least 9°F / 5°C) now shows a blue snowflake pill labeled
  **COLD FRONT!** beside the hourly condition row at the bottom of its forecast
  card. The shared threshold is unit-safe and uses the same drop that feeds the
  hunting forecast.

## Batch 6 — Seasonal Temperature Context for Hunting Time

- **Hourly temperature deviation now uses a seasonal local-hour baseline.**
  The engine compares each forecast hour with a 31-day calendar window around
  the forecast period from the previous five years, grouped by local clock hour.
  Dawn is compared with dawn and dusk with dusk instead of using a recent hot or
  cold stretch—or the day's afternoon maximum—as the definition of normal.
- **Absolute temperature context now protects the hunting recommendation.**
  Extreme heat, very warm conditions, and severe cold can reduce the quality or
  comfort of a daylight sit even when they are close to the seasonal normal.
  The score now combines seasonal deviation with conservative absolute-context
  adjustments and explains the practical hunting impact in the user's units.
- **Daily temperature change now reflects hunt windows.** The daily score uses
  the average same-hour 24-hour change across the morning/evening prime hours,
  rather than a max-temperature change from portions of the day the hunter may
  never sit through.

## Batch 5 — Cloud Cover, Unit-Safe Best Hunt & Hourly Temperature Normals

- **Cloud cover now influences the forecast.** Open-Meteo hourly cloud cover is
  carried into each hour and averaged across the morning/evening prime windows.
  The new Cloud Cover factor gives a small benefit to partly/mostly cloudy
  conditions, stays neutral during active precipitation, and never outweighs
  the core weather and timing signals.
- **Best Hunt no longer uses a second scoring formula.** It now chooses between
  the actual prime-window hours using their stored hunt scores. This removes the
  old raw-temperature subtraction that changed recommendations when switching
  between Fahrenheit and Celsius and could disagree with the score dial.
- **Hourly temperatures now use hourly normals.** The climate lookup now compares
  each local clock hour with a seasonal baseline instead of judging dawn against
  the daily maximum normal.


## Batch 4 — Score Calibration, Prime-Window Daily Scoring & Real Solunar Windows

- **The dial no longer pegs at 99.** Recalibrated every factor in
  `calculateHuntScore` (baseline 50 → 46; per-factor maxes trimmed:
  Temperature 15→6, Trend 8→5, Wind 10→7, Barometer 6→4, Rain 12→7,
  Time-of-Day 16→9, Rut 8→6, Moon 5→6, Humidity 6→4). A normal mild
  autumn morning prime hour now lands ~75–80 (Good) instead of 95–99, and
  only a genuinely exceptional alignment — cold front, rain break, major
  moon window, ideal wind, and the like — clears 90. `RATING_THRESHOLDS`
  and every UI band are untouched, so ratings stay consistent app-wide.
- **The daily score now reflects the hours you'll actually hunt.**
  `weatherService` builds the daily outlook from the morning/evening prime
  windows instead of the day's extremes: the temperature (and its deviation
  vs the 30-day climate normal), the representative weather code, humidity,
  peak gust, and the rain-break / post-storm flags are all prime-window
  scoped. A 90°F afternoon no longer tanks a day whose 6–9 AM window is a
  perfect 62°F, and rain that broke at 2 PM no longer earns a "rain break"
  bonus for a rained-on morning hunt.
- **Real solunar windows now feed the score, and the midnight bug is dead.**
  `calculateSolunar` emits exact epoch-ms windows (`solunarWindows`) beside
  the display strings. `getSolunarRating` and the daily prime-overlap check
  compare against those timestamps, so a major window running 11 PM → 1 AM
  correctly rates the post-midnight hours High (previously the end time was
  re-parsed onto the same calendar day, making the window invisible). Hourly
  scores earn a Moon Activity bonus when the hour sits inside a major (+3) /
  minor (+1) window; the daily score earns a smaller bonus (+2 / +1) when a
  window overlaps the morning or evening prime windows. Windows that cross
  midnight now display "…(next day)".
- DayDetailView / DetailedPredictionView recompute the factor panel with the
  hour's stored solunar rating so the breakdown always agrees with the dial.

## Rut badge prominence + Olive/Hunting card theme consistency

- **Rut status badge is now prominent & readable on every theme.** All rut
  phase badges (`rutEngine.ts` badgeStyle) switched from translucent pastels
  to solid, high-contrast phase colors with white text and colored borders —
  readable on light and dark variants of Standard, Olive and Hunting alike.
  Peak Rut gets a rose→orange gradient. The dashboard hero badge
  (`DayDetailView`) is larger with a white glow ring, deeper shadow, a
  pulsing dot during Peak Rut, and a bigger phase icon; forecast-day cards
  (`ForecastCards`) now color-code each day's rut phase with the same solid
  styles.
- **Olive & Hunting cards now share one hue family with the hourly slider.**
  Root cause: `src/index.css` had an unclosed `.hunting .font-brand-hunting`
  block that absorbed every `.dark.olive` / `.dark.hunting` card re-tint rule
  inside a `prefers-reduced-motion` media query — with CSS nesting semantics
  those selectors never matched, so dark-mode cards stayed generic black while
  the inline-styled slider kept its theme hue. Restructured the tail into
  valid top-level rules, completed the previously-empty Hunting (walnut)
  re-tints, aligned Olive to a consistent moss hue (base, hover, gradient
  stops, nested-depth `*0.5`/`*0.7` cards), and added **light-mode** paper
  re-tints (`#f7f5ed` olive / warm kraft hunting) so white cards in those
  themes no longer look stark white. All re-tints use the same
  `--card-opacity` / `--card-blur` settings as every other card.
- Removed the `}}}}}}` "auto-close orphan braces" hack — brace balance is now
  exact (verified: final depth 0).

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

