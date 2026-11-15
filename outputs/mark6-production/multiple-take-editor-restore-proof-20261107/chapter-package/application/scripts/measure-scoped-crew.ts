import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import {dispatchCrewTask} from "../src/pipeline/creative-direction/crew-tasks.js";
import {crewPacket,encodeCrewPacket} from "../src/pipeline/creative-direction/crew-packet.js";
import {crewSchema} from "../src/pipeline/creative-direction/crew.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite");
const db=new DatabaseSync("C:/Users/danbr/HeartWordData/db/heartword.sqlite",{readOnly:true});
const rows=db.prepare(`SELECT e.id,e.role,e.prompt,r.phase FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id IN(SELECT id FROM projects WHERE chapter=5 AND lower(book)='mark' AND lower(language)='hatam') AND e.prompt LIKE '%SAVED PRODUCTION RECORD:%' AND r.phase='planning' AND e.role IN('cinematographer','choreographer','staging_designer','production_designer','costume_designer','lighting_designer') ORDER BY length(e.prompt) DESC LIMIT 6`).all();
const results=[];
for(const row of rows){
 const p=String(row.prompt),brief=JSON.parse(p.split("CHAPTER BRIEF:\n")[1]!.split("\nTEAM CONTRIBUTIONS")[0]!),contributions=JSON.parse(p.split("TEAM CONTRIBUTIONS AND PREVIOUS DECISION:\n")[1]!.split("\nSAVED PRODUCTION RECORD:")[0]!),record=JSON.parse(p.split("SAVED PRODUCTION RECORD:\n")[1]!.split("\nUse filmChanges")[0]!);
 const before=p.indexOf("CHAPTER BRIEF:\n"),tail=p.indexOf("\nUse filmChanges");
 const prompt=p.slice(0,before)+"BOUNDED CONTEXT:\n"+encodeCrewPacket(crewPacket(brief,contributions,record))+p.slice(tail);
 const sizes:number[]=[],ids:string[]=[];let error:string|null=null;
 try{await dispatchCrewTask({prompt,schema:crewSchema(row.role,"planning"),media:[],role:row.role,phase:"planning",brief,contributions,record,specialistBytes:200000,chapterBytes:450000,onRequest:p=>sizes.push(Buffer.byteLength(p)),validate:r=>r as any,
 call:async p=>{const checklist=JSON.parse(p.match(/one per TASK shotId: (\[[^\n]+\])/)! [1]!);ids.push(...checklist);return{summary:"Size-measurement fixture, not actual creative inference",directions:checklist.map((id:string)=>({shotId:id,instruction:"fixture",scriptureBasis:"fixture"})),findings:[]};}});}catch(e){error=(e as Error).message;}
 results.push({event:row.id,role:row.role,originalBytes:Buffer.byteLength(p),shots:brief.shots.length,physicalTasks:sizes.length,minPromptBytes:Math.min(...sizes),maxPromptBytes:Math.max(...sizes),sumPromptBytes:sizes.reduce((a,b)=>a+b,0),uniqueShotsCovered:new Set(ids).size,error});
}
db.close();writeFileSync("outputs/mark6-preparation/crew-scoped-measurement-r6.json",JSON.stringify({readOnly:true,modelInference:false,results},null,2),{flag:"wx"});console.log(JSON.stringify(results));
