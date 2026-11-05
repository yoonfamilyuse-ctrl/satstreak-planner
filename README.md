# Sat-Streak Planner

Observation-planning web app for a satellite-streak photography research project
(Sony a7 III + Tamron 28-75 mm at 28 mm, 15 s exposures at a 16 s interval, ~2 h per night).
Static site, no backend. Mobile-first, with a one-tap red-on-black **night mode**.

**Status: Stages 1–4 done** (night schedule, choosing a night, satellite predictions, field log).

## Run

Requires Node.js ≥ 20 (CI builds with Node 24).

```bash
npm install
npm run dev        # dev server; prints a LAN URL (--host) you can open on a phone on the same Wi-Fi
npm test           # unit tests (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

URLs: `#2026-11-11` opens that evening's plan; `#outlook` opens the 14-night outlook; `#sats/2026-11-11` opens satellite predictions for that night; `#log/2026-11-11` opens the field log.

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

- **Counts default to LEO only** (period < 128 min, eccentricity < 0.25). A checkbox includes the other regimes, and the CSV always contains every object with a `regime` column.
  - *Why 128 min:* by Kepler's third law, a = (μT²/4π²)^(1/3). With μ = 398 600.4418 km³ s⁻² and T = 128 min this gives a = 8 413 km, i.e. a circular-orbit altitude of **2 035 km** above the WGS-84 equatorial radius (6 378.137 km). This is the conventional upper boundary of low Earth orbit: the IADC Space Debris Mitigation Guidelines (IADC-02-01) define the "LEO protected region" as extending up to 2 000 km altitude. That definition is taken from UN COPUOS documents that summarise the guidelines; we did not access the primary IADC text. The 128-min / 11.25 rev/day threshold is also Space-Track.org's LEO definition, which is why it is used here.
  - *Why the other regimes are excluded:* on a fixed tripod, stars trail at 15″ s⁻¹ × cos δ, about 0.06° = **5 px** in 15 s on the a7 III at 28 mm (pixel scale 0.0122° px⁻¹ = 35.9 mm / 6000 px at f = 28 mm). Measured with the 2026-11-04 catalogue (objects above 20° altitude at 19:00 KST on 11 Nov, motion over 15 s):

    | Regime | n | Motion in one 15-s frame (median, 10–90 %) | Appearance |
    |---|---|---|---|
    | LEO | 146 | 5.8° = **471 px** (229–742 px) | long streak |
    | MEO (GPS etc.) | 25 | 0.12° = **10 px** (7–11 px) | short dash, about twice a star trail |
    | GEO | 220 | 0.0001° = **0 px** (0–0.4 px) | fixed point, while the stars trail past it |

    GEO objects stay fixed relative to the ground, so on a tripod they are points. MEO objects make dashes only a few pixels longer than the star trails around them. Neither produces the kind of streak this project detects. Many of them also stay in the frame for the entire window, so counting them as "crossings" would add a constant offset to both bands and mask the twilight-versus-dark difference.
