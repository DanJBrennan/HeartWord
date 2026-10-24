import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateJsonWithImagesMetered } from "../../src/providers/gemini-text.js";
import { MAX_REVIEW_PROXY_BYTES, reviewGeneratedVideo } from "../../src/pipeline/qc/video-review.js";
vi.mock("../../src/providers/gemini-text.js",()=>({ generateJsonWithImagesMetered: vi.fn(async()=>({ result: { pass: true,confidence: 70,reason: "Synthetic timing test only, not actual footage approval" },costUsd: .01 })) }));
let root="",source="",key="";
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
beforeEach(()=>{
  vi.clearAllMocks();root=mkdtempSync(join(tmpdir(),"hw-review-proxy-"));source=join(root,"source.mp4");key=join(root,"key.png");
  execFileSync("ffmpeg",["-v","error","-n","-f","lavfi","-i","testsrc2=s=160x90:r=24:d=1","-c:v","libx264","-pix_fmt","yuv420p",source],{stdio:["ignore","ignore","pipe"]});
  // A legal ISO-BMFF free box makes the real 24-frame container oversized
  // without a costly high-resolution fixture or any external provider.
  const free=Buffer.alloc(MAX_REVIEW_PROXY_BYTES+1024);free.writeUInt32BE(free.length);free.write("free",4);writeFileSync(source,Buffer.concat([readFileSync(source),free]));
  writeFileSync(key,Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64"));
});
afterEach(()=>{if(!resolve(root).startsWith(resolve(tmpdir(),"hw-review-proxy-")))throw Error("Unexpected fixture cleanup target.");rmSync(root,{recursive:true,force:true});});
it("reviews all frames at native geometry/rate without changing the original or its low score",async()=>{
  const originalHash=hash(source),r=await reviewGeneratedVideo({videoPath:source,keyframePath:key,instruction:"Synthetic moving test pattern"});
  expect(r.verdict).toMatchObject({pass:true,confidence:70});expect(hash(source)).toBe(originalHash);expect(generateJsonWithImagesMetered).toHaveBeenCalledTimes(1);
  const proof=r.reviewInput!;expect(proof.originalSha256).toBe(originalHash);expect(readFileSync(proof.path).length).toBeLessThan(MAX_REVIEW_PROXY_BYTES);
  const record=JSON.parse(readFileSync(proof.provenancePath,"utf8"));expect(record.sourceVideo).toMatchObject({width:160,height:90,avg_frame_rate:"24/1",nb_read_frames:"24"});expect(record.reviewVideo).toMatchObject({width:160,height:90,avg_frame_rate:"24/1",nb_read_frames:"24"});
  const media=vi.mocked(generateJsonWithImagesMetered).mock.calls[0]![1];expect(Buffer.from(media[0]!.data,"base64")).toEqual(readFileSync(proof.path));
  // Every decoded frame remains in its position, rather than just matching
  // a declared count or repeating the first frame.
  const pixels=(path:string)=>execFileSync("ffmpeg",["-v","error","-i",path,"-vf","scale=16:9","-f","rawvideo","-pix_fmt","rgb24","pipe:1"],{stdio:["ignore","pipe","pipe"]});
  const a=pixels(source),b=pixels(proof.path);expect(b.length).toBe(a.length);const perFrame=16*9*3;
  for(let f=0;f<24;f++){let delta=0;for(let i=f*perFrame;i<(f+1)*perFrame;i++)delta+=Math.abs(a[i]!-b[i]!);expect(delta/perFrame).toBeLessThan(8);}
});
it("reuses exact retained proxy bytes after a root move and holds corruption before a model call",async()=>{
  const initial=await reviewGeneratedVideo({videoPath:source,keyframePath:key,instruction:"Synthetic"}),proof=initial.reviewInput!,saved=readFileSync(proof.provenancePath),restored=join(root,"restored");mkdirSync(restored);
  for(const file of["source.mp4","source.mp4.picture-review-proxy.mp4","source.mp4.picture-review-proxy.mp4.json","key.png"])cpSync(join(root,file),join(restored,file));
  vi.clearAllMocks();const moved=await reviewGeneratedVideo({videoPath:join(restored,"source.mp4"),keyframePath:join(restored,"key.png"),instruction:"Explicit synthetic restored review"});
  expect(moved.reviewInput!.path).toBe(join(restored,"source.mp4.picture-review-proxy.mp4"));expect(readFileSync(moved.reviewInput!.provenancePath)).toEqual(saved);expect(generateJsonWithImagesMetered).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();writeFileSync(moved.reviewInput!.path,"corrupt retained proxy");await expect(reviewGeneratedVideo({videoPath:join(restored,"source.mp4"),keyframePath:key,instruction:"Must hold"})).rejects.toThrow("proxy or original changed");expect(generateJsonWithImagesMetered).not.toHaveBeenCalled();
});
it("supplies the real labelled endpoint and holds changed endpoint bytes before any review call",async()=>{
  const end=join(root,"end.png");writeFileSync(end,readFileSync(key));
  const endpoint={path:end,sha256:hash(end)};
  const result=await reviewGeneratedVideo({videoPath:source,keyframePath:key,endFrameReference:endpoint,instruction:"Two runners reach the uphill endpoint; no frozen hold."});
  expect(result.endFrameReference).toEqual(endpoint);
  const [prompt,media]=vi.mocked(generateJsonWithImagesMetered).mock.calls[0]!;
  expect(prompt).toContain("Judge the end against END, never against START");
  expect(media[1]!.caption).toContain("START:");expect(media[2]!.caption).toContain("END:");
  expect(Buffer.from(media[2]!.data,"base64")).toEqual(readFileSync(end));
  vi.clearAllMocks();writeFileSync(end,"changed endpoint");
  await expect(reviewGeneratedVideo({videoPath:source,keyframePath:key,endFrameReference:endpoint,instruction:"Must hold"})).rejects.toThrow("ending reference changed");
  expect(generateJsonWithImagesMetered).not.toHaveBeenCalled();
});
it("keeps audible native material out of a small picture review without changing any decoded video frame",async()=>{
  const audible=join(root,"audible.mp4");
  execFileSync("ffmpeg",["-v","error","-n","-f","lavfi","-i","testsrc2=s=160x90:r=24:d=1","-f","lavfi","-i","sine=frequency=440:sample_rate=16000:duration=1","-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",audible],{stdio:["ignore","ignore","pipe"]});
  expect(readFileSync(audible).length).toBeLessThan(MAX_REVIEW_PROXY_BYTES);const original=hash(audible);
  const result=await reviewGeneratedVideo({videoPath:audible,keyframePath:key,instruction:"Synthetic picture-only check; native audio independently held"});
  expect(hash(audible)).toBe(original);expect(result.verdict.confidence).toBe(70);const proof=result.reviewInput!;
  const sent=vi.mocked(generateJsonWithImagesMetered).mock.calls[0]![1][0]!;
  expect(Buffer.from(sent.data,"base64")).toEqual(readFileSync(proof.path));
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",proof.path],{encoding:"utf8"}));expect(probe.streams.map((s:any)=>s.codec_type)).toEqual(["video"]);
  const frames=(file:string)=>execFileSync("ffmpeg",["-v","error","-i",file,"-map","0:v:0","-an","-f","framemd5","pipe:1"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  expect(frames(proof.path)).toBe(frames(audible));expect(readFileSync(proof.provenancePath,"utf8")).toContain("stream-copy");
});
it("sends a naturally silent small original unchanged without an unnecessary encoding",async()=>{
  const silent=join(root,"small-silent.mp4");execFileSync("ffmpeg",["-v","error","-n","-i",source,"-map","0:v:0","-an","-c:v","copy",silent],{stdio:["ignore","ignore","pipe"]});
  const original=readFileSync(silent),result=await reviewGeneratedVideo({videoPath:silent,keyframePath:key,instruction:"Synthetic silent original"});
  expect(result.reviewInput).toBeUndefined();expect(Buffer.from(vi.mocked(generateJsonWithImagesMetered).mock.calls[0]![1][0]!.data,"base64")).toEqual(original);
  expect(readFileSync(silent)).toEqual(original);
});
