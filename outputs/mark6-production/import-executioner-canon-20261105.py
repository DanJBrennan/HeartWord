"""Additive, delegated visual-canon adoption through existing canon/cast tables.
Default preflights. --apply commits only at a terminal crew boundary. No voices,
source edits, new shots, provider calls, schema changes or production dispatch.
"""
import json,hashlib,sqlite3,shutil,uuid,time,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent;DATA=Path('C:/Users/danbr/HeartWordData');DB=DATA/'db/heartword.sqlite';PROJECT='c457a815-d07d-4902-91b5-7b936b549856'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False),encoding='utf-8')
def rows(c,sql,args=()):return [dict(r) for r in c.execute(sql,args)]
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
auth=read(ROOT/'authorization.json');resume=read(ROOT/'full-production-resumption-20261105.json')
assert auth['status']=='explicitly_authorized' and not auth['productionHold'] and resume['fullProductionHoldLifted']
shots={'72a59708-601c-45c3-83f4-4865ac74d86c':'Mark 6:27','30917d11-1f9f-420e-aa03-a9a8c7372b2d':'Mark 6:27-28','4896fbf4-4628-4a53-9b30-863bd5639c16':'Mark 6:28'}
sources=[('headshot','executioner-headshot-candidate-v1.png','368de4c5fddba5ff2ef55c67abcd14253bfd84a8961b7b246110fa8804847f86'),('body_pose','executioner-standing-candidate-v1.png','c56d7b8561dc9aad6b4d4e5bbd4768701aab93180a836fba1d873c4fb9be9592'),('turnaround','executioner-pose-sheet-candidate-v1.png','a9d4223b3428a4593986dbc544d6574d4491373573c0de05b0f69b5798ea461b')]
for _,name,h in sources:assert sha(DATA/'assets/preparation/mark6-reference-corrections-20261105'/name)==h
with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as c:
 c.row_factory=sqlite3.Row
 assert not c.execute("SELECT id FROM production_runs WHERE project_id=? AND status='running'",(PROJECT,)).fetchone()
 assert not c.execute("SELECT id FROM characters WHERE region='Papuan' AND lower(name) LIKE '%executioner%'").fetchone(),'Existing role needs reconciliation, never duplicate'
 for sid,verse in shots.items():
  row=dict(c.execute('SELECT sh.*,s.project_id FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE sh.id=?',(sid,)).fetchone());assert row['project_id']==PROJECT and row['verse_ref']==verse and row['needs_lip_sync']==0 and row['dialogue_character_id'] is None and 'executioner' in row['action'].lower()
if '--apply' not in sys.argv:print(json.dumps({'status':'preflight_passed_no_changes','newChapterScopedRole':1,'assets':3,'existingShotsBound':3,'newSpeechOrSourceChange':False}));sys.exit(0)
assert not (ROOT/'executioner-canon-adoption-20261105.json').exists(),'Existing receipt; inspect instead of repeating'
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=DATA/'backups'/('mark6-executioner-canon-'+stamp);backup.mkdir(exist_ok=False)
with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(backup/'heartword-before.sqlite') as target:
 src.backup(target);assert target.execute('PRAGMA quick_check').fetchone()[0]=='ok'
cid=str(uuid.uuid4());vid=str(uuid.uuid4());folder=DATA/'assets/characters/unnamed-executioner-mark6/v1';folder.mkdir(parents=True,exist_ok=False);assets=[]
for kind,name,h in sources:
 source=DATA/'assets/preparation/mark6-reference-corrections-20261105'/name;dest=folder/name
 with source.open('rb') as src,dest.open('xb') as target:shutil.copyfileobj(src,target)
 assert sha(dest)==h;assets.append({'id':str(uuid.uuid4()),'category':kind,'path':str(dest.relative_to(DATA/'assets')).replace('\\','/'),'sha256':h,'sourcePath':str(source)})
