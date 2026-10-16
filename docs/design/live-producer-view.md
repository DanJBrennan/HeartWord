# Live chapter producer view

Implemented October 15, 2026. This extends the existing chapter workspace,
production monitor, stage entry points, saved crew/review/attempt/clip records
and producer controls. It adds no production stage, dispatcher, approval gate,
alternate timeline or external-editor dependency.

The product goal is PRODUCT_VISION's autonomous faithful editable chapter:
verified Scripture, the unchanged source-language performance and approved
regional canon lead to a reviewable film. USER_WORKFLOW's normal language /
book / chapter selection, inspect / correct / selectively rerun flow remains.
CURRENT_GOAL's source reconciliation, Avatar, emotional treatment, reference
handoff, preservation and existing Mark 4 holds remain controlling.

Acceptance for this concern: production changes appear in the open workspace;
current work, last saved progress, holds, next action, costs, reviews and
decisions are inspectable; planned imagery cannot pass for finished footage;
accepted material can be auditioned separately and as a developing reel;
network reconnect and chapter switches restore truthful, isolated state.

## Command/control console clarification — October 15

Dan's follow-up clarifies the desired presentation: a single master viewing and
command center with menus, resizable panels, timeline zoom/scrub, track enables,
pipeline/next-work/cost awareness, and a second cartoon-crew discussion tab. The
initial scrolling producer report supplied evidence but did not meet this spatial
workflow. This follow-up replaces its presentation while extending the same read
projection, saved edit/review contracts and existing controls.

Implemented layout:

- Chapter selection stays in the title bar. Chapter and Production menus open
  existing preparation, canon, crew/review/edit, generation, voice and library
  controls in a single focus-contained drawer. Escape returns to the console.
  Opening controls pauses playback and preserves form drafts/producer history.
- Storyboard/assets, program/source monitor and inspector share the upper area.
  Pointer or keyboard dividers resize widths; a horizontal divider resizes the
  bottom timeline. Each panel owns scrolling. Browser-local sizes are scoped to
  the chapter and can be reset; they carry no production authority. Small windows
  offer Storyboard/Monitor/Inspector tabs instead of squeezing three columns.
- Stage strip, truthful live/stale status, next action, active work/holds and cost
  summary remain visible. Inspector pages expose shot, activity, costs, sound
  and history. Duplicate observation/task evidence does not count as two jobs.
- Timeline zoom (1–16x), horizontal scrolling and a scrub playhead operate on a
  clearly labelled clock. Shot cards remain the proposed plan order when no
  executable timing is saved. Keyframes are labelled proposals, not footage.
- Crew discussion pairs existing portraits with persisted role replies, scoped
  directions, findings, confidence/limitations, run and pass metadata, original
  objections and recorded dispositions. Links select the affected shot. Registry
  roles retain implemented/declared status; portraits do not imply dispatch or
  ongoing conversation. Historical findings are labelled as such.

### Chapter timing and track audition

`producer-preview.ts` reads the latest current render's immutable
`chapter_render_manifests` and its exact source/cast mappings without modifying
or rebuilding them. Nonarray/custom legacy recipes, foreign/overlapping ranges,
rate-changing source maps and pre-restart renders cannot supply a new preview
clock. Their recorded program cuts remain inspectable. Missing voice provenance
is unreported; no cast is chosen by verse equality. A unique duration-matched
`composite_audio_source_map` is required for a saved cast placement.

For valid chapter timing, current accepted shot selections occupy their saved
placements and source offsets. Missing coverage stays black/hatched at its real
position; it never shortens the chapter, freezes a face, or invents footage.
Ambiguous component sets remain gaps until the existing editor supplies an
assembled shot. The accepted subset reel remains separately available and
explicitly skips gaps with picture-only audio treatment. New acceptance is read
into both views without reopening; the subset reel can follow appended arrivals. Reordering, replacement or withdrawal pauses the
subset reel with an explicit review notice instead of silently shifting its clock.

Review tracks are V1 accepted picture, V2 explicitly proposed keyframe coverage,
A1 one selected speech performance (saved cast/narration OR source OR off), A2
applied ambience/effects and A3 applied music. Source/cast alternatives cannot
stack. Only the approved finishing run referenced by the render's actual
`apply_finishing` command supplies soundtrack cues and gain bounds; proposed or
unplaced sound stays an individual audition. Undo is respected. Raw provider
video remains muted. The native track preview is labelled an audition, not the
finished ducked/color-adjusted mix; Recorded cut plays that actual program mix.

