/** Held, source-bridging Mark 3 -> Mark 4 non-speaking motion candidates. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frameDir = "generated/keyframes/mark3-nextchapter-bridge";
const tasks = [
  { name: "interior-departure", frame: "last-wide-source-v1.png",
    direction: "Continue the exact first frame in the same crowded first-century basalt house after Jesus has finished speaking. Jesus, the approved Papuan man in the cream tunic with two restrained blue bands and brown belt, lowers his hands, rises naturally from the seated position, turns toward the existing doorway and begins walking out as seated listeners make a little space. Camera gently follows him from behind/three-quarter view. Preserve this face, hair, garment, every person, room scale, windows, beams and warm daylight. No duplicate Jesus, no speaking or moving mouths, no new theological action, no boat, no teaching, no cut. Natural room/footstep ambience, no music." },
  { name: "street-to-sea", frame: "exterior-departure-v1.png",
    direction: "From this first-century Capernaum basalt-house threshold, follow the same Jesus in cream tunic with blue bands and brown belt walking away toward the Sea of Galilee visible down the lane. A few individual residents notice and turn; two begin to follow without speaking. He does not stop to teach. Keep the house, street, shore, people, sunlight and camera direction geographically continuous, period-accurate. A gentle tracking camera begins rising near the end. No new building, identity change, boat, miracle, speech, chanting, synchronized crowd movement or cut. Natural feet, clothing and coastal ambience, sound on, no music." },
  { name: "aerial-retreat", frame: "aerial-retreat-v1.png",
    direction: "Start from this high oblique view of the same first-century Galilean basalt village and path down to the Sea of Galilee. The same small cream-and-blue-robed Jesus keeps walking toward the shore; a few people naturally gather behind and beside him at different moments. The camera cranes higher and pulls back so Jesus gradually becomes ever smaller, while the sea and shoreline become the composition's destination. The crowd gathers but no one teaches or boards a boat; this is a wordless transition hint toward Mark 4:1, not Mark 4 action. Preserve historical village and geography; no instant giant crowd, modern objects, speaking, subtitles, miracle, or cut. Coastal ambience on, no music." }
] as const;

const selected = process.argv[2];
const task = tasks.find(t => t.name === selected);
if (!task) throw new Error(`Choose ${tasks.map(t => t.name).join(", ")}`);
const db = getDb(), root = join(getDataDir(), "assets");
const marker = `mark3-nextchapter-${task.name}-v1`;
const shot = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? AND sc.sequence=(SELECT MAX(sequence) FROM scenes WHERE project_id=?)
  ORDER BY sh.sequence DESC LIMIT 1`).get(projectId, projectId) as { id: string } | undefined;
if (!shot) throw new Error("Mark 3 final shot missing.");
const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
  .get(shot.id, `${marker}%`);
if (prior) { console.log(JSON.stringify({ marker, prior, action: "inspect before retry" })); process.exit(0); }
const frame = `${frameDir}/${task.frame}`;
if (!existsSync(join(root, frame))) throw new Error(`Reviewed frame missing: ${frame}`);
const prompt = `${marker}. Photorealistic 16:9 landscape, one continuous five-second non-lip-sync transition take. Producer-directed post-source bridge from Mark 3:35 to Mark 4:1, not a narrated event. ${task.direction} No intelligible words or music; native ambient sound ON.`;
const id = randomUUID();
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
  VALUES (?,?,'pending','pending','generate_final_video','1080p',?,'hold_for_review',NULL,0,?)`).run(id, shot.id, prompt, Date.now());
console.log(JSON.stringify({ marker, id, state: "submitted" }));
const result = await new KlingVideoProvider().generateFinal({ shotId: `${shot.id}-${id}`, prompt, characters: [] },
  { resolution: "1080p", startFrame: { path: frame } });
if (!result.media?.path) throw new Error(`No media for ${marker}`);
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
    .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(), projectId, shot.id, `${marker}: inspect identity, house/shore continuity, nonverbal crowd movement and native sound before selection.`, Date.now());
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ marker, id, path: result.media.path, costUsdEstimate: result.cost.usd }));
