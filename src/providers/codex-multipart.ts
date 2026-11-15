import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';

export const CODEX_TEXT_PART_LIMIT=1_048_576;
export const CODEX_MULTIPART_TEXT_LIMIT=1_700_000;
export const CODEX_MULTIPART_HEADER='Consecutive text inputs are exact consecutive fragments of ONE immutable prompt. Concatenate their text verbatim, without inserting separators, before interpreting the packet. No fragment is omitted history.\n';
export function splitCodexText(input:string):string[]{
 if(input.length>CODEX_MULTIPART_TEXT_LIMIT)throw Error('Codex transport character limit exceeded before submission; split the task context.');
 const parts:string[]=[];
 for(let at=0;at<input.length;){let end=Math.min(input.length,at+524288);if(end<input.length&&/[\uD800-\uDBFF]/.test(input[end-1]!))end--;parts.push(input.slice(at,end));at=end;}
 return parts;
}
export type MultipartRequest={input:string;schema:unknown;images:string[];cwd:string;model:string;beforeStart?:(configuration:{model:string;modelProvider:string;reasoningEffort:string;ephemeral:boolean;instructionSourceCount:number;sandboxType:string;mcpServerCount:number})=>void};
type Failure=(code:number|null,jsonl:string,reason:string)=>Error;
const disabledHostNotice=(e:any)=>{const text=e.params?.item?.message??e.params?.error?.message;return typeof text==='string'&&/^Code Mode is unavailable because code-mode host is disabled\./.test(text)&&text.includes('fail closed');};
export const CODEX_MULTIPART_ARGS=['app-server','-c','mcp_servers={}','-c','plugins={}','-c','marketplaces={}','-c','notify=[]','-c','developer_instructions=""','-c','project_doc_max_bytes=0','-c','web_search="disabled"','-c','model_provider="openai"','-c','model_context_window=500000',
 ...['apps','browser_use','computer_use','multi_agent','code_mode_host','shell_tool','skill_search','memories','js_repl'].flatMap(f=>['--disable',f])];

/** One ephemeral thread/turn on the existing CLI login. No API-key route,
 * persistent history, tool dispatch, fallback or synthetic completion events. */
