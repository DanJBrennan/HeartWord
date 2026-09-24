/** Read-only source-turn and final-pause QC for the Mark 3:6 review cut. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { detectTruncatedRenewal } from "../src/pipeline/qc/audio-tail.js";

const path=join(getDataDir(),"assets","generated","video","review","mark3-scene1-command-through-exit-review-r1.mp4");
const bytes=execFileSync("ffmpeg",["-v","error","-i",path,"-f","s16le","-ac","1","-ar","48000","pipe:1"],{maxBuffer:10*1024*1024});
const pcm=new Int16Array(bytes.length/2);
for(let i=0;i<pcm.length;i++)pcm[i]=bytes.readInt16LE(i*2);
const windows=[
  {speaker:"Jesus command",start:0,end:1.241},
  {speaker:"narrator through verse 6",start:1.241,end:19.896}
];
const verdicts=windows.map(w=>({...w,warning:detectTruncatedRenewal(pcm.slice(Math.round(w.start*48000),Math.round(w.end*48000)),48000)}));
let power=0,n=0;
for(let i=Math.round(19.896*48000);i<Math.min(pcm.length,Math.round(22.040*48000));i++){power+=pcm[i]!**2;n++;}
const pauseRmsDb=n&&power?Math.round(10*Math.log10(power/n/(32768*32768))*10)/10:-100;
console.log(JSON.stringify({decodedSeconds:pcm.length/48000,verdicts,pauseRmsDb},null,2));
if(verdicts.some(v=>v.warning))process.exitCode=1;
