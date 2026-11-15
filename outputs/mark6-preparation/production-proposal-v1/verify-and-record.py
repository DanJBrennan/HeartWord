"""Dedicated local verification/Goal Guardian pass, no provider calls."""
import hashlib,json,pathlib,shutil,subprocess,wave,numpy as np
root=pathlib.Path(__file__).resolve().parents[3];base=root/'outputs/mark6-preparation';folder=base/'production-proposal-v1'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
packet=read(base/'source-packet-v3/source-packet.json');speak=read(folder/'speaking-estimate.json');coverage=read(folder/'coverage-draft.json');music=read(folder/'music-cues.json');budget=read(folder/'budget-draft.json')
for k,p in [('hatam',packet['input']['hatam']),('reference',packet['input']['english']),('audio',packet['input']['audio'])]:assert sha(p)==speak['sourceHashes'][k]
source=subprocess.run(['ffmpeg','-v','error','-nostdin','-i',packet['input']['audio'],'-f','s16le','-'],capture_output=True,check=True).stdout
with wave.open(str(folder/'mark6-music-preview.wav'),'rb') as w:
 assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(2,2,24000)
 data=w.readframes(w.getnframes())
assert len(source)==len(data)==19120320*4
a=np.frombuffer(source,dtype='<i2').reshape(-1,2).astype(float);b=np.frombuffer(data,dtype='<i2').reshape(-1,2).astype(float)
windows=[]
for start,end in [(.5,4.5),(64,88),(145,160),(229,239),(402,441),(719,723),(794,796.4)]:
 l,h=round(start*24000),round(end*24000);x=a[l:h,0];y=b[l:h,0];cor=float(np.corrcoef(x,y)[0,1]);gain=float(20*np.log10(np.linalg.norm(y)/np.linalg.norm(x)));assert cor>.99999 and abs(gain+5.5)<.002
 windows.append({'sourceSeconds':[start,end],'zeroLagCorrelation':cor,'gainDb':gain})
peak=float(np.max(np.abs(b))/32768);assert peak<.95
decoded=subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(folder/'mark6-music-preview.mp3'),'-f','s16le','-'],capture_output=True,check=True).stdout;assert len(decoded)==len(source)
assert len(coverage['beats'])==55
covered=set()
for beat in coverage['beats']:
 for v in beat['hatamEvidence']:covered.add(v['verse']);assert v['text']==next(x['text'] for x in packet['verses'] if x['verse']==v['verse'])
assert covered==set(range(1,57))
for q in speak['quotes']:
 if q.get('sectionCount') is None:continue
 sections=q['plan']['sections'];assert sections[0]['sourceStartSample']==0 and sections[-1]['sourceEndSample']==q['plan']['sampleCount']
 for i,c in enumerate(sections):
  assert c['sourceEndSample']>c['sourceStartSample'] and c['sourceEndSample']-c['sourceStartSample']<=24000*4
  if i:assert sections[i-1]['sourceEndSample']==c['sourceStartSample']
for i,c in enumerate(music['cues']):
 assert sha(c['assetPath'])==c['assetSha256']
 assert c['assetOutMs']>c['assetInMs'] and c['assetOutMs']-c['assetInMs']==c['sourceEndMs']-c['sourceStartMs']
 if i:assert music['cues'][i-1]['sourceEndMs']<=c['sourceStartMs']
assert budget['avReviewProposal']['combinedReservationUsd']==13*.15+17*.30
crew_bytes=(folder/'crew-input.json').stat().st_size;assert crew_bytes<200000
stable=pathlib.Path('C:/Users/danbr/OneDrive/Documents/HeartWord Review Samples/Mark 6 preparation - 2026-11-01');stable.mkdir(parents=True,exist_ok=True)
for name in ['mark6-music-preview.mp3','README.md','budget-draft.json','music-cues.json','coverage-draft.json','speaking-estimate.json','crew-input.json']:
 target=stable/name
 if target.exists():assert sha(target)==sha(folder/name),'Preserve existing review copy instead of overwriting different content'
 else:shutil.copy2(folder/name,target)
 assert sha(target)==sha(folder/name)
