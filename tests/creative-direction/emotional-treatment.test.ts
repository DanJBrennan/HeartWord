import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrewBrief, CrewContribution, CrewEvent, CrewRole } from "../../src/pipeline/creative-direction/crew-types.js";
import { emotionalTreatmentSchema, emotionalTriggerRecoveryHint, validateEmotionalTreatment, validateTreatmentHandoff } from "../../src/pipeline/creative-direction/emotional-treatment.js";
import { runCrew } from "../../src/pipeline/creative-direction/crew.js";
import { newProductionRecord } from "../../src/pipeline/creative-direction/production-record.js";
import { directionsFromRun } from "../../src/pipeline/creative-direction/crew-store.js";
import { planEditorialCut } from "../../src/pipeline/assembly/editorial-plan.js";
import { checkAvatarSpend, reconcileAvatarBudget, reserveAvatarSpend } from "../../src/pipeline/voice-lipsync/performance-direction.js";
import { reserveCrewModelSpend, settleCrewModelSpend } from "../../src/pipeline/creative-direction/model-spend.js";
import { fixtureTreatment, withFixtureTreatment } from "../helpers/crew-treatment.js";
import { EDITORIAL_CHECKS } from "../../src/pipeline/qc/editorial-review.js";

const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
function brief(): CrewBrief {
  return {project:{id:"p",language:"hatam",book:"mark",chapter:5},source:{text:[{verse:1,text:"Synthetic original one."},{verse:2,text:"Synthetic original two."}],
    reference:[{verse:1,text:"The test event is anticipated."},{verse:2,text:"The test event is complete."}],hashes:["synthetic-source"]},
    audio:[{id:"a",startMs:0,endMs:2000,verseRef:"Mark 5:1",speakerId:null,path:"source.wav",confidence:95},
      {id:"b",startMs:2000,endMs:4000,verseRef:"Mark 5:2",speakerId:null,path:"source.wav",confidence:95}],
    shots:[1,2].map(n=>({id:`s${n}`,sceneId:"scene",sceneSequence:1,sequence:n,verseRef:`Mark 5:${n}`,action:"Synthetic quiet reaction",framing:"medium",cameraMovement:"static",continuity:"Stable",lighting:"Daylight",needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:{id:`c${n}`,path:`${n}.mp4`,durationMs:3000}})),
    canon:[],producerNotes:[],spentUsd:0,audioAssets:[],render:null};
}
const roleFrom=(p:string)=>p.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_") as CrewRole;
function reply(prompt:string):CrewContribution {
  const role=roleFrom(prompt), b=JSON.parse(prompt.split("CHAPTER BRIEF:\n")[1]!.split("\nTEAM CONTRIBUTIONS")[0]!) as CrewBrief;
  return withFixtureTreatment(prompt,{summary:"Synthetic source-grounded treatment review, not a real film verdict.",directions:b.shots.map(s=>({shotId:s.id,instruction:s.action,scriptureBasis:s.verseRef})),findings:[],
    ...(role==="picture_editor"?{edits:[],pauses:[],coverageRequests:[],editorialChecks:prompt.includes("Phase: finishing")?EDITORIAL_CHECKS.map(name=>({name,status:"clear" as const,startMs:0,endMs:4000,evidence:"Synthetic audiovisual fixture inspected",requestedChange:"None"})):[]}:{}),
    ...(role==="production_director"?{decision:"approve" as const,decisionConfidence:88,decisionLimitations:"Synthetic test only",acceptedContributionIds:[]}:{}),
    ...(role==="colorist"?{colorAdjustments:[]}:{})});
}
function treatment(b=brief()) {
  const t=fixtureTreatment(b);
  t.progression="Anticipation gives way to restrained release, then reflection; no blanket celebratory mood.";
  t.beats[0]!.intensity="Quiet anticipation";t.beats[1]!.intensity="Release into reflection";
  t.pauses=[{beatId:"beat-1",afterSegmentId:"a",durationMs:1000,purpose:"Allow the stated turn to register",timingBasis:"After the complete supplied test interval, not an English phrase estimate",coverageShotIds:["s1"],coverageNeed:"One second of wordless reaction",costImplication:"Reuse reviewed coverage when available; any new take/review counts toward $200 and outstanding charges"}];
  t.cues=[{beatId:"beat-2",kind:"music",purpose:"Restrained release after anticipation",timingBasis:"Enter with the second beat in the spaced cut; no invented word timing",entrance:"Fade in over ambience",release:"Resolve and fade before the next turn",coverageNeed:"Use the planned reaction/context view",costImplication:"No asset requested here; meter generation, rejects and listening review before spending",speechPriority:"Duck beneath all words; fuller only in mapped silence; verify transitions and mobile clarity"}];
  return t;
}
afterEach(()=>vi.unstubAllEnvs());
describe("advance emotional treatment",()=>{
  it("explains unspoken verse markers and altered quotations without inventing source text",()=>{
    const b=brief();b.source.text=b.source.text.filter(row=>row.verse!==2);
    const raw={beats:[
      {sourceTrigger:{verseRef:"Mark 5:1-2",textKind:"source",quote:"Synthetic original one."}},
      {sourceTrigger:{verseRef:"Mark 5:1",textKind:"source",quote:"Changed words"}},
    ]};
    const hint=emotionalTriggerRecoveryHint(raw,b);
    expect(hint).toContain('Beat 1: source text has no row for verse 2');
    expect(hint).toContain('use textKind "reference"');
    expect(hint).toContain('Beat 2: quote differs');
    expect(hint).not.toContain("Synthetic original two");
  });
  it("uses a Gemini-compatible version field while rejecting unsupported returned versions",()=>{
    const version = emotionalTreatmentSchema.properties.version;
    expect(version).toMatchObject({type:"integer"});
    expect(version).not.toHaveProperty("enum");
    const unsupported = {...treatment(),version:2};
    expect(()=>validateEmotionalTreatment(unsupported,brief())).toThrow("version 1");
  });
  it("accepts no requested change only for an evidenced clear treatment review",()=>{
    const output:CrewContribution={summary:"Reviewed",directions:[],findings:[],treatmentReview:{status:"clear",evidence:"Checked the supplied treatment against its exact source triggers",requestedChange:"",confidence:90,limitations:"Planning evidence only; no film was viewed"}};
    const check=()=>validateTreatmentHandoff(output,"fidelity_challenger","planning",brief());
    expect(check).not.toThrow();
    for(const status of ["concern","unverified"] as const){output.treatmentReview!.status=status;expect(check).toThrow("requested change");}
    output.treatmentReview!.status="clear";output.treatmentReview!.evidence="";
    expect(check).toThrow("evidence");
    output.treatmentReview!.evidence="Checked exact supplied text";output.treatmentReview!.limitations="";
    expect(check).toThrow("limitations");
  });
  it("grounds ordered beats in exact supplied text and makes every pause/cue accountable",()=>{
    expect(validateEmotionalTreatment(treatment(),brief()).beats.map(b=>b.intensity)).toEqual(["Quiet anticipation","Release into reflection"]);
    const bad=treatment();bad.beats[0]!.sourceTrigger.quote="An invented miracle";
    expect(()=>validateEmotionalTreatment(bad,brief())).toThrow("quote");
    const missing=treatment();missing.beats.pop();missing.pauses=[];missing.cues=[];
    expect(()=>validateEmotionalTreatment(missing,brief())).toThrow("cover");
    const foreign=treatment();foreign.beats[0]!.sourceTrigger.verseRef="Mark 6:1";
    expect(()=>validateEmotionalTreatment(foreign,brief())).toThrow("different");
    const order=treatment();order.beats.reverse();expect(()=>validateEmotionalTreatment(order,brief())).toThrow("source order");
  });
  it("holds invented timing, unreviewed internal speech pauses, extended mouths and missing cost implications",()=>{
    const b=brief();b.audio[0]!.speechRun={id:"run",verseRef:"Mark 5:1-2",startMs:0,endMs:4000,internalVerseTiming:"unresolved"};
    expect(()=>validateEmotionalTreatment(treatment(),b)).toThrow("safe-boundary");
    b.audio[0]!.safePauseAfter=true;expect(()=>validateEmotionalTreatment(treatment(),b)).not.toThrow();
    b.shots[0]!.needsLipSync=true;expect(()=>validateEmotionalTreatment(treatment(),b)).toThrow("speaking face");
    b.shots[0]!.utterance={startMs:0,endMs:3000};expect(()=>validateEmotionalTreatment(treatment(),b)).toThrow("supplied speaking performance");
    const t=treatment();t.pauses[0]!.costImplication="";expect(()=>validateEmotionalTreatment(t,brief())).toThrow("bounded");
    const cue=treatment();cue.cues[0]!.timingBasis="";expect(()=>validateEmotionalTreatment(cue,brief())).toThrow("bounded");
  });
  it("requires the advance plan and each applicable critic/sound review before acceptance",async()=>{
    const events:CrewEvent[]=[];
    const done=await runCrew({phase:"planning",brief:brief(),log:e=>events.push(e),call:async p=>{
      const out=reply(p);if(roleFrom(p)==="creative_director")out.emotionalTreatment=treatment();return out;
    }});
    expect(done.status,done.summary).toBe("approved");
    for(const role of ["picture_editor","sound_designer","composer","fidelity_challenger","clarity_challenger","feasibility_challenger"]){
      const event=events.find(e=>e.role===role)!;expect(event.prompt).toContain("Anticipation gives way");expect(event.output!.treatmentReview!.status).toBe("clear");
    }
    expect(events.at(-1)!.role).toBe("production_director");
    const missing=await runCrew({phase:"planning",brief:brief(),log:()=>{},call:async p=>{const out=reply(p);delete out.emotionalTreatment;return out;}});
    expect(missing.status).toBe("incomplete");
    const noSound=await runCrew({phase:"planning",brief:brief(),log:()=>{},call:async p=>{const out=reply(p);if(roleFrom(p)==="sound_designer")delete out.treatmentReview;return out;}});
    expect(noSound.status).toBe("incomplete");
  });
  it("rechecks revised treatment with critics and cannot clear an objection with an empty list",async()=>{
    const b=brief(),record=newProductionRecord(b,"r","hash"),events:CrewEvent[]=[];
    const result=await runCrew({phase:"planning",brief:b,productionRecord:record,log:e=>events.push(e),call:async p=>{
      const out=reply(p),role=roleFrom(p),round=Number(p.match(/pass (\d)/)![1]);
      if(role==="clarity_challenger"&&round===1)out.treatmentReview={...out.treatmentReview!,status:"concern",evidence:"The reaction implies a second unsourced event",requestedChange:"Remove the unsourced reaction"};
      if(role==="creative_director"&&round===2)out.emotionalTreatment!.progression="Revised: retain only the supplied event and restrained reflection.";
      if(role==="production_director")out.decision=round===1?"revise":"approve";
      return out;
    }});
    expect(result.status).toBe("held");expect(result.productionRecord!.objections.some(o=>o.owner==="clarity_challenger"&&o.status==="open")).toBe(true);
    expect(events.filter(e=>e.role==="clarity_challenger")).toHaveLength(2);
    expect(events.find(e=>e.role==="clarity_challenger"&&e.round===2)!.prompt).toContain("Revised: retain only");
    expect(result.calls).toBe(30);
    const nextRecord=newProductionRecord(b,"r2","hash",result.productionRecord);
    const resolved=await runCrew({phase:"planning",brief:b,productionRecord:nextRecord,log:()=>{},call:async p=>{
      const out=reply(p);if(roleFrom(p)==="clarity_challenger")out.objectionResponses=nextRecord.objections.filter(o=>o.owner==="clarity_challenger"&&o.status==="open").map(o=>({objectionId:o.id,outcome:"resolved",rationale:"The current revised response retains only the supplied test event",evidence:"Compared the revised treatment with the exact reference trigger; no second event remains"}));return out;
    }});
    expect(resolved.status,resolved.summary).toBe("approved");expect(resolved.productionRecord!.objections.every(o=>o.status==="resolved")).toBe(true);
  });
  it("sends accepted intent to generation, preserving producer override precedence",async()=>{
    const b=brief(),result=await runCrew({phase:"planning",brief:b,productionRecord:newProductionRecord(b,"r","hash"),log:()=>{},call:async p=>{const out=reply(p);if(roleFrom(p)==="creative_director")out.emotionalTreatment=treatment();return out;}});
    const run={id:"r",project_id:"p",phase:"planning" as const,status:result.status,brief_hash:"hash",brief_json:JSON.stringify(b),result_json:JSON.stringify(result),created_at:1};
    expect(directionsFromRun(run,"s1")).toContain("Quiet anticipation");
    result.productionRecord!.producerOverrideShotIds=["s1"];run.result_json=JSON.stringify(result);
    expect(directionsFromRun(run,"s1")).toContain("saved shot edit takes precedence");expect(directionsFromRun(run,"s1")).not.toContain("Quiet anticipation");
  });
  it("uses existing editorial objects to extend presentation without changing one source millisecond",()=>{
    const b=brief();b.acceptedEmotionalTreatment={runId:"plan",briefHash:"hash",treatment:treatment(),producerOverrideShotIds:[]};
    const cut=planEditorialCut(b,{summary:"Apply the reviewed pause",directions:[],findings:[],pauses:[{afterSegmentId:"a",durationMs:1000,reason:treatment().pauses[0]!.purpose}],edits:[{shotId:"s1",sourceStartMs:0,durationMs:3000},{shotId:"s2",sourceStartMs:0,durationMs:2000}]});
    expect(cut.durationMs).toBe(5000);expect(cut.audioMap.map(a=>[a.sourceStartMs,a.sourceEndMs,a.startMs,a.endMs])).toEqual([[0,2000,0,2000],[2000,4000,3000,5000]]);
    b.shots[0]!.clip!.durationMs=2000;expect(()=>planEditorialCut(b,{summary:"Missing pause coverage",directions:[],findings:[],pauses:[{afterSegmentId:"a",durationMs:1000,reason:"Reflect"}],edits:[{shotId:"s1",sourceStartMs:0,durationMs:3000}]})).toThrow("unavailable footage");
  });
  it("requires actual-cut evidence for each planned effect and holds uncertain music/mobile listening",async()=>{
    const b=brief();b.acceptedEmotionalTreatment={runId:"plan",briefHash:"hash",treatment:treatment(),producerOverrideShotIds:[]};b.render={id:"cut",path:"cut.mp4",sha256:"test",durationMs:4000,timeline:[{shotId:"s1",startMs:0,endMs:2000},{shotId:"s2",startMs:2000,endMs:4000}]};
    const options={phase:"finishing" as const,brief:b,media:[{mimeType:"video/mp4",data:"synthetic-review-proxy"}],log:()=>{}};
    expect((await runCrew({...options,call:async p=>reply(p)})).status).toBe("approved");
    const missing=await runCrew({...options,call:async p=>{const out=reply(p);if(roleFrom(p)==="picture_editor")out.emotionalBeatChecks!.pop();return out;}});
    expect(missing.status).toBe("incomplete");expect(missing.summary).toContain("every accepted emotional beat");
    const held=await runCrew({...options,call:async p=>{const out=reply(p);if(roleFrom(p)==="composer")out.treatmentReview={...out.treatmentReview!,status:"unverified",evidence:"Score masks the voice on the proxy; phone clarity remains uncertain",requestedChange:"Reduce the cue and listen again"};return out;}});
    expect(held.status).toBe("held");
    const badEffect=await runCrew({...options,call:async p=>{const out=reply(p);if(roleFrom(p)==="picture_editor")out.emotionalBeatChecks![1]!.status="concern";return out;}});
    expect(badEffect.status).toBe("held");
  });
});

