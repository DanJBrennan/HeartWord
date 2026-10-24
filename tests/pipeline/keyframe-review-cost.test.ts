import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db:InstanceType<typeof DatabaseSync>,directory:string;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db,getDataDir:()=>directory}));
vi.mock("../../src/pipeline/ingestion/parse-source-text.js",()=>({parseSourceTextByVerse:(path:string)=>[{verse:1,text:readFileSync(path,"utf8")}]}));
vi.mock("../../src/pipeline/qc/critic.js",()=>({runCritic:vi.fn(async()=>({severity:"none",findings:"Synthetic review",structuredFindings:[],sources:[],costUsd:0.02})),formatCriticFindings:()=>"Synthetic",parseCriticFindings:()=>[]}));
vi.mock("../../src/pipeline/qc/canonical-likeness.js",()=>({checkCanonicalLikeness:vi.fn(async()=>({score:99,instanceCount:1,wardrobeStatus:"match",wardrobeNotes:"Synthetic match",notes:"Synthetic match",costUsd:0.01})),isLikenessAligned:()=>true}));
vi.mock("../../src/pipeline/qc/scene-fidelity.js",()=>({checkSceneFidelity:vi.fn(async()=>({settingScore:99,crowdDensityMatch:true,actionMatch:true,continuityViolation:false,notes:"Synthetic match",costUsd:0.03})),isSceneFidelityAligned:()=>true}));
import {runKeyframeCandidateReview} from "../../src/pipeline/qc/director.js";
import {checkCanonicalLikeness} from "../../src/pipeline/qc/canonical-likeness.js";
import {runCritic} from "../../src/pipeline/qc/critic.js";
beforeEach(()=>{
 directory=mkdtempSync(join(tmpdir(),"heartword-review-cost-"));mkdirSync(join(directory,"assets"));writeFileSync(join(directory,"assets/ref.png"),"synthetic reference");writeFileSync(join(directory,"assets/result.png"),"synthetic picture");
 db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
 db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',5,1,1);
 INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('s','p',1,'Mark 5:1','Mark 5:1',1);
 INSERT INTO shots(id,scene_id,sequence,action,verse_ref,created_at)VALUES('shot','s',1,'Synthetic boat arrival','Mark 5:1',1);
 INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Witness','book','approved','Papuan',1,1);
 INSERT INTO character_versions(id,character_id,version_label,status,created_at)VALUES('v','c','v1','approved',1);
 INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('a','v','headshot','ref.png',1);
 INSERT INTO shot_characters VALUES('shot','c');
 INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('attempt','shot','codex_imagegen','not_reported','generate','hold_for_review','result.png',0,2);`);
});
afterEach(()=>{db.close();rmSync(directory,{recursive:true,force:true});vi.clearAllMocks();});
it("reports all review-call estimates without changing verdict or selecting the picture",async()=>{
 const report=await runKeyframeCandidateReview("attempt");expect(report.costUsd).toBeCloseTo(0.06);expect(report.decision.status).toBe("accepted");
 expect(db.prepare("SELECT status FROM generation_attempts WHERE id='attempt'").get()!.status).toBe("hold_for_review");
});
it("keeps a missing review charge unreported instead of summing it as zero",async()=>{
 vi.mocked(checkCanonicalLikeness).mockResolvedValueOnce({score:99,instanceCount:1,wardrobeStatus:"match",wardrobeNotes:"Synthetic",notes:"Synthetic"});
 expect((await runKeyframeCandidateReview("attempt")).costUsd).toBeUndefined();
});
it("holds a real wardrobe mismatch even when the general Critic reports no concern",async()=>{
 vi.mocked(checkCanonicalLikeness).mockResolvedValueOnce({score:99,instanceCount:1,wardrobeStatus:"mismatch",wardrobeNotes:"Synthetic material garment drift",notes:"Synthetic identity match",costUsd:0.01});
 expect((await runKeyframeCandidateReview("attempt")).decision.status).toBe("retry_modified");
});
it("reviews Mark 5 with its own catalog passage instead of the old Mark 2 pilot",async()=>{
 for(const [path,text] of [["source/hatam/text/Mark/Mark 5.docx","Mark five source"],["source/english-esv/text/Mark/Mark 5.docx","Mark five reference"],["source/hatam/mark-2/mark-2-text.docx","Wrong chapter two"]]){
  const target=join(directory,"assets",path!);mkdirSync(join(target,".."),{recursive:true});writeFileSync(target,text!);
 }
 await runKeyframeCandidateReview("attempt");
 const request=vi.mocked(runCritic).mock.calls.at(-1)![0];
 expect(request.scriptureText).toContain("Mark five source");expect(request.scriptureText).toContain("Mark five reference");expect(request.scriptureText).not.toContain("Wrong chapter two");
});
