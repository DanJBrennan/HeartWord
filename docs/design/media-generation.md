# Media Generation

Ordinary non-speaking final requests default to eight seconds. A caller may
request ten seconds from the configured local LTX backend when measured source
coverage needs it; resolution, frame rate, source performance and fallback gates
remain unchanged. Existing accepted or uncertain takes are still reconciled
before another submission. A requested duration is not proof of usable returned
coverage; measure and review the actual result before selecting its interval.

When an accepted short interval leaves source narration uncovered, the existing
candidate stage can request additional coverage explicitly. It requires the
selected accepted attempt, its saved Director `extend_existing` review note and
a measured reason. The current clip, raw parent and original findings remain
retained while the new candidate receives its normal review. A later unresolved
candidate or local job still holds submission; current plan, draft, canon,
source, budget and separate native-audio gates remain unchanged. Ordinary calls
continue to reuse the selected clip. This adds a versioned take to the existing
stage, not a replacement selection or a new planning stage.

## Scope

Turns a scene's casting + action/blocking decision into actual visual content:
backgrounds, characters in position, camera framing — in the project's
established photorealistic visual style (see
`docs/design/canonical-characters.md`; an earlier "Pixar-style 3D" direction
was considered and rejected).

## Local LTX primary backend (2026-10-06)

Dan's proven M4 Pro Mac mini is the primary scene-video backend through LTX
Desktop's local LTX 2.5 Fast image-to-video API. It implements the existing
`VideoProvider.generateFinal` contract in `src/providers/ltx`, feeds stage 4
and the per-shot candidate API, and shares retained attempts, cost ledger,
canon review and timeline acceptance. It creates no separate pipeline stage.
Veo and Kling remain selectable during the extended comparison period.
Lip-sync has a separate producer preference: on October 30 Dan chose local LTX
Fast A2V short speaking clips (up to four seconds) chained from the preceding
last retained frame, with unchanged continuous audio and no text. See
[audio and speakers](audio-and-speakers.md#lip-sync) and the
[verified procedure and current wiring](../production/LTX_LIPSYNC_EXPERIMENT.md).
The automatic lip-sync stage is still wired to Kling Avatar; changing the
scene-motion selector does not implement A2V chaining. This October 30 preference
supersedes the October 6 Kling-first lip-sync decision.

Normal generation requests 720p, 24 fps, 5–10-second shots (currently 8s for
ordinary coverage). The provider validates Dan's proven duration matrix,
checks environment-only session authentication, discovers the Mac port over
SSH, owns a loopback-only tunnel, transfers a unique input and retrieves the
MP4 with credential-free metadata. Local API generation cost is zero; other
stage costs and the existing risky-shot approved-draft gate are preserved.
LTX requests environmental ambience (`audio: true`) with explicit no-speech
direction. It preserves the raw MP4 and exposes native audio as a separate
WAV `GenerationResult.ambientAudio` candidate. The existing candidate and
directed-coverage paths listen to that stem before publishing it as an
approved SFX asset for the existing finishing mixer. Any speech (including
unintelligible voices), uncertain review, music or failed scene/technical
checks holds the stem while leaving picture review independent. Raw video
audio remains muted in production assembly; source/cast speech retains its
authority. `audioMode: "none"` strips even unexpected Desktop audio with video
stream copy. Output dimensions and duration are recorded rather than assumed
from Desktop's preset labels. See [audio design](audio-and-speakers.md).

Progress uses authenticated `/api/generation/progress` every three seconds,
surfaced through the existing production monitor and data-directory logs.
Log parsing is limited to port discovery and secondary diagnostics after
progress failures. Requests are serialized against Desktop's single progress
slot. Lost responses retain inputs/leases and hold for reconciliation, with
no automatic paid fallback or duplicate submission.

See [local LTX operations](../production/LTX_LOCAL.md) for configuration,
diagnostics, settings and recovery. The October 14 ending-frame extension below
uses this same adapter. Arbitrary timed-keyframe/audio-input/reference features
remain future adapter work rather than another pipeline.

## Inputs

October 14 extension: both existing assistant keyframe handoffs share a five-slot
packet builder: Jesus separately, up to four other identities per uncropped
board, and set-only references separately. Story-state/proof guards and explicit
identity/cell maps preserve canon. Existing accepted FDL/Bible-regional snapshots
are hash-pinned and used in prompts/import validation. Target-reviewed library
set images extend existing reuse candidates, review notes and edit history.
An assistant-operated Blender tool prepares retained camera-view candidates;
it does not activate Pippa or approve new geometry. Local LTX now maps optional
`endFrame` to its verified `lastImagePath`; a contact sheet never belongs there.
See [workflow, evidence and limits](../production/CODEX_LTX_REFERENCE_WORKFLOW.md).

Producer update, 2026-09-08: Dan asked Codex to take over keyframe generation,
starting with Hatam Mark 2 Scene 1 Shot 1, using its built-in image tool.
The assistant-operated handoff extends stage 4's existing attempts/review
records and does not add a pipeline stage. See
`docs/production/CODEX_HANDOFF.md` for prompt/reference snapshots, import,
status, review and billing limitations. Existing video providers remain
unchanged pending actual video work. Earlier vendor preferences below are
historical design context, not a requirement to use Gemini for this handoff.

- The scene's cast (which canon characters appear — see
  `docs/design/canonical-characters.md`).
