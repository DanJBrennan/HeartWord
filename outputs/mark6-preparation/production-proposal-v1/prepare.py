"""Local, reviewable production draft and score preview recipe. No generation APIs."""
import hashlib,json,math,pathlib
root=pathlib.Path(__file__).resolve().parents[3];base=root/'outputs/mark6-preparation';out=base/'production-proposal-v1'
def read(p):return json.loads((base/p).read_text(encoding='utf-8'))
def write(name,d):(out/name).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
packet=read('source-packet-v3/source-packet.json');inv=read('chapter-planning-packet-v1/dialogue-inventory-v3.json');measure=read('production-proposal-v1/speaking-estimate.json');music=read('mark6-music-treatment-draft.json');status=read('continuation-status.json')
assert status['fullProductionHold'] and status['noRequestsInFlight']
for k,p in [('hatam',packet['input']['hatam']),('reference',packet['input']['english']),('audio',packet['input']['audio'])]:assert sha(p)==inv['sourceHashes'][k]
assets=music['verifiedExistingInstrumentals']
for a in assets:assert sha(a['path'])==a['sha256']
source={v['verse']:v['text'] for v in packet['verses']};reference={v['verse']:v['text'] for v in packet['reference']}
# These are source-grounded coverage BEATS and candidate views, not timed accepted shots.
rows=[
('1','Arrival', 'Wide hometown arrival, Jesus and disciples sharing a coherent route into the setting.'),
('2','Synagogue teaching','Interior medium-wide establishes Jesus and listeners before closer reactions.'),
('2-3','Local questions','Listeners and restrained reactions; collective words stay on the unchanged source track; no invented named relative appears.'),
('4','Jesus response','Single-face medium close-up; measured authority rather than obligatory shouting.'),
('5','A few healings','Hands laid on a few sick people and their restrained responses; do not stage a mass healing.'),
('6','Unbelief and circuit','Jesus reaction, then nearby teaching context; no invented departure confrontation.'),
('7','Calling and pairs','Jesus addresses the Twelve; pairs share an identifiable departure direction.'),
('8-11','Travel instructions','Jesus close angle alternates with listening disciples, staff/sandals and household context only as justified; entire long quotation retained.'),
('12','Departure and proclamation','Pairs depart; spoken content remains the supplied narration, with no added sermons.'),
('13','Ministry','Source-described healing and anointing; no invented demon dialogue or spectacle.'),
('14-15','Reports','Context and listeners under reported claims; do not portray a literal returned John or Elijah.'),
('16','Herod conclusion','Herod alone in a medium close view; uneasy recognition grounded in his actual line.'),
('17','Imprisonment retrospective','Clear change to earlier imprisonment; John and guards, distinct from the banquet.'),
('18','John rebuke','John speaking firmly to Herod in retrospective context; distinct Baptist identity.'),
('19-20','Conflict and protection','Herodias resentment and Herod listening/protecting as narrated, without extra spoken confrontation.'),
('21','Banquet establishment','Court room wide with Herod, officials and guests; maintain shared room geography.'),
('22','Daughter dance','Respectful nonsexual dance coverage; formal modest approved wardrobe, no sexualized framing.'),
('22','Herod offer','Herod seated speaking to daughter with appropriate eyeline; reuse approved exact audition.'),
('23','Herod oath','Continue seated identity/court state, with one speaking face; emphatic wording need not imply shouting.'),
('24','Daughter consults','Daughter goes out from the banquet to her mother; preserve the spatial transition.'),
('24','Mother answers','Herodias speaking; reuse approved exact audition and retain dialogue order.'),
('25','Daughter request','Daughter returns to address Herod; reuse approved exact audition without an added line.'),
('26','Herod distress','Herod and guests reaction, grounded in oath and present company; avoid added explanation.'),
('27','Command','Herod gives the source-described command; no invented audible orders.'),
('27','Prison consequence','Guard approaches prison; restrained cutaway for execution, preserving narration without graphic detail.'),
('28','Delivery','Preserve guard-to-daughter-to-mother handoff order; restrained framing without graphic close-ups.'),
('29','Burial','John followers retrieve and bury his body; do not replace them with named members of the Twelve.'),
('30','Return and report','Apostles return to Jesus; listening and reporting without invented dialogue.'),
('31','Crowding','Coming and going explains lack of rest/food; keep the group distinct from the later meal setup.'),
('31','Invitation to rest','Jesus addresses disciples warmly and quietly; single speaking face with source-bound line.'),
('32','Boat departure','Boat leaves shore toward the source-described secluded place; no invented landmark or route.'),
('33','Crowd arrival','People recognize and move ahead; connect their arrival causally to the approaching boat.'),
('34','Compassion and teaching','Jesus sees crowd, responds with compassion and teaches; mix medium and listener coverage.'),
('35-36','Food concern','Disciple group/over-shoulder view under the complete collective request; representative identity remains for crew resolution.'),
('37','Jesus instruction','Jesus gives the brief actual instruction; clear mouth at native scale.'),
('37','Disciples objection','Group reaction under actual reply; do not silently identify an individual speaker as Peter.'),
('38','Bread question','Jesus asks the actual question; subdued conversational delivery where possible.'),
('38','Food inventory','Bread/fish and listening group under the complete source reply; outer endpoint is HELD, not trimmed.'),
('39-40','Seating groups','Wide establishes grass and orderly groups at source-described scales; inserts must preserve geography.'),
('41','Taking and blessing','Jesus takes loaves/fish and looks up as narrated; do not add a spoken blessing.'),
('41','Distribution','Jesus gives to disciples who distribute; retain causal order and consistent quantities/props.'),
('42-44','Eating and leftovers','Eating, satisfaction and collected fragments; narration retains the stated counts without fabricated counting montage.'),
('45','Departure and dismissal','Disciples embark while Jesus dismisses crowd; preserve separate positions.'),
('46','Prayer','Jesus on mountain; no invented prayer words, architecture or additional companion.'),
('47','Evening separation','Night boat at sea and Jesus on land remain geographically distinct.'),
('48','Difficult rowing','Disciples struggle against wind; no invented storm dialogue.'),
('48','Approach over water','Jesus approaches; movement grounded in source, no extra miracle effects or ghost character.'),
('49','Fear','Disciples perceive and cry out; reactions/context can carry the collective line without an invented named attribution.'),
('50','Reassurance','Single-face Jesus speaking exact retained line; emphatic articulation is available but retain reassuring intent.'),
('51-52','Entry and calm','Jesus enters boat, wind ceases, disciples react; no extra resolution speech.'),
('53','Gennesaret landing','New shore arrival with coherent daylight/location continuity as reconstructed, not claimed as a specified hour.'),
('54','Recognition','People recognize him after disembarkation; faces and eyelines establish the reaction.'),
('55','Bringing patients','People carry sick on mats; recognizable movement between source-described communities.'),
('56','Village and market','Patients placed in public spaces and appeals conveyed through unchanged narration.'),
('56','Touch and healing','Reverent garment-touch and patient response; preserve complete final narration and source tail.')]
beats=[]
for i,(vr,title,view) in enumerate(rows,1):
 nums=list(map(int,vr.split('-')));vs=list(range(nums[0],nums[-1]+1));quotes=[q['id'] for q in inv['quotes'] if q['startVerse']<=vs[-1] and q['endVerse']>=vs[0]]
 beats.append({'id':f'beat-{i:02d}','verseRange':vr,'title':title,'candidateView':view,'hatamEvidence':[{'verse':v,'text':source[v]} for v in vs],'englishReference':[{'verse':v,'text':reference[v]} for v in vs],'quoteCandidates':quotes,'timing':'Picture timing must follow measured source/accepted utterance bindings. This beat range is not an audio cut or verse timestamp.','status':'assistant_coverage_draft_requires_existing_crew_review','generationRequests':0})
