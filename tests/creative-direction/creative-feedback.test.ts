import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { runCrew } from "../../src/pipeline/creative-direction/crew.js";
import { runProductionCrew, productionRecordForRun, latestCrewRun } from "../../src/pipeline/creative-direction/crew-store.js";
import { newProductionRecord } from "../../src/pipeline/creative-direction/production-record.js";
import { acceptedCoverageMedia } from "../../src/pipeline/creative-direction/visual-reference-media.js";
import { craftScore, craftImproved, validateCraftAssessment, type CraftAssessment, type CreativeFeedback } from "../../src/pipeline/creative-direction/creative-feedback.js";
import type { CrewBrief, CrewContribution, CrewEvent, CrewRole } from "../../src/pipeline/creative-direction/crew-types.js";
import { fixtureCraftAssessment, withFixtureTreatment } from "../helpers/crew-treatment.js";
import { CreativeFeedback as FeedbackPanel } from "../../src/web/CreativeFeedback.js";
import { EDITORIAL_CHECKS } from "../../src/pipeline/qc/editorial-review.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
function brief(): CrewBrief {
  return {project:{id:"p",language:"hatam",book:"mark",chapter:5},source:{text:[{verse:1,text:"Supplied words"}],reference:[{verse:1,text:"Supplied event"}],hashes:["immutable-source"]},
    audio:[{id:"a",path:"source.mp3",startMs:0,endMs:1000,verseRef:"Mark 5:1",speakerId:null,confidence:95}],
    canon:[{id:"c",name:"Approved person",versionId:"v",region:"Papuan",notes:"Locked wardrobe",joinedAt:null}],
    shots:[{id:"s",sceneId:"scene",sceneSequence:1,sequence:1,verseRef:"Mark 5:1",action:"Supplied event",framing:"wide",cameraMovement:"static",continuity:null,lighting:null,needsLipSync:false,characterIds:["c"],dialogueCharacterId:null,beats:[],clip:{id:"clip",path:"clip.mp4",durationMs:1000}}],
    producerNotes:[],spentUsd:5,audioAssets:[],render:null};
}
function response(prompt: string): CrewContribution {
  const role = prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_") as CrewRole;
  return withFixtureTreatment(prompt,{summary:`${role} fixture`,directions:[{shotId:"s",instruction:prompt.includes("pass 2/2")?"Revised instruction":"Original instruction",scriptureBasis:"Mark 5:1"}],findings:[],
    filmChanges:[],ownerResponses:[],objectionResponses:[],withdrawals:[],
    ...(role==="production_director"?{decision:"approve" as const,decisionConfidence:80,decisionLimitations:"Fixture only.",acceptedContributionIds:[]}:{}),
    ...(role==="picture_editor"?{coverageRequests:[],edits:prompt.includes("Phase: editing")?[{shotId:"s",sourceStartMs:0,durationMs:1000}]:[],pauses:[],editorialChecks:[]}:{}),
    ...(role==="colorist"?{colorAdjustments:[]}:{}),
    ...(["sound_designer","composer"].includes(role)?{audioCues:[],generationRequests:[]}:{})});
}
const roleOf = (p:string) => p.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_");
function assess(score=2): CraftAssessment {
  return {...fixtureCraftAssessment(score),recommendation:"revise",concerns:[{owner:"creative_director",shotId:"s",evidence:"The supplied event's transition is abrupt in the treatment.",requestedChange:"Give the transition a source-grounded visual purpose."}]};
}
async function review(options:{secondScore?:number;missingResponse?:boolean;secondHardFailure?:boolean;maxCalls?:number;missingAssessment?:boolean;runId?:string;unlinkedChange?:boolean}={}) {
  const b=brief(),events:CrewEvent[]=[];
  const result=await runCrew({phase:"planning",brief:b,creativeFeedback:true,maxCalls:options.maxCalls,productionRecord:newProductionRecord(b,options.runId??"run","hash"),log:e=>events.push(e),call:async prompt=>{
    const out=response(prompt),second=prompt.includes("pass 2/2"),role=roleOf(prompt);
    if(role==="picture_editor")out.craftAssessment=options.missingAssessment?undefined:assess(second?options.secondScore??2:2);
    if(second&&role==="creative_director"&&options.missingResponse)out.creativeResponses=[];
    if(second&&role==="cinematographer"&&options.unlinkedChange)out.creativeResponses=[];
    if(second&&role==="production_director"&&options.secondHardFailure)out.acceptanceChecks={status:"hold",evidence:"Source protection remains unresolved."};
    return out;
  }});
  return {result,events};
}

