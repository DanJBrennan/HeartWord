# Local LTX video generation

Dan's Mac mini runs LTX Desktop 1.2.7 with the already downloaded LTX 2.5 Fast
model on Apple MPS. Windows drives its direct API through SSH. No ComfyUI or
additional model copy is needed.

## Start and diagnose

Keep LTX Desktop open with the local Fast model ready. SSH/SCP must work
without an interactive password for automated jobs:

Run npm commands from the repository, in the same PowerShell session that has
the token. Starting from `C:\Windows\system32` makes npm look for the wrong
`package.json`:

```powershell
Set-Location 'C:\Users\danbr\OneDrive\Documents\HeartWord'
```

```powershell
ssh -o BatchMode=yes danieljbrennan@192.168.77.2 'echo ready'
```

If SSH requires the Mac account password, configure key authentication first.
On 2026-10-06 this Windows profile had no `id_ed25519` key or public keys in
`~/.ssh`. For that setup, run the following in PowerShell. When `ssh-keygen`
asks for a passphrase, press Enter twice for unattended access. If the key
already exists, reuse it rather than overwriting it.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -C "HeartWord LTX"
scp "$env:USERPROFILE\.ssh\id_ed25519.pub" danieljbrennan@192.168.77.2:heartword-windows-key.pub
ssh danieljbrennan@192.168.77.2 'umask 077; mkdir -p ~/.ssh; echo >> ~/.ssh/authorized_keys; cat ~/heartword-windows-key.pub >> ~/.ssh/authorized_keys; echo >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; ssh-keygen -lf ~/.ssh/authorized_keys; rm -f ~/heartword-windows-key.pub'
ssh -o BatchMode=yes danieljbrennan@192.168.77.2 'echo ready'
```

Enter the Mac password in the terminal for the file copy and append commands.
SCP preserves the original public-key file and avoids PowerShell pipe encoding
and nested-quote transformations. The append preserves existing authorized
keys. Compare its reported fingerprint with
`ssh-keygen -lf "$env:USERPROFILE\.ssh\id_ed25519.pub"` on Windows. The final
command should print `ready` without asking for a password. The private key
remains under the Windows user profile; only its public key is transferred.

If the final check still fails, inspect Mac permissions with
`ssh danieljbrennan@192.168.77.2 'ls -ld ~ ~/.ssh ~/.ssh/authorized_keys; ssh-keygen -lf ~/.ssh/authorized_keys'`.
The correct fingerprint must appear and the SSH directory/files must belong
to the Mac account. Do not regenerate or overwrite an existing private key
while diagnosing a server-side rejection.

Copy the masked backend token from the footer of the Mac's LTX Desktop Logs
window, then in the PowerShell session that starts HeartWord:

```powershell
$env:LTX_TOKEN = (ssh danieljbrennan@192.168.77.2 'pbpaste').Trim()
npm run ltx:test -- --health
npm run ltx:test -- --image "C:\Users\danbr\HeartWordData\assets\generated\keyframes\codex\8534f367-c673-4b45-a7a4-d42401f157a7\4f6db394-9055-4198-91f2-aa1008d38df7.png" --prompt "Natural cinematic movement. Preserve character identity, clothing, environment, composition and historical setting." --duration 5 --resolution 720p --seed 42
```

That image is an existing accepted Mark 4 keyframe checked on 2026-10-06.
`C:\path\keyframe.png` in CLI examples is only a placeholder, not a real file.

This is the local session token, not the cloud API key. Never save it in
`.env`, source, logs, project files or chat. SSH/SCP subprocesses do not receive
it. An existing process cannot inherit a token set in another shell: start
`npm run dev` from this configured shell. Refresh the token after a Desktop
restart if authentication fails.

The diagnostic retains a copy of the keyframe in the asset area and writes a
unique MP4 plus JSON metadata under `assets/generated/video`. It prints the
actual phase, percentage and step counts. Optional `--output` must be an
absolute destination inside `HeartWordData/assets`; existing takes cannot be
overwritten. `--health` submits no video generation.
Audio defaults to environmental ambience. The diagnostic extracts a separate
`.mp4.ambience.wav` stem, uses the existing `GEMINI_API_KEY` for a listening
review, and writes `.ambience.wav.review.json` with its verdict and estimated
review cost. `--audio none` explicitly requests a silent clip and removes
unexpected Desktop audio. A diagnostic does not insert footage or sound into
the Mark 4 timeline or the project's approved asset collection.

## Select a provider

`HEARTWORD_VIDEO_PROVIDER` defaults to `ltx`. The **Video backend** selector
beside Generate media offers LTX local, Veo, Kling and the configured Studio
default. Set the process/config value to `veo` or `kling` for comparison runs.
Both `POST /api/projects/:id/shots/:shotId/final-video` and
`POST /api/projects/:id/media-generation` accept `{"provider":"ltx"}`,
`{"provider":"veo"}` or `{"provider":"kling"}`.

Accepted footage is reused and retained candidates require review/reconciliation
before another take; selecting another backend does not discard existing work.
Older shot-specific scripts explicitly supplying Veo preserve that choice.
LTX failures do not automatically submit to paid video providers.

LTX has zero API generation cost. Image generation, cloud drafts, QC, voice
and lip-sync retain their existing costs and ledger. Risky shots still require
an approved draft. LTX supplies scene motion with environmental audio and 16:9;
the existing cast speech/lip-sync path remains separate.
Requests add explicit rules against dialogue, narration, gibberish, singing,
music and visible talking. The raw MP4 and extracted WAV are retained. An
independent listening review checks the whole stem for any speech, including
unintelligible voices, scene fit and technical quality. Only explicit no-speech
evidence with passing checks and confidence 80–100 publishes an SFX asset in
the existing sound-design collection. The Sound Designer/Director can then
place it with the existing cue timing, gain limits and speech ducking.

Raw video audio is still muted in production assembly. Mixed speech,
uncertain verdicts and unavailable review hold the whole stem; the adapter
does not claim to separate voices from ambience. Pictures remain available
for their own canon/motion review. Job progress and logs show
`reviewing_ambience` followed by `ambience_accepted` or `ambience_held` with
the reason. Attempt-specific audio review JSON and QC notes preserve evidence;
review spend enters the existing ledger. Re-running a retained attempt does
not silently repeat the listening call or generate another take.
Kling Avatar remains the lip-sync video generator, as reaffirmed by Dan on
2026-10-06; the scene-video backend selector does not change it.

## Supported Fast settings

| Resolution | Durations at 24 fps |
| --- | --- |
| 540p | 5, 6, 8, 10, 20 seconds |
| 720p | 5, 6, 8, 10 seconds |
| 1080p | 5 seconds |

Ordinary pipeline shots request 720p/24 fps/8 seconds. Directed short shots
request 5 or 8 seconds to cover their planned duration. Arbitrary combinations
are rejected before network submission. The diagnostic defaults to 5 seconds.
Optional shared-interface fields include `fps`, `seed`, `audioMode`, `outputPath` and
`onProgress`.

## Connections, progress and recovery

Each job discovers the latest `Server running on http` entry in the newest
`~/Library/Application Support/LTXDesktop/logs/*.log`. HeartWord owns a reusable
SSH tunnel on **127.0.0.1 only**, with an available local port so an existing
manual tunnel on 8000 is unaffected. The remote port is rediscovered each job;
changed/dead tunnels are replaced before submission. Only HeartWord's own
tunnel is stopped. Authenticated `/health` must report `ok`, loaded models and
active model `fast`.

Inputs use shot IDs and generation UUIDs in `~/LTX-Inbox`. SCP downloads to a
temporary sibling, checks nonzero size, then renames to the exact requested
MP4. Metadata records prompt, seed, settings, source keyframe, remote
input/output, local output, provider/model and elapsed time. Mac outputs remain
retained. Temporary inputs are removed after definitive completion/failure.

The live Mac test on 2026-10-06 completed a five-second request in 14m11s.
Desktop's `720p` preset returned 1280x704, 121 frames at 24 fps (5.041667s).
It also included audible AAC despite `audio: false`. The initial integration
muted that entire track. Dan subsequently requested native ambience, so the
default now retains the original bytes and extracts a WAV for listening review.
The earlier Mac take was exercised through this extraction/review path: the
listening check flagged speech and held its audio. This is review evidence,
not a claim that generation prompts guarantee speech-free output. Actual
dimensions, frame count, duration and audio retention/removal are recorded.
The existing ffprobe/ffmpeg tools handle extraction or explicit silent video
stream copy; invalid output or a missing tool fails clearly with the Mac
output path retained for recovery.

Desktop reported `inference`, 15%, step 0/8 throughout this live inference,
then completed. HeartWord surfaces the returned values without inventing
intermediate steps. One progress-request timeout recovered automatically.

The synchronous POST allows two hours by default, configurable through
`LTX_GENERATION_TIMEOUT_SECONDS` (60–7200). Node HTTP avoids a short default
fetch headers timeout. Dan reported that his successful 720p/10-second Mac
generation took over 30 minutes, so the default accommodates long local
inference. Authenticated `/api/generation/progress` is polled every
three seconds during inference. The existing production monitor's five-second
refresh shows the actual phase, percentage, `currentStep` and `totalSteps`.
Events also go to `HeartWordData/logs/media-generation-<project-id>.log` and
the take's metadata. Desktop logs supply only a narrow secondary diagnostic
after progress requests stop responding, never normal progress percentages.

Desktop has one active progress slot. HeartWord serializes its requests and
uses an atomic `.heartword-generation.lock` directory in the Mac inbox to
exclude other HeartWord processes. It holds when Desktop is already generating.
A timeout/lost response is not resubmitted: the input and remote lease remain
and the pipeline job is held for reconciliation. A process crash leaves its
active job for review too.

Recover by inspecting the local MP4/JSON, Mac output and Desktop status first.
Copy back completed output instead of regenerating it. After confirming no
generation still uses that input, remove only its matching UUID input and
owned inbox lock, then reconcile that exact `video_generation_jobs` row and
the retained candidate before resuming. Leases are never broken merely because
time elapsed.

Optional non-secret settings are `LTX_SSH_HOST`, `LTX_SSH_USER`, `LTX_INBOX_DIR`
and `LTX_GENERATION_TIMEOUT_SECONDS`. Defaults target
`danieljbrennan@192.168.77.2` and that user's `~/LTX-Inbox`. Ending-frame,
multiple-keyframe, supplied-audio and reference conditioning can extend this adapter
and the existing interfaces later; this path does not enable or simulate them.

The Desktop's [official generated API schema](https://github.com/Lightricks/LTX-Desktop/blob/main/frontend/generated/backend-openapi.json)
was checked for request/progress field names. Dan's proven local Fast matrix
controls validation; upstream schemas also describe other models/cloud modes.
