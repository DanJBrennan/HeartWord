# Film Description Language (FDL), v1 design

**Historical draft retained.** The current recommendation, contracts, worked
examples and validation are in [FDL v2](film-description-language-v2.md),
refined October 14, 2026. The v1 schemas/example below remain unchanged for
preservation and comparison; neither version is a runtime generator interface.

Status: new design and worked examples, requested October 7, 2026. This is
not an implemented generator interface, approval gate, or another pipeline.
Context: Dan's “Prompt Kling performance guidance” chat, especially its
attached architectural concerns and confirmed policy. Preservation can ship
without converting historical productions to FDL.

## Purpose and representation

Describe what stays fixed and what changes across keyframes and clips, with
prose explaining purpose. Use versioned JSON with a JSON Schema, rather than
a new textual grammar or executable language. JSON fits existing immutable
crew briefs, `generation_attempts`, canon versions and render manifests;
a custom grammar would add parsing, tooling and migration work without
improving the actual film. FDL describes intended imagery; retained generated
pixels/audio describe what the provider actually delivered.

The [core schema](fdl/core.schema.json) separates persistent world facts,
scene states, shot composition, keyframes, clip motion and provider settings.
The [Bible/Papuan extension](fdl/bible-papuan.schema.json) adds Scripture
grounding, production eligibility, regional identity and historical-setting
authority. A provider never receives the extension as presumed native API
parameters. Its adapter compiles accepted FDL plus prose and actual reference
images into supported request fields, retaining the exact compiled request.

The [worked JSON packet](fdl/example.scene.json) accompanies the example
below. Its `bind:*` references, unknowns and unapproved facts deliberately
prevent it from masquerading as a ready generation request. JSON Schema
validity cannot prove reference existence, interval coverage, shared identity
or approval: the existing source/canon/timing gates must validate those
relationships before any adapter runs.

## Identity, units and uncertainty

- Stable entities refer to existing record IDs and exact versions. Asset
  references use SHA-256 and package-relative URIs. Names alone cannot select
  a character, wardrobe or building. A package resolves each URI to retained
  bytes; missing dependencies hold work.
- Revisions are immutable. `parentRevision` and `inputRevision` identify the
  accepted basis; stale contributions become proposals for reconciliation.
  Changing a revision does not overwrite its parent or existing takes.
- Durations and offsets use integer milliseconds, half-open intervals. Frame
  addressing records numerator/denominator frame rate and half-open ranges;
  never infer a frame rate from an MP4 filename. Audio maps retain source and
  cast interval IDs and ranges, plus production placements and explicit gaps.
- Optional world coordinates use metres, a right-handed scene frame with
  +X right, +Y forward and +Z up. Camera yaw/pitch/roll use degrees, yaw about
  +Z. A Blender reference records its scene origin and transform; screen-left
  is camera-relative, not a substitute for world coordinates. Lens focal
  length and sensor width use millimetres. Unknown scale/geometry remains
  unknown; an image cannot establish hidden geometry or a real lens setting.
- Every fact has a value or `unknown`, units where applicable, status,
  evidence and owner. `observed` means visible evidence, `proposed` means a
  suggestion, and `approved` names an approval record. A model's observation
  cannot become approved canon by appearing in the next prompt.
- Core semantic fact names include silhouette, face/hair/beard, garment cut,
  layers/drape, color blocks, tassels and footwear; building geometry,
  openings, materials and furnishings; prop position, ownership and state;
  subject position, orientation, gaze, expression and gesture; camera
  position/target/lens/framing/movement; motivated light, readability,
  time/weather; action and beginning/end state. Prose remains necessary for
  meaningful intent, nuance and uncertainty.

## Scope and ownership

`world` references versioned canon and set facts. `states` express the local
moment, including approved wardrobe/story state. `shots` own composition and
camera intention; `keyframes` identify a shot's beginning/end anchor; `clips`
record the intended progression between anchors. Changing camera angle does
not change the room, clothes or cast. A clip can change a subject's position
only when an explicit motion/action explains the change.

Dottie owns canon/identity/voice references; the Costume Designer owns local
wardrobe proposals constrained by that approved canon. Arlo owns set facts;
Leon owns camera/composition; Tessa owns blocking/motion; Rufus owns creative
intent; Orion checks continuity. June owns source bindings; Miriam reviews
Scripture/cultural fidelity without claiming fluent field approval. Gus
compiles supported provider requests; Vera reviews returned media; Kit owns
applicable lip-sync performance; Nell and Sam own picture/audio placement.
Mabel coordinates versioned handoffs and holds, never grants canon/source or
release approval. These are the existing crew contracts, not new workers.

An immutable chapter record with role-owned contributions is preferable to
independent mutable copies. Existing `production_runs.brief_json`,
`production_events`, producer notes and edit history remain the authorities.
FDL snapshots belong in those saved packets, with input revision, owner,
scope, evidence and status; transport, retries, money and authority remain
outside the creative description. Historical aliases and declared roles do
not gain runtime tools from this design.

