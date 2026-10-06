import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const dataDir=getDataDir();
const assets=join(dataDir,"assets");
const source=join(assets,"source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___04_Markus______HADLAIN1DA.mp3");
const clips=[
  join(assets,"generated/video/86607f90-825a-4221-8e28-5915ca466915.mp4"),
  join(assets,"generated/video/b4f60ed5-c4f4-436f-bfac-fb0e8b357fdf.mp4"),
  join(assets,"generated/lipsync/932921430932201514.mp4"),
  join(assets,"generated/video/1172d540-c778-46af-8c7e-9dfa2cc565a1.mp4")
];
const output=join(assets,"generated","review","mark4-restart-four-clip-narrated-review.mp4");
const manifest=output.replace(/\.mp4$/,".json");
mkdirSync(dirname(output),{recursive:true});
const filter=[
  "[0:v]trim=duration=4.661,setpts=PTS-STARTPTS[v0]",
  "[1:v]tpad=stop_mode=clone:stop_duration=6,trim=duration=13.150,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih),fps=24[v1]",
  "[2:v]tpad=stop_mode=clone:stop_duration=10,trim=duration=17.477,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih),fps=24[v2]",
  "[3:v]trim=duration=5.969,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih),fps=24[v3]",
  "[4:v]tpad=stop_mode=clone:stop_duration=2,trim=duration=9.139,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih),fps=24[v4]",
  "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[v]",
  "[5:a]atrim=start=0:end=50.396,asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a]"
].join(";");
execFileSync("ffmpeg",["-y","-f","lavfi","-i","color=c=black:s=1280x720:r=24:d=4.661",...clips.flatMap(path=>["-i",path]),"-i",source,"-filter_complex",filter,"-map","[v]","-map","[a]","-c:v","libx264","-crf","18","-c:a","aac","-movflags","+faststart",output],{stdio:["ignore","ignore","pipe"]});
writeFileSync(manifest,JSON.stringify({
  kind:"review_only_mark4_restart_pilot_with_continuous_source_audio",totalDurationMs:50396,
  audio:{source:"original Hatam Mark 4 recording",startMs:0,endMs:50396,untouched:true},
  timeline:[
    {startMs:0,endMs:4661,picture:"black hold: no pre-source image was generated"},
    {startMs:4661,endMs:17811,picture:"Mark 4:1 shore gathering, held after natural motion"},
    {startMs:17811,endMs:35288,picture:"Mark 4:1 boat anchor, held after natural motion"},
    {startMs:35288,endMs:41257,picture:"Mark 4:3 selected Jesus lip-sync, exact source-bound interval"},
    {startMs:41257,endMs:50396,picture:"Mark 4:4 seeds-on-the-path cutaway, held after natural motion"}
  ]
},null,2));
console.log(JSON.stringify({ok:true,output,manifest},null,2));
