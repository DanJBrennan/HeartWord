// Operational Mark6 counter around the existing local native generators.
// Count only the authorization immediately before /api/generate, not the
// surrounding source checks. No generation or review happens on import.
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {generateA2vSection} from '../../src/providers/ltx/a2v.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import type {VideoProvider,DraftVideoProvider} from '../../src/providers/types.js';
import {localMotionDirection} from '../../src/pipeline/media-generation/final-video.js';
import {reserveBoundedAttempt} from './attempt-control.js';
const projectId='c457a815-d07d-4902-91b5-7b936b549856';
type Entry={id:string;kind:'speech_section'|'ordinary_or_draft';status:'reserved_native_submission'|'returned_unreviewed'|'uncertain_reconcile_before_retry';reservedAt:string;artifact?:string};
// Finite220 extension under Dan's November5 authority. Match runtime journals
// only at a settled worker boundary, preserving all prior usage and entries.
export function mark6NativeBudget(root=resolve('outputs/mark6-production')){
 const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),folder=join(root,'native-generation'),journal=join(folder,'execution.json');
 const update=(fn:(s:{projectId:string;maximumGenerations:number;entries:Entry[]})=>void)=>{
  mkdirSync(folder,{recursive:true});const lock=join(folder,'journal.lock'),fd=openSync(lock,'wx');closeSync(fd);
  try{
   const main=read(join(root,'execution.json'));
   if(main.projectId!==projectId||main.limits?.localLtxGenerations!==220||main.productionHold!==false)throw Error('Mark6 native generation authorization mismatch');
   if(!existsSync(journal)&&main.ltx?.calls!==0)throw Error('Unjournaled native calls require reconciliation');
   const s=existsSync(journal)?read(journal):{projectId,maximumGenerations:220,entries:[]};
   if(s.projectId!==projectId||s.maximumGenerations!==220||!Array.isArray(s.entries)||s.entries.length>220||new Set(s.entries.map((e:Entry)=>e.id)).size!==s.entries.length)throw Error('Invalid native generation journal');
   fn(s);writeFileSync(journal,JSON.stringify(s,null,2));
   const current=read(join(root,'execution.json'));current.ltx={...current.ltx,calls:s.entries.length,pending:s.entries.filter((e:Entry)=>e.status!=='returned_unreviewed').length,journal:'native-generation/execution.json'};writeFileSync(join(root,'execution.json'),JSON.stringify(current,null,2));
  }finally{unlinkSync(lock);}
 };
 const reserve=(id:string,kind:Entry['kind'])=>update(s=>{
  if(s.entries.some(e=>e.status!=='returned_unreviewed'))throw Error('Reconcile pending native generation before another submission');
  if(s.entries.some(e=>e.id===id))throw Error('Existing native operation; no automatic repeat');
  if(s.entries.length>=220)throw Error('220 native generation ceiling reached');
  reserveBoundedAttempt(root,'localLtxGenerations',id);
  s.entries.push({id,kind,status:'reserved_native_submission',reservedAt:new Date().toISOString()});
 });
 const finish=(id:string,artifact:string)=>update(s=>{const e=s.entries.find(e=>e.id===id);if(!e||e.status!=='reserved_native_submission')throw Error('Native completion lacks its reservation');e.status='returned_unreviewed';e.artifact=artifact;});
 const uncertain=(id:string)=>update(s=>{const e=s.entries.find(e=>e.id===id);if(e)e.status='uncertain_reconcile_before_retry';});
 const budget={
  /** Pass as runVoiceLipSync(...,{generateLtxSection:budget.section}). */
  section:async(input:Parameters<typeof generateA2vSection>[0],dependencies?:Parameters<typeof generateA2vSection>[1])=>{
   const location=relative(resolve(input.dataDir,'assets'),resolve(input.directory));
   if(!location||location.startsWith('..')||isAbsolute(location))throw Error('Native section must remain inside assets');
   const id='section:'+location.replaceAll('\\','/');let submitted=false;
   try{
    const result=await generateA2vSection({...input,authorizeSubmission:()=>{input.authorizeSubmission();reserve(id,'speech_section');submitted=true;}},dependencies);
    if(!submitted)throw Error('Native section returned without submission authorization');finish(id,result.attemptPath);return result;
   }catch(e){if(submitted)uncertain(id);throw e;}
  },
  /** Wrap only the local provider; ordinary source/plan guards remain intact. */
  video:(local:LtxVideoProvider):VideoProvider=>{
   if(!(local instanceof LtxVideoProvider))throw Error('Only the local LTX provider may use the native allowance; no paid fallback');
   return{generateFinal:async(request,options)=>{
   if(!request.authorizeSubmission)throw Error('Native video needs current production authorization');
   const id='video:'+request.shotId+':'+randomUUID();let submitted=false;
   try{
    const result=await local.generateFinal({...request,authorizeSubmission:()=>{request.authorizeSubmission!();reserve(id,'ordinary_or_draft');submitted=true;}},options);
    if(!submitted||result.provenance.provider!=='ltx_local'||result.cost.usd!==0||!result.media?.path)throw Error('Local-only native result/provenance unavailable');
    finish(id,result.media.path);return result;
   }catch(e){if(submitted)uncertain(id);throw e;}
   }};
  },
 };
 return{...budget,draft:(local:LtxVideoProvider):DraftVideoProvider=>{
  // Composition previews use the existing supported lower tier. Final and
  // audio-conditioned speaking requests keep their separate quality contracts.
  const native=budget.video(local),options={resolution:'540p' as const,durationSeconds:5,fps:24,tier:'economy' as const};
  return{
   generateDraft:(request,opts)=>native.generateFinal({...request,prompt:localMotionDirection(request.prompt)},{...options,startFrame:opts?.startFrame}),
   generateGuided:(startFrame,endFrame,request)=>native.generateFinal({...request,prompt:localMotionDirection(request.prompt)},{...options,startFrame,endFrame}),
  };
 }};
}
