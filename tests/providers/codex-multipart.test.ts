import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {executeCodexMultipart,parseCodexMultipartEvents,splitCodexText,CODEX_MULTIPART_TEXT_LIMIT} from '../../src/providers/codex-multipart.js';
vi.mock('node:child_process',()=>({spawn:vi.fn()}));
let child:any,sent:any[],kind:string;
const failure=(code:number|null,jsonl:string,reason:string)=>Object.assign(Error(reason),{code,jsonl});
function emit(e:any){child.stdout.emit('data',JSON.stringify(e)+'\n');}
const meter=()=>({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:kind==='usageIdentity'?'wrong':'turn',tokenUsage:{modelContextWindow:500000,total:{inputTokens:100,cachedInputTokens:20,outputTokens:30,reasoningOutputTokens:10,totalTokens:130}}}});
const completed=()=>({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:kind==='failedTurn'?'failed':'completed',items:[]}}});
beforeEach(()=>{
 vi.useFakeTimers();sent=[];kind='valid';vi.mocked(spawn).mockReset();
 child=Object.assign(new EventEmitter(),{stdout:Object.assign(new EventEmitter(),{setEncoding:vi.fn()}),stderr:new EventEmitter(),exitCode:null,kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});
 child.stdin={end:vi.fn(()=>queueMicrotask(()=>child.emit('close',0))),write:vi.fn((line:string)=>{const e=JSON.parse(line);sent.push(e);queueMicrotask(()=>{
  if(e.id===1)emit({id:1,result:{}});
  if(e.id===2)emit({id:2,result:{account:{type:kind==='apiKey'?'apiKey':'chatgpt',email:'private-account-fixture'}}});
  if(e.id===6){const response={id:6,result:{config:{mcp_servers:{node_repl:{command:'private-config-fixture'}},plugins:{example:{enabled:true}}}}};emit(response);if(kind==='duplicateRpc')emit(response);}
  if(e.id===3)emit({id:3,result:{model:kind==='wrongModel'?'other':e.params.model,modelProvider:'openai',reasoningEffort:'medium',approvalPolicy:'never',sandbox:{type:'readOnly'},instructionSources:kind==='instructions'?['unbounded-history']:[],thread:{id:'thread',ephemeral:kind!=='persistent',turns:[]}}});
  if(e.id===5)emit({id:5,result:{data:[{name:'node_repl',runtimeStatus:kind==='mcpActive'?'ready':'disabled',tools:kind==='mcpActive'?{shell:{}}:{},resources:[],resourceTemplates:[]}],nextCursor:null}});
  if(e.id===7)emit(kind==='injectRejected'?{id:7,error:{code:-32602,message:'Context rejected'}}:{id:7,result:{}});
  if(e.id===4){
   emit({id:4,result:{turn:{id:'turn',status:'inProgress'}}});emit({method:'turn/started',params:{threadId:'thread',turn:{id:'turn',status:'inProgress'}}});
   if(kind==='timeout')return;
   if(kind==='knownHostNotice')emit({method:'error',params:{threadId:'thread',turnId:'turn',error:{message:'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable features.code_mode_host.'}}});
   emit({method:'item/started',params:{threadId:'thread',turnId:'turn',item:{type:kind==='tool'?'commandExecution':'userMessage',id:'input',content:e.params.input}}});
   emit({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',id:'answer',text:'{"summary":"Exact complete review"}'}}});
   if(kind!=='missingUsage')emit(meter());emit(completed());
  }
 });return true;})};
 vi.mocked(spawn).mockReturnValue(child);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});
const request=()=>({input:'Supplied exact prompt',images:['frame.png'],schema:{type:'object',properties:{summary:{type:'string'}}},cwd:'C:/scratch',model:'gpt-6.1-sol'});

describe('bounded same-login multipart transport',()=>{
 it('joins Unicode parts exactly without splitting a surrogate pair and bounds the aggregate',()=>{
  const text='x'.repeat(524287)+'😀'+' Hatam '.repeat(80000),parts=splitCodexText(text);expect(parts.join('')).toBe(text);expect(parts.every(p=>p.length<=1048576)).toBe(true);expect(parts[0]).toHaveLength(524287);expect(()=>splitCodexText('x'.repeat(CODEX_MULTIPART_TEXT_LIMIT+1))).toThrow('transport character limit');
 });
 it('verifies identity/isolation/MCP before exactly one model turn and retains real events/usage',async()=>{
  vi.stubEnv('OPENAI_API_KEY','private-key-fixture');const beforeStart=vi.fn(),input='x'.repeat(1100000),raw=await executeCodexMultipart({...request(),input,beforeStart},failure);
  const turn=sent.find(e=>e.method==='turn/start');const injected=sent.find(e=>e.method==='thread/inject_items');expect(injected.params.items[0].role).toBe('user');const prefix=injected.params.items[0].content.map((i:any)=>i.text).join('');expect(prefix+turn.params.input.filter((i:any)=>i.type==='text').map((i:any)=>i.text).join('')).toBe(input);expect(turn.params.input.filter((i:any)=>i.type==='text').reduce((n:number,i:any)=>n+i.text.length,0)).toBeLessThanOrEqual(1048576);expect(turn.params.input).toContainEqual({type:'localImage',path:'frame.png'});expect(turn.params.effort).toBe('medium');expect(turn.params.outputSchema).toEqual(request().schema);
  const start=sent.find(e=>e.method==='thread/start');expect(start.params.config.mcp_servers.node_repl.enabled).toBe(false);expect(start.params.config.plugins.example.enabled).toBe(false);expect(start.params.ephemeral).toBe(true);expect(start.params.baseInstructions).toBe('');expect(start.params.developerInstructions).toBe('');expect(beforeStart).toHaveBeenCalledTimes(1);
  expect(sent.filter(e=>e.method==='turn/start')).toHaveLength(1);expect(spawn).toHaveBeenCalledTimes(1);const options=vi.mocked(spawn).mock.calls[0]![2] as any;expect(options.env.OPENAI_API_KEY).toBeUndefined();expect(options.windowsHide).toBe(true);expect(options.shell).toBe(false);
  expect(raw).not.toContain('private-account-fixture');expect(raw).not.toContain('private-config-fixture');expect(raw).not.toContain('private-key-fixture');expect(parseCodexMultipartEvents(raw)).toMatchObject({result:{summary:'Exact complete review'},usage:{inputTokens:100,cachedInputTokens:20,outputTokens:30,reasoningOutputTokens:10}});expect(raw).not.toContain('"type":"turn.completed"');
 });
 it.each(['apiKey','wrongModel','instructions','persistent','mcpActive','duplicateRpc'])('rejects unsafe preparation before model submission: %s',async k=>{
  kind=k;const ready=vi.fn();await expect(executeCodexMultipart({...request(),beforeStart:ready},failure)).rejects.toThrow();expect(ready).not.toHaveBeenCalled();expect(sent.some(e=>e.method==='turn/start')).toBe(false);expect(spawn).toHaveBeenCalledTimes(1);
 });
 it('retains the observed disabled-host notice without treating it as a tool or losing actual completion',async()=>{
  kind='knownHostNotice';const raw=await executeCodexMultipart(request(),failure);expect(raw).toContain('Code Mode is unavailable');expect(parseCodexMultipartEvents(raw).result).toEqual({summary:'Exact complete review'});expect(sent.filter(e=>e.method==='turn/start')).toHaveLength(1);
 });
 it('rejects unacknowledged context injection before a model turn',async()=>{kind='injectRejected';const ready=vi.fn();await expect(executeCodexMultipart({...request(),input:'x'.repeat(1100000),beforeStart:ready},failure)).rejects.toThrow();expect(ready).not.toHaveBeenCalled();expect(sent.some(e=>e.method==='turn/start')).toBe(false);});
 it('keeps a complete packet in supplied context and uses its existing final instruction line as the bounded trigger',async()=>{
  const prefix='Exact packet '.repeat(90000)+'\n',footer='Use this complete packet and preserve every source word.\n',input=prefix+footer;
  await executeCodexMultipart({...request(),input},failure);const context=sent.find(e=>e.method==='thread/inject_items').params.items[0].content.map((p:any)=>p.text).join(''),tail=sent.find(e=>e.method==='turn/start').params.input.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('');expect(context).toBe(prefix);expect(tail).toBe(footer);expect(context+tail).toBe(input);expect(sent.filter(e=>e.method==='turn/start')).toHaveLength(1);
 });
 it('can inspect metadata and stop before any model turn without writing credentials',async()=>{
  const ready=vi.fn(()=>{throw Error('Metadata only');});await expect(executeCodexMultipart({...request(),beforeStart:ready},failure)).rejects.toThrow();expect(ready).toHaveBeenCalledWith(expect.objectContaining({mcpServerCount:0,instructionSourceCount:0,ephemeral:true}));expect(sent.some(e=>e.method==='turn/start')).toBe(false);
 });
 it.each(['tool','failedTurn','usageIdentity'])('retains failures without tools, resubmission or fallback: %s',async k=>{
  kind=k;const error=await executeCodexMultipart(request(),failure).catch(e=>e);expect(error).toBeInstanceOf(Error);expect(error.jsonl).toContain('turn/started');expect(child.kill).toHaveBeenCalled();expect(sent.filter(e=>e.method==='turn/start')).toHaveLength(1);expect(()=>parseCodexMultipartEvents(error.jsonl)).toThrow();
 });
 it.each(['missingUsage','timeout'])('holds incomplete usage/completion without a second request: %s',async k=>{
  kind=k;const done=executeCodexMultipart(request(),failure).catch(e=>e);await vi.advanceTimersByTimeAsync(k==='timeout'?600000:1000);const error=await done;expect(error).toBeInstanceOf(Error);expect(error.jsonl).toContain('turn/started');expect(sent.filter(e=>e.method==='turn/start')).toHaveLength(1);expect(()=>parseCodexMultipartEvents(error.jsonl)).toThrow();
 });
 it('rejects duplicate completion, forged counts and expanded context windows',async()=>{
  const raw=await executeCodexMultipart(request(),failure),events=raw.trim().split('\n').map(l=>JSON.parse(l));
  expect(()=>parseCodexMultipartEvents(raw+'\n'+JSON.stringify(completed()))).toThrow();
  for(const key of ['inputTokens','cachedInputTokens','outputTokens','totalTokens']){const bad=structuredClone(events),m=bad.find(e=>e.method==='thread/tokenUsage/updated');m.params.tokenUsage.total[key]=-1;expect(()=>parseCodexMultipartEvents(bad.map(e=>JSON.stringify(e)).join('\n'))).toThrow();}
  const expanded=structuredClone(events);expanded.find(e=>e.method==='thread/tokenUsage/updated').params.tokenUsage.modelContextWindow=872000;expect(()=>parseCodexMultipartEvents(expanded.map(e=>JSON.stringify(e)).join('\n'))).toThrow();
 });
});
