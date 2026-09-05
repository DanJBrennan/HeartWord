# Current Goal

## Status: vision and design complete; scoping the architecture request (2026-09-04)

`docs/PRODUCT_VISION.md` reflects the mature vision recovered from BVET (the
second of two prior attempts at this project), refined across this whole
design pass: branding (HeartWord AI/Studio/Films/Illustrated, logo, trimmed
tagline), a first-class Character Creation & Editing Tool, Gemini Omni
1.1 Flash-style Draft Room cost-tiered generation, the full Illustrated
Scripture strategy recovered from prior Mark/Acts comic work, enriched
canonical-character rules, language/book/chapter navigation with undo/redo,
a two-level book/chapter storyboard model with multi-agent role-based shot
planning, producer notifications (including a WhatsApp self-message
channel), export/delivery tiers grounded in the real distribution path
(Android phones, YouTube, WhatsApp fan-out through village leaders,
Bluetooth/USB-C), a field review gate before that distribution (Ryan and a
native-Hatam-speaker review team), and an FCBH-rights gate on public
YouTube publication independent of that.

Design docs completed, per `docs/ARCHITECTURE.md`'s "Design principles":

- **Provider abstraction** — every media provider sits behind one interface;
  see `docs/design/media-generation.md`'s Draft Room design, now with a
  concrete review-outcome set (accept / retry / retry-modified / escalate
  provider / hold for human).
- **Automated media review** — an evolving, learned rubric (not a fixed
  checklist), seeded with concrete dimensions (canonical likeness, extra/
  malformed characters, mouth-sync, unwanted text, continuity); see
  `docs/design/automated-quality-control.md`.
- **Illustrated Scripture strategy** — recovered in full from a prior
  attempt's Mark/Acts comic work; see `docs/design/illustrated-scripture.md`.
  Included in the architecture but stays lower priority than HeartWord Films.
- **Canonical Characters** — recognition hierarchy, naming/identity safety,
  and a non-destructive candidate-review workflow; see
  `docs/design/canonical-characters.md`.
- **Character Creation & Editing Tool** — the tool's own workflow (starting
  a character, gap detection during shot planning, evolving an existing
  character, voice mapping and live test); see
  `docs/design/character-tool.md`.
- **Timeline and project identity** — language/book/chapter as the project
  key, typed-command edit history with undo/redo; see
  `docs/design/timeline.md`.
- **Shot planning as multi-agent collaboration** — book/chapter storyboards,
  a manual "Create Storyboard" trigger, role agents that interact (not just
  independently propose) with the interaction logged; see
  `docs/design/shot-planning.md`.
- **Producer notifications** — trigger events, channel options (email,
  Pushover/ntfy.sh, Twilio, native app/PWA, WhatsApp self-message), a
  cheap-first phased approach; see `docs/design/notifications.md`.
- **Working conventions for AI coding agents** — `AGENTS.md` now includes a
  "never infer requirements from code, ask Dan on ambiguity" rule and a
  Goal Guardian check (verify implementation against the vision/goal/
  workflow docs, not just tests), aimed directly at the 100-ticket failure
  mode from the prior attempt.

## v1 Scope (confirmed 2026-09-04)

The smallest slice that proves the whole loop end-to-end on one real
chapter, rather than architecting the full vision at once:

**In scope for v1:** one chapter, Hatam Mark 2 (the chapter with the
existing pilot to compare against), taken through all seven core pipeline
stages — ingestion/alignment, scene breakdown, casting & direction, media
generation, voice & lip-sync, assembly, and QC — to a reviewable rendered
cut in the editor. One provider per media type (no cross-provider
escalation yet). Casting & direction as a single planning pass rather than
the full multi-agent role negotiation. The Character Tool, built just far
enough to create and approve the handful of characters Mark 2 actually
needs. QC limited to the structural checks (sync drift, coverage, lip-sync
confidence) rather than the full evolving media-review rubric. A basic
running cost total rather than the full live/pending/reconciled ledger.

**Deliberately deferred, but the architecture should leave room for:** the
Draft Room's cost-tiered draft/escalate loop, the multi-agent shot-planning
negotiation and its log, the full evolving media-review rubric with
retry/escalate decision states, the complete cost-governance ledger,
producer notifications, book-level (vs. chapter-only) storyboards, and the
Illustrated Scripture lane entirely.

## Architecture (confirmed 2026-09-04)

