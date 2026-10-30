# User Workflow

This describes the end-to-end flow from the user's point of view (Dan, or
whoever runs the pipeline for a given language/chapter).

## Navigation

Open the normal app at `http://127.0.0.1:4000/` after `npm start`. It serves the
inventory, producer console and existing editing/production controls together
against the configured HeartWordData root. The port-4027 read-only preview is
historical demonstration tooling. Enabling the normal interface does not clear
holds, approve sources/canon, reconcile unknown charges or start production.

The producer selects a language, a book of the Bible, and a chapter (e.g.
Hatam, Mark, chapter 2), and lands on that specific video's current state —
whatever stage it has reached, from not-yet-started through a fully reviewed
cut. Available languages today are Hatam, Meyah, Sougb, and English; the existing
workspace creation contract accepts Mark, Acts and Genesis. This selector is the normal entry point into
the product, not a separate admin/debug view — see "Project Identity:
Language x Book x Chapter" in `docs/design/timeline.md` for how each
combination is modeled as its own project.

The chapter inventory is the entry surface. Choose language/book/chapter to
inspect automatic raw-audio-plus-text availability, saved alignment and casting
execution, identified characters and each visual character's approved canon
references. Book browsing includes Genesis and the New Testament already
recognized by the source catalog, plus retained project identities; a catalog
listing does not enable new book production. Chapters without workspaces remain
unstarted. Creating a workspace is explicit and uses the existing route; merely
browsing never binds source files, executes a stage or spends money.

Keyframes, video and lip-sync columns distinguish available files, generated /
reused origins and additional recorded attempts for the same target/operation.
Current production and all retained history are selectable; restart history and
cumulative film costs remain saved. File readiness is not source verification,
and an available or historically accepted file is not a completed chapter.
The selected chapter opens the same producer workspace and edit records.

The Cast & crew discussion tab replays actual saved role replies and historical
casting/coverage negotiation, with original timestamps, full outputs, findings
and affected-shot links. Play/pause, step, speed and scrub controls animate the
recorded sequence; long gaps are compressed and no speech is synthesized.
Filter by role, run or shot. Current structured objections are displayed apart
from historical verdicts. Empty history, missing tables and malformed saved
outputs stay explicit. Switching chapters resets replay; connection failure
pauses it and marks the snapshot stale until fresh evidence returns.

The producer console is the chapter's master viewing surface: menus open the
existing production/edit controls; resizable storyboard, program and inspector
panels share a zoomable review timeline. Stage evidence, next action, work/holds,
costs and decisions refresh in place. A second tab shows existing cartoon role
portraits with real saved discussion. Preview track enables are listening/viewing
preferences; saved chapter records, source performance and edit history retain
authority. Missing timing/footage and stale connections remain explicit.

## Inputs, per chapter

1. An existing audio recording of the chapter being read aloud in the heart
   language (the narrator's recording).
2. A translated/latinized text of that same chapter, aligned closely enough to
   the audio to drive scene and line breakdown.
3. A canon character library for the target community/culture (created once,
   reused across chapters) — see `docs/design/canonical-characters.md`.

## Pipeline run (autonomous)

1. Ingest audio + text, align them.
2. Break the chapter into scenes and lines.
3. For each scene: decide which canon characters appear, what the action/
   blocking is, and what each character says.
4. Generate the scene's visuals (background, characters, camera).
5. Lip-sync each character's on-screen speech to the corresponding slice of the
   source-language audio. Dan's October 30 preferred production technique is
   local LTX Fast: short speech sections up to four seconds, carrying each
   section's last retained frame into the next starting image. Preserve the
   continuous original audio timing, remove generated text and review each
   assembled line for sync and visible joins. See the
   [procedure and current automation gap](production/LTX_LIPSYNC_EXPERIMENT.md):
   the verified standalone workflow supports this; the normal automatic stage
   still uses Kling until this technique is integrated.
6. Assemble scenes into a single chapter video with continuous audio.

## Review and edit

The chapter crew panel also shows bounded creative feedback: separate hard
acceptance checks, Nell's evidenced craft dimensions, reviewer confidence,
findings routed to production owners, their revision responses, call/cost
limits and the selected pass. Reviews run before keyframes, against selected
coverage during editing and against the assembled audiovisual cut. At a
creative plateau or limit, passing hard checks allow the best acceptable
version to continue with its shortfall visible, following Dan's agreed policy.
Failed/unverified checks hold. Existing source, canon, spending, field and
release gates remain, without a separate producer chapter-plan signature.
Numeric scores have no calibrated acceptance cutoff or audience prediction.

The user watches the assembled chapter video. Because it's built from
independently generated scenes and stages (see `docs/ARCHITECTURE.md`), the
user can go back and adjust an individual scene's casting, action, or visuals
and re-run just that stage rather than the whole chapter — this is a starting
cut, not a final export.

## What the user does NOT have to do manually

Scene breakdown, character casting, blocking/action decisions, and lip-sync are
all automated. The user's manual work is reviewing and refining the result, not
producing it from scratch.
