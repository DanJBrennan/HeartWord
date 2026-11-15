// Exact-pixel decisions from Codex's separate visual comparison. No provider calls.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refinementDetail,reviewWardrobeCandidate,promoteWardrobeCandidate,wardrobeChecks} from '../../src/characters/wardrobe-refinement.js';
const root='outputs/mark6-production',dataDir='C:/Users/danbr/HeartWordData',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const auth=read(join(root,'authorization.json')),resumption=read(join(root,'full-production-resumption-20261105.json'));
if(auth.status!=='explicitly_authorized'||auth.productionHold||!resumption.fullProductionHoldLifted)throw Error('Current autonomous producer authority required');
const manifest=read(join(root,'wardrobe-sheets-review-ready-20261105.json')),registration=read(join(root,'wardrobe-candidate-registration-20261105.json'));
if(registration.manifestSha256!==hash(join(root,'wardrobe-sheets-review-ready-20261105.json')))throw Error('Prepared inspection manifest changed');
const attribution={reviewer:'Codex (Dan-delegated production review)',authority:`Dan's November2 autonomous Mark6 film/editable-project completion instruction in authorization.json, reaffirmed November5 in full-production-resumption-20261105.json. Routine matching-body correction preserves approved identity/palette and inherited visible construction. This is Codex's visual review under that delegation, not personal Dan inspection or native certification.`};
const db=new DatabaseSync(join(dataDir,'db/heartword.sqlite'));
try{
 if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('Immutable crew worker must be terminal before canon promotion');
 const results=[];
 for(const row of registration.results){
  const p=manifest.proposals.find((p:any)=>p.key===row.key);if(!p)throw Error('Unknown prepared candidate');
  let d=refinementDetail(db,dataDir,row.candidateId);
  if(d.version.status!=='candidate'||d.candidateHash!==row.candidateHash||d.assets.length!==1||d.assets[0]!.sha256!==p.sheetSha256)throw Error('Exact imported candidate changed or was already promoted; inspect state instead of repeating');
  if(d.base.id!==p.expectedCurrentApprovedVersionId)throw Error('Approved basis changed');
  const identity=row.key==='james'
   ?'Directly compared the imported FRONT, SEATED and BARE HEAD face with current approved v3 portrait: recognizable broad square-jawed mature Papuan face, broad nose, substantial brows, close cropped tight black curls and compact squared black beard with subtle gray retained. SIDE and BACK are coherent proposed views of this figure; no unseen old approved profile/rear was claimed inspected. The cream/terracotta distinction from the other disciples is retained.'
   :'Directly compared imported FRONT, SEATED and BARE HEAD face with current approved v3 portrait: recognizable youthful angular Papuan face, short crisp coils, fine moustache without full beard, slender jaw and slim build retained. SIDE and BACK form coherent proposed views, not a claimed comparison with unseen old approved profiles. Aubergine/saffron distinction is retained.';
  d=reviewWardrobeCandidate(db,dataDir,d.version.id,{candidateHash:d.candidateHash,domain:'identity',outcome:'approved',evidence:`Codex direct pixel inspection of imported sheet SHA256:${p.sheetSha256} and approved identity asset:${p.proposalPayload.identityAssetId}. ${identity}`},attribution);
  const observed:Record<typeof wardrobeChecks[number],string>={
   construction:row.key==='james'?'FRONT/SIDE/SEATED show below-knee cream tunic and long loose sleeves; NECKLINE shows the plain slit and flax weave. Separate rectangular terracotta mantle appears in FRINGE detail. Visible inherited cut is preserved; old stripe palette is superseded.':'FRONT/SIDE/SEATED show below-knee aubergine tunic and short loose sleeves; NECKLINE shows plain slit and flax weave. FRINGE detail shows separate rectangular saffron mantle; old cream/wine palette is superseded.',
   layers:row.key==='james'?'FRONT/SIDE/SEATED show brown cloth sash encircling cream tunic, with loose mantle panels outside rather than diagonally captured under the sash.':'Corrected FRONT/SIDE show uninterrupted saffron panel outside the sash, covering the knot where they overlap. BACK/SEATED are consistent; no purple band crosses over saffron fabric. The prior tucked sheet is retained as rejected preparation.',
   colors:row.key==='james'?'Cream tunic and solid terracotta-red mantle match current v3 portrait color language in all displayed views; brown sash/sandals and cream corner cords are visible. No superseded red stripes.':'Aubergine tunic/sash and dusty-saffron mantle match current v3 portrait color language throughout; brown sandals and saffron cords visible. No superseded wine mantle or cream tunic.',
   drape:row.key==='james'?'FRONT/BACK/SIDE/SEATED show one loose shoulder covering with free hanging front ends, compatible with inherited free mantle construction. Generated rear/seated folds are the reviewed proposal, not recovered historical detail.':'FRONT has mantle on anatomical left/viewer right; BACK has it on viewer left, and SIDE/SEATED agree. Mantle hangs freely outside sash. Generated rear/seated folds are the reviewed proposal, not old hidden evidence.',
   fringe:'FRONT/BACK/SIDE/SEATED show discrete tied cord ends rather than continuous shredded hem. FRINGE laid-open detail has four garment corners with one compact hand-tied attachment each. This is the explicit proposed reconstruction convention; exact ancient knot/cord dimensions are not claimed.',
   headCovering:'FRONT/BACK/SIDE/SEATED and BARE HEAD show uncovered current curls. No new cap, patterned band or headcloth.',
   footwear:row.key==='james'?'Complete feet in FRONT/BACK/SIDE/SEATED show plain brown leather strapped low-soled sandals compatible with the inherited broad strap construction. No tall sole, ornament or footwear redesign claimed.':'Complete feet in FRONT/BACK/SIDE/SEATED show plain narrow brown leather sandal straps and low soles compatible with inherited footwear; broad modern straps of earlier draft are not adopted.'
  };
  d=reviewWardrobeCandidate(db,dataDir,d.version.id,{candidateHash:d.candidateHash,domain:'wardrobe',outcome:'approved',evidence:`Separate Codex seven-view wardrobe inspection on exact sheet SHA256:${p.sheetSha256}, compared with approved portrait and inherited visible standing construction. Current colors govern; proposed rear/detail reconstruction is explicit. This approves this reference package, not future target pixels or speaking performance.`,checks:wardrobeChecks.map(check=>({check,status:'pass',evidence:observed[check]}))},attribution);
  const reviewedCandidateHash=d.candidateHash;
  d=promoteWardrobeCandidate(db,dataDir,d.version.id,{candidateHash:reviewedCandidateHash,reason:'Codex under explicit Dan-delegated autonomous production authority: current identity/palette and valid inherited cut/drape/footwear reconciled in coherent seven-view sheet after separate exact-candidate identity and wardrobe reviews. Old versions/assets/history and voice assignment retained. Future film targets still require normal canon/AV review.'},attribution);
  results.push({key:row.key,characterId:p.characterId,oldVersionId:d.base.id,newVersionId:d.version.id,status:d.version.status,reviewedCandidateHash,sheetSha256:p.sheetSha256,voiceProvider:d.version.voice_provider,voiceId:d.version.voice_id,reviewer:attribution.reviewer,authority:attribution.authority,reviewEvents:d.history.filter(e=>e.kind==='review'||e.kind==='promotion')});
  writeFileSync(join(root,'wardrobe-promotion-completion-20261105.json'),JSON.stringify({status:'delegated_separate_identity_wardrobe_reviews_and_promotion_recorded',results,noPersonalDanInspectionClaim:true,noVoiceApproval:true,noProviderCalls:true,oldProductionAssetsRetained:true,newCrewContextRequired:true},null,2));
 }
 console.log(JSON.stringify({promoted:results.map(r=>({key:r.key,newVersionId:r.newVersionId,oldVersionId:r.oldVersionId,reviewedCandidateHash:r.reviewedCandidateHash})),reviewer:attribution.reviewer,noProviderCalls:true}));
}finally{db.close();}
