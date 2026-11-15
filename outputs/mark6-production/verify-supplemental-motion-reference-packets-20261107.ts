import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDataDir} from '../../src/db/client.js';
import {selectMotionReviewReferences} from './av-call.js';
const data=getDataDir(),reports=[];
for(const [id,actorHash] of [
 ['d1fc9b5d-3fb9-41a1-a4bb-824decd9184e','a7f50fa728aefe67206fb54e078d3fe656b74923cc97df6e4262d3d7c9e064c6'],
 ['79330c8f-d13b-4295-ab34-6cf83594caf0','b20bcbf7b91d2541e91e382ee2114963b27a2850e64bcf4e1486cbf654da67cc'],
 ['d0e89692-19ae-4bbf-9f6b-b86a135a5fde','a7f50fa728aefe67206fb54e078d3fe656b74923cc97df6e4262d3d7c9e064c6'],
]){
 const brief=JSON.parse(readFileSync(join(data,'exports/keyframe-briefs',id!,'brief.json'),'utf8')),before=JSON.stringify(brief),refs=selectMotionReviewReferences(brief),actor=refs.find(r=>r.r.sha256===actorHash);
 if(!actor||actor.r.referenceNumbers.length||JSON.stringify(brief)!==before)throw Error('Actual supplementary canon packet was omitted or mutated');
 for(const {r} of refs)if(createHash('sha256').update(readFileSync(join(data,'assets',r.path))).digest('hex')!==r.sha256)throw Error('Actual reference bytes changed');
 const last=brief.generationInputs.length-1;if(!brief.generationInputs[last].referenceNumbers.length&&refs.some(r=>r.i===last))throw Error('Unmapped set supplement leaked into identity packet');
 reports.push({briefId:id,selectedImages:refs.map(r=>r.i+1),supplementaryActorImage:actor.i+1,supplementaryActorSha256:actor.r.sha256,allSelectedBytesMatch:true,unmappedLastSetExcluded:true});
}
const proof={at:new Date().toISOString(),status:'actual_preaching_anointing_banquet_reference_packets_verified',reports,providerCalls:0,earlierReviewsUnchanged:true,scope:'Reference inclusion/roles/bytes only, not a new audiovisual verdict'};
writeFileSync('outputs/mark6-production/supplemental-motion-reference-packet-proof-20261107.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
