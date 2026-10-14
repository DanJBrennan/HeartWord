# Film Description Language (FDL), v2

Status: **design and executable examples only**, October 14, 2026. No stage,
provider, database migration, approval gate or producer control changes here.
v2 is a design revision, not a deployed wire protocol.

## Goal and located specifications

Serve PRODUCT_VISION's autonomous, faithful, editable chapter film and
USER_WORKFLOW's language/book/chapter workspace: Dan reviews and corrects
the developing film rather than supplying each shot's details manually.
Preserve verified Scripture, source performance, approved Papuan video identity,
biblical physical setting, accepted assets and retained decisions/edit history.
CURRENT_GOAL's real Mark 4 timing holds, local LTX and preservation work remain
independent. This design does not clear those holds.

Acceptance: minimal structured description plus readable prose; separate
Bible/regional authority; explicit fixed/changing details; successive keyframe
and clip examples with purpose, ownership and uncertainty; and mappings to
supported provider inputs. Production calls or historical conversion are not
needed to demonstrate this design.

Located Dan's primary requirements in **“Prompt Kling performance guidance”**,
chat `01a1132b-6938-7fa3-8c8e-94dbfaff73cb`, turn
`01a1178f-2551-73d2-b239-5a40773742e5`, and its retained attachment
[Pasted text.txt](<C:/Users/danbr/.codex/attachments/b5622a01-2789-4079-a4de-5f5376eb79b4/Pasted text.txt>).
He asks for canon characters/garments and possible building snapshots before
the first anchor, then inspection to propose continuity details for later
frames/clips. His examples are changing synagogue windows, seating and light.
Inter-agent handoffs should share this meaning alongside prose and objections.

Dan answered the prior-specification question **“No”** in that chat. In
**“2. Preserve Chapters for later editing”**, chat
`01a1190e-9842-7411-86c9-c532475b9669`, he clarified that FDL means Film
Description Language, did not yet exist, and should be designed with its
Bible/Papuan extension. No separate Dan-authored formal schema was found in
the repository, Downloads, HeartWordData or those referenced chats.

The October 7 preservation work already created a draft from those requirements:
[v1 design](film-description-language.md), [core](fdl/core.schema.json),
[Papuan extension](fdl/bible-papuan.schema.json), [boat example](fdl/example.scene.json).
Retain them unchanged except for the design's pointer here. v2 resolves
ambiguous optional values, unversioned references, untimed motion and missing
anchor-inspection examples. It is not a replacement runtime or an imported DSL.

| Category | Actual status |
|---|---|
| Implemented records | `production_runs.brief_json`/brief hash, role-owned `production_events.output_json`, directions/findings, producer notes/corrections, typed edit history, current-plan/staleness checks, locked visual facts, scene refs, attempts/costs/candidate reviews and portable packages. |
| Implemented inputs | `ShotRequest`: shot ID, prose, versioned characters/locked facts, scene images. `VideoGenerationOptions`: start frame, duration, fps, resolution, seed, audio mode. `DraftVideoProvider.generateGuided`: two images. `LipSyncProvider.sync`: character, exact audio range, one composed image. |
| Assistant handoff | `external-keyframes.ts` prepares/imports built-in images via saved attempts/reviews, with existing chapter restrictions; it is not an unattended image API. |
| Declared roles | Mabel, June, Dottie, Pippa, Gus, Vera and Kit have registry contracts but are not dispatched as independent live crew model workers. Existing stages implement parts of their responsibilities. |
| Executable roles | Rufus, Leon, Tessa, Arlo, Costume, Lighting, Orion, Nell, Sam, Composer, Colorist and milestone challengers participate only in registered phases. |
| Historical notes | Original single-pass skeleton and old image-vendor preferences do not supersede later crew implementation or Dan's built-in-image decision. Benny/presentation critics carry no production authority. |
| Proposed here | FDL snapshots, semantic checks and compilation mappings. No generic compiler, automatic anchor extraction, Your dot dispatcher or external ChatGPT/SMS transport is implemented by this design. |

## Representation decision

