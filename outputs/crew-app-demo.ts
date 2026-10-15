/** Isolated, scripted demonstration of the real crew runtime and web app.
 * No production DB/assets, external models, media generation or approvals.
 * Launch with HEARTWORD_DATA_DIR set to the explicit scratch directory below.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import express from "express";
import type { CrewContribution, CrewRole } from "../src/pipeline/creative-direction/crew-types.js";
import type { FilmChange, ProductionRecord } from "../src/pipeline/creative-direction/production-record.js";

const intended = resolve("C:/Users/danbr/HeartWordData/scratch/crew-app-demo-2026-10-14");
assert.equal(resolve(process.env.HEARTWORD_DATA_DIR ?? ""), intended, "Demo requires its explicit isolated scratch directory.");
const marker = join(intended, "TEST-FILM.json");
if (existsSync(intended)) assert.equal(JSON.parse(readFileSync(marker,"utf8")).purpose, "scripted-crew-app-demo");
else { mkdirSync(intended,{recursive:true}); writeFileSync(marker,JSON.stringify({purpose:"scripted-crew-app-demo",productionDataConnected:false},null,2)); }
// This process cannot submit a provider request even if a wrong route is used.
globalThis.fetch = (async () => { throw new Error("External/provider requests are disabled in the isolated test-film process."); }) as typeof fetch;
const { getDb } = await import("../src/db/client.js");
const { runProductionCrew, latestCrewRun, requireCurrentPlan, productionRecordForRun, directionsFromRun } = await import("../src/pipeline/creative-direction/crew-store.js");
const { projectsRouter } = await import("../src/server/routes/projects.js");
const { productionRouter } = await import("../src/server/routes/production.js");
const { charactersRouter } = await import("../src/server/routes/characters.js");
const { PRODUCTION_ROLE_REGISTRY } = await import("../src/pipeline/creative-direction/role-registry.js");
const db = getDb(), projectId="crew-demo-test-film", shotId="test-shot-1", characterId="test-witness";
const statePath=join(intended,"demo-state.json");
type DemoState={heldRunId?:string;acceptedRunId?:string;producerRevision?:string;autonomousRunId?:string;immutableHashes:Record<string,string>};
const state:DemoState=existsSync(statePath)?JSON.parse(readFileSync(statePath,"utf8")):{immutableHashes:{}};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const saveState=()=>writeFileSync(statePath,JSON.stringify(state,null,2)+"\n");
function file(path:string,bytes:Buffer|string){const target=join(intended,"assets",path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
function docx(text:string):Buffer{
  const name=Buffer.from("word/document.xml"),bytes=Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);
  return Buffer.concat([local,name,bytes,central,name,end]);
}
if(!db.prepare("SELECT id FROM projects WHERE id=?").get(projectId)){
  assert.equal(db.prepare("SELECT COUNT(*) n FROM projects").get()!.n,0,"Refuse to seed a database containing other films.");
  const now=Date.now();
  db.prepare("INSERT INTO projects(id,language,book,chapter,stage,status,created_at,updated_at) VALUES(?,'hatam','mark',5,'creative_direction','in_progress',?,?)").run(projectId,now,now);
  db.exec(`INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,summary,reasoning,spatial_continuity,lighting_continuity,created_at)
    VALUES('test-scene','${projectId}',1,'Mark 5:1','Mark 5:2','TEST FILM: camera/blocking, rejected wardrobe and producer edit','Scripted fixture only. These descriptions do not interpret Scripture or verify Hatam.','Test set with established witness mark and clear right aisle','Soft daylight; preserve continuity',${now});
    INSERT INTO shots(id,scene_id,sequence,verse_ref,action,framing,camera_movement,continuity_notes,spatial_view,created_at)
    VALUES('${shotId}','test-scene',1,'Mark 5:1','Test witness remains on the established standing mark','Wide','Still','Approved cream mantle; established witness mark','Front view',${now}),
    ('test-shot-2','test-scene',2,'Mark 5:2','Test listener stays still','Medium','Still','Same cream mantle','Front view',${now});
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES('${characterId}','TEST witness (synthetic)','global','approved','Papuan',${now},${now});
    INSERT INTO character_versions(id,character_id,version_label,status,notes,created_at) VALUES('test-canon','${characterId}','TEST fixture only','approved','Approved cream mantle; fixed cut and drape. Synthetic baseline, not real regional canon approval.',${now});
    INSERT INTO character_assets(id,character_version_id,category,path,created_at) VALUES('test-reference','test-canon','body_pose','test/canon-placeholder.png',${now});
    INSERT INTO shot_characters VALUES('${shotId}','${characterId}'),('test-shot-2','${characterId}');
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES('test-source','${projectId}','original_reading','test/silent-fixture.wav',0,8000,'Mark 5:1-2',${now});`);
  file("source/hatam/mark-5/mark-5-text.docx",docx("1TEST fixture source words; this is not Hatam Scripture. 2Second test fixture interval."));
  file("reference/english/mark-5/mark-5-text.docx",docx("1TEST fixture reference for the first interval. 2TEST fixture reference for the second interval. No Scripture interpretation or film quality is claimed."));
  file("test/canon-placeholder.png",Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0h8AAAAASUVORK5CYII=","base64"));
  const wav=Buffer.alloc(44+16000*8*2);wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(wav.length-44,40);file("test/silent-fixture.wav",wav);
  saveState();
}
assert.equal(db.prepare("SELECT COUNT(*) n FROM projects").get()!.n,1);
function context(prompt:string):{role:CrewRole;record:ProductionRecord}{
  return {role:prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_") as CrewRole,
    record:JSON.parse(prompt.split("SAVED PRODUCTION RECORD:\n")[1]!.split("\nUse filmChanges")[0]!) as ProductionRecord};
}
function change(record:ProductionRecord,layer:FilmChange["target"]["layer"],entityId:string,name:string,value:string):FilmChange{
  const before=record.snapshots.flatMap(s=>s[layer]).find(e=>e.id===entityId)!.facts[name]!;
  return {target:{layer,entityId,fact:name},before:structuredClone(before),after:{...structuredClone(before),value,status:"proposed",approvalRecord:null,reason:"Scripted test-film alternative; review against established blocking and continuity."}};
}
type Mode="disagreement"|"reconcile"|"autonomous";
const producerAction="Producer edit: keep the test witness seated on the established mark; preserve cream mantle and source performance";
function scriptedReply(mode:Mode,prompt:string):CrewContribution{
  const {role,record}=context(prompt);
  const facts=record.snapshots[0]!.states.find(s=>s.id===`state:${shotId}`)!.facts;
  const out:CrewContribution={summary:`[SCRIPTED TEST] ${role.replaceAll("_"," ")} retains the established source, blocking and cream wardrobe. No real media was inspected.`,
    directions:[shotId,"test-shot-2"].map(id=>({shotId:id,instruction:id===shotId?String(facts.performance!.value):"Preserve the test listener and cream mantle.",scriptureBasis:"Synthetic fixture only; not a claim about Scripture, Hatam or generated media."})),findings:[]};
  if(role==="picture_editor")Object.assign(out,{coverageRequests:[],edits:[],pauses:[],editorialChecks:[]});
  if(role==="production_director")Object.assign(out,{decision:"approve",decisionConfidence:90,decisionLimitations:"Scripted demonstration of saved intent only; no actual media, source-language, field or release approval.",acceptedContributionIds:[]});
  if(mode==="disagreement"){
    if(role==="cinematographer"){
      out.summary="[SCRIPTED TEST] Leon proposes a left-aisle camera and moving the witness to make room. Tessa must review the blocking change.";
      out.filmChanges=[change(record,"shots",shotId,"cameraPosition","Left aisle, occupying the witness blocking space"),change(record,"states",`state:${shotId}`,`${characterId}.pose`,"Move the witness off the established mark to fit the camera")];
    }
    if(role==="choreographer"){
      out.summary="[SCRIPTED TEST] Tessa objects: camera placement must adapt to the established blocking.";
      out.findings=[{shotId,severity:"blocking",evidence:"Leon's left-aisle proposal occupies the established witness mark and also proposes moving the witness.",requestedChange:"Revise camera placement; retain the established blocking",confidence:90,limitations:"Scripted set description, not measured geometry."}];
    }
    if(role==="costume_designer"){
      out.summary="[SCRIPTED TEST] Costume proposes a blue mantle as an alternative; the cream canon baseline remains controlling.";
      out.filmChanges=[change(record,"world",characterId,"garment","Blue mantle instead of the approved cream mantle")];
    }
    if(role==="script_supervisor"){
      out.summary="[SCRIPTED TEST] Orion rejects the blue-mantle alternative: continuity and the pinned cream baseline take precedence.";
      out.findings=[{shotId,severity:"blocking",evidence:"The pinned TEST canon and preceding setup both specify the same cream mantle. Blue would break continuity.",requestedChange:"Reject the blue wardrobe change and retain the approved cream mantle",confidence:98,limitations:"Synthetic notes only; no generated images were inspected."}];
    }
    if(role==="production_director"){out.decision="hold";out.summary="[SCRIPTED TEST] GENERATION HELD: camera conflicts with blocking; continuity rejects the blue mantle. Both objections remain visible until explicit resolution.";}
  }
  if(mode==="reconcile"){
    if(role==="cinematographer"){
      out.summary="[SCRIPTED TEST] Leon revises the camera to the clear right aisle and withdraws the actor-move alternative by superseding it. Blocking stays unchanged.";
      out.filmChanges=[change(record,"shots",shotId,"cameraPosition","Right aisle, clear of the witness mark; preserve the established blocking")];
    }
    if(role==="choreographer"){
      out.summary="[SCRIPTED TEST] Tessa accepts the revised camera: it clears the witness mark without changing blocking.";
      out.objectionResponses=record.objections.filter(o=>o.owner===role&&o.status==="open").map(o=>({objectionId:o.id,outcome:"resolved",rationale:"The revised right-aisle camera clears the witness mark; the actor-move proposal is not selected.",evidence:"Compared Leon's current camera-only contribution with the retained baseline pose."}));
    }
    if(role==="costume_designer"){
      out.summary="[SCRIPTED TEST] Costume withdraws the blue mantle after Orion's continuity rejection. Keep cream; preserve the rejected alternative in history.";
      const proposal=record.history.find(h=>h.owner===role&&h.proposedChanges.some(c=>c.target.fact==="garment"))!;
      out.withdrawals=[{contributionId:proposal.id,rationale:"Withdraw blue and retain the pinned cream mantle after continuity rejection.",evidence:"Orion's saved objection and test-canon cream baseline."}];
    }
    if(role==="script_supervisor"){
      out.summary="[SCRIPTED TEST] Orion verifies withdrawal of blue. The wardrobe change is rejected; the approved cream mantle survives.";
      out.objectionResponses=record.objections.filter(o=>o.owner===role&&o.status==="open").map(o=>({objectionId:o.id,outcome:"resolved",rationale:"Costume explicitly withdrew blue and retained cream; the rejected proposal remains in history.",evidence:"Current costume withdrawal and unchanged world.garment baseline."}));
    }
    if(role==="production_director"){
      out.acceptedContributionIds=[record.history.filter(h=>h.owner==="cinematographer"&&h.id.startsWith(`${record.revision}:`)&&h.proposedChanges.length).at(-1)!.id];
      out.summary="[SCRIPTED TEST] ACCEPTED: right-aisle camera, established blocking, cream mantle. Camera/blocking and wardrobe objections were explicitly resolved; rejected alternatives remain in history.";
    }
  }
  if(mode==="autonomous"){
    assert.equal(facts.performance!.value,producerAction,"Autonomous review must consume the producer's saved edit.");
    out.summary=`[SCRIPTED TEST — AUTONOMOUS CALLER] ${role.replaceAll("_"," ")} read the producer edit from saved revision ${record.parentRevision}: keep the witness seated. Retain accepted right-aisle camera, cream mantle and prior disagreement history.`;
    if(role==="production_director")out.summary="[SCRIPTED TEST] AUTONOMOUS REVIEW ACCEPTED: the saved producer edit keeps the witness seated. Accepted right-aisle camera and cream mantle persist; earlier proposals, objections and producer history are retained. No generation was submitted.";
  }
  return out;
}
function evidence(){
  const run=latestCrewRun(db,projectId,"planning"),record=productionRecordForRun(db,run);
  let generationReady=false,holdReason:string|null=null;
  try{requireCurrentPlan(db,intended,projectId);generationReady=true;}catch(error){holdReason=(error as Error).message;}
  const unchanged=Object.entries(state.immutableHashes).every(([id,sha])=>hash(db.prepare("SELECT brief_json,result_json FROM production_runs WHERE id=?").get(id))===sha);
  assert.ok(unchanged,"Earlier demo brief/results must be immutable.");
  const value={purpose:"Isolated scripted TEST film in the real HeartWord web app and crew runtime; no actual Scripture/film quality approval",...state,
    generationReady,holdReason,providerSubmissions:0,providerChargesUsd:0,assistantUsageCost:"unreported",productionDatabaseConnected:false,
    priorBriefsAndResultsUnchanged:unchanged,producerAction:db.prepare("SELECT action FROM shots WHERE id=?").get(shotId)!.action,
    acceptedDirection:record?.status==="accepted"&&run?directionsFromRun(run,shotId):null,
    producerEdits:db.prepare("SELECT * FROM edit_commands WHERE command_type='producer_creative_edit' ORDER BY sequence").all(),productionRecord:record};
  writeFileSync(join(intended,"workflow-evidence.json"),JSON.stringify(value,null,2)+"\n");return value;
}
async function run(mode:Mode){
  const result=await runProductionCrew(projectId,"planning",{db,dataDir:intended,maxCalls:24,call:async prompt=>scriptedReply(mode,prompt)});
  assert.equal(result.status,mode==="disagreement"?"held":"approved",result.summary);
  if(mode==="disagreement")state.heldRunId=result.runId;
  if(mode==="reconcile"){
    state.acceptedRunId=result.runId;
    const record=result.productionRecord!;
    assert.ok(record.history.some(h=>h.resolution?.outcome==="rejected"));
    assert.ok(record.objections.length===2&&record.objections.every(o=>o.status==="resolved"));
    assert.match(String(record.snapshots[0]!.world[0]!.facts.garment!.value),/cream/);
    assert.match(directionsFromRun(requireCurrentPlan(db,intended,projectId),shotId),/Right aisle/);
  }
  if(mode==="autonomous"){
    state.autonomousRunId=result.runId;
    assert.equal(result.productionRecord!.parentRevision,state.producerRevision);
    assert.match(directionsFromRun(requireCurrentPlan(db,intended,projectId),shotId),/keep the test witness seated/);
  }
  state.immutableHashes[result.runId]=hash(db.prepare("SELECT brief_json,result_json FROM production_runs WHERE id=?").get(result.runId));
  saveState();evidence();return result;
}
const app=express();app.use(express.json());
app.get("/api/health",(_req,res)=>res.json({status:"ok",testFilm:true,dataDir:intended}));
app.get("/api/voices",(_req,res)=>res.json({voices:[],note:"Disabled in scripted test film."}));
app.get("/api/control-room/roster",(_req,res)=>res.json({roster:PRODUCTION_ROLE_REGISTRY}));
app.get("/demo/state",(_req,res)=>res.json(evidence()));
app.post(`/api/projects/${projectId}/production/plan`,async(_req,res)=>{
  try{if(state.acceptedRunId)throw new Error("Review checkpoints complete; use the separate autonomous test caller after a producer edit.");res.json(await run(state.heldRunId?"reconcile":"disagreement"));}
  catch(error){res.status(409).json({error:(error as Error).message});}
});
app.post("/demo/autonomous",async(_req,res)=>{
  try{
    assert.ok(state.acceptedRunId,"Complete the manual disagreement review first.");
    const current=requireCurrentPlan(db,intended,projectId);
    assert.ok(current.id!==state.acceptedRunId,"Save a producer edit through the existing PATCH route first.");
    state.producerRevision=current.id;saveState();
    res.json(await run("autonomous"));
  }catch(error){res.status(409).json({error:(error as Error).message});}
});
// Only the real producer-edit route can mutate test data through the app.
app.use((req,res,next)=>{
  if(req.method==="GET"||req.method==="HEAD"||(req.method==="PATCH"&&req.path===`/api/projects/${projectId}/shots/${shotId}`))return next();
  res.status(409).json({error:"This isolated demonstration disables paid production and unrelated mutations."});
});
app.use("/api/projects/:projectId/production",productionRouter);
app.use("/api/projects",projectsRouter);app.use("/api/characters",charactersRouter);
app.use("/media",express.static(join(intended,"assets")));
const web=resolve("dist/web");assert.ok(existsSync(join(web,"index.html")),"Build the existing web app first.");
app.get("/",(_req,res)=>res.type("html").send(readFileSync(join(web,"index.html"),"utf8").replace("<title>HeartWord</title>","<title>HeartWord — TEST FILM</title>").replace("<body>",`<body><aside role="note" style="position:sticky;top:0;z-index:10;background:#fff0c2;color:#302100;padding:12px 20px;border-bottom:2px solid #d6a441;font:15px system-ui"><strong>ISOLATED TEST FILM</strong> · Scripted crew replies; synthetic source/canon fixtures; no paid generation. Mark 4 and previous films are not connected.</aside>`)));
app.use(express.static(web));
app.listen(4016,"127.0.0.1",()=>console.log(`HeartWord TEST film: http://127.0.0.1:4016 | Saved state: ${intended}`));
