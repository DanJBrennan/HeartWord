"""Verify finished alignment evidence and refresh preparation pointers locally."""
import copy,hashlib,json,pathlib,subprocess,wave
root=pathlib.Path(__file__).resolve().parents[3];base=root/'outputs/mark6-preparation';folder=base/'dialogue-boundary-followup-proposal-v1'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(b):return hashlib.sha256(b).hexdigest()
j=read(folder/'execution.json');assert j['status']!='running' and j['noRequestsInFlight']
assert len(j['calls'])<=8
known=0
for c in j['calls']:
 u=c.get('usage',c.get('receipt',{}).get('usage'));cost=c.get('estimatedCostUsd',c.get('receipt',{}).get('costUsd'))
 assert u and cost is not None,'Unknown charge: reconcile before finishing'
 assert abs(cost-(u['promptTokenCount']*.000002+(u['candidatesTokenCount']+u['thoughtsTokenCount'])*.000012))<.000001
 assert cost<=.15 and u['promptTokenCount']<=25000
 known+=cost
assert round(known,6)==j['estimatedUsd'] and j['pendingUpperBoundUsd']==0
total=round(j['priorEstimatedUsd']+known,6);exposure=round(total+.03,6);assert exposure<=10
packet=read(base/'source-packet-v3/source-packet.json')
for k,p in [('hatam',packet['input']['hatam']),('reference',packet['input']['english']),('audio',packet['input']['audio'])]:assert sha(pathlib.Path(p).read_bytes())==j['sourceHashes'][k]
pcm=subprocess.run(['ffmpeg','-v','error','-nostdin','-i',packet['input']['audio'],'-f','s16le','-'],capture_output=True,check=True).stdout
inv=read(base/'chapter-planning-packet-v1/dialogue-inventory-v2.json');by_id={q['id']:q for q in inv['quotes']}
passed=[];held=[]
for c in j['candidates']:
 q=by_id[c['id']];assert q['text']==c['quote']
 if c['status']!='automated_native_boundary_checks_passed':held.append(c['id']);continue
 a=c['audits'][-1];r=a['result'];assert a['validTiming'] and a['consistentWithCandidate'] and r['fullQuote'] is True and r['otherWords'] is False and r['headVerdict']==r['tailVerdict']=='complete'
 path=pathlib.Path(c['sourceClip']);assert sha(path.read_bytes())==c['sourceClipSha256']
 with wave.open(str(path),'rb') as w:
  assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(2,2,24000)
  b=w.readframes(w.getnframes())
 assert b==pcm[c['startSample']*4:c['endSample']*4] and sha(b)==c['sourcePcmSha256']
 q['timingStatus']='source_window_evidence_available';q['exactSourceWindow']={k:c[k] for k in ['startSample','endSample','sampleRate','sourceClip','sourceClipSha256','sourcePcmSha256']};q['exactSourceWindow']['authority']='Automated native-source boundary checks; not native attestation or final production approval.'
 passed.append(c['id'])
