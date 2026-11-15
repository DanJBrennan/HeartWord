import {writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext,referenceGroups} from '../../src/pipeline/media-generation/external-keyframes.js';
const db=getDb(),projectId='c457a815-d07d-4902-91b5-7b936b549856';
const shots=db.prepare('SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence').all(projectId);
const results=shots.map(row=>{
 try{
  const c=getKeyframeContext(db,getDataDir(),String(row.id));
  let groups:number[][]|null=null,slotIssue:string|null=null;
  try{groups=referenceGroups(c.references,c.sceneReferences);}catch(e){slotIssue=(e as Error).message;}
  return{shotId:row.id,sceneSequence:c.scene.sequence,shotSequence:c.shot.sequence,referenceCount:c.references.length,identities:new Set(c.references.map(r=>r.character_id)).size,
   slots:groups?.length??null,slotIssue,references:c.references.map(r=>({name:r.name,path:r.path,sha256:r.sha256,category:r.category,role:r.referenceRole??'approved_canon'}))};
 }catch(e){return{shotId:row.id,error:(e as Error).message};}
});
const value={status:'read_only_reference_readiness_not_plan_or_keyframe_approval',projectId,shots:results.length,referenceErrors:results.filter(r=>'error' in r),slotIssues:results.filter(r=>'slotIssue' in r&&r.slotIssue),allRows:results,newProviderCalls:0,newMediaAssigned:0,
 limitation:'Current draft context only; references/context and accepted plan must be revalidated before actual generation. Later accepted set views may use another reference slot.'};
writeFileSync('outputs/mark6-production/keyframe-reference-preflight-r32.json',JSON.stringify(value,null,2));console.log(JSON.stringify({shots:value.shots,referenceErrors:value.referenceErrors,slotIssues:value.slotIssues.map(r=>({shotId:r.shotId,issue:'slotIssue' in r?r.slotIssue:null})),newProviderCalls:0}));
