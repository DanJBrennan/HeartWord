# Verified Kling Avatar performance direction

Research/implementation: October 14, 2026. Controlled generation acceptance is
**held by insufficient API balance**, not completed. Dan clarified that the
winning take was a standalone proof of concept and never belonged to a film.
Two bounded comparison requests were rejected; no task/output was returned.
No live chapter, accepted take, approval or source was changed. Actual billed
cost of the rejected requests remains unreported; no charge is assigned to a film.

## Goal and actual starting state

Serve PRODUCT_VISION's autonomous, faithful, editable chapter and
USER_WORKFLOW's review/correction of individual performances. Preserve exact
approved cast audio, Papuan video canon, source-supported emotion, shared
continuity, retained takes and the cumulative $200 film budget. No routine
chapter-plan signature is added. Field/release authority is unchanged.

Implemented before this change: a one-image/exact-audio `LipSyncProvider`,
source/voice bindings, shared production briefs, attempts/reviews, append-only
cost ledger/edit history and candidate acceptance. The main Avatar adapter
sent no prompt/mode. The historical v71 script sent prompt/pro but could silently
retry without both. Its accepted HTTP requests prove neither hidden parameters
nor superiority. Original skeleton notes and provider assumptions are history.
Mabel/Kit/Gus role contracts do not make them independent live workers;
production-crew.md and production-crew-communication.md retain their authority.
FDL v1/v2 are existing designs; this change is a narrow provider integration,
not a general FDL parser, new stage, dispatch system or replacement timeline.

## Recovered GUI baseline

Retained evidence directory:
`C:/Users/danbr/HeartWordData/research/kling-avatar-2026-10-14/`.

| Item | Verified evidence / uncertainty |
|---|---|
| Dan's file | `C:/Users/danbr/Downloads/Best Lip Sync Jesus.mp4`, preserved untouched; exclusive original copy retained. |
| Original SHA-256 | `6bd47f3b3c72fdbf2983c09407ef9ff5a668b9bfa5128069cb0e46e86733a447` (10,107,512 bytes). |
| Exact visual take | GUI task **317949919322306**, work **317949919328340**. The current task download and Dan's file have identical decoded-video SHA-256 `5b3e84bee0b5a285806fdb637718f7f8e275f90086e193f0a7fa54301f17868b` across all 304 frames. Their container/file hashes and audio clocks differ. |
| GUI date | Displays **8/5/2026, 9:07:18 PM**. GUI does not label timezone; no Unix creation time was recovered. The filename is not date/model proof. |
| GUI title | `kling_20260806_Build Avatar_Smiling wa_2324_0`. |
| Source image | Original image URL exposed by the task's Edit form, retained as `gui-source-image.png`, SHA-256 `785b4d80063c09813986601f027a6269a083e325c406eccf4ad3b3d43556a5e6`. No exact stored `character_assets.content_hash` match. This does not disprove visual equivalence to a historical canon image; it does not establish current approval. |
| Exact uploaded audio | Task Edit form restores `original-test-audio.mp3`; its loaded upload asset is retained as `gui-original-test-audio.mp3`, SHA-256 `3dd3a486608051b356c8ba6e4fb62dd2bf18ec8bfe00034c2bf355cb2aa29475`; MP3, mono 44.1 kHz, 10.077460s. Dan confirms standalone POC, never used in a film. No film/passage approval is inferred. |
| Saved performance text | `Smiling warmly at the camera, the character exudes a calm and confident demeanor, standing still with a gentle expression.` Restored on Edit. Thus this successful task has a nonempty saved prompt; it cannot be represented as a verified no-prompt baseline. |
| Prompt origin | Unknown for this task. Current official GUI guide documents automatically recommended prompts and three AI performance suggestions; current new form was initially empty. Neither observation proves whether Dan's historical prompt was suggested, manually entered, or restored from saved configuration. |
| Model/version | GUI labels product `Avatar`. Edit route contains `klingVersion=1.6`; **this route value is not proof of the Avatar model/checkpoint**. Exact underlying model remains unknown. |
| Quality/mode | Task displays `720p`; actual retained output is 960×960, 30 fps. Original API `mode` and internal quality mapping are unknown. Do not infer `std` solely from 720p. |
| Submitted fields/omissions | Original submitted request JSON unavailable. Cannot classify particular historical optional fields as explicitly submitted versus omitted. Hidden seed/intensity/motion settings remain unknown. |
| Current GUI | Avatar 2.0 link/guide; new form showed `720p · 1`, optional prompt empty; Edit restores original prompt/audio/image and quotes 40 credits. These are current UI observations, not original submission/cost evidence. |
| Audio clocks | Original file video starts at 0.133333s; retrieved GUI video starts at 0. Baseline audio is AAC stereo, 10.170340s; retrieved GUI audio 10.123991s. No timestamps/audio were altered. Whole-wave correlation against the recovered MP3 is only 0.226 at +79.75ms in the retained diagnostic; this does **not** certify source/audio timing or mouth sync. |

