"""Local-only representative test packaging; never accepts chapter media."""
import hashlib,json,pathlib,shutil,sqlite3,subprocess,wave
root=pathlib.Path('outputs/mark6-production'); ops=root/'representative-test-20261104'
assets=pathlib.Path('C:/Users/danbr/HeartWordData/assets'); target=assets/'generated/hatam/mark-6/representative-test-20261104'
target.mkdir(parents=True,exist_ok=True)
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def copy(src,dst):
 if dst.exists():
  if sha(src)!=sha(dst): raise RuntimeError('Existing derivative differs; preserve it')
 else: shutil.copy2(src,dst)
def ff(args): subprocess.run(['ffmpeg','-v','error','-nostdin','-n',*map(str,args)],check=True,capture_output=True)
db=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True)
brief,result=map(json.loads,db.execute('SELECT brief_json,result_json FROM production_runs WHERE id=?',('25ed817f-cae7-4a39-86af-8ce9429295e7',)).fetchone())
manifest={'status':'test_inputs_prepared_not_film_acceptance','projectId':brief['project']['id'],'dataDir':str(assets.parent),'root':str(target),'sourceClock':[352254,374198.5],'crop':{'x':160,'y':0,'width':960,'height':540},'actors':{},'references':[],'testOnly':True}
for name,quote,char,version,shot in [
 ('herod','quote-10','ea55907f-cc31-45c5-9492-75fcaa94c424','fd15ad49-29a4-441e-941f-28fcf1ec12cd','2730f65e-4245-4ed5-addc-89e78e564a41'),
 ('daughter','quote-11','42f51d17-acdb-411c-b8a6-20fda0798a14','25998f25-6300-4d1f-92d5-44541a9d8957','88fb7cf6-1df3-4003-ad71-85752611f4a1')]:
 src=ops/f'{name}-start-v1.png'; dst=target/src.name;copy(src,dst)
 native=target/f'{name}-native-start-v1.png'
 if not native.exists(): ff(['-i',dst,'-vf','scale=1152:648,pad=1280:704:64:40,fillborders=left=64:right=64:top=40:bottom=16:mode=smear','-frames:v','1',native])
 preview=ops/f'{name}-crop-preview-v2.png'
 if not preview.exists(): ff(['-i',native,'-vf','crop=960:540:160:0','-frames:v','1',preview])
 audio=next(r for r in json.loads((root/'level-matched-cast-candidates.json').read_text(encoding='utf-8-sig'))['rows'] if r['id']==quote)
 if sha(audio['path'])!=audio['sha256']: raise RuntimeError('Calibrated audio changed')
 roleDirections={role:next(d for d in result['contributions'][role]['directions'] if d['shotId']==shot) for role in ['cinematographer','choreographer','staging_designer','costume_designer','lighting_designer']}
 cv=db.execute('SELECT status,voice_id FROM character_versions WHERE id=? AND character_id=?',(version,char)).fetchone()
 if not cv or cv[0]!='approved': raise RuntimeError('Canon not approved')
 manifest['actors'][name]={'quoteId':quote,'characterId':char,'versionId':version,'voiceId':cv[1],'shotId':shot,'frame':str(native),'frameSha256':sha(native),'audio':audio['path'],'audioSha256':audio['sha256'],'samples':audio['sampleCount'],'sampleRate':audio['sampleRate'],'roleDirections':roleDirections}
 for ref in ['headshot.png','neutral-standing.png']:
  path=assets/'characters'/('herod-antipas' if name=='herod' else 'herodias-daughter')/'v1'/ref
  manifest['references'].append({'path':str(path),'sha256':sha(path)})
mixFolder=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102'
for name,filename,expected in [('dialogue','complete-source-clock-dialogue-candidate.wav','e48634f5f60d96ad2e5aa57e6d1b73edc29c378318c081b9787493c4879f0724'),('mix','complete-source-clock-score-mix-candidate.wav','b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547')]:
 src=mixFolder/filename
 if sha(src)!=expected: raise RuntimeError('Approved-balance source-clock master changed')
 with wave.open(str(src),'rb') as w:
  if w.getframerate()!=24000 or w.getnchannels()!=2: raise RuntimeError('Unexpected audio format')
  start=round(352254*24);end=round(374198.5*24);w.setpos(start);pcm=w.readframes(end-start);params=w.getparams()
 dst=target/f'{name}-exact-excerpt.wav'
 if not dst.exists():
  with wave.open(str(dst),'wb') as w:w.setparams(params);w.writeframes(pcm)
 with wave.open(str(dst),'rb') as w:
  if w.getnframes()!=526668 or w.readframes(w.getnframes())!=pcm: raise RuntimeError('Excerpt differs from exact master samples')
 manifest[name]={'source':str(src),'sourceSha256':expected,'path':str(dst),'sha256':sha(dst),'sampleRate':24000,'samples':526668}
score=assets/'generated/hatam/mark-6/approved-score-reference-v3.wav'
if sha(score)!='a9c688cb41fb67fe31fd790a69354898217dbdaadaf4980d9ac6f5f16138599c': raise RuntimeError('Approved score changed')
manifest['scoreReference']={'path':str(score),'sha256':sha(score),'finalGainDb':0,'additionalDucking':False}
manifest['notes']=['Other chapter Costume blockers remain unresolved. No accepted plan or final asset selection claimed.','Existing technical directions inaccurately mention quote-09 when discussing quote-10. This test binds measured quote-10 only; quote-09 remains separate.','Staging owns off-camera geography: Herod camera-left, daughter camera-right toward off-camera mother.','Per-frame crop previews require actual visual inspection before generation; these dimensions are not a universal recipe.']
(ops/'inputs.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');(target/'inputs.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
db.close();print(json.dumps({'status':manifest['status'],'durationSeconds':526668/24000,'newModelCalls':0,'root':str(target)}))
