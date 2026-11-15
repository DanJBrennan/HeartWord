/** Review-only correction: one synagogue entrance and audible room ambience. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets");
const input = join(root, "generated/video/review/mark3-full-chapter-r11-continuity-emotion-review-v3.mp4");
const room = join(root, "generated/video/kling-932283073868865577.mp4");
const output = join(root, "generated/video/review/mark3-full-chapter-r12-single-entry-ambience-review-v1.mp4");
if (![input, room].every(existsSync) || existsSync(output) || existsSync(output.replace(/\.mp4$/, ".json")))
  throw new Error("Missing retained input or existing review output.");

// 24 fps boundaries: first entrance was [635, 745). Retain the exterior
// through frame 634 and begin directly with the following interior shot.
// At 48 kHz those video boundaries are exactly samples 1,270,000 and
// 1,490,000, so narration after the cut stays locked to picture.
const filter = [
  "[0:v]trim=end_frame=635,setpts=PTS-STARTPTS[v0]",
  "[0:v]trim=start_frame=745,setpts=PTS-STARTPTS[v1]",
  "[v0][v1]concat=n=2:v=1:a=0,setsar=1[v]",
  "[0:a]atrim=end_sample=1270000,asetpts=PTS-STARTPTS[a0]",
  "[0:a]atrim=start_sample=1490000,asetpts=PTS-STARTPTS[a1]",
  "[a0][a1]concat=n=2:v=0:a=1,aresample=48000,aformat=channel_layouts=stereo[master]",
  // The screened same-room take contains native ambience and no invented
  // speech. Crossfade two portions for one unobtrusive ~8-second bed.
  "[1:a]atrim=duration=4.5,asetpts=PTS-STARTPTS[room0]",
  "[1:a]atrim=start=0.5:end=4.458333,asetpts=PTS-STARTPTS[room1]",
  "[room0][room1]acrossfade=d=0.5:c1=tri:c2=tri,aresample=48000,aformat=channel_layouts=stereo,volume=9dB,afade=t=in:st=0:d=0.3,afade=t=out:st=7.458333:d=0.5,adelay=26458|26458[bed]",
  "[master][bed]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.98:level=false[mix]"
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", "-i", input, "-i", room,
  "-filter_complex", filter, "-map", "[v]", "-map", "[mix]", "-c:v", "libx264",
  "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", "505.75",
  "-movflags", "+faststart", output], { stdio: "inherit", timeout: 3600000 });
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({
  status: "held_for_producer_review", input, output,
  removedFirstEntranceFrames: [635, 745], removedAudioSamples48k: [1270000, 1490000],
  retainedEntranceStartsAtSeconds: 635 / 24,
  roomToneSource: room, roomToneReview: "synagogue-leaders-same-room-motion-review-v1.json",
  roomToneGainDb: 9, roomToneDurationSeconds: 7.958333,
  sourceSpeechPreservedInOrder: true,
  lipSyncNote: "No global sync shift: r10 and r11 speech match at zero lag at nine sample points; unchanged picture samples also align."
}, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, durationSeconds: 505.75, expectedFrames: 12138 }));