describe("crew cost reservation uses the existing film budget",()=>{
  it("counts rejected/history costs and outstanding Avatar/crew charges before further reviews",()=>{
    const db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
    try{
      db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1); INSERT INTO cost_ledger_entries(id,project_id,amount_usd,created_at) VALUES('history','p',190,1)");
      vi.stubEnv("HEARTWORD_CREW_CALL_UPPER_BOUND_USD","3");
      expect(()=>reserveCrewModelSpend(db,"p","e")).toThrow("reconcile");
      reconcileAvatarBudget(db,{projectId:"p",actor:"Cost reviewer",evidence:"Synthetic ledger plus a $2 bound for unreported work and a $1 outstanding external charge",unreportedUpperBoundUsd:2,outstandingUpperBoundUsd:1,idempotencyKey:"budget"});
      reserveAvatarSpend(db,"p","shot",2); // 195 committed
      const reservation=reserveCrewModelSpend(db,"p","e"); // 198 committed
      expect(()=>reserveCrewModelSpend(db,"p","e2")).toThrow("$200");
      expect(checkAvatarSpend(db,"p",0).committedUsd).toBe(198);
      settleCrewModelSpend(db,"p",reservation,"e",null);expect(checkAvatarSpend(db,"p",0).committedUsd).toBe(198);
      expect(()=>settleCrewModelSpend(db,"p",reservation,"other",1)).toThrow("exact reservation");
    }finally{db.close();}
  });
});
