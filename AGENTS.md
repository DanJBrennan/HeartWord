# AGENTS.md — HeartWord

Instructions for any AI coding agent (Claude Code, Codex, Copilot, etc.) working in this repository.

## What this project is

HeartWord is an autonomous pipeline that turns an existing heart-language audio
recording of a Bible chapter (e.g. Mark 2) plus its translated text into a finished,
editable video: indigenous-styled canon characters, AI-generated scenes, and
speech that is lip-synced to the source-language audio. See `docs/PRODUCT_VISION.md`
for the full pitch and `docs/ARCHITECTURE.md` for how the pipeline is structured.

## Before making changes

1. Read `docs/PRODUCT_VISION.md`, `docs/NON_GOALS.md`, and `docs/ARCHITECTURE.md` first.
2. Check `docs/plans/CURRENT_GOAL.md` for what's actively being worked on.
3. Check the relevant file under `docs/design/` before touching timeline, media
   generation, character, audio, or QC logic — each subsystem has a design doc.
4. Prefer extending an existing pipeline stage over adding a new one; if a new
   stage is genuinely needed, add a design doc for it under `docs/design/`.

## Working conventions

- Keep pipeline stages independently runnable and testable (ingestion, scene
  breakdown, casting, media generation, lip-sync, voice, assembly) — this is an
  autonomous pipeline, not a monolith.
- Any stage that makes a judgment call about content (scene action, character
  casting, framing) should log its reasoning so a human can review and correct it
  from the assembled output, not just the final video.
- Do not invent theological or narrative content beyond what the source
  translation and narration say — see `docs/NON_GOALS.md`.
- When you finish a unit of work, update `docs/plans/CURRENT_GOAL.md` and, if a
  plan document is fully done, move it into `docs/plans/completed/`.
- Never infer a major product requirement from the existing code. The
  product specification (`docs/PRODUCT_VISION.md` and `docs/design/`) defines
  what HeartWord should become; the existing code only describes what has
  been implemented so far. If a change creates ambiguity about product goal,
  architecture, or priorities, stop and ask Dan rather than resolving it
  yourself. Do not create additional features, tickets, abstractions, or
  subsystems merely because they seem useful — this is how a prior attempt
  at this project fragmented into roughly 100 disconnected tickets and lost
  the goal (see Lineage and Lessons Learned in `docs/PRODUCT_VISION.md`).

### Goal Guardian check

Before starting substantial implementation work, state the product goal and
acceptance criteria it serves, in terms of `docs/PRODUCT_VISION.md`,
`docs/plans/CURRENT_GOAL.md`, and `docs/USER_WORKFLOW.md` — not just the
ticket or prompt in front of you. When that work is done, check the result
against those documents, not merely against passing tests: a change can pass
every test and still not be what was asked for. Concretely, ask: has the
implementation wandered from the stated goal? Has it invented requirements,
tickets, or complexity beyond what was asked? Is Dan's actual workflow
preserved? Anything that genuinely requires a product decision gets
surfaced to Dan rather than resolved autonomously. This applies regardless
of which coding agent or harness is doing the work, and is worth running as
an explicit, separate pass — by a second agent/session, or a dedicated
review step — rather than trusting the same pass that wrote the code to
also judge it.

## Tests

Add tests under `tests/` alongside the pipeline stage they cover. Run the full
suite before considering a change complete.
