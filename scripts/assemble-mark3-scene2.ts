/** Normalizes each selected Scene 2 shot while retaining the source-audio review mix separately. */
import { getDb } from "../src/db/client.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb(), sceneId = "dcfeacde-0b67-4a40-be25-2762ae1d5d92";
const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const command = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?")
  .get(projectId, "mark3-scene2-complete-source-picture-coverage-v1") as { payload: string } | undefined;
if (!command) throw new Error("Source-timed Scene 2 coverage selection is missing.");
const shots = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? ORDER BY sequence").all(sceneId) as Array<{ id: string; sequence: number }>;
if (shots.length !== 14 || shots.some((shot, index) => shot.sequence !== index + 1)) throw new Error("Scene 2 shot order is incomplete.");
for (const shot of shots) {
  const existing = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(shot.id) as { result_asset_path: string } | undefined;
  const result = existing ? { assembledVideoPath: existing.result_asset_path, durationMs: null } : assembleSingleShot(db, shot.id);
  console.log(JSON.stringify({ sequence: shot.sequence, shotId: shot.id, ...result }));
}
