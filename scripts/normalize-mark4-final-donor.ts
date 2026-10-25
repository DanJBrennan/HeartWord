/** Apply a producer-reviewed final-picture map only to this checkout's copy.
 * Usage: npx tsx scripts/normalize-mark4-final-donor.ts output/mark4-map.json
 * The input is reviewed data, never generated or approved by this command. */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { normalizeMark4FinalDonor, type Mark4PicturePlan } from "../src/pipeline/language-edition-legacy-donor.js";

const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
const dbPath=resolve(root,"db","heartword.sqlite");
const supplied=process.argv.slice(2);
if(supplied.length!==1)throw new Error("Supply exactly one reviewed JSON picture-map path. The database target is fixed to the ignored isolated copy.");
if(realpathSync(root)!==resolve(root) || realpathSync(dbPath)!==dbPath)
  throw new Error("The isolated donor root/database must be ordinary paths inside this checkout, not links to a live location.");
const plan=JSON.parse(readFileSync(resolve(supplied[0]!),"utf8")) as Mark4PicturePlan;
const db=new DatabaseSync(dbPath);
try { console.log(JSON.stringify(normalizeMark4FinalDonor(db,root,plan))); }
finally { db.close(); }
