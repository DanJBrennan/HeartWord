# Audio & Speakers

The source-listening reviewer accepts integer millisecond boundaries on PCM
audio with an integral number of samples per millisecond. It presents a
waveform, ±1 ms, ±10 ms and ±100 ms nudges, edge zoom, and exact selected-window
playback. Each saved edit retains its named reviewer, timing, speaker label,
original-source hashes, and extracted clip. A speaker suggested from the
parallel English verse remains provisional until the exact target-language
speech is heard; a mixed narration/quotation verse is not assigned wholesale
to a character. If the target text opens a quotation after a narrator lead-in,
the whole-verse source window retains both, while the displayed speaker label
and quote-start cue expose the handoff for review. Gemini source-text matches are phrase anchors and have a
separate confidence score from verse boundary confidence. Displaying or
editing these suggestions does not change cast attribution in `audio_segments`.

Finishing executes its stored picture and sound filter components as separate
FFmpeg graphs. A concatenated title/scene can change decoded color metadata;
reinitializing a shared graph can discard buffered audio and shift the source
clock. Graph isolation preserves the genuine cue recipe and picture treatment
without allowing a picture-format transition to reset continuous speech.

Finishing cues support optional `fadeInMs` / `fadeOutMs` within their own
trimmed duration. The existing mixer applies those numeric envelopes only to
the separate approved music/effects before placement and speech ducking. Fades
cannot exceed the cue duration in total, extend an asset, or alter source/cast
words or timing. Omitted values retain the previous no-fade behavior. Original
assets and cue decisions remain retained for review and editable reconstruction.

The finishing limiter compensates its lookahead latency. An uncompensated
limiter delays the actual speech clock even below its peak threshold; phase
checks on rendered original/cast tones and measured chapter windows protect
the source positions as well as the saved timing map. This changes no approved
performance, cue placement or source speed.

October 21 Mark 5 execution: a reviewed source boundary with no prior cast-map
entry permits its first voicing. Existing mapped masters still require matching
source, approved voice, bounds and measured duration before reuse; stale or
missing retained audio holds. Standalone voicing accepts the approved audition
settings, including speed 1, and retains returned provider usage/request evidence
beside each new take. Approved audition bytes can populate the existing cast-map
projection without another provider call. These changes add no audio layer or
pipeline stage and do not change source-language speech.

The existing voice/lip-sync stage also accepts an optional speaking-shot scope,
so an accepted performance picture can run while other chapter pictures are
prepared. Empty/foreign scopes hold before spending. The ordinary unscoped
chapter run retains its full-batch checks, source bindings, budget reservations,
single-face rule and candidate acceptance requirements.

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

October 22 assembly preservation: single-shot assembly uses an existing exact
utterance binding and its source/voice-matched cast-map entry, including an
evidenced speech-run window when present. It never chooses a different line by
verse number if that binding is stale or missing its cast master. Legacy
unbound lookup remains scoped to the shot's own chapter project. Only an
accepted raw clip may enter assembly; a newer held take cannot replace it.
This is local preparation for the existing chapter editor, with no new voice
request or change to the protected source duration.

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

