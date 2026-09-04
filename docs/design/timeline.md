# Timeline & Assembly

## Scope

Combines per-scene generated video (with lip-synced audio already applied) into
one continuous, watchable chapter video, in scene order, with continuous audio
from the source narration.

## Requirements

- Preserve sync between the heart-language audio and on-screen lip movement
  across scene boundaries.
- Keep scene boundaries addressable, so a single scene can be regenerated and
  re-inserted without rebuilding the whole timeline.
- Output a file/format the user can actually open and edit further (per
  `docs/USER_WORKFLOW.md` — this is a starting cut, not a locked final export).

## Open questions

- Target output format/container and whether an editable project file
  (e.g. an edit-decision-list style artifact) is produced alongside the video.
- How manual edits to one scene are reconciled back into the full timeline.
