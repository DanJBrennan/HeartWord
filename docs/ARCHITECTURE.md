# Architecture

HeartWord is a pipeline of independently runnable stages. Each stage takes a
well-defined input and produces a well-defined output, so a stage can be
re-run on its own when the user wants to fix just one part of a chapter.

This document covers the v1 architecture — the concrete shape needed to
build Hatam Mark 2 end to end (see `docs/plans/CURRENT_GOAL.md`'s confirmed
v1 scope) — not the full sophistication described in `docs/PRODUCT_VISION.md`
and `docs/design/`. Where v1 deliberately simplifies something the vision
describes more fully, that's called out explicitly rather than silently
dropped, so the simplification is a known starting point, not a lost
requirement.

## Pipeline stages

1. **Ingestion & alignment** — take the chapter's source-language audio
   recording and its translated/latinized text; align text to audio timing.
2. **Scene breakdown** — split the aligned chapter into scenes and lines.
3. **Casting & direction** — for each scene, select which canon characters
   appear (see `docs/design/canonical-characters.md`) and decide the action/
   blocking for the scene.
4. **Media generation** — generate the visual content for each scene (Pixar-
   style 3D characters and settings) per `docs/design/media-generation.md`.
5. **Voice & lip-sync** — produce per-character speech audio (narrator voice
   clone and/or per-character voice IDs) and lip-sync it to each character's
   on-screen face, per `docs/design/audio-and-speakers.md`.
6. **Assembly & timeline** — combine scenes, audio, and lip-synced video into
   one continuous chapter video, per `docs/design/timeline.md`.
7. **Quality control** — automated checks across generated media and the
   assembled video before it's handed to the user for review, per
   `docs/design/automated-quality-control.md`.

A separate, lower-priority lane produces **HeartWord Illustrated** (comic-style pages) from the same Scripture, audio, and character canon as stages 1-3 above, using its own page/panel and lettering pipeline rather than stages 4-7. See `docs/design/illustrated-scripture.md`; it is included in this architecture but not being built for v1.

**v1 simplification:** stage 3 (Casting & direction) runs as a single AI
planning pass rather than the full multi-agent role-agent negotiation in
`docs/design/shot-planning.md`. Stage 7 (Quality control) runs only the
structural checks (sync drift, coverage, lip-sync confidence) rather than
the full evolving media-review rubric in `automated-quality-control.md`.
Both are designed to slot into the same stage boundary later without
changing what's upstream or downstream of them — see Stage Orchestration
below.

## Design principles

**Stage isolation.** Every stage should be able to run in isolation against
saved output from the previous stage, so re-running "just the lip-sync for
scene 4" doesn't require re-running the whole chapter.

**Provider abstraction.** Every external media producer — image generation,
video generation, lip-sync, voice/TTS — sits behind a single provider
interface that pipeline stages call, rather than stages calling a specific
vendor's API directly. Providers in this space (their capabilities, pricing,
and even which vendor is best-in-class) change often; the Generation
Providers section of `docs/PRODUCT_VISION.md` and the Draft Room design in
`docs/design/media-generation.md` already treat named providers (Gemini Omni
1.1 Flash, Veo, Kling, ElevenLabs) as current starting preferences, not fixed
dependencies. The interface should normalize what a stage actually needs —
request a draft-tier or final-tier generation, supply a character/scene
reference, request a keyframe-to-keyframe transition, request a scene
extension, get back a result plus its cost/provenance record — so adding a
new provider, dropping one, or moving a shot type from one provider's draft
tier to another's is a configuration change, not a pipeline rewrite. Provider
-specific quirks (a specific reference-clip length, a specific keyframing
mechanism) are the provider adapter's problem to normalize, not something
that should leak into stage logic.

