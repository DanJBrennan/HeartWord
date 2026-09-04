# src/

The v1 implementation. See `docs/ARCHITECTURE.md` for the intended shape
and `docs/plans/CURRENT_GOAL.md` for what's built vs. stubbed so far.

```
src/
├── web/          React frontend (Vite)
├── server/       Express API + static-serving in production
├── pipeline/     One directory per pipeline stage; orchestrator.ts runs them in sequence
├── providers/    Provider interfaces + Gemini/Kling adapters (wiring only — see below)
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

Every pipeline stage in `src/pipeline/*/index.ts` and every provider method
in `src/providers/{gemini,kling}/index.ts` is wired into the orchestrator
and the type system, but its actual logic (calling an AI provider, running
FFmpeg, etc.) is not implemented yet — each throws or returns a clearly
labeled "not yet implemented" result rather than pretending to work. See
`docs/plans/CURRENT_GOAL.md` for what's next.
