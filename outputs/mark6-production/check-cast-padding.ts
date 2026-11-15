import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
const root='outputs/mark6-production',p=JSON.parse(readFileSync(root+'/cast-section-plans.json','utf8')),m=JSON.parse(readFileSync('outputs/mark6-preparation/voice-queue-v1/manifest.json','utf8'));
const ff=(path:string)=>execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,'-f','s16le','-ar','48000','-ac','1','-'],{maxBuffer:10000000});
const peak=(buf:Buffer,s:number,e:number)=>{let n=0;for(let i=s;i<e;i++)n=Math.max(n,Math.abs(buf.readInt16LE(i*2))/32768);return n?20*Math.log10(n):null;};
const rows=p.rows.filter((r:any)=>r.deltaMs>0).map((r:any)=>{const out=ff(r.path),q=m.entries.find((q:any)=>q.id===r.id),delta=out.length/2-r.sourceSamplesAt48k;return{id:r.id,deltaSamples:delta,leadingDeltaPeakDb:peak(out,0,delta),tailPeakDb:r.extraTailPeakDb};});
writeFileSync(root+'/cast-leading-padding-check.json',JSON.stringify({rows,acceptance:'measurements only, no files trimmed or timings changed'},null,2));console.log(JSON.stringify(rows));
