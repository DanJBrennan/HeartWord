/**
 * Make one held-for-review, eight-second camera move between the exact frames
 * at the two current Mark 3 intro picture cuts. Does not edit the chapter.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { generateVeoFromFrames } from "../src/providers/gemini/index.js";

const assets = join(getDataDir(), "assets");
const aerial = "generated/pilot-source/shot-000-ancient-fishing.mp4";
const synagogue = "generated/media-library/capernaum-synagogue-arrival-and-town-life-omni-draft-r5-ambient-audible.mp4";
const start = "generated/keyframes/mark3-location-bridge-aerial-frame191.png";
const end = "generated/keyframes/mark3-location-bridge-synagogue-frame0.png";
const revision = process.argv.includes("--v2") ? "v2" : "v1";
const raw = `generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-${revision}.raw.mp4`;
const output = `generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-${revision}.mp4`;
const path = (relative: string) => join(assets, relative);
for (const relative of [aerial, synagogue, start, end]) {
  if (!existsSync(path(relative))) throw new Error(`Missing endpoint source: ${path(relative)}`);
}
if (existsSync(path(raw)) || existsSync(path(output))) throw new Error("Refusing to overwrite retained bridge candidate.");

const prompt = revision === "v2"
  ? `One continuous eight-second high-to-low establishing camera move in first-century Capernaum, with the supplied images as the exact first and last compositions. Start over the lakeshore exactly as shown: open water and fishing boats left, low dark-basalt town right. Find the specific dark-basalt synagogue with three upper windows and open twin wooden doors within the existing settlement on the right. Its front facade must be visible, small but identifiable by about second two; keep that SAME building in a clear, unobstructed line of sight as it steadily enlarges for the remaining six seconds. Glide forward and descend smoothly along an open street toward its courtyard; end precisely on the supplied exterior frame with the lake behind to the right, the same roofline, doors, neighboring stalls, townspeople and camera angle. Keep boats, shore, roofs, lake, horizon and sun orientation spatially continuous. Do not pass through or behind an arch, gateway, wall, roof, canopy, or any foreground structure. Do not invent a giant stone arch or extra landmark. No sudden speed ramp, radial blur, warp, morph, teleport, cut, dissolve, crossfade, snap zoom, or camera shake; the synagogue should grow through a gradual approach, not pop into existence. No new dialogue or story event; retain the people visible in the closing reference at normal scale without duplicating anyone. Photorealistic daylight. Natural lake breeze and birds transition to soft courtyard footfalls and indistinct bustle. No intelligible words, music, narration, subtitles, title, logo, or modern object.`
  : `One continuous eight-second aerial-to-street establishing move in first-century Capernaum. Use the supplied first image as the exact opening composition and the supplied last image as the exact closing composition. Begin above the lakeshore: water and fishing boats on the left, low dark-basalt houses on the right, distant shore and sun direction unchanged. The camera spots the actual synagogue within the town on the right, first small and recognizable among the buildings, then flies smoothly toward it while descending and gently turning into the final street-level viewpoint. The building grows naturally through real parallax as the camera approaches; end precisely on the supplied synagogue exterior with its same dark-basalt masonry, roofline, three upper openings, open wooden pivot doors, market-side structures, people, lake background, and framing. Preserve continuous geography: do not turn one foreground house into the synagogue, teleport the building, remodel architecture, invent a new landmark, cut, dissolve, crossfade, or use a sudden digital zoom. No visible drone or modern objects. Keep all people Papuan/Hatam and ordinary in scale and behavior; Jesus is only where he appears in the supplied closing frame, not duplicated during the flight. Photorealistic natural daylight, stable horizon, cinematic smooth forward-and-down aerial camera movement with a restrained accelerating approach and gentle settling at the end. Natural sound follows the camera from lake breeze and distant birds into soft courtyard footfalls and indistinct town bustle. No intelligible words, narration, singing, music, subtitles, title, logos, or added story action.`;

const bytes = await generateVeoFromFrames({
  prompt,
  startFramePath: path(start),
  endFramePath: path(end),
  resolution: "720p",
  durationSeconds: 8,
  context: "held Mark 3 Capernaum aerial-to-synagogue bridge candidate",
});
writeFileSync(path(raw), bytes);
const sourceStreams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", path(raw)], { encoding: "utf8" })) as {
  streams: Array<{ codec_type: string }>;
};
if (!sourceStreams.streams.some(s => s.codec_type === "audio")) throw new Error(`Provider supplied no audio; raw candidate retained at ${path(raw)}`);
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-i", path(raw),
  "-map", "0:v:0", "-map", "0:a:0", "-vf", "fps=24,scale=1280:720:flags=lanczos",
  "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-movflags", "+faststart", path(output)],
  { stdio: ["ignore", "inherit", "inherit"], timeout: 180_000 });

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,nb_frames,channels,width,height", "-of", "json", path(output)], { encoding: "utf8" })) as {
  streams: Array<{ codec_type: string; nb_frames?: string; channels?: number; width?: number; height?: number }>;
};
const video = probe.streams.find(s => s.codec_type === "video");
const audio = probe.streams.find(s => s.codec_type === "audio");
if (Number(video?.nb_frames) !== 192 || video?.width !== 1280 || video?.height !== 720 || audio?.channels !== 2) {
  throw new Error(`Unexpected bridge streams: ${JSON.stringify(probe.streams)}`);
}
const hash = (relative: string) => createHash("sha256").update(readFileSync(path(relative))).digest("hex");
writeFileSync(path(output.replace(/\.mp4$/, ".json")), JSON.stringify({
  status: "hold_for_producer_review",
  revision,
  selectedOnTimeline: false,
  intendedPlacementAfterApproval: "Between the first aerial and synagogue arrival shots, as an eight-second second intro shot; chapter source clock would then start at output 24 seconds.",
  output,
  raw,
  endpointFrames: [
    { asset: start, sourceVideo: aerial, sourceFrameZeroBased: 191, sourceTimeSeconds: 191 / 24, sha256: hash(start) },
    { asset: end, sourceVideo: synagogue, sourceFrameZeroBased: 0, sourceTimeSeconds: 0, sha256: hash(end) },
  ],
  provider: "gemini",
  model: "veo-3.1-lite-generate-preview",
  prompt,
  audio: "Provider's natural ambient track retained for review; no speech requested.",
}, null, 2));
console.log(JSON.stringify({ output: path(output), videoFrames: video.nb_frames, audioChannels: audio.channels }, null, 2));