`TimelineMonitor` uses the audible speech clock, actual saved file offsets and
rate 1 independently of picture changes. Contiguous speech placements from the
same file coalesce, retaining narration across shot/verse boundaries. Loading
holds every enabled player and the preview clock; the group resumes only when
all media are ready. Source speed is never adjusted to chase picture; source
wording, saved pauses, edit history and field/release authority are unchanged.
The intentional preview media group permits speech plus sound beds while any
independent audition pauses that entire group. Unmounting, chapter switching,
opening tools, missing/undecodable media or loss of evidence stop preview.
Browser playback/scrubbing is an inspection aid, not frame-addressable final QC.

Costs show existing cumulative ledger estimates, outstanding reserved bounds,
committed/remaining budget where reconciled and the $200 ceiling. A complete
estimate-to-finish is **Unreported**: there is no saved whole-film remaining-work
forecast to honestly project. This is an evidence limitation, not a newly invented
pricing model or a new spending approval flow.

## What was already present

| Category | Evidence and boundary |
|---|---|
| Implemented | Independently runnable stages and durable `stage_executions`; saved crew runs/events and qualitative FDL/contribution history; retained generation attempts, coverage beats, selected clip records, source/cast maps, reviewed sound assets, renders/manifests and typed producer decisions. The crew panel already polled every five seconds. |
| Existing gaps addressed here | Shots and old dailies loaded only on opening; the “rolling reel” was a candidate list with a null reel path. The old interaction monitor covered a subset of work and could label every hold as producer input. Optional lesson lookup failure could hide otherwise available crew records. |
| Declared | Mabel, June, Dottie, Pippa, Gus, Vera and Kit retain their registry runtime classifications. Showing their ownership does not dispatch a worker. Presentation conversations do not become production evidence. |
| Historical | Original architecture/skeleton statements and dated production reports do not establish current completion. Restart decisions exclude pre-cutover footage from new dailies while retaining its bytes, review and cost history. |
| Proposals | Filmora integration and more general external visualization remain optional evaluations. Existing FDL core/Bible-regional schemas and accepted qualitative snapshots are reused, not replaced by another film-description language. |

## Read projection and live evidence

`GET /api/projects/:projectId/production/view` is a synchronous, read-only
projection in `src/server/production-view.ts`, with `Cache-Control: no-store`.
GET never starts/retries a stage, registers media, accepts a candidate, reserves
cost, repairs source or migrates a historical database. Missing/malformed
required evidence returns an unavailable response; a missing historical
video-progress table is an explicit uncertainty while other records remain
inspectable.

`observed-work.ts` records only code actually executing in the current process.
Existing stage entry points, crew calls, soundtrack requests and video-job
callbacks register/release that observation without changing their saved
production inputs or outputs. This is liveness evidence, not another saved
production authority or queue. A restarted process cannot inherit the
observation. Persisted running/uncertain requests still need their existing
reconciliation, never an implicit retry. Another process's work is conservatively
unverified here; a PID alone does not prove current ownership.

| Display state | Required evidence |
|---|---|
| queued | Explicit provider queue progress, or an explicitly labelled future stage with no execution: planned, not dispatched. |
| working | Actual executing entry point in this server; this is distinct from the timestamp of last saved progress. |
| awaiting external | A currently owned, fresh submitted/generating provider task; soundtrack generation also uses its exact owning run. |
| awaiting Dan | An unresolved saved human hold. Automated review holds are not automatically requests for Dan. |
| held | Saved stage/review disagreement or required assets/evidence. Existing accountable roles/review controls resolve it. |
| failed | Explicit retained stage/job failure. Failure never supplies a reel item. |
| uncertain | Lost ownership, incomplete/uncertain request, unavailable or over-30-second-old provider progress, missing selected media, ambiguous overlap or absent historical execution evidence. |
| finished | A recorded completed stage execution, qualified by displayed evidence/holds; finished production additionally needs all stages and an available render. This is not field or release approval. |

The top view separates current work from the saved stage reached. The pipeline
strip and full evidence remain visible even when there is no activity. Last
progress uses actual recorded event/completion/review/decision timestamps,
not page-open time. Completed provider jobs do not imply review acceptance.
The old crew stream is retained as expandable interaction history; the new
view is the current status surface.

