# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary operator:** the project owner, a student running a satellite-streak photography research project. Plans nights at home and runs the camera on site.
- **Field teammate (Rocky):** reads the same screens on site and helps with timing and the log. Rocky's English is limited, so labels must be short and plain (they will be translated by the planned Korean/English toggle).
- Both use iPhones with Safari (iPhone 14 and iPhone 16, Dynamic Island / notch).

## Product Purpose
Plan and run evening shooting sessions that photograph satellite streaks in two solar bands (twilight: Sun −12° to −20°; dark: Sun −25° to −35°), so that streak counts in the two bands can be compared. Success: on a given night the team starts on time, knows which frames belong to which band, and leaves with a complete, citable field log and element set.

## Positioning
A single-purpose research instrument, not a general astronomy app: every number (band edges, frame numbers, crossings, brightness) follows one documented, cited method, and the same rule (mid-exposure frame → band) is used in planning, the field log and every export.

## Operating Context
- **At home (day mode):** choose a night in the 14-night outlook (Moon, cloud forecast), download orbital elements (CelesTrak, max once per 2 h), compute satellite crossings, review the plan.
- **On site (night mode, red on black):** dark rural site, eyes dark-adapted, cold hands, phone on or near the tripod.
  - **Night plan** is the main field screen: the timeline and the current band, glanced at often.
  - **Log** is data entry on site: start/end times, time sources, conditions, notes.
  - **Satellites** is used occasionally on site to check the ISS pass.
  - **Outlook** is used only at home.
- Times are shown in KST. Camera: Sony a7 III, 28 mm, 15 s exposures at a 16 s interval, about 2 h per night.

## Capabilities and Constraints
- Static site (Vite + TypeScript, no framework, no backend), deployed to GitHub Pages; heavy satellite work runs in a Web Worker.
- Data stays on the device (localStorage, IndexedDB); exports are CSV/JSON/text for research use.
- Calculations, data formats and exports are fixed; UI work must not change them, and all tests must keep passing.
- Night mode must emit no white or blue light anywhere, including the iOS status bar, tap highlights, focus rings, native pickers and scrollbars.
- iOS Safari specifics: safe areas around the notch/Dynamic Island, no input zoom (inputs ≥ 16 px), no tap flash.
- A Korean/English toggle will follow the redesign; CSV/JSON column names stay English.

## Brand Commitments
- Name: Sat-Streak Planner.
- One-tap red-on-black night mode is a defining feature.
- Every astronomical value carries a citation; on-screen method notes stay.

## Evidence on Hand
- Real computed plans for any date at the default site (Hoengseong, Gangwon-do, 37.48°N 128.16°E, 300 m); e.g. 11 Nov 2026: twilight frames 20–172, dark frames 268–456.
- A real CelesTrak catalogue download (2026-11-05, 16,873 objects) and its 11 Nov crossings.
- No photos, logos or illustrations exist; none should be invented as product evidence.

## Product Principles
1. Field first: what the team needs in the dark, at a glance, comes before what is nice at home.
2. One method, shown honestly: numbers, units, edges and missing values are explicit; nothing is rounded into a false claim.
3. Short, plain words that translate well; no jargon where a plain word exists, and no clever copy.
4. Protect dark adaptation absolutely in night mode.

## Accessibility & Inclusion
- Two languages (Korean, English) for the field team.
- Large touch targets and large numerals for cold hands and quick glances at night.
