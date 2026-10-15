import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crewBriefHash, loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureTreatment } from "../helpers/crew-treatment.js";
import { acceptKeyframe, assetPath, getKeyframeContext, importKeyframe, keyframeStatus, readLandscapePng, recordProducerOverride, referenceBoardFilter, sha256,
  type KeyframeBrief } from "../../src/pipeline/media-generation/external-keyframes.js";

// Vite 5 predates node:sqlite; let Node load this built-in directly.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>, dir: string;
// A PNG header fixture tests the metadata gate; it is never sent to a provider.
function png(width = 2048, height = 1152): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(b);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
function brief(): KeyframeBrief {
  const context = getKeyframeContext(db, dir, "shot");
  const reviewed=loadCrewBrief(db,dir,"project","planning");
  db.prepare("INSERT OR IGNORE INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES('fixture-plan','project','planning',?,?,'approved',?,1)")
    .run(crewBriefHash(reviewed,"planning"),JSON.stringify(reviewed),JSON.stringify({status:"approved",summary:"Synthetic fixture plan",calls:0,contributions:{creative_director:{summary:"Synthetic advance treatment",directions:[],findings:[],emotionalTreatment:fixtureTreatment(reviewed)},production_director:{summary:"Synthetic",directions:[{shotId:"shot",instruction:"Retain fixture context",scriptureBasis:"Mark 2:1-2"}],findings:[],decision:"approve"}}}));
  return { schemaVersion: 1, id: "test-attempt", createdAt: 1, context, productionRunId:"fixture-plan", contextHash: sha256(JSON.stringify(context)),
    sources: [], prompt: "16:9 test", promptHash: sha256("16:9 test"), rationale: "Test", generationInputs: [] };
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "heartword-keyframe-test-"));
  mkdirSync(join(dir, "assets"));
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('project','hatam','mark',2,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','project',1,'Mark 2:1','Mark 2:12',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,created_at) VALUES ('shot','scene',1,'Crowded exterior','Mark 2:1-2',1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('person','Witness','book','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('version','person','v1','approved',1);
    INSERT INTO shot_characters VALUES ('shot','person');
    INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('asset','version','body_pose','ref.png',1);`);
  writeFileSync(join(dir, "assets", "ref.png"), png(1024, 1024));
  writeFileSync(join(dir, "result.png"), png());
  db.exec("UPDATE characters SET scope_book='mark' WHERE id='person';INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('audio','project','original_reading','source.wav',0,8000,'Mark 2:1-2',1)");
  writeFileSync(join(dir,"assets/source.wav"),"synthetic source");
  const docx=(text:string)=>{const name=Buffer.from("word/document.xml"),bytes=Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);return Buffer.concat([local,name,bytes,central,name,end]);};
  for(const path of ["source/hatam/mark-2/mark-2-text.docx","reference/english/mark-2/mark-2-text.docx"]){const target=join(dir,"assets",path);mkdirSync(join(target,".."),{recursive:true});writeFileSync(target,docx("1Synthetic words. 2More synthetic words."));}
});
afterEach(() => db.close());

describe("external keyframe handoff", () => {
  it("rejects paths that escape the managed asset area", () => {
    expect(() => assetPath(dir, "../outside.png")).toThrow("within");
    expect(() => assetPath(dir, join(dir, "elsewhere.png"))).toThrow("within");
  });
  it("blocks another regional canon instead of silently substituting it", () => {
    db.exec("UPDATE characters SET region='Horn of Africa'");
    expect(() => getKeyframeContext(db, dir, "shot")).toThrow("regional");
  });
  it("blocks missing or ambiguous approved character versions", () => {
    db.exec("UPDATE character_versions SET status='candidate'");
    expect(() => getKeyframeContext(db, dir, "shot")).toThrow("exactly one approved");
  });
  it("rejects modified canon files with a recorded hash", () => {
    db.prepare("UPDATE character_assets SET content_hash=?").run(sha256("different"));
    expect(() => getKeyframeContext(db, dir, "shot")).toThrow("hash mismatch");
  });
  it("accepts case-insensitive manifest sha256 hashes", () => {
    db.prepare("UPDATE character_assets SET content_hash=?").run(sha256(readFileSync(join(dir, "assets", "ref.png"))).toUpperCase());
    expect(getKeyframeContext(db, dir, "shot").references[0]?.name).toBe("Witness");
  });
  it("normalizes paired reference boards to the smaller original height", () => {
    const second = join(dir, "assets", "ref2.png");
    writeFileSync(second, png(2048, 768));
    expect(referenceBoardFilter([join(dir, "assets", "ref.png"), second]))
      .toContain("scale=-2:768");
  });
  it("uses an approved pose reference for silent supporting cast in lip-sync work", () => {
    db.exec("UPDATE shots SET needs_lip_sync=1");
    expect(getKeyframeContext(db, dir, "shot").references[0]?.category).toBe("body_pose");
  });
  it("rejects stale shot plans and changed prompts before writing an attempt", () => {
    const b = brief();
    db.exec("UPDATE shots SET action='Different action'");
    expect(() => importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed")).toThrow("stale");
    expect(() => importKeyframe(db, dir, { ...b, prompt: "changed" }, join(dir, "result.png"), "Reviewed")).toThrow("Brief changed");
    expect(db.prepare("SELECT COUNT(*) AS n FROM generation_attempts").get()?.n).toBe(0);
  });
  it("detects reference changes even when the database has no hash", () => {
    const b = brief();
    writeFileSync(join(dir, "assets", "ref.png"), png(512, 512));
    expect(() => importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed")).toThrow("stale");
  });
  it("records an idempotent candidate without modifying earlier attempts or inventing billing", () => {
    db.exec(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,cost_usd,created_at)
      VALUES ('old','shot','old-provider','old-model','generate','accepted',0.24,1)`);
    const b = brief();
    const result = importKeyframe(db, dir, b, join(dir, "result.png"), "Visual review, pending producer.");
    expect(importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed")).toEqual(result);
    expect(db.prepare("SELECT COUNT(*) AS n FROM generation_attempts").get()?.n).toBe(2);
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id='old'").get()?.status).toBe("accepted");
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id=?").get(b.id)?.status).toBe("hold_for_review");
    expect(db.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get()?.n).toBe(0);
    expect(keyframeStatus(db, "project")[0]).toMatchObject({ attempt_id: b.id, provider: "codex_imagegen" });
    expect(readFileSync(result.imagePath)).toEqual(png());
    expect(JSON.parse(readFileSync(result.provenancePath, "utf8")).billing).toContain("not a claim of free generation");
  });
  it("will not reuse a generation id for a different take", () => {
    const b = brief();
    importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed");
    writeFileSync(join(dir, "result.png"), png(1920, 1080));
    expect(() => importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed")).toThrow("different image");
  });
  it("records a producer acceptance without resolving unrelated shot notes", () => {
    const b = brief();
    importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed");
    db.exec(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
      VALUES ('unrelated','project','shot','shot','qc','Earlier concern',0,1)`);
    expect(acceptKeyframe(db, b.id, dir)).toEqual({ attemptId: b.id, shotId: "shot" });
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id=?").get(b.id)?.status).toBe("accepted");
    expect(db.prepare("SELECT status FROM shots WHERE id='shot'").get()?.status).toBe("keyframe_approved");
    expect(db.prepare("SELECT resolved FROM review_notes WHERE id='unrelated'").get()?.resolved).toBe(0);
  });
  it("records a producer override without accepting a candidate", () => {
    const b = brief();
    importKeyframe(db, dir, b, join(dir, "result.png"), "Reviewed");
    expect(recordProducerOverride(db, b.id, "Intentional continuity choice.")).toEqual({ attemptId: b.id, shotId: "shot" });
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id=?").get(b.id)?.status).toBe("hold_for_review");
    expect(db.prepare("SELECT note,resolved FROM review_notes WHERE source='human'").get()).toMatchObject({
      note: expect.stringContaining("Intentional continuity choice."), resolved: 1
    });
  });
  it("allows whole-pixel aspect rounding but rejects portrait and undersized images", () => {
    expect(readLandscapePng(png(1672, 941))).toEqual({ width: 1672, height: 941 });
    expect(() => readLandscapePng(png(1024, 1536))).toThrow("16:9");
    expect(() => readLandscapePng(png(320, 180))).toThrow("16:9");
    expect(() => readLandscapePng(Buffer.from("not a png"))).toThrow("PNG");
  });
  it("picks a costume fix's real body_pose over an unrelated older one that sorts first alphabetically", () => {
    // The real bug (found 2026-09-21 re-auditing a costume-fix batch): a
    // promotion had corrected "motion-neutral-standing" but left several
    // older, differently-named poses in place. Path order alone put one
    // of those ahead of the actual fix, so this exact selection would
    // have handed a shot the pre-fix garment.
    db.exec(`INSERT INTO character_assets (id,character_version_id,category,path,imported_from,created_at)
      VALUES ('asset-stale','version','body_pose','motion-hand-stretched-healed-v1.png','Carried forward unchanged',1)`);
    expect(getKeyframeContext(db, dir, "shot").references[0]?.path).toBe("ref.png");
  });
});
