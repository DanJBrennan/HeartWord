/** Append-only QC correction of one stray final frame in Meyah Mark 4. */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backup } from "node:sqlite";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(checkout, "output", "mark4-donor-20261024");
const rel = relative(checkout, root);
if (rel === ".." || rel.startsWith(`..${sep}`) || root.toLowerCase().includes("heartworddata")) throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR = root;
const { getDb } = await import("../src/db/client.js");
const db = getDb();
const projectId = "a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId = "526a00df-8d56-4b2e-9f78-94e6a03dcaf1";
const previousRenderId = "aac17d8e-1cfc-4807-8cfd-fb5b964f3716";
const oldClip = db.prepare(`SELECT c.id, c.timeline_start_ms startMs, c.timeline_end_ms endMs,
  a.id attemptId, a.result_asset_path path, a.created_at createdAt
  FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id
  WHERE c.shot_id=? AND a.operation='assemble_shot' AND a.status='accepted'
  ORDER BY a.created_at DESC LIMIT 1`).get(shotId) as
  { id:string; startMs:number; endMs:number; attemptId:string; path:string; createdAt:number } | undefined;
if (!oldClip || oldClip.startMs !== 0 || oldClip.endMs !== 4167 ||
  oldClip.path.replaceAll("\\","/") !== "generated/assembled/526a00df-8d56-4b2e-9f78-94e6a03dcaf1-276d2b44-69cc-459b-bc06-0f132ecf3c6b.mp4") throw Error("Unexpected shot clip");
const oldRender = db.prepare(`SELECT r.result_asset_path path,r.total_duration_ms durationMs,
  r.shot_count shotCount,m.timeline_json timeline,m.source_audio_json audio
  FROM chapter_renders r JOIN chapter_render_manifests m ON m.render_id=r.id
  WHERE r.id=? AND r.project_id=?`).get(previousRenderId, projectId) as
  {path:string;durationMs:number;shotCount:number;timeline:string;audio:string}|undefined;
if (!oldRender || oldRender.durationMs !== 809685 || oldRender.shotCount !== 145) throw Error("Unexpected finished cut");
const timeline = JSON.parse(oldRender.timeline) as Array<{shotId:string|null;startMs:number;endMs:number}>;
if (!timeline.some(row => row.shotId === shotId && row.startMs === 253585 && row.endMs === 257752))
  throw Error("Shot no longer occupies the reviewed 4:17 window");
const candidateClip = join(root,"review","meyah-mark4-shot-526-tail-20261027","corrected.mp4");
const candidateRender = join(root,"review","meyah-mark4-flash-patch-finished-20261027.mp4");
if (!existsSync(candidateClip) || !existsSync(candidateRender)) throw Error("Corrected preview media missing");
const digest = (path:string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const receiptPath = join(root,"review","meyah-mark4-one-frame-flash-correction-20261027.json");
const backupPath = join(root,"review","heartword.before-one-frame-flash-correction-20261027.sqlite");
if (existsSync(receiptPath) || existsSync(backupPath)) throw Error("Correction already recorded");
const oldClipPath = join(root,"assets",oldClip.path);
const oldRenderPath = join(root,"assets",oldRender.path);
const oldClipHash = digest(oldClipPath), oldRenderHash=digest(oldRenderPath);
const newClipHash=digest(candidateClip), newRenderHash=digest(candidateRender);
if (newClipHash === oldClipHash || newRenderHash === oldRenderHash) throw Error("No changed media to record");
await backup(db, backupPath);
const backupHash=digest(backupPath);
const clipRelative=`generated/assembled/${shotId}-one-frame-qc-20261027.mp4`;
const renderId=randomUUID();
const renderRelative=`generated/chapter/${projectId}/${renderId}.mp4`;
const newClipPath=join(root,"assets",clipRelative);
const newRenderPath=join(root,"assets",renderRelative);
if (existsSync(newClipPath) || existsSync(newRenderPath)) throw Error("Target media already exists");
copyFileSync(candidateClip,newClipPath);
copyFileSync(candidateRender,newRenderPath);
const attemptId=randomUUID(),clipId=randomUUID(),commandId=randomUUID(),noteId=randomUUID(),now=Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES(?,?,'local','ffmpeg-one-frame-qc','assemble_shot','1280x720',?,'accepted',?,0,?)`)
    .run(attemptId,shotId,"Hold original frame 98 for one additional 24fps frame; original frame 99 was a stray Jesus angle.",clipRelative,now);
  db.prepare(`INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)
    VALUES(?,?,?,0,4167,?)`).run(clipId,shotId,attemptId,now);
  db.prepare(`INSERT INTO chapter_renders(id,project_id,result_asset_path,total_duration_ms,shot_count,created_at)
    VALUES(?,?,?,?,?,?)`).run(renderId,projectId,renderRelative,oldRender.durationMs,oldRender.shotCount,now);
  db.prepare(`INSERT INTO chapter_render_manifests(render_id,timeline_json,source_audio_json)
    VALUES(?,?,?)`).run(renderId,oldRender.timeline,oldRender.audio);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?")
    .get(projectId) as {n:number}).n);
  db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    VALUES(?,?,?,'correct_rendered_flash',?,?,?)`).run(commandId,projectId,sequence,
    JSON.stringify({parentRenderId:previousRenderId,renderId,shotId,oldClipId:oldClip.id,clipId,attemptId,
      originalShotFrame:99,replacementShotFrame:98,originalFilmFrame:6185,replacementFilmFrame:6184,
      oldClipHash,newClipHash,oldRenderHash,newRenderHash,renderPath:renderRelative,
      reason:"One stray picture frame at 257.708 seconds; source clock, audio mix, timing and every other frame retained."}),
    "meyah-mark4-one-frame-flash-20261027",now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,1,?)`).run(noteId,projectId,shotId,
      "Isolated QC correction: replaced the source clip's anomalous last frame and the corresponding finished-film frame with the preceding disciples frame. Original media and render remain in history.",now);
  db.exec("COMMIT");
} catch(error) { db.exec("ROLLBACK"); throw error; }
const quick=(db.prepare("PRAGMA quick_check").get() as {quick_check:string}).quick_check;
if (quick !== "ok") throw Error("SQLite check failed");
const receipt={projectId,shotId,previousRenderId,renderId,oldClipHash,newClipHash,oldRenderHash,newRenderHash,
  backupPath,backupHash,commandId,attemptId,clipId,quickCheck:quick,liveDatabaseOpened:false,providerRequests:0};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt,null,2));
