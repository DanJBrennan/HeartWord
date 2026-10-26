import { createHash, randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { GenerationProgress, GenerationResult, ShotRequest, VideoGenerationOptions, VideoProvider } from "../types.js";
import { LtxHttpError, ltxJson, redactLtxSecret } from "./http.js";
import { latestLogCommand, shellQuote, sharedLtxTransport, type LtxTransport } from "./transport.js";
import { prepareLtxVideoOutput } from "./output.js";

export const LTX_MODEL = "ltx-2.5-fast";
export const LTX_MAX_PROMPT_CHARACTERS = 5000;
export const LTX_AMBIENT_DIRECTION = "AUDIO AND PERFORMANCE RULE: Only natural environmental ambience consistent with the supplied image and scene, including appropriate nonverbal animal calls when requested. No human speech, dialogue, narration, spoken words, gibberish voices, singing, human vocals or music. People remain non-speaking; no visible talking or lip-sync performance. Character speech is supplied separately by HeartWord.";
export const LTX_DURATIONS = { "540p": [5, 6, 8, 10, 20], "720p": [5, 6, 8, 10], "1080p": [5] } as const;
export function validateLtxOptions(resolution: string, duration: number, fps: number): asserts resolution is keyof typeof LTX_DURATIONS {
  if (fps !== 24) throw new Error("Local LTX 2.5 Fast currently supports 24 fps in HeartWord.");
  if (!Object.hasOwn(LTX_DURATIONS, resolution) || !(LTX_DURATIONS[resolution as keyof typeof LTX_DURATIONS] as readonly number[]).includes(duration)) {
    throw new Error(`Unsupported LTX Fast request: ${resolution}, ${duration}s, ${fps} fps. Use 540p: 5/6/8/10/20s; 720p: 5/6/8/10s; 1080p: 5s.`);
  }
}

function requireToken() {
  const token = process.env.LTX_TOKEN?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error("LTX_TOKEN is missing or invalid. Supply the local Desktop backend session token in the HeartWord process environment; do not save it in project files.");
  return token;
}
function numeric(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
export function ltxProgress(raw: Record<string, unknown>): GenerationProgress {
  if (typeof raw.phase !== "string" || raw.phase.length > 100 || numeric(raw.progress ?? raw.percentage) === null) throw new Error("LTX progress response has no phase or percentage.");
  return { phase: raw.phase, percentage: numeric(raw.progress ?? raw.percentage), currentStep: numeric(raw.currentStep), totalSteps: numeric(raw.totalSteps), status: typeof raw.status === "string" ? raw.status : undefined };
}

function assetPath(root: string, path: string) {
  const assets = resolve(root, "assets");
  const absolute = isAbsolute(path) ? resolve(path) : resolve(assets, path);
  const rel = relative(assets, absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("LTX input/output must be within HeartWordData/assets.");
  return { absolute, relative: rel.replace(/\\/g, "/") };
}

// Desktop has one active generation/progress slot. Preserve FIFO within this
// process, with an atomic remote lease to exclude other HeartWord processes.
let queue: Promise<unknown> = Promise.resolve();
export class LtxVideoProvider implements VideoProvider {
  private readonly transport: LtxTransport;
  constructor(private readonly dependencies: { transport?: LtxTransport; dataDir?: string; sleep?: (ms: number) => Promise<void> } = {}) {
    this.transport = dependencies.transport ?? sharedLtxTransport();
  }
  async checkHealth(): Promise<Record<string, unknown>> {
    return (await this.ready(requireToken())).health;
  }
  private async ready(token: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const baseUrl = await this.transport.connect();
      try {
        const health = await ltxJson(baseUrl, "/health", token, 10_000);
        const fast = Array.isArray(health.models_status)
          ? health.models_status.find((model:unknown)=>model && typeof model==="object" && (model as {id?:unknown}).id==="fast") as {downloaded?:unknown}|undefined
          : undefined;
        const loadedFast = health.models_loaded === true && health.active_model === "fast";
        const downloadedLazyFast = health.models_loaded === false && health.active_model == null && fast?.downloaded === true;
        if (health.status !== "ok" || !(loadedFast || downloadedLazyFast))
          throw new LtxHttpError(503, "LTX Desktop is not ready: Fast must be loaded or downloaded for lazy loading, with no different active model.");
        return { baseUrl, health };
      } catch (error) {
        if (error instanceof LtxHttpError || attempt === 1) throw error;
        this.transport.reset(); // Only reconnect before submission; never resubmit a POST.
      }
    }
    throw new Error("LTX Desktop could not be reached.");
  }
  generateFinal(request: ShotRequest, opts: VideoGenerationOptions = {}): Promise<GenerationResult> {
    // Reject unsupported settings/missing credentials before queueing or SSH.
    validateLtxOptions(opts.resolution ?? "720p", opts.durationSeconds ?? 8, opts.fps ?? 24);
    requireToken();
    if (opts.audioMode !== undefined && opts.audioMode !== "ambient" && opts.audioMode !== "none") throw new Error("LTX audioMode must be ambient or none.");
    const run = queue.then(() => this.generate(request, opts));
    queue = run.catch(() => undefined);
    return run;
  }
  private async generate(request: ShotRequest, opts: VideoGenerationOptions): Promise<GenerationResult> {
    const token = requireToken();
    const timeoutSeconds = Number(process.env.LTX_GENERATION_TIMEOUT_SECONDS ?? 7200);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 7200) throw new Error("LTX_GENERATION_TIMEOUT_SECONDS must be between 60 and 7200.");
    const dataDir = this.dependencies.dataDir ?? getDataDir();
    const resolution = opts.resolution ?? "720p", duration = opts.durationSeconds ?? 8, fps = opts.fps ?? 24;
    const audioMode = opts.audioMode ?? "ambient";
    const prompt = `${request.prompt}\n\n${LTX_AMBIENT_DIRECTION}`;
    if(prompt.length>LTX_MAX_PROMPT_CHARACTERS)throw new Error(`LTX prompt exceeds the ${LTX_MAX_PROMPT_CHARACTERS}-character text-encoding limit. Compile focused shot prose before submission; do not truncate approved direction.`);
    const seed = opts.seed ?? randomInt(0, 2147483647);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error("LTX seed must be an integer between 0 and 2147483647.");
    if (!request.prompt.trim()) throw new Error("LTX needs a nonempty shot prompt.");
    let source = opts.startFrame?.path;
    if (!source) source = (getDb().prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(request.shotId) as { result_asset_path: string } | undefined)?.result_asset_path;
    if (!source) throw new Error(`LTX needs an accepted start keyframe for shot ${request.shotId}.`);
    const input = assetPath(dataDir, source);
    if (!existsSync(input.absolute) || !statSync(input.absolute).isFile() || statSync(input.absolute).size === 0) throw new Error("LTX source keyframe is missing or empty.");
    const suffix = extname(input.absolute).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(suffix)) throw new Error("LTX keyframe must be PNG, JPEG, or WebP.");
    const endInput = opts.endFrame ? assetPath(dataDir, opts.endFrame.path) : undefined;
    if (endInput && (!existsSync(endInput.absolute) || !statSync(endInput.absolute).isFile() || statSync(endInput.absolute).size === 0 ||
        ![".png", ".jpg", ".jpeg", ".webp"].includes(extname(endInput.absolute).toLowerCase()))) throw new Error("LTX ending keyframe is missing, empty or not PNG, JPEG or WebP.");
    const hashImage=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
    const inputHash=hashImage(input.absolute),endHash=endInput ? hashImage(endInput.absolute) : undefined;
    const generationId = randomUUID();
    const fileId = `${request.shotId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}-ltx-${generationId}`;
    // Desktop only needs a unique inbox filename. Keep the descriptive shot
    // label in the local take and metadata; short Mac paths match the proven
    // diagnostic request and avoid carrying draft/shot UUIDs into its loader.
    const remoteFileId = `heartword-${generationId}`;
    const output = assetPath(dataDir, opts.outputPath ?? `generated/video/${fileId}.mp4`);
    if (existsSync(output.absolute)) throw new Error("LTX output already exists. Choose a new output path to preserve the retained take.");
    const ambientOutput = assetPath(dataDir, `${output.absolute}.ambience.wav`);
    if (audioMode === "ambient" && existsSync(ambientOutput.absolute)) throw new Error("LTX ambient output already exists. Choose a new output path.");
    if (extname(output.absolute).toLowerCase() !== ".mp4") throw new Error("LTX output must have an .mp4 extension.");
    mkdirSync(dirname(output.absolute), { recursive: true });
    const metadataPath = `${output.absolute}.json`;
    if (existsSync(metadataPath)) throw new Error("LTX output metadata already exists. Reconcile that retained attempt or choose a new output path.");
    const metadata: Record<string, unknown> = { generationId, shotId: request.shotId, provider: "ltx_local", model: LTX_MODEL, prompt, requestedPrompt: request.prompt, seed, resolution, durationSeconds: duration, fps, sourceKeyframe: input.relative, sourceKeyframeSha256:inputHash, localOutputPath: output.absolute, audio: audioMode === "ambient", audioMode, status: "preparing", startedAt: new Date().toISOString() };
    const started = Date.now();
    const save = () => writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    const emit = (progress: GenerationProgress) => {
      const safe = { ...progress, phase: redactLtxSecret(progress.phase, token), status: progress.status ? redactLtxSecret(progress.status, token) : undefined, diagnostic: progress.diagnostic ? redactLtxSecret(progress.diagnostic, token) : undefined };
      metadata.progress = safe;
      save();
      opts.onProgress?.(safe);
    };
    save();
    let remoteInput: string | undefined, remoteEndInput: string | undefined, lease: string | undefined, submitted = false, responseReceived = false;
    const tempOutput = `${output.absolute}.${generationId}.part`;
    const preparedOutput = `${tempOutput}.video.mp4`;
    const tempAmbient = `${tempOutput}.ambience.wav`;
    let ambientAudio: { path: string } | undefined;
    try {
      emit({ phase: "connecting", percentage: null, currentStep: null, totalSteps: null });
      const { baseUrl } = await this.ready(token);
      const home = await this.transport.remote('printf "%s" "$HOME"');
      const inbox = process.env.LTX_INBOX_DIR?.trim() || `${home}/LTX-Inbox`;
      if (!inbox.startsWith("/") || /[\r\n\0]/.test(inbox)) throw new Error("LTX_INBOX_DIR must be an absolute Mac directory.");
      lease = `${inbox}/.heartword-generation.lock`;
      try { await this.transport.remote(`mkdir -p ${shellQuote(inbox)} && mkdir ${shellQuote(lease)}`); }
      catch { throw new Error(`Cannot acquire the LTX inbox lease at ${lease}. Check SSH and inbox access; another HeartWord job or an uncertain prior submission may own the lease. Reconcile it before retrying.`); }
      // Store only the unique ID, never credentials. A retained lease on an
      // uncertain response is deliberate, so another process cannot duplicate it.
      await this.transport.remote(`printf '%s' ${shellQuote(generationId)} > ${shellQuote(`${lease}/owner`)}`);
      const progress = await ltxJson(baseUrl, "/api/generation/progress", token, 5000);
      if (progress.status === "running") throw new Error("LTX Desktop is already generating. Wait for its current job to finish.");
      remoteInput = `${inbox}/${remoteFileId}${suffix}`;
      metadata.remoteInputPath = remoteInput;
      emit({ phase: "uploading_keyframe", percentage: null, currentStep: null, totalSteps: null });
      await this.transport.upload(input.absolute, remoteInput);
      if (endInput) {
        remoteEndInput = `${inbox}/${remoteFileId}-end${extname(endInput.absolute).toLowerCase()}`;
        metadata.sourceEndKeyframe = endInput.relative;
        metadata.sourceEndKeyframeSha256 = endHash;
        metadata.remoteEndInputPath = remoteEndInput;
        await this.transport.upload(endInput.absolute, remoteEndInput);
      }
      const body = { prompt, resolution, model: "fast", cameraMotion: "none", negativePrompt: "human speech, dialogue, narration, words, gibberish voices, singing, human vocals, music, visible talking", duration, fps, audio: audioMode === "ambient", imagePath: remoteInput, lastImagePath: remoteEndInput ?? null, keyframes: [], audioPath: null, aspectRatio: "16:9", seed, loras: [] };
      metadata.request = body;
      if(hashImage(input.absolute)!==inputHash || (endInput && hashImage(endInput.absolute)!==endHash))throw new Error("LTX input image changed during upload; prepare a new request.");
      request.authorizeSubmission?.();
      // A production revision check can take long enough for Desktop's SSH
      // forward to close while idle. Revalidate and reconnect before the only
      // generation POST; never retry a POST after an uncertain submission.
      const submissionUrl = (await this.ready(token)).baseUrl;
      metadata.productionRevision = request.productionRevision;
      metadata.status = "running";
      emit({ phase: "submitted", percentage: null, currentStep: null, totalSteps: null });
      submitted = true;
      let finished = false;
      // Attach both handlers immediately, so polling cannot create an unhandled rejection.
      const generation = ltxJson(submissionUrl, "/api/generate", token, timeoutSeconds * 1000, body).then(value => {
        responseReceived = true; return value;
      }, error => { if (error instanceof LtxHttpError) responseReceived = true; throw error; });
      const completion = generation.then(value => { finished = true; return { value }; }, error => { finished = true; return { error }; });
      const sleep = this.dependencies.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
      let pollFailures = 0;
      while (!finished) {
        // Wake immediately on completion instead of making delivery wait for the poll timer.
        await Promise.race([completion, sleep(3000)]);
        if (finished) break;
        try {
          emit(ltxProgress(await ltxJson(submissionUrl, "/api/generation/progress", token, 2000)));
          pollFailures = 0;
        } catch (error) {
          pollFailures++;
          emit({ phase: "progress_unavailable", percentage: null, currentStep: null, totalSteps: null, diagnostic: (error as Error).message });
          // Secondary diagnostic only. Read only known progress lines, never
          // arbitrary log content or token/settings lines, and do not invent %.
          if (pollFailures === 2 || pollFailures % 10 === 0) {
            try {
              const diagnostic = await this.transport.remote(`${latestLogCommand} tail -80 "$latest" | grep -E 'Pipeline load:|Text encoding |Total generation:|Inference:' | tail -3`);
              if (diagnostic) emit({ phase: "progress_unavailable", percentage: null, currentStep: null, totalSteps: null, diagnostic: diagnostic.slice(0, 1000) });
            } catch { /* The synchronous response remains authoritative. */ }
          }
        }
      }
      const completed = await completion;
      if ("error" in completed) throw completed.error;
      const result = completed.value;
      if (result.status !== "complete" || typeof result.video_path !== "string" || !result.video_path.startsWith("/") || /[\r\n\0]/.test(result.video_path)) throw new Error(`LTX did not complete successfully (status ${String(result.status)}).`);
      metadata.remoteOutputPath = result.video_path;
      emit({ phase: "downloading_output", percentage: 100, currentStep: null, totalSteps: null });
      await this.transport.download(result.video_path, tempOutput);
      if (!existsSync(tempOutput) || !statSync(tempOutput).isFile() || statSync(tempOutput).size === 0) throw new Error("LTX returned no nonempty local MP4; retained Mac output path is in the metadata.");
      emit({ phase: "preparing_output", percentage: 100, currentStep: null, totalSteps: null });
      const properties = await prepareLtxVideoOutput(tempOutput, preparedOutput, { audioMode, ambientOutput: tempAmbient });
      metadata.output = properties;
      if (audioMode === "ambient" && properties.backendAudioIncluded) {
        renameSync(tempAmbient, ambientOutput.absolute);
        ambientAudio = { path: ambientOutput.relative };
        metadata.ambientAudio = { ...ambientAudio, status: "needs_review" };
      }
      renameSync(preparedOutput, output.absolute);
      metadata.status = "complete";
      metadata.elapsedMs = Date.now() - started;
      emit({ phase: "complete", percentage: 100, currentStep: null, totalSteps: null, status: "complete" });
      return { status: "accepted", media: { path: output.relative }, ...(ambientAudio ? { ambientAudio } : {}), cost: { usd: 0 }, provenance: { provider: "ltx_local", model: LTX_MODEL, prompt }, metadata: { ...metadata, metadataPath } };
    } catch (error) {
      metadata.status = submitted && !responseReceived ? "submission_uncertain" : "failed";
      metadata.elapsedMs = Date.now() - started;
      metadata.error = redactLtxSecret((error as Error).message, token);
      save();
      throw new Error(String(metadata.error) + (metadata.status === "submission_uncertain" ? " Submission may still be running on the Mac. Reconcile its output before retrying; the input and remote lease are retained." : ""));
    } finally {
      rmSync(tempOutput, { force: true });
      rmSync(preparedOutput, { force: true });
      rmSync(tempAmbient, { force: true });
      if (!submitted || responseReceived) {
        if (remoteInput) await this.transport.remote(`rm -f ${shellQuote(remoteInput)}`).catch(() => undefined);
        if (remoteEndInput) await this.transport.remote(`rm -f ${shellQuote(remoteEndInput)}`).catch(() => undefined);
        // Remove only a lease this generation owns; failed mkdir never grants ownership.
        if (lease) await this.transport.remote(`if [ "$(cat ${shellQuote(`${lease}/owner`)} 2>/dev/null)" = ${shellQuote(generationId)} ]; then rm -f ${shellQuote(`${lease}/owner`)}; rmdir ${shellQuote(lease)}; fi`).catch(() => undefined);
      }
    }
  }
}
