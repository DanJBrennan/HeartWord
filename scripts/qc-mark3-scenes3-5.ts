/** Acoustic and structural gate for reviewed Mark 3 Scenes 3–5. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { auditBoundaryIntegrity } from "../src/pipeline/ingestion/boundary-integrity.js";
import { detectTruncatedRenewal } from "../src/pipeline/qc/audio-tail.js";

const project = "0b386bfc-7919-4f40-91af-e198508a8267", db=getDb(), root=join(getDataDir(),"assets");
const source = db.prepare("SELECT source_path FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=371645").get(project) as {source_path:string}|undefined;
if (!source || !existsSync(join(root,source.source_path))) throw new Error("Original Hatam source missing.");
const raw = execFileSync("ffmpeg",["-v","error","-i",join(root,source.source_path),"-vn","-ac","1","-ar","16000","-f","s16le","pipe:1"],{maxBuffer:30_000_000});
const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const sampleRate=16000;
const slice=(start:number,end:number)=>pcm.subarray(Math.round(start*sampleRate/1000),Math.round(end*sampleRate/1000));
const rmsDb=(start:number,end:number)=>{const values=slice(start,end);let energy=0;for(const v of values)energy+=v*v;return +(20*Math.log10(Math.sqrt(energy/Math.max(1,values.length))/32768)).toFixed(1)};
const overlap=auditBoundaryIntegrity(pcm,sampleRate,[{startMs:357645,endMs:371645},{startMs:371645,endMs:385645}]);
const endings=[
  {scene:3,at:245262,sourceTail:detectTruncatedRenewal(slice(241812,245262),sampleRate)},
  {scene:4,at:371645,sourceTail:detectTruncatedRenewal(slice(357645,371645),sampleRate)},
  {scene:5,at:429852,sourceTail:detectTruncatedRenewal(slice(427645,429852),sampleRate)}
];
const reviews=[];
for(const [scene,start,end,version] of [[3,172258,245262,1],[4,245262,371645,2],[5,371645,430352,2]] as const){
  const path=`generated/video/review/mark3-scene${scene}-full-source-review-r${version}.mp4`;
  const abs=join(root,path);
  if(!existsSync(abs))throw new Error(`Missing reviewed scene ${scene}`);
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,duration,nb_frames","-of","json",abs],{encoding:"utf8"})) as {format:{duration:string};streams:Array<{codec_type:string;duration:string;nb_frames?:string}>};
  const duration=Number(probe.format.duration)*1000,video=probe.streams.find(s=>s.codec_type==="video"),audio=probe.streams.find(s=>s.codec_type==="audio");
  if(Math.abs(duration-(end-start))>30 || Number(video?.nb_frames)!==Math.round((end-start)*24/1000) || Math.abs(Number(audio?.duration)*1000-(end-start))>30)throw new Error(`Scene ${scene} A/V duration or frame count mismatch.`);
  const key=`mark3-scene${scene}-complete-source-picture-coverage-r${scene===5?1:version}`;
  const command=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=? AND undone=0").get(project,key) as {payload:string}|undefined;
  const selected=command?(JSON.parse(command.payload) as {selected:Array<{shotId:string;start:number;end:number}>}).selected:[];
  if(scene===5){
    const tail=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key='mark3-scene5-recorded-natural-silence-tail-v1' AND undone=0").get(project) as {payload:string}|undefined;
    const p=tail?JSON.parse(tail.payload) as {postrollShotId:string;sourceSpeechEndMs:number;reviewEndMs:number}:null;
    if(!p || p.sourceSpeechEndMs!==429852 || p.reviewEndMs!==430352)throw new Error("Recorded natural tail is missing.");
    selected.push({shotId:p.postrollShotId,start:p.sourceSpeechEndMs,end:p.reviewEndMs});
  }
  if(!selected.length || selected[0]!.start!==start || selected.at(-1)!.end!==end || selected.some((s,i)=>i>0&&selected[i-1]!.end!==s.start))throw new Error(`Scene ${scene} selected timeline has a gap.`);
  for(const beat of selected){const row=db.prepare("SELECT COUNT(*) AS n FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted'").get(beat.shotId) as {n:number};if(row.n!==1)throw new Error(`Scene ${scene} beat lacks one assembled clip.`);}
  reviews.push({scene,path,durationMs:duration,frames:Number(video!.nb_frames),audioDurationMs:Number(audio!.duration)*1000,selectedBeats:selected.length});
}
const finalReview=join(root,"generated/video/review/mark3-scene5-full-source-review-r2.mp4");
const tailRaw=execFileSync("ffmpeg",["-v","error","-ss","58.507","-t","0.200","-i",finalReview,"-vn","-ac","1","-ar","16000","-f","s16le","pipe:1"],{maxBuffer:100000});
const tailPcm=new Int16Array(tailRaw.buffer.slice(tailRaw.byteOffset,tailRaw.byteOffset+tailRaw.byteLength));
let tailEnergy=0;for(const v of tailPcm)tailEnergy+=v*v;
const reviewLast200Db=+(20*Math.log10(Math.sqrt(tailEnergy/Math.max(1,tailPcm.length))/32768)).toFixed(1);
const report={reviews,scene4To5Boundary:{findings:overlap,beforeDb:rmsDb(371465,371625),afterDb:rmsDb(371665,371825)},endings,
  chapterEnd:{last200Db:rmsDb(429652,429852),next200Db:rmsDb(429852,430052),reviewLast200Db}};
const out=join(root,"generated/video/review/mark3-scenes3-5-qc-r2.json");
writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