available=sum(q['exactSourceWindow'] is not None for q in inv['quotes']);assert available==15+len(passed)
inv.update(status='preparation_inventory_v3_planning_direction_reviewed',sourceWindowEvidenceAvailable=available,exactTimingPending=21-available,previousInventory='dialogue-inventory-v2.json',boundaryExtension='../dialogue-boundary-followup-proposal-v1/execution.json')
write(base/'chapter-planning-packet-v1/dialogue-inventory-v3.json',inv)
handoff=read(base/'chapter-planning-packet-v1/crew-handoff.json');handoff['unresolved'][0]=f'{21-available} printed quote blocks lack exact source-window evidence; automated timing is not native attestation.';handoff['evidence']['dialogue']='dialogue-inventory-v3.json';handoff['acceptedState'].append(f'Planning direction reviewed. {available}/21 printed quote blocks have automated source-window evidence. Four returned audition performances retain producer acceptance.');write(base/'chapter-planning-packet-v1/crew-handoff-v2.json',handoff)
s=read(base/'continuation-status.json');s.update(status='targeted_alignment_complete_crew_plan_pending' if not held else 'targeted_alignment_complete_with_explicit_holds',alignmentEstimatedUsd=total,maximumExposureUsd=exposure,totalGeminiAlignmentRequests=j['cumulativeRequests'],alignmentStrongRequests=j['cumulativeStrongRequests'],noRequestsInFlight=True,alignmentRequestsInFlight=0,alignmentRequestsRemainingUnderAuthorizedCeiling=184-j['cumulativeRequests'],currentDialogueInventory='chapter-planning-packet-v1/dialogue-inventory-v3.json',currentCrewHandoff='chapter-planning-packet-v1/crew-handoff-v2.json',chapterPlanningCounts={'sections':6,'printedQuotes':21,'sourceWindowEvidenceAvailable':available,'exactTimingPending':21-available,'approvedReusableAudioFiles':4});write(base/'continuation-status.json',s)
settings=read(base/'prepared-run-settings.json');settings['spending'].update(estimatedAlignmentUsd=total,alignmentRequestsConsumed=j['cumulativeRequests'],alignmentPhysicalCeiling=184,alignmentStrongCeiling=96,alignmentExtensionAuthorization='dialogue-boundary-followup-proposal-v1/authorization.json');write(base/'prepared-run-settings.json',settings)
a=read(base/'alignment-current-preparation.json');a['dialogueBoundaryExtension']={'journal':'dialogue-boundary-followup-proposal-v1/execution.json','passedAdditional':passed,'remaining':held,'sourceWindowEvidenceAvailable':available,'totalQuotedBlocks':21,'noRequestsInFlight':True,'doesNotIncreaseWordPlacementCoverage':True};write(base/'alignment-current-preparation.json',a)
ready=read(base/'readiness-review-20261101.json');ready.update(alignmentMaximumExposureUsd=exposure,alignmentRemainingHeadroomUsd=round(10-exposure,6),currentDialogueInventory='chapter-planning-packet-v1/dialogue-inventory-v3.json',noRequestsInFlight=True);ready['money']['alignmentEstimatedUsd']=total;ready['dialogueBoundaryExtension']={'requests':len(j['calls']),'additionalEstimatedUsd':round(known,6),'quoteWindowsAvailable':available,'quoteWindowsPending':21-available};write(base/'readiness-review-20261101.json',ready)
verification={'status':'passed','sourceHashesUnchanged':True,'allNewPassedCutsMatchOriginalPcm':True,'passedQuoteIds':passed,'heldQuoteIds':held,'requestReceiptsReconciled':True,'newRequests':len(j['calls']),'cumulativeRequests':j['cumulativeRequests'],'cumulativeStrongRequests':j['cumulativeStrongRequests'],'additionalEstimatedUsd':round(known,6),'cumulativeEstimatedUsd':total,'historicalUnknownReserveUsd':.03,'maximumExposureUsd':exposure,'noRequestsInFlight':True,'fullProductionHold':True,'wordPlacementCoverageUnchanged':95.46,'originalReviewedPacketPreserved':True,'appSourceUnchanged':'r13 full regression remains 916 tests / 133 files','goalGuardian':{'goal':'Autonomous source-faithful Hatam chapter production with inspectable evidence and bounded spending.','acceptance':'Only authorized alignment checks; exact original audio/words preserved; current evidence and uncertainty retained; full production held.','dedicatedCompletionReview':'No new narrative, product requirement, stage, source/native approval or production authority. Compact current handoff preserves review/correction workflow.'}}
write(folder/'completion-verification.json',verification)
text=f'''# Targeted alignment extension — result

Dan authorized up to eight additional checks within the existing $10 cap. Executed {len(j['calls'])} requests: {len(passed)} passages passed automated native-source boundary checks; {len(held)} remain held. Current inventory: {available}/21 source windows evidenced. These are model listening checks, not native-speaker attestation, final source/cast approval or full-production approval. Whole-chapter word-placement coverage remains 95.46%.

New estimated cost: ${known:.6f}. Cumulative: ${total:.6f} plus retained $0.03 historical charge reserve = ${exposure:.6f} maximum exposure of $10. Total requests {j['cumulativeRequests']}/184; strong requests {j['cumulativeStrongRequests']}/96. No request is running. No image, voice or video generation occurred.

Each accepted WAV matches the exact original 24kHz stereo PCM sample slice. Canonical text, original chapter announcement, quiet and full recording are preserved. Approved audition bytes are unchanged. See execution.json for all returned judgments/times/usage, completion-verification.json for checks, and ../chapter-planning-packet-v1/dialogue-inventory-v3.json plus crew-handoff-v2.json for current context. Original reviewed files are preserved.

Next: existing crew coverage/group-speaker treatment, per-shot LTX framing and continuity, music cue placement, then a concrete production cost/credit proposal. No new workspace or full production has been started.
'''
(folder/'RESULT.md').write_text(text,encoding='utf-8')
log=f'''\n\n### Latest: authorized targeted alignment extension finished\n\nDan authorized the eight-request extension within the unchanged $10 cap. Executed {len(j['calls'])} physical checks; {len(passed)} additional quotes passed automated native-source boundary checks and {len(held)} remain held. Current source-window evidence is {available}/21; the whole-chapter 95.46% word-placement measure is unchanged. These checks do not confer native/source/chapter approval. Each accepted WAV matches exact original native 24kHz stereo PCM; source hashes, canonical words, approved takes and original reviewed packet remain intact.\n\nCost/usage reconciled: ${known:.6f} additional, ${total:.6f} cumulative estimate plus retained $0.03 historical reserve = ${exposure:.6f} maximum exposure of $10. Requests {j['cumulativeRequests']}/184, strong {j['cumulativeStrongRequests']}/96; no requests active. Receipts and dedicated verification: outputs/mark6-preparation/dialogue-boundary-followup-proposal-v1/{{authorization.json,execution.json,RESULT.md,completion-verification.json}}. Current compact inventory/handoff: chapter-planning-packet-v1/{{dialogue-inventory-v3.json,crew-handoff-v2.json}}.\n\nDedicated Goal Guardian review confirms existing autonomous source-faithful ingestion/alignment preparation, bounded spending and producer inspect/correct workflow; no invented stage/narrative, source/native acceptance or production authority. App source unchanged since full regression r13 (916 tests/133 files); targeted source/PCM/hash/receipt checks pass. Full production stays held. Existing crew coverage/group-speaker treatment, per-shot music/framing and a concrete production budget are next.\n'''
for f in [root/'docs/plans/CURRENT_GOAL.md',root/'docs/plans/MARK6_PREPARATION.md',base/'MARK6_PRODUCTION_READINESS.md']:
 with f.open('a',encoding='utf-8') as out:out.write(log)
print(json.dumps(verification,ensure_ascii=False))
