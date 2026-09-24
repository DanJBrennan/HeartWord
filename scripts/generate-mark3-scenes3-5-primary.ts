/** One reviewed, source-grounded primary motion candidate from an approved still. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneNumber = Number(process.argv[2]), shotNumber = Number(process.argv[3]);
const take = Number(process.argv[4] ?? 1);
if (![3, 4, 5].includes(sceneNumber) || !Number.isInteger(shotNumber) || shotNumber < 1) throw new Error("Usage: scene number 3–5 and positive shot number.");
if (!Number.isInteger(take) || take < 1) throw new Error("Take must be a positive integer.");
const marker = `mark3-scene${sceneNumber}-shot${shotNumber}-primary-motion-take${take}-v1`;
const db = getDb();
const shot = db.prepare(`SELECT sh.id,sh.action,sh.verse_ref,sh.needs_lip_sync FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=?`).get(projectId, sceneNumber, shotNumber) as
  { id: string; action: string; verse_ref: string; needs_lip_sync: number } | undefined;
if (!shot || shot.needs_lip_sync) throw new Error("This script is only for a planned non-speaking primary shot.");
const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
  .get(shot.id, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
if (prior) { console.log(JSON.stringify({ reused: true, ...prior })); process.exit(0); }
const key = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shot.id) as { result_asset_path: string | null } | undefined;
if (!key?.result_asset_path || !existsSync(join(getDataDir(), "assets", key.result_asset_path))) throw new Error("Approved keyframe missing.");
const prompt = `Photorealistic 16:9 landscape motion from this exact supplied frame. Preserve the visible faces, hair, skin tone, garments, props, light, geography, and camera axis. Gentle natural movement only, with varied timing among people. A continuous single take. Keep the same people throughout; no arrival, departure, identity change, new story action, text, or modern objects. Quiet ambient outdoor scene. Production reference ${marker}.`;
const request = { shotId: `${shot.id}-${marker}-${randomUUID()}`, prompt, characters: [] };
const useVeo = sceneNumber === 3 || take > 1;
const result = useVeo
  ? await new GeminiVideoProvider().generateFinal(request, { resolution: "720p", startFrame: { path: key.result_asset_path }, durationSeconds: 8, tier: "economy" })
  : await new KlingVideoProvider().generateFinal(request, { resolution: "1080p", startFrame: { path: key.result_asset_path } });
if (!result.media?.path) throw new Error("Video provider returned no media.");
const id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,?,?,'hold_for_review',?,?,?)")
    .run(id, shot.id, result.provenance.provider, result.provenance.model, "generate_final_video", useVeo ? "720p" : "1080p", prompt, result.media.path, result.cost.usd, now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), projectId, id, result.cost.usd, now);
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(), projectId, shot.id, `${marker}: primary candidate anchored to approved keyframe ${key.result_asset_path}. Check all named identities, wardrobe, exact action, group motion and visual continuity before selection.`, now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ sceneNumber, shotNumber, id, path: result.media.path, costUsd: result.cost.usd }));
