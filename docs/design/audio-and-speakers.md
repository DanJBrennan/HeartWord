# Audio & Speakers

## Inputs

- A narrator's full recording of the chapter/book in the heart language (the
  source-of-truth audio for the whole video).
- A latinized, translated text of the same content, used to align text to the
  audio and drive scene/line breakdown.

## Voices

- **Narrator voice clone** — used where narration (not character dialogue)
  is needed, cloned from the narrator's own recording.
- **Per-character voice IDs** — individual characters in dialogue get their
  own voice (e.g. ElevenLabs per-character voice IDs), still speaking the heart
  language, still driven by the same source recording/text where possible.

## Lip-sync

The primary technical challenge in this whole pipeline. Candidate approach:
NVIDIA Audio2Face-3D, driving lip movement on the 3D character models from the
character's speech audio.

Known constraint: Audio2Face-3D needs GPU hardware the current dev machines
don't have (an HP laptop with Intel Iris Xe, and a 64GB Mac Mini are both
incompatible). Cloud GPU options (RunPod, Vast.ai, Lambda) are being evaluated
before committing to dedicated hardware (e.g. an RTX 5090 tower).

## Source-boundary integrity

An exact match between the recorded words and translated text does not prove
that an audio interval ends between utterances. During general chapter
ingestion, inspect the original audio immediately around each adjacent
alignment edge. Sustained activity on both sides is a QC hold on the two
affected intervals, even if text-match confidence is high. Record the local
audio levels, any nearby quiet gap, and whether a technical maximum-length
split may have forced the edge. A quiet-gap midpoint is a listening cue, not
an automatic replacement timestamp.

The detector cannot identify words or speakers from acoustic level alone.
The language specialist reviews both sides against source text and speaker
context, then uses the named source-alignment correction process. Preserve
existing producer-reviewed bindings on a re-ingest; do not silently move a
boundary or alter the chapter's approved media.

## Open questions

- Final call on cloud GPU rental vs. a dedicated workstation for lip-sync.
- How closely per-character dialogue audio needs to be split out of the single
  narrator recording vs. regenerated per character.
