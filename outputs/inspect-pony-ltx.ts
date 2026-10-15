import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewNativeAmbience, nativeAmbiencePassed } from "../src/pipeline/assembly/soundtrack.js";
const folder=process.argv[2]!;
if(!folder)throw new Error("Expected the completed standalone pony diagnostic folder");
const original=join(folder,"pony-native.mp4"),view=join(folder,"pony-720p-5s.mp4");
const probe=(path:string)=>JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",path],{encoding:"utf8",windowsHide:true}));
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const before=hash(original),native=probe(original);
if(!native.streams.some((s:any)=>s.codec_type==="audio"))throw new Error("The requested native sound is absent");
execFileSync("ffmpeg",["-v","error","-i",original,"-f","null","-"],{windowsHide:true,stdio:"pipe"});
if(!existsSync(view))execFileSync("ffmpeg",["-v","error","-n","-i",original,"-map","0:v:0","-map","0:a:0","-t","5","-vf","scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1","-c:v","libx264","-crf","18","-preset","medium","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart",view],{windowsHide:true,stdio:"pipe"});
const delivery=probe(view);
for(const t of [0,1,2,3,4]){const image=join(folder,`review-${t}s.png`);if(!existsSync(image))execFileSync("ffmpeg",["-v","error","-n","-ss",String(t),"-i",view,"-frames:v","1",image],{windowsHide:true,stdio:"pipe"});}
const audio=join(folder,"pony-native.mp4.ambience.wav"),reviewFile=join(folder,"listening-review.json");
let review:unknown;
if(existsSync(reviewFile))review=JSON.parse(readFileSync(reviewFile,"utf8"));
else{
  const evidence=await reviewNativeAmbience(audio,"Standalone diagnostic, not Scripture production: a close Shetland pony gives one clear unmistakable horse neigh/whinny, with quiet outdoor wind. The neigh is a permitted nonverbal animal call. A snort alone, quiet breathing alone or silence does not satisfy this request. No human or synthetic speech, singing or music. Explicitly describe the actual animal sound you hear and whether it is a neigh; set matchesBrief=false if that required sound is absent or uncertain.");
  review={...evidence,passed:nativeAmbiencePassed(evidence.verdict),audioSha256:hash(audio),accounting:"Existing metered Gemini listening review for standalone diagnostic; costUsd is an estimate, not invoice reconciliation. No generation fallback or production DB write."};
  writeFileSync(reviewFile,JSON.stringify(review,null,2),{flag:"wx"});
}
if(before!==hash(original))throw new Error("Original changed during inspection");
const evidence={native:{path:original,sha256:before,streams:native.streams,duration:native.format.duration},delivery:{path:view,sha256:hash(view),streams:delivery.streams,duration:delivery.format.duration,conformance:"Separate 5s/720p copy; original retained; preserve aspect with letterboxing, no speech or speed edit"},review};
writeFileSync(join(folder,"verification.json"),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({nativeDuration:native.format.duration,deliveryDuration:delivery.format.duration,delivery:delivery.streams.map((s:any)=>({kind:s.codec_type,width:s.width,height:s.height,frames:s.nb_frames,fps:s.r_frame_rate})),listening:review,video:view},null,2));