describe("bounded evidence-based craft feedback",()=>{
  it("retains the earlier acceptable plan at a plateau, with all later replies and routing visible",async()=>{
    const {result,events}=await review();
    expect(result.status,result.summary).toBe("approved");expect(result.calls).toBe(30);
    expect(result.creativeFeedback).toMatchObject({selectedRound:1,policy:"continue_best_acceptable",passes:[{hardChecks:"passed",score:50},{hardChecks:"passed",score:50}]});
    expect(result.creativeFeedback!.stopReason).toContain("Plateau");
    expect(result.contributions.production_director!.directions[0]!.instruction).toBe("Original instruction");
    expect(result.productionRecord!.history.some(h=>h.id==="run:creative_director:2")).toBe(true);
    expect(events.filter(e=>e.round===2).every(e=>e.prompt.includes("Give the transition a source-grounded visual purpose."))).toBe(true);
    const owned=result.creativeFeedback!.passes[1]!.responses.find(r=>r.owner==="creative_director")!;
    expect(owned.findingId).toBe(result.creativeFeedback!.passes[0]!.concerns[0]!.id);
    expect(result.summary).toContain("shortfall");
  });
  it("selects an evidenced improvement without granting a reviewer repair tools",async()=>{
    const {result,events}=await review({secondScore:3});
    expect(result.creativeFeedback!.selectedRound).toBe(2);
    expect(result.contributions.production_director!.directions[0]!.instruction).toBe("Revised instruction");
    expect(events[0]!.prompt).toContain("Reviewers never dispatch a paid repair");
    expect(result.creativeFeedback!.stopReason).toContain("Revision limit");
  });
  it("does not average a regression away or let confidence determine selection",()=>{
    const before=fixtureCraftAssessment(3),after=fixtureCraftAssessment(4);
    after.dimensions[0]!.score=2;after.dimensions.forEach(d=>d.confidence=100);
    before.dimensions.forEach(d=>d.confidence=1);
    expect(craftScore(after)).toBeGreaterThan(craftScore(before)!);
    expect(craftImproved(before,after)).toBe(false);
  });
  it("holds hard-check failures even with strong creative scores and an earlier acceptable plan",async()=>{
    const {result}=await review({secondScore:4,secondHardFailure:true});
    expect(result.status).toBe("held");expect(result.creativeFeedback!.passes[1]!.hardChecks).toBe("failed");
    expect(result.productionRecord!.status).toBe("held");
  });
  it("requires an owner to answer its exact retained finding before any revision can pass",async()=>{
    const {result,events}=await review({missingResponse:true});
    expect(result.status).toBe("incomplete");expect(result.calls).toBe(16);
    expect(events.at(-1)!.error).toContain("accountable owner's evidence");
    expect(result.creativeFeedback!.stopReason).toContain("review did not complete");
  });
  it("rejects unrelated creative changes without a retained evidence link",async()=>{
    const {result}=await review({unlinkedChange:true});expect(result.status).toBe("incomplete");
    expect(result.summary).toContain("substantive creative revision must cite retained feedback");
  });
  it("uses run-scoped finding identities even when the review scope is identical",async()=>{
    const a=await review({runId:"run-a"}),b=await review({runId:"run-b"});
    expect(a.result.creativeFeedback!.scope).toBe(b.result.creativeFeedback!.scope);
    expect(a.result.creativeFeedback!.passes[0]!.concerns[0]!.id).not.toBe(b.result.creativeFeedback!.passes[0]!.concerns[0]!.id);
  });
  it("funds exactly one complete finishing revision and retains the actual-cut evidence boundary",async()=>{
    const b=brief();b.render={id:"cut",path:"cut.mp4",sha256:"fixture-only",durationMs:1000,timeline:[{shotId:"s",startMs:0,endMs:1000}],audioMap:[{segmentId:"a",sourceStartMs:0,sourceEndMs:1000,startMs:0,endMs:1000}]};
    const calls=vi.fn(async(prompt:string)=>{
      const out=response(prompt);
      if(roleOf(prompt)==="picture_editor"){
        out.craftAssessment={...assess(prompt.includes("pass 2/2")?3:2),concerns:[{...assess().concerns[0]!,owner:"sound_designer"}]};
        out.editorialChecks=EDITORIAL_CHECKS.map(name=>({name,status:"clear",startMs:0,endMs:1000,evidence:"Scripted whole-cut fixture evidence",requestedChange:"None"}));
      }
      return out;
    });
    const result=await runCrew({phase:"finishing",brief:b,creativeFeedback:true,media:[{mimeType:"video/mp4",data:"synthetic-audiovisual-fixture"}],log:()=>{},call:calls});
    expect(result.status,result.summary).toBe("approved");expect(result.calls).toBe(17);expect(result.creativeFeedback!.maxCalls).toBe(17);expect(result.creativeFeedback!.selectedRound).toBe(2);
    expect(calls).toHaveBeenCalledTimes(17);
  });
  it("does not spend calls on a partial revision when the remaining limit cannot fund review",async()=>{
    const {result,events}=await review({maxCalls:29});
    expect(result.status,result.summary).toBe("approved");expect(result.calls).toBe(15);expect(events).toHaveLength(15);
    expect(result.creativeFeedback!.selectedRound).toBe(1);expect(result.summary).toContain("Call limit");
  });
  it("treats missing assessment as incomplete evidence, never a historical passing score",async()=>{
    const {result}=await review({missingAssessment:true});
    expect(result.status).toBe("incomplete");expect(result.summary).toContain("craft rubric");
  });
  it("does not take an extra pass when the initial applicable review is satisfactory",async()=>{
    const result=await runCrew({phase:"planning",brief:brief(),creativeFeedback:true,log:()=>{},call:async p=>response(p)});
    expect(result.status,result.summary).toBe("approved");expect(result.calls).toBe(15);expect(result.creativeFeedback!.selectedRound).toBe(1);
  });
  it("keeps missing observations unscored and rejects foreign scope, invalid rubric and confidence",()=>{
    const a=fixtureCraftAssessment();a.dimensions[0]!.score=null;
    expect(craftScore(a)).toBeNull();expect(craftImproved(a,fixtureCraftAssessment(4))).toBe(false);
    for(const modify of [(x:CraftAssessment)=>{x.dimensions[0]!.confidence=101;},(x:CraftAssessment)=>{x.dimensions[0]!.shotIds=["foreign"];},(x:CraftAssessment)=>{x.dimensions.pop();},(x:CraftAssessment)=>{x.concerns=[{...assess().concerns[0]!,owner:"critics" as never}];}]) {
      const bad=fixtureCraftAssessment();modify(bad);expect(()=>validateCraftAssessment(bad,brief(),"planning")).toThrow();
    }
  });
  it("preserves existing source-boundary checks when creative acceptance says clear",async()=>{
    const result=await runCrew({phase:"editing",brief:brief(),creativeFeedback:true,log:()=>{},call:async p=>{
      const out=response(p);if(roleOf(p)==="picture_editor")out.edits=[{shotId:"s",sourceStartMs:0,durationMs:500}];return out;
    }});
    expect(result.status).toBe("held");expect(result.creativeFeedback!.stopReason).toBe(result.summary);
  });
  it("keeps proposal and source times out of first-cut craft evidence while retaining executable edit timings",async()=>{
    const rejected:CrewEvent[]=[];
    const invalid=await runCrew({phase:"editing",brief:brief(),creativeFeedback:true,log:e=>rejected.push(e),call:async p=>{
      const out=response(p);
      if(roleOf(p)==="picture_editor")out.craftAssessment!.dimensions.forEach(d=>{d.startMs=0;d.endMs=1000;});
      return out;
    }});
    expect(invalid.status).toBe("incomplete");expect(invalid.summary).toContain("actual cut's bounds");
    expect(rejected.at(-1)!.rejectedOutput).toMatchObject({craftAssessment:{dimensions:expect.arrayContaining([expect.objectContaining({startMs:0,endMs:1000})])}});
    const result=await runCrew({phase:"editing",brief:brief(),creativeFeedback:true,log:()=>{},call:async p=>{
      if(roleOf(p)==="picture_editor")expect(p).toContain("Every craftAssessment dimension must use startMs=null and endMs=null in planning and editing");
      return response(p);
    }});
    expect(result.status,result.summary).toBe("approved");
    expect(result.contributions.picture_editor!.edits).toEqual([{shotId:"s",sourceStartMs:0,durationMs:1000}]);
    expect(result.contributions.picture_editor!.craftAssessment!.dimensions.every(d=>d.startMs===null&&d.endMs===null)).toBe(true);
  });
  it("saves and reopens the same assessments/selection through the existing production records",async()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-craft-")),db=new DatabaseSync(join(root,"proof.sqlite"));
    try {
      db.exec(readFileSync("src/db/schema.sql","utf8"));db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1)");
      const b=brief(),unchanged=structuredClone(b);
      const result=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,call:async p=>{
        const out=response(p);if(roleOf(p)==="picture_editor")out.craftAssessment=assess();return out;
      }});
      const saved=latestCrewRun(db,"p","planning")!,reopened=JSON.parse(saved.result_json!);
      expect(reopened.creativeFeedback).toEqual(result.creativeFeedback);
      const reopenedDb=new DatabaseSync(join(root,"proof.sqlite"),{readOnly:true});
      try {expect(JSON.parse(latestCrewRun(reopenedDb,"p","planning")!.result_json!).creativeFeedback).toEqual(result.creativeFeedback);} finally {reopenedDb.close();}
      expect(productionRecordForRun(db,saved)!.status).toBe("accepted");
      expect(db.prepare("SELECT COUNT(*) n FROM production_events WHERE run_id=?").get(result.runId)).toMatchObject({n:30});
      expect(db.prepare("SELECT COUNT(*) n FROM generation_attempts").get()).toMatchObject({n:0});
      expect(db.prepare("SELECT COUNT(*) n FROM cost_ledger_entries").get()).toMatchObject({n:0});
      expect(b).toEqual(unchanged);
      const html=renderToStaticMarkup(createElement(FeedbackPanel,{feedback:reopened.creativeFeedback as CreativeFeedback}));
      expect(html).toContain("Plateau");expect(html).toContain("selected");expect(html).toContain("acceptance checks passed");expect(html).toContain("uncalibrated");expect(html).toContain("Requested change");
      // Optional review artifact from this same exercised saved result. It is
      // clearly synthetic and never appears as production/quality calibration.
      if(process.env.HEARTWORD_CREATIVE_PROOF_OUTPUT) {
        const output=process.env.HEARTWORD_CREATIVE_PROOF_OUTPUT;mkdirSync(output,{recursive:true});
        writeFileSync(join(output,"workflow.json"),JSON.stringify({synthetic:true,productionDataConnected:false,providerCalls:0,reopenedFromDisk:true,result:reopened},null,2));
        writeFileSync(join(output,"index.html"),`<!doctype html><html><head><meta charset="utf-8"><title>HeartWord creative feedback proof</title><style>body{font:15px system-ui;background:#142027;color:#edf3f2;margin:0;padding:24px}main{max-width:1250px;margin:auto}header{color:#a6d9cd;border-bottom:1px solid #54776f;padding-bottom:16px}details{margin-top:20px}summary{font-size:20px;cursor:pointer}section{padding:16px 0;border-bottom:1px solid #54776f}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #54776f;padding:10px;text-align:left;vertical-align:top}small{overflow-wrap:anywhere;color:#b6c9c3}</style></head><body><main><header><h1>HeartWord · Creative feedback</h1><p>SYNTHETIC SAVED-STATE WALKTHROUGH · no production connection, provider calls, Scripture/canon approval or audience calibration.</p></header>${html.replace('<details class="creative-feedback">','<details class="creative-feedback" open>')}</main></body></html>`);
      }
    } finally {db.close();rmSync(root,{recursive:true,force:true});}
  });
  it("continues a saved malformed picture-editor reply without repeating paid earlier roles",async()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-craft-resume-")),db=new DatabaseSync(join(root,"proof.sqlite"));
    try {
      db.exec(readFileSync("src/db/schema.sql","utf8"));
      db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1)");
      const b=brief(),firstCalls:string[]=[];
      const first=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,call:async p=>{
        const role=roleOf(p);firstCalls.push(role);
        const out=response(p);
        if(role==="picture_editor")out.craftAssessment!.dimensions[0]!.score=3.5;
        return out;
      }});
      expect(first.status).toBe("incomplete");expect(first.calls).toBe(11);
      expect(firstCalls.at(-1)).toBe("picture_editor");
      const before=db.prepare("SELECT id,output_json FROM production_events WHERE run_id=? ORDER BY sequence")
        .all(first.runId) as Array<{id:string;output_json:string}>;
      expect(before).toHaveLength(11);
      expect(JSON.parse(before.at(-1)!.output_json).rejectedOutput.craftAssessment.dimensions[0].score).toBe(3.5);
      b.spentUsd=6; // Metered review cost changes, while the creative brief hash stays fixed.
      const resumedCalls:string[]=[];
      const resumed=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,resumeRunId:first.runId,call:async p=>{
        resumedCalls.push(roleOf(p));
        if(resumedCalls.length===1)expect(p).toContain("PRIOR REJECTED REPLY: Invalid craft dimension or evidence.");
        return response(p);
      }});
      expect(resumed.status,resumed.summary).toBe("approved");
      expect(resumed.runId).toBe(first.runId);
      expect(resumed.calls).toBe(16);
      expect(resumedCalls).toHaveLength(5);
      expect(resumedCalls[0]).toBe("picture_editor");
      expect(resumedCalls).not.toContain("creative_director");
      const after=db.prepare("SELECT id,output_json FROM production_events WHERE run_id=? ORDER BY sequence")
        .all(first.runId) as Array<{id:string;output_json:string}>;
      expect(after.slice(0,11)).toEqual(before);
      expect(new Set(after.map(event=>event.id)).size).toBe(16);
      expect(after[11]!.id).toContain(":picture_editor:1:retry12");
      expect(productionRecordForRun(db,latestCrewRun(db,"p","planning"))!.status).toBe("accepted");
      await expect(runProductionCrew("p","planning",{db,dataDir:root,brief:b,resumeRunId:first.runId,call:async()=>{throw Error("must not call");}}))
        .rejects.toThrow("latest incomplete run");
    } finally {db.close();rmSync(root,{recursive:true,force:true});}
  });
  it("retries only a malformed finishing Director reply against the same saved cut",async()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-finishing-resume-")),db=new DatabaseSync(join(root,"proof.sqlite"));
    try {
      db.exec(readFileSync("src/db/schema.sql","utf8"));
      db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1)");
      const b=brief();
      b.render={id:"cut",path:"cut.mp4",sha256:"fixture-only",durationMs:1000,
        timeline:[{shotId:"s",startMs:0,endMs:1000}],
        audioMap:[{segmentId:"a",sourceStartMs:0,sourceEndMs:1000,startMs:0,endMs:1000}]};
      const contribution=(prompt:string)=>{
        const out=response(prompt),role=roleOf(prompt);
        if(role==="picture_editor"){
          out.craftAssessment={...assess(4),recommendation:"satisfactory",concerns:[]};
          out.editorialChecks=EDITORIAL_CHECKS.map(name=>({name,status:"clear" as const,startMs:0,endMs:1000,
            evidence:"Fixture cut checked",requestedChange:"None"}));
        }
        if(role==="production_director")out.acceptanceChecks={status:"clear",evidence:"Fixture cut passed"};
        return out;
      };
      const first=await runProductionCrew("p","finishing",{db,dataDir:root,brief:b,existingSoundtrackOnly:true,
        media:[{mimeType:"video/mp4",data:"same-fixture"}],call:async prompt=>{
          const out=contribution(prompt);
          if(roleOf(prompt)==="production_director")out.directions[0]!.shotId="foreign-shot";
          return out;
        }});
      expect(first.status).toBe("incomplete");expect(first.calls).toBe(10);
      expect(first.summary).toContain("Unknown or foreign shot ID");
      const before=db.prepare("SELECT id,output_json FROM production_events WHERE run_id=? ORDER BY sequence")
        .all(first.runId) as Array<{id:string;output_json:string}>;
      const resumedCalls:string[]=[];
      const resumed=await runProductionCrew("p","finishing",{db,dataDir:root,brief:b,existingSoundtrackOnly:true,
        resumeRunId:first.runId,media:[{mimeType:"video/mp4",data:"same-fixture"}],call:async prompt=>{
          resumedCalls.push(roleOf(prompt));return contribution(prompt);
        }});
      expect(resumed.status,resumed.summary).toBe("approved");expect(resumed.calls).toBe(11);
      expect(resumedCalls).toEqual(["production_director"]);
      const after=db.prepare("SELECT id,output_json FROM production_events WHERE run_id=? ORDER BY sequence")
        .all(first.runId) as Array<{id:string;output_json:string}>;
      expect(after.slice(0,10)).toEqual(before);
      expect(after).toHaveLength(11);
    } finally {db.close();rmSync(root,{recursive:true,force:true});}
  });
  it("identifies an invalid saved pause segment when retrying the same crew run",async()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-pause-resume-")),db=new DatabaseSync(join(root,"proof.sqlite"));
    try {
      db.exec(readFileSync("src/db/schema.sql","utf8"));
      db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1)");
      const b=brief();
      const first=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,call:async p=>{
        const out=response(p);
        if(roleOf(p)==="creative_director")out.emotionalTreatment!.pauses.push({beatId:"beat-1",afterSegmentId:"missing-source",
          durationMs:500,purpose:"Synthetic reflection",timingBasis:"Synthetic",coverageShotIds:["s"],
          coverageNeed:"Synthetic wordless picture",costImplication:"No provider call"});
        return out;
      }});
      expect(first.status).toBe("incomplete");expect(first.calls).toBe(1);
      const resumed=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,resumeRunId:first.runId,call:async p=>{
        if(roleOf(p)==="creative_director")expect(p).toContain("missing-source");
        return response(p);
      }});
      expect(resumed.status,resumed.summary).toBe("approved");expect(resumed.calls).toBe(16);
      expect(db.prepare("SELECT COUNT(*) n FROM production_events WHERE run_id=?").get(first.runId)).toMatchObject({n:16});
    }finally{db.close();rmSync(root,{recursive:true,force:true});}
  });
  it("identifies a foreign objection response without accepting it",async()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-objection-resume-")),db=new DatabaseSync(join(root,"proof.sqlite"));
    try{
      db.exec(readFileSync("src/db/schema.sql","utf8"));
      db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1)");
      const b=brief();
      const first=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,call:async p=>{
        const out=response(p);
        if(roleOf(p)==="creative_director")out.objectionResponses=[{objectionId:"foreign-objection",outcome:"resolved",
          rationale:"Synthetic invalid response",evidence:"Not this role's finding"}];
        return out;
      }});
      expect(first.status).toBe("incomplete");expect(first.summary).toContain("Only the original objector");
      const resumed=await runProductionCrew("p","planning",{db,dataDir:root,brief:b,resumeRunId:first.runId,call:async p=>{
        if(roleOf(p)==="creative_director")expect(p).toContain("foreign-objection (owner unknown)");
        return response(p);
      }});
      expect(resumed.status,resumed.summary).toBe("approved");
      expect(resumed.productionRecord!.objections).toEqual([]);
    }finally{db.close();rmSync(root,{recursive:true,force:true});}
  });
  it("attaches only bounded selected media evidence and labels partial coverage",()=>{
    const root=mkdtempSync(join(tmpdir(),"hw-craft-media-"));
    try {mkdirSync(join(root,"assets"));writeFileSync(join(root,"assets","clip.mp4"),"synthetic video bytes");
      const b=brief();b.shots=Array.from({length:5},(_,i)=>({...b.shots[0]!,id:`s${i}`}));
      const media=acceptedCoverageMedia(root,b);expect(media).toHaveLength(3);expect(media.every(m=>m.caption!.includes("omitted footage is unobserved"))).toBe(true);
      expect(media[0]!.caption).toMatch(/SHA256 [a-f0-9]{64}/);
    } finally {rmSync(root,{recursive:true,force:true});}
  });
});