Serial 2.5-second polling rejects late replies after cleanup/chapter switches.
Failures retain an explicitly stale snapshot; a 15-second request deadline
also marks a busy/unresponsive server unverified. Reconnection resumes reading
the same saved chapter. Existing shot/cast/project controls refresh every five
seconds without resetting producer drafts. Optional unavailable correction
lessons no longer suppress crew records and controls.

Some existing rendering/preparation tools use synchronous FFmpeg calls and
can block the server event loop. They publish their next saved result when
they yield. During a prolonged block the view shows stale/unverified state;
it does not fabricate frame/encoding progress. This change does not rewrite
those renderers or introduce another worker system.

## Storyboard, media and sound

Shot order and scene scope come from the chapter's saved scenes/shots. Cards
show keyframes, exact verse labels, planned action/framing and developing
coverage. Missing keyframes get deterministic annotation placeholders marked
**PROPOSED PLAN — NO KEYFRAME**. Existing images can illustrate a proposal;
they do not establish newly approved canon, geometry or footage. This is the
cheap preview choice: no full keyframe usage or image API calls are consumed.
Opening, ending and editorial records are explicitly labelled plans/status.

The inspector keeps candidate/accepted/not-selected/historical records distinct,
including alternate coverage keyframes. Selected clip rows are retained even
when their files disappear. Available current accepted video is eligible for
the developing reel; a missing, empty, outside-root, failed/held or pre-restart
asset is not. A decode/load failure also excludes that path for the browser
session without changing saved approval.

The existing editor's latest accepted `assemble_shot` selection takes precedence
over its component takes and older assemblies. Without an assembly, nonoverlapping
accepted clip intervals can supply developing coverage. Overlapping retained
selections without an authoritative assembly are labelled uncertain and omitted
instead of guessing an edit. No retained selection is deleted or rewritten.

The rolling reel plays this available subset in scene/shot order, for one scene
or the chapter, and follows later accepted material when it arrives after its
current position. It skips gaps and is explicitly **picture-only**, not a
source-timed completed film. Restart it to review material arriving earlier in
shot order. The latest recorded chapter cut supplies the real program mix;
pre-cutover renders are labelled historical. Exact/frame-addressable final
review and editing remain in their existing workflows.

Source/cast, reviewed ambience/effects and music each have audition controls.
An exact shot binding also exposes bounded source and mapped cast-file windows
beside that shot. Shared cast files use saved offsets; ordinary verse labels
do not create new speech cuts. Saved planning Scripture/reference words retain
their originating revision and are not a new source attestation. A document-wide
playback guard pauses other groups before any independent audition, including
existing editor players; coordinated preview permits one speech choice plus
explicitly enabled sound beds. Raw video starts muted. Auditioning changes neither mix nor
source wording, speed, order, pause placement or accepted media.

Relevant structured role contributions, original objections, resolutions and
older scoped role replies appear beside affected shots. Chapter decisions and
full saved structured outputs remain expandable. No hidden model reasoning is
claimed. Producer edits and accepted source/canon history retain precedence.

Cost display reuses the immutable film ledger and existing `checkFilmSpend`
reconciliation/reservation gate, including outstanding crew/Avatar bounds and
unreported liabilities. The ceiling remains $200 cumulative direct cost per
film. Unknown remaining budget stays unreported. Built-in image usage is
labelled included with unreported billed attribution; a recorded zero does not
claim it consumed no usage. Viewing makes no paid call or spending authorization.

## Native view, installed Filmora and Blender

Capability check: October 15, 2026. Local registry/executable metadata identifies
**Filmora 15.0.12.16430** and **Blender 5.2.1 LTS**. Do not substitute the latest
vendor guide's version for the installed version.

