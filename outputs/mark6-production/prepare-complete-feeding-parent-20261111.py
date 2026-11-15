from pathlib import Path
import json,sqlite3,hashlib,subprocess,datetime,zipfile,xml.etree.ElementTree as E,re
top=Path('outputs/mark6-production');folder=top/'complete-feeding-parent-source-window-20261111';data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets'
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'));h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
draft=read(top/'checkpoints/proposed-source-picture-editor-edits-through-baskets216-20261111.json');edits=[e for e in draft['edits'] if e['sourceClockMs'][1]>579613.875]
assert len(edits)==11 and edits[0]['sourceClockMs'][0]==579613.875 and edits[-1]['sourceClockMs'][1]==650729
assert all(a['sourceClockMs'][1]==b['sourceClockMs'][0] for a,b in zip(edits,edits[1:]))
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
source=dict(db.execute('SELECT * FROM audio_segments WHERE id=?',('65b2c3e7-e04e-4738-b177-3c23e861e945',)).fetchone());binding=dict(db.execute('SELECT * FROM project_source_bindings WHERE project_id=?',('c457a815-d07d-4902-91b5-7b936b549856',)).fetchone())
assert source['start_ms']==579613.875 and source['end_ms']==650729 and source['confidence']==70
for e in edits:
 row=db.execute("SELECT id,result_asset_path,status FROM generation_attempts WHERE id=? AND operation='assemble_shot' AND shot_id=?",(e['clipId'],e['shotId'])).fetchone()
 assert row and row['status']=='accepted' and row['result_asset_path']==e['exactEditorMediaPath']
 assert Path(e['reviewEvidence']).exists() and e['allPhysicalFramesExist']
db.close();folder.mkdir(exist_ok=True)
ff=lambda args:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+args)
probe=lambda p:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
frames=lambda p:[l.split(',')[-1].strip() for l in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if l and not l.startswith('#')]
pk=lambda p,k:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams',k,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',str(p)]))['packets']
paths=[assets/e['exactEditorMediaPath'] for e in edits];expected=[];components=[];cuts=[];cursor=0
for e,p in zip(edits,paths):
 s=probe(p);assert len(s)==1 and s[0]['width']==1280 and s[0]['height']==720 and s[0]['r_frame_rate']=='24/1'
 a,b=e['actualSourceFrameRange'];fs=frames(p);assert 0<=a<b<=len(fs) and b-a==e['expectedOutputFrames'];expected+=fs[a:b]
 components.append({'editorClipId':e['clipId'],'acceptedNativeAttemptId':e['selectedSourceNativeAttemptId'],'shotId':e['shotId'],'path':str(p),'sha256':h(p),'sourceClockMs':e['sourceClockMs'],'actualSourceFrameRange':[a,b],'parentPictureRange':[cursor,cursor+b-a],'reviewEvidence':e['reviewEvidence']})
 cursor+=b-a;cuts.append(cursor)
assert cursor==1706 and len(expected)==1706
# Lossless re-encoding retains exact decoded accepted NORMAL pictures, including
# the real final-used basket217. This is a review derivative, not an edit commit.
filters=[]
for i,e in enumerate(edits):
 a,b=e['actualSourceFrameRange'];filters.append(f'[{i}:v]trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS[v{i}]')
