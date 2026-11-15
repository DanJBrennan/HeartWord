import {EventEmitter} from "node:events";
import {spawn} from "node:child_process";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CodexExitError,executeCodex} from "../../src/providers/codex-text.js";

vi.mock("node:child_process",()=>({spawn:vi.fn()}));
let child:EventEmitter & {stdout:EventEmitter;stderr:EventEmitter;stdin:EventEmitter & {end:ReturnType<typeof vi.fn>};kill:ReturnType<typeof vi.fn>;exitCode:null};
beforeEach(()=>{
  vi.useFakeTimers();vi.mocked(spawn).mockReset();
  child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:vi.fn()}),kill:vi.fn(),exitCode:null});
  Object.assign(child.stdout,{setEncoding:vi.fn()});
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});

describe("Codex transport stop evidence",()=>{
  it('filters unsupported or repeated caller-supplied diagnostic codes at the retained error boundary',()=>{
    const error=new CodexExitError(null,'','Bounded failure',['private-secret-fixture','rate_limit_notice','rate_limit_notice']);
    expect(error.diagnosticCodes).toEqual(['rate_limit_notice']);expect(JSON.stringify(error)).not.toContain('private-secret-fixture');
  });
  it('retains only fixed split-chunk transport notices, never arbitrary diagnostic text or secrets',async()=>{
    const result=executeCodex(['exec']).catch(e=>e);
    child.stderr.emit('data',Buffer.from('Authorization: secret-fixture-token\nstream discon'));
    child.stderr.emit('data',Buffer.from('nected; Reconnecting 1/5; HTTP429 error sending request; timed out\nprivate-url-fixture'));
    child.stderr.emit('data',Buffer.from(' HTTP 429 rate_limit_exceeded'));
    child.emit('close',1);const error=await result;
    expect(error).toBeInstanceOf(CodexExitError);
    expect(error.diagnosticCodes).toEqual(expect.arrayContaining(['stream_reconnect_notice','rate_limit_notice','stream_interrupted_notice','transport_timeout_notice','connection_error_notice']));
    expect(new Set(error.diagnosticCodes).size).toBe(error.diagnosticCodes.length);
    expect(JSON.stringify(error)).not.toContain('secret-fixture-token');expect(JSON.stringify(error)).not.toContain('private-url-fixture');
  });
  it('does not infer a diagnostic cause from arbitrary stderr and preserves codes on timeout',async()=>{
    const result=executeCodex(['exec']).catch(e=>e);
    child.stderr.emit('data',Buffer.from('arbitrary private message\n'));child.stderr.emit('data',Buffer.from('stream interrupted'));
    await vi.advanceTimersByTimeAsync(600000);const error=await result;
    expect(error.diagnosticCodes).toEqual(['stream_interrupted_notice']);expect(error.message).toContain('timed out');expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("honors the bounded longer timeout and retains partial stdout on termination",async()=>{
    vi.stubEnv("HEARTWORD_CODEX_TIMEOUT_SECONDS","1200");
    const settled=vi.fn(),result=executeCodex(["exec"],"bounded source").then(v=>({value:v}),error=>({error})).then(v=>{settled();return v;});
    const partial='{"type":"thread.started","thread_id":"fixture"}\n';child.stdout.emit("data",partial);
    await vi.advanceTimersByTimeAsync(600000);expect(settled).not.toHaveBeenCalled();expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600000);const response=await result;
    expect(response).toMatchObject({error:expect.any(CodexExitError)});
    if(!("error" in response))throw Error("Expected retained timeout");
    expect(response.error).toMatchObject({exitCode:null,jsonl:partial,message:expect.stringContaining("timed out")});
    expect(child.kill).toHaveBeenCalledTimes(1);expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("rejects out-of-range timeouts before creating a child",async()=>{
    for(const value of ["0","59","1801","NaN","60.5"]){vi.stubEnv("HEARTWORD_CODEX_TIMEOUT_SECONDS",value);await expect(executeCodex(["exec"])).rejects.toThrow("no process started");}
    expect(spawn).not.toHaveBeenCalled();
  });
  it("retains bounded stdout when output exceeds its ceiling without retrying",async()=>{
    const result=executeCodex(["exec"]).catch(error=>error);
    child.stdout.emit("data","a".repeat(8*1024*1024));child.stdout.emit("data","overflow");
    const error=await result;expect(error).toBeInstanceOf(CodexExitError);expect(error.jsonl).toHaveLength(8*1024*1024);expect(error.message).toContain("output limit");expect(child.kill).toHaveBeenCalledTimes(1);expect(spawn).toHaveBeenCalledTimes(1);
  });
});
