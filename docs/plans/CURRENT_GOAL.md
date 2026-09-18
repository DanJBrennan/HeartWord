# Current Goal

## Mark 3 has five source paragraph titles, not two (2026-09-18)

The Hatam and English ESV Mark 3 source docx files both confirm five
paragraph titles, matching English section-heading placement: before v1
("A Man with a Withered Hand"), before v7 ("A Great Crowd Follows Jesus"),
before v13 ("The Twelve Apostles"), before v20/22 ("Blasphemy Against the
Holy Spirit" — already the recorded `Yesus kin Beelzebul` hold), and before
v31 (already the recorded `Yesus nipmem kin nikinjoi bat nya` hold). Only the
last two had recorded review evidence before this pass. The first three had
none, and the audio segments around them show no separate interval for
title material, so their spoken status was unconfirmed. The before-v7 title
also has no parenthesized cross-reference in the source text, unlike the
other four, which the existing editorial-classification schema does not yet
have a slot for (it requires non-empty cross-reference text).

Dan manually reviewed the audio at the before-v1 title's expected position
(2.99-18.62s, spanning the automated `mark 3:1-2` match) and confirmed the
narrator skips the title and its cross-reference entirely, starting directly
on verse 1. This is a different kind of finding than the two existing holds:
it is not spoken material awaiting a film-treatment decision, but a
confirmation that no title audio exists here at all. No correction or
classification record was created because none of the existing schemas
represent a "confirmed not spoken" finding, and the automated `mark 3:1-2`
match already accurately reflects the audio with nothing to carve out.

Dan also reviewed the before-v13 title's expected position (168.0-181.27s,
spanning the end of the automated `mark 3:12` match through the end of the
automated `mark 3:13` match) and confirmed the title and its reference
(Mat. 10:1-4; Luk. 6:12-16) are likewise not spoken there. Same conclusion:
no correction needed, the automated v13 match already reflects the audio.

Dan also reviewed the before-v7 title's expected position (88.0-106.80s,
spanning the end of the automated `mark 3:6` match through the end of the
automated `mark 3:7-8` match) and confirmed it too is not spoken. This
retires the open question of how to record a title with no cross-reference
text (the schema gap noted above) since there is no spoken material to
record for it.

All three previously unreviewed Mark 3 titles (before v1, v7, and v13) are
now confirmed by Dan's manual listening to be unspoken in this FCBH
recording. Only the two already-recorded titles (before v20/22 and before
v31) are actually voiced, and those remain the two producer-confirmed
editorial review holds described below, unchanged by this pass.

## Mark 3 original-reading alignment coverage complete (2026-09-18)

Every original-reading interval in Mark 3 now carries either a 100%-confidence
automated text match or a named human-reviewed record — no interval remains
at legacy/unresolved status. The last open gap, `399.191–413.645s`, was
closed by Dan's manual listening and recorded as a single append-only
correction (`Mark 3:32-33`) covering the full span: the Mark 3:32 quotation
(`Andigpoi e...bit Na`, 399.191–406s), the Mark 3:33 narration lead-in
(`Yesus buhup`, 406–408s), and the Mark 3:33 quotation (`Ningat ne
dipmem...ritou nya i?`, 408–413.645s). The correction's evidence field
preserves Dan's exact sub-boundary timestamps even though the interval
remains one recorded segment; the tooling does not yet support splitting one
automated interval into multiple reviewable rows, so finer per-clause
boundaries were not created.

The two producer-confirmed narrated editorial intervals below remain
deliberate review holds pending Dan's film-treatment decision; they are not
part of this coverage milestone and are not resolved by it.

## Mark 3 narrated editorial alignment review (2026-09-18)

Mark 3 now retains two producer-confirmed narrated editorial intervals as
append-only, artifact-bound classifications: `259.262–273.262s` is the
`Yesus kin Beelzebul` title with `Mat. 12:22-32; Luk. 11:14-23, 12:10`, and
`371.645–385.645s` is a mixed transition containing `Yesus nipmem kin
nikinjoi bat nya` with `Mat. 12:46-50; Luk. 8:19-21` before Mark 3:31.
Neither is silently treated as Scripture or safe-to-omit material. The
mixed span deliberately has no invented split boundary; its automated
Mark 3:29–31 span is retained as evidence while its film treatment remains
held for human review.

The source-alignment view surfaces this as human-reviewed title/reference
material, including the title, citations, next Scripture marker where known,
and retained automated span. Re-ingestion remaps these append-only records
only to an exactly equivalent original interval, just as verse corrections;
otherwise it fails safely rather than orphaning review evidence. A future
provider-authorized title-aware alignment may produce finer boundaries, but
these classifications must remain review evidence and do not authorize a
provider call, asset generation, boundary shift, or source-audio change.

## Chapter-scoped canon readiness (2026-09-17)

The character-canon browser is now collapsed by default only when a selected
chapter has a planned cast whose every needed character has both approved
canon status and an approved version. A read-only project readiness projection
uses planned shot-character links, not the global browser, so a fresh chapter
states that needs will be checked after storyboard planning rather than
claiming readiness. Any missing or unapproved needed character expands the
section and names the gap. This changes no character, approval, casting, or
production record.

## Chapter-preparation entry point (2026-09-17)

The active chapter workspace now exposes one producer-facing **Start ingestion
and chapter preparation** control. It calls the existing durable orchestrator,
prevents duplicate submissions, and shows every returned stage result and any
truthful review pause. It refreshes the selected chapter's persisted state
afterward; it does not bypass source attestation, durable holds, candidate
review, or provider boundaries. The Reusable Media Library remains intact but
is collapsed by default behind a disclosure control so it does not obscure the
normal chapter-start workflow.

## Source-catalog migration (2026-09-17)

The immutable HeartWordData corpus is now the normal source convention rather
than a per-chapter copied runtime folder.  Stage 1, source review, scene
breakdown, and the durable ingestion signature resolve Hatam chapter text,
the default FCBH Non-Drama master, and the matching English ESV text directly
from the catalog.  A `project_source_bindings` row records the selected
relative paths, edition, hashes, and catalog/legacy provenance; changing a
bound source file holds reuse rather than silently reusing dependent work.

The FCBH Drama edition remains a bounded catalog selection, while Non-Drama
is the default.  Generated media and Demucs stems are outside discovery.
Existing legacy Mark 2-style paths remain readable for compatibility.  The
catalog reports missing required inputs (including Genesis's absent FCBH
audio) without copying or modifying source files.  Focused catalog tests
cover fresh Mark 3 resolution, the default edition, missing-source handling,
no-copy behavior, and binding invalidation. Full validation: 47 Vitest files
and 284 tests, strict typecheck, and web build pass.

## Durable recovery hardening (2026-09-16)

Completed executions are now reused only when their stage outputs still exist:
source-review evidence, planned scenes/shots, accepted media/clip records, and
referenced files are checked. Signatures include the approved canon
assets/versions and approved speaking voice/binding identity; a signature
query error is surfaced rather than becoming a reusable cache key. An
exception after work begins is retained as `uncertain`, and only the current
lease owner may update project state.

`POST /api/projects/:id/adopt-recovered-pipeline` is a producer-named recovery
action for old/manual chapters. It records only locally validated persisted
outputs, does not call a provider, and cannot approve candidates. Ingestion
and scene breakdown now hold rather than delete producer source reviews,
utterance bindings, accepted clips, or human review records.

This is not a claim that a chapter can proceed without human source approval:
unresolved alignment evidence remains a truthful hold. The isolated real-media
fresh-chapter proof and evidence evaluation remain open verification work.

## Architecture overhaul in progress (2026-09-16)

The chapter runner now records durable stage executions with input and upstream
dependency hashes, attempts, worker tokens, outputs, and explicit recovery
holds. It reuses a valid completed stage, scopes reruns to changed inputs and
their downstream dependencies, and refuses to blindly retry a running or
uncertain execution. This remains a single-machine, single-producer workflow;
it does not add a queue or alter accepted takes, manual edits, source audio,
or provider billing records.

Stage 5 now calls the existing composite cast-master work and only submits
Kling lip-sync for planned on-camera dialogue with an accepted keyframe,
approved cast voice, and aligned cast-master speech. Narration is explicitly
excluded. Missing prerequisites create a producer-reviewable hold before any
new provider request. A completed provider response is now retained as a
costed `hold_for_review` candidate, never automatically marked accepted or
placed into a clip; a same-character/same-verse ambiguity is held until an
exact utterance interval is persisted. This implementation has not been run
against Mark 2 or Mark 4 and has made no paid call.

The executable crew dispatcher now derives its production roster from the
single role registry, while independent challengers remain explicitly outside
production-direction authority. The evaluation ledger now links immutable
human-adjudicated evidence to retained records, imports/exports versioned
predictions atomically, detects protected regressions and held-out training
leakage, and reports small factual samples as insufficient. The documented
CLI is `npm run evaluate:reviewed-evidence --`. It cannot deploy a model or
change anyone's authority. Remaining architecture work includes persisting a
per-shot utterance binding, complete non-speaking video generation through the
ordinary stage, and end-to-end isolated fresh-chapter resume testing.

## Production interaction monitor and correction reuse (2026-09-16)

The selected chapter's Production Crew panel now polls recorded production events and director negotiations, shows active/completed/held/error state, scoped verse/shot context, producer-input holds, and links each event to the existing expandable full structured role contribution. It is not presentation dialogue or hidden reasoning. Producer guidance remains durable; explicit reusable guidance can be stored as an active scoped lesson, while candidate/disabled/superseded states preserve history and prevent accidental broad reuse. Active lessons are supplied to future crew briefs only for the same project, matching book, or explicitly broad language/region/global scopes. This is inspectable application memory and adaptive guidance—not model training or a guarantee of automatic generalization.

Runtime boundary: multi-role crew contributions and logs are implemented; full named-role dispatch, generic voice/lip-sync stage wiring, and universal milestone challenger dispatch remain declared work. Human language, field, and release approval remain mandatory where required.

## Active status: Mark 2 timing integration (2026-09-11)

Implementation handoff: Dan prefers Sonnet 5 at Medium for the next coding
work to conserve usage. The bounded starting task and branch details
are in [MARK_2_AUDIO_IMPLEMENTATION_HANDOFF.md](MARK_2_AUDIO_IMPLEMENTATION_HANDOFF.md).

Dan agreed to connect the crew to the existing Mark 2 edit before a soundtrack
trial. Recovered 62 source-clip placements in the saved film, separately
exported the newer Blender edit, and compared all 24 aligned source intervals.
The observed timing and findings are now in the production edit history and
crew brief/UI. See [the timing audit](../production/hatam-mark-2/TIMING_AUDIT_2026-09-11.md).

The film cannot yet receive an approved completeness manifest: five narration
intervals totaling 120.891 seconds have no matches; the healing narration is
partial; the forgiveness line begins in the original voice before its dub;
and the crowd/Mark 2:19–22 audio requires source-version reconciliation.
The two apparently missing assemblies exist with accepted attempt records,
but their clip links are absent. The newer Blender edit differs from the
saved film, so its timing was not misapplied to that film.

The import now distinguishes observed incomplete timing from verified full
coverage. Observations enable specific crew review without allowing approval,
soundtrack generation or automatic finishing; file/source changes invalidate
them. Existing film and Blender hashes are unchanged. No paid calls were made.
All 206 tests plus three Python waveform tests pass; frontend build/typecheck
pass, and the 21 pre-existing server type errors remain unchanged.

Next production step: prepare a separate corrected cut using the newer edit,
restore/reconcile the complete audio before score generation, and explicitly
plan the extra picture coverage needed to fit narration without overlapping
dialogue. This audit preserves existing media rather than silently rebuilding
or claiming that timing metadata repairs the film.

## Active status: coordinated filmmaking roles (2026-09-11)

Dan authorized design and implementation of the Creative/Production Director
and filmmaking-role improvements, then clarified the music/audio behavior:
retain the FCBH performance and ElevenLabs character voices, allow breathing
room and opening context views, and have a Composer direct Google-generated
instrumental music. ElevenLabs supplies the initial sound-effects adapter.

Implemented on `codex/film-role-workflow`, incorporating the existing Critic
fix branch (including `23f3d05` and its subsequent fixes). See
[`docs/design/production-crew.md`](../design/production-crew.md) for role
ownership, shared context, budgets, review gates, provider choices and limits.

- Separate specialist calls share exact source/reference text, measured
  audio, approved canon, the chapter shot plan and scoped producer guidance.
  A Production Director resolves disagreements through a bounded revision
  pass; unresolved findings and malformed reviews cannot become approval.
- Existing storyboard reruns preserve shot IDs, accepted takes and history.
  Approved directions feed keyframe handoffs and directed new-shot generation;
  changed plans invalidate prepared handoffs. New gap ideas use exact shot and
  character identities and the normal Critic/attempt/clip path.
- Picture editing protects source duration/order while allowing deliberate
  introductory and reaction pauses. Cut review actually views/listens to an
  audiovisual proxy. Typed color and soundtrack plans create new renders.
- Composer and Sound Designer requests reserve paid attempts, retain
  provider usage and failures, independently review generated audio, and reuse
  completed requests. Revised mixes start from the clean base film.
- The producer panel shows the current cut, role exchanges, findings,
  timed cue requests, audio previews, generation history and saved guidance.
  It can recover a review whose worker has stopped and import timing from
  an existing hand edit.

Validation: all 202 tests pass, including deterministic providers, temporary SQLite/assets, real FFmpeg
audio/timing checks, an isolated browser fixture and a read-only snapshot of
the real Mark 2 data. No paid generation calls or production render changes
were made during implementation. The snapshot loads all 28 shots and 23
approved canon identities, resolves the saved group-spokesperson relationship,
and preserves three otherwise unassigned intervals of the original recording.
The frontend build and frontend typecheck pass. Full server typechecking still
reports the pre-existing script/QC/casting errors; no new implementation file
appears in that error set.

Production adoption limit: the current hand-edited Mark 2 film has no saved
source-to-production timing map, and only 26 of its planned shots currently
have accepted assembled clips in the database. Its supplementary footage
also lives in the manual editor/scripts. Review is available; automatic
finishing requires timing import, and its picture edit stays in that editor
until the supplementary footage is represented. This work does not claim a
new rendered chapter or completion of the older generic voice/lip-sync stub.
Full Critic evidence weighting and an approved/rejected image benchmark are
still the separate evaluation work deferred in the earlier review.