Advance treatment now records planned ambience/music purposes, timing basis,
entrances/releases, coverage and cost implications before keyframes; see
[shot planning](shot-planning.md#advance-emotional-treatment-implemented-2026-10-14).
This is planning intent, consumed by existing sound/finishing controls against
the actual spaced cut. Continuous or sectional music must fit the scene/action
and never overwhelm narration or dialogue. Fuller cues may occupy suitable
speech-free space. New soundtrack listening reviews, like native-video ambience
reviews, explicitly reject any speech including unintelligible voices; absence
of intelligible words alone does not pass. No source wording, rate or cast
binding is changed.

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

New Director-requested music/effects use the same cumulative film budget and
existing `reserve_crew_spend` / settlement records. An evidenced
`HEARTWORD_SOUNDTRACK_CALL_UPPER_BOUND_USD` (or an explicit stage option) covers
one generation and its separate listening review. Claim, reservation and pending
cost evidence are atomic before the first provider call; the stage checks the
budget again before listening and before the next cue. Reported generation and
metered listening subtotals enter the ledger even for held or incomplete audio.
Missing dollar attribution stays NULL with the combined bound outstanding;
provider credits alone are not converted to dollars. Only this request's known
cost-row transition can update the budget fingerprint: unrelated new unknown
charges hold further calls. Returned files, request/usage evidence and completed
findings remain retained. Accepted prior requests are reused, and all other saved
attempts hold without automatic provider or listening retries. This extends the
existing soundtrack stage, not its creative or producer-approval workflow.

Audio2Face-3D and cloud GPU evaluation were earlier candidate approaches,
not the current lip-sync production path.

## Source-boundary integrity

October 20 source preparation exposed a Word-paragraph continuation in Hatam
Mark 5:9 before the next paragraph's v10 marker (and English 5:24 before v25).
The source parser retains this supplied prefix on the immediately preceding
verse only for adjacent paragraphs and consecutive verse markers, recording the
continuation paragraph. It changes no source bytes or saved older film record.
An exact complete supplied two-word chapter title can anchor directly; arbitrary
short Scripture guesses retain the normal minimum. Standalone punctuation stays
in the source reference but is excluded from spoken-word coverage accounting.
These are extraction/matching corrections, not speaker attribution, linguistic
assurance or approval. See the [Mark 5 preparation](../production/MARK5_PREPARATION.md).

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

## Source listening-window review (October 21)

The existing ingestion review can prepare source-only PCM excerpts and a listening
page, with chapter-clock start/end controls in 10 ms increments. Web Audio schedules
the selected interval from the decoded source; a timer or MP3 frame seek is not the
cut authority. The producer can hear context and both edges, save a draft, and
verify each quoted/narrated/diagnostic window separately under their own name.
Drafts and verifications append exact bounds, source/alignment/manifest hashes,
text/speaker identity, reviewer and a retained PCM clip to existing `review_notes`.
Editing a verified window creates a new unverified revision until explicitly
verified again. Stale source evidence and concurrent edits hold rather than
overwriting another review. Preparing/opening the page records no human approval.

These are source-window listening decisions, usable for subsequent audition
preparation. They do not themselves split original intervals, attribute an entire
mixed interval, attest the whole chapter, approve a cast performance or dispatch
production. Reviewed bounds are applied through the existing source split,
attribution and continuous-speech operations when reconciling source bindings;
retained exact-window decisions must be carried forward, not replaced by the
initial broad alignment envelopes. This adds no table, pipeline stage or queue.

Applying an authorized complete listening set uses the existing source split,
merge, correction and continuous-speech operations in one transaction. Preserve
every prior source interval in a project review record and SQLite backup, retain
all original covered audio, and attribute only the exact verified character
windows. Explicit producer decisions may cover a duplicate fragment or retain it
as narration. Original narration, including all of 5:28, keeps its source voice.
The retained manifest and individual human verifications remain unchanged; an
application record pins the old and new alignment hashes and exact review IDs.
That recognized transition keeps the applied listening set readable and read-only.
Later source changes still hold. Applying windows does not invent a whole-chapter
language attestation or authorize film production.

Voice auditions use the existing ElevenLabs multilingual speech-to-speech client
on exact source WAVs. Candidate audio, request settings/IDs, usage when supplied,
source hashes, approved voice version and timing measurements are retained for
side-by-side listening. A bounded batch records dispatch before each paid request;
unknown submissions are never automatically repeated. Auditions do not enter the
accepted cast master, change a voice selection, approve a performance or release
the film hold. Preserve both before/restored Gerasene samples for producer review.

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
An explicit reviewed original-narrator run also supplies speaker coverage for a
narrated thought or explanatory quotation; it must not require an invented
character voice merely because the text contains quotation marks. Unreviewed
tails after a narrator confirmation still hold. Applying verified character
windows records the retained original narration/pause treatment outside those
windows separately, under the applying agent's name with the producer evidence;
this does not create another human listening or whole-chapter attestation.
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
