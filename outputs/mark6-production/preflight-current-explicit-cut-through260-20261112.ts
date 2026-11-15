import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getDataDir} from '../../src/db/client.js';
import {loadCrewBrief,crewBriefHash,digest,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {planEditorialCut,resolveEditorialClip} from '../../src/pipeline/assembly/editorial-plan.js';
const top='outputs/mark6-production',f=top+'/checkpoints',data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true}),project='c457a815-d07d-4902-91b5-7b936b549856';db.exec('PRAGMA busy_timeout=5000');
try{
 const draft=JSON.parse(readFileSync(f+'/proposed-source-picture-editor-edits-through-layseek260-20261112.json','utf8')),brief=loadCrewBrief(db,data,project,'editing');
 if(draft.edits.length!==119||JSON.stringify(draft.sourceMs)!=='[0,778791]'||draft.sourceSamples24k!==18690984||!brief.retainedPerformanceMaster||brief.retainedPerformanceMaster.sha256!=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'||digest(readFileSync(productionAssetPath(data,brief.retainedPerformanceMaster.path)))!==brief.retainedPerformanceMaster.sha256)throw Error('Exact119/current retained approved master required');
 for(const e of draft.edits){const clip=resolveEditorialClip(brief.shots.find(s=>s.id===e.shotId),e.clipId);if(!clip||clip.path!==e.exactEditorMediaPath||!existsSync(productionAssetPath(data,clip.path)))throw Error('Explicit accepted EDITOR media unavailable '+e.clipId);}
 const contribution={summary:'Read-only partial source coverage preflight, NOT approved fullfilm cut',decision:'hold' as const,directions:[],findings:[],edits:draft.edits.map((e:any)=>({shotId:e.shotId,clipId:e.clipId,sourceStartMs:e.sourceStartMs,durationMs:e.durationMs})),pauses:[]};let expectedHold='';
 try{planEditorialCut(brief,contribution);throw Error('Incomplete coverage incorrectly accepted');}catch(e){expectedHold=(e as Error).message;if(!expectedHold.startsWith('Cut needs '))throw e;}
 const proof={at:new Date().toISOString(),status:'all119_explicit_clips_and_lip_guards_reached_expected_missing_tail_hold',briefHash:crewBriefHash(brief,'editing'),sourceThroughMs:778791,missingSourceMs:17889,explicitEdits:119,retainedApprovedMasterSha256:brief.retainedPerformanceMaster.sha256,audioSegments:brief.audio.length,sourceAudioDurationMs:brief.audio.reduce((n,a)=>n+a.endMs-a.startMs,0),expectedHold,providerCalls:0,databaseWrites:0,wholeFilmReady:false};
 writeFileSync(f+'/editing-preflight-through260-20261112.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{db.close();}
