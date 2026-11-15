/** Records reviewed Scene 2 picture beats as editable source-timed shots. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId = "dcfeacde-0b67-4a40-be25-2762ae1d5d92";
const editKey = "mark3-scene2-complete-source-picture-coverage-v1";
const root = join(getDataDir(), "assets"), db = getDb();
const review = join(root, "generated/video/review/mark3-scene2-full-source-review-r1.mp4");
if (!existsSync(review)) throw new Error("Full source-continuous Scene 2 review cut is missing.");
const existing = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?")
  .get(projectId, editKey) as { payload: string } | undefined;
if (existing) { console.log(existing.payload); process.exit(0); }

const originals = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? ORDER BY sequence")
  .all(sceneId) as Array<{ id: string; sequence: number }>;
if (originals.length !== 6 || originals.some((s, i) => s.sequence !== i + 1)) throw new Error("Original six-shot Scene 2 plan changed.");
const expected = [
  ["cec159dc-4d9d-4daf-a7bc-63aac1ed401b", 8000],
  ["041090e1-8c2d-44b3-b2ab-acb9d995b5aa", 8000],
  ["752177c1-a318-4d6f-b898-c692763fd6e0", 8000],
  ["ffb0efa5-17ed-455a-a444-2f206a8643fd", 4000],
  ["cbe08d3c-9b3e-42f7-a982-9fd072ff1e15", 1933],
  ["cd6c7ea1-725a-43be-825e-42f4b39cf183", 4000]
] as const;
for (let i = 0; i < 6; i++) {
  const row = db.prepare("SELECT c.timeline_start_ms,c.timeline_end_ms FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=? AND a.operation!='assemble_shot'")
    .get(expected[i]![0]) as { timeline_start_ms: number; timeline_end_ms: number } | undefined;
  if (originals[i]!.id !== expected[i]![0] || row?.timeline_start_ms !== 0 || row.timeline_end_ms !== expected[i]![1]) throw new Error(`Selected original Shot ${i + 1} changed.`);
}
const sourceStart = db.prepare("SELECT start_ms FROM audio_segments WHERE project_id=? AND layer='original_reading' AND id=?")
  .get(projectId, "d514fded-17e7-45db-9692-2cb514ac27d8") as { start_ms: number } | undefined;
const nextScene = db.prepare("SELECT start_ms FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms>=172258 ORDER BY start_ms LIMIT 1")
  .get(projectId) as { start_ms: number } | undefined;
if (sourceStart?.start_ms !== 92799 || nextScene?.start_ms !== 172258) throw new Error("Source-timed Scene 2 boundaries changed.");

const candidate = (id: string) => {
  const row = db.prepare("SELECT shot_id,status,result_asset_path FROM generation_attempts WHERE id=? AND operation='generate_final_video'")
    .get(id) as { shot_id: string; status: string; result_asset_path: string | null } | undefined;
  if (!row || row.status !== "hold_for_review" || !row.result_asset_path || !existsSync(join(root, row.result_asset_path))) throw new Error(`Reviewed candidate ${id} missing.`);
  return row;
};
const a = candidate("a80b8941-288a-4c8b-9c5e-02e891e77889");
const b = candidate("64349e84-c51c-4ef4-916a-617e4fc4d04a");
const c = candidate("9adcd197-3acd-4f26-b8a1-5408bce2513b");
const boat = candidate("6d08fa72-97e0-4eab-bd35-7062c819e3ac");
const mat = candidate("ac80556c-3216-422c-b187-904fac6b7d01");
const kneel = candidate("4e1eaa35-44b3-4463-8d4b-83382cd7c587");
for (const [row, original] of [[a, 0], [b, 0], [c, 0], [boat, 1], [mat, 2], [kneel, 3]] as const)
  if (row.shot_id !== originals[original]!.id) throw new Error("Candidate/shot provenance mismatch.");

const lastLine = db.prepare("SELECT a.result_asset_path FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=? AND a.operation='lip_sync'")
  .get(originals[4]!.id) as { result_asset_path: string } | undefined;
const stern = db.prepare("SELECT a.result_asset_path FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=? AND a.operation='generate_final_video'")
  .get(originals[5]!.id) as { result_asset_path: string } | undefined;
if (!lastLine?.result_asset_path || !stern?.result_asset_path) throw new Error("Approved spoken insert or stern order missing.");

const local = {
  c: "generated/video/review/mark3-scene2-verse7-8-c-8498ms-r1.mp4",
  pause: "generated/video/review/mark3-scene2-post-cry-pause-755ms-r1.mp4",
  hold: "generated/video/review/mark3-scene2-stern-hold-3507ms-r1.mp4",
  pauseFrame: "generated/keyframes/review/mark3-scene2-post-cry-pause-start-r1.png",
  holdFrame: "generated/keyframes/review/mark3-scene2-stern-hold-start-r1.png"
};
for (const path of Object.values(local)) mkdirSync(dirname(join(root, path)), { recursive: true });
const run = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "ignore", "pipe"], timeout: 120000 });
if (!existsSync(join(root, local.c))) run(["-i", join(root, c.result_asset_path!), "-an", "-vf", "fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,tpad=stop_mode=clone:stop_duration=0.6", "-frames:v", "204", "-c:v", "libx264", "-crf", "18", join(root, local.c)]);
if (!existsSync(join(root, local.pauseFrame))) run(["-sseof", "-0.08", "-i", join(root, lastLine.result_asset_path), "-frames:v", "1", join(root, local.pauseFrame)]);
if (!existsSync(join(root, local.holdFrame))) run(["-sseof", "-0.08", "-i", join(root, stern.result_asset_path), "-frames:v", "1", join(root, local.holdFrame)]);
if (!existsSync(join(root, local.pause))) run(["-loop", "1", "-framerate", "24", "-i", join(root, local.pauseFrame), "-frames:v", "18", "-an", "-c:v", "libx264", "-crf", "18", join(root, local.pause)]);
if (!existsSync(join(root, local.hold))) run(["-loop", "1", "-framerate", "24", "-i", join(root, local.holdFrame), "-frames:v", "84", "-an", "-c:v", "libx264", "-crf", "18", join(root, local.hold)]);

const additions = [
  { key: "follow-a", after: 1, parent: 0, start: 100799, end: 108799, donor: "a80b8941-288a-4c8b-9c5e-02e891e77889", path: a.result_asset_path!, frame: "generated/keyframes/review/mark3-scene2-verse7-8-continuation-a-v1-start.png", action: "The same group continues withdrawing along the seashore as the crowd follows at varied paces." },
  { key: "follow-b", after: 1, parent: 0, start: 108799, end: 116799, donor: "64349e84-c51c-4ef4-916a-617e4fc4d04a", path: b.result_asset_path!, frame: "generated/keyframes/codex/cec159dc-4d9d-4daf-a7bc-63aac1ed401b/scene-2-shot-1-tight-follow-coverage-r1.png", action: "Closer walking coverage of the same central figure and two disciples; the larger crowd follows behind." },
  { key: "follow-c", after: 1, parent: 0, start: 116799, end: 125297, donor: "9adcd197-3acd-4f26-b8a1-5408bce2513b", path: local.c, frame: "generated/keyframes/review/mark3-scene2-verse7-8-continuation-c-v1-start.png", action: "The same group keeps moving as the waterfront opens in view; the final half-second holds through the natural verse pause." },
  { key: "boat", after: 2, parent: 1, start: 133297, end: 139297, donor: "6d08fa72-97e0-4eab-bd35-7062c819e3ac", path: boat.result_asset_path!, frame: "generated/keyframes/codex/041090e1-8c2d-44b3-b2ab-acb9d995b5aa/scene-2-shot-2-boat-coverage-r1.png", action: "The already-present disciples quietly steady the small boat while the crowd remains behind them." },
  { key: "mat", after: 3, parent: 2, start: 147297, end: 152065, donor: "ac80556c-3216-422c-b187-904fac6b7d01", path: mat.result_asset_path!, frame: "generated/keyframes/codex/752177c1-a318-4d6f-b898-c692763fd6e0/scene-2-shot-3-mat-coverage-r1.png", action: "Closer view of the same ailing people: the walking staff and carried woven mat approach through the crowd." },
  { key: "kneel", after: 4, parent: 3, start: 156065, end: 162063, donor: "4e1eaa35-44b3-4463-8d4b-83382cd7c587", path: kneel.result_asset_path!, frame: "generated/keyframes/review/mark3-scene2-s4-coverage-v1-start.png", action: "The same man remains kneeling before Jesus during the narration lead-in, looking up before his separately lip-synced cry." },
  { key: "post-cry-pause", after: 5, parent: 4, start: 163996, end: 164751, donor: "94523e4f-1d40-4c67-ae8b-3d656fa69753", path: local.pause, frame: local.pauseFrame, action: "A brief still reaction on the man after his cry, during the exact natural pause before narration resumes." },
  { key: "stern-hold", after: 6, parent: 5, start: 168751, end: 172258, donor: "b8c2711a-7f6b-4b47-b1d9-6c149a1ea449", path: local.hold, frame: local.holdFrame, action: "Hold the approved stern-order closing frame through the remaining narration and its natural pause." }
] as const;
if (additions.some((item, i) => item.start >= item.end || !existsSync(join(root, item.path)) || !existsSync(join(root, item.frame)))) throw new Error("Incomplete coverage assets.");
const timeline = [
  { original: 0, start: 92799, end: 100799 }, additions[0], additions[1], additions[2],
  { original: 1, start: 125297, end: 133297 }, additions[3],
  { original: 2, start: 139297, end: 147297 }, additions[4],
  { original: 3, start: 152065, end: 156065 }, additions[5],
  { original: 4, start: 162063, end: 163996 }, additions[6],
  { original: 5, start: 164751, end: 168751 }, additions[7]
] as const;
for (let i = 1; i < timeline.length; i++) if (timeline[i - 1]!.end !== timeline[i]!.start) throw new Error(`Coverage gap at ${i}.`);
if (timeline[0]!.start !== 92799 || timeline.at(-1)!.end !== 172258) throw new Error("Scene source span changed.");

const now = Date.now(), selected: Array<{ key: string; shotId: string; sequence: number; start: number; end: number; donor: string; path: string }> = [];
db.exec("BEGIN IMMEDIATE");
try {
  for (const shot of originals) db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(100 + shot.sequence, shot.id);
  for (const [i, item] of timeline.entries()) {
    const sequence = i + 1;
    if ("original" in item) { db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(sequence, originals[item.original]!.id); continue; }
    const id = randomUUID(), parent = originals[item.parent]!.id;
    db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
      SELECT ?,scene_id,?,?,verse_ref,framing,camera_movement,0,NULL,'single_clip',?,crowd_density,continuity_notes,spatial_view,'keyframe_approved',? FROM shots WHERE id=?`)
      .run(id, sequence, item.action, `${item.start}–${item.end} ms source picture. ${item.key}; donor attempt ${item.donor}. Original narration/cast audio is assembled continuously, not sliced at the picture cut.`, now, parent);
    db.prepare("INSERT INTO shot_characters (shot_id,character_id) SELECT ?,character_id FROM shot_characters WHERE shot_id=?").run(id, parent);
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','reviewed-source-keyframe','generate','16:9',?,'accepted',?,0,?)")
      .run(randomUUID(), id, `Source-timed ${item.key} keyframe derived from donor attempt ${item.donor}; ${item.action}`, item.frame, now);
    const videoAttempt = randomUUID();
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','reviewed-scene2-coverage','generate_final_video','720p',?,'accepted',?,0,?)")
      .run(videoAttempt, id, `Selected ${item.key} coverage from original generation attempt ${item.donor}; preview-checked in mark3-scene2-full-source-review-r1.mp4. Provider audio discarded.`, item.path, now);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)")
      .run(randomUUID(), id, videoAttempt, item.end - item.start, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(), projectId, id, `${item.action} Source ${item.start}–${item.end} ms. ${item.key === "post-cry-pause" || item.key === "stern-hold" ? "Source-grounded brief still hold; no provider speech." : "Reviewed for canon and causal continuity; original Hatam soundtrack remains continuous."}`, now);
    selected.push({ key: item.key, shotId: id, sequence, start: item.start, end: item.end, donor: item.donor, path: item.path });
  }
  for (const item of [a, b, c, boat, mat, kneel]) db.prepare("UPDATE generation_attempts SET status='accepted' WHERE shot_id=? AND result_asset_path=? AND status='hold_for_review'")
    .run(item.shot_id, item.result_asset_path);
  for (const frame of [additions[1]!.frame, additions[3]!.frame, additions[4]!.frame]) db.prepare("UPDATE generation_attempts SET status='accepted' WHERE operation='generate' AND result_asset_path=? AND status='hold_for_review'").run(frame);
  const sequence = Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as { n: number }).n);
  const payload = JSON.stringify({ sceneId, sourceStartMs: 92799, sourceEndMs: 172258, review: "generated/video/review/mark3-scene2-full-source-review-r1.mp4", originalSequences: originals, selected,
    rationale: "Six earlier selected clips covered only 33.933 of 79.459 source-timed seconds. Eight source-grounded coverage shots close exact picture gaps while keeping the approved original clips and 1.933-second lip-sync line. The final 0.498, 0.755 and 3.507 seconds are intentional brief still holds, with the last hold spanning 1.358 seconds narration and the 2.149-second natural pause. Rejected synchronized-crowd attempts remain retained; provider sound is discarded except producer-approved quiet bridge breathing in the review mix." });
  db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
    .run(randomUUID(), projectId, sequence, "insert_source_timed_scene_coverage", payload, editKey, now);
  db.exec("COMMIT");
  console.log(payload);
} catch (error) { db.exec("ROLLBACK"); throw error; }
