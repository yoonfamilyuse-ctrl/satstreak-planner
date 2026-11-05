# Sat-Streak Planner — notes for Claude

## Standing note: do these before the final wrap-up (not yet started)
1. **Korean/English language toggle** for all UI terms: every label, button, heading, note, warning and export-facing UI string, plus night mode. Persist the choice like the night-mode setting. Keep scientific terms and citations accurate in both languages. CSV/JSON column names stay in English, because they are a research data format.
2. **Redesign the UI** using the Claude design skills the user installed (in `~/.claude/skills/`, e.g. `impeccable`, `design-taste-frontend`, `emil-design-eng`, `mobile-native`, `apple-design`, `break-ui`). Confirm with the user which skills to apply before starting. Keep the constraints: mobile-first, outdoor night use, one-tap red-on-black night mode, and no white light.

Do not start either item until the user asks for the final wrap-up.

## Working rules for this project
- Stop after each requested step; commit after each step. **Push only when the user says so.**
- Every astronomical or brightness value and formula needs a citation in the code and README. Flag unpublished or unverified values; never guess. Wikipedia is not an acceptable source.
- Display times in KST (Asia/Seoul). Run heavy satellite work in the Web Worker (`src/sat/worker.ts`).
- Respect CelesTrak's policy: at most one download per 2 h, no automatic retries.
- `npm test` must pass, and `npm run build` must succeed, before committing.
