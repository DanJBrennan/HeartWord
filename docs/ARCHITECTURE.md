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
behind it. Two more vendors are each a separate adapter: ElevenLabs'
voice-changer (speech-to-speech) API, authenticated with
`ELEVENLABS_API_KEY` -- confirmed 2026-09-05 as v1's voice/re-voicing
provider, both for auditioning/selecting each canonical character's voice
and for re-voicing their real Hatam dialogue (stage 1's `original_reading`
segments) into the composite cast master -- and Kling.ai's Avatar API,
authenticated with `KLING_API_KEY_1`, for lip-sync: it takes that
ElevenLabs-voiced audio clip plus a scene keyframe (backgrounded in the
actual scene, close enough to see lip movement) and the character's
approved headshot as inputs. See Generation Providers, Models, and Cost in
`docs/PRODUCT_VISION.md`.

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

interface VoiceProvider {
  // ElevenLabs voice-changer (speech-to-speech) -- re-voices the real
  // Hatam performance, doesn't synthesize speech from text (no Hatam TTS
  // model exists). originalAudio is a stage-1 original_reading segment;
  // result becomes part of the composite cast master.
  reVoice(originalAudio: AudioSegmentRef, voiceId: string): Promise<GenerationResult>;
}

interface LipSyncProvider {
  // Kling.ai Avatar API -- audio is the VoiceProvider output (composite
  // cast master), referenceFrame is a scene keyframe close enough to show
  // lip movement but still framed on the scene's real background;
  // headshot is the character's approved reference image, passed
  // alongside referenceFrame for added likeness/lip-sync quality.
  sync(character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef, headshot: AssetRef): Promise<GenerationResult>;
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
support it. `VoiceProvider` is ElevenLabs' voice-changer (speech-to-speech)
API, confirmed 2026-09-05 -- genuinely a separate step from `LipSyncProvider`,
not folded into it: ElevenLabs re-voices a character's real Hatam dialogue
(re-voicing, not synthesizing from text -- no Hatam TTS model exists) into
the composite cast master, and that resulting audio clip is what
`LipSyncProvider` (Kling.ai's Avatar API) then takes as input alongside a
scene keyframe and the character's headshot.

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

Required environment variables (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY`,
`KLING_API_KEY_1`, `HEARTWORD_DATA_DIR`) are listed in `.env.example` at
the repo root; `.env` itself stays gitignored, per existing convention.

## Open implementation questions

- All v1 providers (Nano Banana/Pro, Veo 3.1 Lite, Omni 1.1, Kling Avatar,
  ElevenLabs voice-changer) are cloud-hosted and API-key authenticated, so
  v1 needs no local GPU provisioning — confirmed, not open. The voice
  provider is also confirmed (2026-09-05, Dan): ElevenLabs' voice-changer
  (speech-to-speech) API, `ELEVENLABS_API_KEY` -- a separate vendor and
  step from Kling's lip-sync, not folded into it. ElevenLabs re-voices
  each speaking character's real Hatam dialogue into their chosen voice;
  Kling then lip-syncs that resulting audio against a scene keyframe plus
  the character's headshot.
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

## Real vocal isolation achieved — updated 2026-09-05

The network block above still applies to every automated environment
this pipeline runs in — nothing about that changed, and no workaround
was attempted. What changed is that Dan downloaded the weights himself,
through his own already-authenticated Hugging Face session, and handed
the one file back:

- **Exact weights used**: `955717e8.safetensors` (~84MB) from
  `https://huggingface.co/adefossez/HTDemucs` — this is the standard
  PyTorch `htdemucs` model (NOT `mlx-community/demucs-mlx`, which is an
  Apple-Silicon-only MLX port Dan initially found and which would not
  have run on his confirmed-Windows machine or in this Linux sandbox).
  The bag definition (`demucs/remote/htdemucs.yaml`, already present in
  the installed `demucs` package) lists a single model signature,
  `955717e8`, so this one file is the entire model — no separate
  `.yaml`/multi-file bag to track down.
- **Offline loading trick**: `demucs`'s built-in `LocalRepo` only scans
  for legacy `.th` files, not the newer `.safetensors` format the HF hub
  now serves, so this doesn't use `LocalRepo` at all — it calls
  `demucs.hf.load_safetensors_model()` (the same function
  `get_hf_model()` uses internally after downloading) directly on the
  local file, then wraps the single resulting model in a
  `BagOfModels([model])`. Verified to load and run with zero network
  access. See `scripts/quote-alignment/separate_audio.py` for the
  reusable script (one-time setup instructions for a new machine are in
  its docstring) — the weights file itself lives at
  `HEARTWORD_DATA_DIR/tools/955717e8.safetensors` and is NOT committed to
  git (an 84MB binary, and not project source).
- **Output**: `assets/source/hatam/mark-2/separated/{vocals,music}.mp3`
  (music = drums+bass+other summed; htdemucs' own drums/bass stems came
  back almost silent for this recording, as expected for a
  drums-and-bass-free orchestral score — the real musical content is
  almost entirely in the "other" stem).
- **This resolved both open questions from the section above, cleanly**:
  1. The `pyin` 110/220Hz exact-octave alternation at speaker
     transitions — previously blamed on a periodic bass/pad note
     confusing the pitch estimator — is completely gone once run against
     the separated vocals track instead of the raw mix, at both
     transitions tested. Confirms that diagnosis was correct.
  2. Silence detection no longer needs the version-2 recording-specific
     -22dB hand-tuning: the default -30dB threshold (same as the clean
     Non-Drama edition) works correctly again on the separated vocals
     track, and finds *more* gaps (~55) than either prior run, because
     the vocals track really is near-silent between lines now.
  3. The music-dynamics-for-composers idea, previously "not ready," now
     produces a plausible-looking result: `music-dynamics-mark-2.ts`
     against the real separated music stem finds 10 events ≥6dB (vs. the
     modulation-gate attempt's 53-mostly-noise), several of which line
     up with real story beats (e.g. a recede-then-swell right around the
     crowd's amazed reaction to the healing in Mark 2:12; a sustained
     two-part build leading into the scribes' objection scene in Mark
     2:16). See `HEARTWORD_DATA_DIR/exports/music-dynamics-Mark-2.txt`.
- **What did NOT get fully resolved**: Dan's original ask — "I can hear
  a slightly different voice [at a speaker transition], see if you can
  detect it" — still isn't cleanly confirmed at the fine-resolution,
  moment-of-transition level. With the octave-artifact gone, pitch at
  both tested transitions (q9→q10, q11→q12) sits in a similar ~200-240Hz
  range on both sides of the predicted boundary — no obvious step. This
  doesn't contradict what Dan hears (two adult male voices can easily
  share an F0 range; pitch was never going to be able to confirm a
  same-range voice change on its own, separated audio or not — it would
  take a timbre/formant-based comparison, which this pipeline doesn't
  attempt), it just means this specific check couldn't independently
  verify it either way.
- **A new, more compelling pattern did emerge from the whole-chapter
  version-3 alignment run** (`mark-2-drama-v3.ts`,
  `clips-alignment-Mark-2-version-3.txt`): 6 of the 7 Jesus utterances
  checked show a statistically distinct pitch peak *and every single one
  of those 6 is lower-pitched than the narrator baseline* (the 7th,
  q6, is only two words — too little voiced audio to get a reading
  either way). A consistent direction across 6 independent utterances,
  rather than version-2's noisier mixed-direction ~3-5, is much harder
  to explain as coincidence than any single flagged utterance was — real
  corroborating evidence (still not proof) that this drama recording
  really does use a distinct, lower-pitched voice actor for Jesus's
  lines specifically.
- **Reusable for future chapters/books/languages**: `separate_audio.py`
  takes any input audio path and reuses the same locally-stored weights
  file — no new download needed unless the weights file itself is lost.

## Stage 1 completed for Mark 2: quote-aware ingestion wired in for real — 2026-09-05

The "Ingestion & alignment (v1)" section above describes stage 1's
ORIGINAL scope: paragraph-level timing only, no speaker attribution
(`speaker_character_id` always `NULL`). That was always a partial
implementation of what PRODUCT_VISION.md's "Source Material Validator"
actually specifies — "quotation boundaries, speaker attribution,
source-audio alignment" — the speaker-attribution and quotation-boundary
half was missing entirely from the real database-backed pipeline, even
though the exploratory quote-alignment work in `scripts/quote-alignment/`
(mark-2.ts/mark-2-drama.ts/mark-2-drama-v3.ts) had already worked it out
for Mark 2 and written it to human-readable text reports. Decided
(2026-09-05, "wire in today's Mark 2 work as-is") to close that gap using
that existing work directly, rather than either leaving it unwired or
building a general chapter-agnostic quotation/speaker-detection model
first — matching v1's own philosophy of proving the whole loop on one
real chapter before generalizing.

**What changed:**
- `mark-2-quote-decisions.ts` (the 13 hand-authored decisions) and
  `pitch.ts` moved from `scripts/quote-alignment/` into
  `src/pipeline/ingestion/` — they're load-bearing pipeline logic now, not
  just diagnostic-script internals. The standalone report scripts
  (`mark-2.ts`, `mark-2-drama.ts`, `mark-2-drama-v3.ts`,
  `music-dynamics-mark-2.ts`) still exist and still work, now importing
  from the new location instead of duplicating it.
- `mark-2-acoustic-scoring.ts` (new) extracts version-3's scoring pass
  (narrator baseline, peak-search acoustic corroboration, confidence
  blending) into a function shared by that same report script and the
  real pipeline — one implementation, not two that could drift apart.
- `mark-2-segments.ts` (new) turns the 13 decisions' independently-
  estimated timing windows into one contiguous, non-overlapping,
  chapter-spanning segment timeline — narration filling every gap between
  quotations (including before the first and after the last), with q2
  (the scribes' unvocalized inner reasoning) correctly folded into
  ordinary narration rather than given its own segment.
- **A real bug this surfaced**: q3's and q4's independently-estimated
  windows overlap by ~8.7 seconds. Nothing in the report-generation path
  ever checked neighboring decisions against each other — a human reading
  a text report just sees two windows, not a conflict. Building an actual
  non-overlapping timeline forced the issue into the open. Resolved by
  snapping both to their shared midpoint and marking that boundary
  uncorroborated on both sides pending a language specialist's
  confirmation, with a review note explaining exactly why. This is exactly
  the kind of thing a real "let's actually build it" pass catches that a
  report-only exercise doesn't.
- `runIngestion` (stage 1) now branches: Hatam Mark 2, when its separated
  vocals track exists, runs this real quote-aware path; every other
  chapter (or Mark 2 before separation has been run) falls back to the
  original generic paragraph-timing path unchanged.
- `audio_segments.confidence` is deliberately kept to its documented
  meaning — TIMING-only assurance (min of a segment's two boundary
  confidences) — even though a quote decision's `overallConfidence` also
  folds in text/speaker-attribution confidence at 50% weight. The
  `review_notes` gate uses the fuller `overallConfidence` number (so a
  segment with solid timing but shaky speaker attribution, like q9, still
  gets flagged), and each flagged segment's note carries the full context
  — evidence phrase, rationale, all three confidence numbers, the
  acoustic finding — not just a bare score, per PRODUCT_VISION.md's
  text-first assurance model.
- `source_path` for every Mark 2 segment (dialogue AND narration) points
  at the separated vocals track, not the original drama mix. Chosen
  because it's both the more accurate audio for this stage's own analysis
  and plausibly the better source for later per-character voice/lip-sync
  clipping (clean dialogue, no music bleed) — but that second part is a
  reasonable default, not a settled decision; worth revisiting once stage
  5 (voice & lip-sync) is actually built and audio *quality* (not just
  timing accuracy) becomes directly consequential.
- Verified against the real imported Mark 2 project (not synthetic data):
  produces 21 contiguous segments (12 character-attributed dialogue, 9
  narration) covering the full 446.4s chapter with no gaps or overlaps,
  20 of which are flagged in `review_notes` for language-specialist
  confirmation (matches `clips-alignment-Mark-2-version-3.txt`'s own
  count almost exactly — the 21st segment, q1's dialogue, is the one
  genuinely clean result). Idempotent (a second run replaces rather than
  duplicates). `mark-2-segments.test.ts` covers the overlap-resolution and
  contiguity logic directly (5 new tests; 10 total across the ingestion
  stage, all passing) since that's the one piece of genuinely tricky logic
  this added.

**Still open, unchanged from before**: no reviewer UI exists yet to act on
a `review_notes` flag — confirming or correcting a boundary still means
querying the database directly. And this remains explicitly
Mark-2-specific; a future chapter still needs either its own
hand-authored decisions or (more likely, longer-term) a real chapter-
agnostic quotation/speaker-detection pass, which was deliberately not
attempted here.

## Stage 2 (scene breakdown) implemented for real — 2026-09-05

`runSceneBreakdown` (`src/pipeline/scene-breakdown/index.ts`) is no longer
a stub. Unlike stage 1's Mark-2-specific quote-aware path, this stage is
chapter-agnostic by design:

- **Scene boundaries come from the source text's own published pericope
  headings, not an invented narrative breakdown.** A new
  `parseSourceHeadings()` (`src/pipeline/ingestion/parse-source-text.ts`)
  extracts these from the same .docx stage 1 already reads — the Hatam
  Mark 2 file was found to contain its own section headings plus synoptic
  parallel-passage references (e.g. "Yesus dimig Lewi (Mat. 9:9-13; Luk.
  5:27-32)"), previously silently discarded by `parseSourceText` as
  paragraphs with no verse marker. These map exactly onto the four
  standard Markan pericope divisions (healing the paralytic / calling
  Levi / the fasting question / grainfields on the Sabbath), giving scene
  boundaries that follow the translation's own already-published
  structure — see NON_GOALS.md ("Scene/action decisions fill in *how* the
  text is shown, not *what* the text says").
- **Stage boundary respected**: this stage owns only the `scenes` table
  (sequence, verse range, a text-grounded summary). `shots`,
  `shot_characters`, and `scenes.reasoning` (the schema's own
  "casting/direction reasoning log" comment) are stage 3's (casting &
  direction's) job, not this one's — confirmed by cross-referencing this
  file, the schema comments, and NON_GOALS.md before writing any code.
- **Scene summaries state only what's already established**: heading
  text, synoptic parallel reference, verse range, and which characters
  stage 1's real speaker attribution shows actually speak in that
  range — no staging, camera, or action content invented at this stage.
- `buildScenesFromHeadings()` (`src/pipeline/scene-breakdown/build-
  scenes.ts`) is the pure, directly-tested grouping logic: it assigns
  each stage-1 audio segment to the scene its starting verse falls in,
  and separately flags any segment whose verse range crosses a scene
  boundary rather than silently misassigning it — a real, expected case
  for narration segments that bridge two pericopes (e.g. "Mark 2:12-14
  (narration)" spans the healing-of-the-paralytic scene and the calling-
  of-Levi scene). These get written as a single project-level
  `review_notes` row (subject_type `'project'`, since the schema's
  `review_notes.subject_type` CHECK constraint has no `'scene'` option)
  prefixed `"Scene breakdown:"` so re-runs can idempotently replace only
  this stage's own notes without touching stage 1's unrelated
  project-level QC notes.
- Verified against the real imported Mark 2 project (not synthetic data):
  produces exactly 4 scenes (Mark 2:1-12, 2:13-17, 2:18-22, 2:23-28),
  correctly grouping all 21 of stage 1's real audio segments, with
  correct speaker attribution surfaced per scene (e.g. scene 1: Jesus,
  the paralytic's four/eight bearers, the crowd; scene 2: Jesus, the
  scribes) and 3 boundary-straddling narration segments correctly flagged
  for human confirmation — one at each pericope seam. Idempotent (a
  second run replaces rather than duplicates both the `scenes` rows and
  this stage's `review_notes` row). New `build-scenes.test.ts` covers
  `parseVerseRange` and `buildScenesFromHeadings` directly (9 tests; 19
  total across the pipeline, all passing); `npm run typecheck` clean.

**Still open**: no reviewer UI, same as stage 1. A chapter whose source
.docx doesn't carry published pericope headings has no scene-boundary
strategy yet — this stage fails clearly rather than guessing in that
case, per the same "don't invent structure" principle.

## Speaker-embedding (timbre) corroboration tried, negative result — 2026-09-05

The "Real vocal isolation achieved" section above left one thing
unresolved: pitch analysis can't distinguish two same-range voices by
timbre, only by height, and the acoustic-check notes on individual
review_notes items say so explicitly ("A same-range voice actor would
look identical to pitch-only analysis, which cannot separate voices by
timbre"). Dan asked whether adding real timbre detection was worth doing.
It's a reasonable next step in principle -- a pretrained speaker-embedding
model (voice-verification tech: turn a clip into a vector, compare vectors
by cosine similarity) targets exactly the dimension pitch can't. Tried it
against the real separated vocals track before committing to building it
in for real. The result was negative, and worth recording so this isn't
re-attempted blind later.

**What was tried**: Resemblyzer (a pretrained GE2E speaker encoder,
weights bundled in the pip wheel -- confirmed it loads and runs with zero
network access, sidestepping the Hugging Face network block that affected
Demucs). Two tests against `sep_vocals.wav`:

1. Whole-segment embeddings for every stage-1 segment ≥1.5s, grouped by
   attributed speaker (Jesus, narration, Crowd, Scribe). Within narration:
   mean cosine similarity 0.911. Within Jesus: 0.934. Cross narration-vs-
   Jesus: 0.904 -- essentially the same as the within-group numbers. No
   usable separation margin.
2. Fine 2-second windows straddling several boundaries the hand-authored
   decisions (and, for the 76.458s one, Dan's own ear) already treat as
   real speaker changes, compared against 2-second windows placed inside
   a single continuous quotation/narration stretch (no change expected).
   Real-boundary similarities: 0.637, 0.795, 0.748, 0.679 (mean ~0.71).
   Same-speaker control similarities: 0.772, 0.726, 0.749, 0.857, 0.643
   (mean ~0.75). The two distributions overlap heavily -- one same-speaker
   control (0.643) scored lower than three of the four real transitions.

**Conclusion**: off-the-shelf speaker-verification embeddings, at either
whole-segment or fine-boundary resolution, don't cleanly separate these
voices in this recording. Likely reasons, not confirmed: (a) Resemblyzer
is trained on cross-session data (VoxCeleb-style: the same speaker
recorded on different mics/rooms/days) where recording-condition variance
is normally much larger than it is here -- one continuous single-session
recording removes exactly the variance the model learned to key off, so
speaker identity may be a weaker signal here than it is in the model's
own training distribution; (b) residual Demucs separation artifacts
likely affect the whole vocals track fairly uniformly, adding shared
noise that a same-session comparison can't average away the way a
cross-session one would.

**Decision**: don't wire this into production scoring -- it would add
false confidence (or false alarms) no more reliable than the existing
pitch check, while being harder to explain in a review note. Manual
ear-confirmation (Dan working through the review queue) stays the actual
mechanism for v1, and it's already working (see the 76.458s boundary,
confirmed correct by ear in conversation). If this gets revisited later
(e.g. once per-chapter review volume makes manual confirmation the
bottleneck), the more promising next experiment is a model actually built
for single-recording diarization (e.g. pyannote's diarization pipeline,
which is trained to answer "who spoke when within this one recording"
rather than "is this the same person as in that other recording") rather
than another verification-style embedding model like this one. Prototype
script: `scripts/quote-alignment/timbre_probe.py` (not wired into any
stage; kept as a reference for whoever revisits this).