| Option | Verified capability | Fit and limits |
|---|---|---|
| Native HeartWord (implemented) | Current saved stages, reviews/costs, storyboard, media inspection, scene/chapter subset reel and bounded solo audio auditions update without reopening. | Recommended authoritative production view. It deliberately adds no general NLE editing surface. |
| Filmora 15.0.12.16430 (optional) | Vendor's [Windows import guide](https://filmora.wondershare.com/guide/importing-media.html) documents media/image-sequence and Timeline XML import; its [export guide](https://filmora.wondershare.com/guide/export-to-local.html) documents rendered media and Final Cut Pro 7 XML export. | The installed startup UI appeared, but a stable editor window was unavailable for verifying those menus/round-trip in this exact build. Current guides do not establish which XML features this older build preserves. No official scripting/automation API or CLI contract was verified. Do not promise unattended synchronization or reverse-engineer `.wfp`. No Filmora integration is proposed for implementation here. |
| Blender 5.2.1 LTS (optional) | Version-specific [strip API](https://docs.blender.org/api/5.2/bpy.types.StripsTopLevel.html) documents movie/image/sound creation; [movie import](https://docs.blender.org/manual/en/5.2/video_editing/edit/montage/strips/movie.html) references original media and optional sound strips. Its [command-line manual](https://docs.blender.org/manual/id/5.2/advanced/command_line/index.html) documents automation/batch processing. A local background/factory-startup/autoexec-disabled probe returned `new_movie`, `new_image`, `new_sound`, render-path and open/save APIs on 5.2.1. | Useful optional derived visualization or existing editor workflow. Existing `scripts/blender/export_timeline.py`, dependency preservation and camera snapshots remain available. No standard EDL/XML exchange or automatic two-way creative/approval synchronization is established by those APIs. |

Recommendation: keep the native view primary. If external interchange is later
chosen, first smoke-test the exact installed build with disposable clips,
separate source/cast and ambience/music tracks, trims and frame rates. Check
what survives export/reimport and hash-bind any resulting imported timing using
the existing cut-manifest controls. A derived external file never acquires source,
canon, cost, approval or edit-history authority. No existing `.wfp` or `.blend`
was edited or saved by this evaluation.

## Validation and retained demonstration

New tests live under `tests/web/`: evidence-based states, external completion
versus acceptance, absent/empty media, restart cutovers, current assembled-shot
selection and ambiguous overlap, exact source/cast offsets, scoped disagreements,
resolved history, cumulative spending/reservations, read-only and historical
database reads, live route changes/reconnect and chapter isolation. Polling tests
cover disconnection/recovery, old-project late replies, stalled servers and solo
playback. Existing source, crew, media, sound, assembly and preservation suites
remain required.

The reopenable fixture is
`HeartWordData/scratch/production-view-demo-2026-10-15`; launch with that exact
`HEARTWORD_DATA_DIR` and `npx tsx scripts/production-view-demo.ts`, on loopback
port 4026. A visible banner labels it synthetic. External/provider requests and
ordinary production mutations are disabled. Labelled demo actions simulate
accepted arrival, external progress/failure and loss/recovery of the read endpoint
using the same database/production routes. Its generated test patterns/tones,
scripted review acceptance and role replies are mechanical evidence only,
not Hatam, canon, acting, field or release approval. The full state remains in
`workflow-evidence.json`; screenshots are `outputs/producer-view-*.jpg`.

`scripts/inspect-production-view.ts` opens the actual DB query-only, without the
migrating client, to check all existing chapters and compare DB hashes/render
inventories. It performs no stage, repair, provider call or acceptance. Evidence
is in `outputs/producer-view-preservation-*.json` and compatibility JSON.
Test logs are `outputs/producer-view-tests*.txt`. An initial full run passed;
a subsequent run under simultaneous test/typecheck/Blender load hit existing
five-second test timeouts/connection reset, so the final complete run limits
Vitest to two workers rather than weakening assertions or changing timeouts.

Initial scrolling-view validation (historical): **687 tests in 107 files pass**, including 21 new producer-view
and polling/playback tests. `npm run typecheck`, `npm run build:web` and
`git diff --check` pass. Final complete-suite log:
`outputs/producer-view-verified-tests.txt`. Browser observations and separate
installed-tool evidence are retained in `outputs/producer-view-browser-proof.json`
and `outputs/producer-view-external-capabilities.json`.

No production film was restarted, regenerated, reapproved or charged. Direct
provider submissions for this work are zero. Assistant included usage and billed
cost attribution remain unreported. Your dot/live Mabel dispatch is not exposed
in this session; Mabel remains declared. Plugin searches found no suitable
connected SMS/Your dot transport (an unconnected sales CRM result is not a
verified SMS delivery service). Completion is reported in this ChatGPT chat;
SMS to Dan's supplied number ending 8114 is not claimed.

## Initial view Goal Guardian checkpoint (historical)

This dedicated pass checked the result against PRODUCT_VISION's autonomous
pipeline, source/canon/performance and inspectable corrections; CURRENT_GOAL's
active holds and preservation; and USER_WORKFLOW's chapter isolation and
watch/correct/selectively rerun flow. It found and corrected duplicate React
keys, a historical progress-table compatibility gap, pre-restart reel eligibility,
duplicated assembled/component playback and ambiguous overlapping selections.

Scope passes: the view consumes the same saved production state and existing
review/control contracts, with no new producer chapter-plan signature, automatic
retry, paid image fallback, worker roster or unrelated feature collection.
Provisional drawings consume no generation usage. Existing source speed/words,
approved canon, assets, producer decisions/history, field review and release
authority are preserved. The synthetic live workflow demonstrates inspectability
and restoration, not real-film quality. Synchronous renderer progress, unknown
external-process activity, exact-build Filmora interchange and unavailable SMS
remain explicit limitations. No new product decision from Dan blocks this native
view; choosing a later external integration or notification transport is separate.

## Separate Goal Guardian review — command console follow-up

Dedicated review against PRODUCT_VISION, CURRENT_GOAL and USER_WORKFLOW after
implementation (not the implementation pass): the product serves autonomous
faithful film creation and producer watch/correct/selective rerun. The initial
scrolling report missed Dan's clarified console presentation. The replacement
now keeps the chapter, pipeline, panels, transport and timeline together, with
existing decisions/edit controls reachable through menus and genuine recorded
crew discussion beside affected shots. No general NLE, new production stage,
parallel saved state, dispatcher or chapter-plan signature was introduced.

This pass found and corrected affected-shot selection resetting on monitor
remount, duplicated liveness/task counts, a virtual clock that could advance
past delayed speech, and lost playback errors. It conservatively holds ambiguous
component placement and unknown legacy voice provenance rather than guessing.
Missing coverage remains a gap; proposals cannot become completed footage.

Source words/speed, verified Scripture, approved regional canon, retained assets,
producer decisions/history, cumulative cost/outstanding-charge gates and existing
field/release approval remain controlling. No generation API was called and no
production data was migrated. The synthetic demonstration proves controls,
refresh/reconnect and media clock mechanics; it does not establish film quality.
No additional product decision from Dan is needed for the native console. Optional
external-editor interchange, notification transport and a recorded remaining-work
forecast remain outside this bounded implementation, with limitations displayed
honestly. Final checks and preservation evidence are recorded in CURRENT_GOAL.

Final console validation: **698 tests / 108 files pass** (32 producer-view,
playback/clock and timeline tests), with TypeScript, production web build and
diff checks passing. `outputs/producer-console-verified-tests.txt` records the
complete run. `outputs/producer-console-browser-proof.json` retains actual UI
observations of held/accepted coverage, one active task, failure evidence and
rolling continuation from 2/2 seconds to 4/4 seconds after acceptance without a
new Play action. Desktop, compact and crew screenshots are retained beside it.
Reconnect/stale display, chapter isolation, resizing/zoom/scrub, menu access and
source/cast offsets/rate were checked in the isolated app. The production DB
hashes match, all 89 render inventory entries match, and all three real chapter
projections succeed read-only (`producer-console-preservation-result.json`).
No new Dan decision blocks this console. Goal Guardian result: passes with the
explicit legacy-map, final-mix, remaining-estimate and transport limits above.

## Chapter inventory image proposal — October 15

Dan requested a visual concept for book/chapter inventory and a separate cast
discussion/animated-log tab. The saved image is
[`producer-chapter-inventory-concept-v1.png`](../assets/control-room/producer-chapter-inventory-concept-v1.png).
Its two artboards are alternative tab states of one control surface. This is a
static proposal, not implemented runtime or an animation file. All chapter
statistics, portraits and exchanges in it are illustrative sample data; it
neither reports real-film progress nor adopts replacement branding/role artwork.

The product goal remains the faithful autonomous chapter and the producer's
chapter selection/inspection workflow. Visual acceptance: addressable books and
chapters, chapter status, automatic Source Material Ready when both raw audio
and chapter text are available, independent alignment/character identification/
per-character canon readiness/cast-run fields, separate keyframe/video/lip-sync
counts and retries, plus a discussion tab with playback/scrub controls for an
animated presentation of saved events. File availability is explicitly distinct
from source verification. The image shows held/missing work and an unresolved
discussion rather than inventing completion or approval.

Separate Goal Guardian visual review: all requested fields and both tab states
are represented. Sample-data and recorded-playback labels preserve the distinction
between a proposal, real saved evidence and active workers. Actual auto-population
and animated-log behavior remain proposed; no runtime, production records, source,
canon, accepted assets, edit history or approval gates changed. No implementation
tests were needed for this image-only artifact. Generated with the built-in image
tool in one call; included usage/billed attribution is unreported, with no paid
image API substitution. The complete prompt is retained at
`outputs/producer-chapter-inventory-concept-v1.prompt.txt`.

## Live chapter inventory and recorded discussion — October 15

Dan subsequently authorized building the proposal into HeartWord. The static
image above stays historical/illustrative; the implementation reads real saved
records. Product goal: faithful autonomous chapter production with the producer
able to select, inspect, correct and selectively rerun the same saved chapter.
Acceptance is automatic source-file readiness, independent alignment/identity/
canon/casting evidence, generation/retry counts, and animated replay of actual
saved cast/crew discussion, live refresh and truthful reconnect/chapter isolation.

### Inventory evidence contract

`GET /api/projects/inventory?language=hatam&book=mark` is a no-store read projection,
not a stage or workspace creator. It lists Genesis and the NT already understood
by the source catalog and retained project identities; production creation remains
limited by the existing Mark/Acts/Genesis contract. Missing workspaces remain
unstarted. Explicit creation/opening calls the existing project route; opening a
saved chapter uses the same producer controls, decisions and edit history.

- Source Material Ready requires two existing nonempty regular files at the
  raw audio and translated chapter-text paths. Saved source bindings take exact
  precedence, otherwise complete legacy/catalog pairs use existing discovery
  rules. No alternate edition, reference translation or generated speech fills
  missing input. This availability check makes no alignment/source attestation
  and does not require an English reference merely to report the two inputs.
- Alignment/casting report existing execution evidence and saved intervals /
  shots. Retained legacy shots never imply a recorded casting execution. Human
  source-review evidence is displayed separately from current gate validity.
- Saved visual cast IDs and audio speaker IDs are identified as such. Visual
  canon availability requires approved identity/version and an available
  non-comparison reference. Speech-only IDs add no new visual-canon requirement.
  Full casting and QC reviews remain in the existing workspace.
- Media counts retain attempt records, unique available files by category,
  generated/reused/derived/supplied origin, accepted files and missing/unusable
  results. A wrong-kind file cannot count as available footage. Assembly/audio
  edit records are excluded from generated clips. Availability is not approval,
  selection, usable coverage or chapter completion.
- Retries are additional recorded generated attempts for the same target and
  operation. New coverage targets, draft-to-final operations, retry verdicts and
  reused/derived/supplied outputs are not counted as submitted retries. Historical
  intent and provider-internal retries may be unreported. The UI states this
  definition rather than asserting a historically complete retry audit.
- Current production excludes attempts before the existing restart cutoff.
  All retained history is separately selectable; cumulative $200 film costs,
  outstanding-charge holds and all production gates stay authoritative.

### Actual discussion and animated replay

`GET /api/projects/:projectId/production/discussion` merges `production_events`
with retained `director_negotiation_log` entries in stable timestamp/sequence
order. It preserves the saved role, original timestamp, pass, run/phase, summary,
verdict/error, full output and shot scope. Executable registry aliases resolve
owners; Production Director is not relabelled Mabel. Presentation scripts and
sample dialogue never enter this feed. Missing history and malformed structured
outputs are explicit evidence gaps/uncertainty, never invented approval.

Replay uses bounded presentation pacing (4–12 seconds per entry, adjustable
speed), with play/pause, previous/next, restart, scrub and role/run/shot filters.
Cartoon portraits, an active highlight and scrolling log animate actual entries;
original dates stay visible. Reduced-motion settings disable animation. No TTS,
speech playback, agent work or original timestamp rewriting occurs. Historical
verdicts are distinct from current structured planning objections/dispositions.
Affected-shot links open the same chapter's producer inspector. Whole-chapter
shot lists are expandable to keep the current contribution readable.

The existing serial polling helper refreshes every five seconds. Replies must
match the selected identity; chapter switches clear the replay. Failures mark
the retained snapshot stale and pause playback. An append preserves position;
edited, removed or reordered history resets playback with a notice. GET reads
work under SQLite `query_only`, without binding sources or updating any records.

### Real-data demonstration and limits

`scripts/producer-inventory-preview.ts` opens the actual HeartWord DB read-only,
serves the same projections and built UI at port 4027, and labels the demonstration
as read-only. Production mutations, migration/seeding and provider calls are
disabled there; normal HeartWord retains its existing edit/run routes. This is
separate from the earlier synthetic port-4026 mechanics demonstration.

The real Hatam Mark catalog has 16 available source pairs and three saved
workspaces. Mark 2 has 50 retained director exchanges; Mark 3 has 297 exchanges
(134 older negotiations and 163 production-role events); Mark 4 has 33 role events.
Their existing holds/uncertain liveness are retained. These records establish
inspectability, not new Scripture, acting, canon, field or release approval.
Internal historical retries, exact remaining-work forecasts, unsupported books
and missing live-worker observations remain explicit limits. No new product
decision from Dan is needed for this inspection/replay concern. Existing Your
dot/live Mabel and SMS transport limitations remain unchanged; no delivery is
claimed. No generation is requested and no film spending is authorized by a
browse or replay action; included assistant usage/billed attribution is unreported.

### Separate Goal Guardian review — inventory implementation

Dedicated review after implementation checked PRODUCT_VISION's faithful
autonomous pipeline and inspectable corrections, CURRENT_GOAL's existing holds
and preservation, and USER_WORKFLOW's chapter identity / watch-correct-selective
rerun flow. Result: passes this bounded concern. The new inventory and replay
use existing saved inputs, attempts, reviews and role contracts; they introduce
no new chapter-plan signature, production worker, paid-image fallback, editor,
provider, film launch or new source/canon authority. Manual and autonomous work
remain on the same saved production state.

This pass narrowed an overbroad casting-notes summary, separated the open
workspace label from the chapter being browsed, made multi-scene shot links
unambiguous/expandable, rejected wrong-kind footage files, preserved malformed
reply evidence and removed a partial newer-event badge that omitted legacy
exchanges. Tests and actual browsing verify the corrections; history is retained.

Validation: **719 tests in 110 files pass**, including 21 new inventory/discussion
tests under `tests/web/`. TypeScript, production web build and diff checks pass.
Tests cover source arrival/removal, exact binding/edition, no auto-creation,
query-only reads, canon gaps, restart scope, retry semantics, missing/wrong-kind
files, malformed replies, chapter isolation, actual routes and replay ordering.
The live browser demonstrates current/history counts, original saved text
matching, Mark 2/3 isolation and empty Mark 1 history, advancing replay, role
filtering, end seek, affected-shot navigation, compact layout and reconnect
without reopening. Disconnect pauses playback and marks evidence stale;
reconnect restores the same chapter/position and keeps playback paused.

Evidence: `outputs/chapter-inventory-verified-tests.txt`,
`outputs/chapter-inventory-real-evidence.json`,
`outputs/chapter-inventory-browser-proof.json` and the `chapter-inventory-real-*`
screenshots. `outputs/chapter-inventory-preservation-result.json` records the
unchanged production DB hash, all **89** retained render inventory entries, and
three successful read-only chapter projections. No production migration,
generation, approval or film charge occurred. Existing source words/speed,
regional canon, accepted assets, edit history, cost/outstanding-charge gates and
field/release requirements are preserved. Historical retry intent/internal
retries and unavailable transport remain limitations. No new Dan decision is
required to use the native inventory and replay.

## Normal interface cutover — October 15

Dan authorized using the inventory/producer console as the normal interface
with existing editing and production controls enabled. This serves the same
faithful autonomous chapter and watch/correct/selective-rerun workflow.
Acceptance: one normal entry point against the actual configured data root,
working existing control routes, and preserved source/canon/cost/approval gates.
This changes the earlier read-only demonstration status, not the authority of
any chapter source, canon, accepted take, producer decision or release review.

`npm start` builds the UI and runs `src/server/index.ts`, which retains existing
database initialization/presentation-only seeds and mounts `createHeartWordApp`.
That factory serves the built inventory/console and the unchanged production,
project/edit, character, voice and control-room routers on one origin. The normal
default is `http://127.0.0.1:4000/`; Vite proxies to that same loopback backend.
Unknown API paths return JSON 404 and application HTML is served without stale
preview restrictions. The optional historical preview/demo scripts remain
separate; their running port-4026/4027 instances were stopped for this cutover.

No production handler, provider selection, source/canon attestation, spending
reconciliation, cost reservation or approval rule is bypassed or replaced. All
controls still operate on the shared saved production state. A page load does
not dispatch a film, recover interrupted work, clear a hold or grant approval.
Paid actions retain existing finite attempts and outstanding-charge checks
under the same $200 cumulative film ceiling. Built-in keyframe handoff remains
the existing contract; no paid image API substitution was added.

Normal startup was first exercised on a copy of a SQLite-supported backup of
the actual data. Preflight and live cutover preserve original column values
for all existing tables and the existing foreign-key findings; only the missing
`video_generation_jobs` table is added, empty. The DB file hash changes from
normal schema initialization; original production records remain identical.
All 89 retained render inventory entries are unchanged. The backup location is
recorded in `outputs/normal-interface-baseline.json`; this DB-only cutover backup
does not claim whole-media or cloud disaster protection.

Live inspection found and corrected a navigation bug: opening the already
selected chapter invalidated its polling epoch without changing the effect's
chapter key, clearing its shots and leaving refresh stopped. Same-chapter open
is now navigation and preserves loaded controls/drafts. Actual chapter switches
retain the existing isolation/reset behavior.

Integration tests exercise the exact app factory/mounted routers: serving the
normal app and media/live inventory without implicit writes, successful and
idempotent producer edits with retained before/after history, chapter isolation,
missing-source holds, the $200 reconciliation limit, retained spending holds,
and explicit unknown-API failures. These tests use isolated synthetic state;
no actual film edit or paid generation is used as a test.

### Separate Goal Guardian review — normal interface

Dedicated review after the cutover checked PRODUCT_VISION's faithful autonomous
pipeline, CURRENT_GOAL's preservation and existing chapter holds, and
USER_WORKFLOW's chapter selection / inspection / correction / selective rerun.
Result: passes. The normal UI uses the same saved production state and unchanged
operation handlers. It adds no stage, worker, dispatcher, approval, production
state, provider or full-editor dependency. No chapter-plan signature is added;
app startup does not launch work or discharge existing gates.

The review confirms that same-chapter navigation preserves the loaded editing
workflow while genuine chapter switches retain isolation. Original production
records, source wording/speed, approved regional canon, accepted assets,
producer decisions/edit history, cost reservations and field/release authority
remain controlling. The existing production-image adapter still rejects paid
API substitution for a built-in assistant keyframe handoff. Declared agents
remain declared; replay does not create worker liveness or approval.

Actual browser proof opens the normal Mark 4 workspace, loads the real control
records, confirms enabled storyboard and Picture Editor controls, and retains
96 existing shot-comment fields plus an unsaved draft through inventory/reopen.
The test draft was cleared without submission. Finishing remains disabled where
the actual saved approvals require it. The real 33-entry Mark 4 discussion is
inspectable. No production action was submitted as a live-data test.

The unchanged original-row digests for every existing table, unchanged foreign-
key results and 89 retained render inventory entries are recorded in
`outputs/normal-interface-preservation-final.json`. Preflight and DB backup
details remain in `outputs/normal-interface-baseline.json` and
`outputs/normal-interface-preflight-preservation.json`. Browser observations and
screenshots are under `outputs/normal-interface-*`. Existing historical timing,
unknown-cost/outstanding-charge and release holds remain limitations on
production, not a read-only restriction on the interface. No new Dan product
decision is required. No film generation or spending occurred; assistant usage
and billed attribution remain unreported. Your dot/live Mabel/SMS transport
availability is unchanged; completion is reported in ChatGPT and SMS to the
supplied number ending 8114 is not claimed.

Normal-interface final validation: **723 tests / 111 files pass**, including four
new full-app integration cases. TypeScript, web build and diff checks pass.
The final complete suite is `outputs/normal-interface-verified-tests.txt`;
normal-interface browser and preservation artifacts above retain the actual
workflow evidence. The normal server remains running on port 4000; the browser
is left on the real producer console with production/edit routes enabled.
