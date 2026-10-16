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

Run the normal HeartWord interface with `npm start`, then open
[HeartWord Studio](http://127.0.0.1:4000/). This builds the current frontend and
starts the existing production server on loopback, using
`C:\Users\danbr\HeartWordData` by default (`HEARTWORD_DATA_DIR` overrides it;
`PORT` overrides port 4000). The chapter inventory is the entry screen; open a
chapter for the producer console and existing production/editing controls.
These controls use the same source, canon, budget and approval gates. Starting
or browsing the app does not dispatch a film or authorize a charge.

For development, `npm run dev` runs Vite with the same backend. The earlier
port-4027 read-only preview and port-4026 synthetic demonstration are optional
diagnostic scripts, not the normal application entry point.

Local video generation defaults to LTX Desktop on the dedicated Mac mini.
See [`docs/production/LTX_LOCAL.md`](docs/production/LTX_LOCAL.md) for session
authentication, SSH access, diagnostics (`npm run ltx:test -- --health`),
supported settings, and selectable Veo/Kling comparison runs.

For data protection and replacement-computer recovery, see
[`docs/production/DISASTER_RECOVERY.md`](docs/production/DISASTER_RECOVERY.md).
`npm run data:backup -- inventory` measures the data; completed SQLite/media
snapshots may be published to OneDrive. Local copies do not establish verified
cloud protection.
