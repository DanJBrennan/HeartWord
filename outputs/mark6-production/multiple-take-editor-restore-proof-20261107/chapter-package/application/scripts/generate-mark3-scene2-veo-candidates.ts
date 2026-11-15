/** Producer-authorized Veo Lite candidates for Mark 3 Scene 2, Shots 2–3. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const shotIds = ["041090e1-8c2d-44b3-b2ab-acb9d995b5aa", "752177c1-a318-4d6f-b898-c692763fd6e0"];

function prompt(verseRef: string, action: string): string {
  return `Animate the attached approved 16:9 Scripture-video keyframe for ${verseRef}. Planned action: ${action}

Preserve every visible face, skin tone, hair, build, garment, and crowd member exactly as the approved Papuan/Hatam people in the starting frame for the entire clip; no white, Caucasian, Levantine, European, or generic identity drift. No spoken dialogue, narration, intelligible words, lip-sync performance, or visible speaking; use only natural nonverbal action and ambient environmental sound. Crowd movement must be independently timed and irregular: at most two or three people reach, shift, or react at once while others hold, breathe, look, edge forward, or respond subtly at different moments. Never create a synchronized wave of arms, repeated group gesture, mirrored movement, or mass simultaneous reach-and-retract. Keep natural dark pupils and restrained, varied sunlight catchlights; no glowing, milky, opaque, or repeated white eye reflections. Keep the established first-century Galilean setting and composition. Do not add text.`;
}

async function run() {
  const db = getDb();
  const provider = new GeminiVideoProvider();
  for (const shotId of shotIds) {
    const existing = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND status='hold_for_review'`).get(shotId);
    if (existing) { console.log(`Skipping ${shotId}: candidate already held.`); continue; }
    const row = db.prepare(`SELECT sh.action, sh.verse_ref, ga.result_asset_path FROM shots sh JOIN generation_attempts ga ON ga.shot_id=sh.id WHERE sh.id=? AND ga.operation='generate' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1`).get(shotId) as { action: string; verse_ref: string; result_asset_path: string };
    console.log(`Generating ${row.verse_ref}...`);
    const result = await provider.generateFinal(
      { shotId: `${shotId}-veo-lite-approved-rules-${randomUUID()}`, prompt: prompt(row.verse_ref, row.action), characters: [] },
      { resolution: "720p", startFrame: { path: row.result_asset_path }, durationSeconds: 8, tier: "economy" }
    );
    const attemptId = randomUUID(), now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)`)
        .run(attemptId, shotId, result.provenance.provider, result.provenance.model, "generate_final_video", result.provenance.prompt, result.media?.path ?? null, result.cost.usd, now);
      db.prepare(`INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)`)
        .run(randomUUID(), projectId, attemptId, result.cost.usd, now);
      db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,0,?)`)
        .run(randomUUID(), projectId, shotId, "Producer-authorized Veo Lite candidate with approved Papuan identity, ambient-only, natural-eye, and staggered-motion safeguards. Requires review before timeline selection.", now);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    console.log(`Completed ${row.verse_ref}: ${result.media?.path}`);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
