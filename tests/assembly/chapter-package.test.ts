import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync, existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportChapterPackage, inspectChapterPackage, restoreChapterPackage, verifyChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
import { assertEditorialRebuildable } from "../../src/pipeline/assembly/render-editorial-cut.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let directory: string, db: InstanceType<typeof DatabaseSync>;
function put(path: string, value: string) { const file = join(directory, "assets", path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); return file; }
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "heartword-package-"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1),('other','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 2:1','Mark 2:1',1),('s-other','other',1,'Mark 3:1','Mark 3:1',1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Jesus','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1),('v-old','c','v0','superseded',0);
    INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('a','v','headshot','canon.png',1),('a-old','v-old','headshot','canon-old.png',0);
    INSERT INTO shots (id,scene_id,sequence,action,created_at) VALUES ('shot','s',1,'Teaching',1),('shot-other','s-other',1,'Teaching',1);
    INSERT INTO shot_characters VALUES ('shot','c'),('shot-other','c');
    INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES
      ('take','shot','codex_imagegen','not_reported','generate','Retained request','accepted','take.png',0,1),
      ('rejected','shot','test','test','generate','Rejected request','retry_modified','rejected.png',0.5,0),
      ('other-take','shot-other','test','test','generate','Other chapter','accepted','other.png',0,1);
    INSERT INTO clips VALUES ('clip','shot','take',0,1000,1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('o','p','original_reading','source.wav',0,1000,'Mark 2:1',1);
    INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES ('edit','p',1,'producer_decision','{"reason":"Keep selected take","source_path":"superseded.wav"}','edit',1);
    INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES ('review','p','shot','shot','human','Keep canon',1,1);`);
  for (const file of ["canon.png", "canon-old.png", "take.png", "rejected.png", "source.wav", "superseded.wav"]) put(file, file);
  const docx = put("source/hatam/mark-2/mark-2-text.docx", "exact source"), reference = put("reference/english/mark-2/mark-2-text.docx", "exact reference");
  db.prepare("INSERT INTO project_source_bindings VALUES ('p',?,'source.wav',?,'non_drama',?,?,?,'legacy',1)").run(docx, reference, digest("exact source"), digest("source.wav"), digest("exact reference"));
});
afterEach(() => { db.close(); if (resolve(directory).startsWith(resolve(tmpdir(), "heartword-package-"))) rmSync(directory, { recursive: true, force: true }); });
describe("editable chapter preservation", () => {
  it("copies identical external reference images once and restores both original paths", () => {
    const external = mkdtempSync(join(tmpdir(), "heartword-external-references-"));
    try {
    const origins = [join(external, "review-one", "reference.png"), join(external, "review-two", "reference.png")];
    for (const path of origins) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, "same reviewed pixels"); }
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES('external','p',2,'producer_decision',?,'external',2)")
      .run(JSON.stringify({ references: origins.map(path => ({ path })) }));
    const packaged = join(directory, "external-package"), restored = join(directory, "external-restored");
    const manifest = exportChapterPackage(db, directory, "p", packaged, { includeApplication: false, extraFiles: origins });
    const retained = manifest.files.filter(f => f.sha256 === digest("same reviewed pixels"));
    expect(retained).toHaveLength(1);
    expect(retained[0]!.originals).toEqual(expect.arrayContaining(origins));
    verifyChapterPackage(packaged);
    restoreChapterPackage(packaged, restored);
    const reopened = new DatabaseSync(join(restored, "db", "heartword.sqlite"));
    try {
      const payload = JSON.parse(String(reopened.prepare("SELECT payload FROM edit_commands WHERE id='external'").get()!.payload));
      expect(payload.references[0].path).toBe(payload.references[1].path);
      expect(readFileSync(join(restored, "assets", payload.references[0].path), "utf8")).toBe("same reviewed pixels");
    } finally { reopened.close(); }
    } finally { rmSync(external, { recursive: true, force: true }); }
  });
  it("preserves a multi-chunk binary take and detects same-size corruption after a chunk boundary", () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 37);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17 + Math.floor(i / 1024)) % 251;
    const source = put("long-take.mp4", ""); writeFileSync(source, bytes);
    db.exec("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('long','shot','fixture','fixture','generate','accepted','long-take.mp4',0,2)");
    const packaged = join(directory, "binary-package"), restored = join(directory, "binary-restored");
    const manifest = exportChapterPackage(db, directory, "p", packaged, { includeApplication: false });
    expect(manifest.files.find(f => f.path === "assets/long-take.mp4")?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    restoreChapterPackage(packaged, restored);
    expect(readFileSync(join(restored, "assets/long-take.mp4"))).toEqual(bytes);
    const fd = openSync(join(packaged, "assets/long-take.mp4"), "r+");
    try { writeSync(fd, Buffer.from([255]), 0, 1, 1024 * 1024 + 5); } finally { closeSync(fd); }
    expect(() => verifyChapterPackage(packaged)).toThrow("Retained asset integrity failed");
  });
  it("retains rejected takes, old canon, source authority, producer history and lineage without copying unrelated chapters", () => {
    const packageDir = join(directory, "package"), restored = join(directory, "other-root");
    const manifest = exportChapterPackage(db, directory, "p", packageDir);
    expect(manifest.retention.automaticDeletion).toBe(false);
    expect(manifest.files.some(f => f.originals.includes("rejected.png"))).toBe(true);
    expect(manifest.files.some(f => f.originals.includes("superseded.wav"))).toBe(true);
    restoreChapterPackage(packageDir, restored);
    const portrait = "docs/assets/control-room/agent-portraits/nell-editor.png";
    expect(readFileSync(join(restored, "application", portrait))).toEqual(readFileSync(portrait));
    const logo = "docs/assets/branding/heartword-ai-logo.png";
    expect(readFileSync(join(restored, "application", logo))).toEqual(readFileSync(logo));
    const reopened = new DatabaseSync(join(restored, "db", "heartword.sqlite"));
    try {
      expect(reopened.prepare("SELECT id FROM projects").all()).toEqual([{ id: "p" }]);
      expect(reopened.prepare("SELECT id FROM generation_attempts ORDER BY id").all()).toEqual([{ id: "rejected" }, { id: "take" }]);
      expect(reopened.prepare("SELECT id FROM character_versions ORDER BY id").all()).toEqual([{ id: "v" }, { id: "v-old" }]);
      expect(reopened.prepare("SELECT payload FROM edit_commands WHERE id='edit'").get()).toEqual(db.prepare("SELECT payload FROM edit_commands WHERE id='edit'").get());
      const source = reopened.prepare("SELECT docx_path FROM project_source_bindings").get()!;
      expect(String(source.docx_path)).toBe("source/hatam/mark-2/mark-2-text.docx"); expect(existsSync(join(restored, "assets", String(source.docx_path)))).toBe(true);
      expect(reopened.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { reopened.close(); }
  });
  it("holds missing originals, changed source/canon, and a Blender file without a dependency inventory", () => {
    rmSync(join(directory, "assets", "rejected.png"));
    put("canon.png", "changed pixels");
    db.prepare("UPDATE character_assets SET content_hash=? WHERE id='a'").run(digest("canon.png"));
    put("set.blend", "blend");
    const inspection = inspectChapterPackage(db, directory, "p", { extraFiles: [join(directory, "assets", "set.blend")] });
    expect(inspection.manifest.problems.join(" ")).toContain("Missing asset: rejected.png");
    expect(inspection.manifest.problems.join(" ")).toContain("Canon hash mismatch");
    expect(inspection.manifest.problems.join(" ")).toContain("Blender dependency lock required");
    expect(() => exportChapterPackage(db, directory, "p", join(directory, "package"))).toThrow("Preservation held");
  });
  it("fails missing/corrupt assets at verification and protects existing destinations", () => {
    const packageDir = join(directory, "package"); exportChapterPackage(db, directory, "p", packageDir);
    expect(() => restoreChapterPackage(packageDir, directory)).toThrow("new data directory");
    writeFileSync(join(packageDir, "assets", "take.png"), "changed");
    expect(() => verifyChapterPackage(packageDir)).toThrow("integrity failed");
    expect(() => restoreChapterPackage(packageDir, join(directory, "restored"))).toThrow("integrity failed");
    expect(existsSync(join(directory, "restored"))).toBe(false);
  });
  it("reports missing historical timing instead of claiming the MP4 is editable", () => {
    put("film.mp4", "film");
    db.exec("INSERT INTO chapter_renders VALUES ('r','p','film.mp4',1000,1,1)");
    expect(inspectChapterPackage(db, directory, "p").manifest.editability.join(" ")).toContain("cannot be reconstructed");
    db.prepare("INSERT INTO chapter_render_manifests VALUES ('r',?,?)").run(JSON.stringify({ picture: [] }), JSON.stringify({ audioBase: "film.mp4" }));
    expect(inspectChapterPackage(db, directory, "p").manifest.editability.join(" ")).toContain("legacy/custom recipe");
    expect(() => assertEditorialRebuildable(db, "p")).toThrow("custom legacy edit recipe");
  });
  it("rejects manifest traversal and changed record payloads before restoring", () => {
    const packageDir = join(directory, "package"); exportChapterPackage(db, directory, "p", packageDir);
    const path = join(packageDir, "chapter-package.json"), original = readFileSync(path, "utf8"), manifest = JSON.parse(original);
    manifest.files[0].path = "../outside"; writeFileSync(path, JSON.stringify(manifest));
    expect(() => verifyChapterPackage(packageDir)).toThrow("Invalid package path");
    writeFileSync(path, original); writeFileSync(join(packageDir, "records.json"), "{}");
    expect(() => restoreChapterPackage(packageDir, join(directory, "bad-records-root"))).toThrow("records/schema integrity");
    expect(existsSync(join(directory, "bad-records-root"))).toBe(false);
  });
  it("preserves applicable global producer guidance with its history, without pulling in its donor chapter media", () => {
    db.exec("INSERT INTO production_lessons (id,project_id,scope_kind,issue,requested_change,status,created_at,updated_at) VALUES ('lesson','other','global','Readability','Keep faces readable','active',1,1); INSERT INTO production_lesson_events VALUES ('lesson-event','lesson','activated','Producer decision',1)");
    const snapshot = inspectChapterPackage(db, directory, "p");
    expect(snapshot.tables.production_lessons).toHaveLength(1);
    expect(snapshot.tables.production_lesson_events).toHaveLength(1);
    expect(snapshot.tables.generation_attempts?.some(a => a.id === "other-take")).toBe(false);
  });
  it("preserves broader lessons with the same case-insensitive context matching used by the crew", () => {
    db.exec("INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,source_language,source_region,issue,requested_change,status,created_at,updated_at) VALUES ('book','other','book','MARK','HATAM','papuan','Readability','Keep faces readable','active',1,1),('wrong','other','book','MARK','meyah','papuan','Readability','Other language','active',1,1)");
    const snapshot = inspectChapterPackage(db, directory, "p");
    expect(snapshot.tables.production_lessons?.map(row => row.id)).toEqual(["book"]);
    expect(snapshot.tables.generation_attempts?.some(a => a.id === "other-take")).toBe(false);
  });
  it("retains the exact shot performance binding and voice/source authority without importing another chapter binding",()=>{
    db.exec(`INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('other-audio','other','original_reading','other.wav',0,1000,'Mark 3:1',1);
      INSERT INTO shot_utterance_bindings VALUES('bound','shot','o',125,875,'v','exact-source-hash',2,'Synthetic timing authority'),('other-bound','shot-other','other-audio',0,1000,'v','other-hash',2,'Other authority');`);
    const original=db.prepare("SELECT * FROM shot_utterance_bindings WHERE id='bound'").get();
    const snapshot=inspectChapterPackage(db,directory,"p",{includeApplication:false});
    expect(snapshot.tables.shot_utterance_bindings).toEqual([original]);
    expect(snapshot.tables.audio_segments?.some(row=>row.id==="other-audio")).toBe(false);
    const packaged=join(directory,"bound-package"),restored=join(directory,"bound-restored");
    exportChapterPackage(db,directory,"p",packaged,{includeApplication:false});restoreChapterPackage(packaged,restored);
    const reopened=new DatabaseSync(join(restored,"db/heartword.sqlite"));try{
      expect(reopened.prepare("SELECT * FROM shot_utterance_bindings").all()).toEqual([original]);
      expect(reopened.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    }finally{reopened.close();}
  });
  it("reopens immutable sidecars with Mac and old-root paths while the original assets are unavailable",()=>{
    const remote="/Users/synthetic/LTX-Inbox/unique-reference.png",absolute=join(directory,"assets/take.png"),sidecar=JSON.stringify({sourceKeyframe:"take.png",remoteInputPath:remote,localOutputPath:absolute});
    put("take.png.json",sidecar);mkdirSync(join(directory,"logs"));
    writeFileSync(join(directory,"logs/disaster-recovery-paths.json"),JSON.stringify({version:1,references:[[remote,"assets/take.png"]]}));
    const packaged=join(directory,"sidecar-package"),restored=join(directory,"sidecar-restored");
    exportChapterPackage(db,directory,"p",packaged,{includeApplication:false});restoreChapterPackage(packaged,restored);
    const originalAssets=resolve(directory,"assets"),offlineAssets=resolve(directory,"offline-assets");
    if(!originalAssets.startsWith(resolve(directory))||!offlineAssets.startsWith(resolve(directory)))throw Error("Fixture move escapes temporary root.");
    renameSync(originalAssets,offlineAssets);
    const reopened=new DatabaseSync(join(restored,"db/heartword.sqlite"));try{
      const audit=inspectChapterPackage(reopened,restored,"p",{includeApplication:false});
      expect(audit.manifest.problems).toEqual([]);
      expect(audit.manifest.files.some(f=>f.path.startsWith("assets/preserved-external/"))).toBe(false);
      expect(readFileSync(join(restored,"assets/take.png.json"),"utf8")).toBe(sidecar);
      const projection=JSON.parse(readFileSync(join(restored,"logs/disaster-recovery-paths.json"),"utf8"));
      expect(projection.references).toContainEqual([remote,"assets/take.png"]);
      expect(projection.references).toContainEqual([absolute,"assets/take.png"]);
    }finally{reopened.close();}
  });
  it("preserves LTX transport history while restoring verified local counterparts without original assets",()=>{
    const native=put("native.mp4","retained native video");
    const metadata={provider:"ltx_local",sourceKeyframe:"canon.png",sourceKeyframeSha256:digest("canon.png"),sourceEndKeyframe:"canon-old.png",sourceEndKeyframeSha256:digest("canon-old.png"),localOutputPath:native,remoteInputPath:"/Users/synthetic/LTX-Inbox/start.png",remoteEndInputPath:"/Users/synthetic/LTX-Inbox/end.png",remoteOutputPath:"/Users/synthetic/LTXDesktop/output.mp4",request:{imagePath:"/Users/synthetic/LTX-Inbox/start.png",lastImagePath:"/Users/synthetic/LTX-Inbox/end.png"}};
    const original=JSON.stringify(metadata);put("native.mp4.json",original);
    db.prepare("INSERT INTO video_generation_jobs(id,project_id,shot_id,backend,status,metadata_json,updated_at)VALUES('local-job','p','shot','ltx','completed',?,1)").run(original);
    const packaged=join(directory,"ltx-package"),restored=join(directory,"ltx-restored");
    const exported=exportChapterPackage(db,directory,"p",packaged,{includeApplication:false});
    expect(exported.files.some(f=>f.originals.some(p=>p.startsWith("/Users/synthetic/")))).toBe(false);
    restoreChapterPackage(packaged,restored);
    const assets=resolve(directory,"assets"),offline=resolve(directory,"assets-offline");
    if(dirname(assets)!==resolve(directory)||dirname(offline)!==resolve(directory))throw Error("Fixture move escapes temporary root.");
    renameSync(assets,offline);
    const reopened=new DatabaseSync(join(restored,"db/heartword.sqlite"));try{
      const saved=JSON.parse(String(reopened.prepare("SELECT metadata_json FROM video_generation_jobs WHERE id='local-job'").get()!.metadata_json));
      expect(saved.request).toEqual(metadata.request);expect(saved.remoteInputPath).toBe(metadata.remoteInputPath);expect(saved.remoteOutputPath).toBe(metadata.remoteOutputPath);
      expect(saved.localOutputPath).toBe("native.mp4");
      expect(readFileSync(join(restored,"assets/native.mp4.json"),"utf8")).toBe(original);
      expect(inspectChapterPackage(reopened,restored,"p",{includeApplication:false}).manifest.problems).toEqual([]);
    }finally{reopened.close();}
  });
  it.each(["wrong-hash","missing-input","missing-output","unbound-request","unknown-provider","unrelated-path"])("holds unverified LTX dependencies: %s",variant=>{
    const metadata:any={provider:"ltx_local",sourceKeyframe:"canon.png",sourceKeyframeSha256:digest("canon.png"),localOutputPath:put("native.mp4","native"),remoteInputPath:"/Users/synthetic/start.png",remoteOutputPath:"/Users/synthetic/output.mp4",request:{imagePath:"/Users/synthetic/start.png"}};
    if(variant==="wrong-hash")metadata.sourceKeyframeSha256=digest("wrong");
    if(variant==="missing-input")metadata.sourceKeyframe="missing.png";
    if(variant==="missing-output")metadata.localOutputPath="missing.mp4";
    if(variant==="unbound-request")metadata.request.imagePath="/Users/synthetic/other.png";
    if(variant==="unknown-provider")metadata.provider="other";
    if(variant==="unrelated-path")metadata.render={videoPath:metadata.remoteOutputPath};
    db.prepare("INSERT INTO video_generation_jobs(id,project_id,shot_id,backend,status,metadata_json,updated_at)VALUES('local-job','p','shot','ltx','completed',?,1)").run(JSON.stringify(metadata));
    expect(inspectChapterPackage(db,directory,"p",{includeApplication:false}).manifest.problems.length).toBeGreaterThan(0);
    expect(()=>exportChapterPackage(db,directory,"p",join(directory,"held-package"),{includeApplication:false})).toThrow("Preservation held");
  });
  it("preserves valid relative path spelling instead of changing pinned planning inputs",()=>{
    put("folder/take.png","synthetic retained alias");
    db.exec("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('alias','shot','fixture','fixture','generate','accepted','folder//take.png',0,2)");
    const packaged=join(directory,"alias-package"),restored=join(directory,"alias-restored");
    exportChapterPackage(db,directory,"p",packaged,{includeApplication:false});restoreChapterPackage(packaged,restored);
    const reopened=new DatabaseSync(join(restored,"db/heartword.sqlite"));try{
      expect(reopened.prepare("SELECT result_asset_path FROM generation_attempts WHERE id='alias'").get()!.result_asset_path).toBe("folder//take.png");
      expect(readFileSync(join(restored,"assets/folder/take.png"),"utf8")).toBe("synthetic retained alias");
    }finally{reopened.close();}
  });
});
