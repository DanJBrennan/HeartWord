import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { LtxChainedSpeaking } from "../../src/pipeline/voice-lipsync/ltx-speaking.js";

const ff = (args: string[]) => execFileSync("ffmpeg", ["-v","error","-nostdin","-y",...args],{windowsHide:true,maxBuffer:16*1024*1024});
const pcm = (path:string) => ff(["-i",path,"-map","0:a:0","-f","s16le","-"]);
const fixtureNativeId = "00000000-0000-0000-0000-000000000001" as const;
it("assembles chained native frames over one uninterrupted source line and carries the exact retained crop",async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),"hw-ltx-line-")),assets=join(dataDir,"assets");mkdirSync(assets);
 const source=join(assets,"source.wav"),reference=join(assets,"reference.png"),raw=join(assets,"fake-native.mp4");
 ff(["-f","lavfi","-i","sine=frequency=523:sample_rate=48000:duration=7","-c:a","pcm_s16le",source]);
 ff(["-f","lavfi","-i","testsrc2=size=1280x720:rate=24:duration=5","-an","-c:v","libx264","-preset","ultrafast","-crf","18",raw]);
 ff(["-i",raw,"-frames:v","1",reference]);
 const submitted:string[]=[];
 const generateSection=vi.fn(async(input:any)=>{submitted.push(input.audio);expect(input.prompt).toBe('He speaks the entire supplied original performance. Cream tunic remains cream.');expect(pcm(input.audio).length).toBe(5*48000*2*2);return{rawPath:raw,attemptPath:"fixture",id:fixtureNativeId};});
 const authorizeSubmission=vi.fn();
 for(const performancePrompt of ['', 'He wears a blue tunic.']){
  const rejected=new LtxChainedSpeaking({dataDir,crop:{x:160,y:90,width:960,height:540,evidenceRef:'fixture'},performancePrompt,generateSection});
  await expect(rejected.sync({characterId:'fixture',characterVersionId:'approved-fixture',lockedVisualFacts:{description:'Cream tunic remains cream.',prohibitedPromptPhrases:['blue tunic']}},{path:'source.wav',startMs:250,endMs:6750},{path:'reference.png'},{requestId:'rejected',authorizeSubmission})).rejects.toThrow('contradicts locked canon');
 }
 expect(generateSection).not.toHaveBeenCalled();
 const provider=new LtxChainedSpeaking({dataDir,crop:{x:160,y:90,width:960,height:540,evidenceRef:"fixture framing only"},performancePrompt:'He speaks the entire supplied original performance.',generateSection});
 const result=await provider.sync({characterId:"fixture",characterVersionId:"approved-fixture",lockedVisualFacts:{description:'Cream tunic remains cream.',prohibitedPromptPhrases:['blue tunic']}},{path:"source.wav",startMs:250,endMs:6750},{path:"reference.png"},{requestId:"fixture",authorizeSubmission});
 expect(result.status).toBe("hold_for_review");expect(generateSection).toHaveBeenCalledTimes(2);
 const root=join(assets,"generated/lip-sync/ltx-fixture"),manifest=JSON.parse(readFileSync(join(root,"line.json"),"utf8"));
 expect(manifest.plan.sampleCount).toBe(312000);expect(manifest.plan.totalFrames).toBe(156);
 const expectedSource=ff(["-i",source,"-af","atrim=start_sample=12000:end_sample=324000,asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c0","-f","s16le","-"]);
 expect(pcm(join(root,"full-line.wav")).equals(expectedSource)).toBe(true);
 const pieces=submitted.map((path,i)=>pcm(path).subarray(0,(manifest.plan.sections[i].sourceEndSample-manifest.plan.sections[i].sourceStartSample)*4));
 expect(Buffer.concat(pieces).equals(expectedSource)).toBe(true);
 const last=manifest.plan.sections[0].lastRetainedFrameIndex;
 const expectedCarry=ff(["-i",raw,"-vf",`select=eq(n\\,${last}),crop=960:540:160:90,pad=1280:720:160:90,fillborders=left=160:right=160:top=90:bottom=90:mode=smear`,"-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","-"]);
 const actualCarry=ff(["-i",generateSection.mock.calls[1]![0].image,"-f","rawvideo","-pix_fmt","rgb24","-"]);
 expect(actualCarry.equals(expectedCarry)).toBe(true);
 const expectedAac=join(root,"expected-audio.m4a");ff(["-i",join(root,"full-line.wav"),"-c:a","aac","-b:a","192k",expectedAac]);
 expect(pcm(join(assets,result.media!.path)).equals(pcm(expectedAac))).toBe(true);
 expect(manifest.status).toBe("complete_line_held_for_review");expect(authorizeSubmission).toHaveBeenCalled();
},60000);

