/** Persist pause-aligned Mark 3:4 coverage and three held imagegen candidates. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";
const JESUS_ID = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const APPROVED_SHOT_KEYFRAME = "generated/keyframes/codex/0e456bc8-a7fd-4dd2-877c-32b0b0d661b5/scene-1-shot-4-pre-healing-state-r2.png";
const CANDIDATE_ROOT = "generated/keyframes/codex-coverage/0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";

const beats = [
  {
    sequence: 1, type: "lip_sync_insert", start: 0, end: 6755, needsLipSync: 1, characterId: JESUS_ID,
    file: `${CANDIDATE_ROOT}/scene1-shot4-beat1-close-r1.png`,
    notes: "Opening Jesus question, camera toward seated leaders. Jesus is the only visible face and must be audio-driven lip-synced. Cut at the center of the measured 6.480-7.009 s composite pause (source-local 6755 ms). Candidate still requires Dan's review.",
    prompt: "Use case: historical-scene. 16:9 photorealistic Mark 3:4 lip-sync keyframe. Image 1: approved Shot 4 synagogue composition/setting; Image 2: approved Jesus v5 headshot and garment. New eye-level medium-close camera angle of canonical Papuan Jesus addressing seated leaders, only Jesus's face visible, mouth neutral for audio-driven lip-sync. Preserve cream tunic neckline and indigo-banded mantle, dark basalt room scale, warm high-window daylight, and the pre-healing story moment. No new people, healing, doorway crossing, costume drift, text or watermark."
  },
  {
    sequence: 2, type: "cutaway", start: 6755, end: 10053, needsLipSync: 0, characterId: null,
    file: `${CANDIDATE_ROOT}/scene1-shot4-beat2-ots-r1.png`,
    notes: "Middle of the same continuous Jesus line. Over Jesus's shoulder from behind: his mouth is completely hidden; the seated leaders listen without speaking. Cuts occur in measured composite pauses at 6.480-7.009 and 9.809-10.265 s. Candidate still requires Dan's review.",
    prompt: "Use case: historical-scene. 16:9 photorealistic Mark 3:4 cutaway keyframe. Image 1: approved Shot 4 synagogue composition/people/lighting reference. New reverse camera angle from directly behind Jesus; back of head and shoulder in near foreground with his mouth completely invisible. Same seated Papuan leaders in established positions, tense silent listening, varied natural poses. Preserve dark basalt room width, high windows, warm readable daylight and first-century garments. No reply, healing, arrival, exit, new people, text or watermark."
  },
  {
    sequence: 3, type: "lip_sync_insert", start: 10053, end: 14000, needsLipSync: 1, characterId: JESUS_ID,
    file: `${CANDIDATE_ROOT}/scene1-shot4-beat3-close-r1.png`,
    notes: "Closing portion of Jesus's question, returning to a distinct tighter single-face angle for audio-driven lip-sync. The final 13.029-13.834 s pause remains within this beat; preserve its cadence, do not animate speech through it. Candidate still requires Dan's review.",
    prompt: "Use case: historical-scene. 16:9 photorealistic final Mark 3:4 lip-sync keyframe. Images 1-2: approved Shot 4 ensemble and Jesus v5 headshot; Image 3: proposed earlier Shot 4 close-up for identity and light continuity. New distinct tighter eye-level close-up of the same canonical Papuan Jesus, only visible face, looking toward seated leaders just off lens, mouth neutral for audio-driven lip-sync. Preserve dark basalt synagogue and bright high-window light, cream tunic neckline and indigo-banded garment. No healing, costume or identity change, extra faces, invented dialogue, text or watermark."
  }
] as const;

const db = getDb(), dataDir = getDataDir();
const shot = db.prepare(`SELECT sh.coverage_plan,sh.needs_lip_sync,sh.dialogue_character_id,sh.verse_ref
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sh.id=? AND sc.project_id=? AND sc.sequence=1 AND sh.sequence=4`).get(SHOT_ID, PROJECT_ID) as {
    coverage_plan: string; needs_lip_sync: number; dialogue_character_id: string; verse_ref: string;
  } | undefined;
if (!shot || shot.coverage_plan !== "covered_sequence" || shot.needs_lip_sync !== 1 || shot.dialogue_character_id !== JESUS_ID || shot.verse_ref !== "Mark 3:4") {
  throw new Error("Shot 4's approved speaking plan has changed.");
}
if (db.prepare("SELECT id FROM coverage_beats WHERE shot_id=? LIMIT 1").get(SHOT_ID) ||
    db.prepare("SELECT id FROM clips WHERE shot_id=? LIMIT 1").get(SHOT_ID)) {
  throw new Error("Shot 4 already has coverage or clips; inspect before planning again.");
}
const keyframe = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path=? LIMIT 1")
  .get(SHOT_ID, APPROVED_SHOT_KEYFRAME);
if (!keyframe) throw new Error("Shot 4's approved keyframe has changed.");
const audio = db.prepare(`SELECT ub.source_start_ms,ub.source_end_ms,ub.source_hash,m.source_hash AS mapped_hash,
    c.start_ms AS composite_start,c.end_ms AS composite_end,c.source_path,
    bound.voice_id AS bound_voice,bound.voice_provider AS bound_provider,
    current.voice_id AS current_voice,current.voice_provider AS current_provider
  FROM shot_utterance_bindings ub JOIN audio_segments o ON o.id=ub.source_audio_segment_id
  JOIN composite_audio_source_map m ON m.original_segment_id=o.id
  JOIN audio_segments c ON c.id=m.composite_segment_id AND c.project_id=? AND c.layer='composite_cast_master'
  JOIN character_versions bound ON bound.id=ub.character_version_id
  JOIN character_versions current ON current.id=m.voice_version_id AND current.character_id=bound.character_id AND current.status='approved'
  WHERE ub.shot_id=? AND o.project_id=? AND c.speaker_character_id=?`).all(PROJECT_ID, SHOT_ID, PROJECT_ID, JESUS_ID) as Array<{
    source_start_ms: number; source_end_ms: number; source_hash: string; mapped_hash: string;
    composite_start: number; composite_end: number; source_path: string;
    bound_voice: string; bound_provider: string; current_voice: string; current_provider: string;
  }>;
if (audio.length !== 1 || audio[0]!.source_end_ms-audio[0]!.source_start_ms !== 14000 ||
    audio[0]!.composite_start !== 0 || audio[0]!.composite_end !== 13978 ||
    audio[0]!.source_hash !== audio[0]!.mapped_hash ||
    audio[0]!.bound_voice !== audio[0]!.current_voice || audio[0]!.bound_provider !== audio[0]!.current_provider ||
    !existsSync(join(dataDir,"assets",audio[0]!.source_path))) {
  throw new Error("The approved 14-second Jesus line or voice continuity has changed.");
}
if (beats[0].start !== 0 || beats.at(-1)!.end !== 14000 || beats.some((b,i)=>i>0 && b.start!==beats[i-1]!.end)) {
  throw new Error("Coverage beats must exactly tile the approved 14-second line.");
}
for (const beat of beats) {
  const abs = join(dataDir,"assets",beat.file);
  if (!existsSync(abs)) throw new Error(`Candidate image is missing: ${abs}`);
  const dimensions = execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=p=0",abs],{encoding:"utf8"}).trim();
  if (dimensions !== "1672,941") throw new Error(`Candidate image has unexpected dimensions: ${beat.file} ${dimensions}`);
}

const insertBeat = db.prepare(`INSERT INTO coverage_beats
  (id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,audio_confidence,needs_lip_sync,character_id,
   requires_new_keyframe,keyframe_asset_path,notes,status,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,1,?,?,'generated',?)`);
const insertCandidate = db.prepare(`INSERT INTO coverage_keyframe_attempts
  (id,coverage_beat_id,provider,model,prompt,status,result_asset_path,created_at)
  VALUES (?,?,'codex_imagegen','not_reported',?,'hold_for_review',?,?)`);
const now = Date.now(), created: Array<{ sequence:number; beatId:string; attemptId:string; path:string; sha256:string }> = [];
db.exec("BEGIN IMMEDIATE");
try {
  for (const beat of beats) {
    const beatId = randomUUID(), attemptId = randomUUID();
    const sha256 = createHash("sha256").update(readFileSync(join(dataDir,"assets",beat.file))).digest("hex");
    insertBeat.run(beatId,SHOT_ID,beat.sequence,beat.type,beat.start,beat.end,85,beat.needsLipSync,beat.characterId,beat.file,beat.notes,now);
    insertCandidate.run(attemptId,beatId,beat.prompt,beat.file,now);
    created.push({ sequence:beat.sequence,beatId,attemptId,path:beat.file,sha256 });
  }
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),PROJECT_ID,SHOT_ID,
      `Shot 4 coverage planned from measured pauses in the 13.978 s approved Jesus composite: 0-6755 ms single-face lip-sync, 6755-10053 ms over-the-shoulder with Jesus's mouth hidden, 10053-14000 ms single-face lip-sync. Composite cut centers 6744 and 10037 ms lie within silence windows 6479-7009 and 9809-10265 ms; source-local times account for 14000/13978 duration mapping. Audio confidence 85: pause-aligned, not a language-reviewer attestation. Three Codex imagegen candidates are held for Dan's review; no beat image is selected and no video was submitted. Candidate hashes: ${created.map(c=>`${c.sequence}:${c.sha256}`).join(" ")}.`,now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ shotId:SHOT_ID, compositeDurationMs:13978, sourceDurationMs:14000, beats:created }));
