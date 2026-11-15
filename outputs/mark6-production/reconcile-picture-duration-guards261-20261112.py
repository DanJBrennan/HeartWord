from pathlib import Path
import json,datetime,sqlite3
p=Path('outputs/mark6-production/checkpoints');src=p/'proposed-source-picture-editor-edits-through-touch261-20261112.json';dest=p/'proposed-source-picture-editor-edits-through-touch261-duration-reconciled-20261112.json';assert not dest.exists();d=json.loads(src.read_text());before=json.loads(src.read_text());changes=[]
for i,samples in [(6,24),(7,24),(108,168),(109,168),(110,168),(111,168)]:
 a,b=d['edits'][i:i+2];oldcut=a['sourceClockSamples24k'][1];cut=oldcut-samples;a['sourceClockSamples24k'][1]=cut;b['sourceClockSamples24k'][0]=cut
 changes.append(dict(boundaryAfterEdit=i,oldSample=oldcut,newSample=cut,pictureOnlyDeltaMs=-samples/24))
for e in d['edits']:
 e['sourceClockMs']=[n/24 for n in e['sourceClockSamples24k']]
 e['durationMs']=(e['sourceClockSamples24k'][1]-e['sourceClockSamples24k'][0])/24
roundframe=lambda n:int(n*24/1000+.5)
assert all(a['sourceClockSamples24k'][1]==b['sourceClockSamples24k'][0] for a,b in zip(d['edits'],d['edits'][1:]));db=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True)
for i,(old,e) in enumerate(zip(before['edits'],d['edits'])):
 assert [roundframe(n) for n in old['sourceClockMs']]==[roundframe(n) for n in e['sourceClockMs']],('changedcut',i)
 assert e['expectedOutputFrames']==roundframe(e['sourceClockMs'][1])-roundframe(e['sourceClockMs'][0]),('framecount',i)
 cap=db.execute('SELECT timeline_end_ms-timeline_start_ms FROM clips WHERE generation_attempt_id=?',(e['clipId'],)).fetchone()[0];assert e['sourceStartMs']+e['durationMs']<=cap+1,('duration',i,e['durationMs'],cap)
 assert e['sourceStartMs']*24/1000+e['expectedOutputFrames']<=d['physicalMedia'][e['exactEditorMediaPath']]['frames']+1e-7,('capacity',i)
assert abs(sum(e['durationMs'] for e in d['edits'])-788791)<1e-6;db.close();d['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();d['pictureOnlyBoundaryReconciliations']=changes;dest.write_text(json.dumps(d,indent=2));proof=dict(at=d['at'],status='all120_same_actual_picture_allocations_fit_existing_duration_guard',originalDraft=str(src),reconciledDraft=str(dest),changes=changes,reason='Nominal picture boundaries move1ms across edits6-7 and7ms across108-111 until existing accepted spare capacity. Physical global frame cuts/counts unchanged. No source audio/speaker boundaries moved.',allActualFrameCutsAndCountsUnchanged=True,sourceAudioAndSpeakerTimingUnchanged=True,newFreezePaddingOrRetime=False,providerCalls=0,databaseWrites=0,wholeFilmReady=False);(p/'picture-nominal-boundary-duration-reconciliation261-20261112.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof))
