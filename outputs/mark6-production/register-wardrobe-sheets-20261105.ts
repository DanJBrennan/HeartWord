// Operational handoff to the existing canon service. Default is read-only.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createWardrobeCandidate,addWardrobeReference,refinementDetail} from '../../src/characters/wardrobe-refinement.js';
const root='outputs/mark6-production',dataDir='C:/Users/danbr/HeartWordData',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const commit=process.argv[2]==='--commit';if(process.argv[2]&&!commit&&process.argv[2]!=='--preflight')throw Error('Explicit --preflight or --commit only');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=read(join(root,'wardrobe-sheets-review-ready-20261105.json')),authority=read(join(root,'authorization.json')),resumption=read(join(root,'full-production-resumption-20261105.json'));
if(authority.status!=='explicitly_authorized'||authority.productionHold||!resumption.fullProductionHoldLifted)throw Error('Current autonomous Mark6 authority required');
const db=new DatabaseSync(join(dataDir,'db/heartword.sqlite'),{readOnly:!commit});
try{
 const running=db.prepare("SELECT id,worker_pid FROM production_runs WHERE project_id=? AND status='running'").all(projectId);
 if(commit&&running.length)throw Error('Canon registration waits until the current immutable crew worker is terminal');
 const results=[];
 for(const p of manifest.proposals){
  const source=join(dataDir,'assets',p.sourcePath);if(hash(source)!==p.sheetSha256)throw Error('Inspected sheet changed');
  const current=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").all(p.characterId);
  if(current.length!==1||current[0]!.id!==p.expectedCurrentApprovedVersionId)throw Error('Approved canon basis changed; re-review instead of importing');
  for(const ref of p.basisAndAncestralGenerationReferenceHashes){
   const asset=db.prepare('SELECT path FROM character_assets WHERE id=? AND character_version_id=?').get(ref.assetId,p.expectedCurrentApprovedVersionId);
   if(!asset||hash(join(dataDir,'assets',String(asset.path)))!==ref.sha256)throw Error('Approved reference missing or changed');
  }
  if(!commit){results.push({key:p.key,baseVersionId:p.expectedCurrentApprovedVersionId,sheetSha256:p.sheetSha256,checks:'source file and approved basis hashes verified'});continue;}
  const existing=db.prepare('SELECT id,status FROM character_versions WHERE character_id=? AND version_label=?').get(p.characterId,p.proposalPayload.versionLabel);
  let detail=existing?refinementDetail(db,dataDir,String(existing.id)):createWardrobeCandidate(db,dataDir,p.characterId,p.proposalPayload);
  if(detail.version.status!=='candidate'||JSON.stringify(detail.proposal)!==JSON.stringify(p.proposalPayload))throw Error('Existing version is not the exact prepared candidate; inspect it rather than overwrite');
  results.push({key:p.key,characterId:p.characterId,candidateId:detail.version.id,status:'proposal_registered',candidateHash:detail.candidateHash});
  writeFileSync(join(root,'wardrobe-candidate-registration-20261105.json'),JSON.stringify({status:'registration_in_progress_no_reviews_or_promotion',results},null,2));
  if(!detail.assets.length){
   const request=read(p.exactGenerationRequest);
   detail=addWardrobeReference(db,dataDir,detail.version.id,{sourcePath:p.sourcePath,views:p.views,prompt:request.prompt,referenceHashes:p.basisAndAncestralGenerationReferenceHashes});
  }
  if(detail.assets.length!==1||detail.assets[0]!.sha256!==p.sheetSha256)throw Error('Registered sheet does not match the inspected preparation candidate');
  Object.assign(results.at(-1)!,{status:'sheet_imported_reviews_pending',candidateHash:detail.candidateHash,assetId:detail.assets[0]!.id,path:detail.assets[0]!.path});
  writeFileSync(join(root,'wardrobe-candidate-registration-20261105.json'),JSON.stringify({status:'registered_candidates_not_approved_or_promoted',manifestSha256:hash(join(root,'wardrobe-sheets-review-ready-20261105.json')),results},null,2));
 }
 console.log(JSON.stringify({mode:commit?'registered_candidates_only':'read_only_preflight',activeCrew:running,readyForCommit:!running.length,results,canonPromotion:false}));
}finally{db.close();}
