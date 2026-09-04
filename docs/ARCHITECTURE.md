# Architecture

HeartWord is a pipeline of independently runnable stages. Each stage takes a
well-defined input and produces a well-defined output, so a stage can be
re-run on its own when the user wants to fix just one part of a chapter.

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

A separate, lower-priority lane produces **HeartWord Illustrated** (comic-style pages) from the same Scripture, audio, and character canon as stages 1-3 above, using its own page/panel and lettering pipeline rather than stages 4-7. See `docs/design/illustrated-scripture.md`; it is included in this architecture but not being actively built while HeartWord Films is the priority.

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
surfaced in the UI, not discarded once a final decision is reached.

## Open implementation questions

Tracked as design decisions, not baked into this document — see the relevant
file under `docs/design/` and `docs/plans/CURRENT_GOAL.md` for what's still
being decided (e.g. specific lip-sync engine, hosting/compute for GPU-heavy
stages, the shape of the provider interface itself, and the code project's
own language/stack, which is not yet chosen here).
