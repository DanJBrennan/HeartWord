import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import type { CrewBrief, CrewContribution } from "../../src/pipeline/creative-direction/crew-types.js";
import { loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { runProductionCrew, requireCurrentPlan, directionsFromRun } from "../../src/pipeline/creative-direction/crew-store.js";
import { renderEditorialCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { EDITORIAL_CHECKS } from "../../src/pipeline/qc/editorial-review.js";
import { withFixtureTreatment } from "../helpers/crew-treatment.js";

const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
function docx(text:string){const name=Buffer.from("word/document.xml"),b=Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`),l=Buffer.alloc(30),c=Buffer.alloc(46),e=Buffer.alloc(22);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(name.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(b.length,20);c.writeUInt16LE(name.length,28);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,10);e.writeUInt32LE(l.length+name.length+b.length,16);return Buffer.concat([l,name,b,c,name,e]);}
const ffmpeg=(args:string[])=>execFileSync("ffmpeg",["-v","error","-n",...args],{stdio:["ignore","ignore","pipe"]});

it("retains a reviewed advance treatment through generation, a real pause render, reopen and effect review",async()=>{
  const retained=process.env.HEARTWORD_TREATMENT_PROOF_DIR;
  if(retained&&existsSync(retained))throw new Error("Refuse to overwrite existing treatment proof.");
  const root=retained?resolve(retained):mkdtempSync(join(tmpdir(),"hw-treatment-proof-"));mkdirSync(join(root,"db"),{recursive:true});
  const put=(path:string,bytes:Buffer|string)=>{const out=join(root,"assets",path);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,bytes);};
  let db=new DatabaseSync(join(root,"db/heartword.sqlite"));db.exec(readFileSync("src/db/schema.sql","utf8"));
  try{
    put("source/hatam/mark-5/mark-5-text.docx",docx("1Synthetic anticipation. 2Synthetic release."));
    put("reference/english/mark-5/mark-5-text.docx",docx("1Synthetic anticipation. 2Synthetic release."));
    put("canon.png",Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64"));
    ffmpeg(["-f","lavfi","-i","aevalsrc=0.1*sin(2*PI*if(lt(t\\,2)\\,440\\,880)*t):s=48000:d=4","-c:a","pcm_s16le",join(root,"assets/source.wav")]);
    for(const [id,duration] of [["s1",3],["s2",2]] as const)ffmpeg(["-f","lavfi","-i",`testsrc2=s=160x90:r=24:d=${duration}`,"-c:v","libx264","-pix_fmt","yuv420p",join(root,`assets/${id}.mp4`)]);
    db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',5,1,1);
      INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('scene','p',1,'Mark 5:1','Mark 5:2',1);
      INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Synthetic witness','global','approved','Papuan',1,1);
      INSERT INTO character_versions(id,character_id,version_label,status,created_at)VALUES('cv','c','synthetic','approved',1);
      INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('ref','cv','body_pose','canon.png',1);
      INSERT INTO shots(id,scene_id,sequence,verse_ref,action,created_at)VALUES('s1','scene',1,'Mark 5:1','Synthetic anticipation view',1),('s2','scene',2,'Mark 5:2','Synthetic release view',1);
      INSERT INTO shot_characters VALUES('s1','c'),('s2','c');
      INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('a','p','original_reading','source.wav',0,2000,'Mark 5:1',1),('b','p','original_reading','source.wav',2000,4000,'Mark 5:2',1);
      INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('v1','s1','fixture','synthetic','assemble_shot','accepted','s1.mp4',0,1),('v2','s2','fixture','synthetic','assemble_shot','accepted','s2.mp4',0,1);
      INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('c1','s1','v1',0,3000,1),('c2','s2','v2',0,2000,1);`);
    const sourceBefore=readFileSync(join(root,"assets/source.wav"));
    const call=async(prompt:string):Promise<CrewContribution>=>{
      const role=prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_"),phase=prompt.match(/Phase: (\w+);/)![1];
      const b=JSON.parse(prompt.split("CHAPTER BRIEF:\n")[1]!.split("\nTEAM CONTRIBUTIONS")[0]!) as CrewBrief;
      const out=withFixtureTreatment(prompt,{summary:"SYNTHETIC: scripted treatment/cut evidence; no real audience or Hatam review",directions:b.shots.map(s=>({shotId:s.id,instruction:s.action,scriptureBasis:s.verseRef})),findings:[],
        ...(role==="production_director"?{decision:"approve",decisionConfidence:88,decisionLimitations:"Synthetic fixture only",acceptedContributionIds:[]}:{}),
        ...(role==="picture_editor"?{coverageRequests:[],edits:[],pauses:[],editorialChecks:phase==="finishing"?EDITORIAL_CHECKS.map(name=>({name,status:"clear",startMs:0,endMs:5000,evidence:"Scripted check of the synthetic test pattern and source tones",requestedChange:"None in this fixture"})):[]}:{}),
        ...(role==="colorist"?{colorAdjustments:[]}:{})} as CrewContribution);
      if(phase==="planning"&&role==="creative_director"){
        out.emotionalTreatment!.progression="Synthetic anticipation → measured breathing space → release and reflection.";
        out.emotionalTreatment!.beats[0]!.intensity="Anticipation";out.emotionalTreatment!.beats[1]!.intensity="Restrained release";
        out.emotionalTreatment!.pauses=[{beatId:"beat-1",afterSegmentId:"a",durationMs:1000,purpose:"Let the first test beat register",timingBasis:"Complete synthetic source interval at 2000ms; not real Hatam phrase evidence",coverageShotIds:["s1"],coverageNeed:"One extra second of the existing wordless coverage",costImplication:"Reuse accepted synthetic footage; local render; no provider submission. Assistant usage unreported."}];
      }
      if(phase==="editing"&&role==="picture_editor"){
        expect(b.acceptedEmotionalTreatment?.treatment.pauses[0]!.durationMs).toBe(1000);
        out.edits=[{shotId:"s1",sourceStartMs:0,durationMs:3000},{shotId:"s2",sourceStartMs:0,durationMs:2000}];
        out.pauses=[{afterSegmentId:"a",durationMs:1000,reason:b.acceptedEmotionalTreatment!.treatment.pauses[0]!.purpose}];
      }
      if(phase==="finishing"&&role==="picture_editor")out.emotionalBeatChecks!.forEach((c,i)=>{c.startMs=i===0?0:3000;c.endMs=i===0?3000:5000;c.evidence="Scripted synthetic effect verdict; source order and gap measured separately. This does not establish real dramatic quality.";});
      return out;
    };
    const plan=await runProductionCrew("p","planning",{db,dataDir:root,call});expect(plan.status,plan.summary).toBe("approved");
    const saved=db.prepare("SELECT * FROM production_runs WHERE id=?").get(plan.runId);
    expect(directionsFromRun(requireCurrentPlan(db,root,"p"),"s1")).toContain("Anticipation");
    const edit=await runProductionCrew("p","editing",{db,dataDir:root,call});expect(edit.status,edit.summary).toBe("approved");
    const cut=renderEditorialCut(db,root,"p",edit.runId),cutPath=join(root,"assets",cut.path);
    const map=JSON.parse(String(db.prepare("SELECT source_audio_json FROM chapter_render_manifests WHERE render_id=?").get(cut.renderId)!.source_audio_json));
    expect(map.map((m:any)=>[m.sourceStartMs,m.sourceEndMs,m.startMs,m.endMs])).toEqual([[0,2000,0,2000],[2000,4000,3000,5000]]);
    const pcm=execFileSync("ffmpeg",["-v","error","-i",cutPath,"-f","f32le","-ac","1","-ar","8000","pipe:1"],{maxBuffer:1024*1024}),samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4);
    const rms=(from:number,to:number)=>Math.sqrt(samples.slice(from*8000,to*8000).reduce((s,x)=>s+x*x,0)/((to-from)*8000));
    const hz=(from:number,to:number)=>{const part=samples.slice(from*8000,to*8000);let crossings=0;for(let i=1;i<part.length;i++)if(part[i-1]!<0&&part[i]!>=0)crossings++;return crossings/(to-from);};
    expect(rms(2.2,2.8)).toBeLessThan(.001);expect(Math.abs(hz(.2,1.8)-440)).toBeLessThan(1);expect(Math.abs(hz(3.2,4.8)-880)).toBeLessThan(1);
    db.close();db=new DatabaseSync(join(root,"db/heartword.sqlite"));
    const finishing=loadCrewBrief(db,root,"p","finishing");expect(finishing.acceptedEmotionalTreatment!.runId).toBe(plan.runId);expect(db.prepare("SELECT * FROM production_runs WHERE id=?").get(plan.runId)).toEqual(saved);
    const reviewed=await runProductionCrew("p","finishing",{db,dataDir:root,call,media:[{mimeType:"video/mp4",data:readFileSync(cutPath).toString("base64")}]});expect(reviewed.status,reviewed.summary).toBe("approved");
    expect(reviewed.contributions.picture_editor!.emotionalBeatChecks).toHaveLength(2);expect(readFileSync(join(root,"assets/source.wav"))).toEqual(sourceBefore);
    writeFileSync(join(root,"workflow-evidence.json"),JSON.stringify({purpose:"Synthetic source/picture with scripted model replies; actual FFmpeg order/rate/pause proof, not Hatam or dramatic approval",planRunId:plan.runId,editingRunId:edit.runId,finishingRunId:reviewed.runId,cut,sourceMap:map,gapRms:rms(2.2,2.8),measuredHz:[hz(.2,1.8),hz(3.2,4.8)],reopenedSameTreatment:true,immutablePlanningRun:true,providerSubmissions:0,assistantUsageCost:"unreported"},null,2));
  }finally{db.close();if(!retained)rmSync(root,{recursive:true,force:true});}
},30000);
