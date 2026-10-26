import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LtxVideoProvider, LTX_AMBIENT_DIRECTION, LTX_MAX_PROMPT_CHARACTERS, ltxProgress, validateLtxOptions } from "../../src/providers/ltx/index.js";
import { parseBackendPort, shellQuote, type LtxTransport } from "../../src/providers/ltx/transport.js";
import { ltxJson } from "../../src/providers/ltx/http.js";
import { GeminiVideoProvider } from "../../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../../src/providers/kling/index.js";

const token = "synthetic-session-secret";
let root: string, server: Server | undefined;
let baseUrl: string;
let health: Record<string, unknown>;
let healthCode: number, generateCode: number, generationStatus: string;
let requests: Array<{ path: string; auth?: string; body?: any }>;
let pollCount: number, pollFailure: boolean, delayed: boolean, disconnect: boolean, generating: boolean;
let dropHealthAfterAuthorization: boolean;
let transport: LtxTransport & { remote: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; download: ReturnType<typeof vi.fn> };
let videoFixture: Buffer, audioVideoFixture: Buffer;

beforeAll(() => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "hw-ltx-video-fixtures-"));
  try {
    const silent = join(fixtureRoot, "silent.mp4"), voiced = join(fixtureRoot, "voiced.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=blue:s=32x32:r=24:d=0.25", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent], { stdio: "ignore", windowsHide: true });
    execFileSync("ffmpeg", ["-v", "error", "-i", silent, "-f", "lavfi", "-i", "sine=frequency=440:duration=0.25", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", voiced], { stdio: "ignore", windowsHide: true });
    videoFixture = readFileSync(silent); audioVideoFixture = readFileSync(voiced);
  } finally { rmSync(fixtureRoot, { recursive: true, force: true }); }
});

beforeEach(async () => {
  vi.stubEnv("LTX_TOKEN", token);
  vi.stubEnv("LTX_INBOX_DIR", "");
  root = mkdtempSync(join(tmpdir(), "hw-ltx-"));
  mkdirSync(join(root,"assets"));
  writeFileSync(join(root,"assets","key frame.png"),"synthetic keyframe");
  health = {status:"ok",models_loaded:true,active_model:"fast"};
  healthCode = generateCode = 200; generationStatus = "complete";
  pollCount = 0; requests = []; pollFailure = delayed = disconnect = generating = dropHealthAfterAuthorization = false;
  server = createServer(async (req,res) => {
    let content = "";
    for await (const chunk of req) content += chunk;
    requests.push({path:req.url!,auth:req.headers.authorization,body:content ? JSON.parse(content) : undefined});
    if (req.url === "/health") {
      if (dropHealthAfterAuthorization) { req.socket.destroy(); return; }
      res.writeHead(healthCode); res.end(JSON.stringify(health));
    }
    else if (req.url === "/api/generation/progress") {
      pollCount++;
      if (pollFailure && pollCount > 1) { res.writeHead(503); res.end("progress temporarily unavailable"); }
      else res.end(JSON.stringify({status:generating ? "running":"idle",phase:"inference",progress:37,currentStep:3,totalSteps:8}));
    } else if (req.url === "/api/generate") {
      if (disconnect) { req.socket.destroy(); return; }
      generating = true;
      if (delayed) await new Promise(resolve=>setTimeout(resolve,100));
      generating = false;
      res.writeHead(generateCode);
      res.end(JSON.stringify(generateCode === 200 ? {status:generationStatus,video_path:"/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/clip.mp4"} : {error:`backend echoed ${token}`}));
    } else { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  transport = {connect:vi.fn(async()=>baseUrl),reset:vi.fn(),remote:vi.fn(async(command:string)=>command.includes('printf "%s" "$HOME"') ? "/Users/danieljbrennan" : command.includes("tail -80") ? "Pipeline load: 2.1s" : ""),upload:vi.fn(async()=>{}),download:vi.fn(async(_remote:string,local:string)=>{writeFileSync(local,videoFixture);})};
});
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve=>server!.close(()=>resolve())); }
  rmSync(root,{recursive:true,force:true});
  vi.unstubAllEnvs();
});
const request = {shotId:"mark4-scene1-shot2",prompt:"Preserve the approved character, wardrobe and scene. Natural movement.",characters:[]};
function provider() { return new LtxVideoProvider({transport,dataDir:root,sleep:async()=>{await new Promise(resolve=>setTimeout(resolve,5));}}); }
const options = {startFrame:{path:"key frame.png"},durationSeconds:5,seed:42};

