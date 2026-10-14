import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
import Ajv2020 from "ajv/dist/2020.js";
import {afterEach,describe,expect,it,vi} from "vitest";
import {buildAvatarRequest,compileAvatarSettings,validateAvatarDirection,NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,NEUTRAL_POSITIVE_AVATAR_PROMPT,type AvatarDirection} from "../../src/providers/kling/avatar-direction.js";
import {avatarComparisonBudget,checkAvatarSpend,reconcileAvatarBudget,reserveAvatarSpend,settleAvatarSpend,readPerformanceDirection,savePerformanceDirection} from "../../src/pipeline/voice-lipsync/performance-direction.js";
import {KlingLipSyncProvider} from "../../src/providers/kling/index.js";

let dataDir:string;
vi.mock("../../src/db/client.js",()=>({getDataDir:()=>dataDir}));
const fixture=()=>JSON.parse(readFileSync("docs/design/fdl/example.kling-avatar.v1.json","utf8")).settings as AvatarDirection;
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(dataDir)rmSync(dataDir,{recursive:true,force:true});});

describe("verified controls and FDL mapping",()=>{
  it.each(["neutral","positive"])("prefers Dan's exact warm baseline for an explicitly %s treatment",register=>{
    const d=fixture();d.baseline={id:NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,evidence:"Dan's October 14 standing preference"};d.intent={emotionalRegister:register};
    const original=structuredClone(d);const compiled=compileAvatarSettings(d);
    expect(compiled.settings.prompt).toBe(NEUTRAL_POSITIVE_AVATAR_PROMPT);
    expect(compiled.baselineSelection?.profileId).toBe(NEUTRAL_POSITIVE_AVATAR_PROFILE_ID);
    expect(compiled.settings.mode).toBeUndefined();expect(d).toEqual(original);
  });
  it("keeps source-grounded overrides and explicit empty prompts ahead of the preference",()=>{
    const d=fixture();d.baseline={id:NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,evidence:"Producer preference"};d.intent={emotionalRegister:"positive"};d.overrides.prompt="Warm but restrained reassurance, no smile.";
    expect(compileAvatarSettings(d).settings.prompt).toBe(d.overrides.prompt);
    d.overrides.prompt="";expect(compileAvatarSettings(d).settings.prompt).toBe("");
  });
  it.each(["rebuke","negative","grief","fear","unresolved"])("does not apply the preferred smiling profile to %s",register=>{
    const d=fixture();d.baseline={id:NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,evidence:"Producer preference"};d.intent={emotionalRegister:register};
    expect(()=>validateAvatarDirection(d)).toThrow("neutral or positive");
    d.overrides.prompt="Deliver the recorded rebuke firmly, with no smile, preserving the supplied words and pace.";
    expect(compileAvatarSettings(d).settings.prompt).not.toContain(NEUTRAL_POSITIVE_AVATAR_PROMPT);
  });
  it("holds a retained warm baseline when the saved treatment changes to a stern rebuke",()=>{
    const d=fixture();d.intent={emotionalRegister:"stern rebuke"};expect(()=>validateAvatarDirection(d)).toThrow("negative performance");
  });
  it("does not infer a smiling default from missing direction or unclassified content",()=>{
    expect(compileAvatarSettings().settings.prompt).toBeUndefined();
    const d=fixture();d.baseline={id:"unspecified",evidence:"Source meaning unresolved"};d.intent={};d.requiredControls=["image","sound_file"];
    expect(compileAvatarSettings(d).settings.prompt).toBeUndefined();
    d.intent={emotionalRegister:"rebuke"};expect(compileAvatarSettings(d).settings.prompt).not.toContain(NEUTRAL_POSITIVE_AVATAR_PROMPT);
  });
  it("validates the additive provider extension without rewriting historical core/Bible schemas",()=>{
    const validate=new Ajv2020({strict:true}).compile(JSON.parse(readFileSync("docs/design/fdl/kling-avatar.v1.schema.json","utf8")));
    expect(validate(fixture()),JSON.stringify(validate.errors)).toBe(true);
    validateAvatarDirection(fixture());
    expect(buildAvatarRequest("aGVsbG8=","c291bmQ=",fixture())).toEqual({image:"aGVsbG8=",sound_file:"c291bmQ=",prompt:fixture().baseline.prompt});
  });
  it("keeps explicit empty, omitted and service-default fields distinct",()=>{
    expect(buildAvatarRequest("image","sound")).toEqual({image:"image",sound_file:"sound"});
    const d=fixture();d.overrides={prompt:"",mode:"std"};
    expect(compileAvatarSettings(d)).toMatchObject({settings:{prompt:"",mode:"std"}});
    expect(compileAvatarSettings().defaults.prompt).toContain("not GUI equivalence");
  });
  it("maps acting intent to prose, retaining requested direction independently",()=>{
    const d=fixture();d.intent={gaze:"Toward the same listener",hands:"Restrained",progression:"Maintain the previous quiet concern"};
    const original=structuredClone(d);const r=buildAvatarRequest("i","a",d);
    expect(r.prompt).toContain("gaze: Toward the same listener");expect(r).not.toHaveProperty("gaze");expect(d).toEqual(original);
  });
  it.each(["head_rotation","gaze_strength","motion_intensity","seed","model_name","camera_control"])("holds undocumented required control %s",name=>{
    const d=fixture();d.requiredControls.push(name);expect(()=>buildAvatarRequest("i","a",d)).toThrow("unsupported");
  });
  it("rejects unknown settings, numeric acting controls and invalid mode",()=>{
    const d=fixture();(d.overrides as Record<string,unknown>).motion_intensity=0.6;expect(()=>validateAvatarDirection(d)).toThrow("Unsupported");
    const n=fixture();(n.intent as Record<string,unknown>).head=0.5;expect(()=>validateAvatarDirection(n)).toThrow("descriptions");
    const m=fixture();m.overrides.mode="4k" as "std";expect(()=>validateAvatarDirection(m)).toThrow("mode");
  });
  it("never truncates direction or supplies a missing required mode",()=>{
    const d=fixture();d.intent.head="x".repeat(2500);expect(()=>validateAvatarDirection(d)).toThrow("exceeds");
    const r=fixture();r.requiredControls.push("mode");expect(()=>validateAvatarDirection(r)).toThrow("omitted");
  });
});

