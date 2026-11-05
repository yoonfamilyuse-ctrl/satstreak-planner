---
version: 1
slug: "src-ui-night-view-ts"
primary_target: "src/ui/night-view.ts"
related_targets: ["src/main.ts","src/style.css"]
---

# Surface brief: the app shell and the Night plan (Operate)

Scope: the whole app shell (top bar, tabs, date/site), first built on the Night plan tab, then applied to 14 nights, Satellites and Log. Mode: Operate.
Audience and task: the owner and Rocky on site in red-only night mode, glancing at "what frame is it, which band, what's next"; at home in day mode, reviewing the plan.
Constraints: no calculation, data or export changes; night mode emits no white or blue light (status bar, tap flash, focus, pickers); iOS Safari; short plain labels for translation.
Unresolved: Night plan layout (prototype round, 2–3 layouts), then applied to the other tabs.

## Direction contract
THESIS: The night is one roll of film. The 476 frames are the unit of everything; bands are grease-pencil marks on that roll. Refuses the stack of grouped white cards with a blue pill.
OWN-WORLD: Proof-paper grey ground (day), black film-strip bands carrying the frame rebate numbers in amber, grease-pencil red marking bands and the current frame; night mode is the same grammar in reds on black (strip = deep red-black, rebate and marks in reds). One system sans, tabular numerals, scale contrast; 1 px rules, no shadows.
STORY: Glance → frame now, band, time to the next edge; scroll → the night's timeline; at home → the whole roll with both bands marked.
FIRST VIEWPORT: Top bar and tabs, date line; then the signature film strip of frames around now, current frame circled; frame number at display size with band and countdown; timeline below. Before/after shooting the strip shows the whole roll with the bands marked.
FORM: Contact sheet (35 mm film proof), position 1 on the ordered list (pick card); seed:15ec422a6a3ad949
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
