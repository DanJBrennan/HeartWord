/** Reopenable synthetic UI proof. No production database or provider is used.
 * Run: $env:HEARTWORD_DATA_DIR='C:/Users/danbr/HeartWordData/scratch/production-view-demo-2026-10-15'; npx tsx scripts/production-view-demo.ts
 * Only explicitly labelled /demo actions can change its fixture records.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
const root = resolve(process.env.HEARTWORD_DATA_DIR ?? "");
assert.equal(root, resolve("C:/Users/danbr/HeartWordData/scratch/production-view-demo-2026-10-15"), "Use the explicit isolated proof root.");
mkdirSync(root, { recursive: true });
const marker = join(root, "TEST-FILM.json");
if (existsSync(marker)) assert.equal(JSON.parse(readFileSync(marker, "utf8")).purpose, "production-view-synthetic-proof");
else writeFileSync(marker, JSON.stringify({ purpose: "production-view-synthetic-proof", productionDataConnected: false }));
globalThis.fetch = (async () => { throw new Error("Provider/network calls disabled in the synthetic proof process."); }) as typeof fetch;
const { getDb } = await import("../src/db/client.js");
const { projectsRouter } = await import("../src/server/routes/projects.js");
const { productionRouter } = await import("../src/server/routes/production.js");
const { charactersRouter } = await import("../src/server/routes/characters.js");
const { PRODUCTION_CREW } = await import("../src/server/production-crew.js");
const { readProductionView } = await import("../src/server/production-view.js");
const { beginVideoJob } = await import("../src/pipeline/media-generation/video-job-status.js");
const db = getDb(), projectId = "producer-view-test-film", now = Date.now();
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM projects WHERE id NOT IN (?,?)").get(projectId, "producer-view-other")!.n), 0, "Refuse another film in this fixture DB.");
const media = join(root, "assets", "test"); mkdirSync(media, { recursive: true });
if (!existsSync(join(media, "take1.mp4"))) {
  for (let i = 1; i <= 3; i++) {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=24:duration=3`, "-vf", `hue=h=${i * 40}`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", join(media, `take${i}.mp4`)]);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", join(media, `take${i}.mp4`), "-frames:v", "1", "-y", join(media, `keyframe${i}.png`)]);
  }
  for (const [file, frequency] of [["source", 440], ["cast", 660], ["ambience", 160], ["music", 220]] as const) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=8`, "-c:a", "pcm_s16le", "-y", join(media, `${file}.wav`)]);
}
if (!db.prepare("SELECT id FROM projects WHERE id=?").get(projectId)) {
  db.prepare("INSERT INTO projects VALUES (?,'hatam','mark',5,'media_generation','in_progress',?,?)").run(projectId, now, now);
  db.prepare("INSERT INTO projects VALUES ('producer-view-other','hatam','mark',6,'ingestion','not_started',?,?)").run(now, now);
  db.prepare("INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,summary,created_at) VALUES ('demo-scene',?,1,'Mark 5:1','Mark 5:3','SYNTHETIC PLAN: test patterns, not Scripture illustration',?)").run(projectId, now);
  for (let i = 1; i <= 3; i++) {
    db.prepare("INSERT INTO shots(id,scene_id,sequence,action,verse_ref,framing,camera_movement,created_at) VALUES (?,'demo-scene',?,?,?,'wide','static',?)").run(`demo-shot${i}`, i, `PROPOSED synthetic test composition ${i}. No Scripture action or acting approval.`, `Mark 5:${i}`, now);
    if (i < 3) db.prepare("INSERT INTO generation_attempts VALUES (?,?,'synthetic_fixture','test-pattern','generate',NULL,'Fixture pixels only','accepted',?,0,?)").run(`keyframe${i}`, `demo-shot${i}`, `test/keyframe${i}.png`, now);
    db.prepare("INSERT INTO generation_attempts VALUES (?,?,'synthetic_fixture','test-pattern','generate_final_video','360p','Scripted fixture; no provider call',?,?,0,?)").run(`take${i}`, `demo-shot${i}`, i === 1 ? "accepted" : "hold_for_review", i === 3 ? "test/missing.mp4" : `test/take${i}.mp4`, now);
  }
  db.prepare("INSERT INTO clips VALUES ('demo-clip1','demo-shot1','take1',0,2000,?)").run(now);
  db.prepare("INSERT INTO coverage_beats(id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,notes,created_at) VALUES ('demo-beat','demo-shot3',1,'cutaway',0,2000,'Proposed wordless coverage; no footage exists',?)").run(now);
  db.prepare("INSERT INTO review_notes VALUES ('demo-hold',?,'shot','demo-shot2','human','Synthetic producer hold: inspect framing before acceptance',0,?)").run(projectId, now);
  for (const [id, layer, path, start, end] of [["source", "original_reading", "source", 0, 2000], ["cast", "composite_cast_master", "cast", 3000, 5000]] as const) db.prepare("INSERT INTO audio_segments VALUES (?,?,?, ?,?,?,NULL,'Mark 5:1',90,?)").run(`demo-${id}`, projectId, layer, `test/${path}.wav`, start, end, now);
  for (const kind of ["music", "sfx"]) db.prepare("INSERT INTO production_audio_assets VALUES (?,?,?,'Synthetic tone; no real sound design approval',?,'fixture',8000,?)").run(`demo-${kind}`, projectId, kind, `test/${kind === "sfx" ? "ambience" : "music"}.wav`, now);
  const brief = { source: { text: [{ verse: 1, text: "SYNTHETIC SOURCE WORDS — not Hatam Scripture" }], reference: [{ verse: 1, text: "SYNTHETIC REFERENCE — not Scripture" }], hashes: [] } };
  const output = { summary: "Synthetic cinematography proposal: keep the composition clear", directions: [{ shotId: "demo-shot2", instruction: "Clear framing", scriptureBasis: "Synthetic evidence only" }], findings: [{ shotId: "demo-shot2", severity: "blocking", evidence: "Scripted disagreement about framing", requestedChange: "Retain established subject; adjust camera" }] };
  db.prepare("INSERT INTO production_runs VALUES ('demo-run',?,'planning','fixture',?,'held',?, ?,?,NULL)").run(projectId, JSON.stringify(brief), JSON.stringify({ status: "held", summary: "Scripted plan disagreement retained", calls: 1, contributions: { cinematographer: output } }), now, now);
  db.prepare("INSERT INTO production_events VALUES ('demo-event','demo-run',1,'cinematographer',1,'Synthetic fixture prompt',?,NULL,'scripted',0,?)").run(JSON.stringify(output), now);
}
// Additive console fixture: a real saved clock with a pause, mapped cast file,
// applied music/effects and an explicitly missing picture interval.
if (!existsSync(join(media, "recorded-cut.mp4"))) execFileSync("ffmpeg", ["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=640x360:rate=24:duration=7","-f","lavfi","-i","sine=frequency=440:duration=7","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest","-y",join(media,"recorded-cut.mp4")]);
for (let i=2;i<=3;i++) db.prepare("INSERT OR IGNORE INTO audio_segments VALUES (?,?, 'original_reading','test/source.wav',?,?,NULL,?,90,?)").run(`demo-source${i}`,projectId,(i-1)*2000,i*2000,`Mark 5:${i}`,now);
db.prepare("INSERT OR IGNORE INTO composite_audio_source_map VALUES ('demo-cast','demo-source','synthetic',NULL,?)").run(now);
db.prepare("INSERT OR IGNORE INTO chapter_renders VALUES ('demo-render',?,'test/recorded-cut.mp4',7000,3,?)").run(projectId,now);
db.prepare("INSERT OR IGNORE INTO chapter_render_manifests VALUES ('demo-render',?,?)").run(JSON.stringify([1,2,3].map((i) => ({shotId:`demo-shot${i}`,startMs:i===1?0:(i-1)*2000+1000,endMs:i*2000+1000,sourceStartMs:0}))),JSON.stringify([1,2,3].map(i => ({segmentId:i===1?'demo-source':`demo-source${i}`,startMs:(i-1)*2000+1000,endMs:i*2000+1000,sourceStartMs:(i-1)*2000,sourceEndMs:i*2000,voice:i===1?'cast':'original'}))));
const mix = {status:'approved',summary:'SYNTHETIC applied tone placements only',contributions:{sound_designer:{audioCues:[{assetId:'demo-sfx',startMs:0,endMs:7000,sourceStartMs:0,gainDb:-28}]},composer:{audioCues:[{assetId:'demo-music',startMs:0,endMs:7000,sourceStartMs:0,gainDb:-30}]}}};
db.prepare("INSERT OR IGNORE INTO production_runs VALUES ('demo-mix',?,'finishing','fixture','{}','approved',?,?,?,NULL)").run(projectId,JSON.stringify(mix),now,now);
db.prepare("INSERT OR IGNORE INTO edit_commands VALUES ('demo-mix-decision',?,2,'apply_finishing',?,'demo-mix',?,0)").run(projectId,JSON.stringify({renderId:'demo-render',runId:'demo-mix'}),now);
const app = express(); app.use(express.json()); let disconnected = false;
db.prepare("INSERT OR IGNORE INTO stage_executions VALUES ('demo-stage',?,'media_generation','fixture','fixture','held',1,'SYNTHETIC stage awaiting candidate review',NULL,?,?,'synthetic-proof')").run(projectId, now, now);
app.use((req, res, next) => { if (req.path.endsWith("/production/view") && disconnected) { res.status(503).json({ error: "Simulated loss of production evidence" }); return; } if (req.path.startsWith("/api") && req.method !== "GET") { res.status(403).json({ error: "Production mutations disabled in this proof. Use labelled /demo fixture actions." }); return; } next(); });
app.get("/api/voices", (_req, res) => res.json({ voices: [] }));
app.get("/api/control-room/roster", (_req, res) => res.json({ roster: PRODUCTION_CREW }));
app.use("/api/projects", projectsRouter); app.use("/api/projects/:projectId/production", productionRouter); app.use("/api/characters", charactersRouter);
const evidence = () => { const snapshot = readProductionView(db, root, projectId); writeFileSync(join(root, "workflow-evidence.json"), JSON.stringify({ purpose: "synthetic-producer-view-mechanical-proof", providerSubmissions: 0, productionDataConnected: false, snapshot }, null, 2)); return snapshot; };
app.post("/demo/arrive", (_req, res) => {
  db.exec("BEGIN IMMEDIATE"); try {
    db.exec("UPDATE generation_attempts SET status='accepted' WHERE id='take2'; UPDATE review_notes SET resolved=1 WHERE id='demo-hold'");
    db.prepare("INSERT OR IGNORE INTO clips VALUES ('demo-clip2','demo-shot2','take2',0,2000,?)").run(Date.now());
    db.prepare("INSERT OR IGNORE INTO edit_commands VALUES ('demo-accept',?,1,'synthetic_review_acceptance','{\"evidence\":\"Scripted test pattern acceptance; no real approval\"}','demo-accept',?,0)").run(projectId, Date.now());
    db.exec("COMMIT"); res.json(evidence());
  } catch (error) { db.exec("ROLLBACK"); throw error; }
});
app.post("/demo/hold", (_req,res) => { db.exec("UPDATE generation_attempts SET status='hold_for_review' WHERE id='take2'; UPDATE review_notes SET resolved=0 WHERE id='demo-hold'"); res.json(evidence()); });
app.post("/demo/disconnect", (_req, res) => { disconnected = true; res.json({ disconnected }); });
app.post("/demo/reconnect", (_req, res) => { disconnected = false; res.json(evidence()); });
let job: ReturnType<typeof beginVideoJob> | undefined;
app.post("/demo/work", (_req, res) => { job ??= beginVideoJob(db, projectId, "demo-shot3", "synthetic-external"); job.progress({ phase: "submitted", percentage: 25, currentStep: 1, totalSteps: 4 }); res.json(evidence()); });
app.post("/demo/fail", (_req, res) => { job?.finish("error", { error: "Synthetic external failure — no file returned" }); job = undefined; res.json(evidence()); });
app.get("/", (_req, res) => {
  const html = readFileSync("dist/web/index.html", "utf8");
  res.type("html").send(html.replace("<body>", `<body><aside style="padding:12px;background:#fff2bf;border:2px solid #a57719">SYNTHETIC TEST FILM — isolated database; no production media/provider calls.<br>${["hold", "arrive", "work", "fail", "disconnect", "reconnect"].map(action => `<button onclick="fetch('/demo/${action}',{method:'POST'})">Demo: ${action}</button>`).join(" ")}</aside>`));
});
app.use("/media", express.static(join(root, "assets"))); app.use(express.static("dist/web")); evidence();
app.listen(4026, "127.0.0.1", () => console.log("Synthetic producer view: http://127.0.0.1:4026"));
