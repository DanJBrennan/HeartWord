/** Independent audio-only screening of a retained Mark 3 music candidate. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";

const name = process.argv[2];
if (!name || !["synagogue", "synagogue-v2", "calling", "house", "house-v2", "family", "chapter-bridge", "chapter-bridge-r11", "synagogue-celebration-r11", "synagogue-celebration-r11-v2", "synagogue-celebration-r11-v3"].includes(name)) throw new Error("Pass a retained Mark 3 cue name.");
const manifestPath = join(getDataDir(), "assets", "generated", "soundtrack", "mark3-r8", `${name}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { cue: { prompt: string; startMs: number; endMs: number }; path: string; mimeType: string; durationMs: number; review?: unknown; previousReviews?: unknown[]; status: string };
const recheck = process.argv[3] === "--used";
if (manifest.review && !recheck) { console.log(JSON.stringify({ name, review: manifest.review, reused: true })); process.exit(0); }
const usedMs = manifest.cue.endMs - manifest.cue.startMs;
const bytes = recheck ? execFileSync("ffmpeg", ["-v", "error", "-i", manifest.path, "-t", String(usedMs / 1000), "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 }) : readFileSync(manifest.path);
const review = await generateJsonWithImages<{
  instrumental: boolean; intelligibleSpeech: boolean; audibleArtifact: boolean;
  matchesMood: boolean; dynamicArc: boolean; concerns: string; confidence: number;
}>(`Listen independently to this entire candidate instrumental underscore for a Scripture film. It should fit: ${manifest.cue.prompt} ` +
  `Check the complete ${recheck ? usedMs / 1000 : manifest.durationMs / 1000}-second ${recheck ? "planned-used excerpt" : "recording"} for vocals, intelligible speech, chant, artifacts, abrupt edits, ` +
  `and whether its emotional development follows the brief without overpowering a narrator. Do not infer cultural authenticity. ` +
  `Describe concrete concerns. A score can be emotionally fitting while still needing a lower mix level.`,
  [{ mimeType: "audio/mpeg", data: bytes.toString("base64") }],
  { type: "object", properties: {
    instrumental: { type: "boolean" }, intelligibleSpeech: { type: "boolean" }, audibleArtifact: { type: "boolean" },
    matchesMood: { type: "boolean" }, dynamicArc: { type: "boolean" }, concerns: { type: "string" }, confidence: { type: "number" }
  }, required: ["instrumental", "intelligibleSpeech", "audibleArtifact", "matchesMood", "dynamicArc", "concerns", "confidence"] });
if (manifest.review) manifest.previousReviews = [...(manifest.previousReviews ?? []), manifest.review];
manifest.review = review;
const confidence = review.confidence <= 1 ? review.confidence * 100 : review.confidence;
manifest.status = review.instrumental && !review.intelligibleSpeech && !review.audibleArtifact && review.matchesMood && confidence >= 80
  ? "screened_candidate" : "held_for_review";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ name, status: manifest.status, review }));
