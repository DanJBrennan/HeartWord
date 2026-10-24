# Timeline & Assembly

## Scope

October 15 implementation: the [live producer console](live-producer-view.md)
extends the chapter workspace with resizable storyboard/monitor/inspector panels,
menus for existing controls, and a zoomable inspection timeline. Valid immutable
render manifests supply chapter timing and mutually exclusive source/cast speech
plus applied music/effects auditions; gaps remain explicit. The accepted subset
reel has a separate picture-only clock. Review toggles and browser-local layout
preferences do not create another editable timeline or change saved mix/history.
Legacy custom maps stay in their existing editor; no source timing is invented.

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
- A fixed approved opening uses the existing `pre_source` editorial beats and
  retained `select_editorial_media` / `select_editorial_title_card` commands.
  Assembly verifies their exact files, hashes, approved durations and contiguous
  order, then prepends those placements and offsets the complete source clock.
  They retain editorial IDs and `shotId: null`; no Scripture shot or verse is
  invented. The Picture Editor supplies chapter coverage and any separately
  justified pauses after source intervals. A fixed opening already defines
  the entire pre-source interval; another leading pause is rejected, and the
  first source sample must start immediately after that opening. Saved render
  maps, producer playback, structural QC and portable
  rebuilds use those same explicit placements. Missing, held or changed opening
  media holds a new assembly; it never becomes a substitute still or an omitted
  section. Planning authority and reviewed source attribution remain unchanged.
- Nonnarrative closing titles/scroll credits use existing `post_source` beats
  with `beat_type: title_card` and the same retained media-selection commands.
  Their stored order and durations are verified, then rebased after the actual
  complete source cut and its justified pauses. The Picture Editor supplies
  chapter coverage only; credits cannot cover a source interval, replace the
  recording tail, or be counted again as a pause. They retain editorial IDs,
  exact hashes and paths in the same executable timeline, producer preview,
  structural QC and portable restore/rebuild. Narrative departure/journey beats
  are not credits and are not implicitly appended. No new stage or planning
  approval is introduced; chapters without selected closing titles are unchanged.
