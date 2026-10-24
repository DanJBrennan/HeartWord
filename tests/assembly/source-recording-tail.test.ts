import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { crewBriefHash, loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { renderEditorialCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { fixtureWave } from "../helpers/pcm-wave.js";
import { readProgrammePreview } from "../../src/server/producer-preview.js";
import { pictureTimeline } from "../../src/web/producer-timeline.js";
import { structuralCutFindings } from "../../src/pipeline/assembly/finishing.js";
import { editorialReviewTargets } from "../../src/pipeline/qc/editorial-review.js";
import { planEditorialCut } from "../../src/pipeline/assembly/editorial-plan.js";
import { readAcceptedEditorialClosing } from "../../src/pipeline/assembly/editorial-beats.js";
import { exportChapterPackage, restoreChapterPackage, verifyChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let root = "", db: InstanceType<typeof DatabaseSync>;
const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "pipe", "pipe"] });
function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hw-source-tail-"));
  const put = (path: string, bytes: Buffer | string) => { const f = join(root, "assets", path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, bytes); };
  put("source/hatam/mark-5/mark-5-text.docx", docx("1Synthetic narration. 2Synthetic dialogue."));
  put("reference/english/mark-5/mark-5-text.docx", docx("1Synthetic narration. 2Synthetic dialogue."));
  put("source.wav", fixtureWave(1500, t => t < 1 ? 330 : 660)); put("cast.wav", fixtureWave(500, 880)); put("ref.png", "synthetic canon");
  ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(root, "assets/picture.mp4")]);
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',5,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('scene','p',1,'Mark 5:1','Mark 5:2',1);
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Synthetic speaker','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,created_at)VALUES('cv','c','synthetic','approved',1);
    INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('ref','cv','body_pose','ref.png',1);
    INSERT INTO shots(id,scene_id,sequence,verse_ref,action,created_at)VALUES('shot','scene',1,'Mark 5:1-2','Synthetic listener coverage',1);
    INSERT INTO shot_characters VALUES('shot','c');
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES
      ('n','p','original_reading','source.wav',0,500,'Mark 5:1',NULL,1),('d','p','original_reading','source.wav',500,1000,'Mark 5:2','c',1),('cast','p','composite_cast_master','cast.wav',0,500,'Mark 5:2','c',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('a','shot','fixture','synthetic','assemble_shot','accepted','picture.mp4',0,1);
    INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('clip','shot','a',0,2000,1);`);
  db.prepare("INSERT INTO composite_audio_source_map(composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at)VALUES('cast','d',?,'cv',1)").run(createHash("sha256").update(readFileSync(join(root,"assets/source.wav"))).digest("hex"));
});
afterEach(() => {
  db?.close();
  if (!resolve(root).startsWith(resolve(tmpdir(), "hw-source-tail-"))) throw Error("Unexpected fixture cleanup target.");
  rmSync(root, { recursive: true, force: true });
});
it("renders the physical source tail after the last cast turn, retaining its exact offset and planning attribution", () => {
  const original = db.prepare("SELECT * FROM audio_segments ORDER BY id").all(), planningHash = crewBriefHash(loadCrewBrief(db, root, "p", "planning"), "planning");
  const brief = loadCrewBrief(db, root, "p", "editing");
  expect(brief.audio.at(-1)).toMatchObject({ id: "source-tail:d", path: "source.wav", startMs: 1000, endMs: 1500, speakerId: null, verseRef: null, provenance: "unassigned_source_interval" });
  const result = { status: "approved", calls: 0, summary: "Synthetic deterministic timing fixture; no production crew calls", contributions: { picture_editor: { summary: "Preserve full source", findings: [], directions: [], edits: [{ shotId: "shot", sourceStartMs: 0, durationMs: 1750 }], pauses: [{ afterSegmentId: null, durationMs: 250, reason: "Synthetic opening" }] } } };
  db.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES('edit','p','editing',?,?,'approved',?,1)").run(crewBriefHash(brief, "editing"), JSON.stringify(brief), JSON.stringify(result));
  const cut = renderEditorialCut(db, root, "p", "edit");
  const raw = ffmpeg(["-i", join(root, "assets", cut.path), "-f", "f32le", "-ar", "8000", "-ac", "1", "pipe:1"]), samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const frequency = (start: number, end: number) => { let count = 0; for (let i = Math.round(start * 8000) + 1; i < end * 8000; i++) if (samples[i - 1]! <= 0 && samples[i]! > 0) count++; return count / (end - start); };
  expect(frequency(.35, .65)).toBeCloseTo(330, -1); expect(frequency(.85, 1.15)).toBeCloseTo(880, -1); expect(frequency(1.35, 1.65)).toBeCloseTo(660, -1);
  const map = JSON.parse(String(db.prepare("SELECT source_audio_json FROM chapter_render_manifests WHERE render_id=?").get(cut.renderId)!.source_audio_json));
  expect(map.at(-1)).toMatchObject({ segmentId: "source-tail:d", sourceStartMs: 1000, sourceEndMs: 1500, startMs: 1250, endMs: 1750, voice: "original", speakerId: null });
  const audio = db.prepare("SELECT a.*,m.original_segment_id FROM audio_segments a LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id").all() as any[];
  const preview = readProgrammePreview(db, "p", { id: cut.renderId, total_duration_ms: 1750, historical: false }, audio, () => true,
    (path, hash) => createHash("sha256").update(readFileSync(join(root,"assets",path))).digest("hex") === hash);
  expect(preview.issues).toEqual([]);
  expect(preview.source).toHaveLength(1); expect(preview.source[0]).toMatchObject({ startMs: 250, endMs: 1750, sourceStartMs: 0 });
  expect(preview.performance.at(-1)).toMatchObject({ path: "source.wav", startMs: 1250, endMs: 1750, sourceStartMs: 1000 });
  expect(readProgrammePreview(db, "p", { id: cut.renderId, total_duration_ms: 1750, historical: false }, audio, () => true, () => false).issues.join(" ")).toContain("lacks its exact source interval");
  expect(db.prepare("SELECT * FROM audio_segments ORDER BY id").all()).toEqual(original);
  expect(crewBriefHash(loadCrewBrief(db, root, "p", "planning"), "planning")).toBe(planningHash);
});
it("holds an alignment beyond the decoded recording without rewriting reviewed rows", () => {
  db.exec("UPDATE audio_segments SET end_ms=1600 WHERE id='d'");
  expect(() => loadCrewBrief(db, root, "p", "editing")).toThrow("beyond its decoded recording");
  expect(db.prepare("SELECT end_ms FROM audio_segments WHERE id='d'").get()!.end_ms).toBe(1600);
});
it("previews a proven original-audio gap and tail, and holds fabricated interval identity", () => {
  db.exec("UPDATE audio_segments SET end_ms=250 WHERE id='n'; INSERT INTO chapter_renders(id,project_id,result_asset_path,total_duration_ms,shot_count,created_at)VALUES('gap-map','p','picture.mp4',1500,1,1)");
  const proof = { provenance: "unassigned_source_interval", sourcePath: "source.wav", sourceSha256: createHash("sha256").update(readFileSync(join(root,"assets/source.wav"))).digest("hex") };
  const map = [
    { segmentId: "n", sourceStartMs: 0, sourceEndMs: 250, startMs: 0, endMs: 250, voice: "original" },
    { ...proof, segmentId: "source-gap:n:d", sourceStartMs: 250, sourceEndMs: 500, startMs: 250, endMs: 500, voice: "original" },
    { segmentId: "d", sourceStartMs: 500, sourceEndMs: 1000, startMs: 500, endMs: 1000, voice: "cast" },
    { ...proof, segmentId: "source-tail:d", sourceStartMs: 1000, sourceEndMs: 1500, startMs: 1000, endMs: 1500, voice: "original" }
  ];
  db.prepare("INSERT INTO chapter_render_manifests(render_id,timeline_json,source_audio_json)VALUES('gap-map',?,?)").run(JSON.stringify([{ shotId: "shot", sourceStartMs: 0, startMs: 0, endMs: 1500 }]),JSON.stringify(map));
  const audio = db.prepare("SELECT a.*,m.original_segment_id FROM audio_segments a LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id").all() as any[];
  const preview = () => readProgrammePreview(db,"p",{ id: "gap-map", total_duration_ms: 1500, historical: false },audio,()=>true,(path, hash)=>path==="source.wav"&&hash===proof.sourceSha256);
  expect(preview().issues).toEqual([]); expect(preview().source).toHaveLength(1);
  expect(preview().source[0]).toMatchObject({ startMs: 0, endMs: 1500, sourceStartMs: 0 });
  map[1]!.segmentId = "source-gap:foreign:d";
  db.prepare("UPDATE chapter_render_manifests SET source_audio_json=? WHERE render_id='gap-map'").run(JSON.stringify(map));
  expect(preview().issues.join(" ")).toContain("source-gap:foreign:d lacks its exact source interval");
});
it("renders opening, intact source and care pause, then closing credits; restores and rebuilds the portable edit", () => {
  let cursor = 0;
  for (const [index,[id,type,color,duration]] of ([["title","title_card","red",250],["shore","establishing","blue",250],["boat","arrival","green",500]] as const).entries()) {
    const path = `${id}.mp4`;
    ffmpeg(["-f","lavfi","-i",`color=${color}:s=160x90:r=24:d=${duration/1000}`,"-c:v","libx264","-pix_fmt","yuv420p",join(root,"assets",path)]);
    db.prepare("INSERT INTO editorial_beats(id,project_id,sequence,placement,beat_type,description,rationale,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)VALUES(?,'p',?,'pre_source',?,?,'Synthetic fixed opening',?,?,?,'Editorial fixture','accepted','Synthetic fixture authority',1)").run(id,index+1,type,id,duration,cursor,cursor+duration);
    const proof = { projectId: "p", editorialBeatId: id, path, sha256: createHash("sha256").update(readFileSync(join(root,"assets",path))).digest("hex"),
      ...(index ? { durationMs: duration } : { probe: { format: { duration: String(duration/1000) } } }) };
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,'p',?,?,?,?,1)").run(id,index+1,index ? "select_editorial_media" : "select_editorial_title_card",JSON.stringify(proof),`opening:${id}`);
    cursor += duration;
  }
  const beforeRows = db.prepare("SELECT * FROM audio_segments ORDER BY id").all(), planningHash = crewBriefHash(loadCrewBrief(db,root,"p","planning"),"planning");
  addClosingTitles();
  const brief = loadCrewBrief(db,root,"p","editing");
  expect(brief.editorialOpening?.map(b=>b.id)).toEqual(["title","shore","boat"]); expect(brief.shots).toHaveLength(1);
  expect(brief.editorialClosing?.map(b=>[b.id,b.startMs,b.endMs])).toEqual([["credits",0,250],["domain",250,500]]);
  const edit = { summary: "Synthetic chapter coverage and care pause; titles added by the planner", findings: [], directions: [], pauses: [{afterSegmentId:"source-tail:d",durationMs:250,reason:"Synthetic care after complete narration"}], edits: [{ shotId: "shot", sourceStartMs: 0, durationMs: 1750 }] };
  const planned = planEditorialCut(brief,edit);
  expect(()=>planEditorialCut(brief,{ ...edit,pauses: [{ afterSegmentId: null,durationMs: 1000,reason: "Incorrect duplicate opening" }] })).toThrow("already defines the pre-source interval");
  expect(planned.durationMs).toBe(3250); expect(planned.audioMap[0]!.startMs).toBe(1000);
  expect(planned.audioMap.at(-1)!.endMs).toBe(2500);
  expect(planned.timeline.slice(-2).map(t=>[t.shotId,t.editorialBeatId,t.startMs,t.endMs])).toEqual([[null,"credits",2750,3000],[null,"domain",3000,3250]]);
  expect(planned.timeline.slice(0,3).map(t=>[t.shotId,t.editorialBeatId])).toEqual([[null,"title"],[null,"shore"],[null,"boat"]]);
  expect(()=>planEditorialCut(brief,{ ...edit, edits: [{ shotId: "boat",sourceStartMs: 0,durationMs: 1500 }] })).toThrow("unavailable footage");
  const result = { status: "approved", calls: 0, summary: "Synthetic fixed opening and intact source; no model calls", contributions: { picture_editor: edit } };
  const saveRun = (target: InstanceType<typeof DatabaseSync>, directory: string, id: string, at: number) => {
    const current = loadCrewBrief(target,directory,"p","editing");
    target.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES(?,'p','editing',?,?,'approved',?,?)").run(id,crewBriefHash(current,"editing"),JSON.stringify(current),JSON.stringify(result),at);
  };
  saveRun(db,root,"opening-edit",1); const cut = renderEditorialCut(db,root,"p","opening-edit");
  const finished = loadCrewBrief(db,root,"p","finishing"); expect(structuralCutFindings(finished)).toEqual([]);
  const missing = structuredClone(finished); missing.render!.timeline.pop();
  expect(structuralCutFindings(missing).join(" ")).toContain("closing credits are missing");
  const wrong = structuredClone(finished); wrong.render!.timeline.at(-1)!.sha256 = "0".repeat(64);
  expect(structuralCutFindings(wrong).join(" ")).toContain("unknown shot");
  const overlap = structuredClone(finished); overlap.render!.audioMap!.at(-1)!.endMs = 2800;
  expect(structuralCutFindings(overlap).join(" ")).toContain("credits overlap the source");
  expect(editorialReviewTargets(finished).join(" ")).not.toContain("Repeated shot null");
  const raw = ffmpeg(["-i",join(root,"assets",cut.path),"-f","f32le","-ar","8000","-ac","1","pipe:1"]), pcm = new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
  const frequency = (start: number,end: number) => { let n=0; for(let i=Math.round(start*8000)+1;i<end*8000;i++)if(pcm[i-1]!<=0&&pcm[i]!>0)n++;return n/(end-start); };
  expect(Math.max(...pcm.slice(800,6400).map(Math.abs))).toBeLessThan(.001);
  expect(frequency(1.1,1.4)).toBeCloseTo(330,-1); expect(frequency(1.6,1.9)).toBeCloseTo(880,-1); expect(frequency(2.1,2.4)).toBeCloseTo(660,-1);
  expect(Math.max(...pcm.slice(2.6*8000,3.2*8000).map(Math.abs))).toBeLessThan(.001);
  const pixel = (time: number) => ffmpeg(["-ss",String(time),"-i",join(root,"assets",cut.path),"-vf","scale=1:1","-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","pipe:1"]);
  expect(pixel(.1)[0]).toBeGreaterThan(180); expect(pixel(.35)[2]).toBeGreaterThan(180); expect(pixel(.7)[1]).toBeGreaterThan(80);
  expect(pixel(2.85)[0]).toBeGreaterThan(180); expect(pixel(2.85)[1]).toBeGreaterThan(180); expect(pixel(3.1)[2]).toBeGreaterThan(180);
  const audio = db.prepare("SELECT a.*,m.original_segment_id FROM audio_segments a LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id").all() as any[];
  const preview = readProgrammePreview(db,"p",{ id: cut.renderId,total_duration_ms: 3250,historical: false },audio,()=>true,
    (path,hash)=>createHash("sha256").update(readFileSync(join(root,"assets",path))).digest("hex")===hash);
  expect(preview.issues).toEqual([]); expect(preview.source[0]!.startMs).toBe(1000);
  expect(preview.timeline.at(-1)).toMatchObject({editorialBeatId:"domain",startMs:3000,endMs:3250,path:"domain.mp4"});
  const display = pictureTimeline({ programme: preview,reel: [{ id: "clip",shotId: "shot",label: "Synthetic chapter coverage",path: "picture.mp4",durationMs: 2000 }] } as any,"chapter");
  expect(display.spans.slice(0,3).map(s=>[s.shotId,s.path])).toEqual([[null,"title.mp4"],[null,"shore.mp4"],[null,"boat.mp4"]]);
  expect(display.spans.at(-1)).toMatchObject({shotId:null,path:"domain.mp4",startMs:3000,endMs:3250});
  expect(db.prepare("SELECT * FROM audio_segments ORDER BY id").all()).toEqual(beforeRows); expect(crewBriefHash(loadCrewBrief(db,root,"p","planning"),"planning")).toBe(planningHash);
  // Existing package tests cover application bundling; this fixture proves
  // the actual editorial dependencies survive an unavailable original root.
  const packaged = join(root,"opening-package"), restored = join(root,"restored");
  exportChapterPackage(db,root,"p",packaged,{ includeApplication: false }); expect(verifyChapterPackage(packaged).editability).toEqual([]);
  restoreChapterPackage(packaged,restored); renameSync(join(root,"assets"),join(root,"offline-original-assets"));
  const reopened = new DatabaseSync(join(restored,"db/heartword.sqlite"));
  try {
    expect(loadCrewBrief(reopened,restored,"p","editing").editorialOpening).toEqual(brief.editorialOpening);
    expect(loadCrewBrief(reopened,restored,"p","editing").editorialClosing).toEqual(brief.editorialClosing);
    saveRun(reopened,restored,"rebuilt-opening",2); const rebuilt = renderEditorialCut(reopened,restored,"p","rebuilt-opening");
    expect(structuralCutFindings(loadCrewBrief(reopened,restored,"p","finishing"))).toEqual([]);
    expect(readFileSync(join(restored,"assets",rebuilt.path)).length).toBeGreaterThan(1000);
    writeFileSync(join(restored,"assets/domain.mp4"),"changed synthetic editorial bytes");
    expect(()=>loadCrewBrief(reopened,restored,"p","editing")).toThrow("Selected editorial media changed");
  } finally { reopened.close(); }
},30000);

function addClosingTitles() {
  for (const [index,[id,color]] of ([["credits","yellow"],["domain","white"]] as const).entries()) {
    const path = `${id}.mp4`, start = 7777 + index*250;
    ffmpeg(["-f","lavfi","-i",`color=${color}:s=160x90:r=24:d=0.25`,"-c:v","libx264","-pix_fmt","yuv420p",join(root,"assets",path)]);
    db.prepare("INSERT INTO editorial_beats(id,project_id,sequence,placement,beat_type,description,rationale,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)VALUES(?,'p',?,'post_source','title_card',?,'Synthetic credits',250,?,?,'Closing credits','accepted','Synthetic fixture authority',1)").run(id,index+1,id,start,start+250);
    const proof = {projectId:"p",editorialBeatId:id,path,sha256:createHash("sha256").update(readFileSync(join(root,"assets",path))).digest("hex"),durationMs:250};
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,'p',?,'select_editorial_media',?,?,1)").run(`select-${id}`,10+index,JSON.stringify(proof),`closing:${id}`);
  }
}

it("holds closing titles with missing, changed, unreviewed or out-of-root media without changing planning", () => {
  const planningHash = crewBriefHash(loadCrewBrief(db,root,"p","planning"),"planning");
  addClosingTitles();
  const read = () => readAcceptedEditorialClosing(db,root,"p");
  expect(read()).toHaveLength(2);
  db.exec("UPDATE editorial_beats SET status='held' WHERE id='credits'"); expect(read).toThrow("closing needs complete");
  db.exec("UPDATE editorial_beats SET status='accepted',approved_by='' WHERE id='credits'"); expect(read).toThrow("closing needs complete");
  db.exec("UPDATE editorial_beats SET approved_by='Synthetic fixture authority' WHERE id='credits'; UPDATE editorial_beats SET timeline_start_ms=8030,timeline_end_ms=8280 WHERE id='domain'"); expect(read).toThrow("closing needs complete");
  db.exec("UPDATE editorial_beats SET timeline_start_ms=8027,timeline_end_ms=8277 WHERE id='domain'");
  const command = JSON.parse(String(db.prepare("SELECT payload FROM edit_commands WHERE id='select-domain'").get()!.payload));
  db.prepare("UPDATE edit_commands SET payload=? WHERE id='select-domain'").run(JSON.stringify({...command,path:"../outside.mp4"})); expect(read).toThrow("inside the project asset area");
  db.prepare("UPDATE edit_commands SET payload=? WHERE id='select-domain'").run(JSON.stringify({...command,projectId:"another-project"})); expect(read).toThrow("exact project and file proof");
  db.prepare("UPDATE edit_commands SET payload=? WHERE id='select-domain'").run(JSON.stringify(command));
  writeFileSync(join(root,"assets/domain.mp4"),"changed fixture bytes"); expect(read).toThrow("Selected editorial media changed");
  expect(crewBriefHash(loadCrewBrief(db,root,"p","planning"),"planning")).toBe(planningHash);
});

it("keeps narrative handoffs separate and refuses to use credits as source coverage or duplicate pauses", () => {
  addClosingTitles();
  db.exec("INSERT INTO editorial_beats(id,project_id,sequence,placement,beat_type,description,rationale,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)VALUES('handoff','p',9,'post_source','journey','Unselected next chapter','Synthetic handoff',1000,9000,10000,'Handoff','held','Synthetic fixture authority',1)");
  const brief = loadCrewBrief(db,root,"p","editing");
  expect(brief.editorialClosing?.map(b=>b.id)).toEqual(["credits","domain"]);
  const edit = {summary:"Synthetic",findings:[],directions:[],edits:[{shotId:"shot",sourceStartMs:0,durationMs:1500}]};
  expect(planEditorialCut(brief,edit).durationMs).toBe(2000);
  expect(()=>planEditorialCut(brief,{...edit,edits:[{shotId:"credits",sourceStartMs:0,durationMs:1500}]})).toThrow("unavailable footage");
  expect(()=>planEditorialCut(brief,{...edit,edits:[{shotId:"shot",sourceStartMs:0,durationMs:1000}]})).toThrow("Request the missing coverage");
  expect(()=>planEditorialCut(brief,{...edit,edits:[{shotId:"shot",sourceStartMs:0,durationMs:1475}]})).toThrow("before closing credits");
  expect(()=>planEditorialCut(brief,{...edit,pauses:[{afterSegmentId:"source-tail:d",durationMs:500,reason:"Incorrect duplicate credits"}]})).toThrow("Request the missing coverage");
  const cut = planEditorialCut(brief,edit), audio = db.prepare("SELECT a.*,m.original_segment_id FROM audio_segments a LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id").all() as any[];
  db.exec("INSERT INTO chapter_renders(id,project_id,result_asset_path,total_duration_ms,shot_count,created_at)VALUES('closing-map','p','picture.mp4',2000,1,1)");
  const map = cut.audioMap.map(a=>({...a,voice:"original",...(a.segmentId === "source-tail:d" ? {provenance:"unassigned_source_interval",sourcePath:"source.wav",sourceSha256:createHash("sha256").update(readFileSync(join(root,"assets/source.wav"))).digest("hex")} : {})}));
  db.prepare("INSERT INTO chapter_render_manifests(render_id,timeline_json,source_audio_json)VALUES('closing-map',?,?)").run(JSON.stringify(cut.timeline),JSON.stringify(map));
  const preview = () => readProgrammePreview(db,"p",{id:"closing-map",total_duration_ms:2000,historical:false},audio,()=>true,()=>true);
  expect(preview().issues).toEqual([]);
  db.prepare("UPDATE chapter_render_manifests SET source_audio_json=? WHERE render_id='closing-map'").run(JSON.stringify(map.map((a,i)=>i===map.length-1?{...a,endMs:1750}:a)));
  expect(preview().issues.join(" ")).toContain("credits overlap the source");
  db.prepare("UPDATE chapter_render_manifests SET source_audio_json=? WHERE render_id='closing-map'").run(JSON.stringify(map));
  db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id='closing-map'").run(JSON.stringify(cut.timeline.slice(0,-1)));
  expect(preview().issues.join(" ")).toContain("closing credits are missing");
});
