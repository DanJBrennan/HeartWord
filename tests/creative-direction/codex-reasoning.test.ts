import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { CODEX_MAX_INPUT_CHARACTERS, CodexExitError, codexInputBudget, codexOutputSchema, generateCodexJson, parseCodexEvents } from "../../src/providers/codex-text.js";
import {CODEX_MULTIPART_HEADER} from '../../src/providers/codex-multipart.js';

const schema = { type: "object", properties: { summary: { type: "string" }, optional: { type: "string" },
  source: { type: "string", nullable: true } }, required: ["summary", "source"] };
const events = (result: unknown, usage: unknown = { input_tokens: 500, cached_input_tokens: 100, output_tokens: 30 }) => [
  { type: "thread.started", thread_id: "fixture" },
  { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(result) } },
  { type: "turn.completed", usage }
].map(e => JSON.stringify(e)).join("\n");

describe("Codex structured reasoning", () => {
  const reconnect={type:'error',message:'Reconnecting... 2/5 (stream disconnected before completion: websocket closed by server before response.completed)'};
  const httpsRecovery={type:'item.completed',item:{type:'error',message:'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: websocket closed by server before response.completed'}};
  it('accepts one genuine completed structured turn after observed transport recovery without resubmission',async()=>{
    const stream=[reconnect,httpsRecovery].map(e=>JSON.stringify(e)).join('\n')+'\n'+events({summary:'Existing completed decision',source:null,optional:null});
    const execute=vi.fn(async(args:string[])=>args[0]==='login'?'Logged in using ChatGPT':stream);
    const response=await generateCodexJson('source',schema,[],{maxSuppliedTextBytes:10000,execute});
    expect(response.result).toEqual({summary:'Existing completed decision',source:null});expect(response.receipt.usage.inputTokens).toBe(500);
    expect(response.receipt.diagnostics).toEqual(['stream_reconnect_notice','https_transport_recovery_notice']);expect(execute).toHaveBeenCalledTimes(2);
  });
  it.each(['unknown','afterCompletion','failedTurn','missingCompletion','missingUsage','malformedJson'])('holds unsafe recovery streams (%s)',kind=>{
    let stream=[reconnect,httpsRecovery].map(e=>JSON.stringify(e)).join('\n')+'\n'+events({});
    if(kind==='unknown')stream=JSON.stringify({type:'error',message:'Unknown failure'})+'\n'+events({});
    if(kind==='afterCompletion')stream=events({})+'\n'+JSON.stringify(reconnect);
    if(kind==='failedTurn')stream+='\n'+JSON.stringify({type:'turn.failed'});
    if(kind==='missingCompletion')stream=JSON.stringify(reconnect)+'\n'+JSON.stringify(httpsRecovery);
    if(kind==='missingUsage')stream=JSON.stringify(reconnect)+'\n'+events({},{});
    if(kind==='malformedJson')stream=stream.replace('"text":"{}"','"text":"not-json"');
    expect(()=>parseCodexEvents(stream)).toThrow();
  });
  it("rejects transport-overlong input even when its byte budget fits, before login", async () => {
    const execute = vi.fn();
    await expect(generateCodexJson("a".repeat(1_700_000), schema, [], { maxSuppliedTextBytes: 2_000_000, execute })).rejects.toThrow("transport character limit");
    expect(execute).not.toHaveBeenCalled();
  });
  it('uses one included multipart execution with the exact budget, image and actual protocol receipt',async()=>{
    const prompt='Complete source instruction '.repeat(42000),media=[{mimeType:'image/png',data:Buffer.from('actual image fixture').toString('base64'),caption:'Pinned canon'}],beforeSubmit=vi.fn(),retainResponse=vi.fn();
    const execute=vi.fn(async(args:string[])=>{expect(args).toEqual(['login','status']);return 'Logged in using ChatGPT';});
    const raw=[{id:3,result:{thread:{id:'t',ephemeral:true},model:'gpt-6.1-sol',modelProvider:'openai',reasoningEffort:'medium',instructionSources:[]}},{id:4,result:{turn:{id:'u',status:'inProgress'}}},{method:'item/completed',params:{threadId:'t',turnId:'u',item:{type:'agentMessage',text:JSON.stringify({summary:'Exact reviewed',source:null,optional:null})}}},{method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{modelContextWindow:500000,total:{inputTokens:300000,cachedInputTokens:0,outputTokens:100,reasoningOutputTokens:50,totalTokens:300100}}}},{method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}}].map(e=>JSON.stringify(e)).join('\n');
    const executeMultipart=vi.fn(async(r:any)=>{expect(r.input.startsWith(CODEX_MULTIPART_HEADER)).toBe(true);expect(r.input.endsWith(prompt)).toBe(true);expect(r.model).toBe('gpt-6.1-sol');expect(await readFile(r.images[0],'utf8')).toBe('actual image fixture');expect(beforeSubmit).not.toHaveBeenCalled();r.beforeStart();return raw;});
    const value=await generateCodexJson(prompt,schema,media,{maxSuppliedTextBytes:1750000,execute,executeMultipart,beforeSubmit,retainResponse});
    expect(beforeSubmit).toHaveBeenCalledTimes(1);expect(beforeSubmit).toHaveBeenCalledWith(codexInputBudget(prompt,schema,media,1750000));expect(retainResponse).toHaveBeenCalledTimes(1);expect(retainResponse).toHaveBeenCalledWith(raw,{succeeded:true,exitCode:0});expect(value.result).toEqual({summary:'Exact reviewed',source:null});expect(value.receipt.usage.inputTokens).toBe(300000);expect(value.receipt.costUsd).toBeNull();expect(value.receipt.inputSha256).toBe(codexInputBudget(prompt,schema,media,1750000).sha256);expect(execute).toHaveBeenCalledTimes(1);expect(executeMultipart).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])('never retries multipart failures or writes an unsubmitted response: submitted=%s',async submitted=>{
    const beforeSubmit=vi.fn(),retainResponse=vi.fn(),execute=vi.fn(async()=> 'Logged in using ChatGPT'),executeMultipart=vi.fn(async(r:any)=>{if(submitted)r.beforeStart();throw new CodexExitError(null,'retained actual partial protocol','Bounded multipart failure');});
    await expect(generateCodexJson('x'.repeat(1100000),schema,[],{maxSuppliedTextBytes:1750000,execute,executeMultipart,beforeSubmit,retainResponse})).rejects.toThrow('Bounded multipart failure');expect(beforeSubmit).toHaveBeenCalledTimes(submitted?1:0);expect(retainResponse).toHaveBeenCalledTimes(submitted?1:0);expect(execute).toHaveBeenCalledTimes(1);expect(executeMultipart).toHaveBeenCalledTimes(1);
  });
  it('never starts the real multipart executable behind an injected legacy test executor',async()=>{
    const execute=vi.fn();await expect(generateCodexJson('x'.repeat(1100000),schema,[],{maxSuppliedTextBytes:1750000,execute})).rejects.toThrow('explicit multipart executor');expect(execute).not.toHaveBeenCalled();
  });
  it("retains a failed process event stream without accepting its result or retrying", async () => {
    const failed = '{"type":"turn.failed","error":{"message":"fixture failure"}}\n';
    const retainResponse = vi.fn();
    const execute = vi.fn(async (args: string[]) => {
      if (args[0] === "login") return "Logged in using ChatGPT";
      throw new CodexExitError(1, failed);
    });
    await expect(generateCodexJson("source", schema, [], { maxSuppliedTextBytes: 10000, execute, retainResponse })).rejects.toThrow("code 1");
    expect(retainResponse).toHaveBeenCalledWith(failed, { succeeded: false, exitCode: 1, reason:expect.stringContaining("code 1") });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("retains timeout output with unknown exit status without accepting or retrying",async()=>{
    const partial='{"type":"thread.started","thread_id":"fixture"}\n',retainResponse=vi.fn();
    const execute=vi.fn(async(args:string[])=>{if(args[0]==="login")return "Logged in using ChatGPT";throw new CodexExitError(null,partial,"Codex request timed out; reconcile its retained submission before retrying.");});
    await expect(generateCodexJson("source",schema,[],{maxSuppliedTextBytes:10000,execute,retainResponse})).rejects.toThrow("timed out");
    expect(retainResponse).toHaveBeenCalledWith(partial,{succeeded:false,exitCode:null,reason:expect.stringContaining("timed out")});
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('forwards fixed transport notice codes into the retained failure receipt',async()=>{
    const retainResponse=vi.fn(),execute=vi.fn(async(args:string[])=>{if(args[0]==='login')return 'Logged in using ChatGPT';throw new CodexExitError(null,'','Codex request timed out; reconcile first.',['stream_reconnect_notice','rate_limit_notice']);});
    await expect(generateCodexJson('source',schema,[],{maxSuppliedTextBytes:10000,execute,retainResponse})).rejects.toThrow('timed out');
    expect(retainResponse).toHaveBeenCalledWith('',{succeeded:false,exitCode:null,reason:'Codex request timed out; reconcile first.',diagnosticCodes:['stream_reconnect_notice','rate_limit_notice']});expect(execute).toHaveBeenCalledTimes(2);
  });
  it("converts nullable/optional fields without mutating the original schema", () => {
    const original = JSON.stringify(schema), strict = codexOutputSchema(schema) as any;
    expect(strict.additionalProperties).toBe(false);
    expect(strict.required).toEqual(["summary", "optional", "source"]);
    expect(strict.properties.source.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
    expect(JSON.stringify(schema)).toBe(original);
  });
  it("uses fresh tool-disabled Sol Medium requests, preserves required nulls and reports allowance usage without inventing dollar prices", async () => {
    let submitted = 0;
    const execute = vi.fn(async (args: string[], input?: string) => {
      if (args[0] === "login") return "Logged in using ChatGPT";
      expect(submitted).toBe(1);
      expect(args).toContain("--ignore-user-config"); expect(args).toContain("--ephemeral");
      expect(args).toContain("gpt-6.1-sol"); expect(args).toContain('model_reasoning_effort="medium"');
      expect(args).toContain("shell_tool"); expect(args).toContain("multi_agent");
      expect(args).not.toContain("resume"); expect(input).toContain("exact source");
      const path = args[args.indexOf("--output-schema") + 1]!;
      expect(JSON.parse(await readFile(path, "utf8")).additionalProperties).toBe(false);
      return events({ summary: "Checked exact source", source: null, optional: null });
    });
    const response = await generateCodexJson("exact source", schema, [], { maxSuppliedTextBytes: 10_000, execute,
      beforeSubmit: budget => { expect(budget.suppliedTextBytes).toBeGreaterThan(0); submitted++; } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(response.result).toEqual({ summary: "Checked exact source", source: null });
    expect(response.receipt.costUsd).toBeNull(); expect(response.receipt.reportedModel).toBeNull();
    expect(response.receipt.usage).toEqual({ inputTokens: 500, cachedInputTokens: 100, outputTokens: 30, reasoningOutputTokens: null });
  });
  it("rejects audio/video before login or provider submission", async () => {
    const execute = vi.fn();
    await expect(generateCodexJson("listen", schema, [{ mimeType: "video/mp4", data: "AA==" }],
      { maxSuppliedTextBytes: 10000, execute })).rejects.toThrow("still images only");
    expect(execute).not.toHaveBeenCalled();
  });
  it("counts the provider wrapper and transformed schema before login, and never truncates", async () => {
    const execute = vi.fn();
    await expect(generateCodexJson("å­—".repeat(1000), schema, [], { maxSuppliedTextBytes: 1000, execute })).rejects.toThrow("before submission");
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not accept API-key authentication or submit after a failed stale-input callback", async () => {
    const execute = vi.fn(async () => "Logged in using an API key");
    await expect(generateCodexJson("source", schema, [], { maxSuppliedTextBytes: 10000, execute })).rejects.toThrow("ChatGPT login");
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockResolvedValue("Logged in using ChatGPT"); execute.mockClear();
    await expect(generateCodexJson("source", schema, [], { maxSuppliedTextBytes: 10000, execute,
      beforeSubmit: () => { throw new Error("stale revision"); } })).rejects.toThrow("stale revision");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("validates completed JSON locally and never retries a malformed response", async () => {
    const execute = vi.fn(async (args: string[]) => args[0] === "login" ? "Logged in using ChatGPT" : events({ summary: 7, optional: null, source: null }));
    await expect(generateCodexJson("source", schema, [], { maxSuppliedTextBytes: 10000, execute })).rejects.toThrow("local JSON Schema");
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("rejects missing/contradictory usage, tools, failures and ambiguous turns", () => {
    expect(() => parseCodexEvents(events({}))).not.toThrow();
    const warning = {type:"item.completed",item:{type:"error",message:"Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable features.code_mode_host."}};
    expect(parseCodexEvents(JSON.stringify(warning)+"\n"+events({})).diagnostics).toHaveLength(1);
    expect(() => parseCodexEvents(events({})+'\n{"type":"item.completed","item":{"type":"error","message":"unknown failure"}}')).toThrow("unsupported item types");
    expect(() => parseCodexEvents(events({}, {}))).toThrow("usage");
    expect(() => parseCodexEvents(events({}, { input_tokens: 1, cached_input_tokens: 2, output_tokens: 1 }))).toThrow("cached input");
    expect(() => parseCodexEvents(events({}) + '\n{"type":"turn.failed"}')).toThrow("failed");
    expect(() => parseCodexEvents(events({}) + '\n{"type":"item.completed","item":{"type":"command_execution"}}')).toThrow("unsupported item types");
    expect(() => parseCodexEvents(events({}) + '\n{"type":"turn.completed"}')).toThrow("unambiguous");
  });
});
