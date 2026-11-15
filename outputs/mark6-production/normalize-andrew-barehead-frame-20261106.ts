import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const folder='outputs/mark6-production/keyframes/scene2-shot2-andrew-barehead-edit-20261106-v2',original=folder+'/candidate-v1.png',normalized=folder+'/candidate-normalized-1672x941.png';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin',...args],{windowsHide:true,maxBuffer:12*1024*1024});
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',original],{encoding:'utf8',windowsHide:true})).streams[0];if(probe.width!==1671||probe.height!==941)throw Error('Unexpected dimensions');
ff(['-n','-i',original,'-vf','pad=1672:941:0:0,fillborders=right=1:mode=smear','-frames:v','1',normalized]);
const rgb=(path:string)=>ff(['-i',path,'-f','rawvideo','-pix_fmt','rgb24','-']),a=rgb(original),b=rgb(normalized);if(a.length!==1671*941*3||b.length!==1672*941*3)throw Error('Unexpected RGB sizes');
for(let y=0;y<941;y++){if(!a.subarray(y*1671*3,(y+1)*1671*3).equals(b.subarray(y*1672*3,y*1672*3+1671*3)))throw Error('Original pixel changed');if(!b.subarray(y*1672*3+1671*3,(y+1)*1672*3).equals(a.subarray((y+1)*1671*3-3,(y+1)*1671*3)))throw Error('Edge duplication failed');}
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),proof={at:new Date().toISOString(),original,originalSha256:hash(original),normalized,normalizedSha256:hash(normalized),originalSize:[1671,941],normalizedSize:[1672,941],operation:'Lossless format normalization only: duplicate one right-edge column; no image-content generation, crop or resize',allOriginalRgbPixelsIdentical:true,duplicatedRightColumnVerified:true,modelCalls:0};writeFileSync(folder+'/format-proof.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));