it("reserves before submission, counts outstanding charges and holds retries until settled",()=>{
  const db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',1,1,1)");
  try{
    expect(()=>reserveAvatarSpend(db,"p","shot",1)).toThrow("reconcile");
    reconcileAvatarBudget(db,{projectId:"p",actor:"Synthetic test",evidence:"Known fixture bounds for all mocked spending.",unreportedUpperBoundUsd:190,outstandingUpperBoundUsd:5,idempotencyKey:"costs"});
    const reservation=reserveAvatarSpend(db,"p","shot",3);
    expect(checkAvatarSpend(db,"p",0).committedUsd).toBe(198);
    expect(()=>reserveAvatarSpend(db,"p","shot",1)).toThrow("outstanding");
    expect(()=>reserveAvatarSpend(db,"p","other",3)).toThrow("$200");
    expect(()=>settleAvatarSpend(db,"p",reservation,"absent")).toThrow("terminal attempt");
    db.exec("INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES('sc','p',1,'Mark 1:1','Mark 1:1',1); INSERT INTO shots(id,scene_id,sequence,action,needs_lip_sync,created_at) VALUES('shot','sc',1,'fixture',1,1); INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,cost_usd,created_at) VALUES('attempt','shot','fixture','fixture','lip_sync','hold_for_review',3,1); INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES('cost','p','attempt',3,1)");
    settleAvatarSpend(db,"p",reservation,"attempt");expect(checkAvatarSpend(db,"p",0).committedUsd).toBe(198);
    db.exec("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,created_at) VALUES('run','p','planning','h','{}','incomplete',1); INSERT INTO production_events(id,run_id,sequence,role,round,prompt,model,created_at) VALUES('unknown','run',1,'critic',1,'p','m',1)");
    expect(()=>checkAvatarSpend(db,"p",0)).toThrow("New unreported");
  }finally{db.close();}
});

