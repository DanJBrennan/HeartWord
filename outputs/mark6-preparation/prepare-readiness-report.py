"""Read-only source/canon/music checks; writes isolated review drafts only."""
import json, hashlib, sqlite3
from pathlib import Path
from datetime import datetime, timezone

BASE = Path(__file__).resolve().parent
DATA = Path('C:/Users/danbr/HeartWordData')
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p, d): p.write_text(json.dumps(d, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

packet=read(BASE/'source-packet-v3/source-packet.json')
fresh=read(BASE/'readiness-refresh-20261101.json')
alignment=read(BASE/'alignment-context-followup/review.json')
checks=[]
for key, path in [('hatam',packet['input']['hatam']),('reference',packet['input']['english']),('audio',packet['input']['audio'])]:
    digest=sha(Path(path)); assert digest==packet['input']['sourceHashes'][key]
    checks.append({'kind':key,'path':path,'sha256':digest,'unchanged':True})

export=DATA/'exports/hatam-mark5-20261024/editable-chapter-r3'
records=read(export/'records.json'); package=read(export/'chapter-package.json')
assert sha(export/'records.json')==package['recordsSha256']
packaged={f['path'].replace('\\','/'):f['sha256'] for f in package['files']}
music=[]
for a in records['production_audio_assets']:
    if a.get('kind')!='music': continue
    path=DATA/'assets'/a['path']; assert path.is_file() and sha(path)==a['sha256']
    role='warm woodwind/strings' if a['id'].startswith('dbdeb') else 'serene strings/reed' if a['id'].startswith('806d') else 'dark cello/woodblock'
    music.append({'id':a['id'],'path':str(path),'sha256':a['sha256'],'durationMs':a['duration_ms'],'role':role,'authority':'Existing reviewed Mark 5 instrumental; no Mark 6 placement/mix approval.'})
assert len(music)==3

identity=[]
with sqlite3.connect((DATA/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True) as c:
    c.row_factory=sqlite3.Row
    for name in ['Jesus','Peter']:
        rows=c.execute("SELECT a.* FROM character_assets a JOIN character_versions v ON v.id=a.character_version_id JOIN characters c ON c.id=v.character_id WHERE c.name=? AND c.region='Papuan' AND v.status='approved'",(name,)).fetchall()
        for a in rows:
            path=DATA/'assets'/a['path']; digest=sha(path) if path.is_file() else None
            expected=a['content_hash'] or packaged.get('assets/'+a['path'].replace('\\','/'))
            identity.append({'name':name,'versionId':a['character_version_id'],'category':a['category'],'path':str(path),'exists':path.is_file(),'sha256':digest,'expectedSha256':expected,'expectedSource':'live approved-asset record' if a['content_hash'] else 'retained approved-film editable package','hashMatches':bool(expected and digest==expected.lower()),'storyState':a['story_state'],'role':a['asset_role']})
assert identity and all(a['exists'] and a['hashMatches'] for a in identity)

cast=[
 {'role':'Jesus','verses':[4,8,10,11,31,37,38,50],'status':'Approved Papuan v5 and voice available','next':'Exact Mark 6 source/utterance bindings, approved scene state and per-line acting intent. Cream garments with indigo bands remain pinned.'},
 {'role':'Disciples','verses':[35,36,37,38],'status':'Approved identities and some existing voices','next':'Source-grounded group/representative treatment. Collective speech does not name Peter; do not commission voices for silent disciples.'},
 {'role':'Nazareth listeners / reported speakers','verses':[2,3,14,15],'status':'Source-grounded group treatment pending','next':'Choose applicable book-scoped identities or narration; previous chapter-specific people are not automatically these people.'},
 {'role':'Herod','verses':[16,22,23],'status':'No approved identity or voice found','brief':'Distinct adult male ruler, normal Papuan canon workflow; do not borrow an apostle identity.'},
 {'role':'John the Baptist','verses':[18],'status':'No approved identity or voice found','brief':'Distinct from John son of Zebedee; no apostle identity substitution.'},
 {'role':'Herodias','verses':[24],'status':'No approved identity or voice found','brief':'Distinct named adult woman; normal Papuan canon workflow.'},
 {'role':'Herodias’s daughter','verses':[24,25],'status':'No approved identity or voice found','brief':'Unnamed in supplied chapter; no invented Salome, exact age or dialogue.'},
]
for row in cast[3:]: row['next']='Prepare head/body reference candidates and source-exact audition through existing tools if staged as visible speech. No generation or spending authority from this draft.'
save(BASE/'mark6-cast-readiness-current.json',{'status':'draft_not_cast_or_voice_approval','sourceHashes':packet['input']['sourceHashes'],'candidates':cast,'verifiedExistingIdentityAssets':identity,'inventoryEvidence':'readiness-refresh-20261101.json','limits':['Mention alone does not require visible casting or a new voice.','Herod’s brother Philip is not Philip the apostle.','Original chapter narrator remains the source; no new clone or replacement speech.'],'fullProductionHold':True})

treatments=[
 ('1-3','Nazareth response','restrained dark cello','Questioning/offense in source; do not force emphatic expression on every line.'),
 ('4-6','Statement and departure','deliberate quiet','Space around the source-grounded statement and narration.'),
 ('7-13','Sending the twelve','warm woodwind/strings','Support sending/travel while keeping instructions clear.'),
 ('14-16','Reports reach Herod','sparse dark cello','Change of account without invented character speech.'),
 ('17-20','John and Herod','restrained dark cello','A distinct retrospective account, not generic celebratory music.'),
 ('21-25','Banquet and requests','sparse dark cello or quiet','Follow supplied words; no added sung lyrics, voices or invented event sounds.'),
 ('26-29','Consequences and burial','deliberate quiet','Do not force warm/miracle motifs onto this passage. New grief music is optional only after review and budget; held vocal track stays excluded.'),
 ('30-34','Return, rest and compassion','warm woodwind/strings','Calmer re-entry and the compassion described by the source.'),
 ('35-40','Food discussion and seating','warm motif with gaps','Questions and short responses stay foremost; not every conversation becomes an emphatic point.'),
 ('41-44','Meal and completion','serene strings/reed','Gentle development around the described meal.'),
 ('45-50','Boat, wind and reassurance','dark cello with release','Tension follows source difficulty, easing under spoken reassurance.'),
 ('51-52','Wind ceases and reaction','serene strings/reed or quiet','Measured release leaves room for reaction.'),
 ('53-56','Arrival and healing','warm or serene resolution','Resolve the chapter without adding dialogue.'),
]
cues=[{'verses':v,'passage':p,'treatment':t,'reason':r,'exactBounds':'Deferred until accepted source/shot/cast map; these verse ranges are not timed cue instructions.'} for v,p,t,r in treatments]
save(BASE/'mark6-music-treatment-draft.json',{'status':'draft_not_applied','sourceHashes':packet['input']['sourceHashes'],'reference':'Approved Mark 5 R9 with revised music treatment; roughly 63.5% is a reference, not a mandatory percentage.','verifiedExistingInstrumentals':music,'passageTreatment':cues,'mixRequirements':['Separate editable instrumental cues and continuous foreground speech.','New chapter-specific placement, deliberate quiet and gentle fades.','Speech priority and quiet-speech ducking measured on actual narrator/cast audio.','Every excerpt fits actual asset duration; no speed change, unreviewed extension or automatic loop.','Audibility/intelligibility established by actual final-mix listening, not gains/metadata alone.','Complete spoken chapter announcement remains separate before verse 1.'],'newMusicGenerationRequested':False,'newGenerationApiUsdForReuse':0,'fullProductionHold':True})

forecast=[{'localSpeakingContainers':n,'serialInferenceHours':round(n*818.3045/3600,2)} for n in [20,40,60]]
review={'status':'readiness_review_delivered_full_production_not_ready','generatedAt':datetime.now(timezone.utc).isoformat(),'sourceChecks':checks,'mark6WorkspaceCount':len(fresh['mark6Projects']),'freeGiB':round(fresh['storage']['freeBytes']/1024**3,1),'sourceDurationSeconds':packet['durationMs']/1000,'spokenAnnouncementSeconds':[.567,3.259],'verseOneStartSeconds':4.823,'alignmentReview':'alignment-context-followup/review.json','alignmentMaximumExposureUsd':alignment['maximumExposureUsd'],'alignmentRemainingHeadroomUsd':alignment['remainingAuthorizedHeadroomUsd'],'castDraft':'mark6-cast-readiness-current.json','musicDraft':'mark6-music-treatment-draft.json','expressionTests':'Declined/closed by Dan; emphatic take retained, gentler option unresolved.','runtimeForecast':forecast,'runtimeExclusions':'Retakes, scene-motion generation, image/voice work, assembly and AV review. Not a whole-chapter ETA.','money':{'alignmentEstimatedUsd':alignment['cumulativeEstimatedUsd'],'unknownChargeReserveUsd':.03,'alignmentAuthorizationUsd':10,'thisFollowupEstimatedUsd':.145606,'localLtxGenerationApiUsd':0,'webTextEncoder':'Free route retained; unused local encoder not required.','codex':'Hosted allowance/credits; actual per-call cash/account usage and backend identity unreported. No paid fallback.','existingMusicReuseNewGenerationUsd':0,'newVoiceAndAVReview':'Unpriced/unapproved: quote from exact audition/conversion durations and review media/count before calls.','fullChapterCashTotal':'Not established; Mark 5 budget and alignment allowance do not authorize production.'},'verification':{'sourceFiles':len(checks),'identityAssets':len(identity),'instrumentals':len(music),'fullApplicationTests':'r12: 916 tests/133 files pass; application source unchanged.','alignment':'17 receipts reviewed, count/budget bounds pass; 2 noncanonical fragments rejected; exact-edge/native authority not inferred.','goalGuardian':'Dedicated completion review against PRODUCT_VISION, CURRENT_GOAL and USER_WORKFLOW: source-faithful existing stages/inspect-correct workflow preserved; no new narrative, subsystem, asset approval, source/DB change or production authority.'},'noRequestsInFlight':True,'fullProductionHold':True}
save(BASE/'readiness-review-20261101.json',review)
rows='\n'.join(f"| {r['role']} | {r['status']} | {r['next']} |" for r in cast)
musicRows='\n'.join(f"| {v}: {p} | {t} |" for v,p,t,r in treatments)
text=f'''# Mark 6 production readiness — current review

Preparation has advanced; **full production remains on hold**. Dan declined further expression tests. Keep the LTX take as a potential emphatic option; a gentler option remains unresolved.

The unchanged Non-Drama Hatam source is **13:16.696** long. The spoken announcement remains separate at **0.567–3.259 seconds**; verse 1 starts at **4.823 seconds**. Hatam text, English reference and audio hashes match the preparation packet. No Mark 6 production workspace exists. Free space is about **{review['freeGiB']:.1f} GiB**.

## Alignment

The wider-context follow-up made **17 requests for $0.145606 estimated**. Cumulative: **161 requests**, **$0.938293 estimated + $0.03 reserved = $0.968293 maximum current exposure** against the authorized $10. No request is active and no further batch/retry is scheduled. These are estimates/bounds, not an invoice.

Eleven target gaps have bounded model timing proposals supported by canonical fragments. The repeated `di` has three candidates; canonical context favors the third, retained as a proposal. Wider context gives canonical-overlap evidence for all five narrow speech intervals previously misclassified as non-Scripture. **Two noncanonical fragments were rejected**; valid separate neighboring evidence remains. Complete first/last syllables and silence boundaries are not established by those proposals. **Local word-placement coverage stays 95.46%**; native/source approval is not inferred. All source audio stays intact. See [review](alignment-context-followup/review.json).

## Cast and voice preparation

| Role | Current readiness | Next |
|---|---|---|
{rows}

All **{len(identity)} Jesus/Peter reference assets** are present and hash-verified. Where a legacy live asset lacked its own stored hash, verification uses the retained approved-film editable package, without altering the DB. Mention alone does not require a visible actor or a new voice. Detailed briefs/checks: [cast draft](mark6-cast-readiness-current.json). No new character/voice generation or approval occurred.

## Chapter-specific music draft

Three existing Mark 5 instrumental files are hash-verified: dark cello/woodblock **83.540 s**, warm woodwind/strings **67.448 s**, serene strings/reed **55.589 s**. Reuse requires **$0 additional music-generation charge**; placement/mix still needs review. The held vocal grief track stays excluded.

| Source passage | Proposed treatment |
|---|---|
{musicRows}

Use the successful Mark 5 audible score, fades and quiet-speech ducking as a listening reference. Roughly 63.5% coverage is not a compulsory Mark 6 target. Exact cue edges wait for the accepted source/shot/cast map. Do not copy Mark 5 timestamps, automatically loop/stretch tracks or treat numeric gains as proof of a good mix. Source-grounded rationale and verified files: [music draft](mark6-music-treatment-draft.json). No mix was applied.

## Money and runtime before production approval

- Alignment: **$0.968293 maximum current exposure**; **$9.031707** remains within the alignment-only allowance.
- Local LTX video generation: **$0 external generation API charge** on the selected local path. The free web text encoder remains selected. Hardware/electricity and other stages are separate.
- Existing instrumental reuse: **$0 new generation charge**. New voice auditions/conversions and Gemini AV review still require exact durations/media/counts, a quote and applicable allowance.
- Codex uses hosted allowance/credits; actual per-call cash/account usage is unreported. No paid fallback.
- Historical speaking inference is about **13.6 minutes per native five-second container**: twenty containers **4.55 hours**, forty **9.09 hours**, sixty **13.64 hours**. This excludes retakes, scene motion, image/voice work, assembly and review; it is not a whole-chapter ETA.

A defensible full-film cap/ETA requires the actual speaking/coverage shot count, source-bound cast-conversion durations, new-character reference scope and AV review count. Those are not established by this draft. No budget transfers from Mark 5 or from alignment into production.

## Next execution order

1. Finalize the provisional source/scene/utterance map, preserving the complete announcement/audio and flagged boundaries.
2. Prepare the four new-role reference/audition packets through the existing character workflow. Quote generation before requesting approval; no asset is approved by this report.
3. Use bounded-context planning to choose speaking versus narration/coverage and count actual sections, retaining full history outside prompts.
4. Attach shot-specific caption/framing evidence and this music treatment; calculate duration/count-based reservations and runtime/storage needs.
5. Present a concrete production approval packet. Deploy and run existing stages only after explicit authorization and normal source/canon/voice/cost/review gates.

## Verification and Goal Guardian

Application source is unchanged since full regression **r12: 916 tests /133 files passed**. This unit verifies source hashes, existing identity/music files, alignment receipts/count/budget bounds and canonical/timing validity. Dedicated Goal Guardian review preserves the source-faithful pipeline and inspect/correct workflow: no new stage, narrative, asset approval, source edit, DB write or full-production authority. Technical evidence does not establish neutral acting or native verification. Overall preparation remains open.
'''
(BASE/'MARK6_PRODUCTION_READINESS.md').write_text(text,encoding='utf-8')
print(json.dumps({'sourcesVerified':len(checks),'identityAssetsVerified':len(identity),'instrumentalsVerified':len(music),'report':str(BASE/'MARK6_PRODUCTION_READINESS.md'),'fullProductionHold':True}))
