# Local LTX lip-sync — production preference and test record

## Preferred production technique — producer decision, October 30, 2026

Dan reviewed the short Jesus/Peter results, found three- and four-second
speaking clips usable and five seconds unsuccessful, then approved the Peter
last-frame continuity result: "It looks good." He explicitly requested that
this technique be recorded as preferred for production runs. **Prefer local
LTX 2.5 Fast A2V with short speaking windows and last-frame carry-over.** This
supersedes the October 6 Kling-first lip-sync preference; it does not change
approved sources, canon, voice performances or existing acceptance gates.

1. Use the exact existing source-bound, approved character performance. Keep
   its full audio, source-clock mapping and approved canon/voice version pinned.
   Start from the approved, shot-appropriate character reference; do not replace
   a scene's reviewed framing/background merely because the tests used portraits.
2. Aim for three-second speech sections and allow up to four seconds, choosing
   natural pauses for cuts. **Do not use five-second or longer speaking windows**
   as the preferred technique. Do not add or stretch speech to meet a duration.
   Frame-align picture cuts and retain exact source-sample boundaries with no
   omitted or repeated samples.
3. The tested installed A2V minimum is five seconds. Supply the short original
   audio section followed only by tail silence, then select just the intended
   native frames. This is a five-second generation container, not permission
   for five seconds of speaking. Keep the original speech onset and pauses.
   Duplicate mono PCM into stereo when required by the installed encoder.
4. Generate continuations sequentially. Use the previous section's **last
   retained frame**, not the last frame of its padded native output, as the next
   section's starting-image reference. Preserve its pose, expression, clothing,
   lighting, scale and camera coordinates. The local route accepts an initial
   image; this is not a forced timed-keyframe or pixel-exact frame lock.
5. Keep derived references distinct from the approved canon. Retain the parent
   video hash, frame index, reference hash and approved canon/source/voice binding.
   Remove caption carry-over without repeatedly cropping/zooming the reference.
   The tested native-coordinate recipe keeps the top 550 pixels unchanged and
   edge-pads the lower 154 pixels of a 1280x704 reference, outside its delivered
   crop. Those dimensions are the tested portrait recipe, not a universal crop
   for every production shot. Inspect the delivered framing and locked traits.
6. Stitch picture sections on the unchanged source clock over **one continuous
   original full-line audio track**. Do not concatenate independently encoded
   section soundtracks, insert a closed-mouth lead, shift audio, change speed,
   crossfade speech or add pauses to hide a join. Use straight joins to assess
   carry-over; interpolation/dissolves are not the preferred continuity method
   and must not disguise failed lip-sync or alter active speaking frames.
7. Remove any generated text and inspect all delivered frames for remnants.
   Prompts alone did not reliably prevent captions; retain raw output and any
   disclosed picture-only crop. Do not add text, subtitles, labels or overlays.
8. Review each **complete assembled line**, including both sides of every join,
   through the existing production/QC workflow. Check beginning/middle/end sync,
   mouth rest during pauses, speaking coverage, identity/clothing, expression,
   motion resets and accumulated drift. Source-audio fidelity, low frame-change
   scores and valid files are not lip-sync acceptance. A failed take is not
   accepted merely because this is now the preferred technique. Keep existing
   designated-speaker/single-face constraints, fallback, spending, uncertain-job
   reconciliation and acceptance rules; frame carry-over adds no face-targeting
   capability for ensemble shots.

The accepted continuity example and retained evidence are at
`C:/Users/danbr/HeartWordData/prototypes/ltx-peter-frame-chain-20261030/RESULTS.md`.
The complete line uses sections of 3.166667, 3.250000 and 3.382154 seconds, with
straight joins and unchanged continuous original audio. Both starting poses
carry across much more closely, though LTX can still change expression/motion
afterward. Earlier five-second/longer failures remain evidence of the limit.

### Current implementation and execution

This is also saved as active **global production-crew guidance**, lesson
`968013ad-2358-4765-9372-5d6e8051ef89`, through the existing production-guidance
API, with Dan's source note and activation history. It originates from Hatam
Mark 5's reviewed test but records a production technique, not permission to
reuse that community's canon in other languages. No production run was started
when saving it. API readback confirmed the active global principle; no conflicting
active lip-sync/provider lesson was present. Audit:
`outputs/ltx-production-preference-guidance-20261030.json`.

The verified procedure currently runs through `scripts/experiments/ltx-lipsync.ts`
(`prepare-performance`, `run --case performance`, `review`) with pinned
`shortExcerpt` and `continuityFrame` evidence, plus the retained assembly recipe.
`continuityFrame` records the source video path/hash, retained-frame count and
last retained index; the canonical image remains separately pinned. The
source-aware segmentation, chaining, text cleanup and full-line assembly are
not yet integrated into the normal automatic voice/lip-sync stage.

