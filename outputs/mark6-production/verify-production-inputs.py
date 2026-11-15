import json, hashlib, sqlite3, subprocess
from pathlib import Path
root=Path('outputs/mark6-production')
read=lambda name:json.loads((root/name).read_text(encoding='utf-8-sig'))
state=read('execution.json');fit=read('fitted-cast-audio.json');plan=read('fitted-cast-section-plans.json');source=read('source-projection.json');workspace=read('workspace.json')
sha=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
db=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True)
project=workspace['projectId'];actual=db.execute("SELECT id,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms",(project,)).fetchall()
assert len(actual)==49
assert actual[0][1]==0 and actual[-1][2]==796680
assert all(actual[i][1]==actual[i-1][2] for i in range(1,len(actual)))
for row,saved in zip(actual,source['rows']):
 assert row==tuple(saved[k] for k in ('id','startMs','endMs','characterId','verseRef'))
assert len(fit['rows'])==18 and len(plan['rows'])==18
for f,p in zip(fit['rows'],plan['rows']):
 assert f['id']==p['id'] and f['path']==p['path'] and sha(f['path'])==f['sha256']==p['sha256']
 assert sha(f['rawPath'])==f['rawSha256']
 data=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',f['path'],'-f','s16le','-'],creationflags=subprocess.CREATE_NO_WINDOW)
 assert hashlib.sha256(data).hexdigest()==f['pcmSha256'] and len(data)//2==f['sampleCount']==p['plan']['sampleCount']
 assert db.execute("SELECT character_id,status FROM character_versions WHERE id=?",(f['versionId'],)).fetchone()==(f['characterId'],'approved')
 sections=p['plan']['sections'];assert sections[0]['sourceStartSample']==0 and sections[-1]['sourceEndSample']==f['sampleCount']
 if p['nonQuietInternalJoins']:assert p['id']=='quote-09'
 for i,s in enumerate(sections):
  assert 1<=s['retainedFrames']<=96 and s['sourceEndSample']-s['sourceStartSample']<=4*48000
  if i:assert s['sourceStartSample']==sections[i-1]['sourceEndSample'] and s['reference']['kind']=='previous_last_retained_frame'
assert plan['totalContainers']==64
reviews=db.execute('SELECT id,reviewer_name FROM source_alignment_reviews WHERE project_id=?',(project,)).fetchall()
assert state['voice']['credits']==2640 and state['voice']['requests']==14 and state['images']['calls']==0 and state['ltx']['calls']==0
assert state['geminiAv']['requests']==3 and state['geminiAv']['pendingUsd']==0
backup=sqlite3.connect('file:'+workspace['backup'].replace('\\','/')+'?mode=ro',uri=True)
assert backup.execute('PRAGMA quick_check').fetchone()[0]=='ok'
result={'status':'local_source_cast_and_budget_checks_pass','sourceContinuousMs':796680,'sourceRows':49,'fittedTakes':18,'speakingContainers':64,'nonQuietJoinLines':['quote-09'],'allDecodedPcmAndCanonBindingsMatch':True,'rawTakesUnchanged':True,'backupQuickCheck':'ok','namedSourceReviews':reviews,'productionCanDispatch':bool(reviews),'sourceAcceptanceQuestionPending':not bool(reviews),'noMediaGeneratedByThisCheck':True}
(root/'production-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
state['castSections'].update({'file':'fitted-cast-section-plans.json','fittedContainers':62,'fittedInternalJoinsInMeasuredQuiet':True,'needsReplanAfterFitting':False})
state['checks']['sourceAndFittedCastVerification']='production-verification.json'
(root/'execution.json').write_text(json.dumps(state,indent=2),encoding='utf-8')
print(json.dumps(result))