authority="Dan's November2 autonomous Mark6 completion instruction, reaffirmed November5. Codex performs routine faithful visual-canon/casting completion under that delegation; no personal Dan inspection, historical uniform, native approval or voice approval is claimed."
facts='Unnamed executioner in Mark6 only, a source-attested nonspeaking role, not an invented personal name. Distinct sturdy adult Papuan/Melanesian man with broad rounded face, broad nose, short dense black curls, clean-shaven cheeks/chin, medium-dark brown skin and bare head. Plain dark earth-brown short-sleeved below-knee linen tunic with simple central slit neckline; plain brown leather belt with small rectangular buckle; flat strapped brown leather sandals. No mantle, jewelry, armor, rank insignia or new head covering. Clothing is an explicit artistic reconstruction, not a historical uniform claim. Neutral empty-handed reference poses do not replace source-required actions/props in the film.'
inspection={'identity':'Codex directly compared standing source, matching portrait and FRONT/SIDE/WALK faces: recognizable same broad rounded clean-shaven adult face, broad nose, short curls, sturdy proportions and skin tone. BACK is a coherent proposed view, not old historical evidence. Distinct from the bearded named men; no invented age or biography.','wardrobe':'FRONT/BACK/SIDE/WALK show consistent plain short sleeves, slit neckline, brown below-knee tunic, leather belt/rectangular buckle, flat strapped sandals and bare head. All feet/heads visible, no mantle/jewelry/armor/insignia. The neutral step is a reference pose, not added film narrative. Actual film targets remain subject to normal canon/AV checks.'}
provenance={'at':datetime.now(timezone.utc).isoformat(),'characterId':cid,'versionId':vid,'scope':{'kind':'chapter','book':'mark','chapter':6},'roleName':'Unnamed executioner (Mark 6)','authority':authority,'reviewer':'Codex (Dan-delegated production review)','assets':assets,'facts':facts,'inspection':inspection,'generationRequests':['outputs/mark6-production/reference-corrections-20261105/executioner/request.json','outputs/mark6-production/reference-corrections-20261105/executioner-portrait/request.json','outputs/mark6-production/wardrobe-sheets-20261105/executioner-poses/request.json'],'billing':'Included builtin image usage; exact per-call dollar cost unreported, no paid fallback. No calls made by import.','voice':None,'shotIds':list(shots)}
save(folder/'provenance.json',provenance);now=int(time.time()*1000)
c=sqlite3.connect(DB,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('PRAGMA busy_timeout=5000');c.execute('BEGIN IMMEDIATE')
try:
 assert not c.execute("SELECT id FROM production_runs WHERE project_id=? AND status='running'",(PROJECT,)).fetchone()
 tables=['characters','character_versions','character_assets'];before={t:rows(c,'SELECT * FROM '+t+' ORDER BY id') for t in tables};before_audio=rows(c,'SELECT * FROM audio_segments WHERE project_id=? ORDER BY id',(PROJECT,));before_shots={sid:dict(c.execute('SELECT * FROM shots WHERE id=?',(sid,)).fetchone()) for sid in shots};before_cast={tuple(r) for r in c.execute('SELECT shot_id,character_id FROM shot_characters')};old_fk={tuple(r) for r in c.execute('PRAGMA foreign_key_check')};save(backup/'canon-before.json',before)
 c.execute("INSERT INTO characters(id,name,scope_kind,scope_book,scope_chapter,canon_status,region,created_at,updated_at) VALUES(?,?,'chapter','mark',6,'candidate','Papuan',?,?)",(cid,'Unnamed executioner (Mark 6)',now,now))
 c.execute("INSERT INTO character_versions(id,character_id,version_label,status,voice_provider,voice_id,locked_visual_facts,notes,created_at) VALUES(?,?,'v1','candidate',NULL,NULL,?,?,?)",(vid,cid,json.dumps({'description':facts,'prohibitedPromptPhrases':[]}),facts+' '+authority+' Provenance: '+str((folder/'provenance.json').relative_to(DATA/'assets')).replace('\\','/'),now))
 for a in assets:c.execute('INSERT INTO character_assets(id,character_version_id,category,path,content_hash,imported_from,asset_role,created_at) VALUES(?,?,?,?,?,?,?,?)',(a['id'],vid,a['category'],a['path'],a['sha256'],'Included built-in reference; '+a['sourcePath'],'scene_reference' if a['category']=='headshot' else 'base_pose',now))
 for i,domain in enumerate(['identity','wardrobe']):
  note={'kind':'delegated_visual_canon_review','domain':domain,'outcome':'approved','reviewer':provenance['reviewer'],'authority':authority,'assetSetSha256':digest(assets),'assetHashes':[a['sha256'] for a in assets],'evidence':inspection[domain],'noVoiceApproval':True,'noPersonalDanInspectionClaim':True}
  c.execute("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'character_version',?,'qc',?,0,?)",(str(uuid.uuid4()),PROJECT,vid,json.dumps(note),now+i))
 c.execute("UPDATE characters SET canon_status='approved' WHERE id=?",(cid,));c.execute("UPDATE character_versions SET status='approved' WHERE id=?",(vid,))
 for sid in shots:c.execute('INSERT INTO shot_characters(shot_id,character_id) VALUES(?,?)',(sid,cid))
 for t in tables:
  after={r['id']:r for r in rows(c,'SELECT * FROM '+t)};assert all(after[r['id']]==r for r in before[t]);assert len(after)-len(before[t])=={'characters':1,'character_versions':1,'character_assets':3}[t]
 assert {tuple(r) for r in c.execute('SELECT shot_id,character_id FROM shot_characters')}==before_cast|{(sid,cid) for sid in shots}
 assert rows(c,'SELECT * FROM audio_segments WHERE project_id=? ORDER BY id',(PROJECT,))==before_audio
 assert all(dict(c.execute('SELECT * FROM shots WHERE id=?',(sid,)).fetchone())==row for sid,row in before_shots.items())
 assert {tuple(r) for r in c.execute('PRAGMA foreign_key_check')}==old_fk;c.commit()
except BaseException:c.rollback();raise
finally:c.close()
receipt={'status':'delegated_executioner_visual_canon_adopted_and_existing_shots_bound','at':datetime.now(timezone.utc).isoformat(),**provenance,'backup':str(backup/'heartword-before.sqlite'),'allExistingCanonRowsPreserved':True,'onlyThreeCastLinksAdded':True,'shotActionTimingAndDialogueRowsUnchanged':True,'allProjectAudioRowsUnchanged':True,'newForeignKeyIssues':0,'newProviderCalls':0,'noPaidFallback':True,'sourceMusicVoicesUnchanged':True,'newCrewContextRequired':True};save(ROOT/'executioner-canon-adoption-20261105.json',receipt);print(json.dumps({'status':receipt['status'],'characterId':cid,'versionId':vid,'assets':3,'castLinks':3,'voice':None,'allExistingCanonPreserved':True,'sourceAudioUnchanged':True}))
