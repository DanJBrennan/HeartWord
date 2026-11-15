/** Read-only post-implementation preservation/reopen check. */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {getDataDir} from "../../src/db/client.js";
import {refinementDetail} from "../../src/characters/wardrobe-refinement.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const proof=JSON.parse(readFileSync("outputs/disciple-wardrobe-candidates.json","utf8"));
const root=getDataDir(),before=new DatabaseSync(proof.backupPath,{readOnly:true}),after=new DatabaseSync(join(root,"db/heartword.sqlite"),{readOnly:true});
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>String(r.name));
const rows=tables.map(table=>{
  const original=before.prepare(`SELECT rowid AS __wardrobe_rowid,* FROM "${table}" ORDER BY rowid`).all();
  const current=new Map(after.prepare(`SELECT rowid AS __wardrobe_rowid,* FROM "${table}" ORDER BY rowid`).all().map(r=>[r.__wardrobe_rowid,digest(r)]));
  const unchanged=original.every(r=>current.get(r.__wardrobe_rowid)===digest(r));if(!unchanged)throw Error("Existing production row changed in "+table);
  return {table,originalRows:original.length,unchanged};
});
for(const f of proof.files){const hash=createHash("sha256").update(readFileSync(join(root,"assets",f.path))).digest("hex");if(hash!==f.sha256)throw Error("Original canon bytes changed: "+f.path);}
const candidates=proof.candidates.map((c:{candidateVersionId:string;name:string})=>{
  const d=refinementDetail(after,root,c.candidateVersionId);
  if(d.version.status!=="candidate"||d.base.status!=="approved"||d.history.some(e=>e.kind==="promotion"||e.kind==="review"))throw Error("Unexpected live approval for "+c.name);
  return {name:c.name,candidateId:d.version.id,baseId:d.base.id,candidateHash:d.candidateHash,status:d.version.status,baseStatus:d.base.status,referenceFilesVerified:d.assets.length,decisions:d.history.map(e=>e.kind)};
});
const output={originalTables:rows.length,originalRows:rows.reduce((n,t)=>n+t.originalRows,0),rows,originalCanonFilesVerified:proof.files.length,candidates,foreignKeyIssues:after.prepare("PRAGMA foreign_key_check").all(),promotions:0,productionDispatches:0};
writeFileSync("outputs/disciple-wardrobe-preservation.json",JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({tables:output.originalTables,originalRows:output.originalRows,originalCanonFiles:output.originalCanonFilesVerified,candidates:candidates.length,promotions:0,foreignKeyIssues:output.foreignKeyIssues}));before.close();after.close();