`src/pipeline/voice-lipsync/index.ts` still constructs `KlingLipSyncProvider`.
That is current wiring, **not the standing producer preference**. Selecting LTX
for ordinary scene motion does not activate A2V lip-sync or this chaining recipe.
Production planning and operator-run work should follow this preference; do not
describe an automatic Kling run as implementing it. Kling remains available
when needed under the existing production/source/cost/review gates.

Use the existing local-only preflight and shared Mac lease. The user-authorized
session helper loads the saved Windows account-bound encrypted credential:

```powershell
& ./scripts/experiments/ltx-session.ps1 -ExperimentArgs @('run', '--case', 'performance', '--root', '<prepared-packet>')
```

Never place credentials in chat, source evidence, project files or logs. Refresh
the saved credential only when it is missing or rejected; reconcile an uncertain
submitted job before retrying. No cloud fallback follows from this preference.

## Historical experiments and superseded intermediate decisions

The dated sections below retain earlier test states, including failed takes,
rejected held leads and old review gates. They do not override the October 30
production decision or prescribe those rejected timing corrections.

Revised October 29, 2026 per Dan: use the Jesus from Hatam Mark 5, with a
canon headshot and existing Hatam speech. The earlier Luma Mark 4 package is
superseded. The stereo-input baseline completed locally; the first mono attempt failed in the audio encoder.

## Inputs and goal

Folder: `C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-stereo`.

Question: Can local LTX animate the approved Jesus canon headshot with natural
lip-sync to his existing Hatam Mark 5 voice performance?

The approved Papuan Jesus version is **v5**. Its carried-forward headshot is
`characters/jesus/lip_sync_closeup/close-up-neutral-v3.png`; the filename's v3
does not mean the canon version is v3. Read-only inspection confirmed Mark 5
utterance bindings use v5, the headshot hash matches its approved asset record,
and the chosen cast audio maps to that same voice version and original source.

Use Jesus's complete Mark 5:36 reassurance line:

> Dwai. Angon digit tut au noro ma angon jo kep Da!

English context: “Do not fear, only believe.” The Hatam text is copied from
Mark 5's saved source-listening manifest. The existing cast performance lasts
about 3.251 seconds; the original source window is 440.710–443.930 seconds.
No voice API or new speech is used.

`source-evidence.json` records project, approved headshot, voice version, cast
segment, original source segment, source hash and exact saved text.
`manifest.json` pins copied inputs and settings. The unchanged MP3 is retained
as `original-speech.mp3`; its decoded PCM is `original-speech.wav`.

`reference.png` is the exact square canon portrait, without retouching or
recropping. The LTX request explicitly asks for 16:9 output with the complete
face/hair and same neutral studio background. Judge automatic reframing in the
actual result. This is a portrait test, not a scene or whole-chapter test.

This serves PRODUCT_VISION's source-faithful speaking shots and USER_WORKFLOW's
watch/compare/selective-rerun workflow. Acceptance means inspectable evidence,
not adopting a provider. Production records, canon and provider selection stay
unchanged; CURRENT_GOAL's pending backup decision remains separate.

## Run

Inputs are already prepared. Keep Desktop open with local Fast downloaded and available, cloud
video generation disabled, and no other job/settings changes during a run.
The runner checks authenticated health, runtime policy and cloud preference,
and shares HeartWord's existing inbox lease. Local inference has no per-call
API charge. There are no cloud review, voice or image calls.

From the HeartWord repository in PowerShell, copy the session token in the Mac
LTX Desktop Logs window, then:

```powershell
$env:LTX_TOKEN = (ssh danieljbrennan@192.168.77.2 'pbpaste').Trim()
npm run ltx:lipsync -- run --case baseline
```

The token stays in the local shell; never save it in project files or chat.
Dan supplied the token on October 29; the stereo baseline has completed.
Local inference may take tens of minutes; the request timeout is two hours.

Watch `baseline/review.mp4` full-size. `baseline/compare-canon.mp4` shows the
static canon headshot on the left and generated LTX video on the right, with
shared supplied speech. The still is an identity reference, not a sync baseline.
`raw.mp4` retains original output including native audio. Review sound comes
from the supplied WAV encoded to AAC; accurate review sound does not itself
prove LTX preserved audio or aligned mouth movement. No correction of generated
mouth timing, speed, frames or pauses is applied.

If promising, run the remaining cases separately:

```powershell
npm run ltx:lipsync -- run --case repeat
npm run ltx:lipsync -- run --case delayed
```

