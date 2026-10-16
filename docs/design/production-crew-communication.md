# Production Crew Communication Protocol

## Status and purpose

This is HeartWord Studio's authoritative production-role contract. It serves
the producer workflow: verified Scripture, source audio, and approved regional
canon enter a chapter; bounded, inspectable proposals and reviews lead to a
producer-reviewed film. Runtime labels in the application state what is
implemented; this document does not turn every named role into a live worker.

Every operation uses an immutable chapter brief: source/reference hashes,
measured source audio, approved canon and versioned assets, accepted media,
scoped producer decisions, spend/retry bounds, and prior evidence. Every
contribution records owner, input versions, verse/audio/shot scope, rationale,
evidence, status, and destination. No role may alter verified Scripture,
source performance, approved canon, producer holds, or another role's record.

Each newly reported finding or production-director verdict also records an
uncalibrated 0–100 agent confidence estimate and its limitations. This is
specific to that claim, distinct from severity and evidence, and helps the
next reviewer decide what to investigate. It is never a vote, an authority
ranking, a calibrated probability, or a way to waive source/canon/cost/human
gates. Legacy records without the fields remain “not reported.”

## Roster and authority

The nineteen production roles are Mabel (Production Coordinator), Rufus
(Creative Director), June (Source and Alignment Specialist), Miriam
(Scripture and Cultural Reviewer), Dottie (Casting and Canon Steward), Pippa
(Storyboard Planner), Leon (Cinematographer), Tessa (Choreographer), Arlo
(Production and Staging Designer), Costume Designer, Lighting Designer, Orion
(Script Supervisor / Continuity Reviewer), Gus (Generation Specialist), Vera
(Media Quality Reviewer), Kit (Dialogue / Lip-Sync Specialist), Nell (Picture
Editor), Sam (Sound Designer / Mixer), Composer, and Colorist. Costume,
Lighting, Composer, and Colorist are unnamed role specialists. Benny is
historical presentation material only; Nell and Mabel direct assembly, render,
encode, and package tools.

Mabel owns run state, idempotency, finite retry/cost gates, stale-work
invalidation, recorded handoffs, and escalation—not creative, Scripture,
canon, or release decisions. Rufus resolves bounded creative tradeoffs but
cannot waive evidence. Ada (fidelity), Theo (viewer clarity/dramatic impact),
and Cora (feasibility/cost/scope) are independent milestone challengers; they
advise and can raise evidence-backed holds, never dispatch work. Gene Siskel
and Roger Ebert are optional presentation-only critics with no production
authority.

## Required handoffs