review={'status':'passed_local_checks_not_listening_or_crew_approval','coverageBeats':55,'all56VersesGroundedInExactHatamText':True,'sourceHashesUnchanged':True,'sourceNativeSampleCount':19120320,'sourceDecodedSeconds':796.68,'sourceContainerMetadataSeconds':796.696,'previewHasEveryDecodedSourceSamplePosition':True,'previewNativeSampleCount':19120320,'sourceNarrationGainDb':-5.5,'quietWindowClockChecks':windows,'previewPeakLinear':peak,'mp3DecodedSampleCountMatches':True,'scoreCues':13,'scheduledMusicSeconds':541,'scheduledPercent':67.91,'scheduledPercentDoesNotProveAudibility':True,'musicAssetsHashVerified':True,'speakingPartitionsCompleteNoSampleOmissionOrDuplication':True,'internalJoinsStillNeedReview':speak['quotesNeedingInternalJoinReview'],'quote19ExactCutHeld':True,'quote19ProposedTreatment':'Continuous original source audio under context picture: no isolated speech edit required, subject to crew acceptance.','crewInputBytes':crew_bytes,'newExternalGenerationOrReviewRequests':0,'stableReviewFolder':str(stable),'previewSha256':sha(folder/'mark6-music-preview.mp3'),'applicationCode':'Unchanged this unit; previous r13 916 tests/133 files retained.','goalGuardian':{'goal':'Autonomous source-faithful editable Hatam chapter with approved canon/voices, bounded context/cost and producer review.','acceptance':'Ground coverage in supplied text; preserve source clocks/words; reuse approved media; produce a reviewable local score and honest bounded cost proposal without full production.','dedicatedReview':'Passed: no new story event, translation, product requirement or pipeline stage. No fake crew consensus, native approval, shot acceptance, deployment or production/spending authority.','limitation':'Draft contains creative coverage/music choices for normal crew review; audition reuse and model checks do not confer chapter source/release approval.'},'fullProductionHold':True}
write(folder/'verification.json',review);write(stable/'verification.json',review)
status=read(base/'continuation-status.json');status.update(status='coverage_music_budget_draft_delivered_full_production_held',productionProposal='production-proposal-v1/README.md',productionBudgetDraft='production-proposal-v1/budget-draft.json',currentCrewHandoff='production-proposal-v1/crew-input.json',musicPreview=str(stable/'mark6-music-preview.mp3'),noRequestsInFlight=True,alignmentRequestsInFlight=0);write(base/'continuation-status.json',status)
ready=read(base/'readiness-review-20261101.json');ready['productionProposal']={'path':'production-proposal-v1/README.md','localOnly':True,'formalCrewAccepted':False,'coverageBeats':55,'namedSpeakingContainersSourceEstimate':43,'initialVideoRequestsSourceEstimate':128,'proposedVoiceCreditCap':4000,'proposedImageAllowanceCalls':64,'proposedAvUsd':8,'proposedLocalRequestCap':160,'musicPreview':str(stable/'mark6-music-preview.mp3'),'fullProductionHold':True};write(base/'readiness-review-20261101.json',ready)
log='''### Latest: Mark 6 coverage, score preview and budget draft prepared

Dan requested continuing preparation. Delivered outputs/mark6-preparation/production-proposal-v1/{README.md,coverage-draft.json,speaking-estimate.json,music-cues.json,budget-draft.json,crew-input.json,verification.json}. Fifty-five source-grounded coverage beats represent all 56 verses with exact Hatam/reference evidence. This is assistant preparation, not a fabricated/accepted multi-role storyboard. Recommended draft uses 13 named-character speech blocks and collective/reported source words over listener/context pictures; crew speaker decisions remain. Local source estimate: 43 five-second speaking containers plus 85 eight-second coverage containers = 128 initial video requests; proposed 160 with retakes. Showing all known dialogue gives 68 speaking/144 total before the held quote. Source-only partitions for quote-01/02/15/17 need internal-join review; final approved cast bytes must be replanned.

Created a local 13:16.680 source-clock music preview using 13 individually assigned existing Mark 5 instrumental excerpts, 541 seconds/67.91% scheduled coverage, deliberate quiet, fades, speech ducking and latency-compensated limiting. It uses original narration throughout, not final cast, and preserves every decoded source sample position. Native full decode is 19,120,320 stereo frames; MP3 container metadata is 16ms longer, not extra source speech. Seven music-free clock windows correlate above .99999 at zero lag with uniform -5.5dB source gain; WAV and MP3 sample counts match, peak is below limiter ceiling. Exact source/track hashes, quote partitions and verse coverage pass. Audibility/creative suitability still needs playback; measurements are not a listening verdict. Hash-matched preview and review files are in C:/Users/danbr/OneDrive/Documents/HeartWord Review Samples/Mark 6 preparation - 2026-11-01/.

Proposed, UNAUTHORIZED production envelopes: 4,000 existing voice credits/20 requests, 64 included-image calls, 160 local LTX requests for recommended coverage, and $8 independent Gemini AV review/30 physical requests ($7.05 combined reservation at token caps). Named-only known additional voicing estimates 1,685 credits; all known remaining quotations 2,885. Four approved takes are retained. No purchase/overage/paid image fallback, no new music generation. Current alignment exposure remains $1.332843; 184 physical/96 strong alignment requests exhausted. The one food-reply endpoint remains held for isolated voicing/lip-sync; carrying full continuous original source under context pictures is a proposed way to avoid that edit without losing words. It has not been promoted as accepted crew treatment.

Dedicated Goal Guardian pass preserves source-faithful autonomous pipeline and producer inspect/correct workflow: no new narrative/stage/feature, source/native/crew acceptance or full-production authority. No application source changes this unit; previous full regression r13 remains 916 tests/133 files. Local evidence/preview verification passes. No model, voice, image or video-generation call was made; preview is local assembly of existing audio only. Full production remains held pending existing crew emotional treatment/shot review, source/cast/framing gates and explicit production authority.
'''
goal=root/'docs/plans/CURRENT_GOAL.md';text=goal.read_text(encoding='utf-8');goal.write_text(text.replace('# Current Goal\n','# Current Goal\n\n'+log,1),encoding='utf-8')
for path in [root/'docs/plans/MARK6_PREPARATION.md',base/'MARK6_PRODUCTION_READINESS.md']:
 with path.open('a',encoding='utf-8') as f:f.write('\n\n'+log)
print(json.dumps({k:review[k] for k in ['status','sourceNativeSampleCount','previewNativeSampleCount','scoreCues','scheduledMusicSeconds','crewInputBytes','newExternalGenerationOrReviewRequests','stableReviewFolder','fullProductionHold']}))
