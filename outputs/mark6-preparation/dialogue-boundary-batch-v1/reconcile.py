"""Local-only receipt reconciliation and preparation; makes no provider calls."""
import copy, hashlib, json, pathlib, subprocess, wave

root = pathlib.Path(__file__).resolve().parents[3]
base = root / 'outputs/mark6-preparation'
batch = base / 'dialogue-boundary-batch-v1'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(b): return hashlib.sha256(b).hexdigest()
j = read(batch/'execution.json')
backup = batch/'execution-before-reconciliation.json'
if not backup.exists(): backup.write_bytes((batch/'execution.json').read_bytes())
last = j['calls'][-1]
receipt = last['receipt']
assert receipt['finishReason']=='MAX_TOKENS'
u = receipt['usage']
cost = round(u['promptTokenCount']*0.000002+(u['candidatesTokenCount']+u['thoughtsTokenCount'])*0.000012,6)
assert cost==receipt['costUsd']==0.050514
last.update(status='charged_output_incomplete_no_retry',usage=u,estimatedCostUsd=cost)
j.update(status='partial_results_request_ceiling_reached',estimatedUsd=round(sum(c['estimatedCostUsd'] for c in j['calls']),6),pendingUpperBoundUsd=0,noRequestsInFlight=True,cumulativeRequests=176,cumulativeStrongRequests=88)
total = round(j['priorEstimatedUsd']+j['estimatedUsd'],6)
exposure = round(total+j['priorUnreportedUpperBoundUsd'],6)
assert total==1.242249 and exposure==1.272249
packet=read(base/'source-packet-v3/source-packet.json')
source=pathlib.Path(packet['input']['audio'])
assert sha(source.read_bytes())==j['sourceHashes']['audio']
pcm=subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(source),'-f','s16le','-'],check=True,capture_output=True).stdout
inventory=read(base/'chapter-planning-packet-v1/dialogue-inventory.json')
by_id={q['id']:q for q in inventory['quotes']}
passed=[]; remaining=[]
follow=base/'dialogue-boundary-followup-proposal-v1'; follow.mkdir(exist_ok=True)
contexts={'quote-14':(456000,481000),'quote-15':(519000,550000),'quote-17':(547000,565000),'quote-18':(560000,575000),'quote-19':(570000,585000),'quote-20':(702000,714000)}
for c in j['candidates']:
 q=by_id[c['id']]
 if 'quote' in c: assert q['text']==c['quote']
 if c['status']=='automated_native_boundary_checks_passed':
  path=pathlib.Path(c['sourceClip']); assert sha(path.read_bytes())==c['sourceClipSha256']
  with wave.open(str(path),'rb') as w:
   assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(24000,2,2)
   data=w.readframes(w.getnframes())
  assert data==pcm[c['startSample']*4:c['endSample']*4]
  assert sha(data)==c['sourcePcmSha256']
  q.update(timingStatus='source_window_evidence_available',exactSourceWindow={k:c[k] for k in ['startSample','endSample','sampleRate','sourceClip','sourceClipSha256','sourcePcmSha256']})
  q['exactSourceWindow']['authority']='Automated native-source boundary checks; not native attestation or production approval.'
  passed.append(c['id'])
 else:
  a,b=contexts[c['id']]; data=pcm[a*24*4:b*24*4]; path=follow/(c['id']+'-context.wav')
  with wave.open(str(path),'wb') as w:
   w.setnchannels(2);w.setsampwidth(2);w.setframerate(24000);w.writeframes(data)
  with wave.open(str(path),'rb') as w: assert w.readframes(w.getnframes())==data
  remaining.append({'id':c['id'],'verse':q['sourceVerseRef'],'attribution':q['sourceAttribution'],'canonicalQuote':q['text'],'priorStatus':c['status'],'reason':'Unverified phonetic transcription differs from supplied canonical text; use source listening, never replace words.' if c['status']=='location_unresolved' else 'Independent audit response truncated; partial JSON is not accepted evidence.','contextPath':str(path),'sourceStartMs':a,'sourceEndMs':b,'sampleRate':24000,'channels':2,'pcmSha256':sha(data),'fileSha256':sha(path.read_bytes()),'candidateIsOnlySearchLead':True})
