import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import express from "express";
import type { Server } from "node:http";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewContribution, CrewRole } from "../../src/pipeline/creative-direction/crew-types.js";
import type { ProductionRecord, FilmChange } from "../../src/pipeline/creative-direction/production-record.js";
import { withFixtureTreatment } from "../helpers/crew-treatment.js";
import { reconcileAvatarBudget } from "../../src/pipeline/voice-lipsync/performance-direction.js";

const state=vi.hoisted(()=>({db:null as any,dir:"",reply:null as any}));
vi.mock("../../src/db/client.js",()=>({getDb:()=>state.db,getDataDir:()=>state.dir}));
vi.mock("../../src/providers/gemini-text.js",async original=>({...await original<object>(),generateJsonWithImagesMetered:vi.fn(async(prompt:string)=>({result:await state.reply(prompt),usage:{totalTokenCount:2},costUsd:0}))}));
vi.mock("../../src/pipeline/qc/video-review.js",()=>({reviewGeneratedVideo:vi.fn(async()=>({verdict:{reason:"Synthetic review only",confidence:99},costUsd:0})),videoReviewPassed:()=>true}));
import { runProductionCrew, requireCurrentPlan, productionRecordForRun, latestCrewRun, directionsFromRun, applyProducerCreativeEdit, productionAuthorization, validateHandoffPlan, recoverInterruptedCrew } from "../../src/pipeline/creative-direction/crew-store.js";
import { generateNonSpeakingVideoCandidate, acceptFinalVideoCandidate } from "../../src/pipeline/media-generation/final-video.js";
import { productionRouter } from "../../src/server/routes/production.js";
import { loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { projectsRouter } from "../../src/server/routes/projects.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db:InstanceType<typeof DatabaseSync>,server:Server|undefined;
const projectId="synthetic-crew";
function file(path:string,bytes:string|Buffer){const target=join(state.dir,"assets",path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
function docx(text:string):Buffer{
  const name=Buffer.from("word/document.xml"),bytes=Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);
  return Buffer.concat([local,name,bytes,central,name,end]);
}
function context(prompt:string):{role:CrewRole;round:number;record:ProductionRecord}{
  const role=prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_") as CrewRole;
  const round=Number(prompt.match(/pass (\d)\/2/)![1]);
  const record=JSON.parse(prompt.split("SAVED PRODUCTION RECORD:\n")[1]!.split("\nUse filmChanges")[0]!) as ProductionRecord;
  return {role,round,record};
}
function reply(prompt:string):CrewContribution{
  const {role}=context(prompt);
  const out:CrewContribution={summary:`${role} reviewed a synthetic fixture, not actual Hatam media.`,directions:["shot1","shot2"].map(shotId=>({shotId,instruction:"Preserve the established encounter, fixed wardrobe and source performance.",scriptureBasis:"Synthetic Mark 5:1–2 fixture context."})),findings:[]};
  if(role==="picture_editor")Object.assign(out,{coverageRequests:[],edits:[],pauses:[],editorialChecks:[]});
  if(role==="production_director")Object.assign(out,{decision:"approve",decisionConfidence:88,decisionLimitations:"Synthetic local intent review; no actual media or language validation.",acceptedContributionIds:[]});
  return withFixtureTreatment(prompt,out);
}
const change=(record:ProductionRecord,layer:FilmChange["target"]["layer"],entityId:string,name:string,value:string):FilmChange=>{
  const before=record.snapshots.flatMap(s=>s[layer]).find(e=>e.id===entityId)!.facts[name]!;
  return {target:{layer,entityId,fact:name},before:structuredClone(before),after:{...structuredClone(before),value,status:"proposed",approvalRecord:null,reason:"Synthetic bounded alternative for owner review."}};
};
async function plan(){return runProductionCrew(projectId,"planning",{db,dataDir:state.dir});}
function producer(note="Keep the actor seated",expectedRevision?:string){return applyProducerCreativeEdit(db,state.dir,projectId,{kind:"shot",subjectId:"shot1",fields:{action:note},note:"Synthetic producer correction",expectedRevision,idempotencyKey:note});}
async function listen(){const app=express();app.use(express.json());app.use("/api/projects/:projectId/production",productionRouter);app.use("/api/projects",projectsRouter);await new Promise<void>(resolve=>{server=app.listen(0,resolve);});return `http://127.0.0.1:${(server!.address() as any).port}/api/projects`;}
const ajv=new Ajv2020({strict:true,allowUnionTypes:true,allErrors:true});
ajv.addSchema(JSON.parse(readFileSync("docs/design/fdl/bible-regional.v2.schema.json","utf8")));
const validate=ajv.compile(JSON.parse(readFileSync("docs/design/fdl/core.v2.schema.json","utf8")));
const validateEnvelope=ajv.compile(JSON.parse(readFileSync("docs/design/fdl/crew-contribution.v1.schema.json","utf8")));
beforeEach(()=>{
  state.dir=mkdtempSync(join(tmpdir(),"hw-crew-runtime-"));
  vi.stubEnv("HEARTWORD_CREW_CALL_UPPER_BOUND_USD","1");
  db=new DatabaseSync(join(state.dir,"state.sqlite"));state.db=db;db.exec(readFileSync("src/db/schema.sql","utf8"));state.reply=reply;
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('${projectId}','hatam','mark',5,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,spatial_continuity,lighting_continuity,created_at)VALUES('scene','${projectId}',1,'Mark 5:1','Mark 5:2','Retained room and aisle','Readable daylight',1);
    INSERT INTO shots(id,scene_id,sequence,verse_ref,action,framing,camera_movement,created_at)VALUES('shot1','scene',1,'Mark 5:1','Established encounter','Wide','Still',1),('shot2','scene',2,'Mark 5:2','Quiet listener','Medium','Still',1);
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Synthetic witness','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,notes,created_at)VALUES('cv','c','fixture','approved','Approved cream mantle; fixed cut and drape',1);
    INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('ref','cv','body_pose','canon.png',1);
    INSERT INTO shot_characters VALUES('shot1','c'),('shot2','c');
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('source','${projectId}','original_reading','source.wav',0,8000,'Mark 5:1-2',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('accepted-key','shot1','synthetic','fixture','generate','accepted','key.png',0,1);`);
  file("source/hatam/mark-5/mark-5-text.docx",docx("1Original fixture words. 2More original words."));
  file("reference/english/mark-5/mark-5-text.docx",docx("1Reference fixture words. 2More reference words."));
  file("canon.png",Buffer.from("89504e470d0a1a0a0000000d494844520000078000000438","hex"));file("source.wav","synthetic immutable audio bytes");file("key.png","synthetic accepted pixels");file("returned.mp4","synthetic video, not playable media");
  reconcileAvatarBudget(db,{projectId,actor:"Synthetic reviewer",evidence:"Only mocked providers; positively no fixture liabilities.",unreportedUpperBoundUsd:0,outstandingUpperBoundUsd:0,idempotencyKey:"fixture-budget"});
});
afterEach(async()=>{vi.unstubAllEnvs();if(server){await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;}db.close();if(state.dir.startsWith(join(tmpdir(),"hw-crew-runtime-")))rmSync(state.dir,{recursive:true,force:true});});

describe("saved crew production runtime",()=>{
  it("pins accepted treatment into later briefs and retains legacy plans without authorizing new generation",async()=>{
    const result=await plan();expect(result.status,result.summary).toBe("approved");
    const later=loadCrewBrief(db,state.dir,projectId,"editing");
    expect(later.acceptedEmotionalTreatment).toMatchObject({runId:result.runId,treatment:result.contributions.creative_director!.emotionalTreatment});
    const original=db.prepare("SELECT * FROM production_runs WHERE id=?").get(result.runId)!;
    db.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES('incomplete-treatment',?,'planning',?,?,'incomplete',?,?)").run(projectId,original.brief_hash,original.brief_json,JSON.stringify({emotionalTreatmentRequired:true,contributions:{}}),Number(original.created_at)+1);
    expect(()=>loadCrewBrief(db,state.dir,projectId,"editing")).toThrow("treatment is incomplete");
    db.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES('legacy',?,'planning',?,?,'approved',?,?)").run(projectId,original.brief_hash,original.brief_json,JSON.stringify({contributions:{},summary:"Historical plan; no advance treatment"}),Number(original.created_at)+1);
    expect(()=>requireCurrentPlan(db,state.dir,projectId)).toThrow("advance emotional treatment");
    expect(loadCrewBrief(db,state.dir,projectId,"editing").acceptedEmotionalTreatment).toBeUndefined();
    expect(db.prepare("SELECT * FROM production_runs WHERE id=?").get(result.runId)).toEqual(original);
  });
  it("saves schema-compatible FDL and contribution envelopes without changing sources, canon or accepted media",async()=>{
    const source=readFileSync(join(state.dir,"assets/source.wav")),key=readFileSync(join(state.dir,"assets/key.png"));
    const result=await plan();expect(result.status,result.summary).toBe("approved");
    for(const snapshot of result.productionRecord!.snapshots)expect(validate(snapshot),JSON.stringify(validate.errors)).toBe(true);
    for(const event of result.productionRecord!.history)expect(validateEnvelope(event),JSON.stringify(validateEnvelope.errors)).toBe(true);
    expect(requireCurrentPlan(db,state.dir,projectId).id).toBe(result.runId);
    expect(readFileSync(join(state.dir,"assets/source.wav"))).toEqual(source);expect(readFileSync(join(state.dir,"assets/key.png"))).toEqual(key);
    expect(db.prepare("SELECT COUNT(*) n FROM character_versions").get()!.n).toBe(1);
  });

  it("resolves camera versus blocking while retaining the original proposal, objection and owner resolution",async()=>{
    state.reply=(prompt:string)=>{const {role,round,record}=context(prompt),out=reply(prompt);
      if(role==="cinematographer")out.filmChanges=round===1?[change(record,"shots","shot1","cameraPosition","Side aisle occupying actor space"),change(record,"states","state:shot1","c.pose","Move actor for the camera")]:[change(record,"shots","shot1","cameraPosition","Front aisle clear of actor space")];
      if(role==="choreographer"&&round===1)out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Synthetic established actor space conflicts with the proposed camera.",requestedChange:"Move the camera and retain blocking",confidence:86,limitations:"Synthetic plan only, no measured set."}];
      if(role==="choreographer"&&round===2)out.objectionResponses=record.objections.filter(o=>o.owner===role&&o.status==="open").map(o=>({objectionId:o.id,outcome:"resolved",rationale:"Revised camera clears actor space without the proposed actor move.",evidence:"Compared the current camera revision with the unchanged pose."}));
      if(role==="production_director"){out.decision=round===1?"revise":"approve";out.acceptedContributionIds=round===1?[]:[record.history.filter(h=>h.owner==="cinematographer"&&h.kind==="revision").at(-1)!.id];}return out;};
    const result=await plan();expect(result.status,result.summary).toBe("approved");const record=result.productionRecord!;
    expect(record.objections[0]!.status).toBe("resolved");expect(record.history.some(h=>h.proposedChanges.some(c=>c.after.value==="Move actor for the camera"))).toBe(true);
    const direction=directionsFromRun(requireCurrentPlan(db,state.dir,projectId),"shot1");expect(direction).toContain("Front aisle clear");expect(direction).not.toContain("Move actor");
    expect(record.snapshots[0]!.states[0]!.facts["c.pose"]!.value).toBeNull();
  });

  it("rejects a wardrobe redesign through continuity and carries the disagreement forward",async()=>{
    state.reply=(prompt:string)=>{const {role,round,record}=context(prompt),out=reply(prompt);
      if(role==="costume_designer"&&round===1)out.filmChanges=[change(record,"world","c","garment","Blue mantle")];
      if(role==="costume_designer"&&round===2){const proposal=record.history.find(h=>h.owner===role&&h.proposedChanges.length)!;out.withdrawals=[{contributionId:proposal.id,rationale:"Withdraw blue and preserve the approved cream mantle.",evidence:"Canon and the continuity objection control this proposal."}];}
      if(role==="script_supervisor"&&round===1)out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Pinned canon and earlier view require cream.",requestedChange:"Reject the blue mantle proposal",confidence:97,limitations:"Synthetic continuity evidence."}];
      if(role==="script_supervisor"&&round===2){const proposal=record.history.find(h=>h.owner==="costume_designer"&&h.proposedChanges.length)!;
        out.ownerResponses=[];out.objectionResponses=record.objections.filter(o=>o.owner===role&&o.status==="open").map(o=>({objectionId:o.id,outcome:"resolved",rationale:"Costume withdrew the proposal; unchanged cream baseline verified.",evidence:`Rejected alternative ${proposal.id} remains only in history.`}));}
      if(role==="production_director")out.decision=round===1?"revise":"approve";return out;};
    const result=await plan();expect(result.status,result.summary).toBe("approved");
    expect(result.productionRecord!.snapshots[0]!.world[0]!.facts.garment!.value).toContain("cream");expect(directionsFromRun(requireCurrentPlan(db,state.dir,projectId),"shot1")).not.toContain("Blue mantle");
    expect(result.productionRecord!.history.some(h=>h.id.includes(":withdrawal:")&&h.resolution?.outcome==="rejected")).toBe(true);
    state.reply=reply;const next=await plan();expect(next.status,next.summary).toBe("approved");expect(next.productionRecord!.history.some(h=>h.proposedChanges.some(c=>c.after.value==="Blue mantle"))).toBe(true);
  });

  it("does not clear an old blocking objection just because later findings are empty",async()=>{
    state.reply=(prompt:string)=>{const {role,round}=context(prompt),out=reply(prompt);if(role==="script_supervisor"&&round===1)out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Unresolved fixture continuity conflict",requestedChange:"Review blocking",confidence:82,limitations:"Synthetic evidence"}];if(role==="production_director")out.decision=round===1?"revise":"approve";return out;};
    const held=await plan();expect(held.status).toBe("held");expect(()=>productionAuthorization(db,state.dir,projectId)).toThrow();
    state.reply=reply;const again=await plan();expect(again.status).toBe("held");expect(again.productionRecord!.objections[0]!.status).toBe("open");
    state.reply=(prompt:string)=>{const {role,record}=context(prompt),out=reply(prompt);if(role==="script_supervisor")out.objectionResponses=record.objections.filter(o=>o.status==="open"&&o.owner===role).map(o=>({objectionId:o.id,outcome:"resolved",rationale:"Reviewed the retained conflict against corrected staging.",evidence:"Explicit original-reviewer comparison."}));return out;};
    expect((await plan()).status).toBe("approved");
  });

  it("holds cross-domain proposals without consent and accepts only a fresh owner-reviewed proposal",async()=>{
    let consent=false;
    state.reply=(prompt:string)=>{const {role,record}=context(prompt),out=reply(prompt);
      if(role==="cinematographer")out.filmChanges=[change(record,"states","state:shot1","c.gaze","Look toward the encounter")];
      const latest=record.history.filter(h=>h.owner==="cinematographer"&&h.proposedChanges.length).at(-1);
      if(role==="choreographer"&&consent)out.ownerResponses=[{contributionId:latest!.id,outcome:"accepted",rationale:"Eyeline respects the established encounter.",evidence:"Reviewed current proposal and shared staging."}];
      if(role==="production_director")out.acceptedContributionIds=[latest!.id];return out;};
    expect((await plan()).status).toBe("held");consent=true;const accepted=await plan();expect(accepted.status,accepted.summary).toBe("approved");
    expect(accepted.productionRecord!.snapshots[0]!.states[0]!.facts["c.gaze"]!.value).toBe("Look toward the encounter");
    applyProducerCreativeEdit(db,state.dir,projectId,{kind:"scene",subjectId:"scene",fields:{lighting_continuity:"Producer's brighter daylight"},note:"Synthetic lighting correction"});
    const edited=productionRecordForRun(db,requireCurrentPlan(db,state.dir,projectId))!;
    expect(edited.snapshots[0]!.states[0]!.facts["c.gaze"]!.value).toBe("Look toward the encounter");
    expect(edited.snapshots[0]!.states[0]!.facts["light.direction"]!.value).toBe("Producer's brighter daylight");
  });

  it("retains a late review without replacing the producer's newer accepted revision",async()=>{
    const baseline=await plan();const baselineBytes=db.prepare("SELECT brief_json FROM production_runs WHERE id=?").get(baseline.runId)!.brief_json;
    let edited=false,newRevision:string|null=null;
    state.reply=(prompt:string)=>{const out=reply(prompt);if(!edited){edited=true;newRevision=producer("Producer retains seated blocking").revision;}return out;};
    const stale=await plan();expect(stale.status).toBe("held");expect(requireCurrentPlan(db,state.dir,projectId).id).toBe(newRevision);
    expect(db.prepare("SELECT brief_json FROM production_runs WHERE id=?").get(baseline.runId)!.brief_json).toBe(baselineBytes);
    expect(stale.calls).toBeLessThan(4);expect(directionsFromRun(requireCurrentPlan(db,state.dir,projectId),"shot1")).toContain("seated blocking");
  });

  it("shares manual API, autonomous caller, immutable producer edits, replay and reopened state",async()=>{
    const base=await listen();let result=await fetch(`${base}/${projectId}/production/plan`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});expect(result.status).toBe(200);
    const first=await result.json() as {runId:string;status:string};expect(first.status).toBe("approved");
    const before=db.prepare("SELECT * FROM production_runs WHERE id=?").get(first.runId);
    const body={action:"Producer keeps the actor seated",note:"Preserve the accepted encounter",expectedRevision:first.runId,idempotencyKey:"fixture-edit"};
    const patch=()=>fetch(`${base}/${projectId}/shots/shot1`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const edited=await patch();expect(edited.status).toBe(200);const saved=await edited.json() as {revision:string};expect(saved.revision).not.toBe(first.runId);
    expect((await patch()).status).toBe(200);expect(db.prepare("SELECT * FROM production_runs WHERE id=?").get(first.runId)).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE command_type='producer_creative_edit'").get()!.n).toBe(1);
    expect(()=>producer("A conflicting stale edit",first.runId)).toThrow("stale");
    const edit=JSON.parse(String(db.prepare("SELECT payload FROM edit_commands WHERE command_type='producer_creative_edit'").get()!.payload));expect(edit.previousAttempt.status).toBe("accepted");expect(edit.before.action).toBe("Established encounter");
    db.close();db=new DatabaseSync(join(state.dir,"state.sqlite"));state.db=db;
    const reopened=requireCurrentPlan(db,state.dir,projectId);expect(reopened.id).toBe(saved.revision);expect(directionsFromRun(reopened,"shot1")).toContain("actor seated");
    const auto=await plan();expect(auto.status,auto.summary).toBe("approved");expect(auto.productionRecord!.parentRevision).toBe(saved.revision);
    result=await fetch(`${base}/${projectId}/production`);const view=await result.json() as {productionRecord:ProductionRecord};expect(view.productionRecord.revision).toBe(auto.runId);
    expect(readFileSync(join(state.dir,"assets/key.png"),"utf8")).toBe("synthetic accepted pixels");
    const destination=process.env.HEARTWORD_CREW_DEMO_DIR;
    if(destination){
      if(existsSync(destination))throw new Error("Refuse to replace existing workflow evidence.");
      db.close();cpSync(state.dir,destination,{recursive:true});db=new DatabaseSync(join(state.dir,"state.sqlite"));state.db=db;
      writeFileSync(join(destination,"workflow-evidence.json"),JSON.stringify({purpose:"synthetic runtime workflow only; no actual film or paid provider call",initialRevision:first.runId,producerRevision:saved.revision,currentRevision:auto.runId,immutableParentPreserved:true,httpEditReplayCount:1,reopenedSavedState:true,productionRecord:view.productionRecord},null,2));
    }
  });

  it("keeps late blocking evidence visible on a newer immutable producer revision",async()=>{
    await plan();let edited=false;
    state.reply=(prompt:string)=>{const out=reply(prompt);if(!edited){edited=true;producer("Producer's newer staging");out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Late evidence about conflicting actor space",requestedChange:"Reconcile this late finding with the producer revision",confidence:81,limitations:"The reviewer saw the older input."}];}return out;};
    await plan();const current=latestCrewRun(db,projectId,"planning")!;
    expect(current.status).toBe("approved"); // the prior accepted row is immutable
    expect(productionRecordForRun(db,current)!.objections.some(o=>o.status==="open"&&o.evidence.includes("Late evidence"))).toBe(true);
    expect(()=>requireCurrentPlan(db,state.dir,projectId)).toThrow("unresolved blocking");
    state.reply=reply;const next=await runProductionCrew(projectId,"planning",{db,dataDir:state.dir,call:async p=>reply(p)});expect(next.status).toBe("held");expect(next.productionRecord!.objections.some(o=>o.evidence.includes("Late evidence"))).toBe(true);
  });

  it("cannot reapprove a source/canon change as a producer creative edit and rolls back the edit",async()=>{
    const original=await plan();db.exec("UPDATE character_versions SET notes='Changed canon without new approved version' WHERE id='cv'");
    expect(()=>producer("Attempted unrelated creative edit")).toThrow("Source, canon or performance changed");
    expect(db.prepare("SELECT action FROM shots WHERE id='shot1'").get()!.action).toBe("Established encounter");
    expect(latestCrewRun(db,projectId,"planning")!.id).toBe(original.runId);
    expect(db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE command_type='producer_creative_edit'").get()!.n).toBe(0);
  });

  it("preserves an interrupted run's objections and supplies them to the next review",async()=>{
    state.reply=(prompt:string)=>{const out=reply(prompt);if(context(prompt).role==="creative_director")out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Retained interrupted-review concern",requestedChange:"Resolve this before production",confidence:84,limitations:"Synthetic recovery evidence"}];return out;};
    const first=await plan();expect(first.status).toBe("held");
    // Simulate a process stopped after its exchanges were durably recorded.
    db.prepare("UPDATE production_runs SET status='running',worker_pid=987654321 WHERE id=?").run(first.runId);
    const stopped=vi.spyOn(process,"kill").mockImplementation(()=>{throw Object.assign(new Error("No worker"),{code:"ESRCH"});});
    try{recoverInterruptedCrew(db,projectId,first.runId);}finally{stopped.mockRestore();}
    const recovered=productionRecordForRun(db,latestCrewRun(db,projectId,"planning"))!;
    expect(recovered.objections.some(o=>o.status==="open"&&o.evidence.includes("interrupted-review"))).toBe(true);
    state.reply=reply;const next=await plan();expect(next.status).toBe("held");expect(next.productionRecord!.objections.some(o=>o.evidence.includes("interrupted-review"))).toBe(true);
  });

  it("retains malformed replies and rejects an agent impersonating another objection owner",async()=>{
    state.reply=(prompt:string)=>{const {role}=context(prompt),out=reply(prompt);if(role==="creative_director")out.findings=[{shotId:"shot1",severity:"blocking",evidence:"Original owner's fixture concern",requestedChange:"Resolve original concern",confidence:82,limitations:"Synthetic"}];
      if(role==="cinematographer"){const record=context(prompt).record;out.objectionResponses=[{objectionId:record.objections[0]!.id,outcome:"resolved",rationale:"Attempted cross-owner dismissal",evidence:"No authority to resolve another role's finding"}];}return out;};
    const result=await plan();expect(result.status).toBe("incomplete");
    const failed=db.prepare("SELECT output_json FROM production_events WHERE error IS NOT NULL").get()!;
    expect(JSON.parse(String(failed.output_json)).rejectedOutput.objectionResponses[0].rationale).toContain("cross-owner");
    expect(()=>productionAuthorization(db,state.dir,projectId)).toThrow();
  });

  it("does not substitute a paid image API for a production keyframe",async()=>{
    const {GeminiImageProvider}=await import("../../src/providers/gemini/index.js");
    await expect(new GeminiImageProvider().generate({shotId:"shot1",prompt:"16:9 fixture",characters:[],productionRevision:{runId:"fixture",briefHash:"a".repeat(64)}})).rejects.toThrow("built-in image handoff");
  });

  it("holds a new candidate whose revision provenance was not saved",async()=>{
    await plan();
    db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('unbound','shot1','synthetic','fixture','generate_final_video','hold_for_review','returned.mp4',0,?)").run(Date.now());
    expect(()=>acceptFinalVideoCandidate(db,projectId,"unbound",8000)).toThrow("missing its accepted production revision binding");
    expect(db.prepare("SELECT COUNT(*) n FROM clips").get()!.n).toBe(0);
  });

  it("holds absent/stale plans before provider submission and preserves a stale returned candidate",async()=>{
    const wire=vi.fn();const generateFinal=vi.fn(async(request:any)=>{request.authorizeSubmission();wire();return {status:"accepted" as const,media:{path:"returned.mp4"},cost:{usd:0},provenance:{provider:"synthetic",model:"fixture",prompt:request.prompt}};});
    const providers:any={primaryBackend:"kling",veo:{generateFinal},kling:{generateFinal},draft:{generateDraft:vi.fn()}};
    await expect(generateNonSpeakingVideoCandidate(db,projectId,"shot1",providers)).rejects.toThrow("production crew");expect(wire).not.toHaveBeenCalled();
    await plan();const authorization=productionAuthorization(db,state.dir,projectId);const old=authorization.runId;producer();expect(()=>authorization.assertCurrent()).toThrow();expect(()=>validateHandoffPlan(db,state.dir,projectId,old)).toThrow();
    // Mark the retained image eligible for this synthetic provider test; this
    // is a fixture review, not a production-image approval.
    db.exec("UPDATE generation_attempts SET status='accepted' WHERE id='accepted-key'");
    generateFinal.mockImplementationOnce(async(request:any)=>{request.authorizeSubmission();wire();producer("A later producer correction");return {status:"accepted",media:{path:"returned.mp4"},cost:{usd:0},provenance:{provider:"synthetic",model:"fixture",prompt:request.prompt}};});
    const candidate=await generateNonSpeakingVideoCandidate(db,projectId,"shot1",providers);expect(candidate.status).toBe("candidate");expect(wire).toHaveBeenCalledOnce();
    expect(()=>acceptFinalVideoCandidate(db,projectId,(candidate as any).attemptId,8000)).toThrow("earlier production revision");
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id=?").get((candidate as any).attemptId)!.status).toBe("hold_for_review");
  });
});
