import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {createWardrobeCandidate,addWardrobeReference,reviewWardrobeCandidate,promoteWardrobeCandidate,refinementDetail,wardrobeChecks,wardrobeViews,wardrobeReferenceRole,approvedWardrobeQcReference,assertWardrobeReviewBasis,type WardrobeProposal} from "../../src/characters/wardrobe-refinement.js";
import {getKeyframeContext,prepareReferencePacket,sha256} from "../../src/pipeline/media-generation/external-keyframes.js";
import {getCoverageBeatContext} from "../../src/pipeline/media-generation/external-coverage-keyframes.js";
import {renderWardrobeRefinementPage} from "../../src/server/wardrobe-refinement-page.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db:InstanceType<typeof DatabaseSync>,dir:string;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db,getDataDir:()=>dir}));
const bytes=()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write("IHDR",12);b.writeUInt32BE(1672,16);b.writeUInt32BE(941,20);return b;};
function proposal():WardrobeProposal {return {projectId:"p",baseVersionId:"v1",versionLabel:"v2-candidate",reason:"Propagate approved wardrobe, preserve individual identity",gaps:["Older carried poses show continuous fringe"],identityAssetId:"face",wardrobeAssetId:"body",identityNotes:"Same mature Papuan face, short gray curls, broad beard and build",facts:{construction:"plain rectangular sleeves and neck slit",layers:"cream tunic plus rectangular mantle",colors:"cream tunic and rust mantle",drape:"mantle over shoulders",fringe:"four compact corner cord bundles",headCovering:"bare head",footwear:"plain leather sandals"},evidence:[{ref:"character_assets:body",classification:"producer_choice",limitations:"Approved reconstruction; exact historical knots are uncertain"}],unresolvedDecisions:[]};}
function create(){return createWardrobeCandidate(db,dir,"c",proposal());}
function imported(){const c=create();return addWardrobeReference(db,dir,c.version.id,{sourcePath:"sheet.png",views:[...wardrobeViews],prompt:"16:9 exact approved references",referenceHashes:c.baseAssets.map(a=>({assetId:a.id,sha256:a.sha256}))});}
function approve(id:string) {let d=refinementDetail(db,dir,id);d=reviewWardrobeCandidate(db,dir,id,{domain:"identity",candidateHash:d.candidateHash,outcome:"approved",evidence:"Every view matches face, hair, age and build of base"});return reviewWardrobeCandidate(db,dir,id,{domain:"wardrobe",candidateHash:d.candidateHash,outcome:"approved",evidence:"Compared every sheet view against approved base",checks:wardrobeChecks.map(check=>({check,status:"pass",evidence:`Visible ${check} matches base; reference view identified`}))});}
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),"heartword-wardrobe-"));mkdirSync(join(dir,"assets"));
  db=new DatabaseSync(join(dir,"db.sqlite"));db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',4,1,1);
  INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Peter','global','approved','Papuan',1,1);
  INSERT INTO character_versions(id,character_id,version_label,status,voice_provider,voice_id,notes,created_at)VALUES('v1','c','v1','approved','elevenlabs','voice-unchanged','Approved original',1);
  INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('face','v1','headshot','face.png',1),('body','v1','body_pose','body.png',1);
  INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('s','p',1,'Mark 4:1','Mark 4:2',1);
  INSERT INTO shots(id,scene_id,sequence,action,verse_ref,created_at)VALUES('shot','s',1,'Listens','Mark 4:1',1);
  INSERT INTO shot_characters VALUES('shot','c');
  INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES('old-take','shot','retained','retained','generate','Old approved film authority','accepted','old-film.png',1,1);
  INSERT INTO coverage_beats(id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,needs_lip_sync,requires_new_keyframe,status,created_at)VALUES('beat','shot',1,'master',0,4000,0,1,'planned',1);`);
  for(const p of ["face.png","body.png","sheet.png","old-film.png"])writeFileSync(join(dir,"assets",p),bytes());
});
afterEach(()=>db.close());
describe("controlled wardrobe refinement",()=>{
  it("uses the mounted producer API and saved service, and voice edits never select a candidate",async()=>{
    const {createHeartWordApp}=await import("../../src/server/app.js");
    const server=createHeartWordApp().listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
    const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}/api/characters`;
    const json=(body:unknown)=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    try {
      const response=await fetch(base+"/c/refinements",json(proposal()));expect(response.status).toBe(200);
      const candidate=await response.json() as ReturnType<typeof create>;
      expect((await fetch(base+"/wrong/refinements/"+candidate.version.id)).status).toBe(400);
      expect((await fetch(base+"/refinements/review")).headers.get("Cache-Control")).toBe("no-store");
      expect((await(await fetch(base+"/c/refinements/"+candidate.version.id)).json()).proposal).toEqual(proposal());
      const voices=await fetch(base+"/c/voice",{...json({voiceProvider:"elevenlabs",voiceId:"new-producer-choice"}),method:"PATCH"});expect(voices.status).toBe(200);
      expect(db.prepare("SELECT voice_id FROM character_versions WHERE id='v1'").get()!.voice_id).toBe("new-producer-choice");
      expect(db.prepare("SELECT voice_id FROM character_versions WHERE id=?").get(candidate.version.id)!.voice_id).toBe("voice-unchanged");
      const listing=await(await fetch(base)).json();expect(listing.characters[0].latest_version_id).toBe("v1");
    }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
  });
  it("keeps candidate creation out of approved state and preserves voice assignment",()=>{
    const c=create();expect(c.version.status).toBe("candidate");expect(c.version.voice_id).toBe("voice-unchanged");
    expect(db.prepare("SELECT status FROM character_versions WHERE id='v1'").get()!.status).toBe("approved");
    expect(getKeyframeContext(db,dir,"shot").references.every(r=>r.version_id==="v1")).toBe(true);
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"No images"})).toThrow(/views/);
  });
  it("requires a complete proposal and exact scoped approved references",()=>{
    expect(()=>createWardrobeCandidate(db,dir,"c",{...proposal(),facts:{...proposal().facts,fringe:""}})).toThrow("Complete");
    expect(()=>createWardrobeCandidate(db,dir,"c",{...proposal(),identityAssetId:"wrong"})).toThrow("Exact approved");
    db.exec("UPDATE characters SET region='Other'");expect(()=>create()).toThrow("Papuan");
  });
  it("retains unresolved historical choices without permitting their import",()=>{
    const c=createWardrobeCandidate(db,dir,"c",{...proposal(),unresolvedDecisions:["New head covering needs Dan"]});
    expect(()=>addWardrobeReference(db,dir,c.version.id,{sourcePath:"sheet.png",views:[...wardrobeViews],prompt:"test",referenceHashes:[]})).toThrow("Resolve producer");
  });
  it("requires input hashes, declared views and immutable managed paths",()=>{
    const c=create();const args={sourcePath:"sheet.png",views:[...wardrobeViews],prompt:"16:9",referenceHashes:[]};
    expect(()=>addWardrobeReference(db,dir,c.version.id,args)).toThrow("reference hash");
    expect(()=>addWardrobeReference(db,dir,c.version.id,{...args,views:["front"]})).toThrow("every required");
    expect(()=>addWardrobeReference(db,dir,c.version.id,{...args,sourcePath:"../outside.png",referenceHashes:c.baseAssets.map(a=>({assetId:a.id,sha256:a.sha256}))})).toThrow("inside assets");
  });
  it("records built-in included usage and unknown cost honestly",()=>{
    const c=imported(),ref=c.history.find(e=>e.kind==="reference")!;expect(ref.provider).toBe("codex_imagegen");expect(ref.costUsd).toBeNull();
    expect(ref.includedUsage).toBe("not_reported");expect(c.assets[0]!.path).toContain(c.version.id);
    expect(()=>addWardrobeReference(db,dir,c.version.id,{sourcePath:"sheet.png",views:[...wardrobeViews],prompt:"retry",referenceHashes:[]})).toThrow("successor");
  });
  it("holds malformed, missing and concretely failing wardrobe assessments",()=>{
    const c=imported();const review={domain:"wardrobe" as const,candidateHash:c.candidateHash,outcome:"approved" as const,evidence:"Visible sheet"};
    expect(()=>reviewWardrobeCandidate(db,dir,c.version.id,review)).toThrow("Every concrete");
    expect(()=>reviewWardrobeCandidate(db,dir,c.version.id,{...review,checks:wardrobeChecks.map(check=>({check,status:check==="fringe"?"fail":"pass",evidence:"Fringe attached continuously along hem"}))})).toThrow("hold approval");
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"Too early"})).toThrow("identity");
  });
  it("never lets submitted review fields forge a promotion or change event ownership",()=>{
    const c=imported();
    reviewWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,domain:"identity",outcome:"approved",evidence:"Same face",kind:"promotion",reviewer:"somebody else"} as never);
    const result=refinementDetail(db,dir,c.version.id);
    expect(result.history.at(-1)!.kind).toBe("review");expect(result.history.at(-1)!.reviewer).toBe("producer");
    expect(wardrobeReferenceRole(db,c.version.id,"body_pose")).toBe("legacy_identity_and_wardrobe");
  });
  it("keeps identity and wardrobe approvals separate and the latest rejection controlling",()=>{
    const c=imported();reviewWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,domain:"identity",outcome:"approved",evidence:"Same face"});
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"test"})).toThrow("wardrobe");
    approve(c.version.id);reviewWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,domain:"identity",outcome:"rejected",evidence:"Rear view has a different hair silhouette"});
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"test"})).toThrow("identity");
  });
  it("rejects stale reviews and a changed approved basis",()=>{
    const c=imported();expect(()=>reviewWardrobeCandidate(db,dir,c.version.id,{candidateHash:"old",domain:"identity",outcome:"approved",evidence:"same"})).toThrow("Stale");
    approve(c.version.id);db.exec("UPDATE character_versions SET notes='Producer changed basis' WHERE id='v1'");
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"stale"})).toThrow("basis changed");
  });
  it("detects modified candidate bytes after approval",()=>{
    const c=approve(imported().version.id);writeFileSync(join(dir,"assets",c.assets[0]!.path),"changed");
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"stale"})).toThrow("bytes changed");
  });
  it("promotes atomically with prior assets, provenance and accepted film authority intact",()=>{
    const oldVersion=db.prepare("SELECT * FROM character_versions WHERE id='v1'").get()!,oldAssets=db.prepare("SELECT * FROM character_assets WHERE character_version_id='v1'").all();
    const film=db.prepare("SELECT * FROM generation_attempts").all();const c=approve(imported().version.id);
    const result=promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"Dan compares and approves exact candidate"});
    expect(result.version.status).toBe("approved");expect(result.version.voice_id).toBe("voice-unchanged");
    expect(db.prepare("SELECT * FROM character_versions WHERE id='v1'").get()).toEqual({...oldVersion,status:"superseded"});
    expect(db.prepare("SELECT * FROM character_assets WHERE character_version_id='v1'").all()).toEqual(oldAssets);
    expect(db.prepare("SELECT * FROM generation_attempts").all()).toEqual(film);expect(sha256(readFileSync(join(dir,"assets/old-film.png")))).toBe(sha256(bytes()));
    expect(result.history.filter(e=>e.kind==="promotion")).toHaveLength(1);
    expect(()=>promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"repeat"})).toThrow("Stale");
  });
  it("reopens the same saved preparation/reviews before promotion and retains their decisions",()=>{
    const c=approve(imported().version.id),savedHistory=c.history;
    db.close();db=new DatabaseSync(join(dir,"db.sqlite"));
    const reopened=refinementDetail(db,dir,c.version.id);expect(reopened.history).toEqual(savedHistory);expect(reopened.candidateHash).toBe(c.candidateHash);
    const promoted=promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:reopened.candidateHash,reason:"Synthetic persisted-workflow demonstration, no live approval"});
    db.close();db=new DatabaseSync(join(dir,"db.sqlite"));
    expect(refinementDetail(db,dir,c.version.id).version.status).toBe("approved");
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id='old-take'").get()!.status).toBe("accepted");
    expect(promoted.history.filter(e=>e.kind==="review")).toHaveLength(2);
  });
  it("holds retroactive QC before spending or invalidating an older accepted take",()=>{
    expect(()=>assertWardrobeReviewBasis(db,"old-take")).not.toThrow();
    const c=approve(imported().version.id);promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"Synthetic new preferred wardrobe"});
    expect(()=>assertWardrobeReviewBasis(db,"old-take")).toThrow("original visual authority");
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id='old-take'").get()!.status).toBe("accepted");
    db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES('explicit-new-candidate','shot','retained','retained','generate','Reviewed new target','hold_for_review','old-film.png',0,?)").run(Date.now()+10);
    expect(()=>assertWardrobeReviewBasis(db,"explicit-new-candidate")).not.toThrow();
  });
  it("gives shot and coverage handoffs the same exact version and explicit roles",()=>{
    const c=approve(imported().version.id);promoteWardrobeCandidate(db,dir,c.version.id,{candidateHash:c.candidateHash,reason:"Approved"});
    const shot=getKeyframeContext(db,dir,"shot"),beat=getCoverageBeatContext(db,dir,"beat");
    expect(beat.references).toEqual(shot.references);expect(shot.references).toHaveLength(2);
    expect(shot.references.map(r=>r.referenceRole)).toEqual(["identity_only","wardrobe"]);
    expect(shot.references.every(r=>r.version_id===c.version.id)).toBe(true);
    expect(shot.references[1]!.wardrobeFacts).toContain("four compact corner");
    expect(wardrobeReferenceRole(db,"v1","headshot")).toBe("legacy_identity_and_wardrobe");
    expect(approvedWardrobeQcReference(db,dir,"c")).toBe(c.assets[0]!.path);
    writeFileSync(join(dir,"assets",c.assets[0]!.path),"changed wardrobe");
    expect(()=>approvedWardrobeQcReference(db,dir,"c")).toThrow("bytes changed");
  });
  it("renders producer comparison and separate approval controls safely",()=>{
    const c=create();db.prepare("UPDATE characters SET name=? WHERE id='c'").run("</script><img onerror=alert(1)>");
    const html=renderWardrobeRefinementPage(db);expect(html).toContain("Approve identity preservation");expect(html).toContain("Approve wardrobe");expect(html).toContain("not_visible");expect(html).not.toContain("</script><img");expect(html).toContain(c.version.id);
  });
});
