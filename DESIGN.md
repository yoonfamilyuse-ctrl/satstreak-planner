---
name: Sat-Streak Planner
description: Field planner for satellite-streak photography, drawn as a 35 mm contact sheet; red on black at night.
colors:
  proof-paper: "#e9e7e2"
  raised-paper: "#f2f0eb"
  film-black: "#141414"
  print-grey: "#5f5b54"
  paper-rule: "#cfccc5"
  paper-rule-strong: "#a9a59c"
  frame-unshot: "#2b2b2b"
  frame-shot: "#4a4945"
  edge-print-amber: "#e8a33a"
  grease-pencil: "#d93a2b"
  grease-pencil-text: "#b3261a"
  night-black: "#000000"
  night-ink: "#e81010"
  night-muted: "#b00000"
  night-rule: "#3a0000"
  night-rule-strong: "#5a0000"
  night-film: "#160000"
  night-frame-shot: "#2e0000"
  night-edge-print: "#a80000"
  night-mark: "#ff1010"
  night-bar-track: "#1a0000"
  night-bar-shot: "#5a0000"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "72px"
    fontWeight: 750
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  edge-print:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.04em"
    fontFeature: "tnum"
rounded:
  frame: "2px"
  control: "10px"
  card: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.film-black}"
    textColor: "{colors.proof-paper}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 14px"
  button-pill:
    backgroundColor: "{colors.proof-paper}"
    textColor: "{colors.film-black}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  button-pill-night:
    backgroundColor: "{colors.night-black}"
    textColor: "{colors.night-mark}"
    rounded: "{rounded.pill}"
    height: "44px"
  input:
    backgroundColor: "{colors.raised-paper}"
    textColor: "{colors.film-black}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 10px"
  tab:
    textColor: "{colors.print-grey}"
    height: "44px"
  film-frame:
    backgroundColor: "{colors.frame-unshot}"
    textColor: "{colors.edge-print-amber}"
    rounded: "{rounded.frame}"
    width: "66px"
    height: "100px"
---

# Design System: Sat-Streak Planner

## Overview

**Creative North Star: "The Contact Sheet"**

The night is one roll of film. Every 16 s frame is numbered along the film's edge, and the two solar bands are grease-pencil marks on that roll, as a photographer marks a proof sheet. The app is a working field tool, so the world contributes only type, palette, density and one signature move: the film strip of the night's frames with a one-line whole-night bar above it. Navigation, controls and tables stay standard.

Day mode is for planning at home and carries the material character: proof-paper grey, black film, amber edge print, grease-pencil red. Night mode is for the site, with eyes dark-adapted: exactly the same layout and tokens, re-valued as reds on pure black. Nothing in night mode emits white, grey, green or blue light.

Density is high but calm: 1 px rules separate everything, there are no shadows, and hierarchy comes from scale (a 72 px frame number against 13 px labels), not from colour or boxes.

**Key Characteristics:**
- Film strip and whole-night bar as the signature, on the Night tab.
- Flat paper surfaces divided by 1 px rules; no shadows.
- One system sans with tabular numerals for every time and frame.
- Red is the only accent, and it always means "band" or "now / next".
- Every tap target is at least 44 × 44 px.

## Colors

A restrained paper-and-film palette with one grease-pencil red; night mode is a pure red-on-black re-valuation of the same roles.

