# Media Generation

## Scope

Turns a scene's casting + action/blocking decision into actual visual content:
backgrounds, characters in position, camera framing — in the project's
established photorealistic visual style (see
`docs/design/canonical-characters.md`; an earlier "Pixar-style 3D" direction
was considered and rejected).

## Inputs

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

Rendered visual content per scene, ready to receive lip-synced speech (see
`docs/design/audio-and-speakers.md`) and be placed on the timeline (see
`docs/design/timeline.md`).

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

## Retained-take library

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

## Draft Room and Cost-Tiered Generation

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
- Compute requirements and where generation runs: resolved for v1 as "not
  applicable" — Nano Banana, Veo 3.1 Lite, Omni 1.1, and Kling's Avatar API
  are all cloud-hosted and API-key authenticated, so v1 needs no local GPU
  provisioning for media generation itself (see
  `docs/design/audio-and-speakers.md` for whether that holds for lip-sync
  too).
- The automated media review in `docs/design/automated-quality-control.md`
  resolves to one of: accept, retry same prompt, retry with a modified
  prompt, escalate to a different provider/tier, or hold for human review.
  What's still open here is the policy for how many automatic retries/
  escalations a shot gets before it must return to the producer/Scene
  Choreographer rather than continuing to loop on its own.
