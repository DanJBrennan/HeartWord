# User Workflow

This describes the end-to-end flow from the user's point of view (Dan, or
whoever runs the pipeline for a given language/chapter).

## Navigation

The producer selects a language, a book of the Bible, and a chapter (e.g.
Hatam, Mark, chapter 2), and lands on that specific video's current state —
whatever stage it has reached, from not-yet-started through a fully reviewed
cut. Available languages today are Hatam, Meyah, Sougb, and English; available
books today are Mark and Acts. This selector is the normal entry point into
the product, not a separate admin/debug view — see "Project Identity:
Language x Book x Chapter" in `docs/design/timeline.md` for how each
combination is modeled as its own project.

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
   source-language audio.
6. Assemble scenes into a single chapter video with continuous audio.

## Review and edit

The user watches the assembled chapter video. Because it's built from
independently generated scenes and stages (see `docs/ARCHITECTURE.md`), the
user can go back and adjust an individual scene's casting, action, or visuals
and re-run just that stage rather than the whole chapter — this is a starting
cut, not a final export.

## What the user does NOT have to do manually

Scene breakdown, character casting, blocking/action decisions, and lip-sync are
all automated. The user's manual work is reviewing and refining the result, not
producing it from scratch.
