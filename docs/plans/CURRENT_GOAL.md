# Current Goal

## R9 closing website-line removal (2026-10-31)

Dan subsequently approved all three R9 versions and requested OneDrive copies
for distribution to Ryan. The 720p, 540p and 360p MP4s were copied into
`C:/Users/danbr/OneDrive/Documents/HeartWord Distribution/Hatam Mark 5 - Ryan - 2026-10-31/`
and each copy's SHA-256 verified against its approved source. The exact approval,
hashes and copy receipt are retained in
`R9_PRODUCER_APPROVAL_AND_ONEDRIVE_COPY.json` beside the delivery report, and a
verification record accompanies the copies. This supersedes the earlier R9
producer-approval-pending state for these versions only. Native field approval
is not inferred; no message, public publication or shared link was created.
Local OneDrive copies are verified; cloud synchronization has not been verified.

Dan has deferred a new ministry name pending partnership discussions and explicitly
requested removal of only `heartword.ai` from this Hatam Mark 5 closing scroll.
The revised candidate keeps the seven other credit lines, their original pixel
positions, background, scroll speed and 14-second duration. This is a chapter-only
override of the older website credit, not an adopted rebrand or new domain claim.

`Markus5_Hatam_no_website_r9_720p.mp4` is under the same revision export directory
as R8. All 13,402 delivery frames before the replacement are exactly R8; all
audio packet data/timestamps and the full presentation clock are exactly R8.
The 13,737-frame, 572.38-second film fully decodes. The 360p viewing copy is
49,405,334 bytes. Dan also requested a 540p delivery: 960x540, 123,226,713
bytes, with the same 13,737 frames, duration, clock and bit-identical AAC packets
as the 720p revision; full decode passed. Source/canon rows, live database, approved master and all prior
candidate/archive evidence remain intact. The producer-retained R5 bridge issue
remains recorded and unresolved. No new provider calls or API fees.

Existing editorial-media selection, native render/finishing records and the
portable source recipe carry the edit in the isolated revision workspace. A
fresh SQLite snapshot reopens with 112 picture placements, 146 source intervals,
13 cue bindings, the revised closing and no programme issues. R9 scripts, graphics,
text, checks and database snapshot are retained under
`assets/preparation/sequence-score-revision-20261030/credits-r9/`.
The existing self-contained R8 archive is unchanged; R9 is retained in the working
revision and snapshot, with no new self-contained archive or clean-machine/full
cold-render claim. Repository check outcomes are recorded in `R9_REPORT.txt`.
Separate Goal Guardian review confirms the requested scope and editable chapter
workflow, without introducing another brand, new stage, or release approval.

## Recorded: preferred production lip-sync technique (2026-10-30)

After watching the Peter last-frame continuity test, Dan said "It looks good"
and explicitly requested recording this technique as preferred for production
runs. **Prefer local LTX Fast A2V with short speaking sections (aim three seconds,
maximum four), each continuation using the previous clip's last retained frame
as its starting-image reference.** Preserve one continuous original audio track
and source clock, remove generated text, and review the full line/joins through
existing production/QC before acceptance. Five-second speaking clips failed;
five-second native generation containers may contain only tail silence beyond
the selected short speech window. No delayed lead, retiming or added dialogue.

The authoritative procedure is now at
`docs/production/LTX_LIPSYNC_EXPERIMENT.md#preferred-production-technique--producer-decision-october-30-2026`,
linked from PRODUCT_VISION, ARCHITECTURE, USER_WORKFLOW and the audio/media design.
It supersedes the October 6 Kling-first preference. Derived last-frame refs
remain distinct from approved canon, retain source/video/frame/hash provenance,
and preserve native framing rather than accumulating crop zoom. Initial-image
conditioning is not a hard timed-keyframe lock; expression/motion may still drift.
Kling remains available under existing production/source/cost/review gates.

Implementation gap is explicit: the verified standalone runner and retained
assembly procedure support the technique, but `src/pipeline/voice-lipsync/index.ts`
still directly constructs `KlingLipSyncProvider`. Ordinary scene-motion LTX
selection does not implement A2V chaining. This unit records Dan's production
policy; it does not claim or perform automatic-stage migration or regenerate
accepted footage. Production planning/operator-run work should use the preferred
procedure; future automatic integration belongs in the existing stages.