describe("LTX Desktop adapter", () => {
  it("holds an oversized prompt before SSH, upload or generation, including mandatory audio rules",async()=>{
    const length=LTX_MAX_PROMPT_CHARACTERS-LTX_AMBIENT_DIRECTION.length-2;
    await expect(provider().generateFinal({...request,prompt:"x".repeat(length+1)},options)).rejects.toThrow("text-encoding limit");
    expect(transport.connect).not.toHaveBeenCalled();expect(transport.upload).not.toHaveBeenCalled();expect(requests).toHaveLength(0);
  });
  it("holds changed input bytes after upload and does not silently drop ending frames on cloud adapters",async()=>{
    transport.upload.mockImplementationOnce(async()=>writeFileSync(join(root,"assets","key frame.png"),"changed during transfer"));
    await expect(provider().generateFinal(request,options)).rejects.toThrow("changed during upload");
    expect(requests.filter(r=>r.path==="/api/generate")).toHaveLength(0);
    for(const cloud of [new GeminiVideoProvider(),new KlingVideoProvider()])await expect(cloud.generateFinal(request,{...options,endFrame:{path:"ending.png"}})).rejects.toThrow("ending-frame control");
  });
  it("passes a second composed image as the ending frame and retains both inputs after an uncertain submission",async()=>{
    writeFileSync(join(root,"assets","ending.png"),"synthetic ending composition");
    disconnect=true;
    await expect(provider().generateFinal(request,{...options,endFrame:{path:"ending.png"}})).rejects.toThrow("Submission may still be running");
    expect(transport.upload).toHaveBeenCalledTimes(2);
    const body=requests.find(r=>r.path==="/api/generate")!.body;
    expect(body.lastImagePath).toMatch(/-end\.png$/);
    expect(body.imagePath).not.toBe(body.lastImagePath);
    expect(body.keyframes).toEqual([]);
    expect(transport.remote.mock.calls.some(([c])=>c.startsWith("rm -f"))).toBe(false);
  });
  it("rejects a missing ending image before SSH and checks freshness after the second upload",async()=>{
    await expect(provider().generateFinal(request,{...options,endFrame:{path:"absent.png"}})).rejects.toThrow("ending keyframe");
    expect(transport.connect).not.toHaveBeenCalled();
    writeFileSync(join(root,"assets","ending.png"),"synthetic ending composition");
    let uploads=0;transport.upload.mockImplementation(async()=>{uploads++;});
    await expect(provider().generateFinal({...request,authorizeSubmission:()=>{if(uploads===2)throw new Error("stale after both uploads");}},{...options,endFrame:{path:"ending.png"}})).rejects.toThrow("stale after both uploads");
    expect(requests.filter(r=>r.path==="/api/generate")).toHaveLength(0);
    expect(transport.remote.mock.calls.filter(([c])=>c.startsWith("rm -f"))).toHaveLength(2);
  });
  it("records the ending image and cleans both uploads after definitive completion",async()=>{
    writeFileSync(join(root,"assets","ending.png"),"synthetic ending composition");
    const result=await provider().generateFinal(request,{...options,endFrame:{path:"ending.png"}});
    expect(result.metadata).toMatchObject({sourceEndKeyframe:"ending.png",request:{lastImagePath:expect.stringMatching(/-end\.png$/)}});
    expect(transport.remote.mock.calls.filter(([c])=>c.startsWith("rm -f"))).toHaveLength(2);
  });
  it("rechecks revision authority after upload and before the actual generation POST",async()=>{
    let stale=false;transport.upload.mockImplementationOnce(async()=>{stale=true;});
    await expect(provider().generateFinal({...request,authorizeSubmission:()=>{if(stale)throw new Error("Production revision became stale");}},options)).rejects.toThrow("revision became stale");
    expect(requests.filter(r=>r.path==="/api/generate")).toHaveLength(0);
  });
  it("reconnects a tunnel that closes during the production revision check before submitting once",async()=>{
    transport.reset.mockImplementation(()=>{dropHealthAfterAuthorization=false;});
    const result=await provider().generateFinal({...request,authorizeSubmission:()=>{dropHealthAfterAuthorization=true;}},options);
    expect(result.status).toBe("accepted");
    expect(transport.reset).toHaveBeenCalledTimes(1);
    expect(requests.filter(r=>r.path==="/api/generate")).toHaveLength(1);
  });
  it("retries only the completed file transfer after a transient SCP failure",async()=>{
    transport.download.mockRejectedValueOnce(new Error("SCP transport closed"));
    const result=await provider().generateFinal(request,options);
    expect(result.status).toBe("accepted");
    expect(transport.download).toHaveBeenCalledTimes(2);
    expect(requests.filter(r=>r.path==="/api/generate")).toHaveLength(1);
  });
  it("uploads a unique keyframe, authenticates every request, returns the exact MP4 and retains metadata",async()=>{
    delayed = true;
    const output = join(root,"assets","generated","scene","shot.mp4"), progress = vi.fn();
    const result = await provider().generateFinal(request,{...options,outputPath:output,onProgress:progress});
    expect(result).toMatchObject({media:{path:"generated/scene/shot.mp4"},cost:{usd:0},provenance:{provider:"ltx_local",model:"ltx-2.5-fast"}});
    expect(readFileSync(output)).toEqual(videoFixture);
    expect(transport.upload).toHaveBeenCalledWith(join(root,"assets","key frame.png"),expect.stringMatching(/\/LTX-Inbox\/heartword-[a-f0-9-]+\.png$/));
    const body = requests.find(r=>r.path === "/api/generate")!.body;
    expect(body).toMatchObject({prompt:`${request.prompt}\n\n${LTX_AMBIENT_DIRECTION}`,resolution:"720p",model:"fast",duration:5,fps:24,audio:true,aspectRatio:"16:9",seed:42,cameraMotion:"none",keyframes:[],lastImagePath:null,audioPath:null,loras:[]});
    expect(body.negativePrompt).toContain("speech, dialogue, narration");
    expect(result.ambientAudio).toBeUndefined(); // Desktop returned a silent fixture.
    expect(requests.every(r=>r.auth === `Bearer ${token}`)).toBe(true);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({phase:"inference",percentage:37,currentStep:3,totalSteps:8}));
    const metadata = readFileSync(`${output}.json`,"utf8");
    expect(metadata).not.toContain(token);
    expect(JSON.parse(metadata)).toMatchObject({status:"complete",seed:42,sourceKeyframe:"key frame.png",localOutputPath:output,remoteOutputPath:expect.stringContaining("Application Support"),elapsedMs:expect.any(Number)});
    expect(transport.remote.mock.calls.some(([c])=>c.startsWith("rm -f") && c.includes(".png"))).toBe(true);
  });
  it("retains native ambience separately for review without changing the original MP4", async () => {
    transport.download.mockImplementationOnce(async (_remote: string, local: string) => writeFileSync(local, audioVideoFixture));
    const result = await provider().generateFinal(request, options);
    expect(readFileSync(join(root,"assets",result.media!.path))).toEqual(audioVideoFixture);
    expect(result.ambientAudio!.path).toBe(`${result.media!.path}.ambience.wav`);
    const ambient = join(root,"assets",result.ambientAudio!.path);
    const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", ambient], { encoding: "utf8" })).streams;
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({codec_type:"audio",codec_name:"pcm_s16le"});
    expect(Number(streams[0].duration)).toBeGreaterThan(0.2);
    expect(result.metadata).toMatchObject({audioMode:"ambient",ambientAudio:{path:result.ambientAudio!.path,status:"needs_review"},output:{audio:true,backendAudioIncluded:true,audioRemoved:false}});
    expect(requests.find(request=>request.path === "/api/generate")!.body.audio).toBe(true);
  });
  it("removes unexpected Desktop audio for an explicitly silent request while preserving every encoded picture frame", async () => {
    transport.download.mockImplementationOnce(async (_remote: string, local: string) => writeFileSync(local, audioVideoFixture));
    const result = await provider().generateFinal(request, {...options,audioMode:"none"});
    const output = join(root, "assets", result.media!.path), original = join(root, "assets", "backend-original.mp4");
    writeFileSync(original, audioVideoFixture);
    const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { encoding: "utf8" })).streams;
    expect(streams.map((stream: { codec_type: string }) => stream.codec_type)).toEqual(["video"]);
    const picture = (path: string) => execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:v:0", "-c:v", "copy", "-f", "h264", "pipe:1"]);
    expect(picture(output)).toEqual(picture(original));
    expect(result.metadata).toMatchObject({ output: { width: 32, height: 32, frameRate: "24/1", frames: 6, audio: false, backendAudioIncluded: true, audioRemoved: true } });
    expect(result.ambientAudio).toBeUndefined();
    expect(requests.find(request=>request.path === "/api/generate")!.body.audio).toBe(false);
    expect(requests.filter(request => request.path === "/api/generate")).toHaveLength(1);
  });
  it("rejects a nonempty corrupt download and retains the recoverable Mac output path", async () => {
    transport.download.mockImplementationOnce(async (_remote: string, local: string) => writeFileSync(local, "corrupt mp4"));
    const output = join(root, "assets", "corrupt.mp4");
    await expect(provider().generateFinal(request, { ...options, outputPath: output })).rejects.toThrow("could not be validated");
    expect(existsSync(output)).toBe(false);
    expect(JSON.parse(readFileSync(`${output}.json`, "utf8"))).toMatchObject({ status: "failed", remoteOutputPath: expect.stringContaining("outputs/clip.mp4") });
  });
  it("uses distinct immutable paths for repeated shots",async()=>{
    const first = await provider().generateFinal(request,options);
    const second = await provider().generateFinal(request,options);
    expect(first.media!.path).not.toBe(second.media!.path);
    expect(transport.upload.mock.calls[0]![1]).not.toBe(transport.upload.mock.calls[1]![1]);
  });
  it("validates duration/FPS and missing token before contacting SSH",()=>{
    expect(()=>provider().generateFinal(request,{...options,durationSeconds:7})).toThrow("Unsupported LTX");
    expect(()=>provider().generateFinal(request,{...options,fps:25})).toThrow("24 fps");
    expect(()=>provider().generateFinal(request,{...options,audioMode:"speech" as never})).toThrow("audioMode");
    vi.stubEnv("LTX_TOKEN","");
    expect(()=>provider().generateFinal(request,options)).toThrow("LTX_TOKEN");
    expect(transport.connect).not.toHaveBeenCalled();
  });
  it.each([{status:"ok",models_loaded:false,active_model:"fast"},{status:"ok",models_loaded:true,active_model:"pro"}])("holds when Desktop/model is not ready: %o",async value=>{
    health = value;
    await expect(provider().generateFinal(request,options)).rejects.toThrow("not ready");
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("allows Desktop to load a downloaded Fast model lazily on the first bounded generation",async()=>{
    health={status:"ok",models_loaded:false,active_model:null,
      models_status:[{id:"fast",downloaded:true,loaded:false}]};
    const result=await provider().generateFinal(request,options);
    expect(result.media?.path).toBeTruthy();
    expect(requests.filter(item=>item.path==="/api/generate")).toHaveLength(1);
    health={status:"ok",models_loaded:false,active_model:null,
      models_status:[{id:"fast",downloaded:false,loaded:false}]};
    await expect(provider().generateFinal(request,options)).rejects.toThrow("not ready");
  });
  it("reports rejected session authentication without leaking the token",async()=>{
    healthCode = 401;
    await expect(provider().generateFinal(request,options)).rejects.toThrow("LTX_TOKEN was rejected");
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("retains the Mac output when SCP fails and never reports local success",async()=>{
    transport.download.mockRejectedValueOnce(new Error("SCP failed")).mockRejectedValueOnce(new Error("SCP failed"));
    await expect(provider().generateFinal(request,options)).rejects.toThrow("SCP failed");
    expect(requests.filter(r=>r.path === "/api/generate")).toHaveLength(1);
    expect(transport.download).toHaveBeenCalledTimes(2);
  });
  it("rejects an empty downloaded file",async()=>{
    transport.download.mockImplementationOnce(async(_remote:string,local:string)=>writeFileSync(local,""));
    await expect(provider().generateFinal(request,options)).rejects.toThrow("nonempty local MP4");
  });
  it("keeps polling failures secondary and uses log diagnostics only after the endpoint fails",async()=>{
    delayed = true; pollFailure = true;
    const progress = vi.fn();
    await expect(provider().generateFinal(request,{...options,onProgress:progress})).resolves.toMatchObject({status:"accepted"});
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({phase:"progress_unavailable",diagnostic:"Pipeline load: 2.1s"}));
    expect(transport.remote.mock.calls.some(([c])=>c.includes("tail -80"))).toBe(true);
  });
  it("does not tail logs while authenticated progress works",async()=>{
    delayed = true;
    await provider().generateFinal(request,options);
    expect(transport.remote.mock.calls.some(([c])=>c.includes("tail -80"))).toBe(false);
  });
  it("does not resubmit a lost synchronous response; retains input and lease for recovery",async()=>{
    disconnect = true;
    await expect(provider().generateFinal(request,options)).rejects.toThrow("Submission may still be running");
    expect(requests.filter(r=>r.path === "/api/generate")).toHaveLength(1);
    expect(transport.remote.mock.calls.some(([c])=>c.startsWith("rm -f") || c.includes("rmdir"))).toBe(false);
  });
  it("serializes concurrent calls against Desktop's single progress slot",async()=>{
    delayed = true;
    let active = 0, maxActive = 0;
    transport.upload.mockImplementation(async()=>{active++;maxActive=Math.max(maxActive,active);});
    transport.download.mockImplementation(async(_r:string,local:string)=>{writeFileSync(local,videoFixture);active--;});
    await Promise.all([provider().generateFinal(request,options),provider().generateFinal(request,options)]);
    expect(maxActive).toBe(1);
  });
  it("redacts provider error bodies from exceptions and retained metadata",async()=>{
    generateCode = 500;
    await expect(provider().generateFinal(request,options)).rejects.toThrow("[redacted]");
    // A concrete backend HTTP error is final, so temporary inputs can be cleaned.
    expect(transport.remote.mock.calls.some(([c])=>c.startsWith("rm -f"))).toBe(true);
  });
  it("refuses overwriting retained output or escaping the asset area",async()=>{
    const output = join(root,"assets","existing.mp4"); writeFileSync(output,"retained");
    await expect(provider().generateFinal(request,{...options,outputPath:output})).rejects.toThrow("already exists");
    await expect(provider().generateFinal(request,{...options,outputPath:join(root,"outside.mp4")})).rejects.toThrow("within HeartWordData/assets");
    expect(existsSync(output)).toBe(true);
  });
  it("honors request timeouts and rejects non-loopback API destinations",async()=>{
    delayed = true;
    await expect(ltxJson(baseUrl,"/api/generate",token,10,{prompt:"test"})).rejects.toThrow("timed out");
    await expect(ltxJson("http://192.168.77.2:8000","/health",token,10)).rejects.toThrow("loopback");
  });
});
describe("LTX supported settings and port discovery",()=>{
  it("accepts exactly the proven local Fast combinations",()=>{
    for (const duration of [5,6,8,10,20]) expect(()=>validateLtxOptions("540p",duration,24)).not.toThrow();
    for (const duration of [5,6,8,10]) expect(()=>validateLtxOptions("720p",duration,24)).not.toThrow();
    expect(()=>validateLtxOptions("1080p",5,24)).not.toThrow();
    for (const [resolution,duration] of [["720p",20],["1080p",8],["360p",5],["constructor",5]] as const) expect(()=>validateLtxOptions(resolution,duration,24)).toThrow("Unsupported LTX");
  });
  it("discovers arbitrary session ports and rejects invalid/non-loopback discoveries",()=>{
    expect(parseBackendPort("Server running on http://127.0.0.1:41234")).toBe(41234);
    expect(parseBackendPort("Server running on http://127.0.0.1:51234")).toBe(51234);
    expect(()=>parseBackendPort("Server running on http://0.0.0.0:5000")).toThrow();
    expect(()=>parseBackendPort("Server running on http://127.0.0.1:99999")).toThrow();
    expect(shellQuote("/tmp/one's image.png")).toBe("'/tmp/one'\\''s image.png'");
  });
  it("uses the API's real percentage and step fields",()=>{
    expect(ltxProgress({phase:"loading_model",progress:5,currentStep:0,totalSteps:8})).toMatchObject({phase:"loading_model",percentage:5,currentStep:0,totalSteps:8});
    expect(()=>ltxProgress({phase:"unknown"})).toThrow();
  });
});
