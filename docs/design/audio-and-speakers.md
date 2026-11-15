# Audio & Speakers

Local speaking recovery may explicitly supply `sectionPerformancePrompts` for
unsubmitted source sections. Each direction retains the same locked-canon and
length checks. The measured source plan, audio, reference, crop and production
revision remain unchanged. A retained section cannot receive a different
direction; its saved prompt hash and available actual native request must agree.
The line manifest records resolved section prompts and each section's prompt hash;
complete-line provenance distinguishes them from the unchanged default prompt.
This permits a failed section's speaking instruction to be corrected while keeping
reviewed native footage. It adds no automatic retake, new speech, acceptance,
paid fallback or HTTP control. Per-section gates and complete-line AV still apply.

Local speaking recovery can explicitly bind an exact held `line.json` SHA to
the same request ID, source, canon, prompt and production revision. It verifies
every retained raw/audio/carry hash and reuses native sections without another
generation. A corrected crop after the first section rebuilds separate picture
and native-coordinate carry derivatives; the original manifest and derivatives
remain retained. After multiple generated sections, a new crop must lie wholly
inside the previous crop. Each cached section preserves its actual native input
path, hash and crop at generation, separately from the newly selected carry.
Decoded RGB pixels inside the new crop must match the original native input;
reframing never claims that an earlier call used a new derivative. New sections
use the newly cleaned actual retained endpoint. Unsubmitted source audio is
regenerated locally for byte verification before further inference. Recovery
never approves the line or bypasses per-section submission/review/cost gates.

Editing can retain a complete review-performance PCM master through the existing
`retain_review_performance_master` typed command. Its exact file/evidence hashes,
physical source duration and a signature of effective source intervals, speaker
treatment and active cast-master bytes/mappings must match. Planning omits this
output choice, preserving its visual revision. The renderer still validates
original/cast availability and attribution, then reads the retained master at
the original global source offsets. Its saved map retains both original input
lineage and actual performance references. It does not change ingestion, voice
or LTX inputs or authorize arbitrary model-supplied audio paths.

Contiguous master reads cross merely visual/speaker-label boundaries once,
avoiding new resampling seams. Actual approved pauses/source discontinuities
still split the read and receive the existing chopped-onset/end checks; ordinary
raw/cast rendering retains its speaker-turn checks. Whole source coverage, safe
pause, rendered audio and final audiovisual gates remain. Retaining a performance
for review does not certify native-language accuracy or release approval.

A retained `retain_preprocessed_music` edit can bind an already producer-approved
music stem to its exact asset SHA and retained approval-evidence SHA. Editing and
finishing expose only that compact approval; changed/missing evidence holds.
Such a cue explicitly uses `preserveApprovedMix: true`: finishing retains its
existing level/ducking rather than ducking it again. Relative gain may remain0dB
or be lowered in a later reviewed edit. Other overlapping music, a duplicate
stem, unapproved preservation flags and level increases hold. Ordinary music/SFX
retain their existing gain and ducking checks. Speech stays on its separate
unchanged base track, with the existing latency-compensated peak limiter.
This extends finishing's cue recipe, not its source clock or approval authority.

Bound single-shot speech assembly trims decoded cast-master samples at the
measured sample rate, including fractional-millisecond source boundaries.
It retains enough real picture frames to enclose the entire utterance, refuses
frame cloning for a short source, and muxes without a shortest-stream cutoff.
The MP4 movie clock uses the audio sample rate so its edit list preserves the
exact sample duration. Ordinary and legacy unbound assembly retain their
existing behavior. Evidence records sample endpoints and retained frame count;
no new speech, source timing, picture acceptance or chapter coverage is implied.

An explicitly authorized local native section retake may supply an integer
seed to the existing A2V adapter. The default stays 42; the actual submitted
seed remains recorded in the native request. This permits a bounded failed-tail
correction with exact earlier sections/source/carry retained. It adds no
automatic retry, audio change, paid fallback, model/settings change or quality
acceptance. The new complete performance still requires audiovisual review.

The normal voice/lip-sync stage can forward `performancePrompts[shotId]` to
the existing local speaking provider. Each exact speaking shot receives only
its own scene-specific prompt; omission retains the provider default. Locked
canon validation and final-prompt provenance remain in the provider, and all
source, single-face, authorization and candidate-review checks still apply.
This is an internal operational option, not a new HTTP control or approval.

November 4 Mark6 bounded test: the chained local speaking provider accepts an
explicit scene-specific performancePrompt. It is sent verbatim apart from
appending any locked visual facts, and keeps the existing length/prohibited
phrase checks; empty overrides hold before inference. Default callers retain
their current prompt. The exact prompt is recorded in line/native provenance.
An explicit speaking prompt passed the short Herod48kHz control; this is evidence
for that sample, not approval of other sections or full lines. Existing injected
section generation can reuse an exactly verified reviewed native prefix without
counting another inference; source, identity, input/crop and lineage proofs and
complete-line AV review remain mandatory.

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