export function executeCodexMultipart(request:MultipartRequest,failure:Failure,spawnProcess:typeof spawn=spawn):Promise<string>{
 const seconds=Number(process.env.HEARTWORD_CODEX_TIMEOUT_SECONDS??600);
 if(!Number.isInteger(seconds)||seconds<60||seconds>1800)return Promise.reject(Error('Codex timeout must be 60..1800 seconds; no process started.'));
 const parts=splitCodexText(request.input);if(!parts.length||parts.some(p=>p.length>CODEX_TEXT_PART_LIMIT))return Promise.reject(Error('Invalid bounded text parts'));
 const newlineCut=request.input.lastIndexOf('\n',request.input.length-2)+1,footerFits=newlineCut>0&&request.input.length-newlineCut<=524288;
 const contextParts=request.input.length>CODEX_TEXT_PART_LIMIT?(footerFits?splitCodexText(request.input.slice(0,newlineCut)):parts.slice(0,-1)):[],turnParts=contextParts.length?(footerFits?[request.input.slice(newlineCut)]:parts.slice(-1)):parts;
 if(turnParts.reduce((n,p)=>n+p.length,0)>CODEX_TEXT_PART_LIMIT||contextParts.join('')+turnParts.join('')!==request.input)return Promise.reject(Error('Bounded context and final turn must preserve the complete prompt exactly.'));
 return new Promise((resolve,reject)=>{
  const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
  const child=spawnProcess(process.env.HEARTWORD_CODEX_BIN||'codex',[...CODEX_MULTIPART_ARGS],{env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']}) as ChildProcessWithoutNullStreams;
  let output='',buffer='',bytes=0,done=false,started=false,completed=false,usage=false,threadId='',turnId='',prepared:any=null,awaitingId=0;const replies=new Set<number>();
  let completionTimer:ReturnType<typeof setTimeout>|undefined;
  const stop=(reason:string)=>{if(done)return;done=true;clearTimeout(timer);if(completionTimer)clearTimeout(completionTimer);child.kill();reject(failure(child.exitCode,output,reason));};
  const timer=setTimeout(()=>stop('Codex request timed out; reconcile its retained submission before retrying.'),seconds*1000);
  const send=(method:string,params?:unknown,id?:number)=>{if(id)awaitingId=id;return child.stdin.write(JSON.stringify({method,...(id?{id}:{}),...(params===undefined?{}:{params})})+'\n');};
  const startTurn=()=>{prepared.injectedTextParts=contextParts.length;prepared.turnTextParts=turnParts.length;request.beforeStart?.(prepared);started=true;send('turn/start',{threadId,input:[...turnParts.map(text=>({type:'text',text})),...request.images.map(path=>({type:'localImage',path}))],model:request.model,effort:'medium',approvalPolicy:'never',serviceTierForTurn:'default',outputSchema:request.schema},4);};
  const endIfComplete=()=>{if(completed&&usage&&replies.has(4)){if(completionTimer)clearTimeout(completionTimer);child.stdin.end();}else if(completed&&!completionTimer)completionTimer=setTimeout(()=>stop('Codex multipart completion has no known usage; retain and reconcile the submission.'),1000);};
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{
   if(done)return;bytes+=Buffer.byteLength(chunk);if(bytes>8*1024*1024){stop('Codex output limit exceeded; reconcile before retrying.');return;}
   buffer+=chunk;let lineEnd:number;
   while((lineEnd=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,lineEnd).trim();buffer=buffer.slice(lineEnd+1);if(!line)continue;
    try{
     const e=JSON.parse(line);
     // Account/initialization replies are checked in memory, never copied into
     // chapter evidence (they can contain personal account details).
     if(e.id!==undefined&&!e.method){if(e.id!==awaitingId||replies.has(e.id)){stop('Codex multipart received an unexpected or repeated RPC response.');return;}replies.add(e.id);awaitingId=0;}
     if(started&&![2,6].includes(e.id)||e.id===3||e.id===7)output+=line+'\n';
     if(e.error){stop('Codex multipart RPC failed; retain and reconcile the submission.');return;}
     if(e.id===1){send('initialized');send('account/read',{refreshToken:false},2);}
     else if(e.id===2){if(e.result?.account?.type!=='chatgpt'){stop('Codex crew requires verified ChatGPT login; API-key billing is not enabled by this route.');return;}
      send('config/read',{includeLayers:false,cwd:request.cwd},6);
     }else if(e.id===6){const config=e.result?.config;if(!config||typeof config!=='object'){stop('Codex multipart configuration inventory is unavailable; no model turn started.');return;}const disabled=(v:any)=>Object.fromEntries(Object.keys(v??{}).map(name=>[name,{enabled:false}]));
      send('thread/start',{model:request.model,modelProvider:'openai',cwd:request.cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',baseInstructions:'',developerInstructions:'',config:{model_reasoning_effort:'medium',project_doc_max_bytes:0,mcp_servers:disabled(config.mcp_servers),plugins:disabled(config.plugins)}},3);
     }else if(e.id===3){const r=e.result;
      if(r?.model!==request.model||r.modelProvider!=='openai'||r.reasoningEffort!=='medium'||r.approvalPolicy!=='never'||r.thread?.ephemeral!==true||r.thread?.turns?.length||r.instructionSources?.length||r.sandbox?.type!=='readOnly'){stop('Codex multipart isolation/model configuration mismatch; no model turn started.');return;}
      threadId=r.thread.id;if(typeof threadId!=='string'||!threadId){stop('Codex multipart thread identity missing.');return;}
      prepared={model:r.model,modelProvider:r.modelProvider,reasoningEffort:r.reasoningEffort,ephemeral:r.thread.ephemeral,instructionSourceCount:r.instructionSources?.length??0,sandboxType:r.sandbox.type,mcpServerCount:0};send('mcpServerStatus/list',{threadId},5);
     }else if(e.id===5){if(!prepared||!Array.isArray(e.result?.data)||e.result.nextCursor||e.result.data.some((s:any)=>(s.runtimeStatus?.type??s.runtimeStatus)!=='disabled'||Object.keys(s.tools??{}).length||s.resources?.length||s.resourceTemplates?.length)){stop('Codex multipart still exposes active MCP capabilities; no model turn started.');return;}if(contextParts.length)send('thread/inject_items',{threadId,items:[{type:'message',role:'user',content:contextParts.map(text=>({type:'input_text',text}))}]},7);else startTurn();
     }else if(e.id===7){if(!prepared||!contextParts.length||!e.result||typeof e.result!=='object'){stop('Codex multipart context injection was not acknowledged; no model turn started.');return;}startTurn();
     }else if(e.id===4){if(e.result?.turn?.status!=='inProgress'){stop('Codex multipart turn was not started.');return;}turnId=e.result.turn.id;}
     if(e.id&&e.method){stop('Codex multipart requested a client tool; no tool was executed.');return;}
     if(e.method==='item/started'||e.method==='item/completed'){if(!['userMessage','agentMessage','reasoning'].includes(e.params?.item?.type)&&!disabledHostNotice(e)){stop('Codex multipart returned an unsupported item; no tool or fallback accepted.');return;}}
     if(e.method==='model/rerouted'){stop('Codex multipart changed the requested model; no fallback accepted.');return;}
     if(e.method==='error'&&!disabledHostNotice(e)){stop('Codex multipart turn failed; retain and reconcile the submission.');return;}
     if(started&&e.method==='thread/tokenUsage/updated'){if(e.params?.threadId!==threadId||turnId&&e.params.turnId!==turnId){stop('Codex multipart usage identity mismatch.');return;}usage=true;}
     if(e.method==='turn/completed'){if(e.params?.threadId!==threadId||turnId&&e.params.turn?.id!==turnId||e.params?.turn?.status!=='completed'){stop('Codex multipart did not complete the requested turn.');return;}completed=true;}
     endIfComplete();
    }catch{stop('Codex multipart protocol or preparation failed; retain and reconcile before retrying.');return;}
   }
  });
  child.stderr.on('data',()=>{});
  child.on('error',()=>stop('Codex executable could not start; no provider fallback was attempted.'));
  child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);if(completionTimer)clearTimeout(completionTimer);if(code===0&&started&&completed&&usage)resolve(output);else reject(failure(code,output,'Codex multipart transport did not finish cleanly; retain and reconcile the submission.'));});
  send('initialize',{clientInfo:{name:'heartword_bounded_review',version:'1.0'},capabilities:{experimentalApi:true}},1);
 });
}

