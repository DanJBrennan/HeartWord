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

## Application shape — recommended, pending confirmation

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

## Technology stack (v1) — recommended, pending confirmation

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
- **Structured data: SQLite**, one file — see Development Environment
  below for why this needs a specific location decision, not just "a file
  in the project folder."
- **Media files (audio, images, video)** live on the filesystem in
  HeartWord's own asset area (per Assets, Versions, and Portability in
  `docs/PRODUCT_VISION.md`), referenced by path from SQLite rows — never
  stored as database blobs.

If Dan would rather use a different stack (e.g. keeping Python for the
pipeline side, as the prior BVET codebase partly did), that's a
straightforward substitution at this stage and worth saying now rather than
after implementation starts.

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

Not full schema/DDL — the entities and relationships a v1 implementation
needs, expanding the list already named in Assets, Versions, and
Portability in `docs/PRODUCT_VISION.md`:

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

One TypeScript interface per media type, with exactly one adapter
implementation per type for v1 (per the confirmed v1 scope):

```ts
interface VideoProvider {
  generateDraft(request: ShotRequest): Promise<GenerationResult>;
  generateFinal(request: ShotRequest, draftRef?: AttemptId): Promise<GenerationResult>;
}
// ImageProvider, VoiceProvider, LipSyncProvider follow the same shape:
// a draft/final split even if v1 only calls the final path, so the Draft
// Room's cost-tiering (deferred, see CURRENT_GOAL.md) is an additive call
// pattern later, not an interface change.

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
checks that can produce it.

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

Recommendation: keep the git repo (source code, docs) on OneDrive as today,
but point HeartWord's runtime data — the SQLite file and the generated
asset area — at a local, non-synced path (e.g. outside the OneDrive tree
entirely), configured via an environment variable rather than hardcoded, so
moving it later is a config change. `docs/NON_GOALS.md`'s asset-area
principle (a dedicated area, not dependent on one deployment's folder
layout) already supports this; this just makes the OneDrive-specific reason
explicit before it causes a real problem instead of after.

## Open implementation questions

- Specific lip-sync engine and video/image/voice providers for the v1
  adapters (see Generation Providers, Models, and Cost in
  `docs/PRODUCT_VISION.md` for current starting preferences).
- Hosting/compute for GPU-heavy stages, if any v1 provider needs local
  rather than API-hosted generation.
- Whether the local web app's backend and frontend run as one process or
  two during development (a detail for implementation, not a design
  decision this document needs to fix).
- Exact SQLite schema/migrations — the data model above is the shape, not
  the DDL; that belongs in `src/db/` once implementation starts.
