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
7. **Quality control** — automated checks across the assembled video before
   it's handed to the user for review, per `docs/design/automated-quality-control.md`.

## Design principle

Every stage should be able to run in isolation against saved output from the
previous stage, so re-running "just the lip-sync for scene 4" doesn't require
re-running the whole chapter.

## Open implementation questions

Tracked as design decisions, not baked into this document — see the relevant
file under `docs/design/` and `docs/plans/CURRENT_GOAL.md` for what's still
being decided (e.g. specific lip-sync engine, hosting/compute for GPU-heavy
stages, and the code project's own language/stack, which is not yet chosen here).
