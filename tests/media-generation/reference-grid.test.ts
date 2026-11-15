import {it,expect} from 'vitest';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {referenceGridFilter} from '../../src/pipeline/media-generation/reference-board-filters.js';
it('letterboxes odd-height PNG and subsampled JPEG references without overflowing the pad cell',()=>{
 const root=mkdtempSync(join(tmpdir(),'hw-reference-grid-'));
 try{
  const portrait=join(root,'odd.png'),square=join(root,'square.jpg'),output=join(root,'board.png');
  execFileSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','testsrc=size=749x937:rate=1','-frames:v','1',portrait],{windowsHide:true,stdio:'pipe'});
  execFileSync('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','testsrc2=size=1024x1024:rate=1','-frames:v','1',square],{windowsHide:true,stdio:'pipe'});
  const before=[readFileSync(portrait),readFileSync(square)];
  execFileSync('ffmpeg',['-v','error','-nostdin','-i',portrait,'-i',square,'-filter_complex',referenceGridFilter([portrait,square]),'-frames:v','1',output],{windowsHide:true,stdio:'pipe'});
  const bytes=readFileSync(output);expect(bytes.readUInt32BE(16)).toBe(1872);expect(bytes.readUInt32BE(20)).toBe(936);
  expect(readFileSync(portrait)).toEqual(before[0]);expect(readFileSync(square)).toEqual(before[1]);
 }finally{if(root.startsWith(join(tmpdir(),'hw-reference-grid-')))rmSync(root,{recursive:true,force:true});}
},15000);