| Case | Speech preparation | Seed | Purpose |
| --- | --- | --- | --- |
| baseline | Complete cast line, 500ms lead silence | 42 | Judge timing, naturalness and canon identity |
| repeat | Same complete line and lead | 314 | Check success with a new seed |
| delayed | Same complete line, 1250ms lead silence | 42 | Check mouth onset follows a 750ms audio shift |

All clips request 720p/24fps/6s/16:9, local Fast, same headshot and prompt.
Speech is neither stretched nor truncated; only silent lead/tail padding differs.
The 720p preset may return 1280×704; actual output properties are retained.
For delayed, compare mouth onset/pause pattern with baseline LTX. Other motion
may change with audio conditioning; this control is evidence, not proof of
phoneme-level accuracy.

## Assess

Use `scores.csv`. At normal speed, then slow/frame-stepped playback, score mouth
timing, naturalness, canon identity and silence behavior from 1 (unusable) to
5 (convincing). Record timestamps of concrete mismatches. Check start, middle
and end, visible closures, teeth/jaw artifacts and resting lips during silence.
Inspect face, hair, beard, cream clothing and indigo bands. Calm reassurance
suits this line; exaggerated cheerfulness does not.

Provisional promising result: baseline and repeat both score at least 4 on
each dimension, Dan finds both usable without corrective edits, and delayed
mouth onset follows the 750ms shift within about three 24fps frames (125ms),
without persistent drift. These are proposed experiment criteria, not validated
production thresholds. Native Hatam review is needed for speech-sound accuracy.
One short line cannot establish whole-chapter suitability. Runtime/missing-model
failure is inconclusive. Generic talking, persistent drift, identity change or
unnatural mouth motion is inadequate on this test.

Installed Desktop source inspection confirmed `audioPath` routes to local
`_generate_a2v`, with supplied audio and image conditioning; local 2.5 advertises
A2V and uses an 11-step distilled pipeline. That confirms a code path, not a
successful generation. HeartWord's ordinary scene adapter excludes speaking;
this experiment directly uses Desktop's API through the existing SSH transport.

## Evidence and recovery

Each case runs once. Request/settings, remote paths and progress go into
`attempt.json`; probe/decode checks and hashes go into `verification.json`.
No automatic retry, paid fallback or cancellation of another job occurs.
Uncertain submitted requests retain their lease/inputs for reconciliation.

On timeout/lost response, inspect that exact attempt and Desktop before further
generation. Recover a completed remote file with SCP to the case's `raw.mp4`,
then rebuild local review files:

```powershell
npm run ltx:lipsync -- review --case baseline
```

Only remove a matching owned lease after confirming its job is no longer active.
Do not delete a case to retry an uncertain request. A new take uses a fresh
explicit `--root`; `prepare` refuses existing folders and verifies pinned
canon/audio hashes. The revised runner rejects the old Luma package.

Goal Guardian: this remains the requested bounded test of the existing
voice/lip-sync stage and producer review workflow, using Mark 5's canon and
source-mapped speech. It creates no pipeline stage or provider migration.

Live attempt note: the first mono request failed definitively in the audio encoder (expected two channels). Desktop reported error with no active job; only that experiment's matching lease was released. The revised folder duplicates each mono PCM sample into left and right stereo channels, with no gain/speed/word changes. The failed mono folder remains retained.


## First measured result

The stereo baseline completed in 17m12s including transfers and review preparation. Output is 1280x704, 24fps, 145 frames / 6.041667s. Decode passed; native AAC audio correlates 0.99863 with the input at zero offset (8kHz mono comparison, +/-200ms search at 1ms steps). This is audio fidelity evidence, not a mouth-sync score.

The recognizable canon face animates, but invented subtitle-like text appears, mouth motion begins in the silent lead, and the top of the hair/forehead is cropped. This take fails the no-generated-text requirement and remains an unapproved experiment. See baseline/assessment.json and the uncorrected review.mp4; compare-canon.mp4 shows canon left, LTX right. Repeat/delayed cases have not been submitted. Dan/native Hatam assessment of the speaking performance remains pending.
## Second take: explicit caption and onset correction

Dan requested a new local take without invented captions and with no mouth
movement before Hatam speech. The separate take2 folder uses case `clean`:

```powershell
npm run ltx:lipsync -- run --case clean --root C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-take2
```

It retains the approved canon headshot and complete Mark 5:36 cast speech,
uses seed 314, strengthens no-written-text direction and negative caption/
transcription/overlay terms, and supplies the full stereo speech at time zero.
Speech PCM is unchanged; only the added half-second lead silence is removed
from the generation input. Installed A2V rejects timed keyframe anchors.

