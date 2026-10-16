import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,unlinkSync} from "node:fs";
import {dirname,join} from "node:path";
import {tmpdir} from "node:os";
import express from "express";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {inspectSourceAvailability} from "../../src/pipeline/ingestion/source-catalog";
import {countInventoryMedia,readChapterInventory,type InventoryAttempt} from "../../src/server/chapter-inventory";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db:import("node:sqlite").DatabaseSync,root:string,server:ReturnType<express.Express["listen"]>|undefined;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db,getDataDir:()=>root}));
const put=(path:string,value="retained bytes")=>{const full=join(root,"assets",path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,value);};
const source={language:"hatam",book:"mark",chapter:3};
const text="source/hatam/text/Mark/Mark 3.docx",audio="source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___03_Markus______HADLAIN1DA.mp3";
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),"heartword-inventory-"));mkdirSync(join(root,"assets"));db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));});
afterEach(async()=>{await new Promise<void>(done=>server?server.close(()=>done()):done());server=undefined;db.close();rmSync(root,{recursive:true,force:true});});
function project(id="p",chapter=3,language="hatam") {db.prepare("INSERT INTO projects VALUES (?,?, 'mark',?,'ingestion','not_started',1000,1000)").run(id,language,chapter);db.prepare("INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES (?,?,1,'Mark 3:1','Mark 3:2',1000)").run(`scene-${id}`,id);db.prepare("INSERT INTO shots(id,scene_id,sequence,action,created_at) VALUES (?,?,1,'Saved shot',1000)").run(`shot-${id}`,`scene-${id}`);}
function attempt(id:string,provider="codex_imagegen",status="accepted",operation="generate",at=2000,projectId="p") {put(`${id}.png`);db.prepare("INSERT INTO generation_attempts VALUES (?,?,?,?,?,NULL,'Saved attempt',?,?,1,?)").run(id,`shot-${projectId}`,provider,"fixture",operation,status,`${id}.png`,at);}
it("populates readiness from both raw inputs even without a workspace or English reference, then notices removal/empty bytes",()=>{
  expect(inspectSourceAvailability(db,source,root).audio.available).toBe(false);put(audio);expect(inspectSourceAvailability(db,source,root).text.available).toBe(false);put(text);
  let view=readChapterInventory(db,root,"hatam","mark");expect(view.chapters[2]?.source.ready).toBe(true);expect(view.chapters[2]?.projectId).toBeNull();expect(view.chapters).toHaveLength(16);
  put(text,"");expect(readChapterInventory(db,root).chapters[2]?.source.ready).toBe(false);put(text);unlinkSync(join(root,"assets",audio));expect(readChapterInventory(db,root).chapters[2]?.source.ready).toBe(false);
  expect(db.prepare("SELECT COUNT(*) n FROM projects").get()!.n).toBe(0);
});
it("does not treat generated/separated audio or a drama-only alternative as the default raw source",()=>{
  put(text);put("generated/cast.mp3");put("source/hatam/audio/Hatam_had_LAI_NT_Drama/B02___03_Markus______HADLAIN2DA.mp3");
  expect(inspectSourceAvailability(db,source,root).audio.available).toBe(false);
});
it("preserves exact bound sources and missing-file uncertainty instead of falling back to an available alternate",()=>{
  project();put(text);put(audio);put("source/bound.docx");
  db.prepare("INSERT INTO project_source_bindings VALUES ('p','source/bound.docx','source/bound.mp3','source/ref.docx','drama','t','a','r','legacy',1000)").run();
  const view=readChapterInventory(db,root).chapters[2]!;expect(view.source.selection).toBe("bound");expect(view.source.ready).toBe(false);expect(view.source.edition).toBe("drama");
  put("source/bound.mp3");expect(readChapterInventory(db,root).chapters[2]?.source.ready).toBe(true);
  db.exec("UPDATE project_source_bindings SET audio_path='../outside.mp3'");expect(readChapterInventory(db,root).chapters[2]?.source.uncertain).toBe(true);
});
it("uses the complete legacy source pair, including non-Hatam chapters, without changing catalog ingestion rules",()=>{
  put("source/meyah/mark-3/mark-3-text.docx");put("source/meyah/mark-3/mark-3-fcbh-audio.mp3");
  const view=readChapterInventory(db,root,"meyah","mark");expect(view.chapters[2]?.source.ready).toBe(true);expect(view.chapters[2]?.source.selection).toBe("legacy");expect(view.chapters[1]?.source.ready).toBe(false);
});
it("does not infer casting completion from retained shots and shows per-character canon file gaps in chapter scope",()=>{
  project();project("other",4);put(text);put(audio);
  db.exec(`INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Witness','global','approved','Papuan',1,1),('other','Another','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1);
    INSERT INTO shot_characters VALUES ('shot-p','c'),('shot-other','other');
    INSERT INTO character_assets(id,character_version_id,category,path,asset_role,created_at) VALUES ('a','v','headshot','ref.png','comparison_proof',1);`);put("ref.png");
  let view=readChapterInventory(db,root).chapters[2]!;expect(view.identification?.count).toBe(1);expect(view.canon?.ready).toBe(0);expect(view.casting?.executionId).toBeNull();expect(view.casting?.shots).toBe(1);
  db.exec("UPDATE character_assets SET asset_role='scene_reference'");expect(readChapterInventory(db,root).chapters[2]?.canon?.ready).toBe(1);
  unlinkSync(join(root,"assets","ref.png"));expect(readChapterInventory(db,root).chapters[2]?.canon?.ready).toBe(0);
});
it("separates current restart counts from retained historical attempts and keeps missing files out of available totals",()=>{
  project();attempt("old");attempt("new","codex_imagegen","hold_for_review","generate",4000);attempt("missing","codex_imagegen","accepted","generate",5000);unlinkSync(join(root,"assets","missing.png"));
  db.exec("INSERT INTO project_restart_cutovers VALUES ('p',3000,'Dan','Retain old media as history')");
  const counts=readChapterInventory(db,root).chapters[2]!.generation!;
  expect(counts.current.keyframes).toMatchObject({records:2,available:1,accepted:0,missing:1,retries:1});expect(counts.history.keyframes).toMatchObject({records:3,available:2,accepted:1,retries:2});
  expect(db.prepare("SELECT COUNT(*) n FROM generation_attempts").get()!.n).toBe(3);
});
it("defines retries as additional generation records, excluding new coverage targets, local reuse and mere retry verdicts",()=>{
  const a=(id:string,target="shot",operation="generate",provider="codex_imagegen",status="accepted",path:string|null=`${id}.png`):InventoryAttempt=>({id,target,operation,provider,status,path,createdAt:1});
  const counts=countInventoryMedia([a("first","shot","generate","codex_imagegen","retry_modified"),a("again"),a("reuse","shot","generate","local_reuse"),a("guard","shot","generate","canon_guard","retry_modified",null),a("coverage","beat1","coverage_keyframe"),a("coverage2","beat2","coverage_keyframe"),a("draft","shot","generate_draft","ltx","accepted","draft.mp4"),a("final","shot","generate_final_video","ltx","accepted","final.mp4"),a("assembly","shot","assemble_shot","local","accepted","assembly.mp4")],()=>true);
  expect(counts.keyframes.retries).toBe(1);expect(counts.keyframes.retryVerdicts).toBe(2);expect(counts.keyframes.reused).toBe(1);expect(counts.clips.retries).toBe(0);expect(counts.assembled).toBe(1);expect(counts.clips.available).toBe(2);
});
it("deduplicates shared files without turning held/rejected output into accepted footage and recognizes historical operation families",()=>{
  const attempts:InventoryAttempt[]=[{id:'a',target:'s',operation:'canonical_v34_close_keyframe',provider:'codex_imagegen',status:'retry_modified',path:'same.png',createdAt:1},{id:'b',target:'s2',operation:'generate',provider:'local_reuse',status:'hold_for_review',path:'same.png',createdAt:2},{id:'c',target:'s',operation:'canonical_v34_close_lip_sync',provider:'kling',status:'accepted',path:'sync.mp4',createdAt:3},{id:'d',target:'s',operation:'generate',provider:'old-video-provider',status:'accepted',path:'old.mp4',createdAt:1}];
  const counts=countInventoryMedia(attempts,()=>true);expect(counts.keyframes.available).toBe(1);expect(counts.keyframes.accepted).toBe(0);expect(counts.lipSync.available).toBe(1);expect(counts.clips.available).toBe(1);
});
it("does not display an image file recorded against a lip-sync operation as available or accepted footage",()=>{
  const counts=countInventoryMedia([{id:'wrong-kind',target:'s',operation:'lip_sync',provider:'kling',status:'accepted',path:'still.png',createdAt:1}],()=>true);
  expect(counts.lipSync).toMatchObject({records:1,available:0,accepted:0,missing:1});
});
it("all inventory reads work under query_only and do not create source bindings, projects, stages, ledger entries or decisions",()=>{
  project();put(text);put(audio);attempt("a");const before=db.prepare("SELECT total_changes() n").get()!.n;db.exec("PRAGMA query_only=ON");
  readChapterInventory(db,root);readChapterInventory(db,root,"hatam","acts");expect(db.prepare("SELECT total_changes() n").get()!.n).toBe(before);
  expect(db.prepare("SELECT COUNT(*) n FROM project_source_bindings").get()!.n).toBe(0);expect(db.prepare("SELECT COUNT(*) n FROM cost_ledger_entries").get()!.n).toBe(0);
});
it("exposes no-store live source arrival over the real inventory route and never auto-creates a project",async()=>{
  const {projectsRouter}=await import('../../src/server/routes/projects.js');const app=express();app.use('/api/projects',projectsRouter);server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server!.once('listening',done));const address=server.address() as {port:number};const url=`http://127.0.0.1:${address.port}/api/projects/inventory?language=hatam&book=mark`;
  const first=await fetch(url);expect(first.headers.get('cache-control')).toBe('no-store');expect((await first.json()).chapters[2].source.ready).toBe(false);put(text);put(audio);expect((await(await fetch(url)).json()).chapters[2].source.ready).toBe(true);expect(db.prepare('SELECT COUNT(*) n FROM projects').get()!.n).toBe(0);
});
