/** Producer-authorized, narration-led Veo Lite candidate for Mark 3:12. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "cd6c7ea1-725a-43be-825e-42f4b39cf183";

async function run() {
  const db = getDb();
  const held = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID);
  if (held) { console.log("A command candidate already awaits review."); return; }
  const source = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID) as { result_asset_path: string } | undefined;
  if (!source?.result_asset_path) throw new Error("The approved Mark 3:12 keyframe is missing.");
  const prompt = `Animate the attached approved 16:9 Mark 3:12 keyframe. Jesus gives a stern, quiet commanding gesture toward the unclean spirit; the action is narration-led, not spoken performance. Preserve every approved Papuan/Hatam identity, face, skin tone, hair, garment, and setting exactly for the full clip. No intelligible speech, narration, English, invented words, lip-sync, visible speaking, singing, vocalization, or moving mouths; the finished edit uses the real Hatam narration underneath. Use only natural environmental ambience in the raw generation. Crowd action remains restrained, independently timed, and asymmetrical: never a synchronized arm wave, repeated group gesture, or mass reach. Natural dark pupils and subtle varied catchlights only; no glowing or milky eyes. No text, subtitles, modern objects, or Caucasian/Levantine/European identity drift.`;
  console.log("Generating the Mark 3:12 narration-led candidate...");
  const result = await new GeminiVideoProvider().generateFinal({ shotId: `${SHOT_ID}-narration-led-${randomUUID()}`, prompt, characters: [] }, { resolution: "720p", startFrame: { path: source.result_asset_path }, durationSeconds: 4, tier: "economy" });
  if (!result.media) throw new Error("Veo returned no Mark 3:12 video.");
  const now = Date.now(), attemptId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)`).run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "generate_final_video", result.provenance.prompt, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,0,?)").run(randomUUID(), PROJECT_ID, SHOT_ID, "Producer-authorized narration-led candidate: no generated speech is permitted. Review before timeline selection; assembly must use continuous real Hatam narration.", now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, path: result.media.path }));
}
run().catch((error) => { console.error("FAILED:", error); process.exit(1); });