it("reframes a multi-section prefix without rewriting actual native input provenance",async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),"hw-ltx-multi-resume-")),assets=join(dataDir,"assets");mkdirSync(assets);
 const source=join(assets,"source.wav"),raw=join(assets,"native.mp4"),reference=join(assets,"reference.png");
 ff(["-f","lavfi","-i","sine=frequency=523:sample_rate=48000:duration=10","-c:a","pcm_s16le",source]);
 ff(["-f","lavfi","-i","testsrc2=size=1280x720:rate=24:duration=5","-an","-c:v","libx264","-preset","ultrafast",raw]);ff(["-i",raw,"-frames:v","1",reference]);
 const character={characterId:"c",characterVersionId:"v"},audio={path:"source.wav",startMs:0,endMs:10000},frame={path:"reference.png"},opts={requestId:"multi",authorizeSubmission:vi.fn()};
 const originalCrop={x:80,y:0,width:1120,height:630,evidenceRef:"initial"};
 const first=vi.fn(async()=>{if(first.mock.calls.length>2)throw Error("Explicit review hold");return{rawPath:raw,attemptPath:"fixture",id:fixtureNativeId};});
 await expect(new LtxChainedSpeaking({dataDir,crop:originalCrop,generateSection:first}).sync(character,audio,frame,opts)).rejects.toThrow("review hold");
 const root=join(assets,"generated/lip-sync/ltx-multi"),manifest=join(root,"line.json"),old=readFileSync(manifest),sha=createHash("sha256").update(old).digest("hex"),before=JSON.parse(old.toString());
 expect(before.sections).toHaveLength(2);
 const originalCarry=readFileSync(before.sections[0].carryImagePath),sourcePcm=pcm(join(root,"full-line.wav"));
 const next=vi.fn(async(input:any)=>({rawPath:raw,attemptPath:"fixture-final",id:fixtureNativeId}));
 await expect(new LtxChainedSpeaking({dataDir,crop:{x:0,y:0,width:1280,height:720,evidenceRef:"expands"},resumeManifestSha256:sha,generateSection:next}).sync(character,audio,frame,opts)).rejects.toThrow("inside the retained crop");
 expect(readFileSync(manifest).equals(old)).toBe(true);expect(next).not.toHaveBeenCalled();
 const crop={x:128,y:0,width:1024,height:576,evidenceRef:"remove caption tops"};
 await new LtxChainedSpeaking({dataDir,crop,resumeManifestSha256:sha,generateSection:next}).sync(character,audio,frame,opts);
 const after=JSON.parse(readFileSync(manifest,"utf8"));expect(next).toHaveBeenCalledTimes(1);
 expect(after.sections[1].inputImageSha256).toBe(before.sections[1].inputImageSha256);
 expect(after.sections[1].nativeInput.path).toBe(before.sections[1].nativeInput.path);
 expect(after.sections[1].nativeInput.cropAtGeneration).toEqual(originalCrop);
 expect(after.sections[1].inputImageSha256).not.toBe(after.sections[0].carryImageSha256);
 expect(after.sections[2].inputImageSha256).toBe(after.sections[1].carryImageSha256);
 expect(next.mock.calls[0]![0].image).toBe(after.sections[1].carryImagePath);
 expect(readFileSync(before.sections[0].carryImagePath).equals(originalCarry)).toBe(true);
 expect(readFileSync(join(root,`line-before-resume-${sha}.json`)).equals(old)).toBe(true);
 expect(pcm(join(root,"full-line.wav")).equals(sourcePcm)).toBe(true);expect(after.plan.totalFrames).toBe(240);
 for(let i=0;i<2;i++){
  expect(after.sections[i].rawSha256).toBe(before.sections[i].rawSha256);
  const interior=(path:string)=>ff(["-i",path,"-vf","crop=1024:576:128:0","-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","-"]);
  expect(interior(after.sections[i].carryImagePath).equals(interior(before.sections[i].carryImagePath))).toBe(true);
 }
},60000);
it("holds long speech without a scene-specific cleanup recipe before inference",async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),"hw-ltx-line-hold-"));mkdirSync(join(dataDir,"assets"));
 const source=join(dataDir,"assets","source.wav");ff(["-f","lavfi","-i","sine=duration=5",source]);
 const generateSection=vi.fn();
 await expect(new LtxChainedSpeaking({dataDir,generateSection}).sync({characterId:"c",characterVersionId:"v"},{path:"source.wav",startMs:0,endMs:5000},{path:"reference.png"},{authorizeSubmission:()=>{}})).rejects.toThrow("scene-framing");
 expect(generateSection).not.toHaveBeenCalled();
});

