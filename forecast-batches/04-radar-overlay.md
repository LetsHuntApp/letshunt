# Batch 4 — Live Radar Overlay on the Map

**Status:** Not started · **Scope:** `src/components/MapView.tsx`, new `src/components/RadarOverlay.tsx`

## Goal

Add a **live precipitation radar overlay** to the existing Map view — animated past +
short-term-forecast frames, opacity control, and a layer toggle — using RainViewer's free
public tiles. This is DeerCast's signature visual and the single most-requested "wow"
feature the app is missing.

## Why

- Competitors (DeerCast especially) lead with radar because rain timing *is* the hunt
  decision: *"do I have a dry window to get to the stand?"* We already predict rain-break
  windows in the score; seeing the actual rain cell moving on the map makes that tangible.
- The MapView is already a hand-built slippy map with the exact tile math needed
  (`latLngToTileCoords`, `MapTile` with wrapped X) — overlaying an extra tile layer is a
  natural extension, not a rewrite.
- RainViewer's public API is **free, keyless**, and served over HTTPS — no cost or
  signup, same licensing posture as the Open-Meteo weather data.

## Current behavior

- `src/components/MapView.tsx`:
  - `latLngToTileCoords(lat, lng, zoom)` — Web Mercator math (also `tileXToLng`,
    `tileYToLat`).
  - `getTileUrls(z, ty, tx, style)` — base layer providers (Esri/OSM) with fallback chain.
  - `MapTile` (`React.memo`, ~line 153) — renders one base tile `<img>` with
    load/error/opacity handling; tiles stacked absolutely; `MAX_CACHED_TILES = 500`
    eviction via `cachedTilesRef`.
  - Layer controls: `showLayersDropdown` / `activeLayersTab` (`'pins' | 'polygons' |
    'paths'`, ~lines 755–757) — radar needs its own entry + panel.

## Proposed change

1. **Fetch the radar index** from `https://api.rainviewer.com/public/weather-maps.json`
   (no key). Response shape (verified live):
   ```json
   {
     "host": "https://tilecache.rainviewer.com",
     "radar": {
       "past":  [{ "time": 1785976800, "path": "/v2/radar/f33c85d2784d" }, ...],
       "nowcast": [{ "time": ..., "path": "..." }, ...]
     }
   }
   ```
   Cache the index for ~5 minutes (`localStorage` or in-memory). `past` covers the last
   2 hours (10-min frames); `nowcast` is the short-term forecast when available.
   **CORS note:** the `<img>` radar tiles don't need CORS, but the JSON index fetch does
   — verify `api.rainviewer.com` returns `Access-Control-Allow-Origin: *` from a browser
   during implementation (it does today; re-check at apply time).
2. **Tile URL format** (verified: returns `200 image/png`):
   ```
   {host}{path}/256/{z}/{x}/{y}/{colorScheme}/{smoothness}.png
   ```
   e.g. `https://tilecache.rainviewer.com/v2/radar/f33c85d2784d/256/8/77/84/2/1_1.png`
   - Color schemes: `2` light blue (default), `3` dark, `4` storm, `5` storm v2, `7`
     contrast — expose 2–3 in a small picker.
   - Reuse `latLngToTileCoords` for x/y/z; remember to wrap `x` into `[0, 2^z)` like the
     base tiles (`wrappedTx`).
3. **New `RadarOverlay.tsx` component** (keep `MapView.tsx` from bloating further):
   - Renders the radar tile grid at the same zoom/center as the base map (absolutely
     positioned `<img>`s, matching `MapTile`'s sizing + cross-fade).
   - **Animation:** pick a frame subset (e.g. last ~24 past frames) and advance the active
     frame every ~900ms via `setInterval`; loop back to the start; show the frame's
     timestamp (convert epoch → local time) in the panel. Pause/play + scrub.
   - **Opacity slider** (default ~60%) via CSS `opacity`; semi-transparent so the
     satellite imagery shows through.
   - Only request frames that overlap the current viewport bounds (skip tiles fully
     outside the map) to keep tile counts sane.
   - Cleanup: clear interval + abort in-flight fetches on unmount (tab switch unmounts
     MapView).
4. **Controls integration:**
   - Add a **Radar** toggle to the layers dropdown (or a floating radar button next to the
     layers button) — off by default.
   - Panel shows: play/pause, frame time label, opacity slider, color scheme picker,
     "live" vs "forecast" badge when nowcast frames are playing.

## Files affected

- `src/components/RadarOverlay.tsx` (new).
- `src/components/MapView.tsx` — render `<RadarOverlay>` above base tiles when enabled;
  pass `zoom/centerLat/centerLng/dimensions`; new state `showRadar` (+ persist in
  `localStorage` like the other layer toggles, e.g. `letshunt_show_radar`); add toggle to
  layers dropdown UI.
- No backend changes (RainViewer is called client-side).

## Open questions / decisions

- **Frame window:** default to past-2h only, or also play the nowcast (forecast) frames
  when available? (Recommend: past 2h default, nowcast as a badge toggle.)
- Default color scheme: `2` (light blue) matches most users' mental model of radar.

## Acceptance criteria

- [ ] `npm run lint` and `npm run build` pass.
- [ ] Radar toggle appears in the layers dropdown; enabling it shows animated
      precipitation over the satellite map within seconds.
- [ ] Radar tiles line up with base map features at zoom 8–16 (no drift — same tile math).
- [ ] Animation loops past frames; timestamp label updates; pause works.
- [ ] Opacity slider visibly fades the overlay; changing color scheme re-renders frames.
- [ ] Panning/zooming while radar is on re-requests tiles for the new viewport; the base
      map's `MAX_CACHED_TILES` eviction still applies (no unbounded memory growth).
- [ ] Switching to another tab and back doesn't leak intervals (console clean).

## Rollback

Remove `RadarOverlay.tsx`, remove the toggle state from `MapView.tsx`. Self-contained.