October 15 extension: Nell's existing milestone call records `craftAssessment`
under `heartword-craft-v1`, separately from Director `acceptanceChecks` and
per-claim confidence. `creativeResponses` name exact retained finding IDs,
changes and evidence from the accountable role (or a dependent adjustment).
`CrewResult.creativeFeedback` retains comparisons, limits, selected pass and
stop/continue reason in the existing result; original events remain intact.
The [bounded policy](automated-quality-control.md#bounded-production-craft-feedback-october-15-implementation)
uses existing two-pass/cost bounds and Dan's continue-best-acceptable plateau
choice. It adds no worker, stage, provider, transport or FDL dialect; no reviewer
dispatches paid repair. Historic unreported ratings stay unreported.

1. June, Miriam, and Dottie establish source/alignment, fidelity, and canon
   readiness. Missing source, unapproved canon, or unresolved ambiguity is a
   producer hold.
2. Rufus supplies a passage-grounded treatment. Pippa coordinates Leon,
   Tessa, Arlo, Costume, Lighting, and Orion into a shot plan. Miriam and June
   review it; relevant challengers review material changes.
3. Mabel records proposal → objection → revision → resolution and dispatches
   only an accepted, versioned packet. Gus prepares or executes only
   authorized provider work; cost is reserved, results are idempotent, and
   failures never silently retry.
4. Vera reviews asset compliance; Orion reviews continuity; Kit reviews
   applicable speech treatment/sync; June retains source-alignment ownership.
   Repairs return to the accountable owner, never directly from a reviewer to
   a provider.
5. Nell assembles accepted coverage while preserving source performance; Sam
   mixes with speech priority; Composer and Colorist submit bounded parameters.
   Miriam, Orion, Vera, and milestone challengers review meaningful rough-cut
   changes. Human language/field/release approval remains with the producer.

## Learning from corrections

Advance emotional treatment (October 14 implementation) extends handoffs 2–5,
not the roster or dispatcher: Rufus owns the ordered source-grounded progression;
Nell, Sam, Composer, Miriam and milestone challengers review it before keyframes.
Both bounded planning passes challenge revisions; new runs retain treatment
concerns through the existing explicit objection/resolution history. Accepted
treatment stays in immutable crew contributions/results, with run/hash-pinned
downstream brief context and relevant generation prose beside existing FDL
facts. It does not define replacement camera/pose semantics or a second audio
timeline. Exact source/canon, producer edits and existing accepted media retain
authority. New generation requires this reviewed plan; old films acquire no
invented historical treatment. See the full
[planning contract](shot-planning.md#advance-emotional-treatment-implemented-2026-10-14).

The producer sees the plan and verdict in the existing chapter crew panel.
Applicable passing reviews permit automatic continuation under source, canon,
cost and approval gates; showing the plan is not a new chapter signature gate.
Finishing reviews each beat's effect on the actual audiovisual cut, and sound
reviews explicitly assess speech priority, cue entrances/releases, transitions,
levels and mobile clarity. Missing/uncertain evidence holds, without claiming
field, native-speaker or physical-device validation. No optional demo dialogue
is transferred by this implementation; such a transfer remains a proposal
requiring Dan's explicit adoption.

A producer correction is retained with source note, project, language, book,
chapter, regional canon and approved canon-version context. One bounded
text-model call may propose a reusable principle; it is inactive until the
producer inspects, edits if needed, and activates it. Failed synthesis is
visible and never retried silently. Editing creates a superseding lesson and
keeps prior lesson/action history.

Accepted lessons are application memory, not model training. They are supplied
only to matching briefs: chapter/scene/shot lessons remain in their actual
project and target; book, language, and region lessons must match stored
context; global scope requires explicit producer activation. Disabled and
superseded lessons are history. A brief displays exactly which accepted lessons
were supplied, including scoped target.

## Structured film information beside prose (2026-10-14)

**Original design checkpoint.** The runtime integration below supersedes the
runtime-gap statements in this section; retain the comparison and fixtures as
the design basis. Prefer one
accepted production record, immutable FDL snapshots and role-owned contributions.
This extends the handoffs above inside existing stages. It adds no dispatcher,
queue, worker roster, approval service or parallel production state. Acceptance
is clearer role exchange, retained disagreements and current accepted inputs at
generation, serving PRODUCT_VISION's autonomous faithful editable film and
USER_WORKFLOW's chapter selection, inspection, correction and selective rerun.
CURRENT_GOAL's Mark 4 source/continuity holds and other active work remain intact.

### What exists, and what this decision adds

| Category | Repository evidence / boundary |
|---|---|
| Implemented | `creative-direction/crew-types.ts`, `crew.ts` and `crew-store.ts`: saved `production_runs` briefs/hashes, ordered `production_events` prompts/outputs, typed directions/findings, two bounded passes, current-plan checks and retained producer guidance/edit history. Later calls see the current per-role contribution map. Only the Production Director's reconciled direction reaches the ordinary generation prompt. |
| Important limits | The map replaces each role's previous output during revision; the event log retains it, but later prompts do not explicitly carry every earlier proposal/objection. Findings lack stable lifecycle links. `reapproveCurrentPlanAfterProducerEdit` updates an approved run's brief/hash in place while retaining its result. The visualization export is a replaceable projection. Neither is a fully immutable snapshot journal. Legacy generation without a crew plan has a compatibility exemption. This design does not claim universal FDL enforcement today. |
| Declared roles | Registry entries for Mabel, June, Dottie, Pippa, Gus, Vera and Kit are contracts, not separately dispatched crew workers. Stages/tools implement parts of their work. Adding a contribution owner does not activate a role. |
| Executable roles | The registry controls phase participation of Rufus, Miriam, Leon, Tessa, Arlo, Costume, Lighting, Orion, Nell, Sam, Composer, Colorist, challengers and the internal Production Director. Historical aliases resolve for reading; new envelopes use canonical IDs. |
| Historical | The architecture's original single-pass/unbuilt-negotiation notes predate the current bounded crew. Old image-provider preferences and presentation personalities grant no current tools or authority. |
| Proposed here | Immutable accepted snapshots, explicit contribution lifecycle links, complete relevant disagreement context and revision-bound dispatch. Existing FDL v2 core and Bible/regional semantics stay unchanged. |

### One accepted record; copies are views

The accepted record is a **logical view of existing saved production records**,
not a new database or a mutable document owned by an agent. It identifies the
project, current accepted revision, exact brief/context hash, accepted FDL
snapshot(s), accepting review/resolution references, producer decisions and
linked contribution history. A scene-sized snapshot is sufficient; project-wide
source/canon context and cross-shot dependencies still apply. Manual controls
and autonomous stages must read and commit through this same saved state.

| Approach | Strength | Cost / failure mode |
|---|---|---|
| Accepted record + immutable snapshots + contributions (recommended) | One answer to what is accepted; exact reproducible inputs, ownership, objections and selective invalidation; offline copies remain useful evidence. | Requires careful revision comparison and atomic acceptance; a bad context selection can omit relevant evidence; storage/history and context assembly need maintenance. |
| Independent mutable agent copies | Simple local drafting; small tasks can proceed independently without reading a shared record on every thought. | Divergent truths, duplicated context, lost objections and producer edits; arrival order can decide authority; costly manual reconciliation; cannot prove what generation used. |

Send bounded read-only copies for inference, each pinned to the accepted revision
and brief hash. Agents return contributions rather than replacement films.
Keep full snapshots for accepted handoffs and full history in existing records;
avoid relaying a whole chapter plus its entire transcript in every call. A
snapshot describes the accepted intent, not a promise of generated pixels.

### Film meaning, contribution and transport

Use the [FDL v2 core](fdl/core.v2.schema.json) and
[Bible/regional extension](fdl/bible-regional.v2.schema.json) exactly as defined:
`world`, `states`, `shots`, `keyframes`, `clips`, approved references and facts.
Do not introduce a second camera/blocking/costume vocabulary. Keep numeric units,
`unknown`/`open`, evidence limitations and prose purpose. A neutral FDL fact's
owner is its accountable domain owner; the envelope's owner is its **author**.
Leon can propose a Tessa-owned pose without acquiring Tessa's authority.

The [contribution envelope](fdl/crew-contribution.v1.schema.json) is an executable
design example of a small extension to saved role outputs, not a new creative
language or a generic patch executor:

| Required information | Meaning / existing integration point |
|---|---|
| `id`, `kind`, `supersedes`, `relatedContributions` | Stable proposal, objection, revision or resolution identity; link to earlier events without rewriting them. Sequence/round remain in `production_events`. |
| `inputRevision`, `inputBriefSha256` | Exact accepted snapshot and shared context actually examined, including relevant producer decisions. A revision number alone is insufficient. |
| `owner`, `scope` | Canonical author ID; project, scenes, shots, verses and existing audio-binding references. Empty audio refs explicitly mean no audio change, not missing permission to retime it. |
| `proposedChanges` | References to existing FDL entities/fact names, with before/after **FDL facts**. Empty for prose-only findings, withdrawal or a review. This narrow example covers fact replacement, not arbitrary record insertion/deletion. Broader edits use their existing typed stage/edit contracts. |
| `rationale`, `evidence`, `objections` | Readable purpose and alternatives/uncertainty; evidence refs/locators with limitations; relevant objection event IDs even after resolution. An empty list means none reported, not proof none exist. |
| `destination` | Accountable receiving roles, existing stage and subject, not permission to dispatch them. Role IDs use the registry; tools/status/authority stay outside FDL. |
| `finding`, `resolution` | When applicable, existing severity/confidence/limitations and explicit outcome, addressed contributions/objections and accepted revision reference. Director verdicts retain their own confidence/limitations. Confidence remains uncalibrated advice. |

Transport/run identity, receipt/acknowledgement, attempt IDs, idempotency,
timeouts/retry limits, status, costs/reservations and authority/review records
stay in the existing run/event/attempt/review/edit records. FDL's intrinsic fact
status means epistemic/approval provenance; it is not a job status. Its provider
settings describe requested supported controls, not provider dispatch, billing
or authority. An envelope or a JSON `approved` label cannot issue an approval.
Source/canon/reconstruction/field/release remain separate existing authorities.

Do not force every useful observation into a field. Prose may explain uncertain
eyelines, emotional intent, a possible confusion or competing alternatives
without an invented coordinate, enum or score. Use a small set of workflow
outcomes for routing; retain the actual explanation. A required unknown holds
the affected action; a bounded open visual choice does not summon Dan.

### Proposal, objection, revision, resolution

1. Save the contribution against the exact input revision/context. Retain its
   original author/output and destination, including malformed/failed review
   evidence through existing error records. Missing output never means assent.
2. The receiving owner reviews relevant changes and returns a linked response.
   Cross-domain proposals cannot directly change another owner's accepted
   decision. Canon/source changes use their existing evidenced approval path;
   even domain ownership cannot approve new canon or rewrite source performance.
3. A blocking objection holds the affected handoff. The owner revises or
   withdraws the proposal, identifying which objections it addresses and why.
   A fresh empty findings list cannot silently close an old objection. The
   original objector (or the existing authorized review/producer path with
   explicit evidence) records the disposition; unresolved protected concerns
   cannot be voted away or waived by Rufus/Production Director.
4. The existing Production Director resolves bounded creative tradeoffs within
   the existing call/revision limits, after affected owners and required reviews
   respond. Acceptance records exact included changes, exclusions, evidence,
   objection dispositions and any carried advisory. It appends a new snapshot
   and advances the current accepted pointer atomically, conditional on the
   expected input revision **and** context still matching. No last-write-wins.
   Rejection/withdrawal can close a proposed conflict without changing the
   accepted film. Partial acceptance needs explicit separable changes and owner
   review; the examples use complete proposals rather than an implicit merge.
5. At the existing bounded-pass/call limit, retain a hold with the unresolved
   question, alternatives, evidence and accountable owner. Escalate actionable
   product/fidelity/authority decisions to Dan; do not add another negotiation
   loop or require routine chapter-plan signatures. Applicable passing reviews
   and existing source/canon/cost gates permit automatic continuation.

Two contributions conflict when they replace the same fact differently **or**
have incompatible dependent effects, e.g. camera clearance versus actor path,
new framing versus mouth visibility, or wardrobe versus adjacent accepted
shots. Disjoint JSON fields are not proof of independent changes. Review the
affected scene/neighbours and fixed authority refs. Equivalent suggestions may
share one acceptance with both authors credited; they do not erase either log.
Semantically independent changes still commit serially against the same current
record. No automatic three-way merge of creative meaning is proposed.

A late contribution remains saved but is marked stale, with its original basis
and the new current revision/context. It does not overwrite current work or
inherit the old approval. Return the current snapshot, relevant intervening
decisions and unresolved objections to its owner. The owner may withdraw or
submit a new linked revision with refreshed before-values and rationale; repeat
affected reviews before acceptance. Even a disjoint old suggestion must be
explicitly revalidated, not silently rebased. A newly evidenced source/canon
problem can raise its own current blocking finding despite stale creative work.
Duplicate delivery of the same ID/content is a receipt replay; the same ID with
different content is an integrity conflict, not a revision or a reason to pay
for another attempt.

### What later roles and generation receive

Every receiving packet includes accepted revision/context, resolved relevant
FDL facts, readable intent, linked accepted decisions, relevant earlier proposals
and their dispositions, **all relevant unresolved objections**, and references
to the full retained exchange. Include dependencies beyond the target shot and
the recipient's own domain. Context narrowing cannot hide an objection whose
effect crosses that boundary. If required evidence cannot fit/be retrieved,
retain an incomplete-review hold rather than silently dropping it. Summaries
must name objection IDs/status and retain links to original prose/evidence.

The producer's chapter view should show current accepted intent and actionable
holds first, with expandable alternatives, earlier versions, who objected and
why/how each objection closed. Resolved history is visible without remaining
a permanent current alert. Direct producer edits retain their authority: append
old/new snapshots and the existing edit command/decision, explicitly superseding
affected choices. Do not make Dan rerun the crew merely to review his own edit.
Preserving that workflow while replacing the current in-place brief re-stamp is
an integration requirement, not an implementation claimed here.

Immediately before preparing/submitting media, the **existing** stage must
resolve the accepted current revision and matching brief/source/canon/assets,
verify required review/objection dispositions and producer holds, and bind the
prepared request to those exact hashes and acceptance refs. Repeat freshness
validation at dispatch; a prepared or queued old request holds after a relevant
change. Use existing atomic reservation/idempotency boundaries, not a new job
system. A changed basis during an in-flight request cannot retroactively unsend
it: retain returned pixels/cost as an unselected candidate and require normal
review/reconciliation. Never automatically regenerate accepted takes.

Generate only the accepted resolved intent plus its reconciled prose, rather
than concatenating alternative proposals into a prompt. The Director's compiled
instruction must preserve accepted craft details and their provenance. Schema
validation cannot prove this: compare the instruction and actual media against
the accepted snapshot. An unresolved blocking issue about that intent holds;
an advisory remains visible for the relevant review. Unaccepted alternatives
cannot leak into generation just because they occur later in the transcript.

The $200 cumulative direct film ceiling includes planning, all reviews,
generation, rejects and retries. Before another charge, existing cost control
must account for spent and outstanding/reserved charges; unreported liabilities
must be reconciled or conservatively bounded, never treated as zero. This
design adds no spending authority or claim that all current paths enforce that
policy. Keyframes retain the assistant-operated built-in-image handoff, included
usage/unreported money and ordinary import/review. No paid image API fallback.
Spoken wording/speed and exact source/cast bindings remain fixed; emotional
breathing room uses explicit reviewed safe-boundary pauses and accepted visual
coverage through Nell/Sam's existing timeline contracts. FDL is no second audio
timeline. Existing field/release gates still apply at their respective boundary.

### Worked disagreement and executable evidence

[The exchange](fdl/example.crew-exchange.v1.json) contains two small, resolved
FDL snapshots, twelve contribution events and a later generation-role handoff.
All IDs, facts, approvals and zero hashes are **illustrative**, not live Mark 3
records, actual image inspection or authority to spend. The examples reuse the
synagogue/listening FDL model; they establish no new narrative or Hatam timing.

| Exchange | Proposal → objection → revision → resolution |
|---|---|
| Camera versus blocking | Leon proposes a side camera and moving Jesus for sightline clearance. Tessa objects that the proposed camera occupies the established actor space and that changing the pose for the lens breaks the accepted encounter. Leon withdraws the pose change and revises only camera placement. Tessa explicitly clears that objection with blocking unchanged. The Production Director accepts the revised camera as r2; r1 and both alternatives survive. |
| Wardrobe rejected | Costume proposes blue instead of the illustrative approved cream mantle for separation. Orion objects with the canon/adjacent-shot evidence. Costume withdraws the redesign; Orion explicitly resolves the objection because blue never entered the accepted record. The resolution rejects the blue proposal; r2, approved wardrobe refs and existing assets stay unchanged. No majority/confidence vote or new canon approval is invented. |
| Late camera input | A later Leon proposal still names r1 although r2 is current. Its recorded stale disposition changes no snapshot. It needs a fresh owner revision and affected review before acceptance. |
| Earlier unresolved note | Orion's advisory about checking readability at phone size travels to Gus with its original uncertainty, alongside the resolved blocking disputes; it is not silently dropped or represented as inspected pixels. |

[Contract tests](../../tests/creative-direction/crew-communication-design.test.ts)
validate FDL reuse, envelope completeness and these cross-record invariants,
including mutations that would leak rejected/stale proposals, erase objections
or bypass domain review. They are fixture checks, **not a production resolver**.
The final handoff selects r2; the dispatch examples hold r1, an unaccepted
revision, wrong context and unresolved blocking input. Actual production still
holds on placeholder refs/missing real gates. Reproduce with
`npm test -- tests/creative-direction/crew-communication-design.test.ts`.

### Costs and limits

| Cost / risk | Bounded use and evidence needed |
|---|---|
| Extra tokens | Before/after facts, refs and objections add input/output tokens. Save full snapshots once; send relevant resolved slices plus linked differences/history. An agent must retrieve necessary evidence, not treat a link as having read it. Measure actual reported usage per role/attempt; no assumed token savings or dollar price is claimed here. |
| Rigid schemas | Validate exchange mechanics and existing FDL units, not exhaustive film grammar. Keep prose-only findings, qualitative choices and honest unknowns. Schema validity does not imply completeness or artistic quality. |
| False precision | No inferred lens/metric geometry/phrase timing from pixels or English. Owner/status/confidence fields do not establish truth, agreement or calibration. |
| Maintenance | Reuse FDL definitions and canonical registry IDs; version the envelope separately. Retain legacy missing fields as unreported, not synthetic resolved history. Add only demonstrated needed film facts. |
| Coordination overhead | Owner acknowledgement, stale revalidation and context assembly cost calls/time. Use the existing bounded passes and affected scope, group related changes, and escalate an exhausted real conflict instead of growing another workflow engine. |
| Satisfying fields while missing the film | Ask whether the accepted choice serves the passage and viewer; inspect the actual scene/cut, not merely completed fields. Retain evidence of unclear/poor results and Dan's correction. No benchmark improvement is claimed from these synthetic examples. |

No unresolved product decision blocks this design recommendation. A request to
change approved source/canon, waive an existing hold or require an unsupported
provider capability still needs its existing specific decision/review before
dependent work. Generic runtime integration and migration remain unimplemented;
do not backfill invented lifecycle resolutions into old productions. No new
production or paid model/media call was made. Incremental provider production
spend is $0; assistant included usage/billed cost is unreported, not asserted
free or evidence of remaining film budget. Your dot/live Mabel dispatch and an
external ChatGPT/SMS transport are unavailable here. This chat reports the
result; SMS delivery to Dan's supplied number ending in 8114 is not claimed.

### Validation and separate Goal Guardian review

Twelve new design-contract tests demonstrate the accepted camera revision,
unchanged blocking/wardrobe/source extension, original-owner objection
resolution, rejected wardrobe, stale work and the later unresolved advisory.
Negative examples detect absent contribution context, domain takeover,
rejected/deleted facts, lost history and stale/unaccepted intent at dispatch.
Full suite: **628 tests / 101 files pass**; TypeScript, production web build and
`git diff --check` pass. Log: `outputs/crew-communication-design-tests.txt`.

A separate dedicated review pass re-read PRODUCT_VISION's autonomous pipeline,
role interaction, source/canon/audio and review principles; CURRENT_GOAL's FDL,
Avatar and real Mark 4 holds; and USER_WORKFLOW's chapter navigation and
watch/correct/rerun flow. The result **passes this design concern**: it reuses
FDL, extends existing crew records, retains source/canon/producer authority,
requires the same saved state for both triggers, and introduces no routine
chapter-plan signature, new runtime, production spending or unrelated work.
The envelope also retains the protocol's required confidence/limitations on
Director verdicts without treating them as approval authority.

Evidence is explicitly synthetic. Actual later-role context assembly,
immutable replacement of the producer brief re-stamp and revision-bound media
dispatch still require focused runtime integration; these tests do not prove
live enforcement, film quality, source timing or notification delivery. No
additional decision is needed from Dan to complete this design. Existing
specific source/canon/unsupported-control decisions remain required when used.

## Runtime integration (2026-10-14)

Reference handoff extension: approved qualitative FDL/Bible-regional snapshots
now travel in both assistant keyframe briefs and their prompts/import checks.
Jesus/other-cast/set input roles remain explicit; reviewed set-reference changes
use existing library/reuse/review/edit records. Leon's guidance can request an
assistant-operated Blender camera snapshot; this does not activate a declared
Pippa/Gus/Mabel worker. See the
[implemented reference workflow](../production/CODEX_LTX_REFERENCE_WORKFLOW.md).

Implemented in the existing `crew.ts` / `crew-store.ts` paths, with a bounded
[FDL projection and contribution validator](../../src/pipeline/creative-direction/production-record.ts).
There is no schema migration, new table, queue, dispatcher, roster or historical
backfill. Existing `production_runs.result_json.productionRecord` holds a
versioned record with scene FDL snapshots, input revision/brief hash, accepted
contribution IDs, retained exchange and objection dispositions. Model replies
do not assign their own owner, input revision or event identity: the runtime
assigns those from the actual saved call context. Role outputs retain prose.

The first runtime subset is qualitative (`units: none`): approved character
references, proposed/unknown set facts, local performance/pose/gaze/light and
shot framing, camera placement/movement, continuity and crowd density. The
last three shot fact names map directly to the existing saved shot fields;
they introduce no new provider parameters. Core v2 and Bible/regional schemas
remain unchanged, and tests validate the actual runtime projection against
them. Arbitrary numeric geometry, temporal motion tracks and generic FDL
compilation are not implemented. Crew acceptance cannot promote persistent
set reconstruction, replace canon/source or alter the audio timeline.

Optional wire fields `filmChanges`, `ownerResponses`, `objectionResponses`,
`withdrawals` and Director `acceptedContributionIds` extend `CrewContribution`.
They become linked proposal/objection/revision/resolution envelopes in saved
events. Changes require exact before-facts and preserved accountable ownership.
Cross-domain acceptance needs the affected owner's explicit acceptance of that
exact proposal. The Director selects current, non-superseded, non-rejected
contributions; conflicting replacements hold. A world/canon change must use its
existing specific approval tools. A producer-controlled fact cannot be replaced
by a crew vote. Director verdict confidence/limitations are required for these
new runs; legacy missing values are not invented.

An empty findings list never resolves an earlier objection. Only its original
reviewer may explicitly resolve it with evidence through this bounded crew
path. Holds and advisories survive new passes and runs. Read-only hydration
from existing events also exposes late replies that arrived after a producer
successor was saved; unresolved blocking evidence holds new generation without
rewriting that successor. Malformed replies/error/cost evidence remain saved
without becoming approval. Interrupted-run recovery retains the saved record,
contributions and objections, so a restarted review cannot lose an earlier hold.
Later prompts and the chapter's Production Crew
panel expose the earlier proposals and unresolved objections, with expandable
history and FDL. The existing two-pass/call bounds remain; no extra worker is
invoked to obtain an acknowledgement.

Producer shot/scene PATCH controls now use `applyProducerCreativeEdit`. A single
transaction saves old/new fields, note, prior attempt state, idempotency receipt
and an immutable successor planning run. The old brief/result is untouched.
Source/canon/performance changes cannot be reapproved as an unrelated creative
edit. Optional `expectedRevision` rejects stale edits; a repeated idempotency key
reuses the result and different content conflicts. A narrow edit preserves
unaffected specialist facts even within that shot. Changed shots use Dan's
saved fields plus accepted FDL rather than older Director prose. Existing
accepted pixels remain retained; the prior attempt/approval is included in
history when the existing producer-edit retry behavior marks it `retry_modified`.
Manual planning, stage-3 refinement and autonomous calls share these records.

New generation uses `productionAuthorization`, with an exact run ID/hash and
a local `authorizeSubmission` callback. The existing Gemini, Kling and LTX
adapters invoke it immediately before the actual request; LTX checks after its
queue/upload preparation. Transport callbacks are never vendor or FDL fields.
Shot/coverage keyframe preparation and import require the current accepted plan;
the former no-plan exemption is removed for new work. Draft/final/directed
video and Avatar candidates retain their revision in typed existing edit history.
Stale or missing new-candidate bindings hold selection; already retained legacy
assets acquire no invented provenance. Completed old takes remain available.
The ordinary new-film image API path refuses paid image substitution and holds
for assistant-operated built-in generation. Existing handoff scope restrictions
are still explicit; this is not an unattended assistant-image dispatcher.

Role spending remains metered in existing events/ledger; Avatar's existing cost
reconciliation/reservation gates remain active. This change grants no budget
clearance, paid retry or fallback. The cumulative $200 policy still includes
planning/reviews/rejected work and outstanding charges. No paid model/media call
or production stage against an existing film was made for this implementation.
Assistant included usage/billed cost remains unreported. Field/release approval
and source-audio wording/speed are unchanged.

Validation: **643 tests / 102 files pass**, including 14 new saved-runtime tests
and the new real-adapter pre-submission test. TypeScript, web build and diff
checks pass. Provider/tier unit fixtures explicitly start after an upstream
review; the new runtime/API tests and full chapter fixture exercise the real
saved-state gate. Logs: `outputs/crew-runtime-tests.txt` and
`outputs/crew-runtime-workflow-tests.txt`. An isolated SQLite/assets proof at
`HeartWordData/scratch/crew-runtime-proof-2026-10-14` retains manual API planning,
producer edit/replay, old-row preservation, reopen and subsequent autonomous
review using the same state. It is synthetic metadata/source evidence, not an
actual Hatam film or audiovisual quality proof.

Separate Goal Guardian review against PRODUCT_VISION, CURRENT_GOAL and
USER_WORKFLOW passes the bounded implementation: automatic applicable review
acceptance remains, Dan's correction authority and selective work remain, and
no new plan signature or orchestration subsystem is introduced. That review
also protected late objections, unaffected specialist facts, candidate provenance
and the distinction between asset-acceptance receipts and creative guidance.
Its separate recovery check found and fixed a path that discarded objections
when recovering an interrupted run; a regression now exercises restart and review.
The live production DB hash and all 89 retained render file inventories are
checked separately for preservation. No Dan product decision blocks this unit.
General FDL compilation, historical conversion and real-film quality evaluation
remain outside its evidence. Your dot/live Mabel and SMS delivery remain
unavailable in this session; the result is reported in this chat.

## In-app test-film walkthrough (2026-10-14)

`outputs/crew-app-demo.ts` serves the existing built HeartWord web app on local
port 4016 against only `HeartWordData/scratch/crew-app-demo-2026-10-14`. Its
guarded test launcher requires that exact scratch path and a test marker, refuses
another film in the database, disables provider requests, and permits only the
bounded demo reviews and existing producer shot PATCH. A persistent banner
labels all source/canon fixtures and role replies as synthetic. It does not
modify production runtime/UI code or connect Mark 4/previous films.

The app's real storyboard button saved a first held review: Leon proposed a
camera occupying the witness mark plus an actor move; Tessa objected. Costume
proposed blue; Orion rejected the continuity break against cream. The next
review saved a camera-only revision to the right aisle, Tessa's explicit
resolution, Costume's blue withdrawal and Orion's resolution. The accepted
record retains both earlier objections, superseded alternatives and rejection.
Generation readiness was false while held and true only after acceptance.

The existing producer-edit API then saved seated blocking as an immutable
successor, with its old/new edit history. A separate autonomous test caller used
`runProductionCrew` against the same saved database and asserted that every role
received the seated action. The final accepted revision points to the producer
revision; prior brief/result hashes match, cream and the accepted camera survive,
and all 46 lifecycle records remain visible in the app. Shot action editing here
uses the API; a direct action-edit form is not currently present in the main app.

Browser-verified screenshots: `outputs/crew-demo-01-held.jpg`,
`crew-demo-02-wardrobe.jpg`, `crew-demo-03-camera.jpg`,
`crew-demo-04-producer-edit.jpg`, and `crew-demo-05-autonomous.jpg` in `outputs/`.
Checkpoint JSON is alongside them; the isolated folder retains
`workflow-evidence.json`, `demo-state.json` and `db/heartword.sqlite` for reopening.
The launcher is a scripted test harness, not a new production dispatcher or a
claim of unscripted model judgment, generated media, language validation or
release approval. No provider submission/charge occurred; assistant usage cost
is unreported. A separate Goal Guardian pass checks this bounded demonstration
against the vision, current goal and user correction/selective-review workflow.
That review passes: the demonstration uses the existing stage, saved authority
and correction history; it adds no production subsystem or chapter approval.
The direct action-edit UI limitation remains explicit. A read-only final check
rejects the earlier accepted handoff and verifies that current direction contains
seated blocking/right-aisle camera while blue and the abandoned actor move remain
only in history (`outputs/crew-demo-06-verification.json`). All 643 tests, type
checks, web build and diff checks pass. The production DB checksum and 89 render
inventories match the pre-implementation baseline; see
`outputs/crew-app-demo-preservation.json`. No Dan decision blocks this demo.

## Earlier runtime notes (retained)

The [FDL v2 design](film-description-language-v2.md) defines proposed shared
meaning beside prose, with canonical owner IDs and immutable input/context
references. It does not add a property to today's crew contracts or turn
declared roles into live workers. Runtime integration would extend the same
saved briefs, contributions, review/objection records and producer controls;
manual/autonomous operation must not acquire separate mutable FDL authorities.

Continuous-speech handoff (2026-10-14): the saved brief carries confirmed run
scope and honest internal verse timing beside individual source intervals,
plus exact shot utterance windows and independent timing evidence in retained
history. June's broad speaker attribution is not Kit's phrase-timing proof.
Pippa/Leon/Nell may change coverage under continuous speech without requesting
soundtrack splits at ordinary verses. Source-supported emotional performance
changes need their own exact evidence; a safe internal pause additionally needs
reviewed boundary evidence. Manual controls and autonomous stages read the same
saved confirmations. Role runtime classifications and authority stay unchanged.

Current bounded implementation persists crew contributions, handoffs, source
and canon validation, timing gates, producer corrections, and monitor events.
The monitor shows only recorded events and full saved structured output; it
does not expose hidden reasoning or presentation dialogue. A later-resolved
hold is historical rather than a permanent current alert. No runtime claim
authorizes generic unimplemented stages, paid generation, or human-approval
substitution.

Avatar direction handoff (October 14): Kit/Tessa/Rufus's source-grounded acting
intent and Gus's verified baseline/override settings use the same saved
`set_avatar_performance` edit-history packet for related shots, manual API
controls and stage5. Existing exact source/voice bindings remain controlling;
English supplies semantics rather than Hatam phrase timing. Requests retain
actual supported parameters and submitted audio separately from desired acting
and unreviewed results. Required unsupported controls, changed bindings and
unreconciled/outstanding charges hold before Avatar spending. This adds no
live Mabel/Your dot worker, routine chapter-plan signature, external notification
transport or general FDL parser. See the [evidence and limits](../production/KLING_AVATAR_DIRECTION.md).

Dan subsequently approved the recovered warm/gentle prompt as the preferred
baseline for most neutral/positive speech. The shared crew guidance and Avatar
compiler now use that preference for explicitly eligible saved treatments;
rebuke/anger/grief/fear and uncertain passages cannot silently inherit a smile.
Rufus/Tessa/Kit retain source-grounded treatment and exception reasons. Existing
prompt overrides take precedence, and no role may infer Hatam timing, alter the
recording or regenerate accepted media merely to adopt this preference.
