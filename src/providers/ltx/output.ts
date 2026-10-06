import { execFile } from "node:child_process";
import { existsSync, renameSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { childEnvironment } from "./transport.js";

const exec = promisify(execFile);

/** Retain native ambience separately for review and the existing sound mixer.
 * An explicit silent request still removes Desktop's unexpected audio. */
export async function prepareLtxVideoOutput(input: string, output: string, options: { audioMode?: "ambient" | "none"; ambientOutput?: string } = {}) {
  if (existsSync(output)) throw new Error("LTX prepared output already exists.");
  const settings = { windowsHide: true, timeout: 30_000, env: childEnvironment(), maxBuffer: 1024 * 1024 };
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames,duration:format=duration", "-of", "json", input], settings);
    const media = JSON.parse(stdout) as { streams?: Array<{ codec_type: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string; duration?: string }>; format?: { duration?: string } };
    const video = media.streams?.find(stream => stream.codec_type === "video");
    if (!video?.width || !video.height) throw new Error("No video stream.");
    const backendAudioIncluded = media.streams!.some(stream => stream.codec_type === "audio");
    const audioRemoved = backendAudioIncluded && options.audioMode === "none";
    if (backendAudioIncluded && !audioRemoved && options.ambientOutput) {
      await exec("ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", input, "-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-f", "wav", options.ambientOutput], settings);
      if (!existsSync(options.ambientOutput) || statSync(options.ambientOutput).size === 0) throw new Error("No retained ambient audio.");
    }
    if (audioRemoved) {
      await exec("ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", input, "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", output], settings);
    } else renameSync(input, output);
    if (!existsSync(output) || statSync(output).size === 0) throw new Error("No prepared video.");
    return { width: video.width, height: video.height, frameRate: video.r_frame_rate, durationSeconds: Number(video.duration ?? media.format?.duration) || null, frames: Number(video.nb_frames) || null, backendAudioIncluded, audioRemoved, audio: backendAudioIncluded && !audioRemoved };
  } catch {
    throw new Error("LTX output could not be validated or prepared. Check ffprobe/ffmpeg; the Mac output path is retained in the metadata.");
  }
}
