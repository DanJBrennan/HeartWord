// Local media evidence only. Never submits, selects, or changes source audio.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const folder=resolve('outputs/mark6-production/speaking-execution/charge-window1-active-articulation-recovery-20261107'),project='c457a815-d07d-4902-91b5-7b936b549856',db=getDb(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:4*1024*1024});
try{
 const result=read(folder+'/result.json'),id=result.attemptId;validateAttemptRevision(db,getDataDir(),project,id);
 const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND operation='lip_sync' AND status='hold_for_review'").get(id);if(!row)throw Error('Actual complete held candidate required');
 const video=join(getDataDir(),'assets',String(row.result_asset_path)),root=dirname(video),linePath=join(root,'line.json'),line=read(linePath),c=line.crop;
 if(line.status!=='complete_line_held_for_review'||line.outputSha256!==hash(video)||line.fullLineAudioSha256!==hash(join(root,'full-line.wav'))||line.plan.sampleCount!==700000||line.plan.totalFrames!==350||line.sections.length!==5||c.x!==160||c.y!==0||c.width!==960||c.height!==540)throw Error('Actual exact completed window/crop required');
 // The initial reference is an original full PNG, not a cropped native carry.
 // Preserve the pre-correction manifest before correcting this descriptive field.
 if(line.sections[0].nativeInput.cropAtGeneration!==null){
  if(line.sections[0].nativeInput.sha256!==hash(line.sections[0].nativeInput.path))throw Error('Initial actual native input changed');
  const before=hash(linePath);writeFileSync(join(root,`line-before-initial-input-description-${before}.json`),readFileSync(linePath),{flag:'wx'});
  line.sections[0].nativeInput.cropAtGeneration=null;
  line.initialInputDescriptionCorrection={at:new Date().toISOString(),priorManifestSha256:before,reason:'Initial full PNG has no native carry crop; actual input path/hash and all media unchanged.'};writeFileSync(linePath,JSON.stringify(line,null,2));
 }
 let samples=0,frames=0;const contacts=[];
 for(const s of line.sections){
  if(s.sourceStartSample!==samples||s.pictureStartFrame!==frames||hash(s.rawPath)!==s.rawSha256||hash(s.nativeInput.path)!==s.inputImageSha256||hash(join(root,`section-${s.index}.wav`))!==s.submittedAudioSha256)throw Error('Actual source/frame/input evidence changed');
  const contact=join(folder,`complete-section-${s.index}-all-retained.png`);
  ff(['-i',s.rawPath,'-vf',`trim=end_frame=${s.retainedFrames},crop=960:540:160:0,scale=240:135,tile=10x10:padding=2:margin=2`,'-frames:v','1',contact]);contacts.push({index:s.index,frames:s.retainedFrames,contact});samples=s.sourceEndSample;frames+=s.retainedFrames;
 }
 const indices=[...new Set(line.sections.flatMap((s:any)=>[s.pictureStartFrame-1,s.pictureStartFrame,s.pictureStartFrame+1]).filter((n:number)=>n>=0)),349];
 const joins=join(folder,'complete-window-joins-and-end.png');
 ff(['-i',video,'-vf',`select='${indices.map(n=>`eq(n,${n})`).join('+')}',scale=480:270,tile=4x4:padding=2:margin=2`,'-frames:v','1',joins]);
 const tail=line.sections.at(-1),geometry=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',tail.rawPath],{encoding:'utf8',windowsHide:true})).streams.find((s:any)=>s.codec_type==='video'),carry=join(root,'last-retained-native-carry.png'),select=`select=eq(n\\,${tail.lastRetainedFrameIndex})`,crop='crop=960:540:160:0';
 ff(['-i',tail.rawPath,'-vf',`${select},${crop},pad=${geometry.width}:${geometry.height}:160:0,fillborders=left=160:right=${geometry.width-1120}:top=0:bottom=${geometry.height-540}:mode=smear`,'-frames:v','1',carry]);
 const rgb=(p:string,filter:string)=>ff(['-i',p,'-vf',filter,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']),original=rgb(tail.rawPath,`${select},${crop}`);
 if(!original.equals(rgb(carry,crop)))throw Error('Ending projection changed retained native pixels');
 const proof={at:new Date().toISOString(),kind:'actual_last_retained_native_frame_projection',attemptId:id,lineOutputSha256:line.outputSha256,sourceRaw:tail.rawPath,sourceRawSha256:tail.rawSha256,nativeFrameIndex:tail.lastRetainedFrameIndex,globalPictureFrame:349,nativeGeometry:[geometry.width,geometry.height],crop:c,endingImagePath:carry,endingImageSha256:hash(carry),retainedFaceRgbSha256:createHash('sha256').update(original).digest('hex'),exactFacePixelsUnchanged:true,sourceSamplesAtBoundary:700000,completeQuoteSamples:2239200,qualityApproval:false,providerCalls:0,limitations:'Use for continuation only after actual complete-window acceptance; no synthetic keyframe or quality approval.'};
 writeFileSync(carry+'.proof.json',JSON.stringify(proof,null,2),{flag:'wx'});
 writeFileSync(folder+'/complete-window-local-evidence.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,samples,frames,contacts,joins,joinAndEndFrameIndices:indices,endingProof:carry+'.proof.json',qualityApproval:false,providerCalls:0},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:id,samples,frames,contacts,joins}));
}finally{db.close();}
