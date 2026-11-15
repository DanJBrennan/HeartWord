import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,renameSync} from 'node:fs';
import {join,resolve,sep,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {selectFinalVideoRange} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
import {exportChapterPackage,restoreChapterPackage} from '../../src/pipeline/assembly/chapter-package.js';
import {validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
vi.mock('../../src/pipeline/creative-direction/crew-store.js',async original=>({...await original<object>(),...(await import('../helpers/reviewed-plan-gate.js')).reviewedPlanGateFixture,validateAttemptRevision:vi.fn()}));
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const roots:string[]=[];afterEach(()=>{vi.unstubAllEnvs();vi.mocked(validateAttemptRevision).mockReset();for(const root of roots.splice(0)){if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!basename(root).startsWith('hw-video-range-'))throw Error('Unsafe fixture cleanup');rmSync(root,{recursive:true,force:true});}});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'hw-video-range-'));roots.push(root);vi.stubEnv('HEARTWORD_DATA_DIR',root);mkdirSync(join(root,'assets/generated'),{recursive:true});
 const source=join(root,'assets/generated/original.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=128x72:rate=24','-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{windowsHide:true});
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('src/db/schema.sql','utf8'));db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',6,1,1);INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('s','p',1,'Mark 6:2','Mark 6:2',1);INSERT INTO shots(id,scene_id,sequence,action,needs_lip_sync,created_at)VALUES('sh','s',1,'quiet listeners',0,1);INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('native','sh','ltx_local','fast','generate_final_video','hold_for_review','generated/original.mp4',0,1)");
 return{root,source,db};
}
const review={reviewer:'Recorded test reviewer',evidence:'Only original frames6-17 pass picture review; other frames remain held.'};
const hashes=(path:string,filter?:string)=>execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:v:0','-an',...(filter?['-vf',filter]:[]),'-f','framemd5','-'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1)!.trim());
describe('reviewed non-speaking native frame selection',()=>{
 it('retains exact interior decoded frames, silent media and original held lineage',()=>{const f=fixture();try{
  const before=createHash('sha256').update(readFileSync(f.source)).digest('hex'),range=selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root),output=join(f.root,'assets',range.path);
  expect(hashes(output)).toEqual(hashes(f.source).slice(6,18));expect(range.durationMs).toBe(500);expect(createHash('sha256').update(readFileSync(f.source)).digest('hex')).toBe(before);
  expect(f.db.prepare('SELECT status,result_asset_path FROM generation_attempts WHERE id=?').get('native')).toMatchObject({status:'hold_for_review',result_asset_path:'generated/original.mp4'});
  expect(f.db.prepare('SELECT provider,operation,status,cost_usd FROM generation_attempts WHERE id=?').get(range.attemptId)).toMatchObject({provider:'ffmpeg',operation:'trim_final_video',status:'accepted',cost_usd:0});
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8',windowsHide:true})).streams;expect(streams.map((s:any)=>s.codec_type)).toEqual(['video']);
  expect(JSON.parse(readFileSync(output+'.json','utf8'))).toMatchObject({parentAttemptId:'native',range:{startFrame:6,endFrameExclusive:18},sourceUnchanged:true,newProviderCalls:0,nativeAudioExcluded:true});
 }finally{f.db.close();}});
 it('reuses the same retained selection and holds changed derivative bytes',()=>{const f=fixture();try{
  const a=selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root),b=selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root);expect(b.reused).toBe(true);expect(b.clipId).toBe(a.clipId);expect(f.db.prepare('SELECT count(*) n FROM clips').get()!.n).toBe(1);
  writeFileSync(join(f.root,'assets',a.path),'changed');expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root)).toThrow(/changed/);
 }finally{f.db.close();}});
 it('selects only exact reviewed crop pixels, preserves duration and distinguishes crop recipes',()=>{const f=fixture();try{
  const crop={x:16,y:8,width:64,height:36},input={startFrame:6,endFrameExclusive:18,crop},before=createHash('sha256').update(readFileSync(f.source)).digest('hex');
  const a=selectFinalVideoRange(f.db,'p','native',input,review,f.root),output=join(f.root,'assets',a.path);
  expect(hashes(output)).toEqual(hashes(f.source,'trim=start_frame=6:end_frame=18,setpts=PTS-STARTPTS,crop=64:36:16:8'));
  expect(JSON.parse(readFileSync(output+'.json','utf8'))).toMatchObject({version:2,range:input,sourceGeometry:{width:128,height:72},selectedGeometry:{width:64,height:36},frames:12,durationMs:500,nativeAudioExcluded:true,newProviderCalls:0});
  expect(assembleSingleShot(f.db,'sh')).toMatchObject({durationMs:500,hasDialogueAudio:false});
  expect(selectFinalVideoRange(f.db,'p','native',input,review,f.root)).toMatchObject({clipId:a.clipId,reused:true});
  const other=selectFinalVideoRange(f.db,'p','native',{...input,crop:{...crop,x:18}},review,f.root),whole=selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root);
  expect(new Set([a.clipId,other.clipId,whole.clipId]).size).toBe(3);expect(createHash('sha256').update(readFileSync(f.source)).digest('hex')).toBe(before);
  expect(f.db.prepare("SELECT status FROM generation_attempts WHERE id='native'").get()!.status).toBe('hold_for_review');
 }finally{f.db.close();}});
 it('rejects unsafe crop geometry and stale crop reviews without selecting media',()=>{const f=fixture();try{
  for(const crop of [{x:-2,y:0,width:64,height:36},{x:1,y:0,width:64,height:36},{x:0,y:0,width:0,height:36},{x:0,y:0,width:64,height:73},{x:80,y:0,width:64,height:36},{x:0,y:NaN,width:64,height:36}])expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18,crop},review,f.root)).toThrow(/crop/i);
  vi.mocked(validateAttemptRevision).mockImplementation(()=>{throw Error('stale revision');});expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18,crop:{x:16,y:8,width:64,height:36}},review,f.root)).toThrow(/stale/);
  expect(f.db.prepare('SELECT count(*) n FROM clips').get()!.n).toBe(0);
 }finally{f.db.close();}});
 it('rejects foreign, speaking, unreviewed or out-of-bounds selections and stale revision',()=>{const f=fixture();try{
  expect(()=>selectFinalVideoRange(f.db,'foreign','native',{startFrame:6,endFrameExclusive:18},review,f.root)).toThrow(/non-speaking/);
  expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:30},review,f.root)).toThrow(/exceeds/);
  expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},{reviewer:'',evidence:''},f.root)).toThrow(/named/);
  f.db.exec("UPDATE shots SET needs_lip_sync=1 WHERE id='sh'");expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root)).toThrow(/non-speaking/);f.db.exec("UPDATE shots SET needs_lip_sync=0 WHERE id='sh'");
  vi.mocked(validateAttemptRevision).mockImplementation(()=>{throw Error('stale revision');});expect(()=>selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root)).toThrow(/stale/);expect(f.db.prepare('SELECT count(*) n FROM clips').get()!.n).toBe(0);
 }finally{f.db.close();}});
 it('feeds the existing single-shot assembly without selecting the rejected prefix',()=>{const f=fixture();try{
  selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18},review,f.root);const assembled=assembleSingleShot(f.db,'sh');expect(assembled.durationMs).toBe(500);expect(assembled.hasDialogueAudio).toBe(false);expect(f.db.prepare("SELECT count(*) n FROM generation_attempts WHERE operation='assemble_shot' AND status='accepted'").get()!.n).toBe(1);
 }finally{f.db.close();}});
 it('preserves the parent, range proof and selection across an independent restore',()=>{const f=fixture();try{
  const text=join(f.root,'assets/fixture-source.docx'),reference=join(f.root,'assets/fixture-reference.docx'),audio=join(f.root,'assets/generated/fixture-source.wav');writeFileSync(text,'synthetic package source fixture');writeFileSync(reference,'synthetic package reference fixture');
  execFileSync('ffmpeg',['-v','error','-i',f.source,'-vn','-c:a','pcm_s16le',audio],{windowsHide:true});const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
  f.db.prepare("INSERT INTO project_source_bindings VALUES('p',?,'generated/fixture-source.wav',?,'non_drama',?,?,?,'legacy',1)").run(text,reference,hash(text),hash(audio),hash(reference));
  f.db.exec("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('source','p','original_reading','generated/fixture-source.wav',0,1000,'Mark 6:2',1)");
  const crop={x:16,y:8,width:64,height:36},selection=selectFinalVideoRange(f.db,'p','native',{startFrame:6,endFrameExclusive:18,crop},review,f.root),pack=join(f.root,'package'),restored=join(f.root,'restored');
  exportChapterPackage(f.db,f.root,'p',pack,{includeApplication:false});restoreChapterPackage(pack,restored);
  const originalAssets=resolve(f.root,'assets'),hidden=resolve(f.root,'unavailable-assets');for(const target of [originalAssets,hidden])if(!target.startsWith(resolve(f.root)+sep))throw Error('Unsafe fixture move');renameSync(originalAssets,hidden);
  vi.stubEnv('HEARTWORD_DATA_DIR',restored);const reopened=new DatabaseSync(join(restored,'db/heartword.sqlite'));try{
   const same=selectFinalVideoRange(reopened,'p','native',{startFrame:6,endFrameExclusive:18,crop},review,restored);expect(same.reused).toBe(true);expect(same.clipId).toBe(selection.clipId);
   expect(JSON.parse(readFileSync(join(restored,'assets',selection.path)+'.json','utf8')).parentAttemptId).toBe('native');
   expect(assembleSingleShot(reopened,'sh').durationMs).toBe(500);
  }finally{reopened.close();}
 }finally{f.db.close();}});
});