- The scene's action/blocking (what's happening, where characters are).

## Output

October 16 wardrobe refinements extend the same two built-in handoffs: a
promoted successor supplies an exact hashed wardrobe sheet, identity-only
portrait lineage and concrete approved garment facts. Both roles remain
explicit in the input map; the existing crew/FDL world references name the same
version. Candidate creation never changes generation references. Promotion
stales affected prepared contexts through existing checks, retains accepted
old film assets and triggers no regeneration. See
[the controlled refinement workflow](../production/DISCIPLE_WARDROBE_REFINEMENT.md).

Rendered visual content per scene, ready to receive lip-synced speech (see
`docs/design/audio-and-speakers.md`) and be placed on the timeline (see
`docs/design/timeline.md`).

Supplementary gap shots are appended to a scene's saved roster, but use their
existing explicit editorial anchor for automatic set references: the accepted
anchor view and its preceding view, rather than pictures from the end of the
chapter. A missing, later or foreign-scene anchor holds preparation. Ordinary
shots retain their preceding-view behavior; no canon or set approval is inferred.

## Shared doorway construction rule

Whenever a generated shot visibly contains a doorway, the historical setting
prompt automatically specifies plank leaves on wooden pivot pegs seated in
stone threshold sockets. It excludes modern butt hinges, lever handles,
decorative hardware, and tidy modern trim. The rule is deliberately
construction-level rather than one universal door design: ordinary homes use
one smaller plank leaf, while public buildings such as synagogues may use
heavier two-leaf doors. Capernaum uses dark-basalt thresholds and jambs;
Jerusalem uses local limestone. Temple doors require a separate, source-based
production reference rather than an inferred domestic or synagogue treatment.

This rule is informed by the first-century door reconstruction described by
[Nazareth Village](https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/entrance/), which uses a Gamla-style synagogue threshold and door-pivot evidence.

## Shared costume palette rule

Named characters retain their approved canon clothing. Unnamed people draw
from a controlled first-century palette of plain-weave or subtly striped wool
and linen: unbleached cream, brown, charcoal, ochre, muted madder, and
restrained indigo. Generation explicitly rejects high-contrast green-and-white
vertical stripes, vivid modern patterns, machine-like prints, and any unique
color or pattern language that has not been approved for a named character.
This keeps background variety legible without allowing a one-off extra to
invent an anachronistic visual language.

## Shared lighting readability rule

HeartWord defaults generated scenes to clearly readable exposure with generous
motivated ambient light. Natural direction, time of day, and atmosphere remain
important, but dust, smoke, shadow, or a dramatic key light must not make faces,
action, or important setting details hard to read at normal viewing size. A
genuinely dark or low-key treatment is reserved for a stated story purpose and
must still preserve readable faces and action. This is a visual-legibility
default, not a license to alter a scene's source-grounded action, setting, or
time of day.

