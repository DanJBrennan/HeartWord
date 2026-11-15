import {it,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
const rows:any[]=[];
vi.mock('../../src/providers/codex-text.js',async original=>{
 const actual:any=await original();
 return {...actual,codexInputBudget:(prompt:string,...args:any[])=>{
  try{return actual.codexInputBudget(prompt,...args);}catch(e){
   const encoded=JSON.parse(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\n')[0]!);
   const size=(v:any)=>JSON.stringify(v)?.length??0;
   rows.push({characters:prompt.length,encodedKeys:Object.fromEntries(Object.entries(encoded).map(([k,v])=>[k,size(v)]))});
   writeFileSync('outputs/mark6-production/director-r64-last-encoded.json',JSON.stringify(encoded));
   writeFileSync('outputs/mark6-production/director-r64-size-diagnostic.json',JSON.stringify(rows,null,2));throw e;
  }
 }};
});
it('measures actual pending input without provider submission',async()=>{
 process.env.HEARTWORD_DATA_DIR='C:/Users/danbr/HeartWordData';
 process.argv[2]='9c4f4dd1-dedf-4351-843e-d12eec7a13c6';
 process.argv[3]='outputs/mark6-production/palace-native-light-review-inputs-20261105.json';
 await import('./director-r64-direct-inspect.js');
},300000);
