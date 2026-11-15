# Offline nominal cut-clock reconciliation within unchanged 24fps frame cells.
# Uses EXISTING editor limits/media; no metadata writes, pauses or core changes.
from pathlib import Path
import json,math,datetime,subprocess
from concurrent.futures import ThreadPoolExecutor
r=Path('outputs/mark6-production');f=r/'editorial-frame-grid-reconciliation-20261110';j=json.loads((r/'checkpoints/proposed-source-picture-editor-edits-through-seating193-20261110.json').read_text(encoding='utf8'));basis=json.loads((f/'accepted-basis-reaction22-proposal.json').read_text(encoding='utf8'));edits=j['edits'];original=json.loads(json.dumps(edits));assets=Path('C:/Users/danbr/HeartWordData/assets')
for e in edits:
 if e['clipId']=='38b75c5f-7a7a-4acf-a550-e859ceca69d0':
  a=basis['acceptedEditorMedia'];e.update(shotId=a['shotId'],clipId=a['editorClipId'],sourceStartMs=basis['sourceOffsetInExistingEditorMediaMs'],exactEditorMediaPath=a['path'],editorMediaDurationMs=a['durationMs'],acceptedExistingBasisRangeProposal=[170,192],requiresActualContextReviewAtFinalRender=True)
old=[original[0]['sourceClockSamples24k'][0]]+[e['sourceClockSamples24k'][1] for e in original];frame=lambda sample:(sample+500)//1000
cells=[(frame(t)*1000-499,frame(t)*1000+498) for t in old];cells[0]=(old[0],old[0]);cells[-1]=(old[-1],old[-1]);daughterBoundary=52;assert edits[daughterBoundary]['clipId']=='46796cca-9dd4-4076-bbe3-342c431b776f';k=frame(old[daughterBoundary])+1;cells[daughterBoundary]=(k*1000-499,min(k*1000+498,old[daughterBoundary]+1000));caps=[math.floor((e['editorMediaDurationMs']+1-e['sourceStartMs'])*24+1e-5) for e in edits];reach=[cells[0]]
for i,cap in enumerate(caps,1):
 lo=max(cells[i][0],reach[-1][0]+1);hi=min(cells[i][1],reach[-1][1]+cap)
 assert lo<=hi,('No existing-limit frame-preserving solution',i,lo,hi)
 reach.append((lo,hi))
x=[0]*len(old);x[-1]=old[-1]
for i in range(len(edits),0,-1):
 lo=max(reach[i-1][0],x[i]-caps[i-1]);hi=min(reach[i-1][1],x[i]-1);assert lo<=hi;x[i-1]=min(max(old[i-1],lo),hi)
assert x[0]==0 and x[-1]==14102733 and all(frame(a)==frame(b)+(1 if i==daughterBoundary else 0) for i,(a,b) in enumerate(zip(x,old)))
paths=sorted({e['exactEditorMediaPath'] for e in edits})
def probe(rel):
 p=assets/rel;v=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate,width,height','-of','json',str(p)]))['streams'][0];assert v['r_frame_rate']=='24/1';return rel,{'frames':int(v['nb_read_frames']),'width':v['width'],'height':v['height'],'fps':24}
cached=json.loads((f/'actual-accepted-editor-media-frame-counts.json').read_text(encoding='utf8'));media=cached['media'];assert set(paths)==set(media)

for i,e in enumerate(edits):
 count=frame(x[i+1])-frame(x[i]);first=round(e['sourceStartMs']*24/1000);assert first+count<=media[e['exactEditorMediaPath']]['frames'],('Real frames insufficient',i,first,count,media[e['exactEditorMediaPath']]);duration=(x[i+1]-x[i])/24;assert e['sourceStartMs']+duration<=e['editorMediaDurationMs']+1+1e-7
 e.update(durationMs=duration,sourceClockSamples24k=[x[i],x[i+1]],sourceClockMs=[x[i]/24,x[i+1]/24],originalRecipeSourceClockMs=original[i]['sourceClockMs'],expectedOutputFrames=count,actualSourceFrameRange=[first,first+count],allPhysicalFramesExist=True,unchangedGlobalFrameCut=(frame(x[i])==frame(old[i]) and frame(x[i+1])==frame(old[i+1])),editorialClockAdjustmentOnlyNotNativeWordTimes=True)
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'DRAFT existing-editor edits only, notapplied/currentapprovededitingrun/render/sourcealignment/portableproof','edits':edits,'sourceMs':[0,x[-1]/24],'sourceSamples24k':[0,x[-1]],'allSameGlobal24fpsFrameCuts':False,'onlyOneGlobalPictureBoundaryChangesByOneFrame':True,'changedGlobalBoundary':{'boundary':daughterBoundary,'originalSourceMs':old[daughterBoundary]/24,'proposedSourceMs':x[daughterBoundary]/24,'previousHerodVowNowUsesAll244AlreadyAcceptedPictures':True,'daughterOutwardUsesAll155AlreadyAcceptedPictures':True,'actualFinalJoinedContextReviewStillRequired':True},'frameCountEvidenceObservedAt':cached['at'],'allRequestedRealPicturesExist':True,'allExistingDurationLimitsPass':True,'maximumNominalBoundaryChangeMs':max(abs(a-b) for a,b in zip(x,old))/24,'changedBoundaryCount':sum(a!=b for a,b in zip(x,old)),'acceptedBasisReactionChange':'Use existingaccepted8s editor media ace40c4a-4faf-4f0a-bf3c-630dd7dbc925 frames170-191 incl instead21frame child171-191; actualall22/full170 viewed, quietclosedmouth/currentcanon. No newgeneration. Finaljoinedcontext stillrequiresactualreview.','physicalMedia':media,'noThresholdOrMetadataChange':True,'noNewOrRepeatedAudioPauseRetimeGainOrMusicChange':True,'audio':'Continuousapprovedglobalmaster; onlynominaleditorpictureboundaries move inside SAME encoded24fpscutcells. Sourceutterance/wordtimestamps untouched.','sourceAudioAndNativeWordTimesUnchanged':True,'nativeMovingPicturesNotRetimedOrFrozen':True,'actualFinalContextReviewPending':True,'coreChanges':0,'databaseWrites':0,'providerCalls':0,'wholeFilmReady':False};p=r/'checkpoints/proposed-source-picture-editor-edits-frame-grid-reconciled-20261110.json';p.write_text(json.dumps(proof,indent=2));print(json.dumps({'saved':str(p),'edits':len(edits),'physicalMediaProbed':len(media),'onlyOneGlobalBoundaryChangesByOneFrame':True,'allRealFramesExist':True,'existingDurationContractIssues':0,'maxNominalBoundaryChangeMs':proof['maximumNominalBoundaryChangeMs'],'changedBoundaries':proof['changedBoundaryCount'],'newProviderCalls':0,'applied':False}))