assert set(v for b in beats for v in range(int(b['verseRange'].split('-')[0]),int(b['verseRange'].split('-')[-1])+1))==set(range(1,57))
write('coverage-draft.json',{'status':'55_source_grounded_coverage_beats_not_accepted_storyboard','sourceHashes':inv['sourceHashes'],'beats':beats,'opening':{'titleCardSeconds':2.5,'wordlessSettingSeconds':5,'proposedSourceOffsetSeconds':7.5,'grounding':'6:1 hometown arrival. Reconstructed setting orientation only; no invented named route or new event.','sourceAnnouncementFilmSeconds':[8.067,10.759],'verseOneFilmSeconds':12.323,'sourceEndFilmSeconds':round(measure['sourceDecodedSeconds']+7.5,6),'status':'proposal_not_generated','ambience':'Appropriate wordless location ambience; no additional speech.'},'ending':'No narrative handoff proposed without verified next-chapter boundary evidence. Source tail and eventual separate credits remain intact.','fullProductionHold':True})
# Deliberate excerpts, individually assigned; no implicit looping/stretching.
cue_rows=[(5,61,2,0,'Nazareth questioning; release before Jesus response'),(91,139,0,5,'Circuit and sending; leave latter instructions clear'),(163,184,0,40,'Departure and ministry'),(185,225,2,18,'Reports; quiet under Herod conclusion'),(241,298,2,20,'Retrospective imprisonment and conflict'),(301,327,0,0,'Banquet context before the spoken offers'),(352,395,2,35,'Oath and consultation/request undercurrent'),(445,469,0,25,'Apostles return; clear space for rest invitation'),(480,528,0,10,'Boat, crowd and compassion'),(584,638,1,0,'Seating, blessing, distribution and meal'),(650,709,2,5,'Boat departure and night approach; release before reassurance'),(725,737,1,35,'Calm and reaction'),(740,793,1,2,'Gennesaret healing resolution')]
cues=[]
for n,(s,e,asset,offset,purpose) in enumerate(cue_rows,1):
 a=assets[asset];assert (offset+e-s)*1000<=a['durationMs'];assert e<=packet['durationMs']/1000
 cues.append({'id':f'cue-{n:02d}','sourceStartMs':s*1000,'sourceEndMs':e*1000,'assetId':a['id'],'assetPath':a['path'],'assetSha256':a['sha256'],'assetInMs':offset*1000,'assetOutMs':(offset+e-s)*1000,'fadeInMs':1500,'fadeOutMs':2000,'purpose':purpose,'timingBasis':'Concrete source-clock score-placement proposal near retained source context; not a claim that a verse or syllable starts here. Recheck against final cut.','filmClockRule':'Add accepted pre-source opening offset; never add it to the original audio file.','status':'preview_only_not_final_mix_approval'})
