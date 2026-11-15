/** Preserve the approved-length r11 picture and finish only its musical tail. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const dir = join(getDataDir(), "assets/generated/video/review");
const input = join(dir, "mark3-full-chapter-r11-continuity-emotion-review-v2.mp4");
const output = join(dir, "mark3-full-chapter-r11-continuity-emotion-review-v3.mp4");
if (!existsSync(input) || existsSync(output) || existsSync(output.replace(/\.mp4$/, ".json"))) throw new Error("Missing input or existing output");
// The screened 31-second generated cue does not actually decay in its final
// second. A four-second master fade resolves that ending without touching
// picture timing, source words, or the preceding crescendo.
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", "-i", input,
  "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
  "-af", "afade=t=out:st=506.333:d=4", "-c:a", "aac", "-b:a", "192k",
  "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output],
{ stdio: "inherit", timeout: 180000 });
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({
  status: "held_for_producer_review", input, output, videoStreamCopied: true,
  audioFinishing: "four-second whole-mix fade from 506.333 to 510.333 after screened cue was found to rise again in final second",
  sourceSpeechUntouched: true, pictureFrames: 12248, durationSeconds: 510.333
}, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, durationSeconds: 510.333 }));
