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

**Confirmed provider: Kling Avatar.** Dan reaffirmed on 2026-10-06 that
Kling Avatar continues to generate lip-synced speaking video, driven by the
exact source-timed cast audio through the existing `LipSyncProvider` path.
Local LTX 2.5 Fast is the primary scene-motion generator; selecting it does
not replace Kling Avatar or authorize LTX-generated speech/lip-sync.

## Ambience and scene-video audio

Dan reaffirmed on 2026-10-06 that ambience remains part of the soundtrack.
Non-speaking video may have appropriate environmental sound, but must not
invent intelligible speech, narration, singing or a visible speech performance.
The reviewed Mark 4 mix includes separate ambience beds and music; those
remain independent of the scene-video backend.

LTX requests environmental audio (`audio: true`) by default, with explicit
prompt and negative-prompt rules against speech, narration, gibberish voices,
singing, music and visible talking. The original MP4 is retained and its native
audio is extracted into a separate WAV stem. An independent listening review
must explicitly find **no speech in any language**, including unintelligible
background speech, and pass scene fit and technical checks at confidence
80–100. Uncertainty, unavailable review or detected voices holds the whole
stem; this does not claim to separate voices from a mixed recording.

Approved stems enter the existing `production_audio_assets` SFX collection,
so the Sound Designer/Director can place editable cues through the existing
finishing mixer, including its gain limits and ducking beneath source/cast
speech. Raw provider-video audio remains muted in production assembly. Held
stems never enter that collection; their audio and listening evidence remain
available for review. Review cost is metered separately from free local video
generation. Explicit `audioMode: "none"` (CLI `--audio none`) still removes the
whole native track when Desktop returns audio despite the silent request.

Audio2Face-3D and cloud GPU evaluation were earlier candidate approaches,
not the current lip-sync production path.

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