score_seconds=sum((c['sourceEndMs']-c['sourceStartMs'])/1000 for c in cues)
write('music-cues.json',{'status':'13_excerpt_local_preview_proposal','cues':cues,'scheduledSeconds':score_seconds,'scheduledCoveragePercent':round(100*score_seconds/(packet['durationMs']/1000),2),'coverageIsNotMeasuredAudibility':True,'speech':'Complete original narrator recording, including all reported/character words; no source edit, audition substitution or new voice request.','openingPreview':'Source clock only; no visual introduction in this audio preview.','newMusicGeneration':False,'fullProductionHold':True})
known=measure['knownSourceSeconds'];named=measure['namedSourceSeconds'];reuse=26.993;named_new=named-reuse;all_new=known-reuse
named_containers=measure['namedQuoteSpeakingContainers'];all_containers=measure['allKnownQuotesSpeakingContainers'];source_seconds=measure['sourceDecodedSeconds']
named_coverage=math.ceil((source_seconds-named)/8)+1;all_coverage=math.ceil((source_seconds-known)/8)+1
budget={'status':'costed_preparation_draft_not_authorization_or_final_crew_plan','existingExposure':{'alignmentEstimateUsd':status['alignmentEstimatedUsd'],'historicalUnknownReserveUsd':.03,'maximumAlignmentExposureUsd':status['maximumExposureUsd'],'alignmentPhysicalLimit':184,'noAlignmentRequestsAvailable':True,'auditionsCreditsAlreadyConsumed':449},'recommendedCoverageOption':{'description':'13 named-character quotation blocks eligible for single-face LTX; collective/reported blocks on listener/context pictures with original continuous source speech, subject to existing crew speaker/casting review.','knownNamedSpeechSeconds':named,'speakingContainersEstimate':named_containers,'remainingPictureSecondsEstimate':round(source_seconds-named,4),'eightSecondCoverageContainerEstimate':named_coverage,'initialLocalVideoRequestsEstimate':named_containers+named_coverage,'proposedLocalRequestCeilingWithRetakes':160,'speakingOnlyHistoricalMedianHours':round(named_containers*818.3045/3600,2),'notWholeChapterEta':True},'expandedSpeakingOption':{'description':'Every known direct quotation on-camera; quote-19 remains unresolved and has no assumed duration.','knownSpeechSeconds':known,'speakingContainersEstimate':all_containers,'coverageContainerEstimate':all_coverage,'initialLocalRequestsEstimateExcludingHeldQuote':all_containers+all_coverage,'proposedLocalCeilingWithRetakes':180,'speakingOnlyHistoricalMedianHours':round(all_containers*818.3045/3600,2),'notWholeChapterEta':True},'voice':{'currentRateCreditsPerMinute':1000,'knownNamedAdditionalSeconds':round(named_new,4),'knownNamedAdditionalCreditsEstimate':round(named_new*1000/60,3),'allKnownAdditionalSeconds':round(all_new,4),'allKnownAdditionalCreditsEstimate':round(all_new*1000/60,3),'fourAcceptedTakesReuseSeconds':reuse,'heldQuoteSeconds':None,'proposedExistingCreditCap':4000,'proposedRequestCap':20,'automaticRetries':0,'pendingExactVoiceMappingForGroups':True,'newCashProposedUsd':0,'stopOnChangedRateOrVoiceMultiplier':True,'creditPurchaseOrOverage':False,'authorization':'NOT granted: the prior 600-credit audition allowance is not a chapter-voicing allowance.'},'images':{'candidateCoverageBeats':55,'initialStartingFramePlanningEnvelope':56,'proposedIncludedAllowanceImageCallCeiling':64,'priorThreeTestFrames':'Reuse only after target-shot identity/framing/continuity check; no guaranteed subtraction.','cashFallback':False,'cost':'Included Codex allowance, subject to available account allowance; per-image usage/cash equivalent unreported.','authorization':'Not granted for full production.'},'localVideo':{'generationApiChargeUsd':0,'freeWebEncoder':True,'paidFallback':False,'electricityAndHardwareCost':'Not measured/included.','coverageEightSecondAssumption':'Default normal coverage duration; not proof of usable retained motion. Reuse, pacing, extra coverage and retakes change count.','fullEta':'Unpriced in time until measured ordinary coverage throughput and accepted shot timing.'},'music':{'existingInstrumentalGenerationChargeUsd':0,'newMusicGenerationRequests':0,'scheduledSeconds':score_seconds,'scheduledPercent':round(score_seconds/source_seconds*100,2),'preview':'Original narrator plus 13 individually assigned existing instrumental excerpts; no loop or speed change. Actual audible coverage/intelligibility needs playback.'},'avReviewProposal':{'model':'gemini-3.1-pro-preview','initialLineReviews':13,'initialSceneReviews':6,'initialFinalCutParts':3,'maximumAdditionalCorrectionReviews':8,'maximumPhysicalRequests':30,'lineReservationUsd':.15,'sceneOrPartOrCorrectionReservationUsd':.30,'combinedReservationUsd':7.05,'proposedNewAvCapUsd':8,'tokenCaps':{'lineInput':25000,'scenePartCorrectionInput':100000,'lineSceneCorrectionOutput':6144,'finalPartOutput':8192},'pricingUsdPerMillion':{'inputAtMost200k':2,'outputIncludingThinking':12},'preflight':'Count the ACTUAL media/text payload tokens before submitting; split to remain within cap. No claim that full-resolution full-chapter video fits.','scope':'Line continuity/lips/identity/text; scene geography/emotion/music; overlapping final-cut parts and retained full-audio continuity checks. Native/community assessment remains distinct.','unknownUsageStops':True,'automaticRetries':0,'authorization':'NOT granted: independent from the alignment-only $10 allowance.'},'prospectiveAdditionalCashEnvelopeUsd':8,'prospectiveAdditionalExistingVoiceCredits':4000,'prospectiveIncludedImageCallCeiling':64,'fullProductionHold':True,'notReadyForProductionReasons':['quote-19 exact endpoint held for isolated conversion/lip-sync; proposed continuous original-source/context coverage avoids cutting it, pending crew decision','Formal existing crew emotional treatment, speaker assignments and shot plan have not run or been accepted','Four source-based internal join plans need review; actual approved full-line cast audio must be replanned','Reuse/scene-framing and set geography checks remain','Proposed chapter voice/image/video/AV envelopes have not been authorized'],'pricingSources':[{'url':'https://elevenlabs.io/docs/overview/capabilities/voice-changer','supports':'1000 characters/credits per minute of processed source audio; per-voice/account factors rechecked before use.'},{'url':'https://ai.google.dev/gemini-api/docs/pricing','supports':'Gemini 3.1 Pro Preview standard $2/M input and $12/M output including thought, up to 200k prompt tokens.'}]}
write('budget-draft.json',budget)
write('crew-input.json',{'status':'compact_current_preparation_not_a_fabricated_crew_run','goal':'Autonomous source-faithful editable Hatam Mark 6 using approved regional canon/voices, local short LTX, clear speech and fuller music.','currentFacts':['Planning direction reviewed; four exact auditions approved and reusable only for matching source/voice.','20/21 quote windows have automated evidence, not native attestation; quote-19 remains held.','13 named-character quote blocks: original-source estimate 43 short speaking containers.','All original chapter samples including spoken title and quiet retained.','No further expression tests; emphatic articulation is available, quieter acting remains imperfect.'],'openDecisions':['Collective/reported source speech on context/listener shots vs individually cast on-camera representatives. Do not silently choose Peter.','Actual timed shots/continuity, emotional treatment and natural internal joins.','Music audibility and transitions on final cast/picture cut.'],'evidence':{'coverage':'coverage-draft.json','sourceSpeaking':'speaking-estimate.json','score':'music-cues.json','costs':'budget-draft.json','sourceText':'../source-packet-v3/source-packet.json','cast':'../mark6-cast-readiness-current.json','dialogue':'../chapter-planning-packet-v1/dialogue-inventory-v3.json','boundaryHold':'../dialogue-boundary-followup-proposal-v1/quote-19-review-case.json'},'contextPolicy':{'existingSpecialistTextBytes':200000,'existingChapterReviewTextBytes':600000,'evidenceRetrievalRounds':2,'physicalInferenceCeiling':180,'supply':'Relevant current source/scene/quote facts, role delta, active findings and exact evidence pointers only. Prior output is archived rather than copied through every prompt.','doNot':'Do not present this assistant draft as role replies, accepted crew consensus or executed production.'},'fullProductionHold':True})
# Existing instrumental inputs only; separate source and score lanes, latency-compensated limiter.
filters=['[0:a]aresample=24000,volume=-5.5dB,asplit=2[speech][sidechain]']
for idx,c in enumerate(cues,1):
 dur=(c['sourceEndMs']-c['sourceStartMs'])/1000
 filters.append(f'[{idx}:a]atrim=start={c["assetInMs"]/1000}:end={c["assetOutMs"]/1000},asetpts=PTS-STARTPTS,loudnorm=I=-23:TP=-7:LRA=7,aresample=24000,afade=t=in:st=0:d=1.5,afade=t=out:st={dur-2}:d=2,adelay={c["sourceStartMs"]}:all=1[m{idx}]')