assert len(passed)==8 and len(remaining)==6
inventory.update(status='preparation_inventory_v2_planning_direction_reviewed',sourceWindowEvidenceAvailable=15,exactTimingPending=6,previousInventory='dialogue-inventory.json',boundaryBatch='../dialogue-boundary-batch-v1/execution.json')
write(base/'chapter-planning-packet-v1/dialogue-inventory-v2.json',inventory)
proposal={'status':'prepared_not_authorized_not_executed','purpose':'Resolve six remaining printed dialogue boundary cases using original Hatam audio.','originalRequestCeiling':176,'requestsConsumed':176,'proposedAdditionalMaximumRequests':8,'proposedNewPhysicalCeiling':184,'proposedNewStrongCeiling':96,'initialSingleQuoteChecks':6,'additionalEvidenceDrivenCorrectionsMaximum':2,'automaticTransportRetries':0,'model':'gemini-3.1-pro-preview','maxOutputTokens':6144,'maxInputTokensPerCall':25000,'maxAggregateAudioBytesPerCall':14000000,'maxPromptAndSchemaBytesPerCall':25000,'perRequestReservationUsd':0.15,'additionalReservationMaximumUsd':1.2,'existingTotalDollarCapUsd':10,'currentEstimatedUsd':total,'retainedHistoricalUnknownChargeReserveUsd':0.03,'currentMaximumExposureUsd':exposure,'maximumExposureWithProposedReservationUsd':round(exposure+1.2,6),'haltOnUnknownCharge':True,'haltBeforeExceedingTotalCap':True,'haltOnMalformedOutputAndPreserveReceipt':True,'haltOnPriceOrModelMismatch':True,'cases':remaining,'fullProductionHold':True,'noVoiceImageVideoOrProductionAuthority':True,'instructions':'One quote per initial request. Use canonical text as a target, not a claim about what was heard. Report discrepancies or uncertainty explicitly. Return start/end relative to context zero; include complete-word head/tail and adjacent-word evidence. Candidate times are only leads. Retain native PCM; do not change words, infer syllable edges from verse markers or accept partial JSON. Independently check resulting cuts; hold any unresolved or contradictory result.'}
write(follow/'proposal.json',proposal)
write(batch/'execution.json',j)
status=read(base/'continuation-status.json')
status.update(status='planning_review_recorded_alignment_request_extension_needed',alignmentEstimatedUsd=total,maximumExposureUsd=exposure,totalGeminiAlignmentRequests=176,noRequestsInFlight=True,alignmentRequestsInFlight=0,alignmentOriginalCeilingRequests=176,alignmentRequestsRemainingUnderOriginalCeiling=0,currentDialogueInventory='chapter-planning-packet-v1/dialogue-inventory-v2.json',chapterPlanningCounts={'sections':6,'printedQuotes':21,'sourceWindowEvidenceAvailable':15,'exactTimingPending':6,'approvedReusableAudioFiles':4},alignmentFollowupProposal='dialogue-boundary-followup-proposal-v1/proposal.json')
write(base/'continuation-status.json',status)
settings=read(base/'prepared-run-settings.json');settings['spending'].update(estimatedAlignmentUsd=total,alignmentRequestsConsumed=176,alignmentPhysicalCeiling=176,alignmentFollowupProposal='dialogue-boundary-followup-proposal-v1/proposal.json');write(base/'prepared-run-settings.json',settings)
alignment=read(base/'alignment-current-preparation.json');alignment['dialogueBoundaryBatch']={'journal':'dialogue-boundary-batch-v1/execution.json','passedAdditional':passed,'remaining':[c['id'] for c in remaining],'sourceWindowEvidenceAvailable':15,'totalQuotedBlocks':21,'requestCeilingReached':True,'noRequestsInFlight':True};write(base/'alignment-current-preparation.json',alignment)
ready=read(base/'readiness-review-20261101.json');ready.update(alignmentMaximumExposureUsd=exposure,alignmentRemainingHeadroomUsd=round(10-exposure,6),currentDialogueInventory='chapter-planning-packet-v1/dialogue-inventory-v2.json',alignmentFollowupProposal='dialogue-boundary-followup-proposal-v1/proposal.json',noRequestsInFlight=True);ready['money']['alignmentEstimatedUsd']=total;write(base/'readiness-review-20261101.json',ready)
review={'status':'passed_local_preparation_checks','sourceAudioHashUnchanged':True,'eightPassedCutsMatchOriginalPcm':True,'sixPreparedContextsMatchOriginalPcm':True,'originalReviewedInventoryPreserved':True,'receiptReconciledIncludingThinkingTokens':True,'malformedOutputNotAccepted':True,'requestsInFlight':0,'noNewProviderCalls':True,'noAppCodeChanges':True,'latestApplicationRegression':'r13: 916 tests / 133 files, unchanged app source','goalGuardian':{'goal':'Autonomous source-faithful Hatam chapter film with inspectable timing and bounded costs.','result':'Existing ingestion/alignment preparation extended only by local evidence preservation and an unexecuted proposal. All canonical words, approved takes and producer review scope are preserved.','noInventedStageNarrativeOrProductionAuthority':True,'producerWorkflowPreserved':True},'fullProductionHold':True}
write(follow/'verification.json',review)
note='''# Remaining dialogue boundary checks — proposal only

Planning-direction review is recorded. Eight additional cuts passed automated native-source checks; 15 of 21 quote blocks now have source-window evidence. Six remain unresolved (6:31, 6:35–36, two in 6:37–38, the food reply in 6:38, and the fear cry in 6:49). This is not native attestation or final chapter acceptance.

The last authorized response hit MAX_TOKENS and ended mid-JSON. Its recorded usage reconciles to $0.050514, but its partial verdict is not accepted. Batch cost: $0.149160. Cumulative estimate: $1.242249 plus the retained $0.03 historical unknown-charge reserve = $1.272249 maximum exposure under the $10 cap. No request is running.

The original 176 total / 88 stronger requests are consumed. Proposed extension: six single-quote checks plus at most two evidence-driven correction checks (eight physical requests maximum), no automatic retries. Keep the same $10 cumulative dollar cap; reserve at most $0.15 per request ($1.20 combined), with stop on unknown usage/charges, changed pricing/model or malformed output. Raising the output limit to 6144 allows more room for thought plus structured output. Maximum exposure including this proposed reservation: $2.472249. This proposal is not execution authority.

`proposal.json` includes exact canonical targets, original-source context paths/hashes, clocks, failure reasons and controls. Contexts preserve native 24kHz stereo PCM. The original reviewed packet remains intact; see ../chapter-planning-packet-v1/dialogue-inventory-v2.json for current timing status.

After timing is resolved, complete existing crew coverage/speaker treatment, shot-specific music placement and a concrete full-production cost proposal. Full production remains ON HOLD.
'''
(follow/'README.md').write_text(note,encoding='utf-8')
log='''\n\n### Latest: planning review recorded; eight further dialogue cuts verified\n\nDan's “Review complete” records review of the six-section preparation direction, not final storyboard/budget or full-production authorization. The last four originally authorized alignment requests have finished. Eight additional native-source cuts pass automated checks, bringing source-window evidence to 15/21 quoted blocks; six remain held. Four unresolved phonetic transcriptions are search leads only; two pending audits have no valid completed response because the final call reached MAX_TOKENS mid-JSON. No partial verdict was promoted. All eight cuts and six prepared native contexts match original PCM; canonical wording and the original reviewed packet are preserved.\n\nFinal receipt reconciled including thinking tokens: batch $0.149160; cumulative $1.242249 estimate plus retained $0.03 reserve = $1.272249 maximum exposure of $10. Original 176 total/88 strong physical ceiling exhausted; no requests active. Prepared unexecuted proposal for six individual checks plus at most two evidence-driven corrections, $0.15 reservation each/$1.20 aggregate, within the existing $10 total cap; physical ceiling extension needs Dan's authorization. See outputs/mark6-preparation/dialogue-boundary-followup-proposal-v1/{README.md,proposal.json,verification.json} and chapter-planning-packet-v1/dialogue-inventory-v2.json.\n\nDedicated Goal Guardian pass preserves autonomous source-faithful alignment, inspect/correct workflow and bounded spend, with no invented narrative, stage, source/native acceptance or production authority. No app-source change or new provider call during reconciliation/preparation; previous full regression r13 remains 916 tests/133 files. Full production remains held; final shot coverage, music placement and cost proposal follow resolved boundaries.\n'''
for f in ['CURRENT_GOAL.md','MARK6_PREPARATION.md']:
 path=root/'docs/plans'/f
 with path.open('a',encoding='utf-8') as out: out.write(log)
with (base/'MARK6_PRODUCTION_READINESS.md').open('a',encoding='utf-8') as out:out.write(log)
print(json.dumps({'verifiedCuts':len(passed),'preparedRemainingCases':len(remaining),'cumulativeRequests':176,'estimatedUsd':total,'maximumExposureUsd':exposure,'noProviderCalls':True,'fullProductionHold':True}))