## Shared cinematic staging rule

Generated frames are staged as story moments, never as posed group portraits.
Unless a shot is explicitly a lip-sync performance shot, people use
story-motivated eyelines, varied natural poses, asymmetrical spacing, and
partial overlap; they face the speaker, action, or another credible point in
the scene rather than the camera. For a lip-sync performance, the designated
speaker may make intentional near-lens or direct-to-camera eye contact when it
serves the spoken performance. Supporting people still remain naturally
oriented within the scene.

## Shared shot-state fidelity rule

Every keyframe must depict the exact planned moment, not a generic adjacent
event. Prompts explicitly prohibit invented arrivals, departures, doorway
crossings, or confrontations when they are not in the shot action. A doorway,
threshold, prop, or composition cue is omitted unless the action or a recorded
continuity constraint needs it. Automated scene fidelity review separately
checks that the returned image has not changed the planned causal moment.

When crew direction specifies a reaction gesture, it applies to individual
people, not the group composition. Final prompt priority preserves the gesture
while prohibiting a centered, symmetrical, camera-facing lineup; it requires
varied poses, uneven depth, partial occlusion, and story-motivated eyelines.

## Retained-take library

October 7 preservation update: final/draft/guided provider videos and
assembled-shot outputs now use unique take filenames; image/video writes are
exclusive. Source/voice-mapped cast reuse replaces scoped-index filename reuse.
Rejected and superseded work is retained indefinitely by default and included
with provenance in the [portable chapter package](chapter-preservation.md).
This does not authorize a new generation, change selected assets, or claim
old overwritten pixels can be recovered from a prompt. The new
[FDL v2 design](film-description-language-v2.md) remains separate from implemented
provider request contracts.

The October 14 [Avatar direction implementation](../production/KLING_AVATAR_DIRECTION.md)
adds a narrow verified speaking-performance mapping: provider-neutral state
intent is retained alongside a versioned baseline/override profile and compiled
only into Avatar `prompt`/`mode`. It does not turn arbitrary FDL into provider
fields. A separate provider schema/example preserves the existing core and
Bible/regional schemas. Required unsupported controls hold, and submitted
parameters/audio, defaults/omissions, outstanding costs and candidate reviews
remain inspectable through the same saved production state. This does not
replace LTX, invoke image generation or authorize a paid fallback.

The v2 worked anchors/clip describe continuity intent alongside prose, with
open choices, unresolved facts and inactive inspection proposals. No generator
consumes that JSON directly today. A future adapter must resolve the same saved
production/canon/review state and compile supported inputs. In particular, the
current final-video interface has no end-frame field; an exact endpoint cannot
be promised by adding it to prose or silently dropping the requirement.

Every verifiable generated image or video remains at its immutable original
path, whether it was selected for its origin shot, held for review, escalated,
or simply not selected for that origin timeline. `generation_attempts` remains
the authority for provider, model, prompt, review status, and cost; the media
library is an idempotent discovery projection over those records, not a second
asset store or a cleanup process. Missing files are reported by omission rather
than reconstructed as invented provenance.

The producer can browse original media with origin chapter/shot/verse, prompt,
provider, model, review status, unresolved review context, and whether it was
selected on its origin timeline. “Not selected” is strictly an editorial fact;
it never means a take is fit for another shot. A chosen item becomes only a
reviewable target-shot candidate. It does not replace the donor, alter the
target’s accepted media, transfer the donor’s approval, or authorize a provider
call. Target language and the single approved regional canon context must match
before the candidate is recorded. Gus prepares a candidate reference; Vera and
Orion assess target fitness, Dottie checks canon, and Nell decides editorial
use through the existing reviewed workflow.

For retained video, the producer may extract a still at a requested timecode.
Extraction creates a new immutable frame file with parent video and timecode
provenance; it never edits the original video or calls a media provider. The
stable library metadata is intentionally suitable for later retrieval agents,
but automatic creative selection is not implemented or implied by this design.

