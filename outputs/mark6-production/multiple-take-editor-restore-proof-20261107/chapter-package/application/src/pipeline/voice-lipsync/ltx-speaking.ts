import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { LipSyncProvider, CharacterRef, AudioSegmentRef, AssetRef, GenerationResult } from "../../providers/types.js";
import { generateA2vSection } from "../../providers/ltx/a2v.js";
import { compileAvatarSettings } from "../../providers/kling/avatar-direction.js";
import { childEnvironment } from "../../providers/ltx/transport.js";
import { detectSilences } from "../ingestion/detect-silences.js";
import { planShortSpeaking } from "./short-speaking-plan.js";

/** A picture-only crop selected against this shot's framing, not a universal
 * portrait recipe or approval of a changed canon. Native coordinates persist. */
export interface SpeakingPictureCrop { x: number; y: number; width: number; height: number; evidenceRef: string }
type SyncOptions = Parameters<LipSyncProvider["sync"]>[3];
export class LtxChainedSpeaking implements LipSyncProvider {
  constructor(private readonly options: { dataDir: string; crop?: SpeakingPictureCrop;
    /** Exact scene-specific speaking direction validated in a bounded test. */
    performancePrompt?: string;
    generateSection?: typeof generateA2vSection }) {}
  async sync(character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef, opts?: SyncOptions): Promise<GenerationResult> {
    if (!opts?.authorizeSubmission || !character.characterVersionId) throw new Error("LTX speaking requires current source/canon authorization.");
    opts.authorizeSubmission();
    const assets = resolve(this.options.dataDir, "assets");
    const asset = (path: string) => {
      const absolute = isAbsolute(path) ? resolve(path) : resolve(assets, path), part = relative(assets, absolute);
      if (!part || part.startsWith("..") || isAbsolute(part)) throw new Error("Speaking source/output must be inside chapter assets.");
      return absolute;
    };
    const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-n", ...args], { windowsHide: true, env: childEnvironment(), stdio: "pipe", maxBuffer: 4 * 1024 * 1024 });
    const probe = (path: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8", windowsHide: true, env: childEnvironment() }));
    const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    if (![audio.startMs, audio.endMs].every(Number.isFinite) || audio.startMs < 0 || audio.endMs <= audio.startMs) throw new Error("Invalid source-bound speaking window.");
    const source = asset(audio.path), reference = asset(referenceFrame.path), original = probe(source).streams.find((s: any) => s.codec_type === "audio");
    const sampleRate = Number(original?.sample_rate), channels = Number(original?.channels);
    if (!Number.isInteger(sampleRate) || ![1, 2].includes(channels)) throw new Error("Speaking source must have a measured mono/stereo audio stream.");
    const sourceStartSample = Math.round(audio.startMs * sampleRate / 1000), sourceEndSample = Math.round(audio.endMs * sampleRate / 1000);
    const crop = this.options.crop;
    if (crop && (![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || Math.abs(crop.width / crop.height - 16 / 9) > .01 || !crop.evidenceRef.trim())) throw new Error("Speaking crop needs integer near-16:9 bounds and this shot's framing evidence.");
    if (sourceEndSample - sourceStartSample > 4 * sampleRate && !crop) throw new Error("Chained LTX speech needs a scene-framing crop/cleanup recipe before generation; the tested portrait crop is not universal. No request submitted.");
    const id = opts.requestId ?? randomUUID();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid speaking request identity.");
    const root = asset(`generated/lip-sync/ltx-${id}`);
    if (existsSync(root)) throw new Error("Retained LTX line exists; reconcile it rather than regenerating its sections.");
    const prompt = this.options.performancePrompt === undefined
      ? `One single visible speaker in the supplied scene, photorealistic landscape 16:9. Preserve exact identity, clothing, framing, background and lighting. Follow only the supplied original speech, including its pauses; natural synchronized lips/jaw, restrained acting, no invented speech. Stable camera. No captions, subtitles, written text, labels, logos or overlays. ${compileAvatarSettings(opts.avatarDirection).settings.prompt ?? ""} ${character.lockedVisualFacts?.description ?? ""}`
      : [this.options.performancePrompt,character.lockedVisualFacts?.description].filter(Boolean).join(" ");
    if (!prompt.trim() || (this.options.performancePrompt !== undefined && !this.options.performancePrompt.trim()) || prompt.length > 5000 || character.lockedVisualFacts?.prohibitedPromptPhrases.some(p => prompt.toLowerCase().includes(p.toLowerCase()))) throw new Error("Speaking direction exceeds bounds or contradicts locked canon.");
    mkdirSync(root, { recursive: true });
    const lineAudio = join(root, "full-line.wav");
    ffmpeg(["-i", source, "-af", `atrim=start_sample=${sourceStartSample}:end_sample=${sourceEndSample},asetpts=PTS-STARTPTS${channels === 1 ? ",pan=stereo|c0=c0|c1=c0" : ""}`, "-c:a", "pcm_s16le", lineAudio]);
    const lineStream = probe(lineAudio).streams.find((s: any) => s.codec_type === "audio");
    const sampleCount = Number(lineStream.duration_ts);
    if (lineStream.time_base !== `1/${sampleRate}` || sampleCount !== sourceEndSample - sourceStartSample || Number(lineStream.channels) !== 2) throw new Error("Decoded full-line sample count does not match its exact source window.");
    const quiet = detectSilences(lineAudio, { minDurationSec: .15 }).map(q => ({ startSample: Math.max(0, Math.round(q.startMs * sampleRate / 1000)), endSample: Math.min(sampleCount, Math.round(q.endMs * sampleRate / 1000)) })).filter(q => q.endSample > q.startSample);
    const plan = planShortSpeaking({ sampleRate, sampleCount, quiet });
    const manifest: any = { status: "preparing", character, source: { path: audio.path, sourceSha256: hash(source), sourceStartSample, sourceEndSample },
      reference: { path: referenceFrame.path, sha256: hash(reference) }, productionRevision: opts.productionRevision,
      fullLineAudioSha256: hash(lineAudio), crop: crop ?? null, plan, sections: [], prompt,
      limitations: "No lip-sync, identity or caption-free acceptance follows from valid files/audio. Complete-line audiovisual review is mandatory." };
    const save = () => writeFileSync(join(root, "line.json"), JSON.stringify(manifest, null, 2)); save();
    let referencePath = join(root, "start.png");
    ffmpeg(["-i", reference, "-frames:v", "1", referencePath]);
    const pictures: string[] = [];
    try {
      for (const section of plan.sections) {
        opts.authorizeSubmission();
        const submittedAudio = join(root, `section-${section.index}.wav`);
        ffmpeg(["-i", lineAudio, "-af", `atrim=start_sample=${section.sourceStartSample}:end_sample=${section.sourceEndSample},asetpts=PTS-STARTPTS,apad`, "-t", "5", "-c:a", "pcm_s16le", submittedAudio]);
        const generated = await (this.options.generateSection ?? generateA2vSection)({ dataDir: this.options.dataDir,
          directory: join(root, `attempt-${section.index}`), image: referencePath, audio: submittedAudio, prompt, authorizeSubmission: opts.authorizeSubmission });
        const raw = probe(generated.rawPath).streams.find((s: any) => s.codec_type === "video");
        if (raw?.r_frame_rate !== "24/1" || Number(raw.nb_read_frames) < section.retainedFrames) throw new Error("LTX returned insufficient native 24fps speaking frames.");
        if (crop && (crop.x + crop.width > raw.width || crop.y + crop.height > raw.height)) throw new Error("Scene crop does not fit actual native output.");
        const picture = join(root, `picture-${section.index}.mkv`);
        const pictureFilter = `trim=end_frame=${section.retainedFrames},setpts=PTS-STARTPTS${crop ? `,crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2` : ",scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"}`;
        ffmpeg(["-i", generated.rawPath, "-vf", pictureFilter, "-an", "-c:v", "ffv1", "-level", "3", picture]); pictures.push(picture);
        const retained = { ...section, rawPath: generated.rawPath, rawSha256: hash(generated.rawPath), inputImageSha256: hash(referencePath), submittedAudioSha256: hash(submittedAudio), picturePath: picture };
        manifest.sections.push(retained); manifest.status = "generating"; save();
        if (section.index + 1 < plan.sections.length) {
          referencePath = join(root, `carry-${section.index}.png`);
          // Crop once in native coordinates, then extend only discarded pixels.
          // Never repeatedly crop/zoom the retained face to form a new reference.
          const right = Number(raw.width) - crop!.x - crop!.width, bottom = Number(raw.height) - crop!.y - crop!.height;
          const carryFilter = `select=eq(n\\,${section.lastRetainedFrameIndex}),crop=${crop!.width}:${crop!.height}:${crop!.x}:${crop!.y},pad=${raw.width}:${raw.height}:${crop!.x}:${crop!.y},fillborders=left=${crop!.x}:right=${right}:top=${crop!.y}:bottom=${bottom}:mode=smear`;
          ffmpeg(["-i", generated.rawPath, "-vf", carryFilter, "-frames:v", "1", referencePath]);
          Object.assign(retained, { carryImagePath: referencePath, carryImageSha256: hash(referencePath) }); save();
        }
      }
      const list = join(root, "pictures.txt");
      writeFileSync(list, pictures.map(path => `file '${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
      const output = join(root, "candidate.mp4");
      ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", lineAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
      const final = probe(output).streams.find((s: any) => s.codec_type === "video");
      if (Number(final.nb_read_frames) !== plan.totalFrames) throw new Error("Assembled speaking candidate lost or repeated picture frames.");
      opts.authorizeSubmission(); manifest.status = "complete_line_held_for_review"; manifest.outputSha256 = hash(output); save();
      return { status: "hold_for_review", media: { path: relative(assets, output).replace(/\\/g, "/") }, cost: { usd: 0 },
        provenance: { provider: "ltx_local", model: "ltx-2.5-fast-a2v", prompt }, metadata: { lineManifest: relative(assets, join(root, "line.json")), reviewRequired: true } };
    } catch (error) { manifest.status = "held_reconcile_before_retry"; manifest.error = (error as Error).message; save(); throw error; }
  }
}
