import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readProductionView } from "../../src/server/production-view.js";
import { beginObservedWork, observedWork, observeWork } from "../../src/pipeline/observed-work.js";
import { reconcileAvatarBudget, reserveAvatarSpend } from "../../src/pipeline/voice-lipsync/performance-direction.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root: string, server: ReturnType<express.Express["listen"]> | undefined;
const cleanups: Array<() => void> = [];
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));
function put(path: string) { writeFileSync(join(root, "assets", path), "retained synthetic media; decoding checked separately in browser proof"); }
function attempt(id: string, shotId = "shot", status = "hold_for_review", path: string | null = `${id}.mp4`, at = 2000) {
  if (path && !path.includes("..")) put(path);
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'synthetic','fixture','generate_final_video',?,?,1,?)").run(id, shotId, status, path, at);
}
function select(id: string, shotId = "shot") { db.prepare("INSERT INTO clips VALUES (?,?,?,0,2000,2200)").run(`clip:${id}`, shotId, id); }
function execution(stage = "media_generation", status = "running", id = "execution", at = 1000) {
  db.prepare("INSERT INTO stage_executions VALUES (?,?,?,'input','dependency',?,1,'Recorded stage evidence',NULL,?,NULL,'worker')").run(id, "p", stage, status, at);
}
const view = (project = "p", now = 5000) => readProductionView(db, root, project, now);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "heartword-producer-view-")); mkdirSync(join(root, "assets"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects VALUES ('p','hatam','mark',3,'media_generation','in_progress',1000,1000),('other','hatam','mark',4,'ingestion','not_started',1000,1000);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 3:1','Mark 3:2',1000),('other-scene','other',1,'Mark 4:1','Mark 4:1',1000);
    INSERT INTO shots(id,scene_id,sequence,action,verse_ref,created_at) VALUES ('shot','scene',1,'Synthetic witness listens','Mark 3:1',1000),('shot2','scene',2,'Synthetic room wide','Mark 3:2',1000),('other-shot','other-scene',1,'Another chapter','Mark 4:1',1000);`);
});
afterEach(async () => { for (const cleanup of cleanups.splice(0)) cleanup(); await new Promise<void>(done => server ? server.close(() => done()) : done()); server = undefined; db.close(); rmSync(root, { recursive: true, force: true }); });

it("restores an uncertain retained lease after reconnect; current process ownership alone marks working", () => {
  execution(); expect(view().stages.find(item => item.stage === "media_generation")?.state).toBe("uncertain");
  const stop = beginObservedWork("p", "media_generation"); cleanups.push(stop);
  expect(view().stages.find(item => item.stage === "media_generation")?.state).toBe("working"); stop();
  expect(view().state).toBe("uncertain"); expect(view().nextAction).toMatch(/Reconcile/);
});
it("distinguishes queued, awaiting external, failed and stale/unavailable progress without claiming finished footage", () => {
  const stop = beginObservedWork("p", "media_generation", "job"); cleanups.push(stop);
  db.prepare("INSERT INTO video_generation_jobs VALUES ('job','p','shot','ltx','active',?,NULL,4000)").run(JSON.stringify({ phase: "queued", percentage: null }));
  expect(view().work.find(item => item.id === "job")?.state).toBe("queued");
  db.prepare("UPDATE video_generation_jobs SET progress_json=?").run(JSON.stringify({ phase: "submitted", percentage: null }));
  expect(view().work.find(item => item.id === "job")?.state).toBe("awaiting_external");
  expect(view().work).toHaveLength(1); // Observation and provider task are one activity.
  expect(view("p", 40001).holds.find(item => item.id === "job")?.state).toBe("uncertain");
  expect(view("p", 40001).stages.find(item => item.stage === "media_generation")?.state).toBe("uncertain");
  db.prepare("UPDATE video_generation_jobs SET progress_json=?").run(JSON.stringify({ phase: "progress_unavailable", percentage: null }));
  expect(view().holds.find(item => item.id === "job")?.state).toBe("uncertain");
  db.exec("UPDATE video_generation_jobs SET status='error'"); expect(view().holds.find(item => item.id === "job")?.state).toBe("failed");
  db.exec("UPDATE video_generation_jobs SET status='completed'"); expect(view().reel).toEqual([]);
});
it("keeps provider completion, candidates, accepted takes and actual selections distinct", () => {
  attempt("candidate"); attempt("accepted", "shot", "accepted"); attempt("selected", "shot2", "accepted"); select("selected", "shot2");
  expect(view().shots[0]!.media.map(item => [item.id, item.status, item.selected])).toEqual([["accepted", "accepted", false], ["candidate", "hold_for_review", false]]);
  expect(view().reel.map(item => item.id)).toEqual(["clip:selected"]);
  db.exec("UPDATE generation_attempts SET status='retry_modified' WHERE id='selected'"); expect(view().reel).toEqual([]);
  expect(view().holds.some(item => item.id === "clip:selected")).toBe(true);
});
it("excludes missing, empty and outside-root media while retaining decisions and original selection", () => {
  attempt("missing", "shot", "accepted", null); select("missing"); attempt("empty", "shot2", "accepted"); writeFileSync(join(root, "assets", "empty.mp4"), ""); select("empty", "shot2");
  attempt("escape", "shot", "accepted", "../outside.mp4"); select("escape");
  expect(view().reel).toEqual([]); expect(view().shots.flatMap(item => item.selected)).toHaveLength(3);
  db.exec("INSERT INTO chapter_renders VALUES ('render','p','missing-render.mp4',2000,1,3000)");
  expect(view().render?.available).toBe(false); expect(view().holds.some(item => item.id === "render" && item.state === "uncertain")).toBe(true);
});
it("preserves restart exclusions even when old footage still has accepted rows and clips", () => {
  attempt("old", "shot", "accepted", "old.mp4", 2000); select("old"); attempt("new", "shot2", "accepted", "new.mp4", 4000); select("new", "shot2");
  db.exec("INSERT INTO project_restart_cutovers VALUES ('p',3000,'Dan','Retain earlier footage as evidence only')");
  expect(view().reel.map(item => item.id)).toEqual(["clip:new"]); expect(view().shots[0]!.media[0]?.historical).toBe(true);
  expect(db.prepare("SELECT status FROM generation_attempts WHERE id='old'").get()?.status).toBe("accepted");
});
it("uses the existing latest assembled-shot selection without duplicating component or historical takes", () => {
  attempt("base", "shot", "accepted"); select("base");
  attempt("assembled-old", "shot", "accepted", "assembled-old.mp4", 3000); select("assembled-old");
  attempt("assembled-current", "shot", "accepted", "assembled-current.mp4", 4000); select("assembled-current");
  db.exec("UPDATE generation_attempts SET operation='assemble_shot' WHERE id LIKE 'assembled-%'");
  expect(view().reel.map(item => item.id)).toEqual(["clip:assembled-current"]);
  rmSync(join(root, "assets", "assembled-current.mp4")); expect(view().reel).toEqual([]);
});
it("cannot present pre-restart stage completions or an old render as a finished new film", () => {
  for (const stage of ["ingestion", "scene_breakdown", "casting", "media_generation", "voice_lipsync", "assembly", "qc"]) execution(stage, "completed", `stage:${stage}`);
  put("old-render.mp4"); db.exec("INSERT INTO chapter_renders VALUES ('old-render','p','old-render.mp4',2000,1,2000); INSERT INTO project_restart_cutovers VALUES ('p',3000,'Dan','New footage required')");
  expect(view().state).not.toBe("finished"); expect(view().render?.historical).toBe(true);
  expect(view().stages.find(item => item.stage === "ingestion")?.state).toBe("finished");
  expect(view().stages.find(item => item.stage === "media_generation")?.state).toBe("queued");
});
it("holds ambiguous overlapping selections instead of guessing which take is the current edit", () => {
  attempt("first", "shot", "accepted"); select("first"); attempt("second", "shot", "accepted"); select("second");
  expect(view().reel).toEqual([]); expect(view().holds.some(item => item.id === "reel-selection:shot")).toBe(true);
  expect(view().shots[0]!.selected).toHaveLength(2);
});
it("isolates chapter media, review history, source/cast offsets and rolling order", () => {
  attempt("a", "shot", "accepted"); select("a"); attempt("b", "shot2", "accepted"); select("b", "shot2"); attempt("donor", "other-shot", "accepted"); select("donor", "other-shot");
  put("cast.wav"); put("source.wav");
  db.exec("INSERT INTO audio_segments VALUES ('source','p','original_reading','source.wav',8000,10000,NULL,'Mark 3:1',90,1000),('cast','p','composite_cast_master','cast.wav',3000,5000,NULL,'Mark 3:1',90,1000)");
  expect(view().audio.find(item => item.id === "cast")).toMatchObject({ start_ms: 3000, end_ms: 5000, available: true });
  expect(view().reel.map(item => item.shotId)).toEqual(["shot", "shot2"]); expect(JSON.stringify(view())).not.toContain("donor.mp4");
  expect(view("other").reel.map(item => item.shotId)).toEqual(["other-shot"]);
});
it("uses current open objections beside affected shots and retains resolved history", () => {
  const record = { version: 1, revision: "run", inputRevision: "r0", parentRevision: null, briefHash: "hash", status: "held", snapshots: [], acceptedContributionIds: [], producerOverrideShotIds: [], history: [], objections: [{ id: "obj", owner: "choreographer", shotId: "shot2", status: "open", severity: "blocking", evidence: "Camera occupies actor mark", requestedChange: "Move camera, retain actor", confidence: 90, limitations: "Synthetic" }] };
  const result = { status: "held", summary: "Review held", calls: 1, contributions: {}, productionRecord: record };
  db.prepare("INSERT INTO production_runs VALUES ('run','p','planning','hash','{}','held',?,2000,3000,NULL)").run(JSON.stringify(result));
  expect(view().shots[0]!.objections).toHaveLength(0); expect(view().shots[1]!.objections[0]?.requestedChange).toBe("Move camera, retain actor");
  expect(view().holds.some(item => item.id === "obj")).toBe(true);
  record.objections[0]!.status = "resolved"; db.prepare("UPDATE production_runs SET status='approved',result_json=?").run(JSON.stringify({ ...result, status: "approved", productionRecord: record }));
  expect(view().holds.some(item => item.id === "obj")).toBe(false); expect(view().shots[1]!.objections[0]?.status).toBe("resolved");
});
it("auditions an exact bound utterance through saved source and cast offsets without slicing at verses", () => {
  put("source.wav"); put("cast.wav");
  db.exec(`INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('speaker','Synthetic speaker','global','approved','Papuan',1000,1000);
    INSERT INTO character_versions(id,character_id,version_label,status,created_at) VALUES ('voice','speaker','Synthetic voice','approved',1000);
    INSERT INTO audio_segments VALUES ('source','p','original_reading','source.wav',0,8000,'speaker','Mark 3:1-2',90,1000),('cast','p','composite_cast_master','cast.wav',3000,11000,'speaker','Mark 3:1-2',90,1000);
    INSERT INTO composite_audio_source_map VALUES ('cast','source','fixture','voice',1000);
    INSERT INTO shot_utterance_bindings VALUES ('bound','shot','source',2000,4000,'voice','fixture',1000,'Synthetic reviewer');`);
  expect(view().shots[0]!.speech).toMatchObject([{ layer: "composite_cast_master", startMs: 5000, endMs: 7000 }, { layer: "original_reading", startMs: 2000, endMs: 4000 }]);
});
it("does not equate every hold with a request for Dan or carry resolved notes as current holds", () => {
  db.exec("INSERT INTO review_notes VALUES ('review','p','shot','shot','qc','Review incomplete',0,2000),('human','p','shot','shot2','human','Producer hold',0,2000),('old','p','shot','shot','qc','Earlier issue resolved',1,1000)");
  expect(view().holds.find(item => item.id === "review")?.state).toBe("held"); expect(view().holds.find(item => item.id === "human")?.state).toBe("awaiting_dan");
  expect(view().holds.some(item => item.id === "old")).toBe(false); expect(view().reviews).toHaveLength(3);
});
it("shows the existing cumulative spend gate including outstanding charges and honest unknowns", () => {
  db.exec("INSERT INTO cost_ledger_entries VALUES ('cost','p',NULL,17,2000)");
  expect(view().costs).toMatchObject({ recordedUsd: 17, remainingUsd: null });
  reconcileAvatarBudget(db, { projectId: "p", actor: "Synthetic producer", evidence: "Fixture billing bounds", unreportedUpperBoundUsd: 4, outstandingUpperBoundUsd: 3, idempotencyKey: "reconcile" });
  reserveAvatarSpend(db, "p", "shot", 5);
  expect(view().costs).toMatchObject({ recordedUsd: 17, outstandingReservedUsd: 5, committedUsd: 29, remainingUsd: 171, hold: null });
});
it("reads read-only SQLite without changing stages, media, approvals or edit history", () => {
  attempt("accepted", "shot", "accepted"); select("accepted"); const before = db.prepare("SELECT total_changes() n").get()?.n;
  db.exec("PRAGMA query_only=ON"); view(); view(); expect(db.prepare("SELECT total_changes() n").get()?.n).toBe(before);
});
it("opens a historical database without progress tables and labels the evidence gap instead of migrating", () => {
  db.exec("DROP TABLE video_generation_jobs; PRAGMA query_only=ON");
  expect(view().holds.find(item => item.id === "video-progress-unavailable")?.state).toBe("uncertain");
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='video_generation_jobs'").get()).toBeUndefined();
});
it("uses the shared route for live changes/reconnect, rejects another chapter and sets no-store", async () => {
  const { productionRouter } = await import("../../src/server/routes/production.js");
  const app = express(); app.use("/api/projects/:projectId/production", productionRouter); server = app.listen(0);
  await new Promise(done => server!.once("listening", done)); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/projects`;
  const response = await fetch(`${base}/p/production/view`); expect(response.headers.get("cache-control")).toBe("no-store"); expect((await response.json()).reel).toEqual([]);
  attempt("arriving", "shot", "accepted"); select("arriving");
  expect((await (await fetch(`${base}/p/production/view`)).json()).reel).toHaveLength(1);
  expect((await (await fetch(`${base}/other/production/view`)).json()).reel).toEqual([]);
  expect((await fetch(`${base}/unknown/production/view`)).status).toBe(404);
});
it("clears observed ownership on an exception and never shares it across chapters", async () => {
  await expect(observeWork("p", "ingestion", async () => { expect(observedWork("p")).toHaveLength(1); expect(observedWork("other")).toEqual([]); throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
  expect(observedWork("p")).toEqual([]);
});
it("projects the saved chapter clock with explicit pauses and exact mapped cast offsets", () => {
  attempt("accepted", "shot", "accepted"); select("accepted");
  db.exec(`INSERT INTO audio_segments VALUES ('a','p','original_reading','source.wav',0,2000,NULL,'Mark 3:1',90,1000),('b','p','original_reading','source.wav',2000,4000,NULL,'Mark 3:2',90,1000),('cast','p','composite_cast_master','cast.wav',3000,5000,NULL,'Mark 3:1',90,1000);
    INSERT INTO composite_audio_source_map VALUES ('cast','a','fixture',NULL,1000);
    INSERT INTO chapter_renders VALUES ('r','p','render.mp4',5000,2,3000);`);
  put('source.wav'); put('cast.wav'); put('render.mp4');
  db.prepare("INSERT INTO chapter_render_manifests VALUES ('r',?,?)").run(JSON.stringify([{shotId:'shot',startMs:0,endMs:3000,sourceStartMs:0},{shotId:'shot2',startMs:3000,endMs:5000,sourceStartMs:0}]),JSON.stringify([{segmentId:'a',startMs:1000,endMs:3000,sourceStartMs:0,sourceEndMs:2000,voice:'cast'},{segmentId:'b',startMs:3000,endMs:5000,sourceStartMs:2000,sourceEndMs:4000,voice:'original'}]));
  const preview = view().programme;
  expect(preview.renderId).toBe('r'); expect(preview.durationMs).toBe(5000); expect(preview.source).toHaveLength(1);
  expect(preview.source[0]).toMatchObject({path:'source.wav',startMs:1000,endMs:5000,sourceStartMs:0});
  expect(preview.performance.map(item => [item.path,item.startMs,item.endMs,item.sourceStartMs])).toEqual([['cast.wav',1000,3000,3000],['source.wav',3000,5000,2000]]);
  db.exec("DELETE FROM composite_audio_source_map");
  expect(view().programme.performance).toHaveLength(1); expect(view().programme.issues.join(' ')).toContain('no unique duration-matched');
});
it("holds custom, foreign, overlapping and rate-changing timing maps without rebuilding a hand edit", () => {
  db.exec("INSERT INTO chapter_renders VALUES ('r','p','render.mp4',5000,1,3000)");
  const set = (timeline: unknown,audio: unknown) => db.prepare("INSERT OR REPLACE INTO chapter_render_manifests VALUES ('r',?,?)").run(JSON.stringify(timeline),JSON.stringify(audio));
  set({custom:'old script'},[]); expect(view().programme.durationMs).toBe(0); expect(view().programme.issues[0]).toContain('Custom legacy');
  set([{shotId:'other-shot',startMs:0,endMs:2000,sourceStartMs:0}],[]); expect(view().programme.issues[0]).toContain('another chapter');
  set([{shotId:'shot',startMs:0,endMs:2000,sourceStartMs:0},{shotId:'shot2',startMs:1000,endMs:3000,sourceStartMs:0}],[]); expect(view().programme.issues[0]).toContain('Overlapping');
  set([],[{segmentId:'a',startMs:0,endMs:2000,sourceStartMs:0,sourceEndMs:4000}]); expect(view().programme.issues[0]).toContain('changes source speed');
  set([],[]); db.exec("INSERT INTO project_restart_cutovers VALUES ('p',4000,'Dan','restart')"); expect(view().programme.renderId).toBeNull();
});
it("exposes only applied approved finishing cues and keeps unmapped legacy speech uncertain", () => {
  db.exec(`INSERT INTO chapter_renders VALUES ('r','p','render.mp4',5000,1,3000);
    INSERT INTO audio_segments VALUES ('a','p','original_reading','source.wav',0,2000,NULL,'Mark 3:1',90,1000);
    INSERT INTO production_audio_assets VALUES ('music','p','music','Registered fixture','music.wav','fixture',5000,1000);`);
  put('music.wav');
  db.prepare("INSERT INTO chapter_render_manifests VALUES ('r','[]',?)").run(JSON.stringify([{segmentId:'a',startMs:0,endMs:2000,sourceStartMs:0,sourceEndMs:2000}]));
  const result = {contributions:{composer:{audioCues:[{assetId:'music',startMs:0,endMs:4000,sourceStartMs:500,gainDb:-30}]}}};
  db.prepare("INSERT INTO production_runs VALUES ('mix','p','finishing','fixture','{}','approved',?,1000,2000,NULL)").run(JSON.stringify(result));
  expect(view().programme.cues).toEqual([]); expect(view().programme.performance).toEqual([]); expect(view().programme.issues.join(' ')).toContain('does not record its rendered voice');
  db.prepare("INSERT INTO edit_commands VALUES ('mix','p',1,'apply_finishing',?,'mix',3000,0)").run(JSON.stringify({runId:'mix',renderId:'r'}));
  expect(view().programme.cues[0]).toMatchObject({path:'music.wav',sourceStartMs:500,startMs:0,endMs:4000,gainDb:-30,available:true});
  db.exec("UPDATE edit_commands SET undone=1"); expect(view().programme.cues).toEqual([]);
});