**Role agents interact, and the interaction is logged.** Each named
film-production role (director, cinematographer, choreographer, and the
rest — see `docs/PRODUCT_VISION.md`) is its own agent rather than folded
into one monolithic planning call. Where a decision genuinely depends on
more than one role — shot planning is the current concrete case, see
`docs/design/shot-planning.md` — those agents interact with each other
(propose, object, resolve) instead of each producing an isolated answer
that gets silently merged. The interaction itself is captured as a log and
surfaced in the UI, not discarded once a final decision is reached. **Not
built for v1** — v1's single-pass casting/direction stage should still log
its own reasoning (per `AGENTS.md`'s working conventions) so the upgrade to
multi-agent negotiation later is additive, not a rewrite of what gets shown
in the UI.

## Application shape (confirmed)

**Recommendation: a local web app.** A React/TypeScript frontend (the
Premiere-like project/media browser, timeline, and previews from Product
Experience and Visual Interface Strategy in `docs/PRODUCT_VISION.md`) talking
to a backend service that owns the pipeline, both running on Dan's own
machine. The AI assistant isn't a separate product — it's the backend
calling out to an LLM to do planning/direction work (stage 3, and the
role-hat questions in Editing Experience), exposed through the same UI.

Reasoning: the vision's editing experience (multitrack timeline, source/
program monitors, drag-and-drop trimming) needs a real UI, which rules out
a CLI-only or API-only tool. A full native desktop app (Electron or
similar) adds packaging/distribution work that buys nothing yet — HeartWord
has exactly one user on one machine right now. A local web app gets the UI
HeartWord actually needs without that overhead, and can be wrapped in
Electron later purely as a packaging step if a native app ever matters,
without changing anything underneath it.

This resolves the "application shape" question left open in
`docs/PRODUCT_VISION.md`'s Design Decisions Intentionally Left Open — flagging
it here rather than treating it as silently settled, since it's a
foundational, costly-to-reverse choice.

## Technology stack (v1, confirmed)

- **Language: TypeScript, frontend and backend.** One language across the
  whole stack rather than splitting frontend (React/TS) from a Python
  backend. HeartWord's pipeline stages are primarily orchestration —
  calling AI provider APIs, invoking FFmpeg, reading/writing structured
  data — not heavy local ML computation, so there's no strong pull toward
  Python specifically. One language reduces context-switching for however
  many AI coding agents work on this, and matches the frontend framework
  the timeline UI needs (React has the deepest ecosystem for exactly this
  kind of editor UI).
- **Frontend: React.**
- **Backend: Node.js**, calling out to FFmpeg as a subprocess for any local
  media manipulation (concatenation, trimming, format conversion) rather
  than reimplementing media handling — FFmpeg is the right tool for that
  regardless of the pipeline's own language, and the prior BVET codebase
  already used it successfully.
- **Structured data: SQLite** via Node's built-in `node:sqlite` (see
  "Implementation notes" below for why, over `better-sqlite3`), one file —
  see Development Environment below for why this needs a specific location
  decision, not just "a file in the project folder."
- **Media files (audio, images, video)** live on the filesystem in
  HeartWord's own asset area (per Assets, Versions, and Portability in
  `docs/PRODUCT_VISION.md`), referenced by path from SQLite rows — never
  stored as database blobs.

Confirmed: TypeScript throughout, not split with Python as the prior BVET codebase partly was.

## Directory layout (v1)

```
HeartWord/
├── AGENTS.md, CLAUDE.md, README.md, docs/    (existing)
├── src/
│   ├── web/              # React frontend: project browser, timeline, previews
│   ├── server/           # API layer the frontend talks to
│   ├── pipeline/
│   │   ├── ingestion/
│   │   ├── scene-breakdown/
│   │   ├── casting/
│   │   ├── media-generation/
│   │   ├── voice-lipsync/
│   │   ├── assembly/
│   │   └── qc/
│   ├── providers/
│   │   ├── image/        # one v1 adapter + the provider interface
│   │   ├── video/
│   │   ├── voice/
│   │   └── lipsync/
│   ├── characters/        # Character Creation & Editing Tool backend
│   └── db/                 # SQLite schema, migrations, query layer
└── tests/                  # mirrors src/, per pipeline stage
```