The preference is also active global production-crew guidance, lesson
`968013ad-2358-4765-9372-5d6e8051ef89`, saved through the existing guidance API
with Dan's source note and activation history. Readback confirms global/active
status and no conflicting active provider/lip-sync lesson. No production run
was started. Audit: `outputs/ltx-production-preference-guidance-20261030.json`.
Documentation whitespace/procedure-link checks and all 856 tests in 126 files
passed (`outputs/ltx-production-preference-tests-20261030.txt`).

Goal Guardian: matches source-faithful voice/lip-sync and inspect/correct workflow;
records an explicit producer decision without new stages, invented requirements,
source/canon/voice changes or blanket acceptance of future takes.

## Completed: Peter last-frame continuity test (2026-10-30)

Dan still saw transitions and requested carrying the outgoing last frame as the
next keyframe. The local A2V route accepts an initial image, not a forced timed
keyframe. The complete frame-chain test is ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-peter-frame-chain-20261030/peter-full-line-frame-chain.mp4`.
See the packet's `RESULTS.md` for evidence and limits.

Reuse section 1 from the prior Peter line. Section 2 (`db9b86fc`) is generated
from native frame 75, the last of 76 retained first-section frames. Section 3
(`4e0f9921`) uses new section 2 native frame 77, the last of 78 retained frames.
Carried refs preserve native coordinates and every top 550 pixel exactly; only
bottom 154px outside the delivery crop is edge-padded to remove caption carryover.
This avoids progressive crop zoom. Approved Peter v4 remains separately pinned;
derived frames are not new canon approvals. Source-video/reference hashes,
source-frame indices, original canon/audio binding and pixel proof are retained.

Both joins visibly retain outgoing pose much more closely than independent
canon starts. Fixed face-region adjacent-frame mean absolute RGB change falls
from 22.55 to 4.57 and 23.44 to 3.89 at the two cuts. These are boundary measurements,
not proof of lip-sync, identity stability or seamless performance. LTX still
reconstructs initial images and changes subsequent motion/expression; section 3
quickly widens the eyes. Producer playback must assess the full sequence.

Straight joins at 3.166667s and 6.416667s deliberately use no interpolation,
dissolve, held lead, audio shift or speed change. Exact original speech windows,
236-frame 24fps clock and complete full-line AAC are preserved. Every audio
packet hash, PTS/DTS and duration matches the preceding full-line assembly.
A retained PCM MOV verifies every original sample. All decoded final frames
match selected sections in order; full decode passed. Native captions are
removed by the same 980x550 x150/y0 crop, scaled to 1280x720; all 236 selected
lower-frame regions were inspected without text or edge-padding stripes.

The isolated experiment harness accepts pinned continuity-frame evidence,
checks last retained index versus padded tail, retains approved canon separately
and keeps approved-canon comparisons labelled correctly. Typecheck and all 856
tests in 126 files passed, logged in
`outputs/ltx-peter-frame-chain-typecheck-20261030.txt` and
`outputs/ltx-peter-frame-chain-tests-20261030.txt`.

Goal Guardian dedicated pass saved in the packet: delivers the requested
source-faithful continuity experiment and inspect/correct workflow, with limits
explicit. No new stage, invented dialogue, production-provider change,
canon/source approval or chapter edit. Playback acceptance remains with Dan.

## Completed: longer Peter line split and smoothed (2026-10-30)

Dan requested the same short-clip/stitch/smooth experiment for Peter, original
audio timing and no text. The complete approved Peter v4 Mark 5:31 performance
(9.798821s, 432128 mono samples at 44.1kHz) is ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-peter-stitched-20261030/peter-full-line-smoothed.mp4`.
The packet's `RESULTS.md` indexes the final, individual reviews and evidence.

Three new local LTX Fast requests (`201401b1`, `aff699f8`, `c1bd4565`) use the
same approved portrait, direction and seed 42. Exact source speech sections:
3.166667s, 3.250000s, 3.382154s. Cuts at 3.166667s/sample139650 and
6.416667s/sample282975 are frame-aligned inside measured pauses. Both submitted
stereo channels match original selected PCM, only tail silence fills native
five-second requests, and all samples cover the full source with no gap/overlap.