Goal Guardian acceptance: this extends existing stages and preserves Dan's
watch–correct–rerun workflow, approved canon and the complete source
performance. It introduces no new narrative, translation, provider-generated
speech or replacement editor. Current production state remains intact.

## Previous status: Codex keyframe handoff, Hatam Mark 2 (2026-09-08)

Dan asked Codex to take over keyframe generation, beginning with Scene 1,
Shot 1, and to retain production status/prompts for continued work. The
existing pipeline remains the product; video generation/provider changes
have not been requested as a concrete implementation yet.

Implemented an additive stage-4 handoff (`scripts/keyframes.ts`): immutable
prompt/source/canon briefs, original-pixel reference contact sheets for the
tool's five-image input limit, per-shot status from SQLite, and non-destructive
PNG import into existing generation attempts and review notes. References
are checked for approval, region and file integrity. Stale briefs are blocked.
Every new take gets its own filename and provenance JSON. Built-in-tool
model/billing information is explicitly unreported, not inferred.

Scene 1 Shots 1–7 now each have a Codex-generated review candidate, imported
non-destructively through the keyframe handoff. Dan accepted Shots 2–4; the
new producer-accept command records that decision and resolves only the
candidate's own pending review note. Their prompt, rationale and review files
live under `docs/production/hatam-mark-2/scene-01-shot-0*/`.
Shot 3 received a second generation after the first drifted to an unsuitable
lakeside panorama; only the corrected candidate is recorded for review. The
shared scene lighting default describes an interior/later roof opening,
conflicting with Shot 1's exterior/intact-roof instructions; that shot's prompt
resolves the conflict without rewriting the scene or chapter plan.

Current production status: all 28 planned Hatam Mark 2 keyframes have an accepted latest Codex attempt. The producer approved the remaining Scene 1 and Scene 3 candidates on 2026-09-08, with explicit overrides recorded for Critic concerns where needed. The external handoff now requires `keyframes.ts critique <attempt-id>` before a candidate is presented: it runs the grounded Critic, scene fidelity, and canon-reference likeness checks while retaining producer control over acceptance.
See `docs/production/CODEX_HANDOFF.md` for the repeatable workflow and existing
integration limits. Prior uncommitted Claude work is preserved. All 100 tests
pass (90 existing + 10 new); the live shots API returns the new candidate.
Full typechecking currently reports pre-existing errors in
QC/casting/provider and scratch/character scripts.

The sections below are historical implementation notes. In particular, the
project DB row still says ingestion/not_started and the old "Next up" section
predates subsequent QC wiring; neither is a reliable per-shot production status.

## Historical status: vision and design complete; scoping the architecture request (2026-09-04)

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

## Stage 1 (ingestion) completed for real for Mark 2 (2026-09-05)

Closed the gap the "Next up" list below used to describe: the quote-
alignment R&D work (version-1/2/3 reports) is now wired into the real,
database-backed `runIngestion` for Hatam Mark 2 specifically, not just
sitting in text reports. `audio_segments` now has real
`speaker_character_id` values, real per-segment confidence scores, and a
`review_notes` row per segment needing a language specialist's
confirmation (20 of 21) -- verified against the real imported project,
not synthetic data. See `docs/ARCHITECTURE.md`'s "Stage 1 completed for
Mark 2" section for the full writeup, including a real overlap bug this
surfaced and fixed (q3/q4's independent timing estimates conflicted by
~8.7s) that the report-only version never caught. This is still
Mark-2-specific by design (see that section) -- a future chapter needs
either its own hand-authored decisions or a general algorithm, neither of
which exists yet.

Reviewer UI is still the one piece of "Next up" below that's genuinely
unchanged: the 20 flagged segments are real database rows now, not text
report lines, but there's still no UI for a human to act on them --
querying `review_notes` directly is still how you'd see them today.

## Stage 2 (scene breakdown) completed for real for Mark 2 (2026-09-05)

`runSceneBreakdown` is no longer a stub. It groups stage 1's real
`audio_segments` into scenes using the source .docx's own published
pericope headings (a new `parseSourceHeadings()`) as scene boundaries —
following the translation's already-published structure rather than
inventing a narrative breakdown, per NON_GOALS.md. Unlike stage 1, this
stage is chapter-agnostic by design, not Mark-2-specific — it just needs
a source .docx with published section headings, which is a translation
publishing convention, not something particular to Mark 2.

Verified against the real Mark 2 project: 4 scenes (Mark 2:1-12, 2:13-17,
2:18-22, 2:23-28) matching the four standard synoptic pericope divisions,
correctly grouping all 21 real audio segments with correct per-scene
speaker attribution, and 3 boundary-straddling narration segments (one at
each pericope seam) correctly flagged in `review_notes` for human
confirmation rather than silently misassigned. Idempotent, fully tested
(9 new tests), typecheck clean. See `docs/ARCHITECTURE.md`'s "Stage 2
(scene breakdown) implemented for real" section for the full writeup.

## Timbre-based speaker corroboration tried, negative result (2026-09-05)

Dan asked whether a real voice-timbre check could replace/supplement the
pitch-only acoustic corroboration (which admittedly can't tell apart two
same-range voices). Prototyped it with Resemblyzer, a pretrained speaker-
embedding model that runs fully offline. Result: no clean separation,
either comparing whole segments by attributed speaker or comparing short
windows straddling known-real boundaries against same-speaker controls --
the numbers overlap too much to trust. Not wiring this into production
scoring. See `docs/ARCHITECTURE.md`'s "Speaker-embedding (timbre)
corroboration tried, negative result" section for the full numbers and
reasoning, and `scripts/quote-alignment/timbre_probe.py` for the kept
prototype. Manual ear-review (the review queue) stays the mechanism for
v1; a diarization-purpose-built model (e.g. pyannote) would be the more
promising thing to try if this gets revisited later.

## Jesus canon assets corrected: legacy v1 files were live in production (2026-09-05)

Cross-checked HeartWord's `character_assets` rows for Jesus against the
OpenAI-Code Comics character library's own `PROVENANCE.md` (sha256 hash
comparison) after Dan pointed to the real source folders. Found the
`headshot` (feeds Kling's Avatar API) and the neutral-standing `body_pose`
were both stale legacy v1 files -- v1's close-up was originally
cross-region-contaminated from "Horn of Africa" canon -- while active,
producer-approved v2 versions existed and were readily available. Fixed:
copied the v2 files into HeartWordData, updated the two DB rows, backfilled
`imported_from` on all six of Jesus's asset rows (previously NULL
everywhere -- a real provenance gap), and republished the Mark 2 Canon
Board artifact with the corrected headshot. See ARCHITECTURE.md for the
full writeup. Not yet checked: whether the same v1/v2 mismatch exists for
other characters.

## Voice-casting UI added (2026-09-05)

Built a real "Voice casting" section in the web app (not a mockup):
`GET /api/voices` (`src/server/routes/voices.ts` + `src/server/providers/
elevenlabs.ts`) calls ElevenLabs' `GET /v2/voices` and returns every voice
on Dan's account; the UI lists each character with a filterable dropdown
(text filter, since ElevenLabs has no native "voice group" API object --
Dan's "BVET" set is whatever he's organized in his own account/labels, so
this can't query it directly) plus an audio preview and an Approve
button. Approving calls `PATCH /api/characters/:id/voice`, which writes
`voice_provider`/`voice_id` onto that character's current
`character_versions` row -- the same columns seeded NULL for all 9
characters. Jesus's dropdown pre-selects "Brian" by name match (Dan's
already-decided voice) so approving him is one click.

Not yet done: the actual re-voicing (speech-to-speech) call once a voice
is approved -- this UI only covers audition/selection/approval, per the
VoiceProvider interface split in ARCHITECTURE.md. Also untested against
the live ElevenLabs API in this environment (both the cloud sandbox and
the device shell used for this session have no network path to
api.elevenlabs.io -- blocked by egress policy on both), so it hasn't been
run against real data yet; it should work once Dan runs the server
locally with `ELEVENLABS_API_KEY` set in `.env`, where his machine's
normal internet access applies.

## Voice casting complete for Mark 2's three speaking characters (2026-09-06)

Dan used the new Voice casting UI to pick and approve ElevenLabs voices
for all three characters who actually speak in Mark 2 (per the
spoken_segment_count check added the same day): Jesus, the Principal
scribe, and the Crowd. All three now have voice_provider='elevenlabs'
and a real voice_id in character_versions -- verified directly against
the database. The four Friend characters, the healed paralytic, and
Matthew/Levi correctly have no voice mapped, since none of them have any
attributed lines in this chapter.

Next real blocker for stage 5 (voice & lip-sync) is building the actual
re-voicing call (ElevenLabs speech-to-speech on stage 1's
original_reading segments) -- the casting UI only covers audition/
selection/approval, not generation yet.

## Composite cast master generation built (2026-09-06)

Built the audio half of stage 5 (voice & lip-sync) as its own standalone
piece -- src/pipeline/voicing/index.ts -- rather than folding it into
src/pipeline/voice-lipsync/index.ts, since the lip-sync half of that
stage still needs a scene keyframe from stage 4 (media generation),
which doesn't exist yet. Triggered via `POST /api/projects/:id/voicing`
and a "Generate composite cast master" button in the web app (Composite
cast master section, below Voice casting):

- Narration segments carry through from the original reading unchanged
  (re-encoded into their own clip file via ffmpeg for a consistent
  one-file-per-segment layout).
- A segment whose speaker has an approved ElevenLabs voice gets
  re-voiced via speech-to-speech (src/server/providers/elevenlabs.ts's
  reVoiceAudio) -- the real Hatam performance clip in, that voice out.
  Uses eleven_multilingual_sts_v2 since the source audio is Hatam.
- A segment whose speaker has no approved voice yet is carried through
  unvoiced and flagged in review_notes, rather than blocking the run.
- Costs real ElevenLabs credits per re-voiced segment, so any segment
  whose output file already exists is reused rather than regenerated.
- New GET /api/projects/:id/audio-segments?layer=... lists a layer's
  segments; /media now serves HeartWordData/assets statically so the web
  app can play the resulting clips directly.

Not tested end-to-end yet -- this session's shells have no network path
to api.elevenlabs.io (same restriction hit during the voice-casting
work), and node_modules being Windows-targeted now (correctly, for Dan's
machine) means this session can't even start the dev server to check the
ffmpeg/DB wiring live. Verified separately: TypeScript compiles clean,
and the exact ffmpeg extraction command was smoke-tested directly against
the real vocals.mp3 (produced a correct ~7.5s clip). The real first run
needs to happen on Dan's machine.

## Casting & direction (stage 3) built (2026-09-06)

Implemented src/pipeline/casting/index.ts: for each of Mark 2's 4 scenes,
one Gemini call (gemini-2.5-flash, via the new src/server/providers/
gemini.ts) grounded in the chapter's real English reference text
(assets/reference/english/mark-2/mark-2-text.docx -- an LLM can't read
Hatam directly, and NON_GOALS.md rules out inventing narrative content,
so the English reference is the actual source of truth handed to the
model, not the Hatam source or a free-form request). The prompt also
tells Gemini which characters stage 1 already confirmed as speaking in
that scene, and the full approved canon character list with their notes,
and asks for a shot-by-shot breakdown -- action plus which canon
characters are visible -- as schema-constrained JSON
(responseSchema/responseMimeType). Writes to `shots`, `shot_characters`,
and `scenes.reasoning`. Idempotent (clears this project's shots before
regenerating). A character name Gemini returns that doesn't exactly
match the canon list is dropped from that shot and flagged in
review_notes rather than silently kept -- catching a hallucinated name
is exactly the kind of thing AGENTS.md's stage-reasoning-logging
convention is for.

Wired up via POST /api/projects/:id/casting and GET /api/projects/:id/
shots, plus a "Casting & direction" section in the web app (above Voice
casting, matching pipeline order) with a generate button and a per-scene
list of planned shots.

Verified as far as this session's tools allow: TypeScript compiles
clean, and running the module directly (`node --import tsx`, after
adding the platform's esbuild/rollup optional packages locally so tsx's
transform would even load) confirmed every step up through prompt
construction -- project/scene/character loading, the verse-range overlap
match between scenes and stage 1's speaker attribution, pulling the
correct English verses per scene -- works correctly, then fails cleanly
at the actual Gemini network call (blocked from this session, same as
the ElevenLabs and prior Gemini-adjacent restrictions) with no partial
DB writes (transaction rolled back). The real first run needs to happen
on Dan's machine.

Dan also added OPENAI_API_KEY to .env (2026-09-06) as an available
alternative -- not yet used anywhere; stage 3 still calls Gemini per
PRODUCT_VISION.md's existing provider preference. Worth asking Dan
whether he wants OpenAI used instead/as well before building anything
else against it.

## Fixed: docx parsing depended on the `unzip` CLI, missing on Windows (2026-09-06)

Dan's first live run of the new casting UI failed immediately with
`spawnSync unzip ENOENT`. Root cause: parse-source-text.ts's
readDocumentXml shelled out to the `unzip` command-line tool to read a
.docx's word/document.xml, on the assumption it's "a preinstalled system
tool" -- true on Linux, where every prior test of stages 1-3 happened to
run (this session's device bridge), but not true on native Windows,
where Dan actually runs the app. This was a latent, pre-existing bug in
ingestion and scene breakdown too, not something new to casting --
casting was just the first stage whose first real run happened to be on
Dan's own machine after `unzip`-independent testing had masked it
everywhere else.

Fixed by replacing the `unzip` shell-out with a small dependency-free ZIP
reader (src/pipeline/ingestion/simple-zip.ts) that reads the End-Of-
Central-Directory record and Central Directory entries directly and
inflates the target entry with node:zlib -- no external tool, no new npm
dependency (keeping the same "avoid native-module install risk" goal the
`unzip` approach was originally chasing), works identically on every
platform. Verified byte-for-byte identical output against the real
`unzip` CLI on both the Hatam and English reference docx files, and
re-ran the full test suite (19/19 still passing) plus a direct run of
the casting module, which now gets all the way through docx parsing and
fails only at the (expected, from this session) Gemini network call.

## Fixed: gemini-2.5-flash retired, switched to gemini-3.6-flash (2026-09-06)

Dan's first real "Generate shot plan" click got a 404 from Gemini:
"This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.6-flash." Swapped
GEMINI_TEXT_MODEL in src/server/providers/gemini.ts accordingly --
generateContent's request/response shape (including responseSchema/
responseMimeType) is unaffected, just the model string. Not yet
confirmed this actually produces a good shot plan -- that's the next
thing to check once Dan re-runs it.

