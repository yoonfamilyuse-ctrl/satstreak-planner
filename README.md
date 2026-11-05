# Sat-Streak Planner

Observation-planning web app for a satellite-streak photography research project
(Sony a7 III + Tamron 28-75 mm at 28 mm, 15 s exposures at a 16 s interval, ~2 h per night).
Static site, no backend. Mobile-first, with a one-tap red-on-black **night mode**.

**Status: Stages 1–3 done** (night schedule, choosing a night, satellite predictions). Stage 4 (field log) is not built yet.

## Run

Requires Node.js ≥ 20.

```bash
npm install
npm run dev        # dev server; prints a LAN URL (--host) you can open on a phone on the same Wi-Fi
npm test           # unit tests (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

URLs: `#2026-11-11` opens that evening's plan; `#outlook` opens the 14-night outlook; `#sats/2026-11-11` opens satellite predictions for that night.

### Deploy to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`. `vite.config.ts` uses `base: './'`, so the site works under `https://<user>.github.io/<repo>/`.

1. Create an empty repository on github.com (no README/licence, so the first push is clean).
2. Push:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then re-run the workflow from the **Actions** tab (or push again).
4. The site appears at `https://<user>.github.io/<repo>/`. HTTPS is required for "Use GPS" (browsers block geolocation on plain HTTP, except on localhost).

## What Stage 1 computes

For the evening of the chosen date (KST, Asia/Seoul) at the chosen site:

| Item | Definition |
|---|---|
| Sunset | Sun's upper limb at the horizon, standard refraction (astronomy-engine `SearchRiseSet`) |
| −6°, −12°, −18°, −20°, −25°, −35° | Time the **centre** of the Sun descends through that geometric (no-refraction) topocentric altitude (`SearchAltitude`). Standard twilight definition. |
| Twilight band | Sun −12° → −20° |
| Dark band | Sun −25° → −35° |
| Shooting window | t(−12°) − 5 min → t(−35°) + 5 min |
| Number of Shots | ⌈window duration ÷ 16 s⌉ |
| Field timeline | Arrive and set up −25 min, focus −5 min, time.is photo −2 min, start, end, time.is photo +1 min. Band boundaries are listed with the expected frame number. |
| Moon | Illuminated % and phase name at mid-window. Next rise/set after 12:00 KST. Apparent topocentric alt/az every 10 min across the window. Minutes above the horizon (1-min sampling). |