One uninterrupted full original WAV supplies the assembled soundtrack, encoded
once; smoothing copies every AAC packet and its PTS/DTS/duration unchanged.
A retained PCM MOV verifies every original source sample. No added audio pause,
shift, speed change, gain change, repeated word or synthesized speech.
All 236 video timestamps remain at the original 24fps clock (9.833333s picture;
only its last frame extends 34.512ms past the source endpoint).

Motion interpolation smooths frames 74–79 (3.083333–3.291667s) and 151–154
(6.291667–6.416667s), wholly within measured source pauses. The second bridge
ends on the incoming closed-mouth pose to avoid spreading later mouth opening
backward into the pause. A longer initial bridge is retained separately.
Short interpolation softness remains, especially at the first join. Every
outside-bridge frame matches the straight cut in the lossless picture master.

All native takes invented captions; identical 980x550 x150/y0 crop, scaled to
1280x720, removes them. All 236 selected lower-frame regions and 10 bridge
frames were inspected without text. Full decode, selected-frame equality,
outside-bridge master equality, audio packet/timestamp and original PCM checks
passed. Typecheck and all 855 tests in 126 files passed; logs:
`outputs/ltx-peter-stitch-typecheck-20261030.txt` and
`outputs/ltx-peter-stitch-tests-20261030.txt`. No core code change needed.

Speaking shapes vary; section 2 has limited opening in its middle, and section 3
is more expressive. Sync and transition suitability remain for Dan's playback;
file/audio validity is not a lip-sync pass. Raw and individual text-free clips,
straight assembly, source/evidence, lossless audio/picture masters and recipe
are retained. Dedicated Goal Guardian pass: requested source-faithful lip-sync
experiment and inspect/correct workflow preserved; no invented narrative, new
stage, canon/source approval, production-provider change or chapter edit.

## Completed: smooth Jesus stitch within existing pause (2026-10-30)

Dan requested smoothing without audio timing changes or text. Delivered:
`C:/Users/danbr/HeartWordData/prototypes/ltx-jesus-stitched-20261030/jesus-full-line-smoothed.mp4`.
Eight frames (89–96, anchors 3.708333–4.000000s) use motion-compensated
interpolation between resting-mouth poses, within the measured 3.660862–4.150272s
source pause. It eases the expression/head-position jump, with slight softness
in intermediate frames. All other frames remain identical in the lossless
picture master; the review picture is encoded at CRF16. The original straight
cut remains available. No new generation or repository code change was needed.

All original audio packet hashes, PTS/DTS and durations match exactly: sound
was stream-copied without reencoding, shifting, crossfading or added silence.
Video retains all 189 frame times / 7.875s. Modified frames were inspected
without text; full decode and frame/timing checks passed. Recipe inputs,
verification and a dedicated Goal Guardian pass are retained under the packet's
`smooth-transition/`. Scope matches source-faithful audio and producer review;
no new content, production-provider change or pipeline stage. Playback judgment
remains with Dan.

## Completed: longer Jesus line stitched from short LTX clips (2026-10-30)