## Camera language added to stage 3 (casting & direction) (2026-09-06)

Closed a real gap Dan flagged: stage 2's own docstring already scoped
"staging, camera, or action content" as stage 3's job, but the first build
of stage 3 only delivered action + which-characters, not the cinematography
half. Extended `shots` and `scenes` (new columns, additive migration in
`src/db/client.ts` so Dan's existing Mark 2 data upgrades in place -- verified
against the real database, integrity check clean, existing rows intact) and
`src/pipeline/casting/index.ts`:

- Every shot now gets a `verse_ref`, a `framing` (wide/medium_wide/medium/
  medium_close/close_up/insert), and a `camera_movement` (static/push_in/
  pull_out/pan_left/pan_right/tracking/handheld_follow) from the same Gemini
  planning call, validated against the known enum (falls back to medium/
  static and flags it in review_notes rather than writing an unrecognized
  value).
- Each scene now gets one `lighting_continuity` note (time of day, light
  source, interior/exterior) meant to be threaded into every shot's stage-4
  generation prompt so a scene's shots share one lighting decision instead
  of each reinventing it and drifting.
- Lip-sync forces framing: a shot can only be flagged `needs_lip_sync` with
  a named `dialogue_character_id` if its framing is medium_close/close_up/
  insert -- Kling's Avatar API needs a clear view of the mouth. Gemini's own
  answer isn't trusted blindly here; `src/pipeline/casting/coverage.ts`'s
  `validateFraming` tightens a too-wide framing and flags the correction,
  the same distrust-and-flag pattern already used for hallucinated character
  names.
- Coverage detection for long dialogue: a lip-synced shot's REAL dialogue
  duration is computed from stage 1's actual measured `audio_segments`
  timing (not a guess), and `coverage.ts`'s `planCoverage` flags anything
  longer than Veo 3.1's ~8s single-clip ceiling as needing a `covered_sequence`
  rather than one long lip-synced take -- concretely, a wide master (no
  lip-sync) plus tight lip-synced inserts on the emphasis lines plus
  cutaways to listeners, all under one continuous dialogue audio segment
  (an L-cut). This stage only detects and records that need
  (`shots.coverage_plan`/`coverage_notes`); building the actual multi-clip
  sequence is stage 4/5's job once media generation exists -- `clips` is
  already a separate table from `shots` for exactly this reason.

New pure-logic module `src/pipeline/casting/coverage.ts` (11 new tests,
same separation-from-DB-glue pattern as `scene-breakdown/build-scenes.ts`).
Full suite still green (30/30), typecheck clean. Not yet run against a real
Gemini call with the new prompt fields (same network restriction as every
other Gemini-adjacent change this session) -- Dan's next "Generate shot
plan" click on Mark 2 will be the first real run and will re-populate the
existing shots (casting is idempotent) with the new camera fields.

## Character canon expanded to the other eleven disciples (2026-09-06)

Dan asked to expand the canon beyond Jesus/Matthew. The OpenAI-Code Comics
video character library already had a full production-ready package for
every one of the Twelve under precisely disambiguated names (matching
canonical-characters.md's naming-safety rules, e.g. "Philip the Apostle" vs.
"Philip the Evangelist", "James son of Zebedee" vs. "James son of Alphaeus")
-- this was an import task, not a from-scratch creation task, same shape as
the original Jesus/Matthew import.

Imported all 11 remaining disciples as `scope_kind = 'global'` canon
characters (so they're automatically available to Mark 2's casting stage
today, and to every future chapter, without any code change --
`src/pipeline/casting/index.ts`'s canon-character query already includes
every global-scope character): Peter, Andrew, James son of Zebedee, John
son of Zebedee, Philip the Apostle, Bartholomew, Thomas, James son of
Alphaeus, Thaddaeus (Jude), Simon the Zealot, and Judas Iscariot. Each got
the same headshot + 4 motion-pose package as Jesus/Matthew, copied into
`HeartWordData/assets/characters/<slug>/` and sha256-verified against each
character's own `PROVENANCE.md` after copy (not just trusted). 55 new
character_assets rows total (5 each), verified idempotent (a second
`db:seed-characters` run inserted nothing), integrity check clean.

Two real provenance findings surfaced while doing this, both handled rather
than silently papered over:

