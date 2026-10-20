/** Read-only inventory. Never initialize/migrate the production database. */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import {getDataDir} from "../../src/db/client.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const root=getDataDir(), db=new DatabaseSync(join(root,"db/heartword.sqlite"),{readOnly:true});
const names=["Peter","Andrew","James son of Zebedee","John son of Zebedee","Philip the Apostle","Bartholomew","Thomas","Matthew (Levi)","James son of Alphaeus","Thaddaeus (Jude)","Simon the Zealot","Judas Iscariot"];
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const inventory=names.map(name=>{
  const character=db.prepare("SELECT * FROM characters WHERE name=? AND region='Papuan'").get(name)!;
  const versions=db.prepare("SELECT * FROM character_versions WHERE character_id=? ORDER BY created_at,id").all(character.id!);
  const approved=versions.filter(v=>v.status==="approved");
  const references=approved.flatMap(v=>db.prepare("SELECT * FROM character_assets WHERE character_version_id=? ORDER BY category,path").all(v.id!).map(a=>{
    const absolutePath=join(root,"assets",String(a.path));
    const actualSha256=existsSync(absolutePath)?hash(readFileSync(absolutePath)):null;
    return {...a,path:String(a.path),category:String(a.category),absolutePath,actualSha256,hashMatches:a.content_hash?String(a.content_hash).toLowerCase()===actualSha256:null};
  }));
  const reviews=approved.flatMap(v=>db.prepare("SELECT * FROM review_notes WHERE subject_type='character_version' AND subject_id=? ORDER BY created_at,id").all(v.id!));
  return {character,versions,approvedVersionIds:approved.map(v=>v.id),references,reviews};
});
const output={recordedOn:"2026-10-16",authority:"Read-only saved production records; observations and proposals do not issue approvals",databaseSha256:hash(readFileSync(join(root,"db/heartword.sqlite"))),inventory};
mkdirSync("outputs",{recursive:true});
writeFileSync("outputs/disciple-wardrobe-inventory.json",JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(inventory.map(i=>({name:i.character.name,approved:i.versions.filter(v=>v.status==="approved").map(v=>({id:v.id,label:v.version_label,voice:v.voice_id,notes:v.notes})),references:i.references.map(a=>({path:a.path,category:a.category,exists:!!a.actualSha256,hashMatches:a.hashMatches})),reviews:i.reviews.length})),null,2));
db.close();