Objections use the existing proposal → objection → revision → resolution
protocol. Leon proposing a camera behind a wall requires Arlo's geometry
evidence and Tessa's adjusted blocking; Rufus cannot erase the objection.
A cream-mantle canon changed to blue is held by Dottie/Orion, even if the new
image looks attractive. Only a newly approved canon version can change that
authority. Different agents may propose changes outside their domain but
cannot silently overwrite the owner. Critic confidence is evidence advice,
never approval or a vote.

## Bible and Papuan extension

The extension keeps three independent authorities explicit:

1. Exact verified source/reference binding, verse scope, source intervals and
   approved cast-audio mappings. English provides semantic context, never
   Hatam wording or a guessed word-level alignment.
2. Approved Papuan *character identity*, including versioned garment facts
   and approved reference images. Other regions and illustrated canon cannot
   substitute for this video identity.
3. First-century biblical physical setting and approved historical
   reconstruction. Papuan faces do not relocate Galilee to modern Papua.
   A set's uncertain furnishings remain observations/proposals until reviewed.

Corpus eligibility, citation-reference scope, canon scope, field review and
release status remain distinct saved gates. The extension cannot manufacture
approval from the presence of a file or the success of a model call. It
references existing approval/evidence records; it does not approve Scripture,
canon or public distribution by itself.

## Scene-anchor and successive-shot example

This is a design example for the already established Mark 4:1 boat/shore
scene, not a new approved plan or actual Hatam wording. IDs below describe
roles of existing records to bind during implementation; they are not new
production records.

| Element | Anchor K1 | Following keyframe K2 | Clip K1 → K2 |
|---|---|---|---|
| Grounding | Mark 4:1, exact saved source binding | Same source/cast binding | Same authoritative audio, normal speed |
| Identity | Approved Papuan Jesus version and wardrobe | Same exact version | Same face, silhouette and garment |
| Set | Approved shoreline/boat version, Jesus seated in boat | Same world and seated state | No departure, arrival or second boat |
| Composition | Wide from shore, crowd orientation specified | Camera nearer the same axis; readable seated speaker | Slow camera push; subject stays seated |
| Continuity | Boat/shore relation fixed; crowd faces speaker | Preserve relationship, allow camera change | Start/end camera positions explain change |
| Uncertainty | Hidden boat interior and unseen crowd are unknown | Do not invent locked details | Provider output must be checked |
| Speech | Source performance continues | Visible speech requires lip-sync | Scene-motion generation cannot invent speech |

K1 may leave legitimate unapproved visual choices open, while all canon/set
constraints are attached before generation. After reviewing K1, Arlo/Orion
may propose visible boat material, shoreline arrangement or furnishing facts
with image regions/timecodes and uncertainty. They cannot promote an extra
boat, incorrect garment, invisible room layout or fabricated event into
canon. Producer-reviewed facts create a new version. K2 and its clip inherit
only those accepted facts; actual accepted K1/K2 images remain in the package.

A safe emotional pause is a separate timeline gap after a complete source
interval, with purpose, approval, ambience policy and accepted visual
coverage. FDL clip duration is not permission to stretch speech. Related
speaking clips share approved performance intention, with source-supported
local changes; generation boundaries do not reset expression or gaze.

## Adapter and preservation contract

An eventual adapter loads an accepted FDL revision and verifies source,
canon, asset hashes and applicable reviews. It builds a bounded prose prompt,
actual reference-image package and *supported* provider settings. It records
the FDL revision, prose, references, compiled prompt, actual request settings,
provider/model, usage, outstanding charges and returned asset hashes in
existing attempt/review records. Unsupported required controls hold rather
than silently disappear; unsupported optional controls are disclosed.

Keyframes use assistant-operated built-in generation; unavailable assistants
leave a saved awaiting-image handoff. No paid image API substitution is
implicit. Scene video uses existing provider selection; Kling Avatar retains
its speech role. Existing reviews can advance production automatically when
source/canon/cost gates pass; Dan need not approve each chapter plan. Field
and release approval remain separate. All direct costs, including reviews,
rejected attempts and outstanding requests, count against $200 per film.

FDL is not a claim that a provider can recreate an image. Model versions,
randomness and vendor availability change. **Exact AI reproduction is not
guaranteed by retaining prompts or seeds. Preserve actual generated pixels
and audio**, including rejected and superseded work, with the package's
timeline, dependencies and edit history.

This design adds token, validation and maintenance costs. False precision,
rigid fields, stale snapshots and “filled every field” reviews are hazards.
Begin with facts demonstrated to improve continuity, retain free prose and
unknowns, and validate actual media rather than declaring success from schema
validity. Runtime integration and provider-specific controls need their own
focused implementation against this design; they are not prerequisites for
the portable preservation tools delivered here.
