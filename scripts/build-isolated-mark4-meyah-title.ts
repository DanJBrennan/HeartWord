/** Build a local title candidate; leave producer selection unrecorded. */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { buildEditionTitleCandidate } from "../src/pipeline/assembly/chapter-title-card.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw new Error("Use exactly --apply in the isolated checkout.");
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
const dbPath=resolve(root,"db","heartword.sqlite");
if(realpathSync(root)!==root || realpathSync(dbPath)!==dbPath)throw new Error("Expected ordinary paths under the isolated checkout.");
const db=new DatabaseSync(dbPath);
try{
  const candidate=buildEditionTitleCandidate(db,root,"a5a40890-8bb0-4856-aacb-1dcad97074bb");
  console.log(JSON.stringify({candidate,selectionRecorded:false,providerCalls:0},null,2));
}finally{db.close();}
