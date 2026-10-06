import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeAmbiencePassed, registerVideoAmbience, reviewNativeAmbience, type NativeAmbienceReview } from "../../src/pipeline/assembly/soundtrack.js";
import { generateJsonWithImagesMetered } from "../../src/providers/gemini-text.js";
import { finishingRecipe } from "../../src/pipeline/assembly/finishing.js";
import type { CrewBrief, CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
import type { GenerationResult } from "../../src/providers/types.js";

vi.mock("../../src/providers/gemini-text.js",()=>({GEMINI_TEXT_MODEL:"test-listening-model",generateJsonWithImages:vi.fn(),generateJsonWithImagesMetered:vi.fn()}));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root: string;
const accepted: NativeAmbienceReview = {matchesBrief:true,speechDetected:false,intelligibleSpeech:false,technicalPass:true,confidence:95,reason:"Only water and wind, with no voices or music."};
const generated: GenerationResult = {status:"accepted",media:{path:"generated/video/take.mp4"},ambientAudio:{path:"generated/video/take.mp4.ambience.wav"},cost:{usd:0},provenance:{provider:"ltx_local",model:"ltx-2.5-fast",prompt:"A quiet shore with natural water and wind; no speaking people."}};
const review = () => vi.fn(async()=>({verdict:{...accepted},costUsd:0.001}));
const options = () => ({dataDir:root,duration:()=>4000});
const assets = () => db.prepare("SELECT id,kind,description,path,sha256,duration_ms AS durationMs FROM production_audio_assets").all() as unknown as CrewBrief["audioAssets"];

beforeEach(()=>{
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(),"hw-native-ambience-"));
  mkdirSync(join(root,"assets","generated","video"),{recursive:true});
  writeFileSync(join(root,"assets",generated.ambientAudio!.path),"retained native-audio fixture");
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',4,1,1),('other','hatam','mark',2,1,1); INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 4:1','Mark 4:1',1); INSERT INTO shots (id,scene_id,sequence,action,created_at) VALUES ('shot','s',1,'quiet shore',1); INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('take','shot','ltx_local','ltx-2.5-fast','generate_final_video','hold_for_review','generated/video/take.mp4',0,1)");
});
afterEach(()=>{db.close();rmSync(root,{recursive:true,force:true});});

function finishingPlan(assetId: string) {
  const brief: CrewBrief = {project:{id:"p",language:"hatam",book:"mark",chapter:4},source:{text:[],reference:[],hashes:["source"]},
    audio:[{id:"source",startMs:0,endMs:4000,path:"source.wav",speakerId:null,verseRef:"Mark 4:1",confidence:95}],canon:[],producerNotes:[],spentUsd:0,audioAssets:assets(),
    shots:[{id:"shot",sceneId:"s",sceneSequence:1,sequence:1,verseRef:"Mark 4:1",action:"quiet shore",framing:"wide",cameraMovement:"static",continuity:null,lighting:"daylight",needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:{id:"clip",path:generated.media!.path,durationMs:4000}}],
    render:{id:"render",path:"source-cut.mp4",sha256:"source-cut",durationMs:4000,timeline:[{shotId:"shot",startMs:0,endMs:4000}],audioMap:[{segmentId:"source",sourceStartMs:0,sourceEndMs:4000,startMs:0,endMs:4000}]}};
  const result: CrewResult = {status:"approved",summary:"Reviewed shore ambience beneath the source voice",calls:7,contributions:{
    colorist:{summary:"Reviewed picture",findings:[],directions:[],colorAdjustments:[]},composer:{summary:"No score requested",findings:[],directions:[],audioCues:[],generationRequests:[]},
    sound_designer:{summary:"Use the approved water bed",findings:[],directions:[],generationRequests:[],audioCues:[{assetId,startMs:0,endMs:4000,sourceStartMs:0,gainDb:-26,reason:"Quiet environmental bed beneath the approved voice"}]}}};
  return {brief,result};
}

