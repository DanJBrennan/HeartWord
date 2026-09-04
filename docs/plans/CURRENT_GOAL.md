# Current Goal

## Status: architecture design in progress (2026-09-04)

`docs/PRODUCT_VISION.md` reflects the mature vision recovered from BVET (the
second of two prior attempts at this project), plus lessons learned, the
HeartWord AI/Studio/Films/Illustrated branding, and two new capabilities the
producer added this time: a first-class Character Creation & Editing Tool,
and the Gemini Omni 1.1 Flash-style Draft Room cost-tiered generation
pattern.

Design work so far, per `docs/ARCHITECTURE.md`'s "Design principles":

- **Provider abstraction** — every media provider sits behind one interface;
  see `docs/design/media-generation.md`'s Draft Room design.
- **Automated media review** — an evolving, learned rubric (not a fixed
  checklist) checks returned media against the request and the passage's
  tone; see `docs/design/automated-quality-control.md`.
- **Illustrated Scripture strategy** — recovered in full from a prior
  attempt's Mark/Acts comic work (heart-language-first layout, textless art
  with deterministic overlay, evidence-based pagination, the Letterer's
  Principle for speech balloons, and a page/book verification pipeline); see
  `docs/design/illustrated-scripture.md`. This lane is included in the
  architecture but stays lower priority than HeartWord Films.
- **Canonical Characters** — recognition hierarchy, naming/identity safety
  for confusable biblical names, and a non-destructive candidate-review
  workflow for evolving character canon; see
  `docs/design/canonical-characters.md`.

## Next up

Still open, per `docs/PRODUCT_VISION.md`'s "Design Decisions Intentionally
Left Open" section:

- application shape (browser app with an embedded AI assistant vs. a
  stand-alone editor calling an AI assistant via API);
- the staged production workflow's concrete implementation (11 stages, from
  Source Material Validator through Distribution);
- the Character Creation & Editing Tool's own design;
- which subset of `BVET-Data/assets` to import (planned: FCBH original
  audio, authorized Scripture text per language, and the in-progress canon
  character library) and how it lands in HeartWord's own asset area without
  carrying over BVET's code issues;
- which subset of the illustrated-Scripture prior attempt's assets
  (approved pages, reference sheets, prompt templates) to import, once that
  lane becomes active.

## Lesson to keep applying

A prior attempt to fix BVET's issues fragmented into ~100 disconnected
tickets and lost the thread of the actual goal. Keep every piece of design
and implementation work traceable back to `docs/PRODUCT_VISION.md` rather
than letting a backlog of fixes become the de facto plan.
