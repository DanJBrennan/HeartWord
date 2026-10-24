import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect, it} from "vitest";
import {finishingFilterArgs} from "../../src/pipeline/assembly/finishing.js";
import {fixtureWave} from "../helpers/pcm-wave.js";

const available=spawnSync("ffmpeg",["-version"],{stdio:"ignore"}).status===0;
it.skipIf(!available)("keeps the sound clock when concatenated picture metadata changes",()=>{
  const dir=mkdtempSync(join(tmpdir(),"heartword-finish-format-"));
  const ff=(args:string[])=>execFileSync("ffmpeg",["-v","error","-n",...args],{stdio:["ignore","ignore","pipe"]});
  const pcm=(file:string)=>{
    const b=execFileSync("ffmpeg",["-v","error","-i",file,"-vn","-ar","8000","-ac","1","-f","f32le","-"],{maxBuffer:1024*1024});
    return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
  };
  try{
    for(const [name,seconds,metadata] of [["title",2.5,[]],["scene",3.5,["-color_range","tv","-colorspace","bt709"]]] as const)
      ff(["-f","lavfi","-i",`color=gray:s=160x90:r=24:d=${seconds}`,"-c:v","libx264","-pix_fmt","yuv420p",...metadata,join(dir,name+".mp4")]);
    writeFileSync(join(dir,"pictures.txt"),["title","scene"].map(n=>`file '${join(dir,n+".mp4").replaceAll("\\","/")}'`).join("\n"));
    writeFileSync(join(dir,"source.wav"),fixtureWave(6000,t=>300+100*t));
    writeFileSync(join(dir,"bed.wav"),fixtureWave(6000,85));
    const base=join(dir,"base.mp4"),out=join(dir,"finished.mp4");
    ff(["-f","concat","-safe","0","-i",join(dir,"pictures.txt"),"-i",join(dir,"source.wav"),"-c:v","copy","-c:a","aac","-ar","48000","-t","6",base]);
    const recipe={filter:"[0:v]eq=contrast=1.01[picture];[0:a]asplit=2[speech][detector];[1:a]volume=0.01,apad[bed];[bed][detector]sidechaincompress=threshold=0.03:ratio=8:attack=10:release=250[ducked];[speech][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[sound]"};
    ff(["-i",base,"-i",join(dir,"bed.wav"),...finishingFilterArgs(recipe),"-map","[picture]","-map","[sound]","-c:v","libx264","-crf","18","-c:a","aac","-ar","48000","-t","6",out]);
    const a=pcm(base),b=pcm(out);
    expect(b.length).toBe(a.length);
    // The swept signal is not periodic, so an entire lost block cannot pass a
    // phase-only tone check. Inspect after the actual picture format change.
    const start=3.5*8000,end=4.5*8000;
    let bestLag=0,best=-Infinity;
    for(let lag=-6400;lag<=6400;lag++){
      let cross=0;for(let i=start;i<end;i+=4)cross+=a[i]!*b[i+lag]!;
      if(cross>best){best=cross;bestLag=lag;}
    }
    expect(Math.abs(bestLag)).toBeLessThanOrEqual(1);
  }finally{rmSync(dir,{recursive:true,force:true});}
},30000);