export function parseCodexMultipartEvents(jsonl:string){
 const events=jsonl.split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)),completed=events.filter(e=>e.method==='turn/completed');
 if(completed.length!==1||completed[0].params?.turn?.status!=='completed'||events.some(e=>e.error||e.method==='error'&&!disabledHostNotice(e)||e.method==='model/rerouted'||e.id&&e.method))throw Error('Codex multipart turn failed or was ambiguous; no review or fallback accepted.');
 const {threadId,turn}=completed[0].params;
 const prepared=events.filter(e=>e.id===3&&e.result),begun=events.filter(e=>e.id===4&&e.result);
 if(prepared.length!==1||begun.length!==1||prepared[0].result.thread?.id!==threadId||prepared[0].result.thread?.ephemeral!==true||prepared[0].result.modelProvider!=='openai'||prepared[0].result.reasoningEffort!=='medium'||prepared[0].result.model!=='gpt-6.1-sol'||prepared[0].result.instructionSources?.length||begun[0].result.turn?.id!==turn.id||begun[0].result.turn?.status!=='inProgress')throw Error('Codex multipart completion does not match its isolated runtime and started turn.');
 if(events.some(e=>(e.method==='item/started'||e.method==='item/completed')&&(!['userMessage','agentMessage','reasoning'].includes(e.params?.item?.type)&&!disabledHostNotice(e)||e.params.threadId!==threadId||e.params.turnId!==turn.id)))throw Error('Codex multipart contains unsupported items or mismatched identities.');
 const messages=events.filter(e=>e.method==='item/completed'&&e.params?.item?.type==='agentMessage'),meters=events.filter(e=>e.method==='thread/tokenUsage/updated');
 if(!messages.length||!meters.length||meters.some(e=>e.params.threadId!==threadId||e.params.turnId!==turn.id))throw Error('Codex multipart output or usage is missing/mismatched.');
 const tokenUsage=meters.at(-1).params.tokenUsage,u=tokenUsage?.total;
 for(const key of ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens'])if(!Number.isSafeInteger(u?.[key])||u[key]<0)throw Error('Codex multipart usage is missing or invalid.');
 if(u.cachedInputTokens>u.inputTokens||u.totalTokens!==u.inputTokens+u.outputTokens||u.reasoningOutputTokens>u.outputTokens||!Number.isSafeInteger(tokenUsage.modelContextWindow)||tokenUsage.modelContextWindow<=0||tokenUsage.modelContextWindow>500000)throw Error('Codex multipart usage/context limit is invalid.');
 return{result:JSON.parse(messages.at(-1).params.item.text),usage:{inputTokens:u.inputTokens,cachedInputTokens:u.cachedInputTokens,outputTokens:u.outputTokens,reasoningOutputTokens:u.reasoningOutputTokens},reportedModel:turn.model??null,diagnostics:['codex_app_server_bounded_text_parts']};
}
