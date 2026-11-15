/** Advisory multimodal QC on the review-only Shot 4 composite; never selects clips. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { generateJsonWithImagesMetered } from "../src/providers/gemini-text.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";
const PREVIEW = "generated/video/review/mark3-scene1-shot4-full-review-r1.mp4";

async function main() {
  const db = getDb(), dataDir = getDataDir();
  const prior = db.prepare("SELECT id FROM review_notes WHERE subject_type='shot' AND subject_id=? AND note LIKE ?")
    .get(SHOT_ID, `%Advisory Shot 4 full-preview QC for ${PREVIEW}%`);
  if (prior) throw new Error("This review has already been recorded.");
  const video = readFileSync(join(dataDir, "assets", PREVIEW));
  const approved = readFileSync(join(dataDir, "assets", "generated/keyframes/codex/0e456bc8-a7fd-4dd2-877c-32b0b0d661b5/scene-1-shot-4-pre-healing-state-r2.png"));
  const { result, costUsd } = await generateJsonWithImagesMetered<{
    mouth_motion: string; cutaway: string; visual_continuity: string; audible_source: string;
    concerns: string[]; confidence: number;
  }>(
    "Advisory review of a 14-second Mark 3:4 preview with its intended Hatam Jesus audio embedded. Video 0-6.755 s is a Jesus speaking close-up, 6.755-10.053 s is an over-the-shoulder view with his mouth hidden while the SAME line continues, and 10.053-14.000 s is a tighter Jesus speaking close-up. Watch and listen to the entire video; compare Jesus to the approved scene still. Describe whether his mouth clearly opens/closes with audible speech in both visible-face portions and rests through evident pauses, whether any visible mouth is unsynced, whether the cutaway hides his face throughout and seated leaders remain silent, and whether face, clothing, scene light, and room layout stay consistent. Distinguish directly observed issues from uncertain fine phoneme alignment, and do not claim language comprehension. Return concise evidence in each field, with concrete timecodes for any concern. This is not producer acceptance.",
    [
      { mimeType: "video/mp4", data: video.toString("base64"), caption: "Full Shot 4 review-only preview with approved audio" },
      { mimeType: "image/png", data: approved.toString("base64"), caption: "Approved Shot 4 visual reference" }
    ],
    { type: "object", properties: {
      mouth_motion: { type: "string" }, cutaway: { type: "string" }, visual_continuity: { type: "string" },
      audible_source: { type: "string" }, concerns: { type: "array", items: { type: "string" } }, confidence: { type: "number" }
    }, required: ["mouth_motion", "cutaway", "visual_continuity", "audible_source", "concerns", "confidence"] }
  );
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `Advisory Shot 4 full-preview QC for ${PREVIEW}: ${JSON.stringify(result)}. Estimated review cost $${costUsd}. Producer approval required; no clip selected.`, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?)")
      .run(randomUUID(), PROJECT_ID, costUsd, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ result, costUsd }));
}

main().catch(error => { console.error("FAILED:", error); process.exitCode = 1; });
