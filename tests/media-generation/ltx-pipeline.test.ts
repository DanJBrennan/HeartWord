import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateNonSpeakingVideoCandidate } from "../../src/pipeline/media-generation/final-video.js";
import { generateSelectedFinalVideo } from "../../src/pipeline/media-generation/select-final-video.js";
import { createVideoProviders, videoBackend, type VideoProviders } from "../../src/providers/video-selection.js";
import { LtxVideoProvider } from "../../src/providers/ltx/index.js";
import { productionRouter } from "../../src/server/routes/production.js";
import type { VideoGenerationOptions } from "../../src/providers/types.js";
import { generateJsonWithImagesMetered } from "../../src/providers/gemini-text.js";
vi.mock("../../src/pipeline/creative-direction/crew-store.js",async original=>({...await original<object>(),...(await import("../helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture}));

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root: string, server: ReturnType<express.Express["listen"]> | undefined;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db,getDataDir:()=>root}));
vi.mock("../../src/pipeline/qc/video-review.js",()=>({reviewGeneratedVideo:vi.fn(async()=>({verdict:{confidence:100,reason:"synthetic fixture"},costUsd:0})),videoReviewPassed:vi.fn(()=>true)}));
vi.mock("../../src/providers/gemini-text.js",async importOriginal=>({...await importOriginal<typeof import("../../src/providers/gemini-text.js")>(),generateJsonWithImagesMetered:vi.fn()}));
beforeEach(()=>{
  root = mkdtempSync(join(tmpdir(),"hw-ltx-pipeline-")); mkdirSync(join(root,"assets"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',4,1,1); INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 4:1','Mark 4:1',1); INSERT INTO shots (id,scene_id,sequence,action,created_at) VALUES ('shot','s',1,'empty landscape',1); INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('key','shot','mock','mock','generate','accepted','key.png',0,1)");
});
afterEach(async()=>{ if(server) await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;db.close();rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs(); });
const result = {status:"accepted" as const,media:{path:"generated/video/ltx.mp4"},cost:{usd:0},provenance:{provider:"ltx_local",model:"ltx-2.5-fast",prompt:"synthetic request"},metadata:{seed:42,remoteOutputPath:"/Mac/outputs/take.mp4",elapsedMs:240000}};
function providers(): VideoProviders {
  return {primaryBackend:"ltx",ltx:{generateFinal:vi.fn(async(_request,opts:VideoGenerationOptions|undefined)=>{
    opts?.onProgress?.({phase:"submitted",percentage:null,currentStep:null,totalSteps:null});
    opts?.onProgress?.({phase:"inference",percentage:50,currentStep:4,totalSteps:8});
    return result;
  })},veo:{generateFinal:vi.fn(async()=>result)},kling:{generateFinal:vi.fn(async()=>result)},draft:{generateDraft:vi.fn(async()=>result),generateGuided:vi.fn(async()=>result)}};
}
it("defaults to LTX while keeping both cloud providers selectable",()=>{
  vi.stubEnv("HEARTWORD_VIDEO_PROVIDER",undefined);
  expect(videoBackend()).toBe("ltx");
  expect(createVideoProviders().ltx).toBeInstanceOf(LtxVideoProvider);
  expect(createVideoProviders("veo").primaryBackend).toBe("veo");
  expect(createVideoProviders("kling").primaryBackend).toBe("kling");
  expect(()=>createVideoProviders("unknown")).toThrow();
});
it("retains a real pipeline candidate, metadata, zero generation cost, and exposes API progress in the production monitor",async()=>{
  const deps=providers();
  const candidate=await generateNonSpeakingVideoCandidate(db,"p","shot",deps);
  expect(candidate).toMatchObject({status:"candidate",reviewPassed:true});
  expect(db.prepare("SELECT provider,model,status,cost_usd FROM generation_attempts WHERE operation='generate_final_video'").get()).toMatchObject({provider:"ltx_local",model:"ltx-2.5-fast",status:"hold_for_review",cost_usd:0});
  expect(db.prepare("SELECT status,metadata_json FROM video_generation_jobs").get()).toMatchObject({status:"completed",metadata_json:expect.stringContaining('"seed":42')});
  expect(readFileSync(join(root,"logs","media-generation-p.log"),"utf8")).toContain('"currentStep":4');
  expect(deps.veo.generateFinal).not.toHaveBeenCalled();expect(deps.kling.generateFinal).not.toHaveBeenCalled();
  expect((await generateNonSpeakingVideoCandidate(db,"p","shot",deps)).status).toBe("held");
  expect(deps.ltx!.generateFinal).toHaveBeenCalledTimes(1);
  const app=express();app.use("/api/projects/:projectId/production",productionRouter);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/projects/p/production/monitor`);
  expect(await response.json()).toMatchObject({events:expect.arrayContaining([expect.objectContaining({kind:"video_generation",summary:"ltx: inference 50%; step 4/8",progress:{phase:"inference",percentage:50,currentStep:4,totalSteps:8}})])});
});
it("does not call paid fallback or resubmit when an LTX response is uncertain",async()=>{
  const deps=providers();
  vi.mocked(deps.ltx!.generateFinal).mockImplementationOnce(async(_request,opts)=>{opts?.onProgress?.({phase:"submitted",percentage:null,currentStep:null,totalSteps:null});throw new Error("Response lost; submission uncertain");});
  await expect(generateNonSpeakingVideoCandidate(db,"p","shot",deps)).rejects.toThrow("uncertain");
  expect((await generateNonSpeakingVideoCandidate(db,"p","shot",deps)).status).toBe("held");
  expect(deps.ltx!.generateFinal).toHaveBeenCalledTimes(1);expect(deps.veo.generateFinal).not.toHaveBeenCalled();
});
it.each([false,true])("routes native ambience through listening review while retaining the video candidate (speech=%s)",async speechDetected=>{
  const wave=Buffer.alloc(44+48000);
  wave.write("RIFF",0);wave.writeUInt32LE(wave.length-8,4);wave.write("WAVEfmt ",8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(24000,24);wave.writeUInt32LE(48000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write("data",36);wave.writeUInt32LE(48000,40);
  const audioPath="ambience.wav";writeFileSync(join(root,"assets",audioPath),wave);
  vi.mocked(generateJsonWithImagesMetered).mockResolvedValueOnce({result:{matchesBrief:true,speechDetected,intelligibleSpeech:false,technicalPass:true,confidence:95,reason:speechDetected ? "Gibberish voices detected" : "Environmental sound only"},costUsd:0.002,usage:{promptTokenCount:1,candidatesTokenCount:1,thoughtsTokenCount:0,totalTokenCount:2}});
  const deps=providers();vi.mocked(deps.ltx!.generateFinal).mockResolvedValueOnce({...result,ambientAudio:{path:audioPath}});
  const candidate=await generateNonSpeakingVideoCandidate(db,"p","shot",deps);
  expect(candidate).toMatchObject({status:"candidate",reviewPassed:true});
  expect(db.prepare("SELECT status,metadata_json,progress_json FROM video_generation_jobs").get()).toMatchObject({status:"completed",metadata_json:expect.stringContaining(`\"status\":\"${speechDetected ? "held" : "accepted"}\"`),progress_json:expect.stringContaining(`ambience_${speechDetected ? "held" : "accepted"}`)});
  expect(db.prepare("SELECT COUNT(*) AS n FROM production_audio_assets").get()!.n).toBe(speechDetected ? 0 : 1);
  expect(readFileSync(join(root,"logs","media-generation-p.log"),"utf8")).toContain("reviewing_ambience");
  expect(db.prepare("SELECT amount_usd FROM cost_ledger_entries WHERE amount_usd > 0").get()!.amount_usd).toBe(0.002);
});
it("lets a fixed preflight failure retry without submitting another generation",async()=>{
  const deps=providers();vi.mocked(deps.ltx!.generateFinal).mockRejectedValueOnce(new Error("LTX_TOKEN is missing"));
  await expect(generateNonSpeakingVideoCandidate(db,"p","shot",deps)).rejects.toThrow("LTX_TOKEN");
  expect((await generateNonSpeakingVideoCandidate(db,"p","shot",deps)).status).toBe("candidate");
});
it("keeps explicit Veo and Kling comparison calls on their existing adapters",async()=>{
  const deps=providers(), request={shotId:"shot",prompt:"test",characters:[]};
  deps.primaryBackend="veo";expect((await generateSelectedFinalVideo(deps,request,{})).tier).toBe("veo");
  deps.primaryBackend="kling";expect((await generateSelectedFinalVideo(deps,request,{})).tier).toBe("kling_scene");
  expect(deps.ltx!.generateFinal).not.toHaveBeenCalled();
});
it("still requires the existing approved draft for a canon-critical LTX shot",async()=>{
  db.exec("UPDATE shots SET crowd_density='packed',camera_movement='tracking' WHERE id='shot'");
  const deps=providers();
  expect((await generateNonSpeakingVideoCandidate(db,"p","shot",deps)).status).toBe("needs_draft");
  expect(deps.ltx!.generateFinal).not.toHaveBeenCalled();
});