Each `pipeline/<stage>/` directory is independently runnable and testable
per the Stage isolation principle — it reads its inputs from `db/` and the
asset area, and writes its outputs back there, so it can be re-run alone
against another stage's already-saved output.

## Data model (v1)

The entities and relationships a v1 implementation needs, expanding the
list already named in Assets, Versions, and Portability in
`docs/PRODUCT_VISION.md`. The actual DDL lives in `src/db/schema.sql`; the
list below is the rationale, not a duplicate of the columns — read the
schema file itself for exact fields, types, and constraints.

- **Project** — one row per (language, book, chapter); current stage
  reached; status. This is the unit the language/book/chapter navigation
  in `docs/design/timeline.md` selects.
- **Character** / **CharacterVersion** — canon record fields from
  `docs/design/character-tool.md` (headshot, body/pose refs, voice
  mapping, regional canon, approval state); versions are additive
  (v2-candidate workflow), never overwritten.
- **Scene**, **Shot** — output of stage 2/3: which verses, which
  characters, the action/blocking decision, linked back to exact source
  text and audio range.
- **GenerationAttempt** — one immutable row per paid provider call: shot,
  provider, model, operation, resolution, cost, result reference, status.
  Never edited after creation (Cost Governance in `docs/PRODUCT_VISION.md`).
- **Clip** — an accepted generated result (video or lip-synced clip) placed
  on the timeline, referencing the GenerationAttempt(s) that produced it.
- **AudioSegment** / **Track** — per the Three-Layer Audio Architecture in
  `docs/PRODUCT_VISION.md`: the immutable original reading, the composite
  cast master, and the spaced production timeline's referenced ranges and
  gaps.
- **EditCommand** — one row per timeline edit, append-only, per the edit
  history design in `docs/design/timeline.md`; undo/redo replays this log
  rather than mutating a single current-state record.
- **CostLedgerEntry** — append-only, sums to the running total v1 shows;
  the full live/pending/reconciled distinction from Cost Governance is
  deferred, but the ledger itself should already be append-only so that
  upgrade doesn't require a data migration.
- **ReviewNote** — a held-for-review flag from QC (stage 7) or a
  human note, linked to the shot/clip it's about.

## Stage orchestration

No message queue or job scheduler for v1 — one producer, one machine, and
stages run one after another for a given chapter. A simple in-process
orchestrator calls each stage in sequence; each stage records its own
completion (and its reasoning, per `AGENTS.md`) in the database before the
next stage starts, so:

- the autonomous end-to-end run is just "call each stage in order";
- a manual "re-run just stage 4 for scene 3" call is the same stage
  function, invoked directly against what's already saved, per Stage
  isolation;
- nothing is lost by not having a queue yet — if multi-chapter concurrent
  production ever matters, a real queue (e.g. BullMQ) can sit behind the
  same stage functions without changing what a stage itself does.

## Provider interface (v1 shape)

**Confirmed v1 providers:** Google Nano Banana / Nano Banana Pro (images),
Google Veo 3.1 Lite (video, 720p/1080p), and Google Gemini Omni 1.1 (draft
tier, keyframe-guided generation, targeted image editing) all sit behind
one Gemini/Google adapter authenticated with a single `GEMINI_API_KEY` —
they're one vendor family, so one adapter module implements several
provider interfaces rather than one interface having several vendors
behind it. Kling.ai's Avatar API (lip-sync) is a separate adapter,
authenticated with `KLING_API_KEY_1`. See Generation Providers, Models, and
Cost in `docs/PRODUCT_VISION.md`.