The internal voice/lip-sync options can pass the existing local section-generator
dependency through to `LtxChainedSpeaking`. This lets the Mark 6 operational
runner reserve its native-call allowance at the actual A2V submission boundary,
without counting the surrounding repeated source/plan checks as generations.
All stage authorization, source/canon bindings, crops, uninterrupted line audio,
attempt retention and audiovisual acceptance remain unchanged. No function-valued
dependency is exposed through the HTTP route and no cloud fallback is enabled.

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

The local A2V section adapter preserves the negative prompt from the successful
standalone speaking request, rather than inheriting Desktop's generic video
default. Request evidence records it. This restores request parity only; actual
returned lip/jaw timing, identity and complete-line joins still require review.

October 22 assembly preservation: single-shot assembly uses an existing exact
utterance binding and its source/voice-matched cast-map entry, including an
evidenced speech-run window when present. It never chooses a different line by
verse number if that binding is stale or missing its cast master. Legacy
unbound lookup remains scoped to the shot's own chapter project. Only an
accepted raw clip may enter assembly; a newer held take cannot replace it.
This is local preparation for the existing chapter editor, with no new voice
request or change to the protected source duration.

**Preferred production technique, Dan's decision 2026-10-30: local LTX 2.5
Fast A2V, short speaking clips with last-frame carry-over.** Aim for three
seconds and allow up to four seconds of unchanged source-bound speech per
section, split at natural pauses. Each continuation uses the preceding clip's
last retained frame as its initial-image reference, preserving native framing
and separately pinned approved canon. Stitch pictures over one uninterrupted
original full-line audio track, with no audio shift, added lead, speed change
or omitted/repeated samples. Remove generated text and review the complete line
for sync, silence behavior, identity, expression and join quality. Five-second
speaking windows failed the reviewed tests; the native five-second generation
minimum is filled only with tail silence for short sections. Starting-image
conditioning is not hard frame locking and does not guarantee later motion.
When balanced sections leave a join during speech, the existing short-speaking
planner checks for a complete route through measured quiet on the same frame
clock. It may use another container to keep every internal join in quiet;
source samples remain consecutive and the full-line soundtrack stays intact.
If no such route exists within four seconds per section, the explicit join-review
finding remains. Silence detection is candidate evidence, not native attestation;
the actual approved cast performance and complete assembled line still need review.
See the [preferred procedure, evidence and implementation status](../production/LTX_LIPSYNC_EXPERIMENT.md).

This supersedes the October 6 Kling-first preference. The Mark 6 preparation
worktree now connects the existing stage to local `LtxChainedSpeaking` by default;
`provider: "kling"` or `HEARTWORD_LIPSYNC_PROVIDER=kling` selects Avatar explicitly.
Scene-motion selection remains separate. LTX requires its session credential,
current source/canon/voice bindings and a separate evidenced native-coordinate
picture crop per long speaking shot (`pictureCrops[shotId]`); there is no universal
portrait crop or cloud fallback. Short-source clips are padded only at the tail
to the backend's five-second container. The assembled candidate uses a single
full-line audio encode and remains held for complete-line AV and producer review.

Local synthetic-media tests verify exact sample partition, retained-frame carry,
continuous assembled audio and the existing candidate workflow. They do not
establish actual Mark 6 lip sync, silence behavior, caption cleanup, identity or
runtime. This implementation has not been deployed to the original checkout.
Kling remains available under existing production/source/cost/review gates.
No synthesized replacement speech or canon change is authorized by this route.

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
That Avatar-specific comparison remains incomplete. The later local LTX tests
and October 30 producer preference are recorded above; actual Mark 6 production validation remains pending.

Dan's standing preference when using Kling Avatar (October 14): for most neutral and positive lip-sync
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
native sample endpoints may use fractional milliseconds. Bindings retain
finite source-contained values rather than rounding a complete endpoint or
extending it beyond the accepted source window.
Separate retained cast files can be joined locally for that exact provider
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

### Mark 6 alignment preparation finding (October 31)

Direct model listening found the 73 unmatched target words in the recording.
This is supplementary auditory evidence, not exact word timing or native
verification, and does not inflate the earlier 95.46% local placement metric.
The five short intervals called non-Scripture also contain speech. Future
unidentified model results remain unresolved, never proof of non-Scripture or
silence; the original source is retained. Some model timestamps exceeded their
clip lengths and are rejected. Short repeated words and clip-edge targets still
have explicit timing uncertainty. Original source text/audio and live DB are
unchanged.

Three isolated LTX test packets are prepared with original, exact-sample source
clips, tail-padded section WAVs, approved Jesus v5 identity references, scene-frame
requests and frame/sample plans. They cover a 3.1 s v37 line, an 8.5 s v4 chained
line and a 3.891 s v50 line retaining 200 ms of existing quiet before/after the
quote. Original narrator audio tests feasibility; it does not approve a character
voice or replace the eventual cast performance. Model quote edges remain proposed.
Scene-framed starting images and a measured chain crop still require preparation
and acceptance before generation. Five local inference containers are forecast at
about 68 minutes from the historical median, before retakes/review. Read-only
Mac preflight confirms local Fast is available and cloud generation is disabled.
No Mark 6 video or voice request has been submitted.
