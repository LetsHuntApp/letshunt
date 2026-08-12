# LetsHunt

Real-time deer hunting weather forecasting, mapping, and trail-cam intelligence
that's always in your pocket — even offline.

LetsHunt is a Progressive Web App that turns meteorological data into a
**0–100 deer-movement score** for the next seven days at the hunter's chosen
location. The score is built from an eight-factor engine (temperature,
temperature trend, wind speed, barometric pressure, precipitation, time of
day, rut phase, and solunar) plus a humidity/scent factor and a wind-gust
penalty, all driven by [Open-Meteo](https://open-meteo.com/) forecasts with no
API key required.

## Highlights

- **Daily + hourly hunt score** with a full breakdown of every contributing
  factor and the math behind each contribution.
- **Hand-built slippy map** (no Mapbox/Leaflet dependency) with satellite,
  topo, and OpenStreetMap tile sources, fall-back chains, and pin/polygon/
  polyline overlays for stands, bedding sanctuaries, food plots, travel
  routes, deer trails, property boundaries, and more.
- **Scent-cone overlay** that visualises a stand's wind exposure and
  downwind corridor.
- **Dijkstra "best path to stand"** routing across your drawn travel
  routes, factoring in downwind exposure and avoiding bedding zones.
- **Trail-cam import** with on-device OCR (Tesseract.js) that reads
  timestamps off the bottom of every photo and backfills per-photo
  historical weather from the Open-Meteo archive API. Includes filters,
  analytics, target tagging, and data-backed insights.
- **Harvest log** with buck/doe breakdown by month and by stand plus
  per-stand stats.
- **PWA** installable to a phone home screen; theme variants × light/dark
  with custom background upload; JSON backup/restore of all local data.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 6, TailwindCSS, motion, recharts,
  lucide-react, tesseract.js (OCR), IndexedDB (trail cam storage),
  a hand-written Mercator slippy map.
- **Forecast data:** [Open-Meteo API](https://open-meteo.com/) (no key).
  Rolling 30-day climatological normals are pulled from the
  [Open-Meteo Archive API](https://archive-api.open-meteo.com/) and cached
  per location.
- **Astronomy:** [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  (added in Batch 2) for real lunar transit/moonrise/moonset-based
  solunar periods.

## Run locally

**Prerequisites:** Node.js (or Bun).

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The app fetches
weather for a default Madison, WI location you'll see in the header — click
the GPS button or type a city name to switch.

Other useful scripts:

```bash
npm run lint      # tsc --noEmit
npm run build     # production build into dist/
npm run start     # preview the production build
```

## Documentation

- `forecast-batches/` — engine-side improvement specs. **Batches 1 and 2
  are applied and live on `main`** (season-relative temperature scoring,
  humidity/scent factor, wind-gust penalty, real astronomy-based solunar).
  Batches 3–6 are still planning documents waiting to be applied.
- `changes.md` — running changelog of what's actually shipped.

## Contributing

The hunt-score engine is intentionally heuristic. If you tune weights
(especially the `tempDeltaF` deviation bands or the Scent & Humidity
factor), please open an issue or PR with rationale and any supporting
data — there's a real opportunity here to evolve a hand-tuned model into
a data-driven one using your own trail-cam harvest log.

## License

SPDX-License-Identifier: Apache-2.0 (matches the source headers in the
project).