```ts
interface ImageProvider {
  // tier "pro" → Nano Banana Pro; default → Nano Banana
  generate(request: ShotRequest, opts?: { tier?: "standard" | "pro" }): Promise<GenerationResult>;
}

interface ImageEditor {
  // Omni 1.1 only for v1 — a targeted region edit, not a full regeneration
  editRegion(asset: AssetRef, instruction: string): Promise<GenerationResult>;
}

interface VideoProvider {
  // resolution "1080p" for emotionally important shots, else 720p (Veo 3.1 Lite)
  generateFinal(request: ShotRequest, opts?: { resolution?: "720p" | "1080p" }): Promise<GenerationResult>;
}

interface DraftVideoProvider {
  // Omni 1.1's 360p draft tier
  generateDraft(request: ShotRequest): Promise<GenerationResult>;
  // Omni 1.1's start/end-keyframe-guided generation
  generateGuided(startFrame: AssetRef, endFrame: AssetRef, request: ShotRequest): Promise<GenerationResult>;
}

interface LipSyncProvider {
  // Kling.ai Avatar API
  sync(character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef): Promise<GenerationResult>;
}

interface GenerationResult {
  status: "accepted" | "retry_same" | "retry_modified" | "escalate" | "hold_for_review";
  media?: AssetRef;
  cost: CostRecord;
  provenance: { provider: string; model: string; prompt: string };
}
```

The `status` enum matches the review-outcome set already defined in
`docs/design/automated-quality-control.md`, so stage 7's QC step and the
provider layer share one vocabulary for "what happens to this result next"
from day one, even though v1's QC only implements the structural subset of
checks that can produce it. `ImageEditor` is deliberately its own small
interface rather than a method on `ImageProvider`, since v1 has exactly one
implementation (Omni 1.1) and no image-generation vendor is assumed to
support it. A `VoiceProvider` interface (for narration/character-speech
generation feeding into `LipSyncProvider`) isn't sketched here yet since no
v1 voice/TTS vendor is confirmed — see Open implementation questions.

## Development environment

This repo's docs live on OneDrive (`C:\Users\danbr\OneDrive\Documents\HeartWord`),
which worked for text files but caused repeated file-lock and git-lockfile
issues throughout this project's design phase — every git operation left
stray lock files that had to be worked around, and Office-style locks
blocked writes outright while a doc was open elsewhere. A live SQLite
database and actively-rendering media files are far more exposed to that
same problem: OneDrive syncing mid-write risks corrupting the database, and
syncing large generated video/audio files is slow and pointless since
they're not meant to be shared via OneDrive anyway.

