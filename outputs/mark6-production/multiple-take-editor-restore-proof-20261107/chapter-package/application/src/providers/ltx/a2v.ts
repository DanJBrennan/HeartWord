import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ltxJson, redactLtxSecret } from "./http.js";
import { SshLtxTransport, shellQuote, type LtxTransport } from "./transport.js";

export function assertLocalA2v(health: Record<string, any>, policy: Record<string, any>, settings: Record<string, any>) {
  const available = health.models_loaded === true && health.active_model === "fast" ||
    Array.isArray(health.models_status) && health.models_status.some((m: any) => m.id === "fast" && m.downloaded === true);
  const preferences = [settings.userPrefersLtxApiVideoGenerations, settings.user_prefers_ltx_api_video_generations].filter(v => v !== undefined);
  if (health.status !== "ok" || !available) throw new Error("Local LTX Fast is not available for speaking generation.");
  if (policy.force_api_generations !== false || !preferences.length || preferences.some(v => v !== false)) throw new Error("Local-only LTX speaking execution is not verified; no cloud fallback is permitted.");
}

/** One padded five-second local inference container. The stage owns exact
 * speech partitioning, retained frames, last-frame chaining and full-line audio.
 * A submitted uncertain job is never repeated or silently handed to the cloud. */
export async function generateA2vSection(input: { dataDir: string; directory: string; image: string; audio: string;
  prompt: string; seed?: number; authorizeSubmission: () => void }, dependencies: { transport?: LtxTransport; json?: typeof ltxJson; sleep?: (ms: number) => Promise<void> } = {}) {
  const token = process.env.LTX_TOKEN?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error("LTX_TOKEN is missing/invalid; no speaking generation submitted.");
  const assets = resolve(input.dataDir, "assets"), directory = resolve(input.directory);
  const within = relative(assets, directory);
  if (!within || within.startsWith("..") || isAbsolute(within) || existsSync(directory)) throw new Error("LTX speaking attempt needs a new directory inside chapter assets; reconcile retained attempts before retrying.");
  if (!input.prompt.trim() || input.prompt.length > 5000) throw new Error("LTX speaking prompt must contain 1–5000 characters.");
  // A separately authorized retake may vary its native seed while preserving
  // exact source/carry inputs. Ordinary requests retain the established seed.
  const seed = input.seed === undefined ? 42 : input.seed;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error("LTX speaking seed must be an integer from 0 to 2147483647; no generation submitted.");
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const inputs = { imageSha256: hash(input.image), audioSha256: hash(input.audio) };
  const transport = dependencies.transport ?? new SshLtxTransport(), json = dependencies.json ?? ltxJson;
  const id = randomUUID();
  let lease: string | undefined, submitted = false, complete = false;
  const state: Record<string, unknown> = { id, ...inputs, startedAt: new Date().toISOString(), status: "preflight", provider: "ltx_local", model: "ltx-2.5-fast-a2v", apiCostUsd: 0 };
  const save = () => writeFileSync(join(directory, "attempt.json"), JSON.stringify(state, null, 2));
  try {
    const base = await transport.connect();
    assertLocalA2v(await json(base, "/health", token, 10000), await json(base, "/api/runtime-policy", token, 10000), await json(base, "/api/settings", token, 10000));
    const home = await transport.remote('printf "%s" "$HOME"');
    const inbox = process.env.LTX_INBOX_DIR?.trim() || `${home}/LTX-Inbox`;
    if (!inbox.startsWith("/") || /[\r\n\0]/.test(inbox)) throw new Error("Invalid Mac inbox path.");
    const lock = `${inbox}/.heartword-generation.lock`;
    await transport.remote(`mkdir -p ${shellQuote(inbox)} && mkdir ${shellQuote(lock)}`); lease = lock;
    await transport.remote(`printf '%s' ${shellQuote(id)} > ${shellQuote(`${lock}/owner`)}`);
    if ((await json(base, "/api/generation/progress", token, 5000)).status === "running") throw new Error("LTX is busy; no speaking job submitted.");
    mkdirSync(directory, { recursive: true }); save();
    const image = `${inbox}/speaking-${id}.png`, audio = `${inbox}/speaking-${id}.wav`;
    await transport.upload(input.image, image); await transport.upload(input.audio, audio);
    if (hash(input.image) !== inputs.imageSha256 || hash(input.audio) !== inputs.audioSha256) throw new Error("Speaking input changed during upload.");
    assertLocalA2v(await json(base, "/health", token, 10000), await json(base, "/api/runtime-policy", token, 10000), await json(base, "/api/settings", token, 10000));
    input.authorizeSubmission();
    const request = { prompt: input.prompt, resolution: "720p", model: "fast", duration: 5, fps: 24, aspectRatio: "16:9",
      cameraMotion: "none", audio: true, imagePath: image, audioPath: audio, lastImagePath: null, keyframes: [], loras: [], seed,
      // Preserve the successful standalone speaking request rather than
      // silently inheriting Desktop's generic image/video negative prompt.
      negativePrompt: "face distortion, identity change, exaggerated mouth, extra people, subtitles, camera movement" };
    Object.assign(state, { status: "submitted", request, lease, remoteInputs: [image, audio] }); save(); submitted = true;
    let done = false;
    const pending = json(base, "/api/generate", token, 7200000, request).then(value => ({ value }), error => ({ error })).finally(() => { done = true; });
    while (!done) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([pending, dependencies.sleep ? dependencies.sleep(5000) : new Promise<void>(r => { timer = setTimeout(r, 5000); })]);
      clearTimeout(timer);
      if (!done) try {
        const p = await json(base, "/api/generation/progress", token, 3000);
        state.progress = { phase: typeof p.phase === "string" ? redactLtxSecret(p.phase, token) : null, progress: p.progress, status: p.status }; save();
      } catch { /* Keep observing the original request; do not resubmit. */ }
    }
    const response = await pending;
    if ("error" in response) throw response.error;
    const result = response.value;
    if (result.status !== "complete" || typeof result.video_path !== "string" || !result.video_path.startsWith("/") || /[\r\n\0]/.test(result.video_path)) throw new Error("Speaking job completion is uncertain; reconcile original submission.");
    complete = true;
    Object.assign(state, { status: "generated", remoteOutputPath: result.video_path }); save();
    const raw = join(directory, "raw.mp4");
    await transport.download(result.video_path, raw);
    Object.assign(state, { status: "downloaded_unreviewed", rawSha256: hash(raw), finishedAt: new Date().toISOString() }); save();
    return { rawPath: raw, attemptPath: join(directory, "attempt.json"), id };
  } catch (error) {
    state.status = submitted && !complete ? "uncertain_reconcile_before_retry" : "failed_or_local_recovery_required";
    state.error = redactLtxSecret(error instanceof Error ? error.message : "Speaking generation failed", token);
    if (existsSync(directory)) save();
    throw new Error(String(state.error));
  } finally {
    if (lease && (!submitted || complete)) try {
      await transport.remote(`test "$(cat ${shellQuote(`${lease}/owner`)})" = ${shellQuote(id)} && rm ${shellQuote(`${lease}/owner`)} && rmdir ${shellQuote(lease)}`);
    } catch { /* Matching owner evidence remains in attempt.json for recovery. */ }
    transport.reset();
  }
}
