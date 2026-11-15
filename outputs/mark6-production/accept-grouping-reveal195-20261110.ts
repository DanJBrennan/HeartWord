import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const root='outputs/mark6-production',folder=root+'/complete-grouping-reveal-source-window-20261110',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),m=read(folder+'/review-preparation-proof.json'),av=read(folder+'/complete-window-av-review.json'),d=read(folder+'/direct-selected-picture-review.json'),db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{
 const auth=productionAuthorization(db,data,project);auth.assertCurrent();validateAttemptRevision(db,data,project,m.attemptId);
 if(m.frames!==192||m.sourceSamples24k!==192000||JSON.stringify(m.sourceWindowMs)!=='[587613.875,595613.875]'||existsSync(folder+'/selection-and-assembly.json')||av.attemptId!==m.attemptId||av.response.result.status!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((x:any)=>x.status!=='clear')||d.status!=='actual_all192_and_full0_96_191_and_incoming_seen'||hash(m.raw)!==m.rawSha256||hash(m.whole)!==m.wholeSha256)throw Error('Exact actual complete ten-check source/canon/motion review required');
 const receipt='mark6-production-audio-review-m6_grouping_reveal195_first192_and_join_av_20261110';if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(receipt,project,av.response.costUsd))throw Error('Known actual AV receipt required');
 const selection=acceptFinalVideoCandidate(db,project,m.attemptId,8000),assembled=assembleSingleShot(db,'5fd211b5-7972-4af5-9194-fe4d55c28106'),out=join(data,'assets',assembled.assembledVideoPath);
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify({at:new Date().toISOString(),attemptId:m.attemptId,selection,assembled,assembledSha256:hash(out),rawSource:m.raw,rawSourceSha256:m.rawSha256,sourceWindowMs:[587613.875,595613.875],sourceDurationMs:8000,clipNominalIntegerMs:8000,clipMetadataMinusSourceMs:0,pictureMinusAudioMs:192/24*1000-8000,sourceSamples24k:192000,selectedNativeFrames:[0,192],normalVerificationPending:true,review:folder+'/complete-window-av-review.json',receipt,finalEditorUse:'Original selected native candidate first192pictureframes with unchanged continuous approved global master, not review derivative',providerCalls:0,wholeFilmReady:false},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:m.attemptId,selection,assembled,normalVerificationPending:true}));
}finally{db.close();}
