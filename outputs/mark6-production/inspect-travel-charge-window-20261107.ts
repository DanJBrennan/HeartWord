// Local actual-frame evidence for either completed continuation, never acceptance.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const window=Number(process.argv[2]);if(![2,3].includes(window))throw Error('Explicit window2 or3 required');
const top=resolve('outputs/mark6-production'),folder=top+`/speaking-execution/travel-charge-window${window}-native-continuation-20261107`,db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:4*1024*1024});
try{
 const result=read(folder+'/result.json'),id=result.attemptId,pre=read(top+`/speaking-source-preflight/jesus-travel-charge-window${window}/preflight.json`);validateAttemptRevision(db,data,'c457a815-d07d-4902-91b5-7b936b549856',id);
 const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='lip_sync' AND status='hold_for_review'").get(id,pre.shotId);if(!row?.result_asset_path)throw Error('Actual complete held continuation required');
 const video=join(data,'assets',String(row.result_asset_path)),root=dirname(video),line=read(root+'/line.json'),c=line.crop;
 if(line.status!=='complete_line_held_for_review'||line.outputSha256!==hash(video)||line.fullLineAudioSha256!==hash(root+'/full-line.wav')||line.plan.sampleCount!==pre.fullLineSamples||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.sections.length!==pre.plan.sections.length||c.x!==160||c.y!==0||c.width!==960||c.height!==540)throw Error('Exact completed source/plan/crop required');
 const contacts=[];let samples=0,frames=0;
 for(const s of line.sections){
  if(s.sourceStartSample!==samples||s.pictureStartFrame!==frames||hash(s.rawPath)!==s.rawSha256||hash(s.nativeInput.path)!==s.inputImageSha256)throw Error('Actual native/source/input lineage changed');
  const contact=join(folder,`complete-section-${s.index}-all-retained.png`);
  ff(['-i',s.rawPath,'-vf',`trim=end_frame=${s.retainedFrames},crop=960:540:160:0,scale=240:135,tile=10x${Math.ceil(s.retainedFrames/10)}:padding=2:margin=2`,'-frames:v','1',contact]);
  contacts.push({index:s.index,contact,frames:s.retainedFrames});samples=s.sourceEndSample;frames+=s.retainedFrames;
 }
 const indices=[...new Set(line.sections.flatMap((s:any)=>[s.pictureStartFrame-1,s.pictureStartFrame,s.pictureStartFrame+1]).filter((n:number)=>n>=0)),frames-1],joins=join(folder,'complete-window-joins-and-end.png');
 ff(['-i',video,'-vf',`select='${indices.map(n=>`eq(n,${n})`).join('+')}',scale=480:270,tile=4x${Math.ceil(indices.length/4)}:padding=2:margin=2`,'-frames:v','1',joins]);
 const tail=line.sections.at(-1),geometry=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',tail.rawPath],{encoding:'utf8',windowsHide:true})).streams.find((s:any)=>s.codec_type==='video'),carry=root+'/last-retained-native-carry.png',select=`select=eq(n\\,${tail.lastRetainedFrameIndex})`,crop='crop=960:540:160:0';
 ff(['-i',tail.rawPath,'-vf',`${select},${crop},pad=${geometry.width}:${geometry.height}:160:0,fillborders=left=160:right=${geometry.width-1120}:top=0:bottom=${geometry.height-540}:mode=smear`,'-frames:v','1',carry]);
 const rgb=(p:string,filter:string)=>ff(['-i',p,'-vf',filter,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']),original=rgb(tail.rawPath,`${select},${crop}`);
 if(!original.equals(rgb(carry,crop)))throw Error('Selected native ending face pixels changed');
 const proof={at:new Date().toISOString(),kind:'actual_last_retained_native_frame_projection',attemptId:id,lineOutputSha256:line.outputSha256,sourceRaw:tail.rawPath,sourceRawSha256:tail.rawSha256,nativeFrameIndex:tail.lastRetainedFrameIndex,globalPictureFrame:frames-1,nativeGeometry:[geometry.width,geometry.height],crop:c,endingImagePath:carry,endingImageSha256:hash(carry),retainedFaceRgbSha256:createHash('sha256').update(original).digest('hex'),exactFacePixelsUnchanged:true,sourceSamplesAtBoundary:pre.endSample,completeQuoteSamples:2239200,qualityApproval:false,providerCalls:0,limitations:'Actual projection only; use continuation solely after actual complete-window selection. No synthetic/Codex reference or native Hatam approval.'};
 writeFileSync(carry+'.proof.json',JSON.stringify(proof,null,2),{flag:'wx'});
 writeFileSync(folder+'/complete-window-local-evidence.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,samples,frames,contacts,joins,joinAndEndFrameIndices:indices,endingProof:carry+'.proof.json',qualityApproval:false,providerCalls:0},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:id,samples,frames,contacts,joins}));
}finally{db.close();}
