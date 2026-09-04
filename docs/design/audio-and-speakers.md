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

## Open questions

- Final call on cloud GPU rental vs. a dedicated workstation for lip-sync.
- How closely per-character dialogue audio needs to be split out of the single
  narrator recording vs. regenerated per character.
