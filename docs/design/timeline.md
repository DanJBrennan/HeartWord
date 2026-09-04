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

## Project Identity: Language x Book x Chapter

Every timeline belongs to exactly one (language, book, chapter) combination
— e.g. Hatam Mark 2, or English Acts 5. The producer navigates directly to
any such combination (see the selector in `docs/USER_WORKFLOW.md`) and lands
on that project's current state, whatever stage it has reached. A chapter
existing in one language does not imply it exists in another; each
combination has its own independent timeline and edit history, even though
several combinations may share the same underlying Scripture passage, audio
alignment, and character canon.

## Edit History, Undo/Redo, and Persistence

Edits are preserved as they're made — there is no separate manual "save"
action, and no whole-project overwrite on every change. The mechanism that
makes this safe, based on what worked in a prior attempt at this project:

- Every edit (move, trim, split, an audio mix change, an audio cue
  placement, a restore-to-earlier-state, an explicit rebuild) is a **typed
  command**, not a raw field update. A command carries enough information to
  be replayed or reasoned about later, not just "the new value."
- Commands are appended to a **retained, ordered history** for the project
  rather than replacing prior state in place. This is what makes undo and
  redo possible: undo steps backward through the history, redo steps forward
  again, and neither operation destroys the commands it steps past (a new
  edit made after an undo starts a new branch of history from that point,
  rather than silently discarding the redo branch without the producer
  choosing to).
- Each command carries an identifier so a retried or duplicated network
  request cannot be applied twice.
- The project's saved state carries a revision number, so two independent
  editing sessions on the same project can't silently overwrite one
  another's work — a stale write is rejected rather than accepted and lost.
- Full history is retained, not just a fixed-depth undo stack, so a producer
  can return to an earlier point in a chapter's editing history even after
  many subsequent changes, and so the record of how a chapter reached its
  current state stays inspectable.

## Open questions

- Target output format/container and whether an editable project file
  (e.g. an edit-decision-list style artifact) is produced alongside the video.
- How manual edits to one scene are reconciled back into the full timeline.
- How far back full history needs to remain cheaply accessible (undo/redo in
  the current session) versus archived (browsable but not instant) for a
  chapter with a long editing history.