The matching video was identified by decoded pixels, not name/appearance. The
other two existing GUI downloads are retained solely as identification evidence;
their input parity was not established. They are not a controlled acting test.

Reproduction: `node scripts/research-kling-avatar.mjs` preserves/probes the
original, reads query-only SQLite and lists documented API tasks;
`node scripts/query-kling-avatar-evidence.mjs` reads existing tasks;
`node scripts/verify-kling-gui-baseline.mjs` verifies the decoded match and
records `gui-baseline.json`, including input hashes and limitations. No script
submits generation. Private task URLs stay in local evidence.

API task listing returned **69** retained tasks under the configured account.
GET of GUI task ID returned HTTP 400/code 1201 (not found); GUI and developer
task IDs are not interchangeable here. GET of known API task
`935054166702034982` succeeded with empty `task_info`, usage and result metadata;
it did not return original prompt/image/audio/model settings. Existing successful
std-era/pro-request histories demonstrate account operation, not every current
entitlement. No documented Avatar model-enumeration endpoint was found.

Current comparison access is **not spend-ready**: both std/prompt submissions
returned HTTP429/code1102, `Account balance not enough`. Read-only queries of
their retained external IDs return task-not-found; the task list stays at69.
The documented free `/account/costs?start_time=...&end_time=...` query also
succeeded; its remaining-package statistics can lag12 hours. Do not equate
GUI credits or historical successful API tasks with current funded API access.

## Current official capability and default mapping

Sources inspected directly in the rendered official site on October 14:

