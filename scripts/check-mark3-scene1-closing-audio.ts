/** Final read-only speaker-turn and end-pause check of the selected scene close. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { detectTruncatedRenewal } from "../src/pipeline/qc/audio-tail.js";

const path=join(getDataDir(),"assets","generated","video","review","mark3-scene1-shot4-through-exit-review-r2.mp4");
const bytes=execFileSync("ffmpeg",["-v","error","-i",path,"-f","s16le","-ac","1","-ar","48000","pipe:1"],{maxBuffer:10*1024*1024});
const pcm=new Int16Array(bytes.length/2);
for(let i=0;i<pcm.length;i++)pcm[i]=bytes.readInt16LE(i*2);
const turns=[
  {speaker:"Jesus Mark 3:4",start:0,end:13.420},
  {speaker:"narrator Mark 3:4–5",start:13.420,end:29.026},
  {speaker:"Jesus Mark 3:5 command",start:29.026,end:30.267},
  {speaker:"narrator Mark 3:5–6",start:30.267,end:48.922}
];
const verdicts=turns.map(t=>({...t,warning:detectTruncatedRenewal(pcm.slice(Math.round(t.start*48000),Math.round(t.end*48000)),48000)}));
let energy=0,n=0;
for(let i=Math.round(48.922*48000);i<Math.min(pcm.length,Math.round(51.066*48000));i++){energy+=pcm[i]!**2;n++;}
const endPauseRmsDb=n&&energy?Math.round(10*Math.log10(energy/n/(32768*32768))*10)/10:-100;
console.log(JSON.stringify({decodedSeconds:pcm.length/48000,verdicts,endPauseRmsDb},null,2));
if(verdicts.some(v=>v.warning))process.exitCode=1;