Decided: keep the git repo (source code, docs) on OneDrive as today, but
point HeartWord's runtime data at `C:\Users\danbr\HeartWordData\` — a
plain folder directly under the user profile, a sibling of `Documents`
rather than nested inside it, so it sits outside anything OneDrive is
configured to sync. Structure: `HeartWordData\db\heartword.sqlite` for the
SQLite database, `HeartWordData\assets\` for generated media. The path is
configurable via a `HEARTWORD_DATA_DIR` environment variable that defaults
to this location, so moving it later (a different drive, a second machine)
is a one-line config change rather than a hardcoded path. The directory is
created on first run if missing — nothing to set up by hand ahead of time.
`docs/NON_GOALS.md`'s asset-area principle (a dedicated area, not dependent
on one deployment's folder layout) already supports this; this just makes
the OneDrive-specific reason explicit before it causes a real problem
instead of after.

Required environment variables (`GEMINI_API_KEY`, `KLING_API_KEY_1`,
`HEARTWORD_DATA_DIR`) are listed in `.env.example` at the repo root; `.env`
itself stays gitignored, per existing convention.

## Open implementation questions

- All v1 providers (Nano Banana/Pro, Veo 3.1 Lite, Omni 1.1, Kling Avatar)
  are cloud-hosted and API-key authenticated, so v1 needs no local GPU
  provisioning — confirmed, not open. A voice/TTS provider for narration
  and character speech (feeding into the Kling lip-sync step) is still
  unnamed; see Audio Model in `docs/PRODUCT_VISION.md`.
- Whether `KLING_API_KEY_1`'s naming implies more than one Kling key is
  expected (e.g. for quota/rate-limit spreading across concurrent lip-sync
  calls) — affects whether the Kling adapter needs key-pool logic in v1 or
  just a single credential.
- Migration tooling — `src/db/schema.sql` is the v1 schema (applied directly
  since there's no deployed data to migrate yet); a migration runner only
  becomes necessary once the schema needs to change under existing data.

## Implementation notes (v1 walking skeleton)

Resolved while building the first runnable slice (server, DB, character
seed script, minimal frontend — see `src/README.md` for what's real vs.
stubbed):

- **Dev process count: two.** `npm run dev` runs the Express backend
  (`tsx watch`, port 4000) and the Vite dev server (port 5173, proxying
  `/api` to the backend) concurrently. In production, `npm run build:web`
  then starting the backend alone is one process — Express serves the
  built static files directly. This closes the "one process or two" open
  question above.
- **SQLite driver: Node's built-in `node:sqlite`, not `better-sqlite3`.**
  `better-sqlite3` needs a native addon compiled via node-gyp, and that
  install hung/failed repeatedly in this dev environment; `node:sqlite`
  ships with Node 22 (used here without the `--experimental-sqlite` flag,
  which this Node version no longer requires) and needs no native build at
  all. Its API is close enough to `better-sqlite3`'s (named parameters,
  `.prepare()/.run()/.get()/.all()`) that this cost nothing in ergonomics.
- **Journal mode: `PERSIST`, not the SQLite default (`DELETE`) or `WAL`.**
  Both alternatives fail outright against `HeartWordData` from this dev
  environment: `WAL`'s mmap-based shared memory produces a "disk I/O
  error" over the mount this shell reaches that folder through, and the
  default `DELETE` mode fails because it needs to `unlink()` the journal
  file after every commit, which this mount doesn't permit without an
  explicit one-time grant (see `AGENTS.md`'s `_to_delete/` convention).
  `PERSIST` gets the same crash-safety (a real journal file backs every
  write transaction) by truncating that file instead of deleting it, which
  this mount does allow.
- **Resolved (2026-09-05): delete permission granted for `HeartWordData`.**
  The risk this closes: if a write is ever interrupted uncleanly (a crash,
  a forced kill) while a **different** process has the database open
  without `PERSIST` already set — as happened once during this session,
  from an ad hoc debug script — SQLite is left with a non-empty "hot"
  journal in `DELETE` format, and recovering from that requires deleting
  the journal on next open. Dan chose to grant delete permission for
  `HeartWordData` specifically (not the OneDrive-synced repo, not any
  other connected folder) rather than leave this as a rare manual-recovery
  case, so this failure mode now self-heals. Every path in this app's own
  code still opens the database exclusively through `src/db/client.ts`'s
  `getDb()`, which sets `PERSIST` immediately after opening — so this
  isn't expected to trigger through normal use of the app itself; the
  grant is a safety net for exactly the kind of ad hoc/external access
  that caused it once already.

## Ingestion & alignment (v1) — implemented 2026-09-05

Stage 1 is implemented for real against Hatam Mark 2, in
`src/pipeline/ingestion/`. The core problem: align a chapter's translated
text to its audio recording's timing, with no ASR or forced-alignment
model available for Hatam and no one on this team who reads it — so
nothing here can be verified by ear. The approach:

1. **Parse the source `.docx`** (`parse-source-text.ts`) into
   paragraph-level verse groups. The source docx's own paragraph breaks
   already read as sense-units spanning one or more verses (e.g. one
   paragraph covers Mark 2:1-5), so paragraph — not single-verse — is the
   alignment grain v1 targets; verse numbers are recovered from inline
   markers in the text (`"1Njap..."`, `"23 Mpe..."`) via a regex tuned to
   this file's formatting, and non-verse paragraphs (the chapter title,
   pericope headings, parallel-passage references like
   `"(Mat. 9:1-8; Luk. 5:17-26)"`) are skipped since they aren't part of
   the read-aloud text. For Mark 2 this yields 13 verse-group paragraphs
   covering verses 1-28 with no gaps or overlaps.
2. **Detect silence in the source audio** (`detect-silences.ts`) via
   ffmpeg's `silencedetect` filter (shelled out to — ffmpeg and ffprobe
   are both preinstalled system tools, so this adds no npm dependency).
   For the actual Mark 2 FCBH recording (446s, mostly clean narration)
   this finds 36 candidate gaps at a -30dB/0.5s threshold.
3. **Pick verse-group boundaries from the longest gaps**
   (`select-boundaries.ts`): assumes a pause between verse-groups tends to
   be longer than a clause-internal breath, and takes exactly as many of
   the longest gaps as there are internal boundaries needed (12, for 13
   segments). This is a real but weak signal — confirmed weak by running
   it: the resulting segment durations for Mark 2 are not evenly
   proportional to each group's verse count or expected content length in
   an unnervingly noticeable way (e.g. one 2-verse segment currently spans
   over two minutes). Every boundary this heuristic picks is capped below
   80 on PRODUCT_VISION.md's 0-100 assurance scale (the model's own
   "hold for a qualified language specialist" threshold) — this is not
   miscalibration, it's the honest position given the evidence: gap
   duration alone shouldn't be trusted to auto-decide a boundary here. The
   chapter's true start and end are the only two "boundaries" not guessed
   (confidence `NULL`, meaning certain rather than estimated).
4. **Write results and flag for review**: one `audio_segments` row per
   verse-group (`layer='original_reading'`, `verse_ref` e.g. `'Mark
   2:1-5'`, `confidence`), plus one `review_notes` row
   (`subject_type='project'`, `source='qc'`) summarizing that the chapter's
   segment boundaries are heuristic and need language-specialist
   confirmation. The stage still returns `ok: true` — it produced a real,
   inspectable artifact, just not a high-confidence one — rather than
   `ok: false`, which would imply the stage itself failed to run.