The delivered review restores that same half-second of silence with the exact
closed-mouth canon image, then generated frame zero; it uses the original
`speech.wav` with its original 500ms lead. This is a disclosed picture assembly
fix, not a claim that raw LTX learned to honor silence. The full raw take is
retained. Captions are not blurred or hidden by this renderer; the returned
frames must be checked for text. No source words are removed, synthesized,
stretched, or shifted relative to the original six-second review soundtrack.

Status: prepared, awaiting the copied current session token. No second
inference submitted. The existing baseline and its flaws remain retained.

## Second take result

The new local take completed in 17m20s including transfer/review preparation.
The stronger prompt still generated invented captions. Native caption exclusion
therefore failed. The delivered corrected sample is
`ltx-lipsync-mark5-canon-20261029-take2/clean/review-caption-free.mp4`: it restores
the half-second closed-mouth canon lead and crops out the subtitle band (x=150,
y=0, 980x550, resized to 1280x720). Raw and uncropped review files are retained.
This is a disclosed picture edit, not proof of native caption-free/silent-lead
control. No caption remnants were observed in all 144 delivered lower-frame
regions and the full-frame contact sheets. Decode passed, the first twelve
frames are stationary, audible speech starts at 0.500s, and audio correlates
0.999794 with the original six-second review WAV. All words/speed remain intact.
See `TAKE2_RESULT.md` and `clean/assessment.json` in that package. Human/native
Hatam performance assessment remains pending; no third generation was submitted.

## Producer revision: return to first take, text removal only

Dan found the second take's held lead introduced a speech delay and requested
the previous result with only the text removed. The first stereo baseline is
now available as `baseline/review-no-text-original-timing.mp4` in
`ltx-lipsync-mark5-canon-20261029-stereo`. It applies only the caption-area crop
and resize. All 145 original frame timestamps match exactly; the encoded audio
packet SHA-256 is identical to the first review. No still hold, audio shift,
retiming or new generation was applied. All caption-region frames and the full
contact sheet were inspected with no text remnants observed; decode passed.
See `no-text-original-timing-verification.json` beside it. Earlier files remain.

## Expanded Mark 5 longer-line results

The package at `C:/Users/danbr/HeartWordData/prototypes/ltx-mark5-expanded-20261029`
contains Jesus Mark 5:19 (~7.988s speech) and Peter Mark 5:31 (~9.799s speech),
each from its approved Papuan headshot and existing source-mapped cast voice.
No lead, hold, offset, stretch or word cut was introduced. Only tail silence
fills each ten-second request. Jesus took 30m26s and Peter 30m16s including
retrieval/review preparation. Both returned no observed text across full contact
sheets and all 241 lower-frame regions, so neither needed a caption crop.

Jesus failed Dan's review: poor sync and animation ending around 7s while voice
continues. Peter also appears to settle his mouth around 7.5–8s while his line
continues nearly 9.8s. Raw and original-timing review files remain unchanged;
file/audio-fidelity checks do not qualify these as passing lip-sync results.
The installed distilled wrapper ignores the accepted negative-prompt field;
read-only inspection found no obvious seven-second input cutoff. The deeper
cause remains unproven. See RESULTS.md and NATIVE_A2V_INSPECTION.md in the
package. No production-provider change, app patch or extra retake occurred.

Producer follow-up: Dan rejected Peter too—lip-sync is good only during the
first ~1s, followed by animation stopping while speech continues. Both longer
samples failed producer review. Coarse frame/energy inspection did not detect
how early useful synchronization failed; technical checks are not acceptance.
The original outputs and exact feedback are retained, without further retakes
or any production-provider change.

## Gated short-clip ladder

Dan requested Peter 3s → if promising Peter 4s → if good Jesus 3s → Jesus 4s.
Only Peter 3s has run so far. The installed local Fast A2V capabilities expose
a five-second minimum, so the exact three-second source excerpt was followed
by tail silence for inference; the delivered review takes the first 72 native
frames / three seconds with no timing shift or added hold. This tests usable
short performance, not native three-second generation efficiency.

Packet: `C:/Users/danbr/HeartWordData/prototypes/ltx-short-ladder-20261029/peter-3s`.
The exact 0.100–3.100s Peter Mark 5:31 cast window starts and ends inside measured
source pauses; full verse text is context, not a claimed excerpt transcript.
Both stereo channels preserve the selected PCM exactly. Generation took 13m48s
including retrieval/review. It added text, removed with the disclosed caption
crop; `performance/review-no-text.mp4` has exact 3.000s audio/video and unchanged
original frame timing. All 854 tests and type checking passed. Actual sync is
pending Dan's playback assessment; no later ladder step was submitted.
