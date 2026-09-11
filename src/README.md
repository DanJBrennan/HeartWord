# src/

The v1 implementation. See `docs/ARCHITECTURE.md` for the intended shape
and `docs/plans/CURRENT_GOAL.md` for what's built vs. stubbed so far.

```
src/
├── web/          React frontend (Vite)
├── server/       Express API + static-serving in production
├── pipeline/     One directory per pipeline stage; orchestrator.ts runs them in sequence
├── providers/    Media adapters, including Gemini music and ElevenLabs sound effects
├── characters/   Character Creation & Editing Tool backend (not started)
└── db/           SQLite schema, client, and the character-canon seed script
```

## Running it

```
npm install
npm run db:seed-characters   # loads HEARTWORD_DATA_DIR/assets/characters/import-manifest.json
npm run dev                  # server on :4000, Vite dev server on :5173 (proxies /api to :4000)
```

`npm run build:web && npm run dev:server` (or just start the server after a
build) serves the built frontend directly from the same port instead.

## What's real vs. stubbed

Working end to end: the database (schema application, the character-canon
import), the project API (create/list/run), and the frontend (lists
projects and characters, can create a project). Confirmed via a full
request-cycle smoke test, not just typechecking.

Stage 1 (`src/pipeline/ingestion/`) is implemented for real: it parses the
source `.docx` into verse-group paragraphs, detects silence gaps in the
source audio via ffmpeg, and picks the longest gaps as verse-group
boundaries, writing `audio_segments` rows. It is honestly low-confidence —
there's no ASR or forced-alignment model for Hatam, so every boundary is
scored well below the auto-decide threshold and flagged in `review_notes`
for a language specialist to confirm. See "Known limitations" in
`src/pipeline/ingestion/index.ts` and the "Ingestion & alignment (v1)"
section of `docs/ARCHITECTURE.md`.

The project has progressed beyond this original skeleton. Scene breakdown,
casting, keyframe generation and Critic review are implemented; dedicated
tools also generate and assemble video/lip-sync coverage. The generic
`voice-lipsync/index.ts` stage entry point still reports its implementation
gap, so the seven-stage runner must not be described as fully complete.

The September 2026 production crew extends planning, generation, editing and
QC with shared chapter context, specialist exchanges and bounded review
decisions. `ProductionCrew.tsx` exposes these controls in the web app.
The Picture Editor renderer preserves source performance with deliberate
pauses; finishing reviews the actual cut and can generate reviewed Gemini
music / ElevenLabs effects, mix them and check the result. Existing hand
edits are retained and require their actual timing map before automatic
finishing. See `docs/design/production-crew.md` and the current goal for
the precise adoption limits and verification.