The default site is Hoengseong, Gangwon-do (37.48°N, 128.16°E, 300 m). It can be edited under "Site" (saved in the browser's localStorage), and "Reset to default" restores it.

At 37.5°N the Sun does not reach −35° from roughly May to early August. On those nights the app shows a warning and no window.

## What Stage 2 computes (14 nights)

For today and the next 13 evenings: shooting window, number of shots, Moon illumination and minutes above the horizon during the window, and mean cloud cover over the window.

- **Cloud cover**: Open-Meteo hourly `cloud_cover`, `cloud_cover_low`, `cloud_cover_mid`, `cloud_cover_high` (%). The hourly values are linearly interpolated, sampled every 10 min across the window (both ends included) and averaged. If any sample falls outside the forecast range (16 days) or on missing data, the night shows "no forecast". A forecast is cached on the device for 1 h; "Refresh" forces a new download.
- **Moon index** = illuminated % × (minutes the Moon's centre is above the horizon ÷ window minutes). 0 = no Moon, 100 = full Moon all window. ≤ 5 → no Moon, ≤ 20 → low, otherwise bright.
- **Rating**: *Good* = no/low Moon and mean total cloud ≤ 30%. *Fair* = no/low Moon with 30–60% cloud or no forecast, or ≤ 30% cloud with a bright Moon. *Poor* = everything else. Good nights are highlighted. Thresholds are in `src/outlook.ts` (`CRITERIA`).

## What Stage 3 computes (satellites)

### Orbital elements
- Source: CelesTrak GP API, `GROUP=active`, **`FORMAT=json` (CCSDS OMM)**. The U.S. Space Force ran out of 5-digit catalog numbers on 2026-07-11, and new objects get 6-digit numbers (≥ 100000). The classic TLE format holds only 5 digits, and CelesTrak does not publish TLEs for these objects. OMM has no such limit. The 2026-11-04 download had 16,873 objects, 981 of them numbered ≥ 100000.
- SGP4 initialisation: satellite.js `json2satrec` (OMM). Fallback for pasted or uploaded TLE text: `twoline2satrec`. Records that are malformed or fail SGP4 initialisation are counted and listed on screen ("N loaded · M failed to parse").
- **Research record:** every download or import is stored in IndexedDB with its exact original text, its download/import time, and the epoch range of its elements. Each night can be **locked** to one set. Predictions for that night then always use it, and any re-lock is recorded. Computing predictions for tonight locks tonight's set automatically.
- **Export** (Satellites → Saved sets): `elements_<night>_<source>-<YYYYMMDD-HHMM>KST_omm.json` is the exact data as downloaded. `….tle.txt` is 3-line TLEs generated from the OMM for objects ≤ 99999; 6-digit objects are omitted, because the TLE format cannot hold them, and they remain in the JSON. The generated TLEs agree with the OMM to < 20 m after 7 days of propagation (tested).
- **CelesTrak policy:** at most one download per 2 h, enforced in the app. CelesTrak refuses repeat downloads of the Active group within an update cycle (HTTP 403) and blocks IPs after 50 errors in 2 h. The app therefore never retries automatically: after an error it waits 2 h and offers "Load file…". Devices sharing one network (e.g. school Wi-Fi) share the limit.

### Predictions
| Step | Method |
|---|---|
| Propagation | SGP4 (satellite.js 7.1.0; Vallado, Crawford, Hujsak & Kelso 2006, AIAA 2006-6753), every object, 10-s steps over the shooting window |
| Frame conversion | TEME → Earth-fixed with GMST (IAU-82, Vallado 2013), polar motion ignored. Topocentric az/alt for a WGS-84 observer (`ecfToLookAngles`), geometric |
| Sunlit | Cylindrical Earth-shadow model (Vallado 2013 Alg. 34; Montenbruck & Gill 2000 §3.4.2) with the Sun direction from Vallado 2013 Alg. 29 (`sunPos`, 0.01°) |
| In frame | Gnomonic projection about the camera's pointing direction (Snyder 1987, USGS PP 1395), horizon level, limits ±tan(θ/2). FOV θ = 2·atan(d/2f) → 65.3° × 46.4° at 28 mm |
| Entry/exit | First/last 10-s sample in frame, refined by bisection to 0.1 s |
| Band | Sun's altitude at the crossing midpoint (astronomy-engine): twilight −12…−20°, dark −25…−35°, gap −20…−25°, margin = the 5-min edges |
| Orbit regime | Space-Track definitions: LEO n > 11.25 rev/d & e < 0.25; GEO 0.99–1.01 rev/d & e < 0.01; MEO 1.8–2.4 rev/d; HEO e ≥ 0.25 |

- **Counts default to LEO only.** Geostationary and GPS-type objects barely move in a 15 s exposure, and many sit in the frame for the whole window. They are not streak-producing crossings, and counting them would distort the twilight-vs-dark comparison. A checkbox includes them, and the CSV always contains everything with a `regime` column.
- **The counts are geometric upper bounds.** They have no brightness limit: every sunlit object in the frame counts, however faint. Expect the camera to detect only a fraction (bright LEO objects). For 2026-11-11 at 180°/60°: 482 twilight-band vs 54 dark-band LEO crossings.
- **Pointing comparison:** the same computation for 8 azimuths × 45°/60°, at 10-s resolution.
- **Sky chart:** all-sky azimuthal-equidistant plot (zenith at centre, North up, East left). Shows the frame outline, the Moon at window midpoint, and the sunlit above-horizon tracks of objects that cross the frame, coloured by band (dark band also dashed, so it reads in red night mode).
- **CSV export** of the crossing list includes the element epoch of each object and the set id.
- The worker propagates the full catalogue (16,873 objects × 762 steps) in ~8 s on a laptop. Expect ~20–40 s on a phone.

### ISS passes
Next 14 days, passes found at 10-s steps then refined: rise/set by bisection (0.1 s), culmination by golden-section search. The **visible** part uses the same definition as Heavens-Above's tables: altitude ≥ 10°, sunlit (cylindrical shadow), Sun ≤ −6°. The default list shows evening passes whose highest visible altitude is ≥ 30°.

### Validation against Heavens-Above
Default site, Heavens-Above "ISS – Visible Passes" fetched 2026-11-04 23:38 UTC (elements of 4 Nov), compared with the app using the CelesTrak elements of the same day (`tests/satellites.test.ts`). Differences are app − Heavens-Above:

| Pass (KST) | Start | Highest | End | Highest alt (app / HA) | Directions |
|---|---|---|---|---|---|
| 9 Nov 18:45 | +0.8 s | −0.2 s | −0.2 s | 18.7° / 19° | S → SSE → SSE ✓ |
| 10 Nov 17:59 | +0.5 s | +0.8 s | +0.2 s | 11.4° / 11° | SSE → SE → ESE ✓ |
| 10 Nov 19:34 | +0.4 s | +0.5 s | +0.5 s | 22.4° / 22° | WSW ✓ |
| 11 Nov 18:46 | +0.6 s | +0.8 s | +0.4 s | 69.9° / 70° | SW → SE → E ✓ |
| 12 Nov 17:58 | +0.2 s | +1.2 s | −0.1 s | 36.2° / 36° | SSW → SE → ENE ✓ |
| 12 Nov 19:36 | +0.1 s | 0.0 s | 0.0 s | 19.0° / 19° | W → WNW ✓ |
| 13 Nov 18:47 | +0.7 s | 0.0 s | +0.3 s | 36.7° / 37° | WSW → NW → N ✓ |

All 7 passes agree within 1.2 s (requirement: 1 min), altitudes within 0.4°, all directions identical, and the app predicts no extra visible passes. End times that are shadow entries (9, 11, 13 Nov) also agree to < 0.5 s, which supports the cylindrical shadow model. Heavens-Above shows times to the second, so these differences are at its display resolution. The test fails if any difference exceeds 60 s or 2°.

## Accuracy check

`tests/schedule.test.ts` checks 2026-11-11 at the default site against these values (pass = within 30 s):

| Event | KST |
|---|---|
| Sunset | 17:19:59 |
| −12° | 18:19:00 |
| −20° | 18:59:57 |
| −25° | 19:25:15 |
| −35° | 20:15:40 |

These are regression values from this app, confirmed with the NOAA solar formulas (e.g. Sun altitude at 18:19:00 KST = −12.005°). An earlier reference set computed with PyEphem was about 80 s late at every event and was discarded.

The test also recomputes the solar elevation at each found time with an **independent** implementation of the NOAA Solar Calculator formulas (Meeus 1991; `tests/noaa.ts`). It requires agreement within 0.1° (≈ 30 s of time).

To check by hand:
- **KASI** (https://astro.kasi.re.kr → 생활천문관 → 일출몰시각계산, enter the coordinates) gives sunset and civil/nautical/astronomical twilight, i.e. −6°/−12°/−18°. Compare with those rows in the Sun table.
- **timeanddate.com** (Sun calculator for a custom location) gives the same three twilight times.
- −20°, −25° and −35° are not published by either site. Check them with JPL Horizons (https://ssd.jpl.nasa.gov/horizons/): Sun, observer at the site coordinates, airless apparent elevation at 1-min steps.

## Libraries and versions

| Library | Version | Use |
|---|---|---|
| [astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross, MIT) | 2.1.19 | Sun and Moon positions, rise/set, altitude crossings, Moon illumination and phase |
| [Vite](https://vite.dev) | 7.3.7 | Build/dev server |
| [TypeScript](https://www.typescriptlang.org) | 5.9.3 | Language |
| [Vitest](https://vitest.dev) | 4.1.12 | Unit tests |

| [satellite.js](https://github.com/shashwatak/satellite-js) (MIT) | 7.1.0 | SGP4 propagation, OMM/TLE parsing, frame conversions, Sun vector |
| @types/node | 24 | Test typing only |

### Models inside astronomy-engine (for the methods section)
- Sun/Earth: VSOP87 (Bretagnon & Francou 1988).
- Moon: *Improved Lunar Ephemeris* (1954, after E. W. Brown), as adapted in Montenbruck & Pfleger, *Astronomy on the Personal Computer*.
- Nutation IAU 2000B; ΔT from Espenak & Meeus polynomials.
- Refraction: Saemundsson's formula (Meeus, *Astronomical Algorithms*, 1991, pp. 101–102).
- The library authors report agreement with NOVAS and JPL Horizons to about ±1 arcminute.

Suggested citation: D. Cross, *Astronomy Engine* v2.1.19, https://github.com/cosinekitty/astronomy.

## Data sources

- Sun and Moon: computed in the browser, no network.
- **Open-Meteo** Forecast API (https://open-meteo.com/, `https://api.open-meteo.com/v1/forecast`), free, no key. Hourly total/low/mid/high cloud cover, 16 forecast days, default "best match" model selection.
  - **Licence:** Open-Meteo data are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is required, so every place the app shows cloud data carries a "Weather data by Open-Meteo.com" link to https://open-meteo.com/. Any figure or table in the paper that uses these cloud values should carry the same credit.
  - Cite as: Zippenfenig, P. (2023). *Open-Meteo.com Weather API* [Computer software]. Zenodo. https://doi.org/10.5281/ZENODO.7970649
- **CelesTrak** GP API (https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json), operated by T. S. Kelso. Orbital elements as OMM JSON, derived from U.S. Space Force (18/19 SDS) data published on Space-Track.org. Format documentation and usage policy: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- **Heavens-Above** (https://www.heavens-above.com/, Chris Peat): used only once, for validating ISS pass predictions (values copied into the test file).

## Notes for later stages

- **Stage 4 (field log):** the timeline's frame numbers currently assume shooting starts exactly at the scheduled time. Stage 4 will recompute the band-boundary frame numbers from the *actual* start time entered in the log (corrected by the measured camera clock offset), so photos are sorted into the twilight and dark bands correctly.

## Night mode

The "Night mode" button switches to pure red on black and is remembered on the device. Use the ‹ › buttons to change the date at night: the phone's native date-picker popup is drawn by the OS and may be bright. Turn down screen brightness as well.

## Project layout

```
src/config.ts          default site, bands, camera settings, timeline offsets
src/time.ts            KST formatting/helpers
src/site.ts            site persistence (localStorage)
src/astro/observer.ts  astronomy-engine Observer + model citations
src/astro/sun.ts       sunset and solar altitude crossings
src/astro/moon.ts      Moon phase, rise/set, alt/az samples
src/astro/schedule.ts  shooting window, shots, bands, field timeline
src/weather/openmeteo.ts  Open-Meteo fetch, cache, window-average cloud cover
src/outlook.ts         14-night outlook and rating criteria
src/ui/                night view, outlook view, shared helpers
src/sat/elements.ts    OMM/TLE parsing, orbit regime, OMM→TLE export
src/sat/fov.ts         camera FOV, gnomonic projection, pointing grid
src/sat/predict.ts     propagation, shadow, crossings, ISS passes
src/sat/worker.ts      Web Worker running the heavy computations
src/sat/store.ts       IndexedDB: element sets and per-night locks
src/sat/celestrak.ts   CelesTrak download with the 2-hour policy
src/ui/sat-view.ts     Satellites tab;  src/ui/skychart.ts  all-sky chart
src/main.ts            app shell, routing, site editing, night mode
tests/                 unit tests, independent NOAA solar check, ISS vs Heavens-Above
tests/fixtures/        17-object subset of the real 2026-11-04 CelesTrak download (incl. 6-digit objects)
.github/workflows/     GitHub Pages deployment
```
