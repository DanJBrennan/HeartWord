/** Audit an already completed isolated restore; never repeat the copy or edit DBs. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream,readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {isAbsolute,join,normalize,resolve} from "node:path";
import {ancestorMetadataEvidence} from "./recovery-boundary-metadata-20261025.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const [backup,destination]=process.argv.slice(2);
assert(backup && destination);
const live="C:\\Users\\danbr\\HeartWordData";
assert.equal(process.permission?.has("fs.read",live),false);
assert.equal(process.permission?.has("fs.write",live),false);
assert.throws(()=>readFileSync(join(live,"db/heartword.sqlite")),{code:"ERR_ACCESS_DENIED"});
const manifest=JSON.parse(readFileSync("outputs/disaster-backup-manifest-20261024.json","utf8"));
const cloud=JSON.parse(readFileSync("outputs/disaster-backup-cloud-only-before-restore-20261024.json","utf8"));
const marker=JSON.parse(readFileSync(join(destination,"restored-from.json"),"utf8"));
assert.equal(marker.id,manifest.id); assert.equal(cloud.backupId,manifest.id);
assert(cloud.allInSync && cloud.allCloudOnly && marker.noGeneration);
assert.equal(resolve(marker.backup),resolve(backup));
const canonical=(path:string)=>normalize(path).toLowerCase();
const files=new Map<string,string>();
for(const file of manifest.files) if(file.path.startsWith("data/")) files.set(canonical(resolve(manifest.sourceRoot,file.path.slice(5))),file.path.slice(5));
const aliases=new Map<string,string>(manifest.references);
const protectedOrigin=new Set(["imported_from","sourceRoot","originalPath","sourceOriginal","url","uri"]);
const changes:Array<{table:string;column:string;location:string;file:string}>=[];
let currentTable="",currentColumn="";
function equalValue(before:unknown,after:unknown,location:string) {
  if(Object.is(before,after)) return;
  if(typeof before==="string" && typeof after==="string") {
    if(isAbsolute(before)) {
      const internal=files.get(canonical(before));
      const file=internal ?? aliases.get(before);
      if(file) {
        const target=resolve(destination,file);
        const sourceBinding=currentTable==="project_source_bindings" && ["docx_path","audio_path","reference_path"].includes(currentColumn);
        const bindingRelative=file.startsWith("assets/") ? file.slice(7) : null;
        const externalAssetReference=!internal && aliases.has(before) && bindingRelative!==null;
        if((isAbsolute(after) && canonical(after)===canonical(target)) || ((sourceBinding||externalAssetReference) && bindingRelative!==null && canonical(after)===canonical(bindingRelative))) {
          changes.push({table:currentTable,column:currentColumn,location,file}); return;
        }
      }
    }
    if((before.startsWith("{")||before.startsWith("[")) && (after.startsWith("{")||after.startsWith("["))) {
      let first:unknown,second:unknown;
      try { first=JSON.parse(before);second=JSON.parse(after); } catch { assert.fail(`Non-path text changed at ${location}`); }
      equalValue(first,second,location+".json");return;
    }
    assert.fail(`Non-path text changed at ${location}`);
  }
  if(Array.isArray(before)&&Array.isArray(after)) {
    assert.equal(after.length,before.length,`Array length changed at ${location}`);
    before.forEach((value,index)=>equalValue(value,after[index],location+"["+index+"]"));return;
  }
  if(before && after && typeof before==="object" && typeof after==="object") {
    if(ArrayBuffer.isView(before)||ArrayBuffer.isView(after)) {assert.deepEqual(after,before,location);return;}
    const first=before as Record<string,unknown>,second=after as Record<string,unknown>;
    assert.deepEqual(Object.keys(second).sort(),Object.keys(first).sort(),location);
    for(const key of Object.keys(first)) {
      if(protectedOrigin.has(key)) assert.deepEqual(second[key],first[key],`Origin changed at ${location}.${key}`);
      else equalValue(first[key],second[key],location+"."+key);
    }
    return;
  }
  assert.deepEqual(after,before,`Value changed at ${location}`);
}
const source=new DatabaseSync(join(backup,"data/db/heartword.sqlite"),{readOnly:true});
const restored=new DatabaseSync(join(destination,"db/heartword.sqlite"),{readOnly:true});
const schema=(db:InstanceType<typeof DatabaseSync>)=>db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
assert.deepEqual(schema(restored),schema(source));
const tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const tableCounts:Record<string,number>={};
for(const table of tables) {
  currentTable=String(table.name);
  const columns=source.prepare(`PRAGMA table_info(${quote(currentTable)})`).all();
  const primary=columns.filter(row=>Number(row.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(row=>quote(String(row.name)));
  const order=primary.length?primary.join(","):"rowid";
  const first=source.prepare(`SELECT * FROM ${quote(currentTable)} ORDER BY ${order}`).all();
  const second=restored.prepare(`SELECT * FROM ${quote(currentTable)} ORDER BY ${order}`).all();
  assert.equal(second.length,first.length,`Row count changed in ${currentTable}`);
  tableCounts[currentTable]=first.length;
  first.forEach((row,index)=>{for(const column of columns){currentColumn=String(column.name);equalValue(row[currentColumn],second[index]![currentColumn],`${currentTable}[${index}].${currentColumn}`);}});
}
assert.equal(restored.prepare("PRAGMA integrity_check").get()!.integrity_check,"ok");
assert.equal(restored.prepare("PRAGMA foreign_key_check").all().length,0);
const project=restored.prepare("SELECT id,language,book,chapter FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=5").get(); assert(project);
const renderId="f6709702-7e82-4a99-b072-7358d9e685a8";
assert(restored.prepare("SELECT id FROM chapter_renders WHERE id=?").get(renderId));
source.close();restored.close();
const digest=createHash("sha256");
for await(const chunk of createReadStream(join(destination,"exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4")))digest.update(chunk);
const filmSha=digest.digest("hex");assert.equal(filmSha,"286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b");
const proof={at:new Date().toISOString(),backupId:manifest.id,backup:resolve(backup),restoredRoot:resolve(destination),applicationDir:marker.applicationDir,
  liveDataReadAccess:false,liveDatabaseReadDenied:true,ancestorMetadataEvidence,providerCalls:0,noPaidRegeneration:true,
  tableCounts,schemaIdentical:true,allProductionRowsCompared:true,allNonPathValuesUnchanged:true,protectedOriginFieldsUnchanged:true,originalRecordEvidence:"Unprojected rows remain in the immutable cloud SQLite snapshot",
  pathProjectionLeaves:changes.length,pathProjectionTables:[...new Set(changes.map(row=>row.table))],
  pathProjectionRule:"Only exact retained-file references may change to the isolated destination; source bindings and explicitly retained external assets may use assets-relative paths. Prose, decisions, identifiers, amounts, timestamps and protected origins must compare equal.",
  integrity:"ok",foreignKeyProblems:0,project,approvedRenderId:renderId,approvedFilmSha256:filmSha,
  includedFilesVerified:manifest.files.length,copyVerificationEvidence:{completionMarker:join(destination,"restored-from.json"),restoredAt:marker.restoredAt,implementation:"restoreDisasterBackup verifies every source hash/database before copy, and each non-main copied file hash before writing this marker"},
  sourceWasCloudOnlyBeforeRestore:true,workflowBrowserCheck:"pending",remoteRecoveryVerified:true,
  deferredMetadataFlushPaths:[join(destination,"logs/disaster-recovery-paths.json"),join(destination,"restored-from.json")],metadataDurability:"outer worker flush pending"};
writeFileSync("outputs/disaster-backup-cloud-restore-proof-20261024.json",JSON.stringify(proof,null,2),{flag:"wx"});
writeFileSync("outputs/disaster-backup-row-path-audit-20261026.json",JSON.stringify({at:proof.at,backupId:manifest.id,changes},null,2),{flag:"wx"});
console.log(JSON.stringify({at:proof.at,backupId:manifest.id,tables:tables.length,rows:Object.values(tableCounts).reduce((a,b)=>a+b,0),pathProjectionLeaves:changes.length,integrity:proof.integrity,approvedFilmSha256:filmSha,liveDatabaseReadDenied:true}));