- **The narrator must never go silent.** HeartWord presents Scripture in its
  entirety, so every second of the real approved recording — narration and
  dialogue alike — must be audible somewhere in the final chapter; a shot
  with no on-camera speaker is not a shot with no audio requirement. This is
  a hard requirement for every chapter, not just Mark 2 (where it was first
  caught missing — see `docs/production/PARALYTIC_EXIT_SEQUENCE_HANDOFF.md`
  for a worked example of the fix). Concretely, for every future chapter's
  assembly:
  - Editing and finishing briefs also preserve the decoded recording after
    its last aligned interval as an explicit unassigned original-audio tail.
    Alignment is attribution, not proof of the physical recording's end. This
    creates no new verse or speaker assignment and changes no reviewed row or
    approved planning run. An alignment beyond the decoded file is held for
    reconciliation. Actual picture coverage must include that tail at source
    speed; neither a shorter cut nor silence may replace it.
    Saved render maps include the original file path and hash for unassigned
    gaps/tails, so the producer's independent source/performance tracks retain
    them too. That projection requires the exact current project recording,
    matching hash and deterministic gap/tail identity; it never assigns cast
    speech to an unassigned interval or invents reviewed database rows.
  - The real, continuous source recording (`original_reading` layer) is the
    master clock. Dialogue spans play the `composite_cast_master` redub in
    place of the original line (durations match to within tens of ms, so
    this doesn't drift); every narration-only span plays the original
    narrator's real voice — never silence, and never a provider's own
    generated audio track.
  - A shot (or group of shots) covering a narration-only span must have its
    video duration(s) sum to that span's real duration — not whatever
    length a single ~4-8s AI generation happened to produce. Close any
    shortfall by extending individual clips toward the provider's duration
    ceiling first, then by adding more short cutaways on the same beat
    (more coverage, not longer holds); use a brief freeze-frame only for a
    last few leftover seconds.
  - Narration audio for a multi-shot span is muxed once, continuously,
    under the whole concatenated group — never sliced and re-attached
    per-shot, which risks cutting the narrator off mid-word.
  - An alignment edge is not automatically an audio edit. When adjacent
    source intervals use the same recording, speaker, and contiguous source
    times, extract them as one soundtrack span even if picture changes within
    it. A speaker-turn or chapter-end tail check may hold a renewed onset
    that would be audibly severed; it must not flag a same-speaker visual cut.
  - A silent supplementary insert (b-roll with no dialogue of its own) still
    must not create a silent gap by default: mute its own generated audio
    and lay the real narration/dialogue that already belongs at that point
    in the story underneath it, continuing seamlessly into whatever
    follows. The one deliberate exception is a span the producer has
    marked for a music bed instead of narration (e.g. a wordless
    celebratory beat) -- confirmed with Dan, not assumed by default; see
    `docs/production/PARALYTIC_EXIT_SEQUENCE_HANDOFF.md`'s 3-clip exit
    sequence for a real example: it stays silent now (no narration
    forced in) because that stretch is planned for music later, not
    because muting it was the easy option.

## Project Identity: Language x Book x Chapter

Continuous-speech update (2026-10-14): confirmed run records retain attribution
and covered verse metadata separately from the original interval timeline.
Several composite records may address contiguous offsets in one cast file;
editorial assembly joins those offsets as one soundtrack span even when picture
changes. Cast selection prefers the exact source map, including an unlabelled
internal interval, rather than verse equality. Exact shot performance windows
may cross internal rows; editorial lip-sync checks use their true source offsets
and refuse an inserted pause inside the performance. A pause at an internal
run/verse edge requires separately reviewed safe-boundary evidence. All original
intervals remain complete, ordered and at source speed in the saved render map.
These extend the existing edit/assembly records and portable chapter history;
they create no second timeline or FDL runtime.

Every timeline belongs to exactly one (language, book, chapter) combination
— e.g. Hatam Mark 2, or English Acts 5. The producer navigates directly to
any such combination (see the selector in `docs/USER_WORKFLOW.md`) and lands
on that project's current state, whatever stage it has reached. A chapter
existing in one language does not imply it exists in another; each
combination has its own independent timeline and edit history, even though
several combinations may share the same underlying Scripture passage, audio
alignment, and character canon.

Opening a chapter restores only that project's persisted scenes, shots, takes,
clip/timeline records, review notes, crew history, and applicable lessons.
Creating the same identity again opens the existing workspace idempotently;
creating a new identity starts an honest empty workspace and never copies a
different chapter's media, timing, or source assignment. Reusable-library
items remain cross-chapter discovery candidates with their donor provenance,
not timeline content, until reviewed for the target shot.

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

## Frame-addressable review contract

When a producer reviews a rendered chapter frame by frame, the displayed frame
number, timecode, and any edit command must refer to the same decoded image.
HeartWord uses zero-based frame indices: frame 0 is the first rendered frame.
The reviewer derives its number from the browser's decoded-frame callback, not
from a rounded playback or seek clock, because a playback position can fall at
the boundary after the image still on screen. The displayed timecode is the
start time of that same decoded frame at the render's declared frame rate.

If a browser cannot report the decoded image timestamp, it may play the cut but
must disable frame-number notes rather than present an approximate number. A
picture-only repair records its inclusive zero-based frame range and converts
it to seconds as `start / fps` through `(end + 1) / fps`, so a producer's
reviewer note, the repair command, and post-render inspection address the same
pixels.

## Open questions

Editable portability is now implemented through the existing assembly
package tools and production controls: see [chapter preservation](chapter-preservation.md).
The package keeps the actual timeline/audio/edit records and retained media;
it does not derive an editable project from the MP4. An imported/custom recipe
without the common ordered timeline and exact source map blocks automatic
picture rebuilding. The [FDL design](film-description-language.md) is a new
description schema proposal, not a replacement for saved edit history.

- Target output format/container and whether an editable project file
  (e.g. an edit-decision-list style artifact) is produced alongside the video.
- How manual edits to one scene are reconciled back into the full timeline.
- How far back full history needs to remain cheaply accessible (undo/redo in
  the current session) versus archived (browsable but not instant) for a
  chapter with a long editing history.