- **Time step and short crossings:** objects are sampled every 10 s, so a crossing shorter than 10 s (e.g. clipping a frame corner) can fall between samples. Checked on 2026-11-11, S/60°, full catalogue (LEO), 10-s vs 2-s step: 759 vs 778 crossings. **19 (2.4 %) are missed at 10 s**: twilight band 470 vs 478 (1.7 %), dark band 54 vs 55 (1.8 %). All missed crossings spend only 1.3–9.1 s in the frame, mostly clipping the lower edge (max altitude ≈ 31°). Because this is below a few percent, the step stays at 10 s, which runs 5× faster on a phone. When matching detections to predictions, an unmatched short streak near a frame edge may be one of these.
- **Docked objects and trains:** objects with the **identical element set** (same epoch and mean elements) are merged into one crossing, because that is how docked modules and visiting vehicles appear in the catalogue (the ISS has about 10 entries with the station's elements). Objects that are only close together, such as a Starlink or Kuiper launch train in its first days, have distinct element sets and are **counted separately**, because each leaves its own streak. A crossing is flagged **train** when another crossing object comes within 2 km of it (3-D SGP4 separation, sampled every second while both are in the frame), so overlapping or side-by-side streaks can be handled in the analysis. The CSV has `train` (true/false), `train_neighbors_norad` and `train_min_sep_km`. The 2-km threshold is a project choice, not a published value.
- **Geometric counts are upper bounds**: every sunlit object in the frame counts, however faint. Each band therefore also shows a "brighter than the limiting magnitude" count (see *Predicted brightness*).
- **Pointing comparison:** the same computation for 8 azimuths × 45°/60°, at 10-s resolution. The project keeps **one fixed pointing for the whole night** so the two bands are comparable, so the table is for choosing that pointing. Besides the counts (all and brighter than the limit, per band), each row shows:
  - **Sun Δaz**: azimuth difference between the pointing and the Sun at the start of the twilight band (Sun at −12°; astronomy-engine). Small values look towards the residual twilight glow.
  - **Moon**: the smallest great-circle angle between the frame centre and the Moon while the Moon is above the horizon during the window (5-min samples; spherical law of cosines). "down" means the Moon is below the horizon for the whole window.

### Predicted brightness

```
m = m₁₀₀₀ + 5·log₁₀(d / 1000 km) − 2.5·log₁₀ F(φ)        F(90°) = 1
```
d = observer–satellite range; φ = solar phase angle (Sun–satellite–observer, Sun direction from Vallado's `sunPos`). For each crossing the app reports the **brightest** value over the 10-s samples inside the frame.

**Phase law F(φ)** (setting; default *fraction illuminated*):

| Law | F(φ) | Source |
|---|---|---|
| Fraction illuminated (default) | 1 + cos φ | Mallama (2020), *The Brightness of OneWeb Satellites*, arXiv:2012.05100, §2: standard-magnitude phase adjustment "2.5·log₁₀(0.5 + 0.5 cos B)", the fraction of a sphere that is lit. Same convention as Heavens-Above's "intrinsic brightness … 50 % illuminated". |
| Diffuse (Lambertian) sphere | (π − φ)·cos φ + sin φ | McCue, Williams & Morford (1971), *Optical characteristics of artificial satellites*, Planet. Space Sci. 19, 851–868, doi:10.1016/0032-0633(71)90137-1, as given in Romero-Colmenares et al. (2026), arXiv:2603.21859, Eq. 5 (p = 1) |

**Intrinsic magnitudes m₁₀₀₀** (`src/sat/magnitude.ts`).

> **Primary values: we use the Mallama & Cole compiled table**, A. Mallama & R. E. Cole, *Satellite Constellation Magnitudes*, https://satmags.netlify.app/ (table updated 2026-08-03). It is the authors' current compilation from MMT-9 and other observations, and it supersedes some values in their earlier papers. The **original paper value** is listed beside each row for comparison; where they differ, the table is used. The one exception is the ISS, which is not in the table.

| Objects (how identified) | **m₁₀₀₀ used** (Mallama & Cole table row) | Original paper value (same group) | Flag |
|---|---|---|---|
| ISS (NORAD 25544) | **−1.8**: Heavens-Above satellite page, "intrinsic brightness (at 1000 km distance, 50 % illuminated)" (not in the table) | — | ⚑ **STILL TO BE CONFIRMED** on heavens-above.com (satinfo.aspx?satid=25544). It was read from a search-engine copy because the site was unreachable. A team member will check it; update `INTRINSIC.iss` in `src/sat/magnitude.ts` and this row if it differs. |
| Starlink **V1.0 Original** (GCAT: V1.0 launches L1–L7) | **5.89** (SL-V1.0*, ref [6]) | 5.89: Mallama 2021, arXiv:2111.09735, §4 | |
| Starlink **VisorSat** (GCAT: V1.0 launches L8 onward) | **7.21** (SL-VisorSat*, ref [6]) | 7.21: Mallama 2021, arXiv:2111.09735, §4: "The mean 1000-km magnitude for VisorSats is 7.21 and that for Original satellites is 5.89" | The table's "Mags" counts for these two rows (V1.0 60,000; VisorSat 40,000) look swapped relative to the paper ("More than 60,000 VisorSat magnitudes and 40,000 Original magnitudes"). The magnitudes themselves agree. |
| Starlink **V1.5** (GCAT: Groups 2–5) | **6.34** (SL-V1.5*) | none | ⚑ **UNPUBLISHED**: the table marks this row "**" |
| Starlink **V2 Mini** (GCAT bus V2M) | **7.22** (SL-Mini-550*, ref [7]) | 7.87 ± 0.09: Mallama et al. 2023, arXiv:2306.06657 (abstract; brightness-mitigation mode only) | The 475-km shell row (7.35) is unpublished |
| Starlink **V2 Mini Optimized** (GCAT bus V2MO): **4,868 objects** in the 2026-11-04 catalogue, the largest group | **7.22**, **borrowed from the V2 Mini row** | none | ⚑ **No published value for Mini Optimized; the V2 Mini value is assumed.** This assumption affects more crossings than any other; treat Mini-Opt predictions as least certain. |
| Starlink **V2 Mini Direct-to-Cell** (GCAT bus V2MD) | **6.74** (SL-Mini-DTC, ref [1]) | 6.47: Mallama et al. 2025, arXiv:2502.03651 (abstract) | |
| OneWeb (ONEWEB-*) | **7.41** (OneWeb, ref [5]) | 7.05: Mallama 2022, arXiv:2203.05513 (2021 data); 7.18: Mallama 2020, arXiv:2012.05100 | Mallama 2026 (arXiv:2604.13145) reports OneWeb dimming over time |
| Amazon Leo (KUIPER-*) | **6.86** (Amazon Leo, ref [3]) | not found in the text we checked (the abstract of Mallama et al. 2026, arXiv:2601.07708, gives only the apparent mean, 6.28) | |
| Qianfan (QIANFAN-*) | **5.42** (Qianfan, ref [4]) | 5.24 ± 0.04: Mallama et al. 2025, arXiv:2505.07194 (abstract) | |
| Starlink V0.9, V3 | — | none found | shown as unknown |
| Starlink with **uncertain version** (13 Transporter rideshare satellites, "TSP1/TSP2") or **not in the GCAT release** (launched after the 2026-11-01 data update) | — | — | ⚑ shown as unknown, marked "version uncertain" / "version not-in-gcat" in the crossing list and CSV. A not-in-GCAT Starlink whose CelesTrak name ends "[DTC]" gets the DTC value (flagged). |
| **All other objects** | — | **no published generic value found** | shown as unknown ("—"). Optionally, you can type an *assumed* m₁₀₀₀ in the app; those predictions are then marked "a" and `m1000_assumed=true` in the CSV. |

*Starlink version* is looked up **per satellite (NORAD number)** in GCAT:
- **Source:** McDowell, J. C., 2020, *General Catalog of Artificial Space Objects*, **Release 1.8.8 (2026 Sep 3), data update 2026 Nov 1** (file headers "Updated 2026 Nov 2 0005"), https://planet4589.org/space/gcat, CC-BY-4.0.
- **Files and columns:** `satcat.tsv` and `satcat100k.tsv`. The second holds the catalog numbers ≥ 100000. The columns used are `Bus` and `PLName`.
- **Second generation:** GCAT gives the bus directly: `Starlink V2M` (Mini), `V2MO` (Mini Optimized), `V2MD` (Direct-to-Cell), `V3`.
- **First generation** (bus `Starlink`): the payload name gives the launch. V1.0 launches L1–L7 are Originals; L8 onward are VisorSats; Groups 2–5 are V1.5. This grouping comes from McDowell's Starlink Statistics page, https://planet4589.org/space/con/star/stats.html (accessed 2026-11-05): "Group 1 Early Launches 2-8 (V1.0 L1-7)", "Group 1 Visorsat Launches 9-17 (V1.0 L8-16)", "… 19+ (V1.0 L17+)", "Starlink Group 2/3/4/5 V1.5 Launches".
- **Reproducibility:** the rules and the generator are in `scripts/gen-starlink-versions.py`; the output is `src/sat/starlink-versions.ts`. To update, download the two GCAT files and rerun the script; the release is written into the file header.
- **Coverage, 2026-11-04 CelesTrak catalogue:** every Starlink is in GCAT. 4,868 Mini Optimized, 2,556 Mini, 2,553 V1.5, 637 DTC (agreeing exactly with CelesTrak's "[DTC]" names), 455 VisorSat, 111 Original, 27 V3 or uncertain.

**Check against an independent prediction:** Heavens-Above's "Brightness" for the 7 ISS passes above, compared with the app's brightest predicted magnitude in the visible part (`tests/satellites.test.ts`):

| Phase law | mean (app − HA) | rms |
|---|---|---|
| Fraction illuminated | +0.05 mag | **0.28 mag** |
| Diffuse sphere | −0.02 mag | 0.66 mag (1.0 mag too faint at φ ≈ 125°) |

Heavens-Above is itself a model, not a measurement, so this checks consistency, not truth.

**Limitations (read before using the counts in the paper).** The Mallama & Cole values are range-adjusted means over all the phase angles at which the satellites were observed; they are not phase-normalised standard magnitudes, so applying a phase law to them is an approximation. Starlink satellites also scatter light forward far more than any sphere (Mallama 2021), and their brightness changes with attitude and over months to years. Treat predicted magnitudes as roughly ±1 mag. All limits below are **placeholders** until you measure your real detection limit from your photos.

### Detection limit with trailing loss (two models, side by side)
A star's light stays on one PSF-sized spot for the whole 15-s exposure. A LEO satellite moving ~0.4° s⁻¹ spreads its light along a ~470-px streak. Both models below use the **same inputs**: for every in-frame 10-s sample, the predicted magnitude m and the apparent angular speed ω, computed from the topocentric direction at t and t + 1 s (haversine). From these,

```
x = L / FWHM,     L = ω · t_exp / pixel scale   [px],     pixel scale = atan(pixel pitch / f)
```

| Model (setting label) | Limit for the satellite | Source |
|---|---|---|
| **Peak** | m_lim,sat = m_lim,star − 2.5·log₁₀ x (no loss for x ≤ 1) | Hainaut & Williams (2020), A&A 636, A121, doi:10.1051/0004-6361/202037501, §5. For 1″ seeing "the length of the trail in arcsec will give the attenuation factor in magnitude", 2.5·log v. Effective magnitude = that of a star with the same **peak** brightness (Fig. 11 caption). Generalised here from 1″ to the PSF FWHM. |
| **Matched filter** | m_lim,sat = m_lim,star − 1.25·log₁₀(1 + 0.67·x² / (1 + 1.16·x)) | Jones, R. L. et al. (2018), *The Large Synoptic Survey Telescope as a Near-Earth Object discovery machine*, Icarus, doi:10.1016/j.icarus.2017.11.033 (arXiv:1711.10621), **Eqs. (4)–(5)**: Δm = −1.25·log₁₀(1 + a·x²/(1 + b·x)), x = v·T_exp/(24·θ) (v in deg/day, T_exp in s, θ = FWHM in arcsec, i.e. x = trail length/FWHM). "For trailing SNR losses, we find a = 0.67 and b = 1.16." |
| **Fixed** | predicted m ≤ fixed limit | the earlier simple criterion |

- **Detectable:** a crossing counts as detectable under a model if *any* in-frame sample satisfies m ≤ m_lim,sat. The app shows the band counts for **all three** models next to the geometric count. The crossing list shows both limits (P = Peak, M = Matched filter) with ✓/✗; one model's verdict is bold (setting). The pointing table has Peak and Matched columns.
- **CSV:** `limit_peak`, `detectable_peak`, `limit_matched`, `detectable_matched`, `limit_fixed`, `detectable_fixed`. `limit_*` is the limit at the most favourable sample.
- **What the two models mean.** *Peak* asks whether the trail's brightest pixel stands out like a star of the limiting magnitude, which is what you see by eye or with point-source software. *Matched filter* is Jones et al.'s **S/N loss**: the loss that remains even when detection uses a filter matched to the trail (e.g. a streak finder that adds up light along the line). For long trails it grows as ≈ 1.25·log₁₀ x, half the Peak slope. For a 500-px streak at FWHM 2 px the losses are 6.0 mag (Peak) and 2.7 mag (Matched filter). Your actual detections should lie between the two, depending on how you search the frames. Comparing them is part of the study.
- **Naming note.** Jones et al. also give a *cumulative* "detection loss" for ordinary point-source detection software (a = 0.42, b = 0). It grows as ≈ 2.5·log₁₀ x for long trails, i.e. like the Peak model, so it is **not** the 1.25·log₁₀ model. We use their SNR-loss constants for the matched-filter case.
- **Formula check:** at Jones et al.'s fiducial case (v = 1 deg/day, 30 s, 0.7″, so x = 1.79), our implementation gives 0.29 mag. The paper says "the SNR loss is ∼0.3 mag" (Fig. 6 caption); this is tested.
- Tyson et al. (2020, AJ 160, 226) discuss satellite-trail brightness for LSST, but the trailing-loss formula is in Jones et al. (2018), which we cite.
- **Inputs (settings, PLACEHOLDERS until measured):**
  - stellar limiting magnitude of one 15-s frame: **9.0**
  - PSF FWHM: **2 px**
  - pixels across the sensor: 6000, from Sony's a7 III specification of 6000 × 4000 effective pixels, giving 44.1″/px at 28 mm
  - fixed limit: **6.0**

### Measuring the stellar limiting magnitude from our own frames (to replace the 9.0 placeholder)
1. Choose a few frames from each band, e.g. at the start of the twilight band and in the middle of the dark band, from the actual run. The limit differs between bands because the sky background differs. That difference is exactly why it must be measured per band.
2. **Plate-solve** each frame to get its sky coordinates, e.g. with astrometry.net (Lang et al. 2010, AJ 139, 1782), using its online service or local `solve-field`. A 28-mm frame (65° × 46°) solves easily.
3. **Do photometry** on the stars with a small aperture: Siril, AstroImageJ, or Python with `photutils`. Use the raw green channel, or a debayered luminance, of the RAW file (not a JPEG).
4. **Cross-match** the detected stars with a catalogue that has V or G magnitudes, e.g. Gaia DR3 (G band) or the Tycho-2 / APASS V band, using the plate solution.
5. **Measure the limit:** plot S/N against catalogue magnitude, and take the magnitude where S/N = 5 (or where the detection fraction drops to 50 %) as m_lim,star for that frame. Also measure the median star FWHM in pixels, which replaces the 2-px placeholder.
6. Enter the measured m_lim,star and FWHM in the app (*Brightness and detection model*). Record which frames, catalogue and S/N threshold were used.

Then each crossing's detectability under both models follows from measured inputs. Comparing it with the streaks you actually found tests which model describes your detection method.

**CSV columns added:**
- `mag_pred`: brightest predicted magnitude in the frame, empty if unknown
- `m1000`, `m1000_assumed`, `mag_source` (table row key)
- `mag_geometric_part`: 5·log₁₀(d/1000) − 2.5·log₁₀F, so you can recompute with a different m₁₀₀₀ later
- `starlink_version` (GCAT)
- `angular_speed_deg_s`, `trail_px`
- `n_samples`
- `limit_peak`, `detectable_peak`, `limit_matched`, `detectable_matched`, `limit_fixed`, `detectable_fixed`

The header comment records every setting used.
- **Sky chart:** all-sky azimuthal-equidistant plot (zenith at centre, North up, East left). Shows the frame outline, the Moon at window midpoint, and the sunlit above-horizon tracks of objects that cross the frame, coloured by band (dark band also dashed, so it reads in red night mode).
- **CSV export** of the crossing list includes the element epoch of each object and the set id.
- The worker propagates the full catalogue (16,873 objects × 762 steps) in ~8 s on a laptop. Expect ~20–40 s on a phone.

### ISS in the frame
After computing crossings, a box above the counts says whether the ISS enters the chosen frame that night. If it does, it gives entry/exit times (bisection, 0.1 s), duration, approximate number of frames, maximum altitude, predicted magnitude and band. If it doesn't, it describes the ISS pass. The pointing table has an "ISS in frame" column (first–last 10-s sample) for every candidate pointing. Docked modules and vehicles share the ISS's element set and are merged into it (see *Docked objects and trains*).

Example, 2026-11-11 (pass 18:46:22 SW → 18:49:40 70° SE → enters Earth's shadow 18:50:05 at 60° E), elements of 2026-11-04:

| Pointing | ISS in frame (KST) |
|---|---|
| S 180°/60° (exact) | **18:48:18 → 18:49:53** (95 s ≈ 6 frames), max alt 70°, mag −4.0, twilight band |
| S 180°/45° | 18:48:00–18:49:20 |
| SW 225°/45° · SW 225°/60° | 18:47:50–18:49:10 · 18:48:30–18:49:30 |
| SE 135°/60° | 18:49:10–18:50:00 |
| E 90°/60° · NE 45°/60° · E 90°/45° | 18:49:40–18:50:00 · 18:49:50–18:50:00 · 18:50:00 only (shadow entry) |
| N, NE/45°, SE/45°, W, NW | not in frame |

Recompute with fresh elements on the day: the ISS reboosts, and older elements drift by seconds per day.

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

## What Stage 4 records (field log)

One log per night, **saved in IndexedDB as you type** (status shown at the top), with a list of past logs.

- **Night & site:** date, observers, and GPS position (requested automatically when a log is created, and via "Use GPS"; HTTPS is required, as on GitHub Pages). The accuracy is stored, and the planning site is the fallback.
- **Camera:** azimuth/altitude (pre-filled from the Satellites tab), focal length, ISO, aperture, exposure, interval, Number of Shots set, and frames actually taken.
- **Conditions:** clouds (Clear … Overcast), weather, Moon (pre-filled with the prediction; edit it to what you saw), notes (aircraft, lights, interruptions).
- **Actual start/end** (first/last frame) with seconds, each with the clock it was read from, shown next to the value: the **camera clock** (EXIF of the first/last frame, recommended), **true time** (read from time.is), or the **phone clock**. The "Now" button fills the phone's time and sets that field's source to phone clock. The CSV has `start_time_source` and `end_time_source` (values `camera`, `true`, `phone`); logs saved before this change keep their single source for both.
- **Camera clock check:** for the time.is photo before and after the run, enter the photo's EXIF time and the time shown on the screen.

### Timing model (`src/log/fieldlog.ts`, tested in `tests/fieldlog.test.ts`)
- Clock offset = EXIF time − time.is time (s; + = camera fast). With both checks, the offset at camera time t is **linearly interpolated** between them (constant outside), which absorbs slow drift. True time = camera time − offset.
- True start T₀ = logged start, corrected by the offset only if it was read from the camera clock (true-time and phone-clock values are used as they are; the same rule applies to the end). Frame *n* starts at T₀ + (n − 1)·Δ, with Δ the interval setting. A moment t lies in frame ⌊(t − T₀)/Δ⌋ + 1.
- **Band frames** = frames whose exposure *starts* inside the band, between the moments the Sun reaches −12°/−20° (twilight) or −25°/−35° (dark). These are recomputed from the **actual** start, not the plan. Example: starting 3 min late with a camera 7 s fast moves the twilight band from planned frames 19–173 to actual frames **9–162**.
- **Effective interval** = (true end − true start)/(frames − 1). A warning appears if it differs from the setting by more than 0.05 s, i.e. the intervalometer drifted or the frame count is wrong. A warning also appears if the clock drift exceeds 2 s.
- **Photo → band converter:** enter any photo's EXIF time, and the app applies the offset, then gives the true time, frame number, Sun altitude and band. This is the most accurate way to sort individual frames, because it doesn't depend on the interval being exact. You can also enter a frame number.

### Export
- **Bundle (.zip):** `fieldlog_<date>_<HHMM>.csv` (one row: every field plus the derived timing), `….json` (the log, derived timing and element-set metadata), `elements_<date>_<source>-<YYYYMMDD-HHMM>KST.tle.txt` (that night's locked element set as TLE, objects ≤ 99999), `…_omm.json` (the same set exactly as downloaded, including 6-digit objects), and `README.txt`.
- The ZIP is written by a small built-in writer (stored entries, CRC-32; PKWARE APPNOTE §4.3), checked with `unzip -t` in the tests.
- The log uses the element set **locked** to its night in the Satellites tab. If none is locked, the log offers to lock the most recent set.
- CSV and JSON can also be downloaded separately.

## Camera timestamps: what is known and how we test it

**What the sources say**
- **EXIF standard** (CIPA DC-008-2012, Exif 2.3, https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf): DateTimeOriginal is "the date and time when the original image data was generated. For a DSC the date and time the picture was taken are recorded", format "YYYY:MM:DD HH:MM:SS", i.e. whole seconds. **SubSecTimeOriginal** is an *optional* tag "used to record fractions of seconds for the DateTimeOriginal tag".
- **The standard does not say whether a long exposure is stamped at its start or its end.**
- **Sony a7 III (ILCE-7M3):** the Help Guide states only that the camera complies with "Exif Ver. 2.31". We found **no Sony documentation** on whether the a7 III writes SubSecTimeOriginal, or on which moment of a long exposure DateTimeOriginal records.
- A DPReview forum post (thread 4307268) claims that among recent Sony bodies only the a9 II writes sub-second times. It is unverified (we could not open the thread), and it is not a citable source.
- **Both points are therefore UNCONFIRMED, and we test them ourselves:**
  1. *Sub-seconds:* run `exiftool -a -G1 -time:all <frame>.ARW` on one of our frames. If `SubSecTimeOriginal` appears, the camera records fractions of a second.
  2. *Start or end:* take three photos in quick succession: A at 1/100 s, B at 15 s, C at 1/100 s. Turn **Long Exposure NR off**, because it adds a processing delay. If B's DateTimeOriginal is ≈ A's time plus 1–2 s, the camera stamps the **start**. If it is ≈ C's time minus 1–2 s, it stamps the **end**. Repeat a few times, because of the 1-s resolution.
  3. *Confirmation on the sky:* the ISS check below.

**Clock-offset readings.** Photograph time.is at a **fast shutter speed (e.g. 1/100 s)**, and take **5–10 shots before and 5–10 after** the run. With whole-second EXIF and a whole-second display, one reading is good to only about ±1 s. Readings taken at different fractions of a second average to a better estimate. The Log tab accepts any number of readings per side and uses their mean, showing n and the min–max spread.

## Timing check with the ISS (2026-11-11 pass)
The ISS crosses an S/60° frame from 18:48:18 to 18:49:53 KST (about 6–7 frames). It moves ≈ 1° s⁻¹ there, so **1 s of timing error moves a streak endpoint by ≈ 1° (~80 px)**. That makes it a sensitive check of the timestamp convention and of any remaining clock offset.

1. In the **Log** tab, enter the actual start, the frame count and the time.is readings, lock that night's element set (preferably downloaded the same day: older ISS elements drift by seconds per day because of reboosts), then press **"Predict ISS positions per frame"**. For every frame containing the ISS, the table gives the predicted ISS azimuth/altitude at exposure start and end under **A (EXIF = start)** and **B (EXIF = end)**. Download the CSV.
2. **Plate-solve** each of those frames (astrometry.net). Measure the pixel coordinates of **both ends of the ISS streak**. Skip ends cut off by the frame edge, and the frame where the ISS enters Earth's shadow (18:50:05), since that end is the shadow, not the exposure.
3. Convert each endpoint to azimuth/altitude at the frame time (via RA/Dec from the plate solution), and compute the angular distance to the predicted start/end points under A and under B.
4. **Interpret.** Compare by **frame number**: for the same frame number, A and B differ by 15 s, i.e. 6–15° along the track.
   - Endpoints that match one convention within about 1° settle the convention.
   - A **constant along-track shift** of all endpoints, identical in every frame, is a residual clock offset: offset = shift ÷ angular speed. Feed it back into the clock offset if it exceeds the time.is uncertainty.
   - The **gap** between the end of the streak in frame n and the start in frame n+1 should be 1 s of motion (16-s interval − 15-s exposure). A different gap means the interval or exposure is not as logged.
   - A shift that grows from frame to frame means an interval error.
5. Record the result (convention, residual offset ± uncertainty) in the log notes and in the paper's methods section.

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
- **Heavens-Above** (https://www.heavens-above.com/, Chris Peat): used to validate ISS pass predictions (values copied into the test file) and as the source of the ISS intrinsic magnitude (still to be confirmed).
- **GCAT** (J. McDowell, https://planet4589.org/space/gcat, Release 1.8.8, data update 2026 Nov 1, CC-BY-4.0): Starlink version per satellite.

## Notes

- The Night tab's timeline frame numbers assume shooting starts exactly on schedule. For sorting real photos, use the **Log** tab, which recomputes them from the actual start time and the measured camera clock offset.

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
src/sat/magnitude.ts   brightness model and cited intrinsic magnitudes
src/sat/starlink-versions.ts  Starlink version per satellite (GENERATED from GCAT 1.8.8; see scripts/)
src/sat/detection.ts   detection limits: Peak (Hainaut & Williams 2020) and Matched filter (Jones et al. 2018)
scripts/gen-starlink-versions.py  generator for the GCAT-based version table
src/log/fieldlog.ts    field-log model, clock offset, frame/band timing, CSV
src/log/zip.ts         minimal ZIP writer for the export bundle
src/ui/log-view.ts     Log tab
src/main.ts            app shell, routing, site editing, night mode
tests/                 unit tests, independent NOAA solar check, ISS vs Heavens-Above
tests/fixtures/        17-object subset of the real 2026-11-04 CelesTrak download (incl. 6-digit objects)
.github/workflows/     GitHub Pages deployment
```