Standalone location references (stills or video) use the same immutable media
catalog without a fabricated project or shot origin. Registering an existing
file records its path, hash, production provenance, title, location, concise
search tags, source language, and approved regional-canon context; it does not
copy the file, generate media, or put anything on a timeline. Such items are
marked `reusable_reference` for discovery, which is an asset-level label only:
each target shot still requires the guarded reuse-candidate and normal
source/canon/editorial review. A frame extracted from a standalone video keeps
its parent/timecode and location metadata. For now, standalone registration is
scoped to the approved Hatam/Papuan production world; other language/canon
reuse is a separate producer decision, not an inference from an empty cast.

## Draft Room and Cost-Tiered Generation

October 22 execution: the existing draft stage may receive a local LTX preview
through its provider interface when the configured cloud draft request is held.
It records the provider's actual declared resolution, retaining 360p for the
existing Omni adapter. A 720p local preview remains a held `generate_draft`
attempt, requires actual source/cast/motion review and selection, and cannot
silently count as final footage. Original errors, costs and outstanding charges
remain retained. This adds no stage or paid scene fallback.

Gemini Omni 1.1 Flash (Google, released 2026) is a concrete example of the
kind of provider capability this design should lean on: it generates
lightweight 360p draft previews at roughly a third of the cost and up to 60%
faster than its own 720p standard tier, with an explicit path to upscale an
approved draft to 1080p or 4K rather than regenerating from scratch. It also
offers tools directly useful for character-driven scenes: a short (~3 second)
video reference for maintaining character consistency across shots,
first/last-frame keyframing for controlled camera movement between two
specified frames, and scene extension in 10-second increments up to 40
seconds total.

HeartWord's default shot-iteration loop should be built around this
draft-then-commit pattern, provider-agnostically:

1. Generate a cheap, low-resolution draft of a shot first ("the draft room").
2. Evaluate the draft — by the producer, by automated review (see
   `docs/design/automated-quality-control.md`), or both — for composition,
   blocking, and character consistency before spending on a full-resolution
   render.
3. Only escalate an approved draft to a full-resolution/final-quality
   generation pass, ideally by upscaling the approved draft rather than
   re-generating independently, to preserve the approved composition.
4. Use reference/keyframe/extension features (where a provider offers them)
   to keep a character's appearance and a shot's camera movement consistent
   across drafts, finals, and any later scene extension, rather than
   regenerating an entire shot to make a small change.

This is a specific implementation of the cost-tiering principle already in
`docs/PRODUCT_VISION.md`'s Cost Governance section: routine shots may never
need to leave the draft tier if a lower-cost pass is good enough, while
canon-critical or emotionally important shots proceed to full resolution only
after the draft is approved.

Provider names and capabilities in this section will keep changing (this
design was itself informed by one specific provider's public release).
Design the generation-provider interface so a new provider's draft/final
tiers, reference mechanisms, and keyframe/extension features can be plugged
in without redesigning this workflow.

## Open questions

- How to keep a character's appearance consistent scene-to-scene without
  manual correction each time (beyond a single provider's short-reference
  window) — the targeted-edit capability above helps for single-detail
  fixes, but broader drift across many scenes is a separate problem.
- Compute requirements: local scene video now uses Dan's dedicated M4 Pro
  Mac mini with 64 GB unified memory and LTX Desktop. The preferred short-clip
  A2V lip-sync procedure also uses that Mac; the automatic lip-sync stage still
  uses its existing cloud adapter pending integration. Image, draft, voice and
  review providers retain their existing APIs.
- The automated media review in `docs/design/automated-quality-control.md`
  resolves to one of: accept, retry same prompt, retry with a modified
  prompt, escalate to a different provider/tier, or hold for human review.
  What's still open here is the policy for how many automatic retries/
  escalations a shot gets before it must return to the producer/Scene
  Choreographer rather than continuing to loop on its own.