it("recovers a held prefix with new direction only for remaining sections, preserving native footage and source audio",async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),"hw-ltx-resume-")),assets=join(dataDir,"assets");mkdirSync(assets);
 const source=join(assets,"source.wav"),raw=join(assets,"native.mp4"),reference=join(assets,"reference.png");
 ff(["-f","lavfi","-i","sine=frequency=523:sample_rate=48000:duration=7","-c:a","pcm_s16le",source]);
 ff(["-f","lavfi","-i","testsrc2=size=1280x720:rate=24:duration=5","-an","-c:v","libx264","-preset","ultrafast",raw]);ff(["-i",raw,"-frames:v","1",reference]);
 const character={characterId:"c",characterVersionId:"v",lockedVisualFacts:{description:"Cream tunic remains cream.",prohibitedPromptPhrases:["blue tunic"]}},audio={path:"source.wav",startMs:0,endMs:6500},frame={path:"reference.png"},opts={requestId:"recovery",authorizeSubmission:vi.fn(),productionRevision:{runId:"r",briefHash:"h"}};
 const first=vi.fn(async()=>{if(first.mock.calls.length>1)throw Error("Explicit picture review hold");return{rawPath:raw,attemptPath:"fixture",id:fixtureNativeId};});
 await expect(new LtxChainedSpeaking({dataDir,crop:{x:80,y:0,width:1120,height:630,evidenceRef:"initial"},generateSection:first}).sync(character,audio,frame,opts)).rejects.toThrow("picture review hold");
 const root=join(assets,"generated/lip-sync/ltx-recovery"),manifest=join(root,"line.json"),old=readFileSync(manifest),sha=createHash("sha256").update(old).digest("hex"),before=JSON.parse(old.toString());
 const next=vi.fn(async(input:any)=>({rawPath:raw,attemptPath:"fixture-2",id:fixtureNativeId}));
 const corrected={x:128,y:0,width:1024,height:576,evidenceRef:"actual returned caption boundary"};
 await expect(new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:"0".repeat(64),generateSection:next}).sync(character,audio,frame,opts)).rejects.toThrow("exact held");
 await expect(new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:sha,generateSection:next}).sync(character,audio,frame,{...opts,productionRevision:{runId:"other",briefHash:"h"}})).rejects.toThrow("revision changed");
 const originalRaw=readFileSync(raw);writeFileSync(raw,Buffer.concat([originalRaw,Buffer.from("changed")]));
 await expect(new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:sha,generateSection:next}).sync(character,audio,frame,opts)).rejects.toThrow("evidence changed");writeFileSync(raw,originalRaw);
 for(const [sectionPerformancePrompts,message] of [
  [{0:"Different retained acting."},"direction cannot change"],
  [{1:"A blue tunic."},"contradicts locked canon"],
  [{1:" "},"contradicts locked canon"],
  [{2:"Outside the measured source plan."},"outside the measured source plan"],
 ] as Array<[Record<number,string>,string]>){
  await expect(new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:sha,sectionPerformancePrompts,generateSection:next}).sync(character,audio,frame,opts)).rejects.toThrow(message);
  expect(readFileSync(manifest).equals(old)).toBe(true);
 }
 const actualReceipt=join(assets,"attempt.json");writeFileSync(actualReceipt,JSON.stringify({request:{prompt:"Different actual native direction."}}));
 await expect(new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:sha,generateSection:next}).sync(character,audio,frame,opts)).rejects.toThrow("differs from its actual request");unlinkSync(actualReceipt);
 expect(next).not.toHaveBeenCalled();
 const repairedDirection="His lips and jaw visibly articulate the complete recorded speech.";
 const result=await new LtxChainedSpeaking({dataDir,crop:corrected,resumeManifestSha256:sha,sectionPerformancePrompts:{1:repairedDirection},generateSection:next}).sync(character,audio,frame,opts);
 expect(next).toHaveBeenCalledTimes(1);expect(result.status).toBe("hold_for_review");
 const after=JSON.parse(readFileSync(manifest,"utf8"));expect(after.reusedNativeSections).toBe(1);expect(after.sections[0].rawSha256).toBe(before.sections[0].rawSha256);
 const actualPrompt=repairedDirection+" Cream tunic remains cream.";
 expect(next.mock.calls[0]![0].prompt).toBe(actualPrompt);
 expect(after.sectionPrompts).toEqual({1:actualPrompt});
 expect(after.sections[0].nativePromptSha256).toBe(before.sections[0].nativePromptSha256);
 expect(after.sections[1].nativePromptSha256).toBe(createHash("sha256").update(actualPrompt).digest("hex"));
 expect(JSON.parse(result.provenance.prompt)).toEqual({defaultPrompt:before.prompt,sectionPrompts:{1:actualPrompt}});
 expect(readFileSync(join(root,`line-before-resume-${sha}.json`)).equals(old)).toBe(true);
 const expected=ff(["-i",raw,"-vf",`select=eq(n\\,${before.sections[0].lastRetainedFrameIndex}),crop=1024:576:128:0,pad=1280:720:128:0,fillborders=left=128:right=128:top=0:bottom=144:mode=smear`,"-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","-"]);
 expect(ff(["-i",after.sections[0].carryImagePath,"-f","rawvideo","-pix_fmt","rgb24","-"]).equals(expected)).toBe(true);
 expect(pcm(join(root,"full-line.wav")).equals(ff(["-i",source,"-af","atrim=end_sample=312000,asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c0","-f","s16le","-"]))).toBe(true);
},60000);
