/** Produces the producer-authorized short, non-speaking bridge for the
 * Mark 3:11 split. Veo's minimum is four seconds; assembly will use the
 * reviewed two-second opening from this retained candidate. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "ffb0efa5-17ed-455a-a444-2f206a8643fd";

async function run() {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID);
  if (existing) { console.log("Bridge candidate already awaits review."); return; }
  const keyframe = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID) as { result_asset_path: string } | undefined;
  if (!keyframe?.result_asset_path) throw new Error("The approved two-person bridge keyframe is missing.");
  const prompt = `Animate the attached approved 16:9 Mark 3:11 keyframe as a quiet two-person bridge lasting four seconds; assembly will use its first two seconds. Preserve Jesus and the kneeling Man with the Unclean Spirit exactly as approved: their Papuan/Hatam identities, faces, hair, garments, posture, and setting must not drift. Both mouths remain naturally closed and still: no speech, no lip movement, no narration, no intelligible words, and no invented dialogue. Use only subtle breathing, a small shift of weight, gentle cloth and lake breeze, and restrained independently timed crowd ambience. Keep all crowd members Papuan/Hatam; no white, Caucasian, Levantine, European, or generic identity drift. No synchronized crowd wave, mass reaching, repeated gesture, glowing eyes, text, subtitles, or camera cut.`;
  console.log("Generating the four-second bridge candidate...");
  const result = await new GeminiVideoProvider().generateFinal(
    { shotId: `${SHOT_ID}-two-second-bridge-${randomUUID()}`, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: keyframe.result_asset_path }, durationSeconds: 4, tier: "economy" }
  );
  if (!result.media) throw new Error("Veo returned no bridge video.");
  const attemptId = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)`).run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "generate_final_video", result.provenance.prompt, result.media.path, result.cost.usd, now);
    db.prepare(`INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)`).run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,0,?)`).run(randomUUID(), PROJECT_ID, SHOT_ID, "Producer-authorized silent bridge candidate. If approved, assembly uses its first two seconds immediately before the selected single-speaker Hatam insert.", now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, path: result.media.path }));
}

run().catch((error) => { console.error("FAILED:", error); process.exit(1); });
