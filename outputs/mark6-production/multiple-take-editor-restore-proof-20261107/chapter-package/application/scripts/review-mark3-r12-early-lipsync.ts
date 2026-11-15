/** Advisory audiovisual review of three early speaking turns; no timeline edit. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";

const root = join(getDataDir(), "assets/generated/video/review");
const input = join(root, "mark3-full-chapter-r12-single-entry-ambience-review-v1.mp4");
const output = join(root, "mark3-r12-early-lipsync-advisory-v2.json");
const work = mkdtempSync(join(tmpdir(), "hw-r12-sync-"));
const clips = [
  { label: "Jesus finishes the Sabbath question", start: 73.4, duration: 5 },
  { label: "The man with the unclean spirit speaks", start: 199.5, duration: 4 },
  { label: "Jesus addresses the disciples", start: 222.9, duration: 8 }
];
try {
  const media = clips.map(({ label, start, duration }, index) => {
    const path = join(work, `sample-${index}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), "-i", input, "-t", String(duration),
      "-vf", "scale=640:360", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", path], { timeout: 60000 });
    return { label, start, duration, mimeType: "video/mp4", data: readFileSync(path).toString("base64") };
  });
  const review = await generateJsonWithImages<{
    clips: Array<{ label: string; visibleMouthAndSpeechOverlap: boolean; mouthLeadsAudioMs: number; evidence: string; confidence: number }>;
    limitations: string;
  }>("Watch and listen to each of these three separate Hatam Mark 3 speaking excerpts. The user reports that some early visible mouths lead the audible speech by roughly 250 ms. For each excerpt, inspect the visible speaker's lip onset and syllabic mouth motion against the actual audio, and estimate signed mouth lead in milliseconds (positive = mouth before audio; negative = mouth after audio). Do not guess from the claim: use -999 when the angle, cutaway, or frame rate prevents a reliable estimate. Distinguish a genuinely shifted audio/video performance from a brief non-speaking reaction shown under voiceover. This is an advisory assessment, not authorization to shift the source recording. Return evidence and limitations.",
    media.map(({ mimeType, data, label }) => ({ mimeType, data, caption: label })),
    { type: "object", properties: {
      clips: { type: "array", items: { type: "object", properties: {
        label: { type: "string" }, visibleMouthAndSpeechOverlap: { type: "boolean" },
        mouthLeadsAudioMs: { type: "number" }, evidence: { type: "string" }, confidence: { type: "number" }
      }, required: ["label", "visibleMouthAndSpeechOverlap", "mouthLeadsAudioMs", "evidence", "confidence"] } },
      limitations: { type: "string" }
    }, required: ["clips", "limitations"] });
  writeFileSync(output, JSON.stringify({ input, windows: clips, review, status: "advisory_not_producer_approval" }, null, 2), { flag: "wx" });
  console.log(JSON.stringify(review));
} finally {
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep)) throw new Error(`Unexpected temporary path ${work}`);
  rmSync(work, { recursive: true, force: true });
}
