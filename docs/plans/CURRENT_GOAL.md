# Current Goal

## Status: vision and design complete; scoping the architecture request (2026-09-04)

`docs/PRODUCT_VISION.md` reflects the mature vision recovered from BVET (the
second of two prior attempts at this project), refined across this whole
design pass: branding (HeartWord AI/Studio/Films/Illustrated, logo, trimmed
tagline), a first-class Character Creation & Editing Tool, Gemini Omni
1.1 Flash-style Draft Room cost-tiered generation, the full Illustrated
Scripture strategy recovered from prior Mark/Acts comic work, enriched
canonical-character rules, language/book/chapter navigation with undo/redo,
a two-level book/chapter storyboard model with multi-agent role-based shot
planning, producer notifications (including a WhatsApp self-message
channel), export/delivery tiers grounded in the real distribution path
(Android phones, YouTube, WhatsApp fan-out through village leaders,
Bluetooth/USB-C), a field review gate before that distribution (Ryan and a
native-Hatam-speaker review team), and an FCBH-rights gate on public
YouTube publication independent of that.

Design docs completed, per `docs/ARCHITECTURE.md`'s "Design principles":

- **Provider abstraction** — every media provider sits behind one interface;
  see `docs/design/media-generation.md`'s Draft Room design, now with a
  concrete review-outcome set (accept / retry / retry-modified / escalate
  provider / hold for human).
- **Automated media review** — an evolving, learned rubric (not a fixed
  checklist), seeded with concrete dimensions (canonical likeness, extra/
  malformed characters, mouth-sync, unwanted text, continuity); see
  `docs/design/automated-quality-control.md`.
- **Illustrated Scripture strategy** — recovered in full from a prior
  attempt's Mark/Acts comic work; see `docs/design/illustrated-scripture.md`.
  Included in the architecture but stays lower priority than HeartWord Films.
- **Canonical Characters** — recognition hierarchy, naming/identity safety,
  and a non-destructive candidate-review workflow; see
  `docs/design/canonical-characters.md`.
- **Character Creation & Editing Tool** — the tool's own workflow (starting
  a character, gap detection during shot planning, evolving an existing
  character, voice mapping and live test); see
  `docs/design/character-tool.md`.
- **Timeline and project identity** — language/book/chapter as the project
  key, typed-command edit history with undo/redo; see
  `docs/design/timeline.md`.
- **Shot planning as multi-agent collaboration** — book/chapter storyboards,
  a manual "Create Storyboard" trigger, role agents that interact (not just
  independently propose) with the interaction logged; see
  `docs/design/shot-planning.md`.
- **Producer notifications** — trigger events, channel options (email,
  Pushover/ntfy.sh, Twilio, native app/PWA, WhatsApp self-message), a
  cheap-first phased approach; see `docs/design/notifications.md`.
- **Working conventions for AI coding agents** — `AGENTS.md` now includes a
  "never infer requirements from code, ask Dan on ambiguity" rule and a
  Goal Guardian check (verify implementation against the vision/goal/
  workflow docs, not just tests), aimed directly at the 100-ticket failure
  mode from the prior attempt.

## Next up

Before handing this to an architecture pass:

- **Scope a v1.** Nothing yet says what gets built first versus what the
  architecture should merely leave room for. The vision covers an 11-stage
  workflow, multi-agent shot-planning with a logged negotiation,
  notifications, three-layer audio, a live cost ledger, an evolving media
  review rubric, and a full second Illustrated lane — architecting all of
  it at once repeats the shape of the 100-ticket mistake one phase earlier.
  A v1 scope needs Dan's confirmation, not an assumption.
- The application shape (browser app with an embedded AI assistant vs. a
  stand-alone editor calling an AI assistant via API) — an architecture
  question to resolve, not a blocker to starting.
- Which subset of `BVET-Data/assets` to import (planned: FCBH original
  audio, authorized Scripture text per language, and the in-progress canon
  character library) and how it lands in HeartWord's own asset area without
  carrying over BVET's code issues.
- Which subset of the illustrated-Scripture prior attempt's assets
  (approved pages, reference sheets, prompt templates) to import, once that
  lane becomes active — not needed for a Films-first v1.

## Lesson to keep applying

A prior attempt to fix BVET's issues fragmented into ~100 disconnected
tickets and lost the thread of the actual goal. Keep every piece of design
and implementation work traceable back to `docs/PRODUCT_VISION.md` rather
than letting a backlog of fixes become the de facto plan. The Goal Guardian
check in `AGENTS.md` exists specifically to catch this during
implementation; scoping a v1 before architecture exists to catch it one
step earlier.
