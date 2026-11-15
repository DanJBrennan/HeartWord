// Read-only current consumer bindings; never a voice/alignment/generation call.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{
 const p=requireCurrentPlan(db,data,project);if(p.id!=='67631c67-22d8-4c51-8d1e-e567dafeaaed'||p.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412')throw Error('Current approved plan required');
 const specs=[{shotId:'b417c5b2-ac1f-470a-b6bc-eba854207c28',characterId:'9cbc4222-b194-4db4-baa9-2ba7083e31f3',segmentId:'113cc0c5-062e-4790-83e2-de1cd74d63b5',sourceMs:[709631,710800]},{shotId:'87935174-7179-4282-8e94-306b24cbaa62',characterId:'b78bed54-1d53-4b9f-9070-549dddb71b19',segmentId:'997e526a-669a-4025-be29-25af38cb46eb',sourceMs:[719307,723198]}],rows=[];
 for(const s of specs){const c=getKeyframeContext(db,data,s.shotId),r=c.references.find(r=>r.character_id===s.characterId);if(!r)throw Error('Current speaker BODY required');const source=db.prepare("SELECT id,verse_ref,start_ms,end_ms,speaker_character_id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(s.segmentId,project);if(!source||source.start_ms!==s.sourceMs[0]||source.end_ms!==s.sourceMs[1]||source.speaker_character_id!==s.characterId)throw Error('Pinned source interval changed');const bound=resolveSpeechRunCastAudio(db,s.shotId,r.version_id);if(!bound)throw Error('No CURRENT consumer audio binding for '+s.shotId+'; preserve originals/reconcile existing performance, no new voice call');const path=join(data,'assets',bound.path);rows.push({...s,currentSpeakerName:r.name,currentSpeakerVersion:r.version_id,source,bound,consumerAudioPath:path,consumerAudioSha256:createHash('sha256').update(readFileSync(path)).digest('hex')});}
 const out={at:new Date().toISOString(),scope:'Read-only existing CURRENT scene5 Peter cry and Jesus reassurance consumer audio bindings; not media/wordtiming/fluency approval',productionRunId:p.id,briefHash:p.brief_hash,rows,newVoiceCalls:0,newAlignmentCalls:0,providerCalls:0,databaseWrites:0,wholeFilmReady:false};writeFileSync('outputs/mark6-production/checkpoints/scene5-two-speech-current-bindings-readonly-20261111.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}finally{db.close();}