- [Avatar API](https://kling.ai/document-api/api/video/avatar).
- [API updates](https://kling.ai/document-api/updates/api).
- [GUI Avatar 2.0 guide](https://kling.ai/quickstart/kling-ai-avatar-2-user-guide).
- [Video pricing](https://kling.ai/document-api/pricing/base/video).
- [Capability map](https://kling.ai/document-api/guides/capability-map/video).

Contract: `POST https://api-singapore.klingai.com/v1/videos/avatar/image2video`;
documented single/list GETs use the same path. Accepted requests alone are not
evidence that an undocumented field changed output.

| Control | API type / range | Default and omission | GUI mapping / limitation |
|---|---|---|---|
| `image` | Required string, raw Base64 or accessible URL; JPG/JPEG/PNG, ≤10MB, dimensions ≥300px, aspect ratio 1:2.5–2.5:1 | No image default | Task's reference image. One image, no separate headshot; preserve film's approved landscape composition. Do not crop the square historical evidence. |
| `sound_file` | String; raw Base64/URL, MP3/WAV/M4A/AAC ≤5MB, 2–300s | Required when `audio_id` absent; mutually exclusive | Uploaded cast audio, not GUI text/voice generation. Preserve exact supplied bytes for a complete file; exact source-window extraction otherwise. |
| `audio_id` | String; TTS-produced ID ≤30 days old, 2–300s | Alternative to sound_file | Documented but deliberately unused for HeartWord recorded speech. |
| `prompt` | Optional string, max 2500 characters | No documented default text or precise omission behavior | Optional Avatar Prompt. Free prose for emotion/action/camera; GUI can suggest three descriptions. API does not document GUI suggestion generation. Explicit empty text and omission are retained distinctly. |
| `mode` | Optional string enum `std`, `pro` | Documented default `std` when omitted | Standard/professional service modes. Exact successful GUI mapping unknown. Current price table labels resolution, so mode-to-pixel resolution is not promised. |
| Facial expression | Prose through `prompt` | Unspecified behavior when not directed | Supported soft intent; no verified expression enum, blendshape weight or emotion slider in this API. |
| Head movement | Prose through `prompt` | No documented neutral rotation/intensity number | No verified numeric angle/rate/strength control. |
| Gaze | Descriptive intent through `prompt` | No documented gaze default | No eye-target vector or gaze-strength parameter; exact required trajectory is unsupported. |
| Posture/body | Action intent through `prompt` | No documented numeric defaults | No verified skeletal pose, joint or body-strength fields. Image composition constrains what is visible. |
| Hands/arms | Gesture intent through `prompt`; GUI guide demonstrates examples | No deterministic gesture guarantee | No separate hand/arm enum, pose or timeline parameter. Check anatomy/continuity independently. |
| Motion intensity | Qualitative prompt wording only | No documented numeric range/default | `motion_intensity`, `head_rotation`, `gaze_strength` etc. are unverified and rejected by the adapter. |
| Camera | Movement/stationary intent through `prompt` | No documented camera default | No Avatar `camera_control`, lens trajectory, exact end frame or seed field. General scene APIs' controls cannot be transplanted. |
| Progression | Ordered prose, grounded in independently timed source when exact beats matter | No automatic continuity state across requests | Shared saved direction supplies continuity; generation boundaries do not authorize resets. No exact-keyframe timing guarantee. |
| `watermark_info` | Optional object `{enabled:boolean}` | No default documented on inspected reference | Operational output choice, not performance. Adapter omits and discloses it. |
| `external_task_id` | Optional unique account string | Omitted: no customer ID | Adapter explicitly sends the retained request/reservation UUID for read-only recovery and retains the service task ID. No performance effect is claimed. |
| `callback_url` | Optional string | Omitted: no callback configured | Not an acting control; adapter polls. |
| `model_name`, `cfg_scale`, negative prompt, speed, seed | No fields in inspected Avatar body | No verified defaults | Unsupported/unverified for Avatar; do not borrow scene-video parameters. |
| List GET pagination | `pageNum` integer 1–1000 default1; `pageSize` integer1–500 default30 | Read-only task history | Original submitted controls are not promised in returned task_info. |

The main adapter now follows documented raw Base64 rather than historical data
URIs, allows only prompt/mode, validates compiled length without truncating,
and retains requested intent, explicit settings, omissions/default claims,
input hashes/exact submitted audio, task/usage data and unreviewed output.
Hidden settings stay unknown. Failures do not strip settings or auto-retry.

## Retain / upgrade / migrate recommendation

**Retain the existing Avatar endpoint; compare verified direction settings.**
The December 4, 2025 API update expands Avatar to five-minute content without
parameter changes. The same day's GUI guide describes Avatar 2.0. It is
reasonable to infer that the currently documented endpoint incorporates that
capability upgrade; neither documentation nor account GETs expose an exact
underlying checkpoint or prove this historical GUI task's backend version.
No replacement Avatar endpoint/model selector or Avatar-specific deprecation
was found. July 15, 2026 notes say legacy APIs remain available without planned
deprecation; this does not promise perpetual support.

| Option | Supplied speech / suitability | Evidence, tradeoffs and decision |
|---|---|---|
| Existing Avatar, omitted controls | Exact `sound_file`; one speaking image; up to300s | Familiar current path; naturalness/identity remain review outcomes. API omission is not the recovered GUI baseline. Retain for passages where its reviewed output suffices. |
| Same Avatar, recovered prompt / scoped prompt / pro | Exact same supplied audio; explicit verified controls | Appropriate small comparison. Pro is documented higher quality, not proven better Hatam lip-sync or acting. More motion may harm readability/identity. No claim from one successful take. |
| “Avatar 2.0” GUI | Upload audio, optional/suggested performance descriptions, current five-minute guide | Already part of the current product family; no separately selectable Avatar2 API model verified. Historical mode/model remain unknown. No migration just to obtain this label. |
| Face-targeted lip-sync | Existing video + exact audio + reviewed face ID | Separate existing path for ensembles/established motion. Does not replace the one-image performance generator or offer equivalent free acting control. Retain its own face/review contracts. |
| Kling 3.x/4.0 scene video | General scene models/native generated dialogue | A newer video number is not recorded-audio Avatar compatibility. No verified equivalent exact-supplied-audio Avatar contract/benefit established. Reject substitution here. |
| Motion control | Image + reference motion video | Separate motion-transfer product; no equivalent verified recorded-audio performance treatment established. No migration. |
| Video commerce / script-to-speech / TTS | Script/voice generation workflows | Ineligible whenever they rewrite Scripture or synthesize/replace approved recording. |

No controlled Hatam comparison establishes gains in mouth accuracy,
naturalness, identity, continuity, reliability or output quality yet. The
official guide showcases English/Japanese/Korean/Chinese; that is not Hatam
validation. Preserve the winning take instead of attempting prompt-only
reconstruction as a substitute for its actual pixels.

## Defaults, overrides, FDL and saved workflow

Dan explicitly approved the recovered prompt on October 14 as his preferred
baseline for **most neutral and positive** lip-sync performances:

> Smiling warmly at the camera, the character exudes a calm and confident demeanor, standing still with a gentle expression.

This is producer direction, independent of the still-blocked paid comparison;
it does not identify the historical model/mode or make the prompt a service
default. `dan-neutral-positive-v1` names the preference. Saved acting intent
whose `emotionalRegister` is `neutral` or `positive` receives this exact prompt
when neither baseline nor override supplies another prompt. Other requested
acting details still compile alongside it. Explicit prompt overrides (including
empty text) take precedence. No direction or unclassified treatment does not
receive an automatic smile. Negative speech such as “You brood of vipers!”,
rebuke, anger, grief, fear and distress uses a passage-appropriate override;
the named smiling profile holds for negative/unresolved registers without one.
A retained literal warm prompt also holds when the saved treatment explicitly
identifies negative emotion. Crew guidance requires source/context judgment,
not a Scripture keyword classifier. Requested direction and the resolved
producer-profile selection are retained separately from the submitted prompt.
No accepted take is regenerated and no model/mode change follows this choice.

A source-grounded shortfall or conflicting emotional treatment justifies an override;
record baseline/profile evidence, why it was insufficient, corresponding
English semantic context and the exact approved speaker/cast binding.
Heart-language speech and its timing remain authoritative. English/verse
durations cannot manufacture Hatam phrase timing. Exact emotional-beat changes
and inserted pauses need their existing independent boundary evidence.

Keep provider-neutral acting facts in FDL core local state/progression. The
runtime `intent` is their small resolved handoff projection (emotional register,
intensity, gaze, head/body/hands, camera/progression), retained separately from
compiled provider parameters. It is descriptive, not native Kling FDL. A narrow
[versioned provider profile](../design/fdl/kling-avatar.v1.schema.json) fits
existing `providerSettings.settings`; [example](../design/fdl/example.kling-avatar.v1.json)
is explicitly non-production and lacks source readiness. Vendor settings stay
out of the Bible/regional extension. Historical core/v1/v2/Bible schemas remain
unchanged. There is no general FDL file loader or fact/approval resolver.

`savePerformanceDirection` records one direction across explicit related shot
IDs in existing `edit_commands`. Manual/API and stage5 read the same snapshot;
new versions retain prior decisions/undo history. Changed group source/voice
bindings hold, and unknown controls or missing required fields fail visibly.
Related clips inherit the same packet. A reviewed source progression may save
a new packet with its reason; software does not infer timing or invent acting.
Existing selected/accepted clips are never regenerated by this operation.

Producer/API operations:

- `POST /api/projects/:id/avatar-direction`: `shotIds`, `direction`, `actor`,
  `idempotencyKey`; save/reopen without generation.
- `GET /api/projects/:id/shots/:shotId/avatar-direction`: inspect same state.
- `POST /api/projects/:id/avatar-budget`: named evidence and conservative
  `unreportedUpperBoundUsd`/`outstandingUpperBoundUsd`, idempotency key. It can
  be supplied by an accountable worker with billing evidence; it is not a new
  Dan/chapter-plan signature.

Stage5 checks cost reconciliation before new work; each Avatar request reserves
its conservative ceiling atomically in existing edit history. The live ledger,
unreported upper bound, outstanding external charges and unsettled local
reservations all count toward $200. New unreported crew costs invalidate the
reconciliation. A lost/rejected/no-media response remains outstanding and blocks
another request for that shot. A successful candidate's terminal attempt,
ledger estimate, reservation settlement and review note commit together.
Previously accepted media stays selected; new output remains held for review.

Current API price table lists Avatar **$0.056/s at720p, $0.112/s at1080p**.
Adapter reserves/estimates at the higher rate, rounding seconds upward; it
does not promise mode-to-resolution mapping. Actual USD stays unreported;
service deduction units/balance fields are retained separately. A reservation
is not an invoice. This is a guard on this Avatar stage, not a retrofit of every
historical/direct generation script or comprehensive all-provider reservation
system. Cost reconciliation must cover planning, reviews, rejected/retried
work, GUI/external charges and other outstanding work. Existing legacy script
entry points must not be used as an ungated comparison workaround.

No new image or paid critic call was made. Two verified Avatar comparison
requests were attempted and rejected without task IDs. Codex research and
implementation consume the user's assistant account usage; a dollar amount
is not reported and is not asserted to be free. Historical GUI and rejected
request invoice amounts remain unreported, distinct from the conservative
new-request reservation and the absence of generated tasks.

## Controlled comparison and present hold

Recorded ledger totals at audit: Mark2 **$70.44**, Mark3 **$79.756615**,
Mark4 **$160.663757**. They are historical recorded figures, not reconciled film
invoices or remaining spend clearance. Mark3 also has26 crew events with unknown
cost. The original GUI task's cost and film attribution are unreported; API
read/list returned no active Avatar tasks. That does not rule out other charges.

Dan's clarification resolves attribution: this is standalone research, not a
film. No new chapter/project was fabricated or historical GUI charge allocated
to a film. Production use still requires actual approved source/cast/canon and
the cumulative $200 film gate; a POC result cannot transfer that approval.

Attempted experiment: two candidates using the *same recovered POC image and
exact uploaded bytes*, first retaining the saved prompt, second retaining that
expression while requesting clearer articulation, steady gaze and less
distracting head/shoulder motion. No passage-specific emotion or Scripture
meaning was invented. Both explicitly use **std**, with historical mode unknown;
neither is labelled exact GUI reproduction. At10.077s the conservative request
ceiling is11×$0.112×2 = **$2.464**, inside a **$5 new direct comparison envelope**
including any later paid review. No third “newer model” request is justified.

Both requests failed at account balance (HTTP429/code1102). Retained request
UUIDs/external IDs are `1b625b42-496b-4d35-ae35-05ffbc6807e0` and
`23f83085-6b74-4d0d-ab1d-0dee0737e37f`. Exact submitted audio and prompt/mode
manifests are retained beneath `assets/generated/lipsync/request-<UUID>.*`.
`comparison-run.json` contains the two reservations/rejection messages;
`comparison-rejection-reconciliation.json` retains documented read-only GETs
and account evidence. Neither task exists in those responses; no output or
paid review was produced. Invoice USD remains unknown. Do not auto-release
unknown charges or silently submit again. The comparison script refuses an
existing run; reconcile the retained requests/account before deliberate retry.
Reproduction tools: `scripts/compare-kling-avatar-poc.ts` (guarded paid entry,
already run) and `scripts/reconcile-kling-poc-rejections.mjs` (read-only).

Score each returned candidate separately for mouth synchronization, naturalness,
facial readability, identity/wardrobe, source-appropriate acting, distracting
movement and adjacent-clip continuity. Retain actual audiovisual comparisons,
findings/limitations, bill/usage and rejected attempts. English supplies meaning;
the exact approved audio supplies speech/time. Ordinary review and field/release
authority remain in force. A single win does not establish a universal rule.

**Current blocker:** funded Kling API access and retained-request charge
reconciliation before retry. There is no unanswered film-attribution/product
decision after Dan's POC clarification, and no chapter-plan approval is needed.
No new audiovisual comparison or quality/migration benefit can be claimed from
rejected submissions. Existing source/canon holds, current Mark4 compatibility
work, LTX/preservation and other active work are intact.

Your dot/live Mabel dispatch and external ChatGPT/SMS transport are not available
in this session's tools/runtime. This chat reports the actionable blocker. SMS
to the supplied number ending8114 is not claimed, and no unrelated notification
service was built.

## Validation and separate Goal Guardian

Validation: **606 tests / 100 files pass**, TypeScript and production web build
pass, and `git diff --check` passes. Full-suite log:
`outputs/kling-avatar-tests.txt`.
Tests include exact whole-file audio, safe short-window padding, supported-only
requests, no fallback, FDL mapping/unknowns, saved related-clip direction, source
binding staleness, idempotency, budget/outstanding reservations and the real
shared API → stage → candidate acceptance workflow with synthetic media/mocked
providers. Those tests do not certify acting quality, Hatam timing, paid-service
adherence or live film readiness.

The dedicated Goal Guardian pass checks PRODUCT_VISION, CURRENT_GOAL and
USER_WORKFLOW independently of tests. Scope/preservation and guarded support
pass; full acceptance remains held for funded controlled audiovisual/cost
evidence. No source, approved canon, accepted assets, producer decisions or
history were changed. No hidden settings, source meaning, Hatam phrase timing,
new cast/voice or replacement speech were invented. The review distinguishes
the observed GUI prompt from proven original submission/defaults, and the
provider projection from a general FDL runtime. It also requires cost evidence
before spending and keeps failed reservations outstanding instead of treating
them as free retries. No unrelated stage, brand, ticket collection or routine
chapter-plan approval was added.

The separate pass additionally checked nonzero source-window offsets, which
now use explicit filter start/end before silence padding, and linked each
durable reservation UUID to the submitted `external_task_id` and retained
request/audio/task files for read-only recovery. The live SQLite SHA-256 and
Dan's original MP4 SHA-256 remain unchanged. The baseline review artifact is
`HeartWordData/research/kling-avatar-2026-10-14/review.html`.
