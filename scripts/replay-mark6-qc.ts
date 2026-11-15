/** Bounded forensic replay. Reads a frozen audit DB and retained media only.
 * No getDb(), app boot, migration, selection, model call or render is used. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync,writeFileSync } from "node:fs";
import { resolve,join } from "node:path";
import { attemptAcceptanceTarget,cutAcceptanceTarget,assertAcceptanceEvidence,mediaHash } from "../src/pipeline/qc/acceptance-evidence.js";
import { sourceTurnBoundaries,continuousAudioGroups } from "../src/pipeline/assembly/continuous-audio.js";
import { auditRenderedFlashes } from "../src/pipeline/qc/flash-detection.js";
import type { CrewBrief } from "../src/pipeline/creative-direction/crew-types.js";
const [auditArg,dataArg,briefArg,reportArg]=process.argv.slice(2);
if(!auditArg||!dataArg||!briefArg||!reportArg)throw Error("Usage: replay-mark6-qc AUDIT_DIR DATA_DIR FROZEN_BRIEF REPORT_JSON");
const audit=resolve(auditArg),data=resolve(dataArg),reportPath=resolve(reportArg);
if(reportPath.toLowerCase().startsWith(data.toLowerCase()))throw Error("Report must be outside production data.");
const read=(p:string)=>JSON.parse(readFileSync(p,"utf8").replace(/^\uFEFF/,""));
const db=new DatabaseSync(join(audit,"production-snapshot.sqlite"),{readOnly:true});
const inventory=read(join(audit,"frozen-inventory.json")),film=inventory.film;
const before=mediaHash(film),report:Record<string,unknown>={basis:"Existing frozen media; no production mutations or regeneration",snapshotSha256:mediaHash(join(audit,"production-snapshot.sqlite")),filmSha256:before,cases:[]};
if(before!==inventory.filmSha256||report.snapshotSha256!==inventory.snapshotSha256)throw Error("Frozen audit evidence differs.");
const cases:any[]=report.cases as any[];
try{
 const brief=read(briefArg) as CrewBrief,projectId=brief.project.id;
 for(const [id,label] of [['4e253639-91d7-4348-8661-60262629a598','F1 Mark6:4 articulation'],['ab5cfc6e-f4ca-4c1f-ade0-0958d8eead9b','F2 Mark6:50 activity/rest'],['64bcbfd5-d0ec-47c0-a1f2-63469e15181c','F4 missing planned platter handoff']]){
  const row=db.prepare('SELECT result_asset_path,shot_id FROM generation_attempts WHERE id=?').get(id!)!;
  const path=join(data,'assets',String(row.result_asset_path)),sha256=mediaHash(path);
  const binding=db.prepare('SELECT source_end_ms-source_start_ms duration FROM shot_utterance_bindings WHERE shot_id=?').get(String(row.shot_id));
  const target=attemptAcceptanceTarget(db,data,projectId,id!,Number(binding?.duration??16734));
  let hold='';try{assertAcceptanceEvidence(db,data,projectId,target);}catch(e){hold=String(e);}
  if(!hold)throw Error('Retained known failure unexpectedly admitted: '+label);
  cases.push({id:label,disposition:'HELD',sha256,path,hold,required:target.requirements});
 }
 const target=cutAcceptanceTarget(db,data,projectId,'retained-mark6-final',film,brief,brief.render!.timeline,817180,brief.render!.audioMap);
 const boundaries=target.requirements.filter(r=>r.id.startsWith('boundary:'));
 const uncertain=[485600,568600,576600].map(atMs=>{const requirement=boundaries.find(r=>r.atMs===atMs);if(!requirement)throw Error('Missing actual source transition '+atMs);return {atMs,requirement,disposition:'HELD',reason:'Exact Hatam word ownership unverified; native reviewer unavailable. Sample-perfect transport is insufficient.'};});
 const placements=brief.render!.audioMap!.map(p=>({...p,speakerId:p.speakerId??null,voice:p.voice??"original",path:brief.retainedPerformanceMaster!.path,sourceStartMs:p.performance?.sourceStartMs??p.sourceStartMs,sourceEndMs:p.performance?.sourceEndMs??p.sourceEndMs}));
 report.source={placements:placements.length,transportGroups:continuousAudioGroups(placements,true).length,independentBoundaries:sourceTurnBoundaries(brief.audio).length,uncertain};
 report.finalObligations={count:target.requirements.length,treatment:target.requirements.filter(r=>r.id.startsWith('treatment:')).length,missingHandoff:target.requirements.find(r=>r.id==='action:a65fe216-29e4-4b71-821a-fd0cb74134cf'),identity:target.requirements.filter(r=>r.id.startsWith('identity:')).length};
 let finalHold='';try{assertAcceptanceEvidence(db,data,projectId,target);}catch(e){finalHold=String(e);}if(!finalHold)throw Error('Final unexpectedly admitted');report.finalDisposition={status:'HELD',reason:finalHold};
 report.mark5Golden=read(join(audit,'mark5-golden-delivery-hashes.json')).currentFiles.map((f:any)=>{const current=mediaHash(f.path);if(current!==f.sha256)throw Error('Approved Mark5 delivery changed');return {...f,unchanged:true};});
 console.log('Retained failures held; source boundaries retained; Mark5 golden bytes unchanged. Checking actual final encoded frames.');
 const flashes=auditRenderedFlashes(film);report.flashes=flashes;
 if(!flashes.some(f=>f.continuity==='discontinuous'&&Math.abs(f.startMs-389833.333)<50))throw Error('Expected retained flash no longer reproduced');
 report.flashPositiveControls=flashes.filter(f=>f.continuity!=='discontinuous');
 if(mediaHash(film)!==before)throw Error('Film changed during read-only replay');
 report.completedUtc=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('Read-only replay passed: '+reportPath);
}finally{db.close();}
