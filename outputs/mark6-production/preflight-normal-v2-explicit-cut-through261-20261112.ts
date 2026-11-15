import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getDataDir} from '../../src/db/client.js';
import {loadCrewBrief,crewBriefHash,digest,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {planEditorialCut,resolveEditorialClip} from '../../src/pipeline/assembly/editorial-plan.js';
const top='outputs/mark6-production',f=top+'/checkpoints',data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true}),project='c457a815-d07d-4902-91b5-7b936b549856';db.exec('PRAGMA busy_timeout=5000');
try{
 const draft=JSON.parse(readFileSync(f+'/proposed-source-picture-editor-edits-through-touch261-duration-reconciled-20261112.json','utf8')),brief=loadCrewBrief(db,data,project,'editing');
 if(draft.edits.length!==120||JSON.stringify(draft.sourceMs)!=='[0,788791]'||draft.sourceSamples24k!==18930984||brief.retainedPerformanceMaster?.authorityId!=='mark6-retain-review-performance-master-v2-20261112')throw Error('Exact119/current retained approved master required');
 for(const e of draft.edits){const clip=resolveEditorialClip(brief.shots.find(s=>s.id===e.shotId),e.clipId);if(!clip||clip.path!==e.exactEditorMediaPath||!existsSync(productionAssetPath(data,clip.path)))throw Error('Explicit accepted EDITOR media unavailable '+e.clipId);}
 const contribution={summary:'Read-only partial source coverage preflight, NOT approved fullfilm cut',decision:'hold' as const,directions:[],findings:[],edits:draft.edits.map((e:any)=>({shotId:e.shotId,clipId:e.clipId,sourceStartMs:e.sourceStartMs,durationMs:e.durationMs})),pauses:[]};let expectedHold='';
 try{planEditorialCut(brief,contribution);throw Error('Incomplete coverage incorrectly accepted');}catch(e){expectedHold=(e as Error).message;if(!expectedHold.startsWith('Cut needs '))throw e;}
 const proof={at:new Date().toISOString(),status:'normal_retained_v2_guard_and120_explicit_clip_lip_checks_pass_missing7889ms_tail_only',briefHash:crewBriefHash(brief,'editing'),sourceThroughMs:788791,missingSourceMs:7889,explicitEdits:120,retainedMasterBound:true,retainedMasterSha256:brief.retainedPerformanceMaster?.sha256,partialCoverageNotRenderable:true,audioSegments:brief.audio.length,sourceAudioDurationMs:brief.audio.reduce((n,a)=>n+a.endMs-a.startMs,0),expectedHold,providerCalls:0,databaseWrites:0,wholeFilmReady:false};
 writeFileSync(f+'/normal-editing-preflight-v2-through261-20261112.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{db.close();}