function database(){
  const db=new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE scenes(id TEXT,project_id TEXT);CREATE TABLE shots(id TEXT,scene_id TEXT,needs_lip_sync INTEGER,dialogue_character_id TEXT);
    CREATE TABLE shot_utterance_bindings(id TEXT,shot_id TEXT,source_audio_segment_id TEXT,source_start_ms INTEGER,source_end_ms INTEGER,character_version_id TEXT,source_hash TEXT);
    CREATE TABLE edit_commands(id TEXT,project_id TEXT,sequence INTEGER,command_type TEXT,payload TEXT,idempotency_key TEXT,applied_at INTEGER,undone INTEGER DEFAULT 0);
    INSERT INTO scenes VALUES('sc','p');INSERT INTO shots VALUES('a','sc',1,'Jesus'),('b','sc',1,'Jesus');
    INSERT INTO shot_utterance_bindings VALUES('ba','a','source',0,5000,'approved-voice','sourcehash'),('bb','b','source',5000,10000,'approved-voice','sourcehash');`);
  return db;
}
describe("same saved direction and cumulative budget",()=>{
  it("reopens one direction for related clips, replays idempotently and preserves superseded history",()=>{
    const db=database();try{
      const input={projectId:"p",shotIds:["a","b"],direction:fixture(),actor:"Kit",idempotencyKey:"first"};
      const packet=savePerformanceDirection(db,input);expect(savePerformanceDirection(db,input)).toEqual(packet);
      expect(readPerformanceDirection(db,"p","a")).toEqual(readPerformanceDirection(db,"p","b"));
      const next=fixture();next.intent.gaze="Maintain the listeners' eyeline";next.reason="Source-supported progression; see accepted treatment";
      savePerformanceDirection(db,{...input,direction:next,idempotencyKey:"second"});
      expect(db.prepare("SELECT COUNT(*) n FROM edit_commands").get()?.n).toBe(2);
      expect(readPerformanceDirection(db,"p","a")).toEqual(next);
      db.exec("UPDATE edit_commands SET undone=1 WHERE idempotency_key='second'");expect(readPerformanceDirection(db,"p","a")).toEqual(input.direction);
      expect(()=>savePerformanceDirection(db,{...input,direction:next})).toThrow("Idempotency");
    }finally{db.close();}
  });
  it("holds changed source or voice bindings, foreign chapters and unbound shots",()=>{
    const db=database();try{
      savePerformanceDirection(db,{projectId:"p",shotIds:["a","b"],direction:fixture(),actor:"Kit",idempotencyKey:"first"});
      db.exec("UPDATE shot_utterance_bindings SET source_end_ms=11000 WHERE shot_id='b'");
      expect(()=>readPerformanceDirection(db,"p","a")).toThrow("stale");
      expect(()=>savePerformanceDirection(db,{projectId:"other",shotIds:["a"],direction:fixture(),actor:"Kit",idempotencyKey:"second"})).toThrow("binding");
      expect(()=>savePerformanceDirection(db,{projectId:"p",shotIds:["missing"],direction:fixture(),actor:"Kit",idempotencyKey:"third"})).toThrow("binding");
    }finally{db.close();}
  });
  it("includes outstanding/rejected/review costs and refuses unknowns, overspend and invalid figures",()=>{
    const c={recordedUsd:160.663757,unreportedUpperBoundUsd:10,outstandingUpperBoundUsd:20,comparisonUpperBoundUsd:3};
    expect(avatarComparisonBudget(c).afterComparisonUsd).toBeCloseTo(193.663757);
    expect(()=>avatarComparisonBudget({...c,unreportedUpperBoundUsd:null})).toThrow("Reconcile");
    expect(()=>avatarComparisonBudget({...c,outstandingUpperBoundUsd:40})).toThrow("$200");
    expect(()=>avatarComparisonBudget({...c,comparisonUpperBoundUsd:NaN})).toThrow("Reconcile");
  });
});

it.each([{startMs:0,endMs:1000,frequency:440},{startMs:1000,endMs:1500,frequency:880}])("extracts exact window $startMs–$endMs before silence; no fallback or adjacent speech",async({startMs,endMs,frequency})=>{
  dataDir=mkdtempSync(join(tmpdir(),"heartword-avatar-"));mkdirSync(join(dataDir,"assets"));
  writeFileSync(join(dataDir,"assets/image.png"),"fixture approved image");
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","sine=frequency=440:duration=1","-f","lavfi","-i","sine=frequency=880:duration=1","-filter_complex","[0:a][1:a]concat=n=2:v=0:a=1","-y",join(dataDir,"assets/source.wav")]);
  vi.stubEnv("KLING_API_KEY_1","offline-test");let submitted:Record<string,string>={};
  const request=vi.fn(async(_url:string,init:RequestInit)=>{submitted=JSON.parse(String(init.body));return {ok:false,status:400,json:async()=>({code:400,message:"fixture rejection"})};});vi.stubGlobal("fetch",request);
  await expect(new KlingLipSyncProvider().sync({characterId:"Jesus",characterVersionId:"v"},{path:"source.wav",startMs,endMs},{path:"image.png"},{avatarDirection:fixture()})).rejects.toThrow("submit failed");
  expect(request).toHaveBeenCalledTimes(1);expect(Object.keys(submitted).sort()).toEqual(["external_task_id","image","prompt","sound_file"]);
  expect(submitted.sound_file).not.toContain("data:");
  const audio=join(dataDir,"submitted.mp3");writeFileSync(audio,Buffer.from(submitted.sound_file!,"base64"));
  const tail=execFileSync("ffmpeg",["-v","error","-i",audio,"-ss","1.3","-t","0.5","-f","f32le","-ac","1","-"]);
  let max=0;for(let i=0;i<tail.length;i+=4)max=Math.max(max,Math.abs(tail.readFloatLE(i)));expect(max).toBeLessThan(0.001);
  const head=execFileSync("ffmpeg",["-v","error","-i",audio,"-t","0.25","-ar","8000","-f","f32le","-ac","1","-"]);
  function energy(hz:number){let sin=0,cos=0;for(let i=0;i<head.length/4;i++){sin+=head.readFloatLE(i*4)*Math.sin(2*Math.PI*hz*i/8000);cos+=head.readFloatLE(i*4)*Math.cos(2*Math.PI*hz*i/8000);}return sin*sin+cos*cos;}
  expect(energy(frequency)).toBeGreaterThan(energy(frequency===440?880:440)*100);
  const manifests=readdirSync(join(dataDir,"assets/generated/lipsync")).filter(p=>p.endsWith(".json"));expect(manifests).toHaveLength(1);
  expect(readFileSync(join(dataDir,"assets/generated/lipsync",manifests[0]!),"utf8")).not.toContain("offline-test");
});

it("reuses and retains a complete supplied audio file byte for byte",async()=>{
  dataDir=mkdtempSync(join(tmpdir(),"heartword-avatar-exact-"));mkdirSync(join(dataDir,"assets"));writeFileSync(join(dataDir,"assets/image.png"),"fixture");
  const source=join(dataDir,"assets/source.wav");execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","sine=duration=2","-y",source]);
  vi.stubEnv("KLING_API_KEY_1","offline");let submitted:Record<string,string>={};vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{submitted=JSON.parse(String(init.body));return {ok:false,status:400,json:async()=>({code:400})};}));
  const direction=fixture();direction.baseline={id:NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,evidence:"Dan's approved neutral/positive preference"};direction.intent={emotionalRegister:"neutral"};
  await expect(new KlingLipSyncProvider().sync({characterId:"c",characterVersionId:"v"},{path:"source.wav",startMs:0,endMs:2000},{path:"image.png"},{avatarDirection:direction})).rejects.toThrow("submit failed");
  expect(submitted.prompt).toBe(NEUTRAL_POSITIVE_AVATAR_PROMPT);
  expect(Buffer.from(submitted.sound_file!,"base64")).toEqual(readFileSync(source));
  const inputs=readdirSync(join(dataDir,"assets/generated/lipsync")).filter(p=>p.endsWith(".wav"));expect(inputs).toHaveLength(1);
  expect(readFileSync(join(dataDir,"assets/generated/lipsync",inputs[0]!))).toEqual(readFileSync(source));
  const evidence=readdirSync(join(dataDir,"assets/generated/lipsync")).find(p=>p.endsWith(".json"))!;
  expect(JSON.parse(readFileSync(join(dataDir,"assets/generated/lipsync",evidence),"utf8")).baselineSelection.profileId).toBe(NEUTRAL_POSITIVE_AVATAR_PROFILE_ID);
});

it("holds unsupported controls and known canon conflicts before extraction or a paid request",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  const d=fixture();d.requiredControls.push("numeric_gaze");
  const args=[{characterId:"Jesus",characterVersionId:"v"},{path:"missing",startMs:0,endMs:1000},{path:"missing"}] as const;
  await expect(new KlingLipSyncProvider().sync(...args,{avatarDirection:d})).rejects.toThrow("unsupported");
  await expect(new KlingLipSyncProvider().sync({...args[0],lockedVisualFacts:{description:"locked",prohibitedPromptPhrases:["smiling warmly"]}},args[1],args[2],{avatarDirection:fixture()})).rejects.toThrow("canon");
  expect(fetch).not.toHaveBeenCalled();
});
