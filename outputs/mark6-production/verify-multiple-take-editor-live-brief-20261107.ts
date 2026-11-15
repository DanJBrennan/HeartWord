import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const root='outputs/mark6-production',db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856',hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const planning=loadCrewBrief(db,data,project,'planning'),before=crewBriefHash(planning,'planning');
 if(before!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||planning.shots.some(s=>s.availableClips!==undefined))throw Error('Planning authority changed or alternative media entered planning');
 const editing=loadCrewBrief(db,data,project,'editing'),inventory=JSON.parse(readFileSync(join(root,'selected-shot-assembly-eighteen-clips-20261107/summary.json'),'utf8')),choices=[];
 for(const r of inventory.results){
  const path=resolve(data,'assets',r.assembled.assembledVideoPath),shot=editing.shots.find(s=>s.id===r.assembled.shotId),clip=shot?.availableClips?.find(c=>resolve(data,'assets',c.path)===path);
  if(!clip||clip.durationMs!==r.assembled.durationMs||hash(path)!==r.assembledSha256)throw Error('Actual accepted selected take unavailable to editor');
  choices.push({shotId:shot!.id,clipId:clip.id,path:clip.path,durationMs:clip.durationMs,sha256:r.assembledSha256});
 }
 if(choices.length!==18||new Set(choices.filter(c=>c.shotId==='72f96eff-3aab-4786-ba4d-89c03539e160').map(c=>c.clipId)).size!==3)throw Error('Missing selected teaching takes');
 const after=crewBriefHash(loadCrewBrief(db,data,project,'planning'),'planning');if(after!==before)throw Error('Read-only editing inspection changed plan');
 const proof={at:new Date().toISOString(),scope:'Actual Mark6 accepted media availability, not a complete editor cut or wholefilm restore',planningBriefHash:before,planningContainsAlternatives:false,editingBriefHash:crewBriefHash(editing,'editing'),verifiedSelectedClips:choices.length,threeTeachingTakesIndependentlyAddressable:true,choices,providerCalls:0,databaseWrites:0,wholeFilmComplete:false};
 writeFileSync(join(root,'multiple-take-editor-live-brief-proof-20261107.json'),JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({planningBriefHash:before,verifiedSelectedClips:choices.length,threeTeachingTakesIndependentlyAddressable:true,providerCalls:0}));
}finally{db.close();}
