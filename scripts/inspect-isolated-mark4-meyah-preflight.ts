/** Read-only Meyah/Mark/4 preflight against this checkout's isolated donor. */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assertEditionInputsCurrent, preflightLanguageEdition, readLanguageEditionOrigin } from "../src/pipeline/language-edition.js";

const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
const dbPath=resolve(root,"db","heartword.sqlite");
if(realpathSync(root)!==root || realpathSync(dbPath)!==dbPath)throw new Error("Expected ordinary paths under the isolated checkout.");
const db=new DatabaseSync(dbPath,{readOnly:true});
try{
  const result=preflightLanguageEdition(db,root,"8a5659a4-b033-4d5f-80e2-904b217cf8a0",{
    renderId:"deefa536-62f9-41b3-bbac-e9e8fb244206",targetLanguage:"meyah",
    title:{bookChapter:"Markus 4",languageName:"Meyah",authority:"Dan Brennan, 2026-10-25",
      durationMs:4000,profile:"mark4-serif-over-establishing",backgroundFramePath:"generated/editorial/mark4-intro/establishing-r1.png"}
  });
  const targetId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
  const targetExists=Boolean(readLanguageEditionOrigin(db,targetId));
  if(targetExists)assertEditionInputsCurrent(db,root,targetId);
  console.log(JSON.stringify({status:result.status,holds:result.holds,sourceQuestions:result.sourceQuestions,
    donorPicturePlacements:result.pictureEvidence.length,approvedVoiceIdentities:result.voices.length,
    estimate:result.estimate,targetExists,targetInputsCurrent:targetExists,
    targetAudio:result.target.audio?.path??null,targetText:result.target.text?.path??null,
    targetReference:result.target.reference?.path??null,preflightFingerprint:result.fingerprint},null,2));
}finally{db.close();}
