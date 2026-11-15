/** Read-only speaker-turn tail check of the source-faithful Mark 3:5 review cut. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { detectTruncatedRenewal } from "../src/pipeline/qc/audio-tail.js";

const path=join(getDataDir(),"assets","generated","video","review","mark3-scene1-shot4-through-verse5-healing-review-r2.mp4");
const bytes=execFileSync("ffmpeg",["-v","error","-i",path,"-f","s16le","-ac","1","-ar","48000","pipe:1"],{maxBuffer:10*1024*1024});
const pcm=new Int16Array(bytes.length/2);
for(let i=0;i<pcm.length;i++)pcm[i]=bytes.readInt16LE(i*2);
const turns=[
  {label:"Jesus Mark 3:4",start:0,end:13.420},
  {label:"narrator through Mark 3:5 command",start:13.420,end:29.026},
  {label:"Jesus Mark 3:5 command",start:29.026,end:30.267},
  {label:"narrator Mark 3:5 healing",start:30.267,end:37.046}
];
const verdicts=turns.map(turn=>({...turn,warning:detectTruncatedRenewal(pcm.slice(Math.round(turn.start*48000),Math.round(turn.end*48000)),48000)}));
console.log(JSON.stringify({decodedSeconds:pcm.length/48000,verdicts},null,2));
if(verdicts.some(v=>v.warning))process.exitCode=1;
