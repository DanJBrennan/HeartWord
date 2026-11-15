import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mark6NativeBudget} from '../../outputs/mark6-production/native-budget.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
let root:string;
const projectId='c457a815-d07d-4902-91b5-7b936b549856';
const nativeResult={status:'hold_for_review' as const,media:{path:'generated/fixture.mp4'},cost:{usd:0},provenance:{provider:'ltx_local',model:'ltx-2.5-fast',prompt:'Fixture only'}};
const read=()=>JSON.parse(readFileSync(join(root,'native-generation/execution.json'),'utf8'));
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'hw-mark6-native-budget-'));writeFileSync(join(root,'execution.json'),JSON.stringify({projectId,productionHold:false,limits:{localLtxGenerations:280},ltx:{calls:0}}));});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();rmSync(root,{recursive:true,force:true});});
it('counts a native video once despite surrounding source checks, preserving unreviewed status',async()=>{
 const auth=vi.fn(),local=new LtxVideoProvider();
 vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();return nativeResult;});
 auth();auth();const result=await mark6NativeBudget(root).video(local).generateFinal({shotId:'s',prompt:'Fixture',characters:[],authorizeSubmission:auth});
 expect(auth).toHaveBeenCalledTimes(3);expect(read().entries).toHaveLength(1);expect(read().entries[0]).toMatchObject({kind:'ordinary_or_draft',status:'returned_unreviewed'});
 expect(result.status).toBe('hold_for_review');expect(JSON.parse(readFileSync(join(root,'execution.json'),'utf8')).ltx.calls).toBe(1);
});
it('counts one real section protocol submission without counting outer authorization checks',async()=>{
 vi.stubEnv('LTX_TOKEN','fixture-secret');const assets=join(root,'assets');mkdirSync(assets);const image=join(assets,'image.png'),audio=join(assets,'audio.wav');writeFileSync(image,'fixture');writeFileSync(audio,'fixture');
 const auth=vi.fn();auth();auth();
 const transport={connect:vi.fn(async()=> 'http://127.0.0.1:1'),remote:vi.fn(async(c:string)=>c==='printf "%s" "$HOME"'?'/Users/fixture':''),upload:vi.fn(async()=>{}),download:vi.fn(async(_r:string,p:string)=>{writeFileSync(p,'unreviewed fixture');}),reset:vi.fn()};
 const json=vi.fn(async(_b:string,p:string)=>p==='/health'?{status:'ok',models_loaded:true,active_model:'fast'}:p==='/api/runtime-policy'?{force_api_generations:false}:p==='/api/settings'?{userPrefersLtxApiVideoGenerations:false}:p==='/api/generation/progress'?{status:'idle'}:{status:'complete',video_path:'/Users/fixture/result.mp4'});
 await mark6NativeBudget(root).section({dataDir:root,directory:join(assets,'section'),image,audio,prompt:'Fixture',authorizeSubmission:auth},{transport,json});
 expect(auth).toHaveBeenCalledTimes(3);expect(json.mock.calls.filter(c=>c[1]==='/api/generate')).toHaveLength(1);expect(read().entries).toHaveLength(1);expect(read().entries[0].status).toBe('returned_unreviewed');
 expect(JSON.stringify(read())).not.toContain('fixture-secret');
});
it('uses a smaller counted local Fast draft without a cloud draft or automatic selection',async()=>{
 const local=new LtxVideoProvider(),generate=vi.spyOn(local,'generateFinal').mockImplementation(async(request,options)=>{
  request.authorizeSubmission!();expect(options).toMatchObject({resolution:'540p',durationSeconds:5,fps:24,startFrame:{path:'start.png'}});
  expect(request.prompt).toContain('Preserve the approved action');expect(request.prompt).not.toContain('UNRELATED_FULL_CHAPTER_APPENDIX');return nativeResult;
 });
 const result=await mark6NativeBudget(root).draft(local).generateDraft({shotId:'draft',prompt:'Preserve the approved action\nACCEPTED EMOTIONAL TREATMENT\nUNRELATED_FULL_CHAPTER_APPENDIX',characters:[],authorizeSubmission:()=>{}},{startFrame:{path:'start.png'}});
 expect(generate).toHaveBeenCalledTimes(1);expect(read().entries).toHaveLength(1);expect(result.status).toBe('hold_for_review');
});
it('holds before generation 281, including corrections and drafts in the same count',async()=>{
 mkdirSync(join(root,'native-generation'));writeFileSync(join(root,'native-generation/execution.json'),JSON.stringify({projectId,maximumGenerations:280,entries:Array.from({length:280},(_,i)=>({id:'old-'+i,kind:i%2?'speech_section':'ordinary_or_draft',status:'returned_unreviewed',reservedAt:'fixture'}))}));
 const local=new LtxVideoProvider(),submitted=vi.fn();vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();submitted();return nativeResult;});
 await expect(mark6NativeBudget(root).video(local).generateFinal({shotId:'s',prompt:'Fixture',characters:[],authorizeSubmission:()=>{}})).rejects.toThrow('280 native generation ceiling');
 expect(submitted).not.toHaveBeenCalled();expect(read().entries).toHaveLength(280);
});
it('holds an uncertain submission and never repeats it or starts a second native job',async()=>{
 const local=new LtxVideoProvider(),submitted=vi.fn();vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();submitted();throw Error('Lost local response');});
 const wrapped=mark6NativeBudget(root).video(local),request={shotId:'s',prompt:'Fixture',characters:[],authorizeSubmission:()=>{}};
 await expect(wrapped.generateFinal(request)).rejects.toThrow('Lost local response');expect(read().entries[0].status).toBe('uncertain_reconcile_before_retry');
 await expect(wrapped.generateFinal(request)).rejects.toThrow('Reconcile pending');expect(submitted).toHaveBeenCalledTimes(1);expect(read().entries).toHaveLength(1);
});
it('retains source authorization before native reservation and rejects a cloud provider before calling it',async()=>{
 const local=new LtxVideoProvider(),submitted=vi.fn();vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();submitted();return nativeResult;});
 await expect(mark6NativeBudget(root).video(local).generateFinal({shotId:'s',prompt:'Fixture',characters:[],authorizeSubmission:()=>{throw Error('Stale source');}})).rejects.toThrow('Stale source');
 expect(submitted).not.toHaveBeenCalled();expect(existsSync(join(root,'native-generation/execution.json'))).toBe(false);
 const cloud={generateFinal:vi.fn()};expect(()=>mark6NativeBudget(root).video(cloud as any)).toThrow('no paid fallback');expect(cloud.generateFinal).not.toHaveBeenCalled();
});

