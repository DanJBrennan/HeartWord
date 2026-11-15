# Read-only exact-path mapping to EXISTING editor IDs; no pipeline implementation.
from pathlib import Path
import json,sqlite3,datetime
r=Path('outputs/mark6-production');assets=Path('C:/Users/danbr/HeartWordData/assets');recipe=json.loads((r/'checkpoints/source-only-accepted-review-interval-recipe-20261110.json').read_text(encoding='utf8'))
dbp=assets.parent/'db/heartword.sqlite';db=sqlite3.connect(dbp.as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=[dict(x) for x in db.execute("SELECT ga.id AS editorClipId,ga.shot_id AS shotId,ga.result_asset_path AS path,ga.status,c.id AS assemblyClipTableId,c.timeline_end_ms-c.timeline_start_ms AS durationMs FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id JOIN shots sh ON sh.id=ga.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND ga.operation='assemble_shot' AND ga.status='accepted'",('c457a815-d07d-4902-91b5-7b936b549856',))]
db.close()
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def key(p):
 p=Path(p)
 if p.is_absolute():p=p.relative_to(assets)
 return p.as_posix().lower()
by={}
for x in rows:by.setdefault(key(x['path']),[]).append(x)
matched=[];missing=[]
for interval in recipe['orderedReviewIntervals']:
 evidence=Path(interval['evidence']);root=read(evidence);parts=[]
 if interval['evidenceKind']=='aggregate_or_review_derivative':
  manifest=Path(interval['manifestEvidence']) if interval.get('manifestEvidence') else evidence.parent/'manifest.json';parts=read(manifest)['inputs']
 else:
  selection=evidence if evidence.name=='selection-and-assembly.json' else evidence.parent/'selection-and-assembly.json'
  if selection.exists():
   s=read(selection);parts=[{'attemptId':interval['attemptId'],'clipId':interval['clipId'],'path':str(assets/s['assembled']['assembledVideoPath']),'selectionEvidence':str(selection),'frames':s.get('pictureFrames',s.get('frames'))}]
  else:missing.append({'evidence':str(evidence),'reason':'No sibling exact selection-and-assembly record','folderJsonFiles':[p.name for p in evidence.parent.glob('*.json')]});continue
 for part in parts:
  originalPath=part.get('path');path=originalPath;selection=part.get('selectionFile')
  if path and 'generated/assembled/' not in Path(path).as_posix().lower() and selection:
   s=read(selection);path=str(assets/s['assembled']['assembledVideoPath'])
  matches=by.get(key(path),[]) if path else []
  if len(matches)!=1:missing.append({'evidence':str(evidence),'input':originalPath,'resolvedAssemblyPath':path,'selectionEvidence':selection,'matchingAcceptedAssemblies':len(matches)});continue
  a=matches[0];matched.append({'reviewInterval':interval['sourceMs'],'reviewEvidence':str(evidence),'reviewInput':part,'inputWasOriginalCandidate':originalPath!=path,'acceptedNativeAttemptId':part.get('attemptId',part.get('rawAttemptId')),'acceptedNativeClipTableId':part.get('clipId'),'editorialMedia':a,'reason':'Exact reviewed retained assembly path resolves to current accepted assemble_shot record, NOT nativeclipID or filenameUUID guessing','actualFileExists':(assets/a['path']).exists(),'notFinalTimelineCommand':True})
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Exact path lookup in current accepted assemble_shot records; editorclipId is generation_attempts.id for assemble_shot, distinct from clips.id and nativegeneration/selectedclip IDs','sourceRecipe':'checkpoints/source-only-accepted-review-interval-recipe-20261110.json','matched':matched,'missing':missing,'databaseWrites':0,'providerCalls':0,'notSavedEditorialRunOrCompleteCut':True,'wholeFilmReady':False};p=r/'checkpoints/reviewed-media-to-existing-editor-ids-20261110.json';p.write_text(json.dumps(report,indent=2));print(json.dumps({'saved':str(p),'matchedComponentMedia':len(matched),'missing':missing,'acceptedEditorRecordsRead':len(rows),'databaseWrites':0,'providerCalls':0}))
