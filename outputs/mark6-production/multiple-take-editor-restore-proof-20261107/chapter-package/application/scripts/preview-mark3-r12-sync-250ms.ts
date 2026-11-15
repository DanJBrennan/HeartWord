/** Read-only A/B diagnostic: current left, picture delayed 250 ms right. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const dir = join(getDataDir(), "assets/generated/video/review");
const input = join(dir, "mark3-full-chapter-r12-single-entry-ambience-review-v1.mp4");
const output = join(dir, "mark3-r12-early-lipsync-250ms-ab-preview.mp4");
if (!existsSync(input) || existsSync(output)) throw new Error("Missing source or diagnostic preview already exists.");
const graph = [
  "[0:v]trim=duration=8,setpts=PTS-STARTPTS,fps=24,scale=640:360,split=2[left0][right0]",
  "[left0]null[left]",
  "[right0]tpad=start_mode=clone:start_duration=0.25,trim=duration=8,setpts=PTS-STARTPTS[right]",
  "[left][right]hstack=inputs=2[v]",
  "[0:a]atrim=duration=8,asetpts=PTS-STARTPTS[a]"
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", "-ss", "53.25", "-i", input,
  "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output],
{ stdio: "inherit", timeout: 120000 });
console.log(output);
