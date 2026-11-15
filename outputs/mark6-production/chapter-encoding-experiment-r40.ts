import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {getDataDir} from '../../src/db/client.js';
import {chapterCrewPacket} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
const db=new DatabaseSync(join(getDataDir(),'db','heartword.sqlite'),{readOnly:true});
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get('25ed817f-cae7-4a39-86af-8ce9429295e7')!;
const brief=JSON.parse(String(row.brief_json)),result=JSON.parse(String(row.result_json));
const original=chapterCrewPacket(brief,result.contributions,result.productionRecord,'script_supervisor');
const state:any=structuredClone(original),history=state.productionRecord.history;
state.productionRecord.history=history.filter((h:any)=>h.proposedChanges.length);
state.historyIndex=history.filter((h:any)=>h.id.startsWith(state.productionRecord.revision+':')).map((h:any)=>({id:h.id,owner:h.owner,kind:h.kind}));
state.historyArchive={count:history.length,access:'Exact contribution and history_page retrieval; original records unchanged.'};
state.audit={fullRecordSha256:state.audit.fullRecordSha256,historyCount:history.length};
const size=(v:any)=>Buffer.byteLength(encodeCrewPacket(v),'utf8');
const fields=new Set(['instruction','summary','rationale','evidence','requestedChange','scriptureBasis','limitations']);
const strings=new Set<string>();
function visit(n:any,fn:(v:string,k:string)=>any,key=''):any{
 if(typeof n==='string')return fields.has(key)&&n.length>=180?fn(n,key):n;
 if(Array.isArray(n))return n.map(v=>visit(v,fn,key));
 return n&&typeof n==='object'?Object.fromEntries(Object.entries(n).map(([k,v])=>[k,visit(v,fn,k)])):n;
}
visit(state,s=>{strings.add(s);return s;});
const results:any[]=[{variant:'original_current_chapter',bytes:size(original)},{variant:'history_index_only',bytes:size(state)}];
for(const mode of ['sentences','clauses','word_phrases']){
 const counts=new Map<string,number>(),parts=new Map<string,string[]>();
 if(mode!=='word_phrases'){
  for(const s of strings){const a=s.match(mode==='sentences'?/[^.!?;\n]+[.!?;\n]*|[.!?;\n]+/g:/[^,.!?;:\n]+[,.!?;:\n]*|[,.!?;:\n]+/g)??[s];parts.set(s,a);for(const p of a)if(p.length>=40)counts.set(p,(counts.get(p)??0)+1);}
 }else{
  for(const s of strings){const words=s.match(/\S+\s*|\s+/g)??[s];parts.set(s,words);for(const n of [24,16,8])for(let i=0;i+n<=words.length;i++){const p=words.slice(i,i+n).join('');if(p.length>=60)counts.set(p,(counts.get(p)??0)+1);}}
 }
 const transformed=visit(state,s=>{
  const a=parts.get(s)!;let chunks:string[]=[];
  if(mode!=='word_phrases'){if(!a.some(p=>(counts.get(p)??0)>1))return s;chunks=a;}
  else{
   let literal='';for(let i=0;i<a.length;){let found='';let length=0;for(const n of [24,16,8]){const p=a.slice(i,i+n).join('');if(n<=a.length-i&&(counts.get(p)??0)>1){found=p;length=n;break;}}
    if(found){if(literal){chunks.push(literal);literal='';}chunks.push(found);i+=length;}else literal+=a[i++];
   }if(literal)chunks.push(literal);if(chunks.length===1)return s;
  }
  if(chunks.join('')!==s)throw Error('Lossy experiment');return{$text:chunks};
 });
 results.push({variant:mode,bytes:size(transformed),longStrings:strings.size});
}
writeFileSync('outputs/mark6-production/chapter-encoding-experiment-r40.json',JSON.stringify({status:'offline_size_experiment_not_runtime_change',results,newProviderCalls:0},null,2));console.log(JSON.stringify(results));db.close();
