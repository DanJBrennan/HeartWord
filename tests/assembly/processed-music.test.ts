import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {finishingRecipe} from '../../src/pipeline/assembly/finishing.js';
import type {CrewBrief,CrewResult} from '../../src/pipeline/creative-direction/crew-types.js';
function fixture(){
 const brief:CrewBrief={project:{id:'p',language:'hatam',book:'mark',chapter:6},source:{text:[],reference:[],hashes:[]},audio:[{id:'n',path:'dialogue.wav',startMs:0,endMs:2000,speakerId:null,verseRef:'Mark 6:1',confidence:99}],shots:[{id:'s',sceneId:'scene',sceneSequence:1,sequence:1,verseRef:'Mark 6:1',action:'Synthetic fixture',framing:null,cameraMovement:null,continuity:null,lighting:null,needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:{id:'v',path:'base.mkv',durationMs:2000}}],canon:[],producerNotes:[],spentUsd:0,audioAssets:[{id:'score',kind:'music',description:'Exact producer-approved processed score',path:'score.wav',sha256:'retained',durationMs:2000,processedMusic:{approvalId:'approval',includesDucking:true}}],render:{id:'cut',path:'base.mkv',durationMs:2000,sha256:'base',timeline:[{shotId:'s',startMs:0,endMs:2000}],audioMap:[{segmentId:'n',sourceStartMs:0,sourceEndMs:2000,startMs:0,endMs:2000}]}};
 const common={summary:'Retain approved source-clock sound',directions:[],findings:[]};
 const result:CrewResult={status:'approved',summary:'Ready',calls:0,contributions:{colorist:{...common,colorAdjustments:[]},sound_designer:{...common,audioCues:[],generationRequests:[]},composer:{...common,audioCues:[{assetId:'score',startMs:0,endMs:2000,sourceStartMs:0,gainDb:0,preserveApprovedMix:true,reason:'Producer-approved processing retained exactly once'}],generationRequests:[]}}};
 return{brief,result};
}
describe('producer-approved processed music in normal finishing',()=>{
 it('retains unity relative gain without second ducking or normalization',()=>{
  const{brief,result}=fixture(),recipe=finishingRecipe(brief,result);
  expect(recipe.inputs).toEqual(['score.wav']);expect(recipe.filter).toContain('volume=0dB');expect(recipe.filter).not.toContain('sidechaincompress');expect(recipe.filter).not.toContain('normalize=1');expect(recipe.filter).toContain('[0:a]anull[speech]');
 });
 it.each(['unapproved','missing_flag','increase','duplicate','overlapping_music'])('holds %s rather than changing the approved mix',state=>{
  const{brief,result}=fixture(),cue=result.contributions.composer!.audioCues![0]!;
  if(state==='unapproved')delete brief.audioAssets[0]!.processedMusic;
  if(state==='missing_flag')delete cue.preserveApprovedMix;
  if(state==='increase')cue.gainDb=1;
  if(state==='duplicate')result.contributions.composer!.audioCues!.push({...cue,gainDb:-12});
  if(state==='overlapping_music'){brief.audioAssets.push({id:'other',kind:'music',path:'other.wav',sha256:'other',description:'Other approved raw score',durationMs:2000});result.contributions.composer!.audioCues!.push({...cue,assetId:'other',preserveApprovedMix:false,gainDb:-30});}
  expect(()=>finishingRecipe(brief,result)).toThrow(state==='unapproved'?/processed music evidence/:state==='missing_flag'?/ducking/:state==='increase'?/outside/:/overlap/);
 });
 it.skipIf(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0)('preserves actual speech samples and score amplitude, with independent editable relative music gain',()=>{
  const dir=mkdtempSync(join(resolve(tmpdir()),'heartword-processed-score-')),ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-n',...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const pcm=(path:string)=>{const b=execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','s16le','-'],{windowsHide:true,maxBuffer:1024*1024});return new Int16Array(b.buffer,b.byteOffset,b.length/2);};
  try{
   ff(['-f','lavfi','-i','aevalsrc=0.12*sin(2*PI*440*t):s=24000:d=2','-ac','2','-c:a','pcm_s16le',join(dir,'dialogue.wav')]);
   ff(['-f','lavfi','-i','aevalsrc=0.015*sin(2*PI*220*t):s=24000:d=2','-ac','2','-c:a','pcm_s16le',join(dir,'score.wav')]);
   ff(['-f','lavfi','-i','color=gray:s=160x90:r=24:d=2','-i',join(dir,'dialogue.wav'),'-c:v','ffv1','-c:a','pcm_s16le','-t','2',join(dir,'base.mkv')]);
   const {brief,result}=fixture();
   const render=(name:string)=>{const rec=finishingRecipe(brief,result);const sound=rec.filter.split(';').filter(s=>!s.startsWith('[0:v]')).join(';');ff(['-i',join(dir,'base.mkv'),...rec.inputs.flatMap(p=>['-i',join(dir,p)]),'-filter_complex',sound,'-map',rec.audioLabel,'-c:a','pcm_s16le','-ar','24000',join(dir,name)]);return pcm(join(dir,name));};
   const voice=pcm(join(dir,'dialogue.wav')),score=pcm(join(dir,'score.wav')),mixed=render('mixed.wav');expect(mixed.length).toBe(voice.length);let maxError=0;for(let i=0;i<mixed.length;i++)maxError=Math.max(maxError,Math.abs(mixed[i]!-voice[i]!-score[i]!));expect(maxError).toBeLessThanOrEqual(1);
   result.contributions.composer!.audioCues![0]!.gainDb=-6;const quieter=render('quieter.wav');expect(quieter.length).toBe(voice.length);let bedPower=0,deltaPower=0;for(let i=0;i<quieter.length;i++){bedPower+=score[i]!**2;deltaPower+=(quieter[i]!-voice[i]!)**2;}expect(Math.sqrt(deltaPower/bedPower)).toBeCloseTo(10**(-6/20),3);
  }finally{if(dirname(dir)!==resolve(tmpdir())||!basename(dir).startsWith('heartword-processed-score-'))throw Error('Fixture cleanup target escapes temporary root');rmSync(dir,{recursive:true,force:true});}
 });
});
