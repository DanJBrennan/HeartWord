/** Retain non-speaking Mark 3 correction takes; no candidate is selected or promoted. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frameDir = "generated/keyframes/mark3-r11-revision";
const tasks = [
  { name: "synagogue-entry-motion", scene: 1, shot: 1, frame: "synagogue-entry-source-v1.png",
    direction: "Continue this exact first frame in the same Capernaum basalt synagogue: Jesus naturally finishes entering from the doorway and slows beside the seated witnesses; two individuals turn their eyes and posture toward him at different moments. Keep every face, Jesus's cream mantle and blue edge bands, door, wall, bench, high-window light and camera axis exact. No repeat entrance, frozen pan, speech, mouth movement, new person or scene cut. Quiet interior footstep and room ambience." },
  { name: "synagogue-ots-man", scene: 1, shot: 4, frame: "synagogue-jesus-ots-man-v1.png",
    direction: "From over Jesus's hidden near shoulder, he looks intently and compassionately at the same man with the withered LEFT hand. The man returns his gaze with small natural breathing and eye movement, his hand still impaired; no healing yet. Hold exact basalt room, witnesses, costumes, sunlight and eyelines. Gentle camera creep, no speech, mouth movement, new person or cut. Interior ambience." },
  { name: "synagogue-leaders-same-room", scene: 1, shot: 7, frame: "synagogue-leaders-same-room-v1.png",
    direction: "In the SAME dark basalt synagogue with the high windows and left plank doorway, three dark-robed Papuan observers watch Jesus and the man off-screen with restrained, wary attention before the healing. Individual breathing, eye movement and slight head turns, no staged group pose. Preserve their distinct faces and clothes, bench, exact room architecture and light direction. No speech, mouth movement, healed hand, exit or cut. Native room ambience ON." },
  { name: "healed-man-joy", scene: 1, shot: 9, frame: "healed-man-joy-v1.png",
    direction: "Immediately AFTER the Mark 3:5 healing, the seated Papuan man stares in delighted disbelief at his restored anatomical LEFT hand. He deliberately opens the five fingers, slowly makes a fist, opens again, draws the arm toward his chest and reaches it outward. His expression clearly grows into amazed joy; an involuntary breath of surprise is okay but no words or repeated healing. Preserve face, clothes, bench, stone room and daylight; correct hands and five fingers throughout, no camera cut. Native room and cloth sound ON." },
  { name: "healing-crowd-joy", scene: 1, shot: 10, frame: "healing-crowd-joy-v1.png",
    direction: "In the same synagogue just after the man's hand is restored, individual Papuan-faced witnesses erupt into warm astonished delight at different moments: genuine surprised non-lexical shouts and gasps, two or three independent claps, a few joyful bouncing or swaying steps almost like dancing but no synchronized choreography. The restored man remains left of frame examining his LEFT hand with an amazed smile. No intelligible new words, chanting, lip-sync, other healing, new person, cut or change of room. Native crowd sound ON, NO music." },
  { name: "synagogue-angry-leaders", scene: 1, shot: 10, frame: "synagogue-angry-leaders-v1.png",
    direction: "Before leaving the same basalt synagogue, the three approved dark-robed observers sit with disappointment at the healed man's restoration settling slowly into contained anger. One tightens his jaw, another grips a robe fold, then they exchange restrained displeased glances and lean to rise at the very end. Preserve three distinct Papuan faces, garments, bench, windows and geography. No speech, mouth movement, theatrical villain gestures, doorway crossing, extra people or cut. Tense quiet room ambience ON." },
  { name: "house-jesus-canon", scene: 4, shot: 1, frame: "house-canon-crowd-v1.png",
    direction: "Same crowded first-century basalt house and bread table: canonical Papuan Jesus in cream outer mantle with restrained blue edge bands listens and turns his kind attentive gaze among the distinct Papuan listeners. A few listeners shift subtly because the room is packed; Jesus neither looks suspicious nor speaks. Gentle camera move, retain exact face, mantle, roof beams, dark stone blocks, table, loaves, people and sunlight. No doorway, new room, European face, duplicate Jesus, mouthing, arrival or cut. Native room ambience ON." },
  { name: "house-listeners-ots", scene: 4, shot: 1, frame: "house-canon-listeners-ots-v1.png",
    direction: "Over Jesus's unseen face and cream-and-blue mantle in the exact same crowded basalt house, observe the distinct Papuan listeners around the same bread table. Their attention shifts naturally between Jesus and one another; slight individual movements, no speaking mouths. Slow restrained camera drift, preserve stone/roof/door geometry, lighting, costume, table and loaves. No white/European faces, duplicate Jesus, suspicious expression, new room or cut. Native room ambience ON." }
  ,{ name: "house-canon-lateral", scene: 4, shot: 1, frame: "house-canon-lateral-v1.png",
    direction: "Distinct lateral reverse view of the SAME crowded basalt house with the same low slatted roof and bread table. Canonical Jesus's face is turned away; his cream mantle and restrained blue edge bands remain visible. The Papuan listeners naturally glance and shift with mixed concern, never a posed lineup. A subtle lateral camera move keeps the room alive. No European faces, altered Jesus, new room, speaking mouths, arrival, exit or cut. Native room ambience ON." }
  ,{ name: "house-canon-listener-close", scene: 4, shot: 1, frame: "house-canon-listener-close-v1.png",
    direction: "In the SAME low-roofed basalt house, tight reaction of the older gray-bearded Papuan listener and the rust-and-cream-clad Papuan woman at the same bread table as they attend to Jesus off-camera. Their eyes shift at different moments, one quietly breathes and leans, no mouths form words. Keep surrounding people, loaves, roof, stonework, doorway and sun direction exactly. Gentle small camera drift, no suspicious Jesus, European face, new room or cut. Native room ambience ON." }
] as const;
const chosen = process.argv[2];
if (chosen && !tasks.some(task => task.name === chosen)) throw new Error(`Unknown task: ${chosen}`);
const db = getDb(), root = join(getDataDir(), "assets"), provider = new KlingVideoProvider();
for (const task of tasks.filter(t => !chosen || t.name === chosen)) {
  const marker = `mark3-r11-${task.name}-v1`;
  const shot = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=?`)
    .get(projectId, task.scene, task.shot) as { id: string } | undefined;
  if (!shot) throw new Error(`Shot missing: ${marker}`);
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(shot.id, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (prior) {
    if (!prior.result_asset_path || !existsSync(join(root, prior.result_asset_path))) throw new Error(`Incomplete prior candidate: ${marker}`);
    console.log(JSON.stringify({ marker, prior, action: "reusing retained candidate" })); continue;
  }
  const frame = `${frameDir}/${task.frame}`;
  if (!existsSync(join(root, frame))) throw new Error(`Keyframe missing: ${frame}`);
  const prompt = `${marker}. Photorealistic 16:9 historical scene, one continuous five-second non-lip-sync take from the exact supplied frame. ${task.direction} ` +
    "Source Hatam performance is assembled separately. No subtitles, modern object, narrator voice or musical score. Native ambient sound ON.";
  const id = randomUUID();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','generate_final_video','1080p',?,'hold_for_review',NULL,0,?)`).run(id, shot.id, prompt, Date.now());
  console.log(JSON.stringify({ marker, id, state: "submitted" }));
  const result = await provider.generateFinal({ shotId: `${shot.id}-${id}`, prompt, characters: [] },
    { resolution: "1080p", startFrame: { path: frame } });
  if (!result.media?.path) throw new Error(`No media: ${marker}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, shot.id, `${marker}: review motion, identity, anatomy, room continuity and native sound before selection.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ marker, path: result.media.path, costUsdEstimate: result.cost.usd }));
}