filters.append(''.join(f'[v{i}]' for i in range(len(edits)))+f'concat=n={len(edits)}:v=1:a=0[out]')
pic=folder/'all-accepted-normal1706-lossless-picture-review-only.mp4'
ff(['-filter_complex_threads','1']+sum((['-i',str(p)] for p in paths),[])+['-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','0','-pix_fmt','yuv420p','-threads','2','-fps_mode','passthrough',str(pic)])
actual=frames(pic);assert len(actual)==1706 and actual==expected
v=probe(pic);assert len(v)==1 and int(v[0]['nb_read_frames'])==1706 and v[0]['r_frame_rate']=='24/1'
master=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav';assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
start,end=13910733,15617496;assert start/24==579613.875 and end/24==650729 and end-start==1706763
wav=folder/'complete-approved-source-parent.wav';ref=folder/'continuous-approved-reference.m4a';whole=folder/'complete-feeding-parent-approved-mix.mp4';flt=f'atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS'
pcm=lambda p,f=None:ff(['-i',str(p)]+(['-af',f] if f else [])+['-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-'])
ff(['-i',str(master),'-af',flt,'-c:a','pcm_s16le',str(wav)]);audio=pcm(wav);assert len(audio)==1706763*4 and audio==pcm(master,flt)
ff(['-i',str(wav),'-c:a','aac','-b:a','120k',str(ref)]);ff(['-i',str(pic),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(whole)])
assert pk(whole,'v:0')==pk(pic,'v:0') and pk(whole,'a:0')==pk(ref,'a:0') and int(next(s for s in probe(whole) if s['codec_type']=='audio')['duration_ts'])==1706763
# Whole-parent checks concern chronology/narration and cuts; each component has
# separate all-picture/canon/physics review. These are explicitly sampled boards.
ff(['-i',str(whole),'-vf','fps=1,scale=320:180,tile=8x9','-frames:v','1',str(folder/'actual-parent-sampled-1fps.png')])
sel='+'.join(f'eq(n,{n})' for c in cuts[:-1] for n in [c-2,c-1,c,c+1]);ff(['-i',str(whole),'-vf',f"select='{sel}',scale=320:180,tile=4x10",'-frames:v','1',str(folder/'actual-parent-ten-cut-edges.png')])
texts={}
for lang,key,hashkey in [('hatam','docx_path','docx_hash'),('english-esv','reference_path','reference_hash')]:
 p=assets/binding[key];assert h(p)==binding[hashkey];z=zipfile.ZipFile(p);root=E.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};paragraphs=[''.join(t.text or '' for t in q.findall('.//w:t',ns)) for q in root.findall('.//w:p',ns)];hits=[x for x in paragraphs if '39' in x and '44' in x];assert len(hits)==1;t=hits[0];t=t[t.index('39'):];t=re.split(r'45(?=[A-Za-z])',t)[0];texts[lang]={'path':str(p),'sha256':h(p),'verses':'Mark6:39-44','text':t}
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Continuous complete Mark6:39-44 uncertain parent review; NOT final film or new native word timing','sourceWindowMs':[579613.875,650729],'sourceSampleRange24k':[start,end],'sourceSamples24k':end-start,'sourceDurationMs':(end-start)/24,'frames':1706,'fps':24,'pictureDurationMs':1706/24*1000,'audioMinusPictureMs':(end-start)/24-1706/24*1000,'all1706DecodedPicturesIdenticalToAcceptedNormalSelections':True,'decodedFrameHashesSha256':hashlib.sha256('\n'.join(actual).encode()).hexdigest(),'components':components,'internalCutsFrame':cuts[:-1],'sourceParent':source,'sourceTexts':texts,'whole':str(whole.resolve()),'wholeSha256':h(whole),'selectedPicture':str(pic.resolve()),'selectedPictureSha256':h(pic),'exactApprovedMasterPcmVerified':True,'aacPacketsIdenticalToContinuousReference':True,'videoPacketsIdenticalToSelectedPicture':True,'sourceMaster':str(master),'sourceMasterSha256':h(master),'nativeAudioExcluded':True,'allCanonSourceMusicVoicesUnchanged':True,'capacity218Excluded':True,'lastUsedBasketNormalFrame':217,'actualWholeParentQualityReviewPending':True,'providerCalls':0,'databaseWrites':0,'wholeFilmReady':False}
(folder/'review-preparation-proof.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8');print(json.dumps({'frames':1706,'sourceSamples':end-start,'wholeBytes':whole.stat().st_size,'decodedPicturesMatch':True,'whole':str(whole)}))