it.each([220,279])('preserves all %i earlier calls and counts the next permitted native operation once',async count=>{
 mkdirSync(join(root,'native-generation'));const entries=Array.from({length:count},(_,i)=>({id:'retained-'+i,kind:'speech_section',status:'returned_unreviewed',reservedAt:'original'}));writeFileSync(join(root,'native-generation/execution.json'),JSON.stringify({projectId,maximumGenerations:280,entries}));
 const local=new LtxVideoProvider(),submitted=vi.fn();vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();submitted();return nativeResult;});
 await mark6NativeBudget(root).video(local).generateFinal({shotId:'next',prompt:'Fixture',characters:[],authorizeSubmission:()=>{}});expect(submitted).toHaveBeenCalledTimes(1);expect(read().entries).toHaveLength(count+1);expect(read().entries.slice(0,count)).toEqual(entries);expect(JSON.parse(readFileSync(join(root,'execution.json'),'utf8')).ltx.calls).toBe(count+1);
});
it('holds mismatched unactivated runtime limits before native submission',async()=>{
 writeFileSync(join(root,'execution.json'),JSON.stringify({projectId,productionHold:false,limits:{localLtxGenerations:220},ltx:{calls:0}}));const local=new LtxVideoProvider(),submitted=vi.fn();vi.spyOn(local,'generateFinal').mockImplementation(async request=>{request.authorizeSubmission!();submitted();return nativeResult;});await expect(mark6NativeBudget(root).video(local).generateFinal({shotId:'s',prompt:'Fixture',characters:[],authorizeSubmission:()=>{}})).rejects.toThrow('authorization mismatch');expect(submitted).not.toHaveBeenCalled();expect(existsSync(join(root,'native-generation/execution.json'))).toBe(false);
});