Dan reports that three-/four-second clips work well and five seconds fails.
He requested one longer line split into short clips, original audio timing,
text removed, to inspect transitions. The complete approved Jesus v5 Mark 5:39
performance is now stitched and ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-jesus-stitched-20261030/jesus-full-line-stitched.mp4`.
Full findings, limits and review index are in that packet's `RESULTS.md`.

The first 94 frames (3.916667s) reuse the existing four-second take. New local
Fast generation `b860f9ad` supplies the exact remaining 3.931678s, with tail
silence only to the five-second native minimum. The split is source sample
172725 of 346112 at 44.1kHz, inside the measured 3.660862–4.150272s pause.
Both approved canon/reference, direction and seed 42 are held constant.

A straight picture cut at 3.916667s exposes a visible expression/head-position
reset; no dissolve or still hides it. Both sides use the identical disclosed
caption crop (980x550 at x150/y0, scaled to 1280x720). No text remnants were
observed across all 189 selected lower-frame regions. Every assembled decoded
frame matches its prepared section; all picture PTS match the 24fps clock.
Audio is the one complete original WAV, encoded once to AAC for review, without
section audio concatenation, gap, overlap, inserted silence, offset or speed
change. A retained MOV with PCM audio verifies every original sample exactly.
The 7.875s picture exceeds the 7.848345s source by only its final frame-grid
remainder (26.655ms). Full decode passed. Raw/individual clips and timing/source
evidence remain retained. Producer playback must judge sync and the join.

The isolated experiment harness now accepts fractional three–four-second
excerpts and rounds review frame counts up. A regression checks the actual
frame-aligned and fractional windows. Typecheck and all 855 tests in 126 files
passed; logs: `outputs/ltx-stitch-typecheck-20261030.txt` and
`outputs/ltx-stitch-tests-20261030.txt`.

Goal Guardian dedicated pass saved as `goal-guardian.json` in the packet:
complete source-faithful dialogue and USER_WORKFLOW's inspect/correct flow are
preserved. No invented content, new pipeline stage, production-provider change,
canon/source approval or chapter edit. Experiment delivery complete; playback
acceptance remains with Dan.

## Completed generation: short LTX ladder ready for morning playback (2026-10-30)

Dan judged Peter 3s "Promising through all three seconds," then explicitly
requested unattended Jesus 3s and 4s alongside the running Peter 4s. Jesus 5s
was authorized only if both shorter Jesus results looked promising. All four
new clips are now generated and ready under:
`C:/Users/danbr/HeartWordData/prototypes/ltx-short-ladder-20261029`.
See `RESULTS.md` there for the complete review index, rationale and limits.

- Peter 4s (`1eb88a5a`): `peter-4s/performance/review-no-text.mp4`.
  Existing Mark 5:31 cast window 1.200–5.200s, approved Peter v4 portrait.
  Mouth changes into the fourth second; exact sync pending Dan's playback.
- Jesus 3s (`4a7c8d34`): `jesus-3s/performance/review-no-text.mp4`.
  Mark 5:19 window 4.987642–7.987642s, approved Jesus v5 portrait.
  Promising changing mouth shapes across the window, resting near the 3s
  speech endpoint in the native silent tail. Precise sync remains unconfirmed.
- Jesus 4s (`3f88f6ed`): `jesus-4s/performance/review-no-text.mp4`.
  Mark 5:39 window 0–4s, same approved Jesus version. Mouth changes across the
  speech window and rests near the final pause around 3.66s. A suspicious
  limited-opening interval at 2.2–2.7s was checked at 24fps; changing lip
  shapes remained, so a sustained freeze was not established. Sync unconfirmed.
- Jesus 5s (`e58adf8b`): `jesus-5s/performance/review.mp4`.
  Mark 5:19 window 0–5s. **Likely failed speaking coverage:** mouth settles
  around 3.2s while source speech continues to approximately 4.848s.
  Strong source-audio energy through 3.25–4.75s supports this concern.

Both shorter Jesus results looked promising on a provisional visual screen,
so the conditional five-second test was submitted; `five-second-gate.json`
records the reasoning and its limits. No human approval or exact phoneme
alignment is claimed. Dan has not yet reviewed these four new clips.
The prior longer Jesus/Peter failures remain recorded below.

All inputs preserve approved canon/source/voice bindings and original PCM.
Both submitted stereo channels exactly match the selected mono source samples;
only tail silence fills LTX's native five-second minimum where needed.
Three/four-second native requests are unavailable: these test usable short
speaking windows, not short-generation efficiency. Source boundaries lie in
measured pauses; full verse text is context, not an excerpt transcript.
Jesus 3s ends one sample before the source endpoint to respect ffprobe rounding.
No lead, hold, offset, time stretch, added word or timing correction was applied.

Delivered reviews are exactly 3/4/5s and 72/96/120 frames at 24fps. Native frame
timestamps are unchanged; all full decodes passed. Peter 4s and Jesus 3s/4s
needed the disclosed picture-only caption crop (980x550 at x150/y0, scaled to
1280x720); audio packets are unchanged by cropping. All delivered lower-frame
regions were inspected without text remnants. Jesus 5s had no observed text
and retains full native framing. Raw files, source evidence, PCM proofs,
requests, progress, per-clip assessments and verification remain retained.
The native audio muxes the input; matching audio does not prove lip-sync.

The isolated experiment harness now also accepts five-second excerpts.
Typecheck and all 854 tests in 126 files passed, logged in
`outputs/ltx-overnight-typecheck-20261029.txt` and
`outputs/ltx-overnight-tests-20261029.txt`.

Goal Guardian dedicated pass (`goal-guardian.json` in the packet): serves
PRODUCT_VISION's source-faithful voice/lip-sync stage and USER_WORKFLOW's
inspect/correct/selective-rerun workflow. Generation/delivery is complete;
adequacy still needs producer playback. No new stage, production-provider
change, canon/source approval, chapter edit or invented narrative content.

## Completed: longer Jesus and Peter LTX tests expose speaking-coverage failures (2026-10-29)

Dan authorized two more local lip-sync samples, preserving original timing and
removing any generated text. The isolated package is
`C:/Users/danbr/HeartWordData/prototypes/ltx-mark5-expanded-20261029`:
Jesus's complete Mark 5:19 cast line (~7.988s, approved Papuan v5 headshot) and
Peter's complete Mark 5:31 cast performance (~9.799s, approved Papuan v4 headshot).
Peter is the saved production's representative for the disciples' quotation;
this does not assert that Scripture names him individually in that verse.
Read-only evidence pins each canon version/headshot, source-mapped voice file,
full source recording hash, utterance bounds and saved exact Hatam words.
Each request is 720p/24fps/10s, seed 42, with character-specific appearance and
source-appropriate direction. Both stereo channels match the complete original
mono PCM. No added lead silence, hold, speed change, offset or speech cut is used;
only end silence fills the request. Raw results stay retained. Any text removal
will use a disclosed picture crop after inspecting the returned frames.

Jesus completed local inference (Desktop generation `8be27de5`) in 30m26s
including transfers and review preparation. All 241 lower-frame regions and
the full contact sheet were inspected: no text observed, so no caption crop
or other picture edits were applied. Raw/review video frame timestamps are
identical. Decode passed; review audio correlates 0.99970 with its source-timed
input at zero offset (native audio 0.99906). The recognizable face animates;
native framing crops upper hair. **Dan rejected the Jesus result:** it does
not align with the audio, and animation stops around seven seconds while
speech continues roughly another second. These are producer-reported
approximate times. This longer-line lip-sync test failed despite intact audio,
valid files and no captions. The failure is retained in
`jesus-long/performance/assessment.json`; no timing repair or regeneration is
being used to conceal it.
Read-only installed-code inspection found no seven-second request/conditioning
cutoff: the complete audio is padded/truncated to the full video's latent
duration and conditions both stages. The returned native soundtrack is the
original waveform, so its fidelity cannot establish mouth alignment. The
Desktop distilled wrapper accepts but does not forward negative_prompt to its
positive-only inference call; previous negative-prompt strengthening was not
an effective control in this installed path. Exact paths/findings are in
`NATIVE_A2V_INSPECTION.md` in the package. No Desktop/model patch or retake was
made; the underlying cause of the visual failure remains unproven.
Peter completed local inference (Desktop generation `3a49bc24`) in 30m16s
including transfers/review. All 241 lower-frame regions and the full contact
sheet were inspected with no text observed, so no crop was applied. Raw/review
picture timestamps match; review audio correlates 0.99991 with the input at zero
offset. **Dan rejected Peter as well:** usable lip-sync lasts only about the
first second, then animation stops while the audio continues. The earlier
coarse visual estimate of mouth settling at 7.5–8s missed this much earlier
loss of meaningful synchronization and is not an acceptance measure. Both
longer tests failed producer lip-sync review; the soundtrack/file checks do
not overturn those failures. Peter's report is retained in
`peter/performance/assessment.json` and the package `RESULTS.md`.
No timing fixes or corrective holds
were applied. Both raw and review clips remain under their performance folders,
with assessment JSON and a package result memo. No paid
fallback, provider migration or production record change occurs. Runner changes
extend the existing experiment CLI with source-pinned longer performance packets,
not a pipeline stage. Neither result is accepted for production lip-sync.

Dan explicitly requested saving the session token for future use. It is saved
outside the repository under LOCALAPPDATA/HeartWord/credentials with Windows
user-bound DPAPI encryption; round-trip verification passed. The non-secret
`scripts/experiments/ltx-session.ps1` helper loads it only into process memory,
restores the previous process environment after execution and supports explicit
clipboard refresh when Desktop rotates the token. Plaintext was not saved.

Goal Guardian: tests reliability of source-faithful canon speaking shots and
the existing watch/compare workflow before Dan decides on a provider. Acceptance
is two inspectable original-timing, text-free viewing samples with full raw
provenance and checks, not automatic adoption or production approval.

## Completed: first LTX take restored, text crop only (2026-10-29)

Dan rejected the second take's held lead as introducing a speech delay and
requested the previous result with only the text removed. The first stereo
baseline's `review.mp4` was cropped to remove its subtitle band and rendered as
`C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-stereo/baseline/review-no-text-original-timing.mp4`.
All 145 video frame timestamps match the original first review exactly, and
the encoded audio packet SHA-256 matches byte-for-byte. No lead hold, audio
offset, retiming, regeneration or source speed change was applied. All frame
regions containing the former captions and the full contact sheet were
inspected with no text remnants observed; full decode passed. Evidence:
`baseline/no-text-original-timing-verification.json`. Prior takes remain.
Goal Guardian: fulfills Dan's explicit return to the first performance and
timing with a disclosed text-area crop only, preserving the source audio and
existing review workflow. No code or production record changes.

## Completed: second local LTX take with disclosed caption/onset edits (2026-10-29)

Dan requested another local take without invented captions or visible talking
before Hatam speech. A separate package at
`C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-take2`
retains the same approved Papuan Jesus v5 headshot and full Mark 5:36 cast line.
The `clean` case strengthens no-text direction and negative terms, changes seed
to 314 and supplies complete speech at generation time zero. The installed A2V
path explicitly rejects timed keyframes, so the review renderer restores the
original 500ms silent lead using the exact resting-mouth canon frame, followed
by generated picture. All words and original review audio timing stay intact;
raw generation is retained independently. This is a disclosed assembly fix,
not evidence that raw LTX learned a silent lead. Caption-free output still
requires inspection of the new generated frames; it is not guaranteed by prose.
Dan copied the current session token. An initial SSH setup failure submitted
no generation; the connection then passed health/settings checks. The clean
case completed local inference (Desktop generation `7b3fae91`, submitted
about 19:01 EDT) in 17m20s including transfer and initial review rendering.
Cloud generation and image-to-video prompt enhancement were both disabled.
The stronger prompt still produced invented captions; native caption
suppression failed. Raw output and the uncropped review remain retained.
`clean/review-caption-free.mp4` is the disclosed corrected deliverable: a
980x550 crop at x=150/y=0 removes the subtitle band, resized to 1280x720.
It retains the closed-mouth 500ms canon lead followed by the new generated
performance. All 144 delivered lower-frame regions and full-frame contact
sheets were inspected; no caption remnants were observed. Decode passed,
the first 12 frames are stationary, speech begins at 0.500s, and audio
correlates 0.99979 with the original six-second source-timed review WAV.
Native raw audio correlates 0.99820 with its zero-lead input. Source words and
speed are unchanged. `clean/assessment.json` retains hashes and checks.
This is a corrected viewing sample, not evidence that native LTX now obeys
caption exclusion or silent leads. Dan/native Hatam speaking-quality review
is still pending. No third generation was submitted.
Type checking and the full 852-test suite passed. Both stereo channels of the
zero-lead input match the complete original mono PCM exactly. A separate,
labelled harness using the prior take verified rendering and all 12 resting
lead frames; it is not a new generated result or caption-removal evidence.

Goal Guardian: serves the source-faithful speaking-shot and watch/correct
workflow in PRODUCT_VISION and USER_WORKFLOW. Acceptance is a new inspected
take without generated text and with a silent/resting lead, complete original
speech and retained raw evidence. No production stage, canon, provider choice,
chapter record or backup-policy decision changes.

## Completed first baseline: isolated local LTX lip-sync experiment (2026-10-29)

Dan requested an experiment to assess local LTX lip-sync adequacy. The prepared
package is at `C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-stereo`;
instructions and provisional review criteria are in
`docs/production/LTX_LIPSYNC_EXPERIMENT.md`. `npm run ltx:lipsync` prepares,
runs one explicitly selected case, or rebuilds local review files. Dan corrected
the source choice: use the approved Jesus from Hatam Mark 5 and a canon headshot,
not Luma's film. The revised package uses the Papuan Jesus v5 approved headshot
and the complete existing Mark 5:36 cast line ("Do not fear, only believe").
Read-only checks confirm the headshot hash, Mark 5's v5 utterance bindings and
the cast-map source hash/version. `source-evidence.json` retains those records
and exact saved Hatam words. Six-second baseline/repeat cases have 500ms lead
silence; delayed has 1250ms. All speech PCM is preserved. The previous Luma
package is superseded and rejected by this runner. No Luma/Kling footage is
included in the new package. Comparison shows the static canon beside LTX.

Dan supplied the Desktop token through the Mac clipboard. The first mono
attempt definitively failed in the A2V encoder, which requires stereo. Its
attempt remains retained in the original Mark 5 experiment folder; Desktop
reported error/no running job before only its matching lease was released.
The revised inputs duplicate identical original PCM into left/right channels,
verified sample-for-sample. The separate stereo-folder baseline completed
local A2V inference (Desktop generation `eee9a010`) in 17m12s including transfer
and local review preparation. A2V loads downloaded
weights on demand and does not appear as a resident scene pipeline in health.
The preflight now handles that distinction and Desktop's camelCase setting,
while still rejecting unknown/cloud settings. Output is 1280x704, 24fps,
145 frames / 6.041667s. Full decode passed. Native audio correlates 0.99863
with the supplied Hatam WAV at zero offset. The headshot remains recognizable,
but the take invents subtitle-like text, begins mouth motion in the silent
lead and crops the upper hair/forehead. This fails the no-generated-text
requirement; lip-sync naturalness/phoneme adequacy still awaits Dan/native
Hatam assessment. No repeat/delayed request was submitted. The runner checks local-only
settings, shares the existing inbox lease, retains uncertain submissions, never
automatically retries, and records exact inputs/request/output for Dan's review.
No production database, source performance, canon approval or provider selection
was changed. Kling Avatar remains production lip-sync; the backup-policy goal
below remains pending separately.

Verification of the revised Mark 5 package: full suite passed 851/851 tests
in 126 files and type checking passed. Input
audio checks prove unchanged decoded PCM, six-second duration, silence-only
padding and an exact 750ms shift. A static canon/audio preview is clearly
labelled `input-preview-static-not-ltx.mp4`. The comparison-render smoke check
uses only a static canon fixture in a separate labelled scratch folder and is
not an LTX result. Actual generated output is retained under the stereo
folder's `baseline/raw.mp4`, `review.mp4` and `compare-canon.mp4`;
`assessment.json` records measured audio/runtime and visible shortcomings.
Dedicated Goal Guardian
review found the work limited to the requested feasibility experiment and
existing producer watch/compare workflow. Human/native Hatam assessment
remains pending; technical checks do not establish lip-sync adequacy.

## Completed: Hatam Mark 5 production

Updated 2026-10-24T14:59:12.898Z. Dan explicitly approved the finished film: **“I approve the finished film.”** The complete production, whole-film checks and verified editable delivery meet the requested goal. No production work or producer review remains. No further generation, voice conversion, paid review, rendering or re-export is required without a new correction request.

The product/workflow result is a source-faithful, watchable full chapter with inspectable editorial reasoning and editable components. The existing autonomous stages were used; no new pipeline stage or unrelated product feature was introduced.

### Approved film and delivery

- Master: C:/Users/danbr/HeartWordData/exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4
- Render: f6709702-7e82-4a99-b072-7358d9e685a8. SHA256: 286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b.
- Duration 9:32.380; 1280×720, 24fps, 13737frames, stereo48kAAC. The approved film bytes are unchanged.
- Bundle: C:/Users/danbr/HeartWordData/exports/hatam-mark5-20261024. Includes native720p, mobile360p, low-data216p, audio-only and README.
- Editable archive: editable-chapter-r3, 5846 retained files plus schema/records/manifest (5849 actual files, 8597835888bytes). All retained bytes, schema and records were verified again when recording approval. Zero missing-dependency or editability findings. ManifestSHA: 9d646139ef798a3f41b70f1eb9838effb90bd793d627862c30df4fae022efed9.
- Genuine full offline reconstruction:111picture placements/35continuousaudio groups/146sourceintervals. Current finishing reproduces identical encodedpicture packets and decoded48kPCM; prior audio completion reproduces the exact delivered whole-fileSHA. No originalworkingdata/application reads or network/provider attempts occurred. Current archive runtime and picture-input hashes match the retained reconstruction proof.
- Normal cold restoration and producer workflow passed with the full playable chapter, all18Papuanvisualcast entries,657savedcrewreplies and18loadedcrewportraits. Restored working root: C:/Users/danbr/HeartWordData/m5final-20261024. Matching hostNode/FFmpeg/localdependencies were used, not a cleanOSinstaller claim.

### Source, review and preservation

All543504ms of the approved Hatam performance retain original words, speed, order and reviewed boundaries. There are17characterutterances/15speakingvideos,146sourceintervals and111pictureplacements. The fullsource occupies12000–555504ms, followed by2876mscarepause andcredits558380–572380. All17actualmixedcast windows have zero lag at48k. The approved12sopening and complete soundtrack remain.

Approved Papuan identities and wardrobe, the clean-shaven John portrait, literalMark5:40 physicalexitofall5mourners, approvedMark5:5 anguishclose-up/offscreenstonecutting and food/care ending remain. NoMark6transition. **1/19nativegroans/gasps remain held and excluded**; final film approval does not approve that unused audio.

Current internal wholefilm picture/sound review96e507fb-b813-425c-8130-cf96af3d874e is approved. All old findings, original scores, errors, rejected/superseded takes and fees remain retained. Existing20priorrecordset/53currentcanon preservation, sourceauthority andFKchecks passed. Original scope limits for historicalNULLhashes/nativephonetic/physicalphonechecks remain honest. No provider request was repeated for approval or closure.

Latest implementation validation remains848tests/125filesPASS andboth typechecksPASS. Approval changes only saved decision/report/checkpoint metadata; no runtime implementation changed.

Protected cumulative ledger and conservative liabilities: **$190.730661/$200**, remaining$9.269339. Includes historical33.50allowance, unknownvoice/image allocations and12audio bounds. Unreported usage remains bounded, not zero.

### Approval and completion evidence

Paths below are relative to C:/Users/danbr/HeartWordData/assets/preparation/hatam-mark5-production-20261021 unless stated:

- assembly/final-producer-approval-20261024.json: direct human statement, exact render/SHA and existing producer-decision history row50167efc-364c-4f6f-86dc-041f00b6ef9d, sequence1730.
- assembly/final-production-completion-audit-20261024.json: all10requirement checks pass against current productionDB, delivered film, original proofs and rehashed editable archive.
- assembly/final-approved-delivery-20261024.json: current approved delivery receipt. Earlier preapproval delivery receipts remain unchanged as history.
- checkpoints/latest-reconciliation-20261022.json: current producer-approved production-complete checkpoint. Earlier blocked-review audits remain historical.
- Bundle verification/final-producer-approval.json and final-producer-approval-records-delta.json retain the subsequent approval beside the immutable R3 export-time snapshot.
- Bundle verification/full-film-offline-rebuild-current-runtime-r3.json, preservation-at-final-delivery.json, goal-guardian-final.json and producer-workflow/final-archive-normal-reopen.json retain full reconstruction, preservation and workflow evidence. Their preapproval humanApproval=false values describe their original recording time and are superseded only for producer approval by the new explicit decision.

Production report: http://127.0.0.1:4000/media/preparation/hatam-mark5-production-20261021/index.html#full-cut.

**Distribution remains separate.** Ryan/native Hatam field review is required before distribution. No field approval, publication or messages to others have been authorized or invented. This is a future release gate, not unfinished work within the approved production goal.
