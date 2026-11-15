import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb} from '../../src/db/client.js';
import {hasCurrentSourceReview} from '../../src/pipeline/ingestion/source-review.js';
import {bindShotUtterance} from '../../src/pipeline/voice-lipsync/utterance-binding.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),packet=read(root+'/speaking-binding-proposals.json'),db=getDb();
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(packet.projectId))throw Error('Let the current review settle before changing its source bindings.');
if(!hasCurrentSourceReview(db,packet.projectId)||packet.proposals.length!==21)throw Error('Missing current accepted source or incomplete proposal');
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const p of packet.proposals)if(hash(p.castPath)!==p.castSha256||hash(p.preparedWindow)!==p.windowSha256||Math.abs(p.startMs*24-Math.round(p.startMs*24))>.00001||Math.abs(p.endMs*24-Math.round(p.endMs*24))>.00001)throw Error('Source/cast sample authority changed');
const result:any={projectId:packet.projectId,bindings:[],newVoiceOrVideoRequests:0,semanticInternalVerseTiming:'not_inferred',sourceSoundtrack:'one continuous full-line performance per quotation'};
for(const p of packet.proposals){
 const existing=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(p.shotId);
 if(existing){if(existing.source_audio_segment_id!==p.sourceSegmentId||existing.source_start_ms!==p.startMs||existing.source_end_ms!==p.endMs||existing.character_version_id!==p.characterVersionId)throw Error('Existing binding conflicts; no replacement');result.bindings.push(existing);continue;}
 result.bindings.push(bindShotUtterance(db,p));writeFileSync(root+'/speaking-binding-execution.json',JSON.stringify(result,null,2));
}
result.status='all21_exact_sample_windows_bound';result.totalNativeContainers=packet.totalNativeContainers;writeFileSync(root+'/speaking-binding-execution.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,bindings:result.bindings.length,nativeContainers:result.totalNativeContainers,newProviderRequests:0}));