filters.append(''.join(f'[m{i}]' for i in range(1,len(cues)+1))+f'amix=inputs={len(cues)}:normalize=0:duration=longest,apad,atrim=duration={source_seconds}[score]')
filters.append('[score][sidechain]sidechaincompress=threshold=0.04:ratio=3:attack=20:release=400[ducked]')
filters.append(f'[speech][ducked]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95:level=0:latency=1,aresample=24000,atrim=duration={source_seconds}[mixed]')
(out/'music-preview-filter.txt').write_text(';\n'.join(filters),encoding='utf-8')
args=['ffmpeg','-v','error','-nostdin','-i',packet['input']['audio']]
for c in cues:args+=['-i',c['assetPath']]
args+=['-filter_complex_script',str(out/'music-preview-filter.txt'),'-map','[mixed]','-ar','24000','-ac','2','-c:a','pcm_s16le',str(out/'mark6-music-preview.wav')]
write('music-preview-command.json',args)
summary=f'''# Mark 6 — coverage, score and budget draft

Full production remains **ON HOLD**. This is assistant preparation for the existing crew, not an accepted storyboard or fabricated role discussion.

55 source-grounded coverage beats cover verses 1–56, with original Hatam and English-reference evidence attached. Proposed opening: 2.5-second series card plus five-second hometown orientation, giving source offset **7.5 seconds**. The complete spoken title then occurs at film 8.067–10.759; verse 1 begins at 12.323. This is a proposed new offset, never borrowed from Mark 5. Complete source end would be 13:24.180 before any separate credits, using all 19,120,320 decoded native samples. MP3 container metadata reports 16 ms more; no source samples are removed to match that metadata.

Recommended coverage draft: 13 named-character speech blocks intercut with listeners/context for collective and reported words. Source-based estimate: **43 short speaking containers + 85 ordinary coverage containers = 128 initial local video requests**, with a proposed 160-request envelope including retakes. These counts assume eight-second ordinary coverage and full on-camera named lines; actual picture timing/reuse/crew choices change them. Speaking inference alone projects **9.77 hours** at the retained historical median; other scene video, queue time, review and assembly are excluded. Showing all known dialogue on camera instead projects 68 speaking containers and about 144 total requests, excluding the held quote. Neither is a whole-chapter ETA.

Four source-based partition plans ({', '.join(measure['quotesNeedingInternalJoinReview'])}) contain at least one internal join without measured quiet. They are review cases, not permission to cut syllables. Replan from approved final cast audio; use appropriate listener coverage when a safe short on-camera run is unavailable. Carry only the preceding last RETAINED frame, and assemble each complete line over one continuous unchanged audio track.

Music: **13 individually assigned existing instrumental excerpts, 541 seconds / 67.91% scheduled coverage**, with intentional quiet at key statements, the consequences/burial and reassurance. Scheduling is not measured audibility. No new music, lyrics, automatic loop or stretching. The local listening preview contains the COMPLETE original reading (not the final cast voices), preserved at source clock, attenuated uniformly 5.5 dB for mix headroom, with ducked score and compensated limiter. Source files remain untouched.

Prospective production envelopes, not yet authorized:

| Item | Draft allowance |
|---|---|
| Remaining voice conversion | Up to **4,000 existing ElevenLabs credits**, 20 requests including bounded corrective takes; no purchases/overage. Known named-only new lines estimate {named_new*1000/60:.0f} credits; all known remaining quotes estimate {all_new*1000/60:.0f}; unresolved quote duration excluded. |
| Starting images | Up to **64 included-allowance calls**; 56 initial planning envelope plus 8 corrections; no paid fallback. Actual allowance usage/cash equivalent unreported. |
| Local LTX | **$0 API generation charge**; proposed 160 physical requests for recommended coverage. Electricity/hardware excluded. Free web text encoder retained. |
| Reused music | **$0 new music-generation charge**. |
| Gemini AV review | Proposed **$8 separate cap**, max 30 requests: 13 lines, 6 scenes, 3 final-cut parts, up to 8 correction reviews. Worst planned reservations $7.05; actual input tokens must be preflight-counted and split to caps. No alignment-budget carryover. |

The voice estimate uses [ElevenLabs' duration rate](https://elevenlabs.io/docs/overview/capabilities/voice-changer); AV uses [Google's standard Pro pricing](https://ai.google.dev/gemini-api/docs/pricing), including thinking tokens. Existing alignment exposure stays ${status['maximumExposureUsd']:.6f}; the 184-request alignment allowance is exhausted. Already-used 449 audition credits are historical, not a new charge.

Remaining holds: isolated revoicing/lip-sync of the inconsistent Mark 6:38 food reply; the proposed continuous original-source/context coverage preserves it without requiring that cut; formal existing crew emotional treatment/shot/speaker review; source/cast acceptance and per-shot framing/set checks. No new workspace, model call, voice, image or scene-video request was made for this draft. The music preview is local assembly of existing files only. No full-production approval is requested on an unresolved plan.

Files: coverage-draft.json; speaking-estimate.json; music-cues.json; budget-draft.json; crew-input.json. The latter carries current decisions and targeted evidence pointers, never the archived whole discussion.
'''
(out/'README.md').write_text(summary,encoding='utf-8')
print(json.dumps({'coverageBeats':len(beats),'musicCues':len(cues),'musicSeconds':score_seconds,'musicScheduledPercent':round(score_seconds/source_seconds*100,2),'namedSpeakingContainers':named_containers,'recommendedInitialLocalRequests':named_containers+named_coverage,'expandedInitialLocalRequestsExcludingHeldQuote':all_containers+all_coverage,'knownNamedAdditionalVoiceCredits':round(named_new*1000/60,3),'allKnownAdditionalVoiceCredits':round(all_new*1000/60,3),'fullProductionHold':True}))
