/**
 * One bounded Veo 3.1 loop-closure candidate for the private control-room
 * display. The same approved Rufus frame is supplied as both first and last
 * frame, so the provider receives an explicit closing composition rather than
 * relying on a browser loop to hide a visual jump.
 *
 * This script has no DB, pipeline, or server access. It leaves the currently
 * approved `rufus.mp4` untouched and writes a separate candidate for review.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateVeoFromFrames } from "../src/providers/gemini/index.js";

const root = resolve(import.meta.dirname, "..");
const motionDirectory = join(root, "docs", "assets", "control-room", "idle-motion");
const sourcePath = join(motionDirectory, "rufus-motion-safe-source-v1.png");
const candidatePath = join(motionDirectory, "rufus-loop-closure-candidate-v1.mp4");

if (!existsSync(sourcePath)) throw new Error(`Missing approved Rufus motion-safe source: ${sourcePath}`);

const prompt =
  "Locked-camera eight-second loop for this exact private HeartWord control-room portrait. " +
  "Use the supplied image as both the exact first and exact final frame. Preserve the exact illustrated identity, face, headroom, shoulders, framing, crop, pose, wardrobe, props, lighting, and background. " +
  "Only subtle natural breathing, one gentle blink, and one tiny gaze shift are allowed; by the final frame he has settled precisely back into the original neutral pose. " +
  "No camera movement, reframing, zoom, crop, pan, tilt, identity or style changes, face changes, wardrobe or prop changes, text, audio, speech, new actions, hand movement, face touching, or mouth movement.";

const generated = await generateVeoFromFrames({
  prompt,
  startFramePath: sourcePath,
  endFramePath: sourcePath,
  resolution: "720p",
  durationSeconds: 8,
  context: "private Rufus control-room loop-closure candidate"
});

mkdirSync(motionDirectory, { recursive:true });
const tempDirectory = mkdtempSync(join(tmpdir(), "heartword-rufus-loop-"));
const temporaryVideo = join(tempDirectory, "veo.mp4");
try {
  writeFileSync(temporaryVideo, generated);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", temporaryVideo, "-an", "-vf", "fps=24,scale=-2:720", "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", candidatePath]);
} finally {
  rmSync(tempDirectory, { recursive:true, force:true });
}
console.log(`Wrote private presentation-only loop-closure candidate: ${candidatePath}`);