`docs/ARCHITECTURE.md` now has the v1 architecture: a local web app
(React/TypeScript frontend, Node/TypeScript backend, both on Dan's
machine), TypeScript throughout rather than splitting with Python, SQLite
for structured data with generated media on the filesystem, a v1 directory
layout, a data model covering the core entities, queue-free stage
orchestration, and a provider interface whose result states already match
the QC review-outcome vocabulary. Runtime data (the SQLite file and
generated assets) lives at `C:\Users\danbr\HeartWordData\`, outside the
OneDrive-synced repo, configurable via `HEARTWORD_DATA_DIR`.

## Providers and schema (confirmed 2026-09-04)

v1 providers are locked in: Google Nano Banana / Nano Banana Pro (images),
Google Veo 3.1 Lite 720p/1080p (video), and Google Gemini Omni 1.1 (360p
draft tier, start/end-keyframe-guided generation, targeted region image
editing) — all one Gemini adapter under `GEMINI_API_KEY`; Kling.ai's Avatar
API (lip-sync) under `KLING_API_KEY_1`. See `docs/ARCHITECTURE.md`'s
Provider interface section and `.env.example`. Voice/TTS is still open.

The v1 SQLite schema is written: `src/db/schema.sql` (projects, characters/
character_versions/character_assets, scenes/shots/shot_characters,
generation_attempts, clips, audio_segments/tracks, edit_commands,
cost_ledger_entries, review_notes). It deliberately mirrors BVET-Data's own
`identityId`/`scope`/region conventions so imported characters carry their
provenance rather than being re-modeled from scratch.

## Mark 2 assets imported (confirmed 2026-09-04)

Dan confirmed the import plan. Copied into `HeartWordData/assets/`
(sha256-verified against the source manifests after copy):

- `source/hatam/mark-2/` — the Hatam Mark 2 text and FCBH audio, from
  `BVET-Data/assets/`.
- `characters/jesus/` and `characters/matthew/` — full production packages
  (lip-sync close-up + 4 body/pose views), `approved` status, from
  `OpenAI-Code Comics/assets/characters/Video Character Library/Regional
  Canon/Papuan/`.
- `characters/mark-2-{friend-1-rust,friend-2-olive,friend-3-slate,
  friend-4-brown,paralytic,principal-scribe,crowd-witnesses}/` — one
  producer-approved turnaround sheet each, same source repo.
- `characters/import-manifest.json` — provenance for every file above
  (legacy identity id, canon status, sha256, source path), field-shaped to
  match `characters`/`character_versions`/`character_assets` in
  `src/db/schema.sql` so a future seed script can load it directly instead
  of re-deriving it.

**Voice mapping is scoped to speaking characters only** (see
`docs/design/character-tool.md`): Jesus and Matthew clearly need it. The
paralytic, the four friends, and the crowd witnesses probably don't — Mark
2 gives them no quoted lines — but the manifest flags the principal scribe
as a maybe, since the Pharisees'/scribes' spoken objections elsewhere in
the chapter (2:16, 2:24) may get attributed to him once shot planning
happens. Don't assume "no line" until the scene breakdown confirms it.

`OpenAI-Code Comics/claude-pilot/` (the folder Dan remembered as
"/claude-pilot") holds the earlier pilot's production scripts (per-scene
Veo generation, Kling lip-sync client, a 7-scene/50-segment rough-cut
concat list) — kept as implementation reference for the media-generation
and assembly stages, not imported as assets (the rough cut's own segment
files are no longer present there).

## v1 walking skeleton built (2026-09-04)

A real, tested foundation is running, not just scaffolding — see
`src/README.md` for the exact layout and what's real vs. stubbed:

- The v1 SQLite schema applies cleanly via Node's built-in `node:sqlite`
  (switched from `better-sqlite3` — its native-module install hung
  repeatedly in this dev environment; see `docs/ARCHITECTURE.md`'s
  "Implementation notes" for this and two other environment-specific
  fixes needed to get SQLite writing reliably to `HeartWordData`).
- `npm run db:seed-characters` loads the Mark 2 import manifest into the
  database — verified idempotent (a second run inserts nothing) and
  correct (9 characters, 9 versions, 18 assets, matching what was
  imported).
- The Express API (project create/list/run, character list) and the React
  frontend both work end to end against that database — verified with a
  full request-cycle smoke test (create a project, run its pipeline, see
  it correctly stop at the first stub stage with a reasoning message,
  confirm characters list), not just a typecheck.
- Every pipeline stage (`src/pipeline/*/index.ts`) and provider adapter
  method (`src/providers/{gemini,kling}/index.ts`) is wired into the
  orchestrator and the type system but not yet implemented — each returns
  or throws a clearly labeled "not yet implemented" result.

**Resolved (2026-09-05):** Dan granted delete permission for
`HeartWordData` specifically, closing the one remaining SQLite risk on
this mount (see `docs/ARCHITECTURE.md`'s "Implementation notes") — an
uncleanly-interrupted write outside the app's own `getDb()` path can now
self-heal instead of needing manual recovery.

**Ingestion & alignment implemented for real (2026-09-05):** stage 1
(`src/pipeline/ingestion/`) now parses the source docx into 13 verse-group
paragraphs, detects silence in the FCBH audio via ffmpeg, and picks
verse-group boundaries from the longest gaps — run against the real
imported Hatam Mark 2 assets and verified by inspecting the resulting
`audio_segments`/`review_notes` rows directly. This is honestly
low-confidence, by design: there's no ASR or forced-alignment model for
Hatam, so every boundary is capped below PRODUCT_VISION.md's 80-point
auto-decide threshold and flagged for a language specialist to confirm —
see "Ingestion & alignment (v1)" in `docs/ARCHITECTURE.md` for the full
approach and its known limitations (paragraph-, not verse-level timing; no
reviewer UI yet to act on the flag; heuristic tuned to this specific
docx/audio pair).

## Audio corroboration deepened, real vocal separation added (2026-09-05)

Went well beyond the "ingestion & alignment implemented for real" milestone
above, still within stage 1, driven by Dan's own listening and a request to
pursue real source separation:

- **version-2** (`mark-2-drama.ts`): re-scored the same 13 quote/speaker
  decisions against FCBH's actual multi-cast "Drama" edition instead of the
  single-reader Non-Drama edition, adding a real (if weak) acoustic signal —
  does a candidate quotation's audio sound like a different voice than the
  narrator, and does that difference disappear again right after (the
  "bracket" pattern only a true multi-voice recording could produce).
- Diagnosed and fixed two real bugs in that acoustic check along the way
  (narrator-pitch noise floor, and diluted signal in long estimate windows)
  and separately confirmed the drama edition's background music was
  distorting silence detection (fixed with a recording-specific noise-floor
  tune) but not the coarse pitch numbers.
- **version-3** (`mark-2-drama-v3.ts`): once Dan obtained real Demucs
  (htdemucs) pretrained weights through his own Hugging Face login — see
  `scripts/quote-alignment/separate_audio.py` and `docs/ARCHITECTURE.md`'s
  "Real vocal isolation achieved" section — re-ran the same check against a
  genuinely separated vocals track. Confirmed a real confound (a periodic
  instrument note in the underscore had been confusing the pitch estimator
  at some speaker transitions) and, more importantly, surfaced a much
  cleaner finding: 6 of 7 Jesus utterances now show a consistently
  lower-pitched voice than the narrator baseline — real corroborating
  evidence this recording uses a distinct voice actor for Jesus.
- **`music-dynamics-mark-2.ts`**: a bonus deliverable from having a clean
  instrumental stem — reads the drama edition's own music loudness contour
  (swells/recedes) as a reference for whoever eventually scores this
  chapter's video. A first attempt (before real separation) was mostly
  noise and wasn't delivered; the real-separation version finds 10 events
  that plausibly track real story beats.
- All three reports live in `HEARTWORD_DATA_DIR/exports/` as
  `clips-alignment-Mark-2-version-{1,2,3}.txt` and `music-dynamics-Mark-2.txt`.
  **The underlying open item is unchanged**: none of this has been
  confirmed by a human who actually understands Hatam or this recording —
  see "Next up" below, still the same gate as before, just with a
  stronger v3 report to review against.

## Next up

- Get a language specialist (or Dan, if he can informally judge Hatam
  audio against verse boundaries some other way) to actually check the 13
  candidate segment boundaries ingestion just produced against the real
  audio — `clips-alignment-Mark-2-version-3.txt` is now the strongest
  basis for that review (13 utterances, per-utterance confidence, and
  real acoustic corroboration where it exists), but it's still a report
  sitting in a folder, not a reviewer decision — the flagged review_notes
  row is unactioned in the database with no UI to surface it yet. Until a
  human confirms or corrects it, scene breakdown would be building on
  unverified timing and speaker attribution.
- Decide the voice/TTS provider (still open, per "Providers and schema"
  above) — doesn't block scene breakdown, but does block the voice &
  lip-sync stage, so it's worth deciding before that stage is reached.
- Pick the next pipeline stage to implement for real. Scene breakdown
  (stage 2) is the natural next step — it can consume ingestion's
  paragraph-level `audio_segments` even before their timing is confirmed,
  as long as its own output makes clear it's provisional too.
- Implement one provider adapter method for real (e.g. Gemini image
  generation) once scene breakdown/casting exists to feed it.

Out of scope for now: which subset of the illustrated-Scripture prior
attempt's assets to import — not needed until the Illustrated lane is
active, which is after v1.

## Lesson to keep applying

A prior attempt to fix BVET's issues fragmented into ~100 disconnected
tickets and lost the thread of the actual goal. Keep every piece of design
and implementation work traceable back to `docs/PRODUCT_VISION.md` rather
than letting a backlog of fixes become the de facto plan. The Goal Guardian
check in `AGENTS.md` exists specifically to catch this during
implementation; scoping a v1 before architecture exists to catch it one
step earlier.
