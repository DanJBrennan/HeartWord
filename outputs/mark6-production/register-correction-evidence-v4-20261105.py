import json, sqlite3, hashlib
from pathlib import Path
from datetime import datetime, timezone
r=Path('outputs/mark6-production'); pid='c457a815-d07d-4902-91b5-7b936b549856'
db=sqlite3.connect('C:/Users/danbr/HeartWordData/db/heartword.sqlite')
assert not db.execute("SELECT id FROM production_runs WHERE project_id=? AND status='running'",(pid,)).fetchone()
route=json.loads((r/'local-lipsync-route-proof-20261105.json').read_text())
for f in route['code']: assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
ledger=db.execute('SELECT SUM(amount_usd) FROM cost_ledger_entries WHERE project_id=?',(pid,)).fetchone()[0]
assert round(ledger,6)==1.373328
models=dict(db.execute('SELECT e.model,COUNT(*) FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.cost_usd IS NULL GROUP BY e.model',(pid,)))
assert all(m.startswith('codex_cli:') or m=='not_submitted' for m in models)
extension=json.loads((r/'resource-count-extension-20261105.json').read_text());assert extension['status']=='applied_at_settled_worker_boundary'
actor="Codex under Dan's delegated routine production and finite internal count-extension authority; not a new personal statement, source/native attestation or acceptance by Dan."
technical=f"""CURRENT EXECUTION EVIDENCE v4 by {actor}
Supersedes earlier v3 numeric forecasts and historical Kling-integration concern ONLY. Operator verified current runVoiceLipSync default/explicit ltx selects LtxChainedSpeaking; Kling requires explicit legacy selection, no automatic fallback. Source hashes and native raw/carry files verified for two complete representative lines (Herod3 sections/daughter2), complete-line AV and representative cut. Full chapter stage not executed while plan unaccepted; actual target-frame/crop/whole-performance/source/coverage checks remain mandatory. Evidence local-lipsync-route-proof-20261105.json. LTX2.5Fast720p24fps/free WEB encoder; explicitly select local provider, roughly3s/up4s retained sections in native5s tail-padded containers, last retained speaker frame carry, uninterrupted unchanged whole-line audio. Listener never speaker reference. No paid fallback.
Current finite limits applied at settled worker boundary: local220 (9 settled), built-in included images160 (14used/zero selected film frames), AV40 requests/$8 UNCHANGED (6settled/$0.052587; categories wholePerformance20/pairedScene4/finalParts3/correction7). All old usage preserved. Image worst-case14+114starts+1proposed opening=129initial,31correction reserve; no assumed unreviewed reuse. Local forecast193=9existing+64speaking containers+93ordinary finals+26REQUIRED risk drafts+1proposed opening;27correction reserve. Conditional on accepted plan; preserve draftFirst and target-specific reuse gates. Voice14calls2640existing credits/no pending; no more voice/alignment/music/SFX calls now. Full source19120320stereo24k frames/796.680s with title/quiet/tail unchanged. 6500ms opening proposed only; no narrative ending.
Settled ledger$1.373328=alignment historical estimate1.320741+all6 AV actual0.052587. Retain alignment uncertain reserve0.03, exposure1.403328; zero outstanding paid reservations. Null-dollar event classification {json.dumps(models)}: included subscription requests/retained records and unsubmitted calls, not fabricated API-dollar estimates. Native/image journals settled. Normal unknown-cost fingerprint reconciliation must be refreshed after crew events before paid/generation boundary; this note grants no reservation. Fresh official pricing preflight before paid AV. Current actual included account ordinaryAllowed=true/60%used, fresh host permit per request; no automatic reset/purchases/overage. v3 calibrated score/dialogue candidates retain gain0/no second duck/normalize/attenuation; source/canon/music constraints unchanged. Portable editable mix recipe sample-exact; final export/reopen/rerender still required."""
corrections=f"""OWNER CORRECTION REQUEST v4 by {actor}
Rufus: m6-b17 sourceTrigger.verseRef must cover Mark6:47-50 (currently48-50), encompassing actual continuity shot14b1e80d-ebad-4440-86fa-b2b8e238a0c5(47-48). Preserve exact existing verse50 quotation, every assignment/progression/source timing/quiet. Earlier Director finding wrongly named9f5183ce-72eb-47fb-a4ca-d3ec64071771, actually basket43-44: correct attribution in accountable response, never move/alter basket shot. Historical finding retained; original owner explicitly resolves/carries.
Lighting+Camera: hall-right viewed entrance toward royal end and Herod anatomical-right facing entrance are OPPOSITE physical sides. Reconcile one physical-source convention for palace retrospective/rebuke/royal coverage including9dfadec5-e0df-4446-995f-da741495f7db against governing location/native performance evidence. Preserve compatible softwarm key/weaker bounce/exposure/WB; no independently relighting reversals, invented fixture coordinates or false unseen target verification. No convention preselected here. Supply accountable consistent instructions and retain unresolved visual limitations.
Every original owner must freshly review current open blocking issue IDs and explicitly resolve/carry them. Do not reissue old findings as new or infer closure from indexing/delegated notes. Scripture/Cultural and Feasibility must freshly review corrected treatment/current resources; Director independently decides. This request confers no chapter acceptance/source/canon/target QC clearance."""
notes=[('mark6-current-technical-resource-evidence-v4',technical),('mark6-accountable-owner-corrections-v4',corrections)]
try:
 db.execute('BEGIN IMMEDIATE')
 for id,note in notes:
  old=db.execute('SELECT note FROM review_notes WHERE id=?',(id,)).fetchone()
  if old: assert old[0]==note
  else: db.execute("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,0,CAST(strftime('%s','now') AS INTEGER)*1000)",(id,pid,pid,note))
 db.commit()
except: db.rollback();raise
proof={'at':datetime.now(timezone.utc).isoformat(),'actor':actor,'channel':'Existing producer-input schema source=human; explicit delegated provenance, no personal attestation','notes':[{'id':i,'note':n} for i,n in notes],'ledgerUsd':round(ledger,6),'unknownCostEventModels':models,'newProviderCalls':0,'issuesAutoClosed':0}
(r/'owner-correction-current-inputs-v4-20261105.json').write_text(json.dumps(proof,indent=2),encoding='utf-8');print(json.dumps({'registeredNotes':len(notes),'ledgerUsd':round(ledger,6),'issuesClosed':0}));db.close()
