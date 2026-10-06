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

An exact match between recorded words and translated text does not prove that
an audio interval ends between utterances. Inspect the original audio around
adjacent alignment edges, but activity on both sides is **not by itself a
hold**: a speaker can continue over a visual cut. Retain the local levels and
technical-length evidence as an advisory. For an unreviewed alignment, a
substantial quiet gap shortly before an activity-crossing edge permits a
timing-only correction to the gap midpoint, provided both adjacent intervals
remain contiguous and complete. Record the original edge and chosen point.
Cap the affected timing confidence at 89: the acoustic choice may proceed
conservatively, but it is not 100-point linguistic assurance.
Repeat the same decision on a re-ingest; existing exact-match remapping must
preserve a retained source correction/attribution or fail safely. Never silently
rewrite a producer-reviewed binding. An explicitly confirmed producer revision
may supersede the active binding only when the previous intervals, binding,
cast-master mapping, and approval are retained in typed edit history; both
adjacent source intervals remain contiguous; the corrected alignment receives
a new named attestation; and downstream cast audio and coverage timing are
reconciled. A later voicing run must reuse that reviewed cast audio or hold,
not resurrect the pre-revision tail.

Neither acoustic activity nor a quiet gap identifies words or speakers. Do
not promote text-match confidence into linguistic assurance, and do not move
an ambiguous edge without evidence. The audio-output check at assembly is
separate: it protects the audible end of a speaking turn, not every picture
cut. A genuinely unresolved content/speaker decision remains eligible for
qualified language review; routine acoustic crossing does not summon Dan.

## Speaker-attribution gate

Immediately after source alignment, before scene breakdown or storyboard casting,
HeartWord checks the verified reference text for quoted direct speech. It tracks
quotation state across verse boundaries, so a quote that opens in one verse and
closes later exposes every interior verse to review. If a direct-speech run has
an affected verse with no named source-speaker attribution, casting is held
before it can create shots, keyframes, voice media, or video. The hold names
the affected verse numbers and requires exact source-interval speaker review
and bindings; quotation marks are only a
detection signal and never evidence of a speaker's identity. A lone attributed
fragment cannot clear a longer speech run. Once the first named source interval
inside a quoted run begins, every later alignment interval through that run must
also carry a named speaker binding, including an otherwise unlabelled alignment
slice. A narrated lead-in is permitted only before that first named interval.
Chapters without quoted direct
speech are not blocked by this specific gate.

## Open questions

- Final call on cloud GPU rental vs. a dedicated workstation for lip-sync.
- How closely per-character dialogue audio needs to be split out of the single
  narrator recording vs. regenerated per character.