| Option | Benefit | Cost/limit |
|---|---|---|
| Versioned JSON + JSON Schema + prose | Existing saved JSON, ordinary diffs/tooling, typed units, explicit references and conditional validation. | Verbose; cannot inspect pixels, resolve approvals or prove historical truth. |
| Custom grammar + prose | Shorter authoring, e.g. `clip C1: K1 -> K2 in 5000ms; camera.push(...)`. | Parser, escaping, error locations, versioning and serializer/editor work; still needs the same semantics, provenance and adapters. |

Choose **JSON**. No expression evaluator, custom parser, full scene graph,
rig or second timeline. Save a small resolved snapshot per reviewed handoff;
include only facts that materially improve continuity. Prose supplies purpose
and nuance. [Draft 2020-12](https://json-schema.org/draft/2020-12) supplies
the validation vocabulary; tests use the development-only
[Ajv 2020-12 validator](https://ajv.js.org/json-schema.html#draft-2020-12).

Contracts: [core v2](fdl/core.v2.schema.json) and separate
[Bible/regional v2](fdl/bible-regional.v2.schema.json). Core can stand alone for
a non-Scripture design example. Chapter production requires the applicable
extension. Hatam's approved profile is **Papuan / video**. A region string does
not enable another canon; it must match saved project approval. Comic identity
does not substitute for video identity.

## Layers and ownership

| Layer | Facts affecting continuity | Accountable owner |
|---|---|---|
| `world` | Exact character/garment versions: face/hair/beard/silhouette/build, cut/neckline/layers/drape/color blocks/tassels/footwear. Set architecture/openings/materials/furnishings and reusable prop design. | Dottie approved identity refs; Costume wardrobe proposals constrained by canon; Arlo sets/reconstruction/props. |
| `states` | Local pose/position/orientation, prop holder/location/state, gaze/action/expression/performance, lighting/time/weather; exact approved story-state assets, e.g. withered/restored hand. | Tessa blocking/action, Arlo prop placement, Costume local garment state, Lighting light, Rufus source-grounded intention. |
| `shots` | Purpose in prose; camera/target/axis/framing, focal length **with sensor width**, focus/exposure/readability. Camera cannot change the room or clothes. | Leon with Lighting's motivated-light contribution. |
| `keyframes` | Shot/state IDs, start/intermediate/end anchor, per-anchor composition, optional actual selected asset. | Pippa coordinates; Leon/Tessa own fields; Orion continuity; Vera media compliance. |
| `clips` | Beginning/end anchors and required end-state ID; duration, timed from/to motion with rationale; refs to existing audio placement/binding. | Tessa subject action, Leon camera, Kit exact visible speech, Nell picture placement; June retains source alignment. |
| `providerSettings` | Target/provider/model, supported settings, required controls and capability evidence. Never canon/story authority. | Gus via existing tools; Mabel saved gate coordination. |

Start with the demonstrated vocabulary: world `appearance`, `garment`,
`architecture`, `furnishings`, `material`, `coordinateFrame`, `hiddenGeometry`;
scene `<world-id>.pose`, `.position`, `.orientation`, `.gaze`, `.expression`,
`.holder`, `.state`, `light.direction`, `timeOfDay`, `weather`, `performance`;
shot/anchor `framing`, `cameraPosition`, `cameraTarget`, `lensFocalLength`,
`sensorWidth`, `focus`, `exposure`. Add only useful facts. Names are identifiers,
not executable paths. New names need documented semantics/adapter handling;
unfamiliar required facts cannot be silently dropped. Qualitative relations
such as “bench beside the near wall” need no invented metric geometry.

## Values, references and units

Every fact carries value, units, status, canonical registry owner ID, reason,
evidence and approval reference. Ownership is not approval or tool permission.
Historical aliases stay in history. Challengers report findings, not fact edits.

| Value/status | Meaning |
|---|---|
| Omitted | No constraint from this layer; referenced baseline still applies. Never clears a fixed fact or deletes a prop. |
| `unknown`, null | Needed knowledge is unresolved; reason explains the gap. Hold when necessary for a required constraint. |
| `open`, null | Legitimate bounded visual choice left to generation within source/canon/set constraints. |
| `observed` | Visible evidence with asset/record locator and limitations. Never canon authority. |
| `proposed` | Intended choice/change awaiting applicable review, not an accepted constraint. |
| `approved` | Cited existing applicable approval/resolution with evidence. Source/canon/reconstruction/field/release remain separate authorities. |

Known facts cannot be null; unknown/open facts cannot contain guesses.
Observations cannot carry approval records. Approval creates a new version
and retains the observation and objections. Existing reviews may accept local
visual directions; new reusable canon/historical reconstruction still needs its
existing producer approval. There is **no added chapter-plan signature gate**.
An approved-looking example field is illustrative, not an actual approval.

Record refs name table/ID plus exact immutable version or snapshot hash.
Names, “latest” and filenames cannot select identity. Assets bind their record
to package-relative URI and SHA-256 of retained bytes: no absolute path, scheme,
traversal or fallback. Preserve old/new assets and approvals; a new character
version does not force regeneration of accepted historical shots.

`revision` is the immutable snapshot; `parentRevision` preserves lineage;
`inputRevision` names the accepted basis. Context names project, scene and
actual saved brief hash. Check all of them. A stale contribution goes back to
its owner rather than overwriting the newer accepted state.

Units: metres for geometry; mm for focal length/sensor width; degrees for
angles; integer ms for time; K/lux only for measured/planned quantitative light;
ratio for normalized values; `none` for qualitative descriptions. Canon garment
colors are not assumed exposure-independent sampled pixel values.

Declare scene origin/axes: right-handed +X set-right, +Y toward the declared
rear/forward direction, +Z up. World +X is not screen-right after a camera
turn. Prefer camera position/target vectors. Angle triples are [yaw,pitch,roll]:
apply right-handed yaw about world +Z from +Y (+90 faces -X), then pitch about
the camera's local right axis (positive upward), then roll about its view axis
(positive clockwise in the image). Record that transform with a Blender snapshot.
Retain its source `.blend` version/hash, units, camera/sensor settings and world
transform in existing provenance. Unknown scale stays unknown: generated
pixels cannot prove a real lens, accurate dimensions or hidden geometry.

Evidence `region` is normalized `[x,y,width,height]`, top-left origin, +X right,
+Y down; sums stay inside the image. Evidence `atMs` is that retained asset's
clock. Clip motion is local half-open `[startMs,endMs)`, with intended final
state at `durationMs`; source/production clocks stay in their saved bindings.
Frame notes retain existing rational fps and inclusive zero-based review/edit
conventions. FDL does not redefine the timeline.

## Inheritance and changes

World, named local state, shot and anchor composition are separate scopes,
**not last-write-wins overlays**. Local state cannot shadow approved identity,
garment or architecture. Camera composition cannot change story state.
A local prop/wardrobe/story change needs its reviewed state, explicit action/
motion/source reason and appropriate approved state assets.

No motion track means no intended change, not pixel freezing. Natural motion
must fit the approved performance. Each track names camera/world subject,
property, from/to facts, local times, interpolation intention and reason.
Endpoints agree with beginning/end states/anchors; tracks cannot conflict,
exceed duration, swap identities, teleport props or introduce an event.
Multiple bounded tracks/intermediate states express a multi-beat action.
Generation boundaries do not reset gaze, posture or performance. Interpolation
is intent, not a promise of provider-supported curves.

`endKeyframe: null` means no declared final image; `endStateId` remains required
with endpoint uncertainty recorded. Omitted `selectedAsset` means none selected,
not generation success or permission to substitute an earlier asset.

## Bible/regional extension

Keep three independent authorities:

1. Exact verified source binding, verses, measured source intervals/runs.
   English is semantic context only. Exact outer attribution may coexist with
   unresolved internal verse timing; a verse edge is not automatically a
   phrase boundary, pause or edit point.
2. Approved regional **character identity**, exact video versions and project
   canon context. Hatam uses Papuan identity with approved first-century
   garments; no other region/comic identity substitutes because files exist.
3. Biblical physical place/period with approved set/reconstruction refs and
   unknowns. Papuan faces do not relocate Galilee's buildings/landscape to Papua.

`grounding` classifies consequential choices as verified source, regional canon,
approved reconstruction, visual staging or unknown, with refs/limitations.
“Synagogue” does not specify windows, bench count, exact hour or precise town.
An approved set plan is a production reconstruction, not a scriptural assertion.
Proposed historical research is not approved reconstruction; this task does
not research new archaeology.

Gate refs never issue approvals. Video eligibility, citation scope, source,
canon, reconstruction, field review and release remain distinct. Null means no
cited decision here; resolve the applicable saved state before action.
Field/release gates apply at their existing distribution boundary, not before
every image. A file or portrait cannot approve an excluded book for production.

Reference existing audio placements/utterance/run bindings, never a competing
FDL audio timeline. Spoken speed is always 1. Editorial pauses cite reviewed
safe-boundary/gap evidence and accepted coverage; they cannot divide uncertain
words. Nell/Sam supply appropriate coverage/ambience. Visible speech remains
Kit's exact cast window and Kling Avatar, never invented scene-provider speech.

## Worked sequence and anchor inspection

Read [initial K1](fdl/example.v2.anchor.json),
[hypothetical inspection](fdl/example.v2.anchor-inspection.json), and
[K1 → K2 / C1](fdl/example.v2.scene.json). These are **design fixtures**, not
live Mark 3 directions or actual image inspection. All `bind:*`/`example:*`
IDs, approval labels, zero hashes, timing and coordinates are illustrative.
No Hatam words or actual phrase timing are invented.

| Concern | K1 | K2 / C1 | Why / uncertainty |
|---|---|---|---|
| Source | Mark 3:1–2 inside synagogue after entry, before healing | Same moment/source binding | No new entry/healing/departure; actual audio placement still needs binding. |
| Identity/garments | Exact Papuan video and pre-healing state versions | Same exact versions | Fixed face/build/cut/layers/drape/colors/tassels/footwear. |
| Architecture | Approved room/openings/materials/set frame | Same immutable world | Camera cannot move windows, add doors or alter scale. |
| Furnishings/props | Bench details open within constraints | Inspection proposal stays inactive | Visible bench ends do not prove material/count/dimensions/hidden seating. |
| Action/gaze/performance | Quiet attention, Jesus toward the man, no talking in narration coverage | Same `listening` state | Natural breathing, no arbitrary reset or added speech. |
| Camera/lens | Planned `[0,-6,1.6]`, target `[0,0,1.2]`, 35 mm / 36 mm sensor | `[0,-4,1.6]`; same target/lens; 0–5000 ms eased push | Closer coverage clarifies encounter; geometry is a plan, not inferred pixels. |
| Light/time/weather | Readable motivated daylight; exact hour/weather unknown | Same constraints/unknowns | No unmotivated exposure/weather jump. |
| Audio/end | Authoritative audio under picture | Same speed/wording, end state `listening` | Five seconds is illustrative, not a Hatam interval or a pause authorization. |

K1 can choose bounded `open` details after established constraints are attached.
After actual compliance/media review, inspect retained pixels with real asset
hash/regions. Report visible observations/limitations and propose useful facts.
Reject wrong face/garments, moved windows or furniture obstructing approved
blocking. Repair defects instead of promoting them. Accepting an image does
not approve every depicted detail as reusable canon.

The inspection proposes preserving two **visible** bench ends and their
relation; it asserts no material, total count, dimensions or hidden layout.
Image regions locate evidence, not fixed screen positions: a camera move
changes projected positions/scale while the physical arrangement stays fixed.
It contains an objection and no approval. K2/C1 inherit none of those proposals.
If Dan approves scoped reconstruction facts, retain observation/resolution in
existing saved records, cite the new version in a new FDL revision and supply
only accepted facts. New persistent facts need this approval; routine chapter
plans continue automatically when existing applicable reviews/gates pass.

## Adapters and saved-state integration

This mapping is proposed. Extend stage 3/4 packets and provider adapters, not
a worker/table for FDL. Snapshots belong with immutable briefs/handoffs and
role outputs; producer corrections use existing decision/edit history. Manual
and autonomous triggers read the same saved revision. Today's typed
`CrewContribution`/`KeyframeBrief` do not consume an undeclared FDL property;
runtime integration would explicitly extend those contracts and their hash.

| FDL input | Supported-input mapping / limits |
|---|---|
| Accepted facts + prose | Compile readable bounded purpose, fixed constraints, changes and unknowns into the prompt; never presume native FDL comprehension. Retain exact compiled request. |
| Character/garment versions | Actual approved head/body/state images, `CharacterRef`/locked facts, labelled roles. Set images cannot supply character identity. |
| Set/Blender view | Actual retained image/version/transform into `sceneReferences` or the supported assistant reference package. Creating Blender views is separate set work. |
| Built-in K1/K2 generation | Save assistant handoff/prompt/ref hashes; authorized assistant generates/imports for ordinary review. Record included usage and unreported monetary costs; no silent paid image API substitution. |
| C1 motion | Prose to `ShotRequest.prompt`, K1 to `startFrame`, ms to seconds at the adapter, requested supported fps/resolution/audio mode to options. LTX remains primary. Numeric prose is soft direction unless a verified control exists. |
| Required exact K2 image | Common final-video interface lacks an end-frame field; guided draft accepts two images, while local LTX's end-frame features remain future. Required exact endpoint holds that path. Select an existing supported reviewed path or explicitly revise the requirement; no silent degradation or paid fallback. |
| Visible speech/performance | Exact cast range + composed scene image to `LipSyncProvider.sync`. At this draft's initial completion the main adapter sent image/audio only. The later [verified Avatar direction work](../production/KLING_AVATAR_DIRECTION.md) maps descriptive intent and a versioned provider profile into documented prompt/mode, retaining unsupported requirements. FDL fields are not native Kling parameters. |

Example compiled prose: “16:9, ease toward the encounter over measured coverage;
preserve room/openings/garments/pre-healing hand/light/eyelines; no arrival,
healing or talking.” The request can carry accepted K1 and measured duration.
“End on these exact K2 pixels” remains held where unsupported. An explicitly
reviewed approximate-composition revision must be retained and its actual last
frame checked. A mention in prose is never an exact endpoint guarantee.

The C1 example keeps LTX's current model/options in a separate provider block.
Its required `startFrame` comes from the resolved accepted K1, not a duplicated
filename or a silent latest-image lookup. No start image is selected in this
fixture, so this block is not submission-ready. If duration is unresolved,
leave the clip unplanned rather than manufacture integer timing; unknown
source/phrase timing remains explicit in the handoff.

Retain input/FDL/prose/ref hashes, compiled prompt, actual supported settings,
provider/model, unsupported controls, usage/outstanding charges and immutable
returned media in existing attempt/review records. Credentials stay out.
Unsupported required controls hold; optional omissions are disclosed. Unknown
mandatory facts hold; bounded open choices do not cause needless Dan questions.

Validation has four responsibilities:

1. Schema: shape, unit types, unknown/open semantics, pinned-ref shape,
   evidence/approval presence, separate extension structure.
2. Semantic resolution: unique/scoped IDs, valid regions, ordered bounded
   tracks, matching units/endpoints, no fixed-fact shadowing and explicit
   reasons for intended changes.
3. Saved gates: actual existence/hash/version/current brief/authority, source,
   timing, canon, accepted assets, producer holds, idempotency and available
   budget after outstanding charges.
4. Actual-media review: inspect imagery/performance/transition compliance;
   schema success or a successful request proves none of those qualities.

Tests demonstrate structural and example-specific semantic checks only; no new
production authorization function is installed. Planning/reviews/generation,
rejected attempts/retries and outstanding charges count toward $200 per film.
No production call was made for this design. Your dot/Mabel and external
ChatGPT/SMS delivery to the supplied number ending in 8114 remain requested
transport capabilities; this chat reports the result, phone delivery is not
claimed. Naming and other independent architecture concerns are outside scope.

## Decisions and limitations

Subsequent October 14 integration: [Kling provider schema](fdl/kling-avatar.v1.schema.json)
and [observable-baseline example](fdl/example.kling-avatar.v1.json) document the
narrow speaking-performance handoff. Neutral `intent` is a resolved projection
of core state/progression facts, distinct from vendor prompt/mode and actual
submission/observations. The shared stage/API persists that handoff in existing
edit history; it does not load/resolve an arbitrary FDL film, approve source or
canon, or change the historical core/Bible schemas. The controlled GUI/API
comparison uses Dan's clarified standalone POC scope; its two bounded requests
were rejected for insufficient API balance. No film source/canon approval or
audiovisual benefit is inferred, and actual billed charges remain unreported.

No unanswered product decision blocks this design. JSON is the recommendation
requested here. Actual new canon/set facts, historical evidence and provider
requirement revisions need their existing applicable reviews/producer decisions
when used; no aesthetic rule, region, retry policy or approval threshold is invented.

Costs are verbosity, maintenance and stale-snapshot risk. False precision,
rigid inventories and “all fields filled” reviews can harm continuity. Keep
prose/honest unknowns and only useful facts. Prompts/seeds do not guarantee exact
AI reproduction: preserve actual pixels/audio, rejected/superseded work, maps
and edit history through existing packages.

## Validation and separate Goal Guardian review

Final checks: **587 tests / 99 files pass**, including 12 new design tests in
[fdl-design.test.ts](../../tests/media-generation/fdl-design.test.ts).
TypeScript checks, production web build and `git diff --check` pass. Full-suite
log: `outputs/fdl-design-tests.txt`. Ajv is a development dependency only; no
application code imports it or consumes FDL. v1 schemas/example remain intact.

The workflow demonstration validates K1, its inherited K2/C1 and the inactive
inspection proposal. It rejects guessed unknowns, observation approval,
evidence-free approval, malformed units/vectors, unpinned/mutable references,
invalid asset paths, historical owner aliases, merged identity/setting fields,
altered speech speed, missing pause evidence, mismatched/unbounded motion,
broken links and attempts to shadow fixed facts. Schema-valid false references
and inconsistent endpoints explicitly demonstrate the limits of shape checks.
These are illustrative fixtures, not rendered imagery, acting/Hatam validation
or proof that live production gates pass.

A dedicated Goal Guardian pass separately re-read PRODUCT_VISION's autonomous
pipeline, visual world and three-layer audio requirements; CURRENT_GOAL's live
Mark 4 holds and independent active work; and USER_WORKFLOW's chapter navigation,
automatic planning and producer review/correction. It found and corrected the
inspection's possible conflation of fixed screen coordinates with physical
furnishing continuity, clarified angle order and disallowed mutable version
labels. This was a dedicated review step, not a paid crew review/model call.

| Check | Result |
|---|---|
| Scope | Pass for the requested design: JSON/prose, separate extension and worked examples; no new runtime/stage/dispatcher or unrelated tickets. |
| Dan's workflow | No manual FDL authoring or routine chapter-plan signature is imposed. Proposed integration shares saved production state and retained producer corrections. |
| Fidelity and continuity | Source wording/speed, exact canon/story-state authority, accepted media and history remain controlling; open choices, proposals and observations cannot become canon implicitly. |
| Authority | Declared/presentation roles remain labelled; new persistent facts use existing approval, with current source/canon/cost and field/release requirements intact. |
| Evidence limits | Design fixtures are explicit. No actual anchor inspection, provider adherence, live Mark 4 readiness, external notification or remaining film-budget clearance is claimed. |

**Design acceptance passes.** No decision is needed from Dan to finish this
concern. Runtime compilation, real anchor inspection and live-state reference
resolution remain unimplemented and are not claimed as delivered. Applying
new canon/reconstruction facts or changing a required unsupported provider
control still needs its existing specific review/producer decision.
