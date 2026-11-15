/** Compare source and scored excerpts; retain machine listening as review evidence, not producer approval. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";

const root = join(getDataDir(), "assets", "generated", "video", "review");
const base = join(root, "mark3-full-chapter-source-review-r8-emotion-editorial-v2.mp4");
const scored = join(root, "mark3-full-chapter-r9-score-review-v1.mp4");
const segments = [
  { name: "healing and departure", start: 87, duration: 38 },
  { name: "calling the twelve", start: 215, duration: 30 },
  { name: "house dispute", start: 305, duration: 45 },
  { name: "family and open-arms pause", start: 438, duration: 31 }
];
const extract = (path: string, start: number, duration: number) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(start),
  "-i", path, "-t", String(duration), "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
const reviews = [];
for (const segment of segments) {
  const review = await generateJsonWithImages<{
    scoreAudible: boolean; speechClear: boolean; ambiencePreserved: boolean;
    unexpectedMusicVocal: boolean; smoothScoreEntryExit: boolean; emotionalFit: boolean;
    concerns: string; confidence: number;
  }>(`Compare the original and scored audio excerpts of the same ${segment.name} passage. The first is the original Hatam speech/ambience mix; the second adds instrumental score. ` +
    "Listen to both completely. Judge whether the music is perceptible but leaves speech intelligible, preserves natural ambience, has smooth entries/exits, fits the scene, and adds no humming or other new voice. " +
    "Do not judge the meaning of the Hatam words or claim native-speaker verification. Give specific concerns, including if the music is too quiet to contribute or too loud under speech.",
    [{ mimeType: "audio/mpeg", data: extract(base, segment.start, segment.duration).toString("base64"), caption: "Original unscored excerpt." },
      { mimeType: "audio/mpeg", data: extract(scored, segment.start, segment.duration).toString("base64"), caption: "New scored excerpt." }],
    { type: "object", properties: {
      scoreAudible: { type: "boolean" }, speechClear: { type: "boolean" }, ambiencePreserved: { type: "boolean" },
      unexpectedMusicVocal: { type: "boolean" }, smoothScoreEntryExit: { type: "boolean" }, emotionalFit: { type: "boolean" },
      concerns: { type: "string" }, confidence: { type: "number" }
    }, required: ["scoreAudible", "speechClear", "ambiencePreserved", "unexpectedMusicVocal", "smoothScoreEntryExit", "emotionalFit", "concerns", "confidence"] });
  reviews.push({ ...segment, review });
  console.log(JSON.stringify({ segment: segment.name, review }));
}
writeFileSync(scored.replace(/\.mp4$/, ".qc.json"), JSON.stringify({ scored, base, reviews,
  limitation: "Machine listening does not verify Hatam words, cultural fit, or producer taste." }, null, 2), { flag: "wx" });
