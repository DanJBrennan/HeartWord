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

## Open questions

- Specific generation tooling/models to use for 3D scenes and characters.
- How to keep a character's appearance consistent scene-to-scene without
  manual correction each time.
- Compute requirements and where generation runs (same constraint space as
  lip-sync — see `docs/design/audio-and-speakers.md`).
