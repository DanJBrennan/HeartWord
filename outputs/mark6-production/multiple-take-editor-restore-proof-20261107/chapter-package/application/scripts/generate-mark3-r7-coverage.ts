/** Producer-approved editorial replacement frames; candidates, not selections. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frameDir = "generated/keyframes/mark3-r7-editorial";
const tasks = [
  { name: "scene3-jesus-reverse-angle", scene: 3, shot: 6, frame: "scene3-jesus-reverse-angle-candidate.png",
    prompt: "Jesus listens quietly to the apostles on the same mountain slope from this distinct camera angle. Gentle natural head and eye movement and camera drift. He does not speak or move his lips; source narration is off camera." },
  { name: "scene3-apostles-reaction", scene: 3, shot: 7, frame: "scene3-apostles-reaction-candidate.png",
    prompt: "A quiet reaction of the same seated apostles as they listen to Jesus off camera. Each responds at a slightly different moment with small eye and head movement. No one speaks or moves their lips. Keep their identities, clothes, table, room and camera axis unchanged." },
  { name: "scene4-crowded-table", scene: 4, shot: 1, frame: "scene4-crowded-table-candidate.png",
    prompt: "A natural crowded-house establishing view. Jesus and the listeners settle around the same low table, with small independent gestures and quiet breathing. Gentle camera drift. No one speaks, mouths words, enters, exits, or performs a new story action." },
  { name: "scene4-bread-detail", scene: 4, shot: 2, frame: "scene4-bread-detail-candidate.png",
    prompt: "A restrained detail shot of hands, simple bread and the same crowded house. Subtle human movement and a gentle camera move give the shot life. No extra food, new action, speaking, or visible mouth movement." },
  { name: "scene4-onlookers-ots", scene: 4, shot: 13, frame: "scene4-onlookers-ots-candidate.png",
    prompt: "Over Jesus's shoulder toward the same listening onlookers. Jesus is speaking off-camera but no visible listener speaks or moves their lips. Small distinct listening reactions and gentle handheld parallax; preserve faces, garments and house layout." },
  { name: "scene4-onlookers-side", scene: 4, shot: 17, frame: "scene4-onlookers-side-candidate.png",
    prompt: "Side-angle listeners in the same crowded house as Jesus speaks off-camera. Subtle independent looks and head movement. No visible person speaks or moves their lips, and no new character or story action appears." },
  { name: "scene5-seated-announcement", scene: 5, shot: 5, frame: "scene5-seated-announcement-candidate.png",
    prompt: "The same people remain seated while a message about Jesus's family reaches the room. Jesus is clearly visible and listens. Varied, restrained reactions; no standing, chanting, gesturing in unison, speaking mouths, or new story action." },
  { name: "scene5-seated-jesus-reaction", scene: 5, shot: 5, frame: "scene5-seated-announcement-candidate.png",
    prompt: "A gentle camera push toward the seated Jesus as he listens to the message. He and the people around him remain seated, with small individual reactions. Preserve the family in the doorway and everyone else in place. No visible speech or invented action." },
  { name: "scene5-seated-doorway-reaction", scene: 5, shot: 5, frame: "scene5-seated-announcement-candidate.png",
    prompt: "A subtle lateral camera move gives a different emphasis to the family waiting in the doorway and the seated listeners, while Jesus remains visible. Everyone stays in the same position with natural, varied quiet movement. No standing, speech, or new action." },
  { name: "scene5-seated-message-lateral", scene: 5, shot: 5, frame: "scene5-seated-announcement-candidate.png",
    prompt: "A slow lateral move across this same seated circle, favoring the messenger on the left and Jesus on the right while retaining the waiting family in the doorway. All interior listeners remain seated and still; quiet individual reactions only, no speaking mouths or new action." },
  { name: "scene5-seated-spokesperson-anticipation", scene: 5, shot: 5, frame: "scene5-seated-announcement-candidate.png",
    prompt: "A gentle push toward the seated crowd spokesperson facing Jesus, as he pauses before delivering the message. Jesus remains seated and visible. Preserve the approved people, doorway family and room layout. No speaking mouth movement, standing, or added action." },
  { name: "scene5-open-arms-pause", scene: 5, shot: 11, frame: "scene5-open-arms-pause-candidate.png",
    prompt: "After finishing his words, Jesus slowly opens his arms toward the seated crowd and holds the inclusive gesture in silence. The crowd stays seated and attentive with subtle individual movement. No one speaks or moves their lips. Hold the emotional moment." }
] as const;

const requested = process.argv[2];
if (requested && !tasks.some(task => task.name === requested)) throw new Error(`Unknown coverage task: ${requested}`);
const db = getDb(), root = join(getDataDir(), "assets"), provider = new KlingVideoProvider();
for (const task of tasks.filter(task => !requested || task.name === requested)) {
  const marker = `mark3-r7-${task.name}-approved-frame-v1`;
  const shot = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
    WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=?`).get(projectId, task.scene, task.shot) as { id: string } | undefined;
  if (!shot) throw new Error(`Missing planned shot for ${task.name}`);
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(shot.id, `${marker}%`);
  if (prior) { console.log(JSON.stringify({ name: task.name, reused: prior })); continue; }
  const frame = `${frameDir}/${task.frame}`;
  if (!existsSync(join(root, frame))) throw new Error(`Approved frame missing: ${frame}`);
  const prompt = `${marker}. Photorealistic 16:9 landscape, continuous single take from this producer-approved frame. Preserve exact Papuan/Hatam faces, skin, hair, clothing, props, light, and location; no identity drift, cuts, text, modern objects, or invented biblical action. ${task.prompt} No intelligible speech or narration; original Hatam audio is assembled separately.`;
  const request = { shotId: `${shot.id}-${marker}-${randomUUID()}`, prompt, characters: [] };
  const resolution = "1080p";
  const result = await provider.generateFinal(request, { resolution, startFrame: { path: frame } });
  if (!result.media?.path) throw new Error(`No media for ${task.name}`);
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,?,?,?,? ,?,'hold_for_review',?,?,?)`)
      .run(id, shot.id, result.provenance.provider, result.provenance.model, "generate_final_video", resolution, prompt, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, shot.id, `${marker}: producer-approved still ${frame}. Inspect motion, identity, room continuity, visible mouths, and ambience before use.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ name: task.name, id, path: result.media.path, costUsd: result.cost.usd }));
}
