// Deferred: actual returned draft and direct picture review are required.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {chooseShotDraft} from '../../src/pipeline/media-generation/draft-room.js';
const top='outputs/mark6-production',base=top+'/native-generation/eating-draft206-540p-20261110',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),db=getDb(),data=getDataDir();
try{
 const auth=productionAuthorization(db,data,'c457a815-d07d-4902-91b5-7b936b549856');auth.assertCurrent();
 const technical=read(base+'/actual-inspection/technical-proof.json'),review=read(base+'/actual-inspection/root-composition-review.json'),n=read(top+'/native-generation/execution.json');
 validateAttemptRevision(db,data,'c457a815-d07d-4902-91b5-7b936b549856',technical.attemptId);
 if(existsSync(base+'/composition-choice.json')||n.entries.length!==206||n.entries.some((e:any)=>e.status!=='returned_unreviewed')||technical.nativeFrames!==121||createHash('sha256').update(readFileSync(join(data,'assets',technical.asset))).digest('hex')!==technical.sha256||review.sha256!==technical.sha256||review.attemptId!==technical.attemptId||review.status!=='initial_three_diners_eating_composition_suitable_for_full_render'||review.actualAll121NativePicturesViewed!==true||review.compositionOnly!==true||review.deliverableMotionClearance!==false)throw Error('Actual206 terminal/current direct composition review required');
 const choice=chooseShotDraft(db,'c457a815-d07d-4902-91b5-7b936b549856',technical.attemptId);
 writeFileSync(base+'/composition-choice.json',JSON.stringify({at:new Date().toISOString(),choice,technical,review,scope:'INITIAL COMPOSITION ONLY; no draft motion selected as deliverable',sourceClearStillMs:615613.875,newExternalAvCalls:0},null,2),{flag:'wx'});
 console.log(JSON.stringify({attemptId:technical.attemptId,compositionSelected:true,deliverableMotionClearance:false}));
}finally{db.close();}