### Primary
- **Grease Pencil** (#d93a2b): band marks on the strip and bar, the current frame outline, the now line, focus rings. Graphics only.
- **Grease Pencil Text** (#b3261a): red used as text (band name, next-step time, highlighted Sun rows); 5.3:1 on proof paper.

### Secondary
- **Edge-Print Amber** (#e8a33a): frame numbers and band codes printed on the film, the selected-frame outline and marker. Only on film black.

### Neutral
- **Proof Paper** (#e9e7e2): page ground, top bar, iOS status-bar colour (`theme-color`).
- **Raised Paper** (#f2f0eb): input fields.
- **Film Black** (#141414): body text, film strips, primary buttons, the shot part of the night bar.
- **Print Grey** (#5f5b54): secondary text, labels, past timeline rows (5.5:1 on paper).
- **Paper Rule** (#cfccc5) and **Strong Rule** (#a9a59c): dividers; control outlines.
- **Unshot / Shot Frame** (#2b2b2b / #4a4945): frame windows on the strip.

### Night
- **Night Black** (#000000): ground, status bar, strip holes.
- **Night Ink** (#e81010): text (≈4.5:1 on black). **Night Muted** (#b00000): secondary text (≈3:1, deliberately dim; used at ≥13 px only).
- **Night Mark** (#ff1010): band marks, now line, current frame, red text that must stand out.
- **Night Rules** (#3a0000 / #5a0000), **Night Film** (#160000), **Shot Frame** (#2e0000), **Edge Print** (#a80000), **Bar Track / Shot** (#1a0000 / #5a0000).

### Named Rules
**The Red Means Band Rule.** Red appears only for the bands, the current frame and the next step (and errors). It is never decoration.

**The No White Light Rule.** In night mode every pixel is a red on black: status bar, tap feedback, focus rings, selection, scrollbars, date-picker icons. If a native part cannot be coloured, it is hidden.

## Typography

**Body and display:** the system sans (SF Pro on iPhone, Apple SD Gothic Neo for Korean), one family throughout.

**Character:** a working instrument's type: plain, legible, tabular. Scale carries the hierarchy so the frame number reads at arm's length in the dark.

### Hierarchy
- **Display** (750, 72px, 0.95, −0.04em, tabular): the frame being exposed now, or the start time.
- **Headline** (700, 22px, 1.15): the current band; summary figures (22px).
- **Title** (700, 17px, 1.25): section headings, the next step, the app name.
- **Body** (400, 15px, 1.45): timeline rows and tables.
- **Label** (400, 13px): secondary lines, notes, strip info.
- **Edge print** (700, 11px, +0.04em, tabular): frame numbers on the film; band codes at 10px.

### Named Rules
**The Tabular Rule.** Every time, frame number and measurement uses tabular numerals (`.tnum`), so columns and live counters never jitter.

**The No Eyebrow Rule.** No uppercase tracked kicker above a heading on the Night tab; labels sit beside or below the value they describe.

## Layout

Single column, max 680 px, 16 px gutters plus iOS safe areas. The Night tab's signature strip and whole-night bar run full-bleed to the screen edges. Order on the Night tab: top bar, tabs, date bar, site, night bar (one 44 px line), film strip, strip info (44 px), frame now, next step, then the timeline, shooting window, Sun and Moon. The frame number, band and next step stay above the fold on a 390 × 844 screen.

Spacing steps: 4, 8, 12, 16, 18 px; rows are 44 px minimum wherever they can be tapped.

## Elevation & Depth

Flat. No shadows anywhere. Depth is the film strip sitting on the paper and 1 px rules between sections.

## Shapes

Film frames have 2 px corners; buttons and inputs 10 px; legacy cards 14 px; small controls (Night, Tonight, Now) are full pills. Band marks on the strip are 3 px top and bottom rules inside the frame window; on the bar, 3 px rules above and below the track.

## Components

### Buttons
- **Primary:** film black with paper text, 10 px radius, 44 px tall. In night mode a black button with a red outline and red text.
- **Pill (Night, Tonight, Now):** 1.5 px ink outline, 999 px radius, 44 px tall. The Night toggle is filled film black by day and black with a red outline at night.
- **Icon buttons (‹ ›):** 44 × 44 px, drawn SVG chevrons, no border.
- **Pressed:** paper-rule fill; no animation.

### Inputs
- Raised paper, 1 px strong rule, 10 px radius, 44 px tall, 16 px text (no iOS zoom). Focus: 2 px grease-pencil outline.
- The date field is an invisible native date input laid over the date label, so tapping the date opens the iOS picker.

### Field entry (Log tab)
- **Order of use on site:** Shooting (start, end, frames) → time.is clock check → conditions → camera → night & site → band timing → export. Reference notes sit in collapsible “How to…” rows (44 px summary).
- **Big action:** “Start now / End now” are full-width primary buttons, 56 px tall, 18 px bold.
- **Fields:** 48 px tall, 17 px text, labels 13 px above. Time and its source each take a full row.
- **Choice chips:** single-choice values (clouds) are 48 px pill chips; the chosen one is filled film black (night: dark red fill, red outline). Tapping it again clears it.
- **Lists:** past logs are 64 px rows with a chevron; “Add a reading” is a full-width dashed 48 px button; remove-reading is a 44 × 48 px drawn cross.
- **Delete** is an outlined red-text button set apart at the bottom.

### Navigation
- Four text tabs in a row, 44 px tall, print grey; the selected tab is ink with a 2.5 px underline (red at night).

### Film strip (signature)
- One button per frame (66 × 100 px): sprocket holes top and bottom, edge-printed number, frame window, band code (TWILIGHT / DARK at a band's first frame, TW / DK after).
- Unshot frames are dark, shot frames lighter, band frames carry 3 px red rules, the current frame has a 3 px red outline, the selected one an amber outline.
- Swipes with scroll-snap; follows the current frame live; tapping a frame shows its true start–end time and band, with a Now/Back pill to return.

### Whole-night bar (signature)
- One 44 px row: window start time, a 12 px track, window end time. Both bands are marked by red rules above and below the track at their planned frames, the shot part is filled, and a 3 px red line marks the current frame. Tapping it jumps the strip to that frame.

## Do's and Don'ts

### Do:
- **Do** keep every tap target at least 44 × 44 px (cold hands, gloves).
- **Do** use the same tokens in both modes; night mode only re-values them.
- **Do** keep red for bands, now and next.
- **Do** set `theme-color` to #e9e7e2 by day and #000000 at night, before first paint.
- **Do** open in night mode automatically while the Sun is below −6° at the saved site (unless the user chose day mode for that night), with a 44 px "Switch to day mode" link under the top bar.

### Don't:
- **Don't** introduce white, grey, green or blue in night mode, including native controls.
- **Don't** use shadows, gradients or glass.
- **Don't** add motion beyond following the current frame (smooth only for short jumps, none under reduced motion).
- **Don't** change calculations, data formats or export columns for a visual change.
