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

## Tests

Add tests under `tests/` alongside the pipeline stage they cover. Run the full
suite before considering a change complete.