Verified by running ingestion against the real imported Hatam Mark 2
assets (not synthetic test data) and inspecting the resulting database
rows directly; `select-boundaries.ts`'s heuristic also has a small vitest
suite (`select-boundaries.test.ts`) since it's the one piece of real
decision logic in this stage.

**Known limitations, left open rather than silently resolved:**
- Alignment granularity is per-paragraph, not per-verse — a paragraph
  spanning several verses (e.g. Mark 2:1-5) gets one timing range, not one
  per verse. Scene breakdown (stage 2) can still work from this — scenes
  are naturally multi-verse anyway — but per-verse timing isn't available
  if a later stage needs it.
- No reviewer UI exists yet to act on a `review_notes` flag; today,
  confirming or correcting a boundary means querying `audio_segments`
  directly and re-running ingestion isn't yet wired to accept manual
  corrections as input. Both are real gaps, not deferred by oversight.
- The verse-marker regex and the "audio contains only the verses, no
  spoken headings" assumption are both tuned to this specific Mark 2
  docx/audio pair; a different chapter's source files may need either
  adjusted.
- The longest-gap heuristic has no fallback if a chapter's audio has fewer
  silence gaps than verse-group boundaries needed (it throws, rather than
  guessing at a finer noise-floor automatically) — encountered this while
  building it: the first attempt right after adding the `verse_ref`/
  `confidence` columns to `audio_segments` failed with "no such column"
  against the already-existing dev database, since `CREATE TABLE IF NOT
  EXISTS` doesn't retroactively add columns — resolved per the Migration
  tooling note above by deleting and recreating the dev database (no real
  data existed yet to lose).

## Source audio acquisition (FCBH) — added 2026-09-05

For Mark 2, the Hatam source audio was tracked down the hard way: found
`bible.is`'s per-chapter streaming page, confirmed FCBH's fileset catalog
(`HADLAIN1DA` = Non-Drama single reader, `HADLAIN2DA` = Drama multi-voice)
via that page's embedded `__NEXT_DATA__`, then pulled the actual files
from Dan's existing `BVET-Data/assets/Original-FCBH-Audio/` folders, which
already had the full Hatam New Testament in both editions
(`Hatam_had_LAI_NT_Non-Drama/` and `Hatam_had_LAI_NT_Drama/`, one mp3 per
chapter, named like `B02___02_Markus______HADLAIN2DA.mp3`).

