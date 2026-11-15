/** Retain Mark 3 non-speaking editorial candidates without selecting them. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frameDir = "generated/keyframes/mark3-implied-emotion";
const tasks = [
  { name: "synagogue-listeners", scene: 1, shot: 1, frame: "synagogue-listeners-v1.png",
    direction: "Mark 3:1 synagogue interior just after Jesus has entered. The seated leaders and witnesses look toward him with individually timed, restrained attention. Let their eyes and posture change slightly; nobody enters again, speaks, rises, claps or moves their mouth. Hold the established room and camera axis." },
  { name: "healed-man-astonishment", scene: 1, shot: 9, frame: "healed-man-astonishment-v1.png",
    direction: "Mark 3:5, immediately after the already completed healing. The seated man quietly tests his restored anatomical LEFT hand: slowly curls it into one natural fist, opens all five fingers, draws his forearm toward his chest and reaches it out again. His face moves from stunned disbelief to unmistakable but restrained amazement. Keep both hands anatomically correct and the exact approved Papuan face, cream-and-blue tunic, brown mantle, bench, basalt synagogue and warm high-window light. His mouth stays closed. No second healing, glow, standing, dance, other people or camera cut." },
  { name: "departure-witnesses", scene: 1, shot: 10, frame: "synagogue-departure-witnesses-v1.png",
    direction: "Mark 3:6, inside the same synagogue while the dark-robed Pharisees already in this frame leave through the open doorway. The seated witnesses respond to the healed man's restored hand with quiet, individually timed amazement: a few relieved smiles and glances, one or two light separate claps, perhaps one person's shoulders swaying briefly with joy. The departing opponents keep moving out with tense, closed postures and do not turn back or speak. No mass synchronized gesture, chanting, intelligible voices, invented meeting, extra people or change of setting." },
  { name: "shoreline-relief", scene: 2, shot: 6, frame: "shoreline-relief-start-v1.png",
    direction: "Mark 3:10–12, continue this exact Galilean lakeshore crowd moment. Jesus's hand stays lightly on the distressed man's head as the man regains composure and straightens slightly; his breathing and expression ease while nearby witnesses respond at different moments with concern turning toward relief. Small natural movement in hair, clothing and water. Preserve every person, identity, garment, building, shoreline, daylight and camera position. No new healing action, additional speech, synchronized gestures, standing miracle pose, crowd chant or cut." },
  { name: "house-jesus-crowded", scene: 4, shot: 1, frame: "house-jesus-crowded-v1.png",
    direction: "Mark 3:20, Jesus is already inside the packed house. As the crush presses around the bread table, he glances at the unreachable bread and at the listeners with quiet fatigue and concern. Several nearby people shift independently to try to make space but cannot. Preserve the table, clothing, basalt walls, roof beams and warm daylight exactly. A gentle camera move toward Jesus; no doorway, arrival, eating, speaking, new people or camera cut." },
  { name: "house-listeners-reverse", scene: 4, shot: 1, frame: "house-listeners-reverse-v1.png",
    direction: "Mark 3:20, distinct reverse view of the same packed house and bread table, over Jesus's hidden shoulder. The listeners react with mixed curiosity and concern while making tiny, independently timed shifts in the crowded space; none reaches the bread. Jesus's mouth stays entirely out of view. Preserve all faces, clothes, furnishings, wall and roof geometry. No doorway, exterior, arrival, new person, speaking mouth or camera cut." },
  { name: "family-doorway-reaction", scene: 5, shot: 5, frame: "family-doorway-reaction-v1.png",
    direction: "Mark 3:31–32, the same three family members remain waiting outside the exact doorway while Jesus and the crowd remain seated within. A subtle camera push brings their hopeful concern into focus as their eyes move toward the room at different moments. Hold their Papuan faces, hair, head coverings and garments exactly as in the supplied frame; no identity change, entering, gesture, speech, visible mouthing, fourth family member or room reconfiguration. Quiet house and threshold ambience only." },
  { name: "open-arms-gesture", scene: 5, shot: 11, frame: "open-arms-before-gesture-v1.png",
    direction: "Mark 3:34–35 wordless pause: Jesus begins with both hands resting naturally near his lap. Over this single continuous take, he slowly opens both arms to include the same seated crowd and arrives at a natural open-palmed pose in the last second. His face shows tender recognition and the nearby listeners gradually soften, each independently. Preserve exact Papuan identity and garment, positions, house geometry, doors, window, light and cast. No one speaks, mouths words, stands, enters or leaves. Quiet natural room ambience only, no music." },
  { name: "open-arms-continuation", scene: 5, shot: 11, frame: "open-arms-continuation-start-v1.png",
    direction: "Direct continuous continuation of the approved Mark 3:34–35 open-arms shot, from this exact last frame. Jesus remains seated with open arms in the same packed house and lets his gaze travel gently across the seated listeners. One or two listeners gradually soften in expression and return his look. Subtle breathing and natural hand movement keep every second alive; no frozen hold. Preserve every face, garment, doorway, wall, light direction and camera axis. No one speaks, mouths words, stands, enters or leaves. Natural room ambience only." }
] as const;

const selected = process.argv[2];
if (selected && !tasks.some(task => task.name === selected)) throw new Error(`Unknown task ${selected}`);
const db = getDb(), root = join(getDataDir(), "assets"), provider = new KlingVideoProvider();
for (const task of tasks.filter(task => !selected || task.name === selected)) {
  const marker = `mark3-implied-emotion-${task.name}-v1`;
  const shot = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
    WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=?`).get(projectId, task.scene, task.shot) as { id: string } | undefined;
  if (!shot) throw new Error(`Planned shot missing for ${marker}`);
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(shot.id, `${marker}%`);
  if (prior) { console.log(JSON.stringify({ marker, prior, action: "inspect before any retry" })); continue; }
  const frame = `${frameDir}/${task.frame}`;
  if (!existsSync(join(root, frame))) throw new Error(`Frame missing: ${frame}`);
  const prompt = `${marker}. Photorealistic 16:9 landscape, one continuous five-second non-lip-sync take from this reviewed frame. Preserve the exact historical first-century setting and Papuan/Hatam identities. ${task.direction} No subtitles, text, modern objects, narration, music, or intelligible speech. Native ambient sound ON; source Hatam performance is assembled separately.`;
  const id = randomUUID(), now = Date.now();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','generate_final_video','1080p',?,'hold_for_review',NULL,0,?)`).run(id, shot.id, prompt, now);
  console.log(JSON.stringify({ marker, id, state: "submitted" }));
  const result = await provider.generateFinal({ shotId: `${shot.id}-${id}`, prompt, characters: [] },
    { resolution: "1080p", startFrame: { path: frame } });
  if (!result.media?.path) throw new Error(`No retained video for ${marker}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, shot.id, `${marker}: inspect performance, physical continuity, sound and source-grounded emotional intensity before selection.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ marker, id, path: result.media.path, costUsdEstimate: result.cost.usd }));
}
