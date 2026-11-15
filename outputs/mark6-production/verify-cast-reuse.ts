import {readFileSync,writeFileSync} from 'node:fs';
import {runVoicing} from '../../src/pipeline/voicing/index.js';
// This invocation can only reuse/extract locally. A bad source/voice mapping
// must fail before a provider can charge for a replacement conversion.
delete process.env.ELEVENLABS_API_KEY;
const root='outputs/mark6-production',projectId=JSON.parse(readFileSync(root+'/workspace.json','utf8')).projectId;
const result=await runVoicing(projectId);
writeFileSync(root+'/cast-reuse-stage-verification.json',JSON.stringify({result,paidVoiceCredentialRemoved:true,expectedReuses:49},null,2));
console.log(JSON.stringify(result));
if(!result.ok||result.generated!==0||result.reused!==49)throw Error('Retained cast master was not fully reused. Reconcile before any generation.');
