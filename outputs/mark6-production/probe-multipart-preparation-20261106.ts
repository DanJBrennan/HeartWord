import {executeCodexMultipart} from '../../src/providers/codex-multipart.js';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'heartword-multipart-metadata-'));
let prepared:any=null,failure:any=null;
try{
 await executeCodexMultipart({input:'METADATA ONLY. NO MODEL TURN IS AUTHORIZED. '.repeat(38000)+'\nMETADATA ONLY STOP BEFORE MODEL.\n',schema:{type:'object',properties:{}},images:[],cwd:root,model:'gpt-6.1-sol',beforeStart:info=>{prepared=info;throw Error('METADATA_ONLY_STOP_BEFORE_TURN_START');}},(code,jsonl,reason)=>Object.assign(Error(reason),{code,jsonl}));
}catch(e:any){failure={reason:e.message,code:e.code,protocol:JSON.parse('['+(e.jsonl??'').trim().split('\n').filter(Boolean).join(',')+']')};}
finally{if(!resolve(root).startsWith(resolve(tmpdir())+ '\\heartword-multipart-metadata-'))throw Error('Unexpected metadata scratch path');await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
await writeFile('outputs/mark6-production/multipart-preparation-probe-20261106.json',JSON.stringify({at:new Date().toISOString(),prepared,failure,providerGenerationRequests:0,beforeStartAlwaysThrows:true,userConfigChanged:false,authFilesReadOrChanged:false},null,2));
console.log(JSON.stringify({prepared,reason:failure?.reason,providerGenerationRequests:0}));
