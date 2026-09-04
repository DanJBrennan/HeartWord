# Current Goal

## Status: product vision rewritten from BVET lineage (2026-09-04)

`docs/PRODUCT_VISION.md` now reflects the mature vision recovered from BVET
(the second of two prior attempts at this project), plus lessons learned and
one new capability the producer added this time: a first-class Character
Creation & Editing Tool (headshot + body images + voice mapping with live
audio test + AI-suggested starting description).

## Next up

Design the architecture (`docs/ARCHITECTURE.md` and `docs/design/*`) informed
by that vision — still open, per the vision doc's "Design Decisions
Intentionally Left Open" section:

- application shape (browser app with an embedded AI assistant vs. a
  stand-alone editor calling an AI assistant via API);
- the staged production workflow's concrete implementation (11 stages, from
  Source Material Validator through Distribution);
- the Character Creation & Editing Tool's own design;
- which subset of `BVET-Data/assets` to import (planned: FCBH original
  audio, authorized Scripture text per language, and the in-progress canon
  character library) and how it lands in HeartWord's own asset area without
  carrying over BVET's code issues.

## Lesson to keep applying

A prior attempt to fix BVET's issues fragmented into ~100 disconnected
tickets and lost the thread of the actual goal. Keep every piece of design
and implementation work traceable back to `docs/PRODUCT_VISION.md` rather
than letting a backlog of fixes become the de facto plan.
