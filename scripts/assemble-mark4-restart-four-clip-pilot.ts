import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const entries=[
  {shotId:"86607f90-825a-4221-8e28-5915ca466915",label:"Mark 4:1 shore gathering",durationMs:8000,sourceAudio:false},
  {shotId:"b4f60ed5-c4f4-436f-bfac-fb0e8b357fdf",label:"Mark 4:1 boat anchor",durationMs:8000,sourceAudio:false},
  {shotId:"7af4222c-ae6e-4577-abe7-65f904cbdb67",label:"Mark 4:3 source-bound Jesus close-up",durationMs:5969,sourceAudio:true},
  {shotId:"1172d540-c778-46af-8c7e-9dfa2cc565a1",label:"Mark 4:4 seeds-on-the-path cutaway",durationMs:8000,sourceAudio:false}
];
const db=getDb(), dataDir=getDataDir();
const clips=entries.map(entry=>{
  const row=db.prepare(`SELECT ga.result_asset_path FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    WHERE c.shot_id=? AND ga.status='accepted' AND ga.operation IN ('generate_final_video','lip_sync') ORDER BY ga.created_at DESC LIMIT 1`).get(entry.shotId) as {result_asset_path:string}|undefined;
  if(!row) throw new Error(`Missing selected pilot clip: ${entry.label}`);
  return {...entry,path:join(dataDir,"assets",row.result_asset_path)};
});
const output=join(dataDir,"assets","generated","review","mark4-restart-four-clip-pilot.mp4");
const manifest=output.replace(/\.mp4$/,".json");
mkdirSync(dirname(output),{recursive:true});
const filters=clips.flatMap((clip,index)=>[
  `[${index}:v]trim=duration=${(clip.durationMs/1000).toFixed(3)},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih),fps=24[v${index}]`,
  clip.sourceAudio
    ? `[${index}:a]atrim=duration=${(clip.durationMs/1000).toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${index}]`
    : `anullsrc=r=44100:cl=stereo,atrim=duration=${(clip.durationMs/1000).toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`
]).concat([`${clips.map((_,i)=>`[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`]).join(";");
execFileSync("ffmpeg",["-y",...clips.flatMap(clip=>["-i",clip.path]),"-filter_complex",filters,"-map","[v]","-map","[a]","-c:v","libx264","-crf","18","-c:a","aac","-movflags","+faststart",output],{stdio:["ignore","ignore","pipe"]});
writeFileSync(manifest,JSON.stringify({
  kind:"review_only_mark4_restart_pilot",projectId,
  totalDurationMs:entries.reduce((sum,entry)=>sum+entry.durationMs,0),
  clips:clips.map(({path,...entry})=>entry),
  audio:"Silence under non-speaking coverage; the selected Mark 4:3 lip-sync supplies only its exact 5.969-second approved source-bound audio. This is not a chapter render or a substitute for the continuous source narration."
},null,2));
console.log(JSON.stringify({ok:true,output,manifest,clips:clips.map(({path,...clip})=>clip)},null,2));