- **Peter has an explicit, documented v1->v2 promotion** (headshot +
  neutral-standing, exactly like Jesus's case) -- imported the v2 files,
  correctly this time, verified against PROVENANCE.md's stated hash.
- **John son of Zebedee has an *undocumented* v2 candidate set** sitting on
  disk (headshot + all 4 motion poses) that PROVENANCE.md never mentions or
  records as approved -- unlike Peter's case, there's no recorded promotion
  decision for it (see canonical-characters.md's non-destructive-evolution
  rule: a promotion must be a recorded decision). Imported v1 for John,
  matching what's actually documented as approved, and left the orphaned v2
  set as an open question for Dan rather than guessing which one he meant --
  worth a look next time he's touching the character library.

Also fixed a latent bug the last Jesus correction (2026-09-05) left behind:
that fix updated the live database directly but never touched
`import-manifest.json`, which still listed the old v1 paths/hashes under a
version_label that already said 'v2' -- a future `npm run db:seed-characters`
re-run would have matched by path, found no existing row for the (still-v1)
manifest path, and silently re-inserted the stale legacy asset alongside the
corrected one. Manifest now matches the live DB.

One open consideration, not yet acted on: casting's canon-character list for
a project now includes all 20 characters (9 original + 11 new), not just
the ones relevant to that chapter's text. Mark 2 doesn't name any of these
eleven, so they shouldn't appear in its shot plans, but it's worth watching
whether a future casting run ever attributes one of them to an unnamed
"his disciples" reference the text doesn't actually specify by name --
NON_GOALS.md already scopes this correctly, but a larger canon list is a
larger surface for that particular mistake.

Not yet done: voice mapping for any of the eleven (correctly -- per
character-tool.md, voice mapping is only raised as a gap when a specific
chapter's shot plan actually gives a character a line; none of these eleven
speak in Mark 2). Notes on each character record which ones are expected to
need a voice eventually, based on a review of individually-attributed lines
in the Gospels/Acts -- flagged in each character's `notes` field as a
first-pass read, not a verified text search, the same caveat given to Dan
directly when this research was first done.

## Character canon hierarchy formalized: Global/Book scope, Groups, spokesperson (2026-09-06)

Dan asked for two corrections after the disciple import: (1) follow the
Global/Book character hierarchy already established in OpenAI-Code Comics'
own library structure (`Global Character Library` vs. per-book libraries
like `Mark Character Library`), and represent groups (a crowd, the
Pharisees and scribes) as 4+ distinct individual designs that get cloned to
fill out a crowd, with exactly one spokesperson and other members limited
to non-verbal utterances; (2) redo the disciple voice-need research to
check for ANY speaking role (not just solo lines) before ruling one out.

**Schema**: new `character_groups` table (itself Global/Book/Chapter-scoped,
mirroring `characters`) plus `characters.group_id` and
`characters.is_spokesperson`, with a partial unique index enforcing at most
one spokesperson per group at the database level -- verified by attempting
to violate it directly (rejected: `UNIQUE constraint failed:
characters.group_id`). Both new indexes had to be created in `client.ts`
after the column migration runs, not in schema.sql's static text -- on
Dan's already-existing database, `CREATE INDEX ... ON characters(group_id)`
failed outright before the column existed (a real ordering bug caught by
actually running it, not just reading the diff).

**`seed-characters.ts` upsert semantics reconsidered**: identity/canon
fields (name, scope, canon_status, region) and group membership are now
resynced from the manifest on every run, and so is `notes` -- but
`character_versions.status`/`voice_provider`/`voice_id` are still
insert-only, since the live voice-casting UI writes real ElevenLabs values
there that a manifest resync would otherwise silently overwrite. This
closes the exact class of bug found earlier today (a direct DB fix that
never made it back into the manifest) without reopening a worse one.

**Reclassified two Mark 2 "representative" characters** that actually stand
in for recurring, book-wide groups rather than one-chapter figures:
Principal scribe -> book-scoped (Mark, not just chapter 2), spokesperson of
a new "Mark Pharisees and Scribes" group (they object again at 2:16, 2:24,
3:6, 7:1-13...); the crowd turnaround sheet -> book-scoped, spokesperson of
a new "Mark Crowd Witnesses" group. Also linked the four already-distinct
Mark 2 friend characters into a proper "Mark 2 Friends of the Paralytic"
group (chapter-scoped, correctly at 4/4 members, no spokesperson since none
of them speak) -- they were already exactly the "4+ distinct designs"
pattern Dan described, just not yet linked as a group.

Both scribes/crowd groups are honestly flagged as incomplete: each has only
1 of its required 4+ distinct member designs today (the crowd's one asset
is itself a flattened multi-person sheet, not even a true individual
design) -- a Character Tool gap for Dan to fill later, not fabricated here.

**`casting/index.ts` made group-aware**: the canon character list Gemini
sees now tags each group member as either "spokesperson... the only member
who can carry dialogue" or "not its spokesperson... may appear and react
but never carry dialogue," and a resolved `dialogueCharacterName` that
turns out to be a non-spokesperson group member is corrected to
`needsLipSync = false` and flagged, the same distrust-and-flag pattern as
an unresolved character name. Not an active bug for Mark 2 today (both
groups currently have only their spokesperson as a member), but real once
the Character Tool gap above gets filled.

**Docs**: `docs/design/canonical-characters.md` gained "Global vs. Book
Scope" and "Character Groups" sections documenting all of this; a matching
note in `character-tool.md`'s Voice Mapping section points at the new
`is_spokesperson` field. Full suite still green (30/30), typecheck clean,
DB integrity clean, second seed run confirmed idempotent (0/0/0/0 groups).

**Disciple voice research redone properly** (Dan's second ask: check ANY
speaking role, not just solo lines) -- verified against secondary sources
via live web search rather than recalled from training, and corrected two
real mistakes from the first pass:
- **James son of Zebedee**: previously written off as "likely doesn't need
  a voice" because he never speaks solo. Corrected -- he DOES have a
  speaking role, always jointly with John (Mark 10:35-37, Luke 9:54, both
  "James and John" asking something together). A joint line still needs
  his voice. Now marked as needing voice mapping.
- **Matthew (Levi)**: the original manifest note claimed he "speaks in Mark
  2:14-17," which is simply wrong -- that exchange is between Jesus and
  the Pharisees/scribes; Matthew has no individually attributed line
  anywhere in the NT. Corrected the note (the system's actual behavior was
  already right -- no voice was ever assigned to him -- only the
  documentation was misleading).
- **James son of Alphaeus** and **Simon the Zealot** confirmed (now with
  sources, not just recall) to have zero recorded words anywhere in the
  NT -- correctly still flagged as not needing voice mapping.
- Andrew, John son of Zebedee, Philip the Apostle, Bartholomew/Nathanael,
  Thomas, Thaddaeus/Jude, and Judas Iscariot all reconfirmed with specific
  verse citations, notes tightened accordingly.
All corrected notes are live in the database (character_versions.notes),
not just this file -- verified by direct query after the seed run.

## Mark Pharisees and Scribes group completed at 4 members (2026-09-06)

Closed the gap flagged when the character-group hierarchy was formalized
earlier the same day: the "Mark Pharisees and Scribes" `character_groups`
row had only 1 of its required 4+ distinct member designs (the Principal
scribe). Generated 4 new candidate designs with Nano Banana
(`gemini-2.5-flash-image`) via a new one-off script,
`scripts/character-tool/generate-scribe-candidates.ts` -- the first real
image-generation call against `GEMINI_API_KEY` in this codebase (previously
only `src/server/providers/gemini.ts`'s text/JSON planning call existed).
Not folded into `src/providers/gemini/index.ts`'s `GeminiImageProvider`,
since that interface is shaped around rendering a scene shot against
already-canon `CharacterRef`s (see `src/providers/types.ts`'s
`ShotRequest`) -- generating a brand-new character's reference art is a
Character Tool operation, not a shot-generation one, and doesn't fit that
interface as-is.

Took several corrective passes based on Dan's direct review, each a real
design-quality catch, not nitpicking:

- **First draft gave each candidate its own robe color.** Dan redirected:
  all members should share the Principal scribe's black, with *plainer
  construction* (single-layer, no shoulder overlayer, no fringe) signaling
  lower rank instead -- a more legible "antagonist group with one senior
  figure" read in a crowd shot. Recognition between individual members now
  rests on face/beard/build/posture (the recognition hierarchy's own
  strongest cues) plus one accessory each, not color.
- **Three of four candidates initially had no head covering at all**, an
  inconsistency within one group Dan caught immediately.
- **The added head coverings first rendered as South Asian-style wound
  turbans** (rounded turban ball, spiral-wrapped layers) -- wrong region
  and culture for a first-century Levantine/Judean setting. Also initially
  varied in color (charcoal/grey/brown/off-white) across the four, which
  read as "many colored" rather than copying the Principal scribe's own
  headscarf construction as Dan asked. Fixed by locking the prompt to the
  Principal scribe's actual construction (a single cloth draped over the
  crown and shoulders, not wound) and giving all four the same plain dark
  grey fabric (his stripe pattern stays reserved for him).
- **That fix then produced a rigid flat-board/mortarboard artifact** on
  two of the four (worst on the elder/staff candidate, needing 4 regenerate
  attempts total before an explicit "no rigid brim/mortarboard, must drape
  like cloth" instruction reliably fixed it).

Dan approved 3 of the 4 final candidates -- younger/lean, older/stout, and
middle-aged/tablet-bearer. Promoted these into real canon: copied each PNG
into its own `characters/<slug>/turnaround/` folder (sha256-computed, not
assumed), added matching entries to `import-manifest.json` (same
field-shape `seed-characters.ts` already reads), and ran
`npm run db:seed-characters` -- 3 new characters/versions/assets, correctly
0 new groups (reused the existing "Mark Pharisees and Scribes" row).
Verified idempotent (a second run inserted nothing). `character_groups.notes`
updated directly in the database to reflect the group is now complete at 4
members -- `seed-characters.ts` deliberately never resyncs notes for an
already-existing group, so this needed a direct write, same pattern as
earlier corrections in this file. Full test suite still green (30/30),
typecheck clean -- no application code changed, only manifest data and a
new one-off script.

The 4th candidate (elder, tall/thin, walking staff) was generated and fixed
(no more rigid-brim artifact), but Dan decided to leave it out -- the group
stays at its 4 approved members, not 5. Left unpromoted at
`HeartWordData/assets/characters/candidates/mark-pharisees-scribes/
candidate-4-elder-tall-thin.png` rather than deleted, in case it's wanted
later.

## Mark Crowd Witnesses group split into 8 individual characters (2026-09-06)

The other group flagged incomplete alongside the scribes -- and a bigger
gap than that one, per its own notes: its single existing asset
(`characters/mark-2-crowd-witnesses/turnaround/
hatam-crowd-anchors-video-canon-v1.png`) was a flattened sheet of 8
headshots plus 2 group compositions, modeled as ONE character row ("Eight
recurring witnesses + adolescent, Mark 2 (crowd)") rather than 4+ distinct
individual canon characters. Dan also flagged that sheet as stylized/
comic-leaning rather than matching this canon's photorealistic style.

Per Dan's direction, split it apart one figure at a time (extended
`scripts/character-tool/generate-crowd-candidates.ts`, same Nano Banana
approach and candidate-review-before-promotion workflow as the scribes) --
regenerating each of the sheet's 8 people as a standalone realistic
photographic portrait, keeping the same identity cues (headscarf color,
age, build) the original sheet established rather than inventing new
people. All 8 passed review without needing a corrective regenerate pass
(unlike the scribes' head-covering saga) -- the earlier fixes (photographic
realism instruction, Levantine-not-turban head-covering construction, no
rigid-brim artifact) carried over cleanly from that work. Candidate 8 (the
woman with her son) kept both figures in one shot, matching how the
original sheet paired them -- the boy isn't split into his own character
record.

All 8 promoted into real canon: `characters/mark-crowd-<slug>/turnaround/`
folders, matching `import-manifest.json` entries, `npm run
db:seed-characters` (8 new characters/versions/assets, correctly 0 new
groups), idempotent on a second run, full suite still green (30/30),
typecheck clean.

Two structural decisions Dan made once all 8 were reviewed:

- **Spokesperson**: the stern man (`mark-crowd-stern-man`) is now this
  group's spokesperson, not the old composite. His real ElevenLabs voice
  mapping (`voice_id` `TX3LPaxmHKxFdv7VOQHJ`) was transferred from the
  retired composite row rather than re-auditioned -- Dan had already
  approved that voice for this group's spokesperson role during the
  voice-casting work (2026-09-06 earlier entry), and losing it would have
  meant re-picking a voice for no real reason.
- **Old composite retired, not deleted**: `canon_status` set to `rejected`
  and its version `status` to `superseded` -- both in the database AND in
  `import-manifest.json` (identity fields and group membership resync from
  the manifest every seed run, so leaving the manifest saying "approved"
  would have silently undone the retirement on the next
  `db:seed-characters`, the exact class of drift bug caught earlier this
  week with Jesus's asset correction). Its asset file stays on disk as a
  historical reference; the row itself no longer counts as an active group
  member.

Caught and fixed one process slip while doing this: after generating and
copying the first 4 candidates' image files, an earlier response in this
session (mistakenly) reported them as "promoted into real canon" when only
the asset files existed on disk -- no manifest entries or database rows had
actually been created yet. Corrected as part of this same batch (all 8
manifest entries added and seeded together) rather than left inconsistent.

## Stage 4 (media generation) implemented for real, run for all 24 Mark 2 shots (2026-09-06)

Implemented `ImageProvider.generate()` for real in
`src/providers/gemini/index.ts` (previously a stub) -- the same Nano Banana
/ Nano Banana Pro models confirmed against the live Gemini API model list
while building the character-canon candidates earlier today
(`gemini-2.5-flash-image` / `gemini-3-pro-image`). Each call now loads a
representative reference image (headshot, else turnaround, else body-pose)
per visible canon character straight from `character_assets` and attaches
it as an input image alongside the text prompt, so a shot's generated
likeness is grounded in the actual approved canon asset rather than a text
description alone.

Built `src/pipeline/media-generation/index.ts` (stage 4) around that:
for every shot with no existing accepted keyframe on disk, builds a prompt
from the scene's `lighting_continuity`, the shot's `action`/`framing`/
`camera_movement`, and its cast list, then calls the provider with
tier="pro" (Nano Banana Pro) for any `needs_lip_sync` shot and "standard"
otherwise -- a weak keyframe on a lip-synced shot costs a wasted downstream
Kling call, not just a weak still, so the extra cost there is worth it.
Records a `generation_attempts` row and a matching `cost_ledger_entries`
row per call (the first real use of the cost ledger in this codebase --
even `voicing.ts`'s real ElevenLabs calls don't write to it yet, a gap
worth fixing separately). Per-shot try/catch, not one big transaction --
a single Gemini failure shouldn't discard 23 other real, already-paid-for
results; a failure is flagged in `review_notes` and the run continues.
Wired to `POST /api/projects/:id/media-generation` and a new "Media
generation" section in the web app with a keyframe thumbnail under each
shot in the casting list.

**v1 scope is keyframes only, not video** -- deliberately. A `clips` row
means timeline-placed video with a real duration; a still image isn't that
yet. `VideoProvider.generateFinal()` (non-lip-sync shots) and
`LipSyncProvider.sync()` (lip-sync shots, consuming this stage's keyframe
as its `referenceFrame`) are both still separate follow-ups.

**Run for real against the actual Mark 2 project**: all 24 shots, zero
failures, ~$3.56 total (11 standard-tier + 13 pro-tier, since more than
half the shots carry dialogue). Spot-checked several results directly --
genuinely strong photographic likeness, including secondary canon
characters (the Principal scribe's cameo in a wide establishing shot
correctly kept his black robe/grey headscarf design). The per-call cost
figures themselves are rough public-pricing estimates, not reconciled
against a real invoice yet -- flagged in code as needing a real number once
Dan has billing data to calibrate against, same honesty standard as
everywhere else costs are estimated in this codebase.

**Visual style confirmed (2026-09-06, Dan)**: `docs/ARCHITECTURE.md` and
`docs/design/media-generation.md` both described the target visual style as
"Pixar-style 3D" -- flagged above as inconsistent with every approved
character-canon asset (all photorealistic) and unsupported by
PRODUCT_VISION.md itself. Dan confirmed "Pixar-style 3D" was an early,
since-rejected direction, not the real target -- photorealistic (what
stage 4 already generates, and what the whole character canon already is)
is correct. Both docs corrected to remove the stale reference.

Full test suite still green (30/30), typecheck clean.

## Jesus likeness drift flagged in generated keyframes (2026-09-06, Dan)

Dan asked for a direct check on whether Jesus was drifting toward a more
generic/Mediterranean look in stage 4's generated keyframes rather than
holding his specific canon likeness. Checked directly against the canon
headshot: confirmed real -- most visible in the seashore wide shot, where
Jesus's face reads noticeably softer/more generic than his canon reference
(less pronounced Melanesian nose/brow/jaw structure, slightly lighter skin
tone) while the disciples standing right next to him in the *same image*
kept much stronger, correctly Melanesian/Papuan features. Likely cause:
`loadCharacterReferenceImages` in `src/providers/gemini/index.ts` attaches
only one reference image per character -- not enough to lock a specific
face under Gemini's own generative pull toward a more generic prior,
especially at a wider angle. Not yet fixed -- logged here so it isn't lost;
candidate fix is attaching a second reference image per character
(headshot + a body-pose image) and tightening the prompt's likeness-lock
language, then regenerating the affected keyframes.

## VideoProvider.generateFinal() and LipSyncProvider.sync() implemented for real (2026-09-06)

Both remaining stage-4/5 provider methods are now real, not stubs --
requested by Dan the same day the "Pixar-style 3D" references above were
removed (both docs corrected to drop it, confirmed rejected).

**`GeminiVideoProvider.generateFinal()`** (Veo 3.1 Lite,
`src/providers/gemini/index.ts`): confirmed `veo-3.1-lite-generate-preview`
against the live Gemini model list (matching PRODUCT_VISION.md's provider
decision exactly, not the plain or "-fast-" Veo variants also listed).
Follows the exact request/poll/download shape already proven in the prior
pilot's `claude-pilot/gen_veo.py` (`predictLongRunning` + poll, downloading
via `x-goog-api-key` header when the result comes back as a `uri` rather
than inline bytes) -- reused a working pattern instead of guessing at one.
Looks up the shot's own stage-4 keyframe from `generation_attempts` as
Veo's required start image, since `ShotRequest` has no image field of its
own. **Verified end-to-end for real** against an actual Mark 2 shot (the
wide establishing shot, 85d7b634...): produced a real 8-second, ~2.1MB
video, sent to Dan directly for review.

**`KlingLipSyncProvider.sync()`** (Kling.ai's Avatar API,
`src/providers/kling/index.ts`): the real endpoint and field names were
NOT reliably discoverable from Kling's own docs (the doc site is JS-
rendered and unfetchable; third-party mirrors disagreed with each other,
several describing only the unrelated video-to-video `/v1/videos/lip-sync`
endpoint, which requires an existing Kling-generated video, not a static
image). Confirmed the real endpoint and schema empirically instead --
submitting real minimal requests against Dan's real account and reading
back its own validation error messages, the same technique used to
confirm Nano Banana's model names. Real, confirmed shape: `POST
/v1/videos/avatar/image2video` on `api-singapore.klingai.com`, fields
`image` and `sound_file` (both accept a base64 data URI), returning a
`task_id` polled via `GET /v1/videos/avatar/image2video/{task_id}`.

One real interface correction this surfaced: ARCHITECTURE.md's
`LipSyncProvider` sketch had drifted from the real `src/providers/types.ts`
interface -- the doc's code block showed a 4th `headshot` parameter
alongside `referenceFrame` that was never actually in the compiled
interface (only 3 params: `character`, `audio`, `referenceFrame`). The real
Kling endpoint also only takes one `image` field, so there's nowhere to
send a second reference image even if the interface had one. Fixed
ARCHITECTURE.md to match the real interface and real endpoint rather than
the stale aspiration.

**Verification status differs between the two**: Veo's implementation is
fully confirmed end-to-end (a real result file, played back). Kling's
submit and poll code paths are confirmed correct -- submission returned a
real `task_id`, and the exact response schema for a *completed* task
(`task_result.videos[0].url`) was confirmed by reading real prior
successful tasks already on Dan's account (from earlier voice-testing
work, dated late August) via the task-list endpoint discovered along the
way (`GET /v1/videos/avatar/image2video?pageNum=&pageSize=`) -- but the one
test task submitted while building this (task_id 925633323790761989,
Jesus's headshot + a 3-second test tone) was still stuck at `"submitted"`
after 15+ minutes, well past the ~3.5-4 minute completion time every one
of Dan's prior successful tasks actually took. Worth checking Dan's own
Kling dashboard for that task, or just retrying -- may be trial-tier queue
contention rather than a real bug, but flagged rather than assumed.

Both providers' per-call cost figures (`$1.60`/Veo clip, `$0.50`/Kling
avatar task) are rough placeholder estimates, not reconciled against real
billing -- same honesty caveat as the Nano Banana constants.

**Not yet done**: wiring either provider into an actual pipeline stage.
Stage 5's video half (`src/pipeline/voice-lipsync/index.ts`, still a stub)
needs to call `KlingLipSyncProvider.sync()` for the 13 lip-sync shots;
turning the 11 non-lip-sync shots' keyframes into real `clips` rows needs
a new step calling `GeminiVideoProvider.generateFinal()`. Deliberately not
run as a real batch yet -- 11 Veo + 13 Kling calls at ~4 minutes and real
dollars each is a meaningfully bigger spend than stage 4's keyframe batch
was, worth Dan's explicit go-ahead first, especially with the Jesus
likeness-drift issue above still unfixed (better to fix that before
spending on video built from a keyframe that might get regenerated
anyway).

## Canonical-likeness check built and run for real; Jesus's drift fixed (2026-09-06)

Closed the Jesus likeness-drift issue flagged above, and built the
reusable automated check Dan asked for so this doesn't need a human eye
every time. See `src/pipeline/qc/canonical-likeness.ts` and
`likeness-verdict.ts` (pure decision logic, split out after a plain vitest
import of the combined file failed to load -- pulled in `db/client.ts`'s
`node:sqlite` transitively; same reasoning as `coverage.ts`). 11 new tests
in `canonical-likeness.test.ts`, full suite green (52 total).

**The fix**: `loadCharacterReferenceImages` in `src/providers/gemini/
index.ts` now attaches up to two reference images per character (a
headshot/turnaround plus a distinct body-pose image, when both exist)
instead of one, and each character's reference images are now preceded by
an explicit "this is the EXACT face... do not redesign, genericize, or
drift" instruction rather than being handed to the model anonymously.

**The check**: `checkCanonicalLikeness` sends a character's canon
reference and a generated keyframe to Gemini vision, asking it to judge
identity match only (not composition/lighting) on a 0-100 scale;
`runCanonicalLikenessAudit` runs this across every shot/character pair in
a project, flags failures in `review_notes`, invalidates the underlying
`generation_attempts` row (status `retry_modified`, an existing
`GenerationResult` state that exactly fits) so stage 4's normal
reuse-if-exists logic regenerates it, and can optionally re-check
afterward to confirm the fix actually worked rather than assuming it did.
This is one concrete dimension of the "evolving, learned rubric"
`docs/design/automated-quality-control.md` describes and v1 otherwise
defers in full -- built as its own standalone module rather than wired
into stage 7 (still a stub) for the same reason `voicing.ts` runs
standalone: Dan asked for this specific check directly.

**Run for real, three rounds**: first audit found 11 failing shot/
character pairs across 7 shots (the check isn't Jesus-specific -- it
covers every named character) -- including both of Jesus's flagged shots.
Regenerated all 7; a second audit found the same Jesus shot from the
"stuck" wide shot now passing, but surfaced a *new* Jesus failure in a
busy 9-person table scene (visually confirmed real, not noise -- his face
had drifted again in that regeneration). One more regenerate-and-recheck
cycle on that shot fixed it. **Final state: Jesus passes on every shot he
appears in.** Also surfaced (real but explicitly left out of scope for
this fix, since Dan's ask was specifically about Jesus): Peter and
"Friend 1 (older, rust)" still fail severely (scores 5-20) in wide/crowd
shots -- notes consistently say the reference's distinct older, grey-
haired look simply isn't showing up. Unlike Jesus, Peter has a full
multi-image reference package, so this isn't the same "only one reference
image" cause -- looks like a harder, separate problem where Nano Banana
loses a specific older individual's identity in a busy composition. Not
yet investigated further; a real one-run-to-the-next non-determinism was
also observed (an unchanged, previously-passing image scored differently
on a later run) -- single-run verdicts aren't fully reliable at the
borderline (50-68) range, only for clear failures (<30) or clear passes.

## Keyframe review UI added (2026-09-06)

Dan asked how to actually look at the generated keyframes and record
accept/comment decisions. Rather than a one-off tool, extended the
existing web app (the natural long-term home for this, since it's already
where casting/media-generation/voice-casting all live):

- `GET /api/projects/:id/shots` now also returns each shot's latest human
  review note and whether it's resolved.
- `POST /api/projects/:id/shots/:shotId/review` (`{ decision: 'approved' |
  'flagged', comment? }`) writes a `review_notes` row (source `'human'`,
  reusing the same table QC's automated checks already write to, just a
  different source) -- 'approved' is resolved immediately, 'flagged'
  requires a comment and stays unresolved for follow-up.
  Not wired to any pipeline action yet -- approving doesn't do anything
  special, flagging doesn't auto-regenerate; it's a durable, visible
  record for now, not a workflow trigger.
- The "Casting & direction" section's keyframe thumbnails got Approve/Flag
  controls plus a comment box, and a click-to-zoom overlay (click a
  thumbnail for a full-size view, click anywhere to close) since the
  360px inline thumbnails are too small to actually judge a face against.

Verified for real against the running dev server (attached to Dan's own
already-running `npm run dev` on :5173 rather than starting a second one) --
the Browser tool's screenshot capture didn't render pixels for this
externally-attached tab (a tool-side quirk, not an app bug: confirmed via
direct DOM/JS inspection that images loaded with real pixel dimensions and
computed styles were normal), so verification was DOM-driven rather than
visual: clicked a real Approve and a real Flag-with-comment through the
live UI, confirmed both landed as real `review_notes` rows in the
database with the right resolved/unresolved state, confirmed the zoom
overlay opens with the correct image and closes on click, then deleted
the two test rows so they don't pollute Dan's real review data. Full
suite still green (41/41), typecheck clean.

## Story fidelity gaps found and fixed: crowd density, continuity, and a real casting/setting bug (2026-09-06)

Dan reviewed the regenerated keyframes and caught three real, separate
failures in one pass -- exactly the kind of review this project's Goal
Guardian principle exists for:

1. **Mark 2:1-2 says "no room, not even at the door"; the room rendered as
   a modestly-sized gathering.** Nothing told stage 4 HOW crowded
   "crowded" meant.
2. **Shot 1 already showed the roof opening**, even though the friends
   don't cut it open until later in the scene -- a continuity break with
   no mechanism to catch it.
3. **The scene 2 seashore shot dressed everyone in Melanesian/Pacific
   Islander tribal clothing** -- woven grass skirts, bare chests as
   everyday dress, shell/bone arm bands, bare feet -- instead of
   first-century Judean dress.

(3) traced to a real bug in `src/pipeline/media-generation/index.ts`'s own
prompt, not a missing design decision: `docs/PRODUCT_VISION.md`'s "Visual
World and Character Direction" section already states this exactly --
"Hatam/Papuan faces while the physical setting remains first-century
Jerusalem and Galilee... the clothing, trees, and buildings do not need to
be transplanted to modern Papua." The prompt's own style anchor said
"first-century Hatam/Papuan (Melanesian Arfak highland) *setting*",
conflating Papuan CASTING (faces) with the SETTING, and the model read
that license correctly, just not as intended.

**Fixes, addressing both of Dan's questions ("how can casting & direction
identify this" and "how can it be caught in future")**:

- Rewrote the style anchor (`CASTING_AND_SETTING_ANCHOR` in
  media-generation/index.ts) to separate the two explicitly, with a hard
  ban list (no grass/woven skirts, no bare-chest-as-dress, no shell/bone/
  wood jewelry, no face/body paint, no tropical island scenery).
- **Stage 3 (casting) now plans two new fields per shot**: `crowdDensity`
  ('empty'|'sparse'|'moderate'|'packed', schema.sql + coverage.ts's new
  `CrowdDensity` type) grounded in what the verse text actually says, and
  `continuityNotes` (free text) -- the prompt now explicitly asks Gemini
  to read its OWN full shot sequence for a scene before answering, so an
  object introduced in a later shot doesn't already appear earlier and
  vice versa. Verified this actually works on the real data: Gemini
  correctly tracked the roof across 5 shots on its own ("Roof... unopened"
  -> "before making an opening" -> "roof now has a visible open hole" ->
  "beneath the freshly opened roof").
- Stage 4 turns both into explicit generation instructions
  (`CROWD_DENSITY_INSTRUCTIONS`, an "IMPORTANT continuity constraint"
  line).
- **New automated check, `src/pipeline/qc/scene-fidelity.ts`** (+
  `fidelity-verdict.ts` pure logic, 13 tests) -- parallel to
  canonical-likeness.ts but checks everything likeness doesn't: setting/
  costume fidelity to first-century Judea (explicitly NOT penalizing
  Papuan casting, only wrong-culture clothing/props), crowd density match,
  and continuity-constraint violations. Same invalidate-and-optionally-
  regenerate audit loop. On its first real run it also caught something
  neither Dan nor this fix explicitly targeted: Levi not actually standing
  up in a shot whose action said he does -- the check generalizes to
  action-fidelity too, not just the three specific bugs that prompted it.

**A real destructive bug surfaced and fixed along the way**: re-running
casting to get the new fields on the existing Mark 2 project hit
`FOREIGN KEY constraint failed` -- casting's idempotent "delete and
replan shots" logic predates stage 4 existing, and never accounted for
`generation_attempts`/`cost_ledger_entries`/`clips`/`review_notes` now
referencing those shot ids. Fixed with an explicit cascading delete
(`src/pipeline/casting/index.ts`), and the stage's own return now says
plainly when this happens: re-running casting on a project with existing
generated media discards those records (files stay on disk, orphaned,
not deleted) and needs stage 4 re-run afterward. This is real, working-as-
designed behavior now, not silently swallowed.

**Run for real, full loop**: re-ran casting (24 shots -> 26, Gemini split
two beats more granularly once given continuity awareness), regenerated
all 26 keyframes, ran the new scene-fidelity audit (4 failures found,
regenerated, re-checked down to 2 remaining: Levi still seated in one
shot, a doorway partially blocked in another), and re-ran
canonical-likeness for comparison. Setting/costume fidelity is now
consistently ~95/100 across the board (vs. the original tribal-clothing
failure) and **24/26 shots pass the full scene-fidelity check** on this
larger, more heavily-populated regenerated batch. Sent Dan the corrected
crowd/roof/clothing shots directly.

**One real, still-open tension this surfaced**: canonical-likeness's pass
rate dropped to 63/89 (71%) on this batch -- including Jesus failing again
in 2 of the busier shots. The regenerated shots are more heavily
populated (per the crowd-density fix) and busier crowd/wide shots are
fundamentally harder for both the image model to keep every named face
distinct AND for the vision-judge to verify at a distance -- many
failures explicitly say "too small/distant to verify" rather than
describing an actual wrong face. This isn't the same bug the two-image
reference fix solved; it may need a different approach (fewer named
background characters in a single wide shot, or accepting lower likeness
precision specifically where a viewer couldn't resolve individual faces
anyway) -- not yet decided.

Full test suite green (56/56), typecheck clean.

## Second review pass: continuity/costume fixes, disciple timeline, aspect ratio, Critic/Director QC (2026-09-06)

A second real review pass by Dan against the (now landscape-corrected, see
below) keyframes caught several more real, specific issues, each fixed and
regenerated for real rather than just logged:

- **Duplicate Jesus, caught by clothing not just face**: Dan flagged a
  shot with two figures sharing Jesus's exact locked robe combination and
  hair length, one with his face turned away -- my own visual check had
  wrongly dismissed the second figure as "similar clothing, different
  person." Fixed `canonical-likeness.ts`'s `instanceCount` dimension (added
  earlier this session) to explicitly judge duplicates by BOTH face AND
  the character's locked canon clothing/hair markers, since clothing is
  often the clearer signal when a face is turned away or distant -- a
  locked color-block is a deliberate identity marker for this production,
  not incidental styling. Verified against the real image via a direct
  script run: `instanceCount: 1` on the corrected version.
- **A second, separate duplicate/swap failure mode**: a different shot had
  Jesus's face on a figure wearing the WRONG robe color, while another
  disciple wore his correct blue-over-cream -- a clothing/identity SWAP,
  not a duplication. Fixed via an explicit shot-level continuity-notes
  lock ("Jesus wears ONLY his own locked canon robe... no other person may
  wear that combination") rather than a code change, since this is
  shot-specific content, not a systemic prompt bug.
- **Capernaum roof height and construction**: Dan asked me to double-check
  his own estimate that a first-century Capernaum roof was under 10 feet.
  Confirmed with real historical fact (archaeological excavations,
  Loffreda/Corbo's House of Peter work): flat roofs, ~6-7 feet at the
  eaves, built of wood beams + branches/reed matting + packed mud/clay --
  not the tall peaked/thatched structure generated. Fixed via the scene's
  `lighting_continuity` field (architecture is scene-wide, not per-shot).
  The Critic agent (see below) later found this fix was still incomplete
  in one real, well-cited way: the load-bearing rafters themselves can't
  be removed without collapsing the roof, so an opening must show
  rafters still spanning it, not a clean skylight-like hole -- not yet
  applied back to the shot.
- **Paralytic sitting up**: Mark 2's paralytic is being lowered on his mat
  and cannot sit up under his own power -- he was shown upright, hands
  bracing the mat. Fixed via shot-level continuity notes ("must NOT be
  shown upright, leaning, or using his arms"). The Critic also flagged the
  mat itself should read as a soft rollable pallet (Greek *krabattos*),
  not a rigid framed bed, per Mark 2:4's actual word choice -- not yet
  applied.
- **Tax booth shown as an open dining table**: fixed across all three
  shots depicting it via continuity notes describing a real first-century
  roadside customs booth (a small stall with a raised counter, money box,
  ledger, coin scale) -- visibly correct on regeneration, screenshots sent
  to Dan.
- **"Remove 'dusty', brighter/clearer" (Scene 1)**: the scene's shared
  `lighting_continuity` literally said "dusty" -- removed, lighting
  language strengthened ("clean, well-lit, no haze").

**Disciple-timeline gate built** (`src/pipeline/casting/disciple-timeline.ts`
+ 13 tests) after Dan asked: "once Matthew joins the disciples he should
be present in scenes where the disciples are mentioned... how can this be
done and remembered?" `characters.joined_narrative_at` now records each
disciple's real calling verse (Peter/Andrew: Mark 1:16; James/John son of
Zebedee: Mark 1:19; Matthew: Mark 2:14; the remaining seven: Mark 3:13,
where Mark's own text first names the full Twelve as a group -- not
individually earlier). `casting/index.ts` filters the canon-character list
offered to Gemini per scene against this automatically -- "remembered" by
being a database fact every future casting run reads, not a per-run
prompt instruction. One real bug caught before it shipped: filtering
against the scene's START verse wrongly excluded Matthew from his own
calling scene (Mark 2:13-17), since his calling verse (14) is inside that
scene, not before it -- fixed to filter against the scene's END verse
instead, letting Gemini's own text-grounded shot planning place him in
the right shots within the scene. Verified for real: scene 2 (Levi's
calling through the dinner) now correctly includes James, John, Andrew,
and Peter throughout, and Matthew from his calling shot onward.

**Aspect ratio bug found and fixed**: Dan noticed most keyframes were
portrait. Real gap: `GeminiVideoProvider.generateFinal()` already
hardcoded 16:9 for Veo (inherited from the prior pilot's own default,
never actually confirmed for this project), but `GeminiImageProvider.
generate()` (Nano Banana) requested no aspect ratio at all and was
defaulting to mostly-portrait -- a live mismatch between keyframes and
the landscape video they feed into. Dan confirmed 16:9 landscape via
`AskUserQuestion`; documented in `PRODUCT_VISION.md`'s "Visual World and
Character Direction" section (previously undocumented anywhere) and fixed
via `generationConfig.imageConfig.aspectRatio` -- confirmed real and
respected by testing directly against the live API before wiring it in.
All 28 real shots regenerated in correct landscape.

**Critic + Director QC agents built** at Dan's request: "Whenever an image
or video clip is generated it should be reviewed by a critic agent...
uses research on the context of scripture from the internet... The
director agent weighs the input... reported to the producer and logged."
`src/pipeline/qc/critic.ts` runs a REAL web-search-grounded Gemini call
(confirmed working via `tools: [{google_search: {}}]`, empirically tested
before use, same discipline as everywhere else provider behavior was
confirmed this session) against a shot's own action/continuity text,
producing cited findings plus a self-reported severity.
`director-verdict.ts` (pure, 9 tests) weighs that against the two existing
automated checks (canonical-likeness, scene-fidelity) into one of the
same five `GenerationStatus` values `src/providers/types.ts` already
defined (accepted/retry_same/retry_modified/escalate/hold_for_review) --
this is the first code to actually choose between all five, not just
"accepted". `director.ts` wires it together, writes a full report to
`review_notes` (source 'qc') -- the "reported to the producer, logged for
future reference" mechanism, since real push-notification channels stay
the already-known-deferred v1 item (`docs/design/notifications.md`) -- and
writes the decision directly onto `generation_attempts.status`.

**Verified for real, not just built**: ran `runShotReview` against the
real roof/paralytic shot. Genuinely found NEW issues beyond what Dan or I
had caught by eye: the roof's load-bearing rafters must stay visible
across the opening (removing them would collapse the roof), the mat
should be a soft rollable *krabattos* not a rigid bed, and the opening
should look ragged/dusty from being dug through, not clean -- each cited
to real archaeological sources. Correctly combined with two failing
automated checks into `hold_for_review`, the most cautious status.
**Deliberately NOT auto-wired into every `runMediaGeneration` call yet** --
each reviewed shot costs a real additional grounded search call on top of
the two existing checks; run standalone per-shot (or could be extended to
a whole-project audit matching the other two checks' pattern) until Dan
decides this should run automatically by default.

Full test suite green (90/90), typecheck clean.

## Next up

Pipeline status as of 2026-09-06 (end of session): stages 1-4 fully
implemented and run for real, through two full review passes with Dan.
Stage 5's audio half has run for real; both of stage 5's remaining
provider methods (Veo, Kling) are implemented and individually verified.
Three automated QC mechanisms now exist (canonical-likeness,
scene-fidelity, Critic+Director) plus a disciple-timeline gate in casting
itself, and Dan has a UI to review keyframes directly. Still open:

- Get a language specialist (or Dan, if he can informally judge Hatam
  audio against verse boundaries some other way) to actually check the 20
  flagged `audio_segments`/`review_notes` rows stage 1 produces, and the
  3 boundary-straddling `review_notes` rows stage 2 produces, against the
  real audio — each carries full context, but they're still database
  rows, not reviewer decisions. Every later stage is building on this
  unconfirmed input in the meantime.
- ~~Apply the Critic's two findings (roof rafters, krabattos mat)~~ --
  done same day: applied to the shot's continuity_notes, regenerated
  (only that one shot -- its status was already non-'accepted' from the
  Director's `hold_for_review` decision, so `runMediaGeneration`'s normal
  reuse-if-exists logic picked it up on its own). Result: a real
  load-bearing beam now visibly spans the opening with ragged thatch/
  branches around it, and the mat reads as a soft woven pallet, not a
  rigid bed. Re-verified no duplicate-Jesus regression with the
  strengthened canonical-likeness check (`instanceCount: 1`, "clothing
  and hair combination remains unique to the central figure").
- Decide whether/how to run Critic+Director more broadly: per-shot on
  demand (as built), a whole-project audit mode (matching
  canonical-likeness.ts/scene-fidelity.ts's own audit runners), or wired
  into every `runMediaGeneration` call by default -- each real option
  trades against per-shot cost/latency (a live grounded search call).
- Decide how to handle the wide/crowd-shot likeness ceiling flagged
  earlier this session -- distinct from the single-reference-image bug
  already fixed; many failures there read as "too small/distant to
  verify" rather than an actual wrong face.
- Wire `KlingLipSyncProvider.sync()` into stage 5's video half
  (`voice-lipsync/index.ts`) for the lip-sync shots, and
  `GeminiVideoProvider.generateFinal()` into a new step that writes real
  `clips` rows for the non-lip-sync shots -- both providers are ready,
  neither is wired into a pipeline stage yet.
- Stages 6-7 (assembly, QC) still fully unbuilt -- blocked on real `clips`
  existing first.

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

## Coverage-beat keyframes: first candidate batch (2026-09-08)

The coverage-beat workflow is now in active production use for the Hatam Mark
2 reviewable cut. It supports the product goal of keeping continuous
heart-language dialogue intact while the picture cuts among short master,
reaction, and lip-sync clips.

Codex prepared, generated, and imported three distinct Scene 1, Shot 7
(Mark 2:8-9) candidates without changing the shot-level keyframe history:

- Beat 1, a silent interior master;
- Beat 3, a principal-scribe reaction cutaway; and
- Beat 4, a fresh Jesus lip-sync insert.

They remain `generated`, pending producer approval; their immutable briefs,
reviews, image assets, and provenance records are retained. The remaining
coverage-keyframe worklist is 40 planned beats across the nine
covered-sequence shots. The proportional beat timings remain composition
planning estimates until audio phrase-boundary refinement.

## Coverage approval and Critic calibration (2026-09-08)

Dan approved all four Scene 2, Shot 8 coverage beats for Mark 2:17: doorway-scribe and meal-guest cutaways plus two Jesus lip-sync inserts. The Critic prompt now treats a scribe's white-and-black striped shawl as a minor costume-canon violation only; it may be reported but cannot elevate an otherwise usable keyframe above minor severity.

## Coverage critic grounding calibration (2026-09-09)

The coverage-keyframe review path now supplies each critic run with the beat's
sequence, type, and assigned purpose. This prevents a reaction/cutaway from
being judged as though it must depict every physical action in its parent
shot. The Critic also inventories what is actually visible before assessing
it, and flags visibly cloned crowd members: an exact repeated face, hair,
wardrobe, and pose in one frame is a generation defect. Recurring canon crowd
designs remain valid when they are separately staged; similar generic scholar
robes alone do not constitute duplication. The full suite passes (114 tests).

The duplicate-crowd calibration was strengthened further after the grounded reviewer
missed a visible three-person clone cluster. `runCritic` now also runs a dedicated
structured visual duplicate pass that counts the largest same-face group and raises
the final severity deterministically: two is moderate; three or more is severe.
A rerun on Scene 1, Shot 8, Beat 5 found a six-person matching background cluster
and therefore rated the candidate severe. The full suite passes (115 tests).

## Production-crew interaction map (2026-09-13)

The project view now has a compact, expandable Production Crew map that makes the
chapter's actual production path inspectable without claiming the planned
multi-agent shot-planning network is already running. It shows the deterministic
supervisor separately from creative roles, highlights the department associated
with the chapter's current pipeline stage, and groups the documented specialist
roles by department. Every specialist is labelled implemented, planned, or mixed.

The view reads real project state and the persisted Creative Director / Production
Director negotiation transcript from `director_negotiation_log`. When no transcript
exists, it explicitly says so; declared paths are not presented as a live
conversation. This preserves the producer's current project workflow while making
the intended role-agent architecture and its currently implemented bounded
coverage-gap negotiation legible for future decisions.

## Future whole-film audience review pair (2026-09-13)

The approved future design now reserves a two-house whole-film review gate for
the assembled rough cut: a Story Critic for first-time-viewer clarity, emotional
movement, and engagement, and a Film Critic for filmmaking craft. They review
independently before a short producer-visible discussion, with one strongest
success, up to three evidence-based timestamped concerns, and a ready/revise/hold
recommendation. The pair is an original HeartWord format, not a use or imitation
of real critic identities. It stays separate from Scripture and cultural review,
runs on the first rough cut and after major revisions, and is explicitly planned
rather than implemented.

## Control-room reference portraits preserved (2026-09-13)

Nineteen producer-approved original portraits for the private future control-room
cast are preserved under `docs/assets/control-room/agent-portraits/`, with an
adjacent role and provenance manifest. They are project-reference art only: they
are not Scripture-video canon, do not claim runtime agents, and are deliberately
not wired into the pipeline. The standalone interaction-diagram prototype uses
only its six visible core roles as portrait references; its map remains a
prototype rather than runtime orchestration. The prototype now supports
pointer- and keyboard-resizing of the map, live-boundary connector routing with
proportionally scaled head-safe core portraits, and a clearly non-live
supporting-crew portrait gallery; none changes production behavior.
It also includes a local-only Producer Address recognizer: typed names (and
browser voice recognition when available) glow matching reference cards without
sending a message, starting an agent, or changing pipeline state.

## Future production-crew communication protocol (2026-09-13)

The producer-approved future operating contract for all sixteen control-room
roles is recorded in `docs/design/production-crew-communication.md`. It makes
Scripture/source audio controlling, Mabel the sole deterministic execution
authority, and the producer the resolution point for material holds. The
declared gates and interaction edges are design contracts only: they do not
activate runtime agents, change the pipeline, or make the prototype's
supporting crew live.

The approved future protocol also includes a three-member independent Red Team:
Scripture Fidelity, Dramatic Impact, and Production Feasibility Challengers.
They are evidence-scoped adversarial reviewers at declared gates, not
production-chain authorities. The standalone control-room prototype represents
them only inside a dashed, explicitly planned Review and Challenge Layer.

## Control-room presentation personalities (2026-09-13)

The private control-room prototype now has an opt-in, clearly labelled staged
banter layer based on Dan's populated cast-personality and sample-exchange
workbooks. It spotlights the participating portrait/name/title cards at three
times normal size during an exchange, then clears that local display state five
seconds after the final line. The presentation layer is expressly separate from
the production pipeline: it cannot dispatch work, alter agent authority, change
evidence or reviews, or activate any planned crew/reviewer role.

## Control-room voice casting persisted (2026-09-13)

The producer-approved presentation voice cast is now persisted in the local
`control_room_voice_profiles` table: all nineteen named control-room personas
have an OpenAI TTS base voice and a delivery instruction derived from the
personality workbook. It is structurally separate from Bible-video canon
characters and their source-language voice mappings, and its database
constraint fixes every row as presentation-only. The idempotent seed command
preserves future producer edits by adding only missing profiles.

## Supporting crew visible in the interaction map (2026-09-13)

The standalone control-room prototype now includes all ten supporting crew
portraits in a separate dashed reference band within the interaction map. The
band makes the full cast visible at a glance while retaining the distinction
between the six core map nodes and the supporting crew: its cards have no
active routes, dispatch power, or production authority. The detailed gallery
remains below the map for portrait inspection.

## Map-first control-room presentation (2026-09-13)

The standalone control-room prototype now opens in a map-first view, with the
full interaction map occupying the primary page area. Presentation-only view
buttons switch locally among the map, staged conversation panel, planned review
layer, and portrait gallery. The switcher changes no production data, agent
authority, runtime state, or pipeline behavior.

## Producer-address microphone clarity (2026-09-13)

The presentation-only control-room recognizer now reports the specific browser
speech-recognition outcome instead of leaving the Mic action ambiguous. It also
maps common phonetic spellings of Mabel, including “Bable,” to Mabel's reference
card when a browser transcript is available. The browser recognizer remains
separate from the Codex live-voice transcript and cannot affect the production
pipeline, dispatch work, or start an agent.

## Separate presentation voice listener (2026-09-13)

With producer approval, the control-room prototype now offers a separate
browser-microphone WebRTC listener for card highlighting. Its local server
brokers only the WebRTC setup using the configured OpenAI account; the API key
is never exposed to the page. The listener has cast-name transcription guidance,
does not request model responses, saves no transcript, and never calls a
production, review, or database endpoint. It is a separate microphone source,
not an integration with the Codex voice-call transcript.

## Presentation-only full-cast map (2026-09-13)

The control-room mockup now presents its sixteen current cast cards as equal,
compact cards in one circular map. The presentation circle deliberately hides
the old route arrows and treats neither the card positions nor card selection
as pipeline state, authority, or a production workflow change.

The presentation map also lets Dan drag cards into a preferred arrangement.
Those browser-local positions are retained for the next page load and remain
strictly visual: they are not saved to HeartWord production data.

When the separate presentation listener recognizes an addressed cast member,
the matching map card now retains its arranged position while receiving a
three-times visual spotlight and a glowing outline. This is a display-only
selection state and does not activate an agent or alter any pipeline record.

For staged agent-to-agent banter, both participating cards use that same
large glowing focus treatment. Every nonparticipating card becomes an
unlabelled half-size portrait thumbnail in an even surrounding cluster; the
saved producer layout is restored when the focus view clears.

An unmatched presentation question can now use a server-only live-research
fallback. It sends only the addressed agent name and producer question to the
Responses API with web search, asks for a short persona-consistent answer,
returns up to three public sources, and renders the answer in the existing
presentation voice. It is opt-in by spoken question, uses API credits only at
that time, stores no response state, and has no production or pipeline access.

Two dated, read-only presentation briefs now give Mabel and Dottie grounded
HeartWord context from the current goal, architecture, and crew-design
documents. They are stored separately from production records and do not scan,
infer, or persist live project status. Live presentation replies are limited to
one short paragraph, suppress URLs and citations, and are restricted to
HeartWord's project and filmmaking context; unrelated questions receive a
brief redirect instead of an open-ended research response.

Dottie's presentation profile now uses the feminine-presenting Shimmer voice
with casting-director delivery guidance. This voice assignment remains private
control-room presentation data and does not affect any Scripture-video voice.

Kit's presentation profile now uses the feminine-presenting Nova voice while
retaining her precise lip-sync-specialist delivery guidance. Every control-room
persona now also has a dated, read-only, source-traceable project brief. The
briefs supply bounded presentation context only; they are neither live-status
scans nor runtime-agent memory, and they cannot change HeartWord records.

All control-room TTS replies now use a shared conversational pacing direction
and a modest 1.15x speech speed. This affects only the private presentation
layer, preserving each agent's character-specific delivery and leaving all
source-language, narration, and production audio untouched.

The presentation listener now treats new producer speech as a barge-in: it
stops any currently playing agent reply and aborts a pending reply request, so
only the latest completed question can receive a spoken response. This is a
local presentation control and stores no transcript or production state.

The Presentation Exchanges player now renders each cast member's staged line
in that character's saved presentation voice, while producer lines remain
on-screen. This is an opt-in local demonstration and has no production access,
recording, or authority.

The twelve remaining main-map control-room cards now use new identity-preserved,
near-square, face-forward close-up portraits for readability. Their original
portrait files remain the click-to-enlarge source, preserving the existing
full-body or square inspection view. These private presentation assets are
separate from Scripture-video canon and do not affect the production pipeline.

The normal map cards now crop each square portrait into a compact square image
area with a shallow neutral first-name caption band underneath; job titles
remain available in the enlarged focus view. This is presentation-only styling.
When a card is focused, the surrounding thumbnail names remain visibly placed
outside the circle rather than being clipped by the compact normal-card frame.
The bottom group has extra label clearance and is lifted slightly so its names
do not overlap its portraits.
Focused cards explicitly restore their second-line role titles, so core and
supporting crew members present the same identifying information in focus.
The focused supporting-card rule also overrides the compact gray caption style,
keeping its name and role on separate, readable lines.
Focused names use a visibly larger type size than their role lines.

The spoken presentation cue “any issues?” now selects one random, saved,
two-person exchange involving the currently addressed agent and spotlights both
participants. It reads only producer-approved staged banter from the separate
presentation library and never reports or changes live project status.
Selections are limited to the sixteen main-map personas so both exchange
participants have a visible focus card.

During a staged exchange, the current speaker receives a pulsing highlight,
visible “Speaking” badge, and directional cue toward the dimmed listener.
This makes turn-taking legible without changing any production behavior.

Ada, Theo, and Cora now appear as a visually distinct Red Team group on the
presentation map, completing the visible cast of nineteen. They remain
review-only and are deliberately excluded from the random “any issues?” cue,
although their approved staged exchanges remain available from the presentation
library.
Their default map positions form a bottom row—Ada, Theo, then Cora—while still
honoring any producer drag-and-drop placement saved afterward.
Their normal red outline is two pixels wide for a clearer Red Team distinction.
The map now draws a separate red frame around their actual saved locations with
a centered “Red Team” label underneath; it follows later producer repositioning
and stays out of the focused presentation view.

The normal presentation map now uses a compact, centered 6–6–4–3 arrangement
for all nineteen cards, with the Red Team grouped on the bottom row. The row
interval is thirteen percent of map height—tighter than the original layout but
wide enough to keep caption bands separate—and the arrangement is saved as the
new drag-editable layout without affecting production work.

Every normal map card now displays its first name and role on separate visible
caption lines. The original core-card dash-form labels were normalized to match
the supporting crew and Red Team cards.

Red Team map captions now show only each critic's role, without the redundant
group prefix or special dash character; focused Red Team cards retain the full
Red Team role name.

The private control-room presentation now includes a separately framed Film
Critics pair, Gene Siskel and Roger Ebert. Their illustrated portraits are
based on producer-supplied public reference photos; their stock TTS voices and
role briefs capture distinct review emphases without imitating their real
voices. They remain presentation-only and have no production authority.
Their Film Critics group sits beside the Red Team on the same bottom map row.
Together, the two review groups are horizontally centered as a single five-card row.
Their frames have a deliberate center gap so the two teams remain visually distinct.
The sixteen standard cast cards are framed together as the Production Crew across
the top three map rows, with the separate Red Team and Film Critics groups below.
The presentation shell clips only accidental horizontal frame overhang, and the
group-frame padding is tightened so no horizontal scrollbar is introduced.
The two review groups sit roughly 50 pixels closer to the Production Crew
frame, reducing vertical dead space while keeping the group labels legible.

The default control-room view is now a cast-only presentation stage: Production
Crew, Red Team, and Film Critics remain visible with a single microphone icon.
The address bar, exchange player, view controls, and other utility panels stay
available in the page implementation but do not occupy the presentation view.
The cast-only layout uses the available viewport for larger, non-overlapping
portrait cards: three broadly spaced Production Crew rows and a clearly
separated Red Team and Film Critics row beneath them.
Following presentation review, the Production Crew now uses two eight-card rows
with larger portraits, allowing the images to use the stage more effectively
while keeping both review groups visible in the same viewport.
The Red Team and Film Critics now shift left together as a single bottom-row
group so their combined visual weight is centered beneath Production Crew.
The staged-exchange speaking direction cue is now a CSS chevron rather than a
text arrow, preventing character-encoding artifacts in the presentation view.
Two-person focus now uses balanced centered lead cards with the remaining cast
in dedicated top and bottom rows, eliminating the former thumbnail overlap.
Focused portraits explicitly center within their cards, preventing a crew
portrait from touching the focus-card edge.
Focused portraits now share the same rounded-corner crop regardless of whether
the agent belongs to the core cast or supporting crew.
Focused portraits now fill the full height of the focus card, maximizing the
animation-ready image area while keeping a uniform rounded crop.
The focus transition now also explicitly replaces stored normal-map thumbnail
dimensions, so supporting-crew portraits such as Leon and Benny use that same
full-height focus treatment.

An ElevenLabs audition palette now offers six temporary, gender-aligned voice
samples for representative presentation characters. It is opened by saying
“voice auditions,” never changes a saved cast assignment, and remains wholly
separate from source-language audio and production work. Staged exchanges now
add a bounded, playfully sarcastic delivery direction: sharper creative
disagreement without personal abuse.
The audition phrase is handled both directly in the realtime transcript and
in the shared recognition path, so a recognized voice command cannot fall
through to ordinary agent addressing.
Following producer approval, the six audition winners are now the active
presentation voices for Mabel, Rufus, Gus, Vera, Dottie, and Gene Siskel.
All other agents retain their prior OpenAI presentation voices. This affects
only staged control-room dialogue, never source narration or production audio.
The audition palette’s second round now includes five newly added catalog
voices, paired temporarily with Leon, Pippa, Tessa, Sam, and Arlo. These are
auditions only; no second-round assignment is saved until Dan hears and
approves the choices.
Dan approved the full second round. Those five ElevenLabs assignments are now
active for presentation dialogue alongside the original six approved voices;
all remaining personas retain their existing OpenAI assignments.
Starting the presentation listener with the microphone icon now uses that
producer click as Chrome’s required full-screen gesture, so the cast-only
control room enters true browser full screen when it starts.

The control room now has a canonical proposed responsibility matrix for all
21 personas. Every item is bounded as advisory or review work and explicitly
preserves producer approval, verified Scripture, canon safety, and source-audio
integrity. Clicking a presentation card opens the original full-size portrait
alongside its name, role, and six inherited proposed responsibilities.

The cast-only presentation stage now uses the approved HeartWord AI mark as a
discreet lower-right signature. It steps out of view while a focused agent card
is open, preserving the full presentation space for the portrait and proposed
responsibilities. Its white source canvas blends into the stage background, so
only the HeartWord AI mark is visible.

## Private control-room idle motion (2026-09-14)

The cast-only Agent Control Room now plays approved local-MP4 idle-motion clips
for Rufus and Pippa. Rufus was generated from the wide, motion-safe source
frame and passed visual review for identity, head/shoulder room, stable
framing, and unchanged props. Pippa's 360p Gemini Omni 1.1 clip uses her
approved wide source as both first and final frame; it passed identity/framing
inspection and repeated control-room browser-loop QA without a visible boundary
jump. Mabel's matching source was refused by the provider, so she remains
static rather than receiving a substitute. Every other card also keeps its
original static portrait. The browser plays at most one short clip at a time,
with a randomized three-to-eight-second pause before the next approved overlay,
and removes the overlay during reduced-motion preference,
background-tab, portrait-dialog, and cast-focus states. It neither plays audio
nor reads/writes production data. Before every new scheduled overlay, it also
removes every residual idle-motion element and active marker, preventing a
stale presentation preview from overlapping the next card.

The later producer-authorized Omni batch added approved 360p loop-closure
clips for Gus, Vera, Orion, June, Leon, Tessa, Arlo, Nell, Sam, Miriam,
Dottie, Kit, Benny, Ada, Theo, and Cora. Every approved clip was generated
once from a non-destructive landscape source used as both Omni first and final
frame, then reviewed for identity, composition, and paired loop boundary
before being added to the existing one-at-a-time scheduler. Mabel, Gene Siskel,
and Roger Ebert each received their one authorized batch attempt but Omni
blocked it; they remain static and received no retry or substitute. The
presentation-only batch ledger is at
`docs/assets/control-room/idle-motion/batch-ledger.json`.

`scripts/generate-control-room-idle-motion.ts` is the deliberately bounded
generation path: it uses the already configured Gemini Omni image-to-video
capability only for supplied private source frames, then strips audio and
writes review-candidate 360p H.264 MP4s under
`docs/assets/control-room/idle-motion/`. It has no database, pipeline, or
server access; each optional draft is estimated at roughly $0.10. The script
makes no retry or provider-switch decision. This is presentation decoration
only, not runtime agent activity, Scripture-video media, canon, or source
audio.

The subsequent Rufus loop-closure iteration added an optional Veo 3.1
first/last-frame request path and sent one eight-second locked-camera request
with `rufus-motion-safe-source-v1.png` as both frames. The provider filtered
the request during audio processing and returned no video. The request was not
retried, no provider changed, and the existing approved `rufus.mp4` remains
active; therefore no browser boundary replacement review was possible. The
new helper and standalone script remain presentation-only and do not alter the
production pipeline.

The proposed-responsibility list in the expanded cast portrait now uses larger,
more comfortably spaced type. This makes deliberate use of the existing dialog
whitespace while keeping the portrait, responsibility wording, card geometry,
and presentation-only boundary unchanged.

The expanded proposed-responsibilities heading, role/detail line, loading
message, and responsibility list now each use two visible 0.10rem type-scale
steps. Compact map cards and unrelated modal typography remain unchanged.

Every expanded cast profile now includes a modest, keyboard-accessible next
arrow. It advances through the displayed map roster with wraparound while
naming its destination for assistive technology; it remains presentation-only
and leaves compact cards and the close control unchanged.

The expanded profile now pairs that control with a matching accessible back
arrow. It moves through the same roster in reverse, including Mabel back to
Roger Ebert, while preserving the open presentation detail view.

One-time full-cast presentation-voice calibration (2026-09-14) rendered the
same neutral line through every saved provider configuration and measured EBU
R128 integrated loudness and true peak with FFmpeg. It chose -22 LUFS as the
reference, applied rounded gains only to voices at least 1 dB quieter, and
left the louder eight voices unchanged. Boosted profiles are Mabel +2, Rufus +4,
Pippa +3, Ada Rowe +10.5, Cora Bellamy +2.5, Gene Siskel +2.5, Roger Ebert +2.5,
Leon +7, Tessa +6, Nell +6.5, Sam +1, Miriam +12, and Dottie +2 dB. Each
boosted reply passes through a -1 dB peak limiter. The reproducible
temporary-file workflow is `scripts/calibrate-control-room-presentation-loudness.ts`; it
deletes generated samples and does not affect any provider assignment,
source-language audio, or production audio.

## Evidence-backed Red Team control-room review (2026-09-14)

The presentation-only Agent Control Room now seeds durable, DB-backed audit
findings for Ada (Scripture/source safeguards), Theo (viewer clarity), and
Cora (production feasibility). Each finding records a review area, concrete
finding, evidence, source reference(s), severity, and a producer-oriented
recommendation. The saved audit is grounded in the current Mark 2 timing and
coverage status, actual unresolved QC data, the present architecture/design
contracts, and the fresh typecheck result. It explicitly marks documented
intentional scope or policy choices as decisions rather than defects.

When one of the three Red Team members receives “What did we do wrong in this
project?” or a reasonable problem/improvement variant, the existing
presentation response path retrieves and speaks its structured saved findings
instead of performing generic web research. The browser also displays that
evidence-backed answer while it plays. This adds no production permission,
workflow trigger, or runtime review gate: the Red Team remains planned
presentation context, and the producer retains every decision.

For Red Team improvement questions only, the presentation path now makes the
same bounded, server-only live web-research call used by the existing Control
Room fallback. Ada receives only saved Scripture/source-safeguard observations,
Theo only saved clarity/impact observations, and Cora only saved
feasibility/reliability observations. The request asks for concise current
recommendations from primary or authoritative sources, labels project-derived
observations separately from external recommendations, and returns verified
public source links for the on-screen response. “What did we do wrong?”
remains deterministic, local, and non-researching. If research is unavailable
or produces no attributable sources, each reviewer instead states that clearly
and returns the saved evidence-backed improvement priorities; no response is
stored and no production record, authority, or gate changes.

## Local Control Room IPv4/IPv6 recovery (2026-09-14)

The local Vite Control Room server was observed listening only on IPv6 loopback
(`::1:5173`), while the presentation page and some browser localhost resolution
paths use IPv4 loopback. Vite now binds dual-stack (`::`) on the same local
development port so both `http://localhost:5173/` and
`http://127.0.0.1:5173/` reach the UI and its existing local API bridge.

The standalone, presentation-only Agent Control Room artifact is now also
served during Vite development at the producer's exact local URL,
`http://127.0.0.1:5173/work/agent-control-room.html`. A narrowly scoped Vite
middleware serves only that HTML artifact and its existing `docs/assets`
portrait/branding/media files; it does not move the artifact, expose unrelated
repository files, or alter the normal React app. When opened through Vite, the
artifact uses the existing same-origin `/api` proxy rather than a cross-origin
port-4000 request; direct `file:` opening retains its prior local API base.

The existing local “How are you?” presentation cue also recognizes “What
inspires you to work here?” and returns the same saved, addressed-agent reply.
It remains a presentation-only interaction and does not send a production
message, alter agent authority, or access project data.

## Mabel portrait candidate (2026-09-16)

A non-destructive Mabel control-room portrait candidate was created at
`docs/assets/control-room/agent-portraits/mabel-control-supervisor-candidate-v2.png`.
It preserves the approved Mabel identity and remains private presentation
reference art only; it is not approved, wired into the control-room UI, or used
as a HeartWord production or Scripture-media asset.

Following producer feedback that the earlier phone-operator visual did not
represent Mabel's supervisory role, the active
`mabel-control-supervisor.png` was replaced with a coordinator portrait. The
replacement depicts review and delegation through a planning board, handoff
cards, portfolio, and pen, and deliberately removes the headset and phone
operator cues. The former active portrait remains retained as
`mabel-control-supervisor-operator-legacy.png`; neither asset is Scripture
media or a production record.

Mabel's presentation-only ElevenLabs voice was recast from Matilda to Lily
(2026-09-16). Lily's warm, confident, middle-aged British delivery better
matches the redesigned senior supervisor portrait and gives Mabel a distinct
control-room presence. The assignment applies only to staged control-room
speech, never source narration, canon-character voices, or production actions.
The producer listened to the supervisory sample and approved Lily as Mabel's
active presentation voice.

## Forestdale science companion archived (2026-09-16)

The producer retired the standalone science-demo companion. Its HTML and a
short archive record are retained under `docs/archive/` for reference only;
the served route, voice endpoint, and associated tests were removed so it has
no runtime connection to HeartWord.

## Strict TypeScript repair checkpoint (2026-09-16)

Before the approved architecture restructuring, the full strict server and
frontend TypeScript check was repaired from 22 reported errors to zero without
changing pipeline or production semantics. The repair validates SQLite query
rows at their boundaries rather than using unsafe row casts, handles unchecked
CLI and regular-expression values explicitly, and corrects the canonical-
likeness regeneration lookup to use the SQL field `character_name`. A focused
regression test confirms a failed character row can be found for recheck.

Validation after the repair: `npm run typecheck`, `npm test` (241 tests), and
`npm run build:web` all pass. This is a bounded reliability cleanup only; it
does not implement the separate agent-role architecture work.

## Production roster, recorded monitor, and correction learning (2026-09-16)

The producer workflow now exposes the approved nineteen-role production roster,
three independent milestone challengers, and optional presentation-only critics
with explicit declared-versus-implemented labels. The chapter monitor shows
only recorded role exchanges and negotiations, links an event directly to its
full saved contribution, and treats held/error events from superseded runs as
history rather than permanent current producer action.

Recorded producer corrections now create a source- and canon-version-contextual
candidate reusable lesson through one bounded text-model synthesis call. The
candidate is inactive until the producer inspects, edits if needed, and
activates it; synthesis failure records the candidate for review and does not
retry. Active lessons are supplied to matching briefs only, with language,
book, region, project, scene, and shot boundaries enforced. The saved run
brief shows the accepted lessons actually supplied. Explicit producer-wide
guidance can still be entered directly. This is application memory, not model
retraining; it does not alter verified Scripture, source audio, canon, or make
media calls.

Validation: strict typecheck, web production build, and all 31 Vitest files
(245 tests) pass. No live provider or production-media call was made during
this implementation.

Follow-up integrity review: scoped lesson targets now remain attached to their
actual shot or scene when supplied to a brief; guidance validation completes
before any persistent write, and related correction records are transactional.
Editing a lesson creates a superseding record plus action history rather than
rewriting the prior decision. The producer dashboard now makes both currently
applicable guidance and that decision history inspectable. The production
monitor treats completed runs and superseded negotiation rounds as history.
The control-room presentation and the production-crew communication contract
now use the current Orion, June, and Benny roles; the four declared specialist
roles remain visible as identity-free placeholders rather than invented
portraits.

Final verification replaced an unstable byte-for-byte comparison of two
independently AAC-encoded but semantically identical finishing renders with a
strict decoded-PCM equivalence check: exact sample length, maximum one-unit
16-bit rounding difference, and at most 0.1 RMS sample error. This retains the
test's duplicate-score and timing protection while excluding encoder rounding
noise. The four identity-free specialist cards are also included in the
default cast-only layout; Benny is explicitly outside its active production
crew frame. Full typecheck, web build, and all 245 tests pass.

An endpoint-level correction-learning regression test now uses an isolated
SQLite database, an ephemeral local Express server, and a mocked synthesis
response to verify the full producer path: invalid reusable guidance writes
nothing; a valid correction becomes a candidate; review creates an immutable
active successor and history; and only that matching book/language/region
lesson reaches a different chapter's brief, excluding disabled and
wrong-language records.

## Retained media library and candidate reuse (2026-09-16)

HeartWord now projects existing immutable generation attempts with verifiable
files into an idempotent retained-media library. The producer can browse image,
video, and extracted-frame records with their original project, shot, verse,
prompt, provider/model, review status, unselected-versus-origin-selected state,
and unresolved review context. A reuse action creates only a guarded target
shot candidate; it never replaces donor or target media, transfers approval,
or makes a provider call. Matching language and one approved regional canon
context are required. Video-frame extraction records immutable parent/timecode
lineage. This creates retrievable metadata for a future assistant without
implementing autonomous creative selection. Benny was removed from visible
control-room roster, selection, and idle presentation schedules; historical
records and files remain retained.

Chapter navigation now opens a selected persisted language/book/chapter
workspace rather than assuming the first project. Create-or-open is idempotent
for the unique project identity, while a new chapter remains empty and does
not inherit media, timing, or source work. Async shot/audio loads discard late
responses for a no-longer-selected workspace. This enables preparing a Mark 4
workspace without initiating its pipeline or asserting its source readiness.

Navigation acceptance tests now verify that opening/creating a normalized
Hatam Mark 4 workspace leaves Mark 2 shots and retained takes untouched,
creates no inherited chapter data, opens duplicate identity requests
idempotently, rejects invalid chapter ranges before writing, and treats Acts
as a distinct supported navigation identity. The navigation book range is a
UI identity guard only; it is not a claim that source or production approval
exists for any particular language/book/chapter.

Crew findings now carry a per-finding 0–100 agent confidence estimate and a
declared limitation beside severity, evidence, and requested change. The UI
labels it uncalibrated; it is not an authority, vote, or gate override, and
legacy saved findings remain visibly “not reported.”

The active Production Director negotiation log now also persists per-verdict
uncalibrated confidence and limitations with its feedback; old text-only log
rows remain unknown rather than assigned a synthetic score.

## QC Critic confidence handoff (2026-09-16)

The grounded image/video QC Critic now records each discrete concern with its
own evidence, severity, uncalibrated 0–100 confidence estimate, limitation,
and requested action in the same grounded response. The existing readable QC
report shows that context beside the grounded narrative and source provenance;
the saved review record also retains it for the next regeneration prompt.
Malformed new structured findings, including missing, non-finite, or
out-of-range confidence, are an incomplete review rather than an approval.

Confidence is advisory evidence for investigation, never an overall score,
vote, authority rank, or override of source, canon, cost, or producer holds.
Existing legacy QC records have no fabricated score and are shown to receiving
work as confidence not reported. The deterministic duplicate-face verifier is
also represented as an individual finding when it reports a duplicate. This
adds no calibration loop, analytics, provider call solely for scoring, or new
production stage.

Focused and full validation passed: strict typecheck, 35 Vitest files / 262
tests, and the web production build. No live provider or media call was made.

## Durable assembly and retained-evidence integrity (2026-09-17)

The isolated durable chapter acceptance fixture now continues through the
actual editing crew runner, validated Ada/Theo/Cora/Production Director
contributions, Picture Editor plan, and FFmpeg editorial renderer. It verifies
that a source narrator interval plus two separately producer-bound speech
intervals by the same speaker in the same verse remain in sequence, that the
rendered file exists, and that no extra ElevenLabs or Kling call occurs after
the selected candidates are reused. The defect exposed by this run was fixed:
editorial validation and cast-master lookup now use the exact original audio
segment identity, not an ambiguous `(speaker, verse)` match. Legacy
cast-master rows remain usable only when their old lookup is unambiguous.

Evaluation adjudication no longer hashes IDs or review rows when a retained
media artifact is missing. It reports an explicit unavailable result without
creating an evaluation case; when available, a shot case records the exact
selected generation attempt and its review state. This preserves evaluation as
human-reviewed retained evidence rather than synthetic provenance. No live
provider, production media, or Mark 4 work was performed.

The recovery ledger now also has an explicit producer reconciliation action
for an `uncertain` lease. It validates the current signed inputs, the complete
upstream dependency chain, and durable output/file checks before recording a
completion; it never issues a provider retry. Adoption refuses to overtake a
running or uncertain worker, preserving its write authority. Isolated tests
cover that live-lease hold and verified uncertain reconciliation before a
normal no-work resume.

At the media provider boundary, a thrown/lost keyframe response is now kept
as a `submission_uncertain` held attempt with the exact submitted prompt and
an explicit review note, rather than disappearing and causing an automatic
repeat provider request. A concurrent local media-stage call receives a hold
while the first provider Promise is active. These checks use isolated SQLite
and mocked provider seams while executing the actual media stage.

Fresh-chapter acceptance now uses a new Hatam Mark 3 project with a generated
DOCX and real FFmpeg audio under the normal source path. It executes actual
ingestion and proves project isolation; because the synthetic source has no
published pericope headings, actual scene breakdown holds rather than
inventing a scene plan. This is a deliberate readiness gate, not seeded stage
success or an assertion that the fresh chapter is production-ready.
The same isolated suite also supplies the required published title, pericope
heading, and parallel-reference structure, proving real ingestion and scene
breakdown create a fresh Mark 3 scene from source structure rather than Mark
2 data. It remains synthetic test evidence, not a source-language approval.

## Fresh reviewed full-chapter proof (2026-09-17)

An additional isolated Hatam Mark 5 acceptance test now follows one new
synthetic chapter through the normal durable orchestrator: low-confidence
ingestion first holds; a named reviewer submits the existing HTTP
source-alignment attestation against the exact DOCX, audio, English reference,
and alignment hashes; real scene breakdown, casting, crew planning, media,
voicing, lip-sync selection, per-shot FFmpeg assembly, Picture Editor
assembly, and finishing review then run. Provider/model seams alone are
mocked. The fixture uses approved synthetic Papuan canon and voice data,
explicit producer bindings for two distinct same-speaker source intervals,
and explicit candidate acceptance; narration is not lip-synced. A final rerun
reuses the durable ledger without another provider submission.

This exposed and fixed a ledger defect in the QC output check: it previously
required the currently-running QC execution to already be completed, making a
successful finishing review self-hold. QC now validates its retained approved
finishing run while preserving the existing completed-ledger path for recovered
legacy work. The proof uses temporary SQLite/assets only; it performs no live
provider call, production-data write, Mark 4 work, or push.

## Generic Gemini source-alignment evidence (2026-09-17)

Generic ingestion now applies the proven Mark 2 pattern without importing its
chapter-specific speaker identities or hand-tuned timestamps: recursively
bounded silence-derived speech intervals are sent to Gemini for a verbatim
source-text proposal, then placed by a weighted local monotonic-anchor chain.
Unanchored Scripture proposals receive a second, stronger-model fill limited
to the text between neighboring anchors. Each interval, including
announcements, empty responses, and failed placements, is retained as source
evidence. The timing is explicitly estimated alignment, never a forced-
alignment or native-language claim.

Before a provider submission, ingestion writes a durable `submission_started`
record. A lost response becomes `submission_uncertain` and holds the chapter;
it is never silently converted to a gap heuristic or automatically resubmitted.
Unresolved placements or less than 95% verified-text coverage also hold while
leaving intervals available for listening and source review. When Gemini is
not configured, a conservative silence-based estimate remains available for
provisional planning and requires named source review; tests disable the key
rather than relying on a production-code test bypass. The chapter-preparation
screen exposes original-reading interval playback and unassigned intervals.

Goal Guardian check: this is confined to Stage 1 evidence and the existing
producer workflow. It preserves the complete FCBH performance, adds no claim
of Hatam comprehension, no new stage, and no automatic decision reserved for
the producer, Ryan, or the language team. Full typecheck, 47 Vitest files / 286
tests, and the production web build pass; no live provider or production source
data was used in validation.

## Bounded source-evidence playback (2026-09-17)

The Chapter Preparation source-alignment list now uses a bounded native-audio
control: Play seeks to the displayed interval start, an end timer plus a
time-update guard stops precisely at its displayed end, and stopping resets
the next replay to that interval start. Timers are cleared on pause, unmount,
and chapter switch. This reads the unchanged source master in place; it makes
no clips, source edits, or production-record changes, and leaves all other
audio controls unchanged. Focused behavior tests, strict typecheck, and the
web build pass without provider calls.

## Honest source-alignment display (2026-09-17)

Generic Gemini matches now store their actual local ordered text-match score
(0–100) rather than a fabricated 0/70 confidence value. The Chapter
Preparation list labels matched text, opening/other non-Scripture audio, and
unresolved review-required intervals separately. It shows a numeric score only
for a matched local text comparison; it never presents that score as calibrated
Gemini confidence, timing certainty, forced alignment, or language approval.
Silence-only runs read “Estimated timing — no Gemini text-match evidence,” and
old rows without retained evidence remain explicitly legacy rather than being
retroactively assigned detail. This is a display/evidence correction only:
source media, source records, and pipeline authority are unchanged.

## Human Mark 3 alignment correction (2026-09-17)

Dan confirmed that the retained Mark 3 original-reading interval
239.321–240.940 seconds is “Simon the Zealot,” Mark 3:18. It is stored as an
append-only named human correction with exact segment identity, assigned text,
evidence, and current source/alignment hashes. The source-interval display
prefers this human-reviewed assignment and identifies its reviewer, while
retaining the original automated/unresolved evidence rather than overwriting
it. The same small correction path is available for a future named,
evidence-backed interval correction; it does not alter audio, source text, or
automatically create reusable language claims.

## Second human Mark 3 alignment correction (2026-09-17)

Dan also confirmed that the retained 55.733–57.990-second original-reading
interval is the narration “But they were silent,” the closing line of Mark
3:4. It is now an append-only human-reviewed correction attached to the exact
interval, attributed to Dan with the supplied gloss/evidence and current
source/alignment hashes. The source-interval list therefore presents Mark 3:4
and human-review provenance while retaining its earlier automated
non-Scripture result unchanged. Goal Guardian check: this is one explicit,
auditable producer correction, not a claim that generic alignment understands
Hatam or a change to source audio/text.

## Narrated paragraph-title source spans (2026-09-18)

Hatam DOCX titles are now recognized only when a non-verse line is immediately
followed by its parenthesized cross-reference line and then a verse paragraph.
They remain non-Scripture `paragraph_title` records with the published
cross-reference preserved. Generic Gemini alignment supplies these title words
as legitimate narrated source spans, identifies a matched title in Chapter
Preparation as “Narrated paragraph/section title,” and excludes title words
from Scripture-coverage arithmetic. Story Writer and Shot Director receive
the titles as optional scene-title context only; no automatic display
instruction is created. Existing Mark 3 non-Scripture intervals have no
verbatim automated span with which to prove a title match, so they are not
retroactively reclassified: run an explicit title-aware ingestion/review or
record a named human interval correction. Goal Guardian check: this preserves
published source structure and the narrator’s performance without inventing
Scripture assignment, title display, or language claims.

## Cross-reference editorial evidence (2026-09-18)

Paragraph-title cross-references now enter the alignment source stream as a
separate non-Scripture `cross_reference` span. A match is explicit evidence
that citation speech occurred and holds its film treatment for review; it is
never forced into a verse. A citation can be safely omitted only when a
matched narrated title is followed by a clean matched Scripture span with no
intervening speech evidence. Any matched citation, unresolved interval, or
missing clean Scripture resumption is a review hold. Story Writer and Shot
Director receive title context separately from cross-reference metadata, with
the default that citations are not film narration/on-screen text unless a
human resolves an exception. Existing Mark 3 has not been reassessed: run a
new title-aware alignment pass against the retained source (then review its
evidence) or record named human corrections; no provider or source call was
made here. Goal Guardian check: this safeguards the complete source
performance and prohibits both silent omission and invented citation content.

## Correction-safe re-ingestion (2026-09-18)

The Mark 3 re-ingestion foreign-key failure was caused by deleting
`original_reading` rows while append-only human alignment corrections still
referenced those rows. Re-ingestion now inserts replacement rows first,
remaps each correction only when the replacement has exactly the same source
start/end interval, then deletes the old rows in the same transaction. If an
equivalent interval is absent, it rolls back and holds rather than orphaning
or silently retargeting a correction. The real Mark 3 cached-evidence
re-ingestion completed this remap for both Dan corrections without a provider
call; it remains held for its pre-existing coverage review, not a database
failure. Goal Guardian check: this preserves immutable source assets and
human evidence while allowing a reviewable Stage 1 recovery.

## Mark 3:31–32 boundary correction (2026-09-18)

Dan confirmed that automated Mark 3 interval 385.645–399.645 seconds included
the initial word `Andigpoi` of the following speech. The source waveform's
stable preceding pause begins at 399.191 seconds. Append-only named boundary
overrides now end Mark 3:31–32 at 399.191 and begin the next retained interval
there, so no gap or duplication occurs and downstream users of source timing
receive the corrected boundary. The automatic interval/evidence remains
retained through each override's original timing and evidence. Goal Guardian
check: this is a specific producer listening correction; it neither changes
the source asset nor infers a broader Hatam timing rule.
