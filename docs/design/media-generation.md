# Media Generation

## Scope

Turns a scene's casting + action/blocking decision into actual visual content:
backgrounds, characters in position, camera framing — in the project's chosen
visual style (Pixar-style 3D, per `docs/PRODUCT_VISION.md`).

## Inputs

- The scene's cast (which canon characters appear — see
  `docs/design/canonical-characters.md`).
- The scene's action/blocking (what's happening, where characters are).

## Output

Rendered visual content per scene, ready to receive lip-synced speech (see
`docs/design/audio-and-speakers.md`) and be placed on the timeline (see
`docs/design/timeline.md`).

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

- Specific generation tooling/models to use for 3D scenes and characters,
  and which providers' draft tiers are worth routing through by default.
- How to keep a character's appearance consistent scene-to-scene without
  manual correction each time (beyond a single provider's short-reference
  window).
- Compute requirements and where generation runs (same constraint space as
  lip-sync — see `docs/design/audio-and-speakers.md`).
- Whether a rejected draft should retry with a revised prompt automatically,
  or always return to the producer/Scene Choreographer for a new decision.
