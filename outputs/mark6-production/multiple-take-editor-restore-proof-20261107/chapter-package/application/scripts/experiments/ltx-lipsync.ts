/** Isolated feasibility experiment. Never opens a production database. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { getDataDir } from "../../src/db/client.js";
import { SshLtxTransport, shellQuote, childEnvironment } from "../../src/providers/ltx/transport.js";
import { ltxJson, redactLtxSecret } from "../../src/providers/ltx/http.js";

export const cases = {
  baseline: { seed: 42, audio: "speech.wav", delayMs: 0 },
  repeat: { seed: 314, audio: "speech.wav", delayMs: 0 },
  delayed: { seed: 42, audio: "speech-delayed.wav", delayMs: 750 },
  clean: { seed: 314, audio: "speech-at-zero.wav", delayMs: 0 },
  performance: { seed: 42, audio: "performance.wav", delayMs: 0 },
} as const;
export type CaseName = keyof typeof cases;
export const prompt = "A steady head-and-shoulders speaking portrait of the single Papuan man in the supplied approved canon headshot. Preserve his exact face, shoulder-length hair, beard, cream clothing, indigo bands and neutral studio background. Keep the full face and hair visible within a landscape 16:9 composition. He speaks naturally in precise synchrony with the supplied Hatam audio, preserving its rhythm and pauses. Calm, gentle reassurance, with a restrained warm expression. Natural subtle head movement, stable camera, realistic lips, jaw and teeth. Resting mouth during silence. No extra people, subtitles, music or added dialogue.";
export const cleanPrompt = "A single continuous photorealistic studio portrait of the man in the supplied approved canon headshot. His face, shoulder-length dark hair, beard, skin tone, cream tunic and indigo clothing bands retain the reference identity and appearance. The neutral light gray studio backdrop stays simple and uniform. The camera is locked, showing his head and shoulders in a landscape 16:9 frame. His entire face is visible. He speaks with calm, gentle reassurance, following only the supplied audio performance. His lips and jaw articulate each sound naturally in time with that recording; his expression remains restrained, with subtle breathing and blinking. Speech begins immediately at the first audible sound. After the recorded words finish, his lips settle closed and he remains quietly attentive for the rest of the shot. There is no additional speech or vocal performance. The picture contains only the man, his clothing and the plain backdrop. Every frame is clean, unlabelled photographic footage, including the entire lower portion of the image. Absolutely no written characters, captions, subtitles, translations, transcription, titles, lettering, logos, watermarks, graphics or text overlays appear at any moment.";
export interface PerformanceOptions { durationSeconds: number; prompt: string }
export interface ContinuityFrame { sourceVideoPath: string; sourceVideoSha256: string; retainedFrames: number; frameIndex: number }
export function validateContinuityFrame(frame: ContinuityFrame, nativeFrames: number) {
  if (!frame || typeof frame.sourceVideoPath !== "string" || !frame.sourceVideoPath.trim() || !/^[a-f0-9]{64}$/.test(frame.sourceVideoSha256) || !Number.isInteger(nativeFrames) || nativeFrames < 1 || !Number.isInteger(frame.retainedFrames) || frame.retainedFrames < 1 || frame.retainedFrames > nativeFrames || frame.frameIndex !== frame.retainedFrames - 1) throw new Error("Continuity reference must identify the last retained frame of a pinned source video, not its padded tail.");
}
export function shortReviewFrames(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || !((durationSeconds >= 3 && durationSeconds <= 4) || durationSeconds === 5)) throw new Error("Short excerpts must be three to four seconds, or the explicit five-second control.");
  return Math.ceil(durationSeconds * 24 - 1e-9);
}
export function buildRequest(name: CaseName, imagePath: string, audioPath: string, options?: PerformanceOptions) {
  if (options && (![5, 6, 8, 10].includes(options.durationSeconds) || !options.prompt.trim() || options.prompt.length > 5000)) throw new Error("Invalid bounded performance duration/prompt.");
  return { prompt: options?.prompt ?? (name === "clean" ? cleanPrompt : prompt), resolution: "720p", model: "fast", duration: options?.durationSeconds ?? 6, fps: 24,
    aspectRatio: "16:9", cameraMotion: "none", audio: true, imagePath, audioPath,
    lastImagePath: null, keyframes: [], loras: [], seed: cases[name].seed,
    negativePrompt: name === "clean" ? "subtitles, captions, closed captions, burned-in text, lettering, words, translations, transcription, title cards, labels, logos, watermarks, typography, overlay graphics, lower thirds, written symbols, premature talking, speaking during silence, face distortion, exaggerated mouth, identity change, camera movement" : "face distortion, identity change, exaggerated mouth, extra people, subtitles, camera movement" };
}
export function assertLocal(health: Record<string, unknown>, policy: Record<string, unknown>, settings: Record<string, unknown>) {
  // /health reports only a resident scene VideoPipelineState. A2V uses a
  // different GPU state and loads its downloaded pipeline on demand.
  const downloadedFast = Array.isArray(health.models_status) && health.models_status.some(model => model?.id === "fast" && model.downloaded === true);
  const residentFast = health.models_loaded === true && health.active_model === "fast";
  if (health.status !== "ok" || (!residentFast && !downloadedFast)) throw new Error("Load local LTX Fast before running the experiment.");
  const preferences = [settings.userPrefersLtxApiVideoGenerations, settings.user_prefers_ltx_api_video_generations].filter(value => value !== undefined);
  if (policy.force_api_generations !== false || preferences.length === 0 || preferences.some(value => value !== false)) throw new Error("Local-only execution is not verified. Disable cloud video generation in LTX Desktop and retry preflight.");
}
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const json = (path: string, data: unknown, fresh = false) => writeFileSync(path, JSON.stringify(data, null, 2), { flag: fresh ? "wx" : "w" });
function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args], { env: childEnvironment(), windowsHide: true, stdio: "pipe" });
}
function probe(path: string) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { env: childEnvironment(), windowsHide: true, encoding: "utf8" }));
}
function review(root: string, name: CaseName) {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const duration = String(manifest.reviewDurationSeconds ?? manifest.requestOptions?.durationSeconds ?? 6);
  const dir = join(root, name), raw = join(dir, "raw.mp4"), audio = join(root, name === "clean" ? "speech.wav" : cases[name].audio);
  let picture = raw;
  if (name === "clean") {
    picture = join(dir, "picture-with-resting-lead.mp4");
    if (!existsSync(picture)) {
      const stream = probe(raw).streams.find((s: {codec_type:string}) => s.codec_type === "video");
      const width = Number(stream.width), height = Number(stream.height);
      ffmpeg(["-loop", "1", "-framerate", "24", "-i", join(root, "reference.png"), "-i", raw,
        "-filter_complex", `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=24,trim=duration=0.5,setpts=PTS-STARTPTS[s];[1:v]setsar=1,fps=24,trim=duration=5.5,setpts=PTS-STARTPTS[g];[s][g]concat=n=2:v=1:a=0[v]`,
        "-map", "[v]", "-t", "6", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", picture]);
    }
  }
  if (!existsSync(join(dir, "review.mp4"))) {
    // Clean take restores the removed half-second of silence with a resting
    // canon frame. All other cases retain native picture timing.
    const videoOptions = manifest.reviewDurationSeconds ? ["-frames:v", String(shortReviewFrames(Number(duration))), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"] : ["-c:v", "copy"];
    ffmpeg(["-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-t", duration, ...videoOptions, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", join(dir, "review.mp4")]);
  }
  if (!existsSync(join(dir, "compare-canon.mp4"))) {
    const canon = join(root, existsSync(join(root, "canon-reference.png")) ? "canon-reference.png" : "reference.png");
    ffmpeg(["-loop", "1", "-framerate", "24", "-i", canon, "-i", picture, "-i", audio,
      "-filter_complex", "[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[k];[1:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[l];[k][l]hstack[v]",
      "-map", "[v]", "-map", "2:a:0", "-t", duration, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", join(dir, "compare-canon.mp4")]);
  }
  const decoded = execFileSync("ffmpeg", ["-v", "error", "-i", raw, "-f", "null", "-"], { env: childEnvironment(), windowsHide: true, encoding: "utf8", stdio: "pipe" });
  json(join(dir, "verification.json"), { rawSha256: hash(raw), inputAudioSha256: hash(audio), raw: probe(raw), review: probe(join(dir, "review.mp4")), decodeStdout: decoded,
    soundtrack: "Review uses supplied WAV encoded to AAC, never generated voice. WAV retained losslessly. Native output remains in raw.mp4.",
    pictureTiming: name === "clean" ? "A2V received the complete speech at t=0. Review restores 0.500s of closed-mouth canon picture before generated frame 0 and uses the unchanged original speech.wav. No voice words or source speed changed. Raw generation retained independently." : "Native picture timing unchanged.",
    comparison: "Static approved canon headshot left, LTX right. The still is an identity reference, not a lip-sync baseline. Judge sync against the supplied Hatam speech.",
    verdict: "Pending Dan and native Hatam review; technical validity is not lip-sync adequacy." });
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { root: { type: "string" }, case: { type: "string", default: "baseline" }, "source-evidence": {type:"string"}, help: { type: "boolean" } } });
  const mode = positionals[0];
  if (values.help || !mode) { console.log("npm run ltx:lipsync -- prepare|prepare-performance|run|review [--case baseline|repeat|delayed|clean|performance] [--root PATH] [--source-evidence PATH]\nPrepare is local and requires no token. Run submits exactly one local A2V take. Never automatically retries."); return; }
  const root = resolve(values.root ?? join(getDataDir(), "prototypes", "ltx-lipsync-mark5-canon-20261029-stereo"));
  const name = values.case as CaseName;
  if (!Object.hasOwn(cases, name)) throw new Error("Unknown --case. Use baseline, repeat, delayed, clean or performance.");
  if (mode === "prepare-performance") {
    if (existsSync(root)) throw new Error(`Experiment already exists: ${root}`);
    if (!values["source-evidence"]) throw new Error("Supply the read-only verified --source-evidence JSON packet.");
    const evidence = JSON.parse(readFileSync(resolve(values["source-evidence"]), "utf8"));
    const shortExcerpt = evidence.shortExcerpt as {startSeconds:number;durationSeconds:number} | undefined;
    if (shortExcerpt) {
      if (!Number.isFinite(shortExcerpt.startSeconds) || shortExcerpt.startSeconds < 0) throw new Error("Short excerpts require a nonnegative source start.");
      shortReviewFrames(shortExcerpt.durationSeconds);
    }
    const generationDuration = shortExcerpt ? 5 : 10;
    const requestOptions: PerformanceOptions = {durationSeconds:generationDuration,prompt:evidence.performancePrompt};
    buildRequest("performance", "/reference.png", "/performance.wav", requestOptions);
    if (evidence.portrait.status !== "approved" || evidence.portrait.canon_status !== "approved" || evidence.portrait.region !== "Papuan" || evidence.audio.voice_version_id !== evidence.portrait.character_version_id) throw new Error("Approved Papuan picture/voice-version evidence is required.");
    const image = join(getDataDir(), "assets", evidence.portrait.path), source = join(getDataDir(), "assets", evidence.audio.source_path);
    if (hash(image) !== evidence.portrait.sha256 || hash(source) !== evidence.audio.sha256) throw new Error("Pinned source changed.");
    const continuityFrame = evidence.continuityFrame as ContinuityFrame | undefined;
    if (continuityFrame) {
      const previous = resolve(continuityFrame.sourceVideoPath);
      if (hash(previous) !== continuityFrame.sourceVideoSha256) throw new Error("Pinned continuity source changed.");
      const stream = probe(previous).streams.find((s: {codec_type:string}) => s.codec_type === "video");
      validateContinuityFrame(continuityFrame, Number(stream?.nb_frames));
      if (stream.width !== 1280 || stream.height !== 704) throw new Error("Continuity experiment expects native 1280x704 pictures.");
    }
    const sourceStream = probe(source).streams.find((s: {codec_type:string}) => s.codec_type === "audio");
    const sourceSeconds = Number(probe(source).format.duration), channels = Number(sourceStream.channels);
    if (!(sourceSeconds > 0 && sourceSeconds <= 10) || ![1,2].includes(channels)) throw new Error("Complete source performance must fit ten seconds and be mono/stereo.");
    if (shortExcerpt && shortExcerpt.startSeconds + shortExcerpt.durationSeconds > sourceSeconds) throw new Error("Short excerpt exceeds its retained source.");
    mkdirSync(root, {recursive:true});
    copyFileSync(image, join(root, "reference.png")); copyFileSync(source, join(root, "original-speech.mp3"));
    if (continuityFrame) {
      renameSync(join(root, "reference.png"), join(root, "canon-reference.png"));
      copyFileSync(resolve(continuityFrame.sourceVideoPath), join(root, "continuity-source.mp4"));
      ffmpeg(["-i", join(root, "continuity-source.mp4"), "-vf", `select=eq(n\\,${continuityFrame.frameIndex})`, "-frames:v", "1", join(root, "continuity-source-frame.png")]);
      // Preserve native coordinates. Caption-band edge padding is entirely
      // outside the delivered y<550 crop; never crop/zoom the carried face again.
      ffmpeg(["-i", join(root, "continuity-source-frame.png"), "-vf", "crop=1280:550:0:0,pad=1280:704:0:0:color=black,fillborders=bottom=154:mode=smear", "-frames:v", "1", join(root, "reference.png")]);
    }
    ffmpeg(["-i", source, "-c:a", "pcm_s16le", join(root, "original-speech.wav")]);
    const sampleRate = Number(sourceStream.sample_rate);
    const excerptFilter = shortExcerpt ? `atrim=start_sample=${Math.round(shortExcerpt.startSeconds*sampleRate)}:end_sample=${Math.round((shortExcerpt.startSeconds+shortExcerpt.durationSeconds)*sampleRate)},asetpts=PTS-STARTPTS,` : "";
    ffmpeg(["-i", join(root, "original-speech.wav"), "-af", `${excerptFilter}${channels === 1 ? "pan=stereo|c0=c0|c1=c0," : ""}apad`, "-t", String(generationDuration), "-c:a", "pcm_s16le", join(root, "performance.wav")]);
    json(join(root, "source-evidence.json"), evidence, true);
    const files = Object.fromEntries(["reference.png","original-speech.mp3","original-speech.wav","performance.wav","source-evidence.json",...(continuityFrame ? ["canon-reference.png","continuity-source.mp4","continuity-source-frame.png"] : [])].map(f=>[f,hash(join(root,f))]));
    json(join(root, "manifest.json"), {experiment:"mark5-performance-v1",createdAt:new Date().toISOString(),passage:evidence.passage,characterName:evidence.characterName,textHatam:evidence.textHatam,english:evidence.english,textIsWholeLineContext:!!shortExcerpt,requestOptions,reviewDurationSeconds:shortExcerpt?.durationSeconds,shortExcerpt,files,sourceSeconds,sourceChannels:channels,submittedChannels:2,referenceProvenance:continuityFrame ? {kind:"derived_previous_last_retained_frame",...continuityFrame,approvedCanonSha256:evidence.portrait.sha256,captionRemoval:"Top 1280x550 unchanged; bottom 154px edge-padded outside delivery crop. Native coordinates preserved; canon not modified or reapproved."} : {kind:"approved_canon"},timing:shortExcerpt ? "Original PCM excerpt only; no inserted lead, holds, offsets or speed changes. Tail silence fills the five-second backend minimum where necessary; review takes only the requested excerpt duration." : "No added lead, no cuts, no offsets, no speed changes. Complete source performance retained; only tail silence added to ten seconds."}, true);
    console.log(`Prepared original-timing performance: ${root}`); return;
  }
  if (mode === "prepare") {
    if (existsSync(root)) throw new Error(`Experiment already exists: ${root}. Reuse it or choose a fresh --root.`);
    const evidence = JSON.parse(readFileSync(new URL("./ltx-lipsync-mark5-source.json", import.meta.url), "utf8"));
    const inputs = { image: join(getDataDir(), "assets", evidence.portrait.path), audio: join(getDataDir(), "assets", evidence.audio.source_path) };
    for (const path of Object.values(inputs)) if (!existsSync(path)) throw new Error(`Missing retained comparison input: ${path}`);
    if (hash(inputs.image) !== evidence.portrait.sha256 || hash(inputs.audio) !== evidence.audio.sha256) throw new Error("Pinned Mark 5 canon/audio source changed; inspect before preparing.");
    mkdirSync(root, { recursive: true });
    copyFileSync(inputs.image, join(root, "reference.png"));
    copyFileSync(inputs.audio, join(root, "original-speech.mp3"));
    ffmpeg(["-i", inputs.audio, "-c:a", "pcm_s16le", join(root, "original-speech.wav")]);
    const duration = Number(probe(join(root, "original-speech.wav")).format.duration);
    if (!(duration > 0 && duration <= 4.75)) throw new Error("Complete utterance does not fit the six-second timing control without truncation.");
    // Installed A2V audio encoder requires stereo; duplicate mono exactly in
    // both channels rather than allowing an upmix gain change.
    const channels = Number(probe(join(root, "original-speech.wav")).streams[0].channels);
    const stereo = channels === 1 ? "pan=stereo|c0=c0|c1=c0," : "";
    if (channels !== 1 && channels !== 2) throw new Error("Experiment speech must be mono or stereo.");
    ffmpeg(["-i", join(root, "original-speech.wav"), "-af", `${stereo}adelay=500:all=1,apad`, "-t", "6", "-c:a", "pcm_s16le", join(root, "speech.wav")]);
    ffmpeg(["-i", join(root, "original-speech.wav"), "-af", `${stereo}adelay=1250:all=1,apad`, "-t", "6", "-c:a", "pcm_s16le", join(root, "speech-delayed.wav")]);
    ffmpeg(["-i", join(root, "original-speech.wav"), "-af", `${stereo}apad`, "-t", "6", "-c:a", "pcm_s16le", join(root, "speech-at-zero.wav")]);
    json(join(root, "source-evidence.json"), evidence, true);
    json(join(root, "manifest.json"), { experiment: "mark5-canon-v1", createdAt: new Date().toISOString(), status: "prepared; no generation submitted", passage: evidence.passage, textHatam: evidence.textHatam, english: evidence.english, purpose: "Test local supplied-audio speaking video from the Mark 5 approved canon headshot.",
      source: Object.fromEntries(Object.entries(inputs).map(([key, path]) => [key, { path, sha256: hash(path) }])),
      files: Object.fromEntries(["reference.png", "original-speech.mp3", "original-speech.wav", "speech.wav", "speech-delayed.wav", "speech-at-zero.wav", "source-evidence.json"].map(file => [file, hash(join(root, file))])), cases, prompt, cleanPrompt,
      sourceTiming: { originalSourceStartMs: evidence.original.start_ms, originalSourceEndMs: evidence.original.end_ms, castDurationSeconds: duration, baselineLeadMs: 500, delayedLeadMs: 1250, preservedCompleteUtterance: true, sourceChannels: channels, submittedChannels: 2, monoConversion: "identical PCM samples duplicated to left and right" },
      approval: "Approved Papuan Jesus v5 headshot and Mark 5 source-mapped cast master; experiment results remain unapproved candidates." }, true);
    copyFileSync(resolve("docs/production/LTX_LIPSYNC_EXPERIMENT.md"), join(root, "README.md"));
    writeFileSync(join(root, "scores.csv"), "case,reviewer,mouth_timing_1_to_5,naturalness_1_to_5,identity_1_to_5,pauses_1_to_5,usable_yes_no,offset_start_ms,offset_end_ms,notes\nbaseline,,,,,,,,,,\nrepeat,,,,,,,,,,\ndelayed,,,,,,,,,,\n");
    console.log(`Prepared experiment: ${root}`); return;
  }
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (manifest.experiment !== "mark5-canon-v1" && manifest.experiment !== "mark5-performance-v1") throw new Error("This runner requires the revised Mark 5 canon experiment. Prepare a fresh folder; do not run the superseded Luma package.");
  if (manifest.experiment === "mark5-performance-v1" && name !== "performance") throw new Error("This packet supports only --case performance.");
  if (!manifest.files[cases[name].audio]) throw new Error("This case needs newly prepared pinned audio. Use prepare with a fresh --root.");
  for (const [file, expected] of Object.entries(manifest.files)) if (hash(join(root, file)) !== expected) throw new Error(`Pinned input changed: ${file}`);
  if (mode === "review") { review(root, name); console.log(join(root, name, "compare-canon.mp4")); return; }
  if (mode !== "run") throw new Error("Use prepare, run or review.");
  const token = process.env.LTX_TOKEN?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error("Set the current LTX_TOKEN in this shell (see README). No generation was submitted.");
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`Retained attempt exists: ${dir}. Review/recover it; this runner never resubmits a case.`);
  const transport = new SshLtxTransport();
  let lease: string | undefined, submitted = false, complete = false;
  const id = randomUUID();
  let state: Record<string, unknown> = { id, case: name, seed: cases[name].seed, status: "preflight", startedAt: new Date().toISOString() };
  try {
    const url = await transport.connect();
    const health = await ltxJson(url, "/health", token, 10000);
    const policy = await ltxJson(url, "/api/runtime-policy", token, 10000);
    const settings = await ltxJson(url, "/api/settings", token, 10000);
    assertLocal(health, policy, settings);
    const progress = await ltxJson(url, "/api/generation/progress", token, 5000);
    if (progress.status === "running") throw new Error("LTX is busy. No experiment submitted.");
    const home = await transport.remote('printf "%s" "$HOME"');
    const inbox = `${home}/LTX-Inbox`;
    const lock = `${inbox}/.heartword-generation.lock`;
    await transport.remote(`mkdir -p ${shellQuote(inbox)} && mkdir ${shellQuote(lock)}`);
    lease = lock;
    await transport.remote(`printf '%s' ${shellQuote(id)} > ${shellQuote(`${lock}/owner`)}`);
    mkdirSync(dir);
    const image = `${inbox}/lipsync-${id}.png`, audio = `${inbox}/lipsync-${id}.wav`;
    await transport.upload(join(root, "reference.png"), image);
    await transport.upload(join(root, cases[name].audio), audio);
    // Reject changes between the manifest check and upload; local-only mode must
    // remain selected in Desktop throughout the run (do not use its UI concurrently).
    for (const file of ["reference.png", cases[name].audio]) if (hash(join(root, file)) !== manifest.files[file]) throw new Error("Input changed during upload.");
    const request = buildRequest(name, image, audio, manifest.requestOptions);
    state = { ...state, request, remoteInputs: [image, audio], lease, status: "submitted", localOnly: true, apiCostUsd: 0 };
    json(join(dir, "attempt.json"), state, true);
    submitted = true;
    console.log(`Submitted ${name}; local 720p/24fps/${request.duration}s. Progress is saved every 5s. Inference may take tens of minutes.`);
    let done = false;
    const pending = ltxJson(url, "/api/generate", token, 7200000, request).then(value => ({ value }), error => ({ error })).finally(() => { done = true; });
    while (!done) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([pending, new Promise<void>(r => { timer = setTimeout(r, 5000); })]);
      clearTimeout(timer);
      if (done) break;
      try {
        const p = await ltxJson(url, "/api/generation/progress", token, 3000);
        state.progress = { at: new Date().toISOString(), status: p.status, phase: p.phase, progress: p.progress, id: p.id };
        json(join(dir, "attempt.json"), state);
        console.log(JSON.stringify(state.progress));
      } catch { console.log("Progress unavailable; waiting for original request. No retry."); }
    }
    const response = await pending;
    if ("error" in response) throw response.error;
    const result = response.value;
    if (result.status !== "complete" || typeof result.video_path !== "string" || !result.video_path.startsWith("/") || /[\r\n\0]/.test(result.video_path)) throw new Error("LTX did not return a completed absolute video path. Reconcile this attempt manually.");
    complete = true;
    state.status = "generated"; state.remoteOutputPath = result.video_path;
    json(join(dir, "attempt.json"), state);
    await transport.download(result.video_path, join(dir, "raw.part.mp4"));
    probe(join(dir, "raw.part.mp4"));
    renameSync(join(dir, "raw.part.mp4"), join(dir, "raw.mp4"));
    review(root, name);
    state.status = "ready_for_review"; state.finishedAt = new Date().toISOString();
    json(join(dir, "attempt.json"), state);
    console.log(`Ready: ${join(dir, "compare-canon.mp4")}`);
  } catch (error) {
    state.status = submitted && !complete ? "held_reconcile_before_retry" : "failed_or_needs_local_recovery";
    state.error = redactLtxSecret(error instanceof Error ? error.message : "Experiment failed", token);
    if (existsSync(dir)) json(join(dir, "attempt.json"), state);
    throw new Error(String(state.error));
  } finally {
    // Retain inputs and remote output for reproducibility. Never break a lease
    // after a submitted request with uncertain completion.
    if (lease && (!submitted || complete)) {
      try { await transport.remote(`test "$(cat ${shellQuote(`${lease}/owner`)})" = ${shellQuote(id)} && rm ${shellQuote(`${lease}/owner`)} && rmdir ${shellQuote(lease)}`); } catch { console.error("Owned lease needs manual reconciliation; see attempt.json."); }
    }
    transport.reset();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
