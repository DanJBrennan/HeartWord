/**
 * Bounded, review-only speaker-boundary evidence for the six Mark 4 teaching
 * lead-ins that combine narration with a Jesus quotation. It never writes
 * source attributions, splits audio_segments, or starts media generation.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";

const data = getDataDir();
const audio = join(data, "assets/source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___04_Markus______HADLAIN1DA.mp3");
const text = parseSourceTextByVerse(join(data, "assets/source/hatam/text/Mark/Mark 4.docx"));
const outDir = join(data, "assets/generated/alignment/mark-4");
const out = join(outDir, "mixed-speaker-mark4v9-r2.json");
const log = join(data, "logs/mark4-mixed-speaker-alignment-r2.jsonl");
mkdirSync(outDir, { recursive: true });
const passages = [{ label: "Mark 4:38", startMs: 462434, endMs: 476434, verses: [38] }, { label: "Mark 4:39", startMs: 476434, endMs: 494774, verses: [39] }, { label: "Mark 4:40", startMs: 495426, endMs: 504416, verses: [40] }];
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY is not set.");
writeFileSync(log, JSON.stringify({ event: "submission_started", passages: passages.map(p => p.label), at: Date.now() }) + "\n");
const model = process.env.TRANSCRIBE_MODEL_STRONG || "gemini-3.1-pro-preview";
const results: unknown[] = [];
for (const p of passages) {
  const wav = execFileSync("ffmpeg", ["-v", "error", "-ss", String(p.startMs / 1000), "-t", String((p.endMs - p.startMs) / 1000), "-i", audio, "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"]);
  const reference = text.filter(v => p.verses.includes(v.verse)).map(v => `[v${v.verse}] ${v.text}`).join("\n");
  const prompt = `Attached audio is ${p.label}, from a Hatam Scripture reading. Reference Hatam text:\n${reference}\n\nReturn JSON with an array named segments. Each segment must have role (narrator, jesus, or unknown), startMs and endMs relative to this clip, and exactSpan copied verbatim from the reference when role is jesus. Identify the narrator lead-in separately from Jesus's quoted words. If uncertain, use unknown. Do not invent words or infer a speaker from English.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) });
  const body = await res.json() as any;
  if (!res.ok) throw new Error(`${p.label} alignment failed: ${res.status}`);
  const result = { ...p, response: body.candidates?.[0]?.content?.parts?.[0]?.text ?? null };
  results.push(result);
  writeFileSync(log, JSON.stringify({ event: "passage_completed", label: p.label, at: Date.now() }) + "\n", { flag: "a" });
}
writeFileSync(out, JSON.stringify({ kind: "held_mark4_mixed_speaker_boundary_candidates", model, results }, null, 2));
writeFileSync(log, JSON.stringify({ event: "completed", output: out, at: Date.now() }) + "\n", { flag: "a" });
console.log(out);

