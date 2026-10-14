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

October 14 verified direction support: the existing Avatar adapter accepts
saved descriptive acting intent compiled into documented `prompt` and optional
`std`/`pro` mode. It sends no invented numeric controls, model selector or
replacement speech. Related shots read the same versioned edit-history packet;
changed source/voice bindings hold. Full supplied audio files are reused byte
for byte; other exact windows are cut before minimum-duration silence padding,
without including the following speech. Submitted audio and request/task/usage
evidence survive for review. Outputs remain candidates. Cost reconciliation,
outstanding reservations and the cumulative $200 film ceiling guard stage5's
Avatar requests; failed/lost requests cannot silently retry. See
[baseline, capabilities, policy and pending comparison](../production/KLING_AVATAR_DIRECTION.md).
The matching GUI task and uploaded image/audio/prompt are recovered, but its
original mode/model/submitted JSON remain unknown. Dan clarified that the
reference was a standalone proof of concept, never used in a film; no film
binding/approval is inferred. Two bounded comparison requests were rejected for
insufficient API balance, with no tasks returned or automatic retries.
No controlled new Hatam-performance comparison or migration has been completed.

Dan's standing preference (October 14): for most neutral and positive lip-sync
performances, prefer “Smiling warmly at the camera, the character exudes a calm
and confident demeanor, standing still with a gentle expression.” This is a
producer-approved creative baseline, not a verified service default or proof
that the pending API comparison succeeded. Rebuke (“You brood of vipers!”),
anger, grief, fear and other negative treatments need source-appropriate
direction instead. The crew must judge the passage in context, not from isolated
keywords. In the existing saved acting intent, `emotionalRegister: neutral` or
`positive` makes the preference eligible; omitted/unclassified treatment does
not. Explicit prompt overrides, including empty text, take precedence. The
named `dan-neutral-positive-v1` profile holds if used without an eligible
treatment or appropriate override. Requested/compiled selection evidence is
retained; approved takes, exact source speech, model/mode and review/cost gates
remain unchanged. No automatic regeneration follows the preference.

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
the affected verse numbers and requires evidenced speaker coverage; quotation
marks are only a detection signal and never evidence of a speaker's identity.
A confirmed multi-verse range covers every verse in that range. A lone
attributed fragment cannot clear a longer speech. Once the first named source
interval inside a quoted run begins, later intervals must carry a speaker or
an explicit reviewed narration decision, including otherwise unlabelled slices.
A narrated lead-in is permitted before that first named interval.
Chapters without quoted direct
speech are not blocked by this specific gate.

## Confirmed continuous speech (implemented 2026-10-14)

Attribution, verse metadata, semantic phrase alignment and actual audio edits
are separate facts. `confirmContinuousSpeech` extends ingestion's existing
speaker-attribution records and typed edit history. One confirmation names the
speaker (or original narrator), existing contiguous source intervals, precise
outer audio bounds, covered chapter verse range, reviewer and continuity/boundary
evidence. `internalVerseTiming` is explicitly `approximate` or `unresolved`.
It neither deletes/merges intervals nor rewrites verse labels, reviewed text,
confidence, boundary overrides, shot bindings, accepted assets or prior evidence.
The `confirm_continuous_speech` command retains the complete member snapshot and
source hashes. A retry reuses its idempotency key. Exact-equivalent re-ingestion
can remap member IDs; changed bounds, Scripture, audio or speaker holds for
reconciliation. Covered verses must exist in both supplied source and reference
Scripture. An explicitly evidenced `supersedesRunId` confirmation retains the
complete old snapshot; it does not retime accepted audio or transfer an old
performance-window approval. Narrator confirmations are validated inside ingestion's write
transaction so a failed remap rolls back. The legacy Mark 2 quote-aware writer
holds when it would replace confirmed runs.

The producer's **Continuous speech — confirm the whole run** control and
`GET/POST /api/projects/:id/continuous-speech` use those same records that scene
planning, voicing and crew briefs consume. A specialist can use the same
evidenced operation; this does not introduce a per-chapter plan approval gate.
The coverage projection also reuses existing reviewed range attributions and
corrections, excluding evidence explicitly superseded by a split/merge.
Real narrator interruptions, speaker changes (including two speakers in one
verse), chapter boundaries, gaps and reviewed editorial content cannot be
silently absorbed into an overlapping run. Use existing exact split/boundary
review for genuinely mixed intervals. A recorded narration run is positive
evidence, distinct from an unassigned interval that remains reviewable.

For a **new** complete cast run, stage 5 extracts/revoices the whole outer
interval once. Its existing per-original composite records point to precise
offsets in the shared file, so ordinary verse rows do not introduce audio seams.
Mapped accepted files are reused; a partial retained map holds before spending.
An explicit forced revision still produces a complete run and retains old takes
and maps in typed history. Provider timing must match source duration; no speech
rate change is applied. Unknown provider usage/cost remains unreported, not free.

An exact lip-sync/performance window has its own `bind_speech_run_utterance`
history record, existing shot binding, approved voice version and independent
`timingEvidence`. It may cross internal alignment rows of the same run without
requiring internal verse alignment. Shared cast offsets are reused directly;
separate retained cast files can be joined locally for that exact provider
window without revoicing or changing the soundtrack. Cached joins retain and
verify input/output hashes and duration. Neither range attribution
nor a broad duration envelope proves a semantic phrase/emotional beat. Internal
editorial pauses still need independently reviewed safe-boundary evidence,
recorded as `confirm_speech_pause_boundary` through
`POST /api/projects/:id/continuous-speech/:runId/pause-boundaries`. An ordinary
boundary override is not evidence that its ending is safe for an inserted pause.
Composite review playback is bounded to each saved file offset and ordered by
its original source map, so a shared file is not replayed in full for each row.
Existing source/canon/cost, field-review and release gates remain intact.

Validation and retained synthetic workflow evidence are recorded in
`docs/plans/CURRENT_GOAL.md`. The fixture verifies source order/speed and actual
rendering; it does not certify Hatam word alignment or acting quality.

The subsequent [real Mark 4 read-only audit](../production/mark4-continuous-speech-audit.md)
qualifies live acceptance. Existing speaker confirmations already settle 22
internal verse boundaries, but no typed speech runs exist on that production.
Its confirmed different-verse rows have 748–920 ms source-clock gaps and cannot
currently enter the strict contiguous-run contract. Retain the intervening
source material without moving reviewed bounds or treating the representation
problem as 21 new producer questions. Explicit legacy narration evidence for
verse 13 and 39 is not yet projected as `reviewedNarration`; accepted exact-window
generation provenance also needs reconciliation into existing shot bindings.
An older source attestation matches source bytes but not the combined current
alignment/speaker hash. The current speaker gate still holds; the audit made no
runtime/state migration. The verse 25 tail/end of turn, verse 35 quoted handoff
and verse 41 group-speech representation remain targeted reconciliation/review.
These are compatibility limits of the current implementation, not new approval
policy or permission to regenerate accepted assets.

## Open questions

- Final call on cloud GPU rental vs. a dedicated workstation for lip-sync.
- How closely per-character dialogue audio needs to be split out of the single
  narrator recording vs. regenerated per character.
