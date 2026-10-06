# HeartWord

An AI pipeline that turns an existing heart-language audio reading of a Bible
chapter into a finished, editable video — indigenous canon characters, AI-directed
scenes, and speech lip-synced to the source recording.

Start here:

- [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) — what this is and why
- [`docs/USER_WORKFLOW.md`](docs/USER_WORKFLOW.md) — how it's used end to end
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — pipeline stages
- [`docs/NON_GOALS.md`](docs/NON_GOALS.md) — what this is deliberately not
- [`docs/design/`](docs/design/) — design docs per subsystem
- [`docs/plans/CURRENT_GOAL.md`](docs/plans/CURRENT_GOAL.md) — what's active right now

For AI agent working conventions, see [`AGENTS.md`](AGENTS.md).

Local video generation defaults to LTX Desktop on the dedicated Mac mini.
See [`docs/production/LTX_LOCAL.md`](docs/production/LTX_LOCAL.md) for session
authentication, SSH access, diagnostics (`npm run ltx:test -- --health`),
supported settings, and selectable Veo/Kling comparison runs.
