import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const root='outputs/mark6-production',folder=root+'/complete-jesus-answer-intro-source-window-20261110',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),m=read(folder+'/review-preparation-proof.json'),av=read(folder+'/complete-window-av-review.json'),d=read(folder+'/direct-selected-picture-review.json'),db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{
 const auth=productionAuthorization(db,data,project);auth.assertCurrent();validateAttemptRevision(db,data,project,m.attemptId);
 if(existsSync(folder+'/selection-and-assembly.json')||av.attemptId!==m.attemptId||av.response.result.status!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((x:any)=>x.status!=='clear')||d.status!=='actual_all58_and_full0_29_57_and_incoming_seen'||hash(m.raw)!==m.rawSha256||hash(m.whole)!==m.wholeSha256)throw Error('Exact actual complete ten-check source/canon/motion review required');
 const receipt='mark6-production-audio-review-m6_jesus_answer_intro178_selected58_and_join_av_20261110';if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(receipt,project,av.response.costUsd))throw Error('Known actual AV receipt required');
 const selection=acceptFinalVideoCandidate(db,project,m.attemptId,2400),assembled=assembleSingleShot(db,'a55cfba9-873b-44b5-935c-942ecf7a4b39'),out=join(data,'assets',assembled.assembledVideoPath);
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify({at:new Date().toISOString(),attemptId:m.attemptId,selection,assembled,assembledSha256:hash(out),rawSource:m.raw,rawSourceSha256:m.rawSha256,sourceWindowMs:[544172,546572],sourceDurationMs:2400,sourceSamples24k:57600,selectedNativeFrames:[0,58],normalVerificationPending:true,review:folder+'/complete-window-av-review.json',receipt,finalEditorUse:'Original selected native candidate first58pictureframes with unchanged continuous approved global master, not review derivative',providerCalls:0,wholeFilmReady:false},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:m.attemptId,selection,assembled,normalVerificationPending:true}));
}finally{db.close();}