For any future chapter, book, or language, start here instead — FCBH runs
a public bulk-download page that's far more direct than reconstructing a
fileset ID from a streaming page's embedded JSON:

- Hatam specifically: https://www.faithcomesbyhearing.com/audio-bible-resources/mp3-downloads?language=Hatam&version=HADLAIN2DA
- Any language (starting point): https://www.faithcomesbyhearing.com/audio-bible-resources/mp3-downloads

(Dan's own note, added here so it isn't lost.) The Bible Brain API
(`4.dbt.io`, née DBP) documented in the version-2 quote-alignment work is
still worth knowing about for programmatic fileset lookups, but for a
human picking out one book/chapter/edition, the mp3-downloads page above
is the simpler starting point.

## Real vocal isolation is blocked by network policy — investigated 2026-09-05

Dan asked for Demucs (or similar) to separate the drama edition's
background music from dialogue, both to clean up the pitch-based
voice-identity check in the quote-alignment exercise and, separately, to
extract the music's own dynamics as a reference for whoever scores
future videos. Findings, so a future session doesn't have to re-derive
them:

- **Demucs itself can't run here.** `pip install demucs` works fine
  (PyPI is reachable), but loading any pretrained model tries to download
  weights from `huggingface.co` or `dl.fbaipublicfiles.com`, and both are
  blocked with a `403` at the egress proxy — confirmed from both this
  cloud environment and Dan's own machine, so it's an org-level network
  policy, not a fixable config issue. Getting real separation working
  needs either those hosts allowlisted for this environment, or the
  model weights obtained on an unrestricted network and handed over as a
  file.
- **A model-free fallback was tried**: a "modulation-based spectral
  gate" (`scripts` were exploratory, not committed — see chat history if
  reconstructing) that keeps time-frequency bins with high short-term
  variance (speech-like) and discards steady ones (sustained pad/string
  chords are much steadier than a voice). Cross-checked against the raw
  mixed audio using both the from-scratch autocorrelation pitch
  estimator (pitch.ts) and librosa's `pyin` (available in the cloud
  sandbox's Python environment, not in this Node pipeline): filtering
  barely changed the coarse (3-second-binned) per-utterance results,
  consistent with the music sitting roughly 10-20dB below dialogue in
  this recording (measured directly). So the existing version-2 report's
  numbers aren't invalidated by the music at that resolution.
- **But it's not clean at fine resolution.** Zooming into two of the
  tightest speaker transitions (a question immediately followed by
  Jesus's answer) with `pyin`, the pitch estimate repeatedly flips
  between ~110Hz and ~220Hz — an exact octave — in BOTH scenes,
  regardless of which character is speaking. That's a strong sign of a
  shared low sustained note (a bass/pad line, not either voice actor)
  confusing the fundamental-frequency estimate. It means a genuinely
  reliable "which exact instant does the voice change" check — the level
  of precision Dan can apparently do by ear — likely does need real
  separation, not just this heuristic.
- **The music-dynamics-for-composers idea is worth doing but not ready.**
  A first pass at extracting a loudness envelope from the modulation
  gate's "steady" residual and flagging rise/fall runs produced mostly
  noise (dozens of small 4-8dB blips, almost certainly leaked
  unvoiced-consonant/breath energy rather than real musical swells) plus
  a couple of large jumps that look like reconstruction edge artifacts
  at the very start/end of the file rather than real cues. Revisit once
  a clean instrumental stem exists.
- **Separately, `pyin` and the hand-rolled autocorrelation estimator
  disagree** on which utterances count as acoustically "distinct" (2 of
  5 previously-flagged utterances agree between the two). Worth
  switching the pipeline to a validated pitch algorithm rather than the
  from-scratch one if this analysis gets relied on more heavily — Python
  wasn't available in earlier sessions but is now (librosa installs
  cleanly from PyPI in the cloud sandbox).