describe("LTX native ambience in the existing soundtrack workflow",()=>{
  it("publishes speech-free ambience as an editable SFX asset with durable evidence, metered review cost, and no duplicate review",async()=>{
    const listen=review();
    const first=await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen});
    expect(first).toMatchObject({status:"accepted",assetId:"video-ambience:take",verdict:accepted,costUsd:0.001});
    expect(assets()).toEqual([expect.objectContaining({id:first.assetId,kind:"sfx",path:generated.ambientAudio!.path,durationMs:4000,sha256:expect.stringMatching(/^[a-f0-9]{64}$/)})]);
    const evidence=JSON.parse(readFileSync(join(root,"assets",first.metadataPath!),"utf8"));
    expect(evidence).toMatchObject({status:"accepted",sourceVideoAttemptId:"take",sourceVideoPath:generated.media!.path,sourceAudioPath:generated.ambientAudio!.path,provider:"ltx_local",model:"ltx-2.5-fast",reviewModel:"test-listening-model",verdict:{speechDetected:false}});
    expect(db.prepare("SELECT amount_usd,generation_attempt_id FROM cost_ledger_entries").all()).toEqual([expect.objectContaining({amount_usd:0.001,generation_attempt_id:"take"})]);
    expect(await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen})).toMatchObject({status:"accepted",assetId:first.assetId});
    expect(listen).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM production_runs").get()!.n).toBe(0);
    const {brief,result}=finishingPlan(first.assetId!);
    const recipe=finishingRecipe(brief,result);
    expect(recipe.inputs).toEqual([generated.ambientAudio!.path]);
    expect(recipe.filter).toContain("[0:a]asplit=2[speech][detector]");
    expect(recipe.filter).toContain("volume=-26dB");
    expect(recipe.filter).toContain("sidechaincompress");
    expect(recipe.filter).not.toContain("atempo");
  });
  it.each([
    {speechDetected:true,intelligibleSpeech:false,reason:"Unintelligible background voices are still speech."},
    {speechDetected:false,intelligibleSpeech:true,reason:"Conflicting speech evidence."},
    {speechDetected:false,confidence:79,reason:"Voices cannot be ruled out."},
    {speechDetected:undefined,reason:"No explicit speech verdict."},
    {speechDetected:false,matchesBrief:false,reason:"Music or an unsupported event."},
    {speechDetected:false,technicalPass:false,reason:"Audible artifacts."},
    {speechDetected:false,reason:""}
  ])("holds unsuitable or uncertain ambience without affecting the picture: %o",async changes=>{
    const listen=vi.fn(async()=>({verdict:{...accepted,...changes} as NativeAmbienceReview,costUsd:0.001}));
    expect((await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen})).status).toBe("held");
    expect(assets()).toHaveLength(0);
    expect(db.prepare("SELECT status,result_asset_path FROM generation_attempts WHERE id='take'").get()).toMatchObject({status:"hold_for_review",result_asset_path:generated.media!.path});
    await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen});
    expect(listen).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(root,"assets",generated.ambientAudio!.path),"utf8")).toBe("retained native-audio fixture");
    const {brief,result}=finishingPlan("video-ambience:take");
    expect(()=>finishingRecipe(brief,result)).toThrow("approved asset");
  });
  it("holds listening-service failures and files changed during review",async()=>{
    const listen=vi.fn(async()=>{writeFileSync(join(root,"assets",generated.ambientAudio!.path),"changed audio");return {verdict:accepted,costUsd:0.001};});
    expect(await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen})).toMatchObject({status:"held",reason:expect.stringContaining("changed")});
    expect(assets()).toHaveLength(0);
  });
  it("records an unavailable listening service without publishing an asset",async()=>{
    const listen=vi.fn(async()=>{throw new Error("Listening service unavailable");});
    expect(await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen})).toMatchObject({status:"held",reason:"Listening service unavailable"});
    expect(db.prepare("SELECT note FROM review_notes").get()!.note).toContain("held");
    expect(assets()).toHaveLength(0);
  });
  it("refuses changed approved assets and attempts from another project",async()=>{
    const listen=review();
    await expect(registerVideoAmbience(db,"other","take",generated,{...options(),review:listen})).rejects.toThrow("this project's retained");
    expect(listen).not.toHaveBeenCalled();
    await registerVideoAmbience(db,"p","take",generated,{...options(),review:listen});
    writeFileSync(join(root,"assets",generated.ambientAudio!.path),"changed audio");
    await expect(registerVideoAmbience(db,"p","take",generated,{...options(),review:listen})).rejects.toThrow("changed");
    expect(listen).toHaveBeenCalledTimes(1);
  });
  it("does not spend on a silent take or an invalid duration",async()=>{
    const listen=review();
    expect((await registerVideoAmbience(db,"p","take",{...generated,ambientAudio:undefined},{...options(),review:listen})).status).toBe("unavailable");
    expect((await registerVideoAmbience(db,"p","take",generated,{...options(),duration:()=>0,review:listen})).status).toBe("held");
    expect(listen).not.toHaveBeenCalled();
  });
  it("listens to the actual retained audio and requires an explicit any-language speech verdict",async()=>{
    vi.mocked(generateJsonWithImagesMetered).mockResolvedValue({result:accepted,costUsd:0.001,usage:{promptTokenCount:1,candidatesTokenCount:1,thoughtsTokenCount:0,totalTokenCount:2}});
    expect(await reviewNativeAmbience(join(root,"assets",generated.ambientAudio!.path),generated.provenance.prompt)).toMatchObject({verdict:accepted});
    expect(generateJsonWithImagesMetered).toHaveBeenCalledWith(expect.stringContaining("unintelligible dialogue"),[{mimeType:"audio/wav",data:Buffer.from("retained native-audio fixture").toString("base64")}],expect.objectContaining({required:expect.arrayContaining(["speechDetected","intelligibleSpeech","confidence"])}));
    expect(nativeAmbiencePassed({...accepted,reason:42 as never})).toBe(false);
  });
});
