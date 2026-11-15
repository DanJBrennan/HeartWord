/** Prepare local source listening assets only. No provider calls, approvals,
 * source edits or film dispatch. Existing preparation inputs must hash-match. */
import "dotenv/config";
import {DatabaseSync} from "node:sqlite";
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,relative} from "node:path";
import {getDataDir} from "../src/db/client.js";
import {sourceReviewHashes} from "../src/pipeline/ingestion/source-review.js";
import {listeningFolder,listeningHash,pcmWaveInfo,pcmWindow,type ListeningItem,type ListeningManifest} from "../src/pipeline/ingestion/source-listening-review.js";

const projectId="0694bfbf-5595-4531-8215-6242d4aea927",root=getDataDir();
const prep=join(root,"assets/preparation/hatam-mark5-20261020"),folder=listeningFolder(root,projectId);
const json=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const source=json(join(prep,"source.json")),proposal=json(join(prep,"preparation-review.json"));
for(const file of source.files)if(listeningHash(readFileSync(file.path))!==file.sha256)throw Error("Prepared source changed: "+file.path);
const db=new DatabaseSync(join(root,"db/heartword.sqlite"),{readOnly:true});
const hashes=sourceReviewHashes(db,projectId,root);
const sourceRowsBefore=JSON.stringify(db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY id").all(projectId));
const reviewRowsBefore=Number(db.prepare("SELECT count(*) n FROM review_notes WHERE project_id=?").get(projectId)!.n);
const manifestPath=join(folder,"manifest.json");
if(existsSync(manifestPath))throw Error("Listening set already exists. Retain it and its reviews; do not overwrite.");
mkdirSync(join(folder,"initial"),{recursive:true});mkdirSync(join(folder,"context"),{recursive:true});
const pcmPath=join(folder,"source.wav");
if(!existsSync(pcmPath))execFileSync("ffmpeg",["-nostdin","-v","error","-n","-i",source.paths.audioPath,"-map","0:a:0","-c:a","pcm_s16le","-ar","24000","-ac","2",pcmPath]);
const wav=readFileSync(pcmPath),info=pcmWaveInfo(wav),assetRelative=(p:string)=>relative(join(root,"assets"),p).replaceAll("\\","/");
const casts:Record<string,{id:string;voice:string}>={
 "Jesus":{id:"b78bed54-1d53-4b9f-9070-549dddb71b19",voice:"Brian"},
 "Peter":{id:"9cbc4222-b194-4db4-baa9-2ba7083e31f3",voice:"Peter"},
 "Gerasene man (Mark 5)":{id:"165a1d48-ddd3-4090-8ca0-75b11fece90e",voice:"Malvoryx The Monster"},
 "Jairus":{id:"e644b283-ae6c-43ac-9c6d-8d65e4648dcd",voice:"Bian"},
 "Spokesman from House of Jairus":{id:"c9cb2c85-87f5-4dfb-8fff-70f3305bab45",voice:"Adi"},
};
for(const cast of Object.values(casts))if(!db.prepare("SELECT id FROM characters WHERE id=?").get(cast.id))throw Error("Selected cast missing.");
const round=(ms:number)=>Math.round(ms/10)*10;
const items:ListeningItem[]=proposal.proposedSpeech.map((q:any)=>{
 const verse=Number(q.verseRef.split(":")[1]),cast=casts[q.proposedSpeaker],narration=q.proposedSpeaker.startsWith("Narrator");
 if(!cast&&!narration)throw Error("Unresolved source speaker: "+q.proposedSpeaker);
 return {id:`v${verse}-quote-${q.quoteIndex+1}`,kind:narration?"narration":"character",verseRef:q.verseRef,
  title:verse===28?"Woman’s thought · retain narration":verse===41&&q.quoteIndex===1?"Explanatory gloss · retain narrator introduction":q.proposedSpeaker,
  textHatam:q.hatam,englishContext:q.englishVerse,speakerName:q.proposedSpeaker,characterId:cast?.id??null,voiceName:cast?.voice??null,
  startMs:round(q.timingEnvelope.startMs),endMs:round(q.timingEnvelope.endMs),initialClipPath:"",contextClipPath:"",
  warnings:["Initial timing is an unreviewed playback envelope. Confirm the first and last audible words; exclude narrator introductions from character speech.",q.note,
   ...([31,43].includes(verse)?["This verse has a source-word alignment finding. Also review its separate whole-verse check."]:[]),
   ...(verse===41?["Check the handoff between Talita kum and the narrator’s explanation. The explanatory introduction must remain in narration."]:[])],
  originalEnvelope:q.timingEnvelope,
 };
});
for(const [verse,start,end] of [[31,375340,387761],[40,484617,500777],[43,530103,541381]]){
 const v=source.verses.find((v:any)=>v.verse===verse);if(!v)throw Error("Missing source verse.");
 items.push({id:`v${verse}-alignment`,kind:"alignment",verseRef:`Mark 5:${verse}`,title:"Whole verse · source-word check",textHatam:v.text,englishContext:v.english,speakerName:"Source alignment check",characterId:null,voiceName:null,startMs:round(start!),endMs:round(end!),initialClipPath:"",contextClipPath:"",warnings:["Some source words were not matched by the automated alignment. Listen to the complete verse, use context to extend either edge, and record any discrepancy. This is a listening check, not a character-speech extraction."]});
}
for(const [id,start,end,verse] of [["short-after-v7",93633,93760,"Mark 5:7–8"],["short-within-v43",537049,538344,"Mark 5:43"]] as const){
 const vs=source.verses.filter((v:any)=>id==="short-after-v7"?[7,8].includes(v.verse):v.verse===43);
 items.push({id,kind:"alignment",verseRef:verse,title:"Retained short interval · inspect in context",textHatam:vs.map((v:any)=>v.text).join(" "),englishContext:vs.map((v:any)=>v.english).join(" "),speakerName:"Unclassified source interval",characterId:null,voiceName:null,startMs:round(start),endMs:round(end),initialClipPath:"",contextClipPath:"",warnings:["This short interval was retained rather than discarded. It is not asserted to contain these entire verses. Play with context and adjust the window to identify what is actually audible; note silence, breathing, words or uncertainty."]});
}
items.sort((a,b)=>a.startMs-b.startMs||a.id.localeCompare(b.id));
for(const item of items){
 const initial=join(folder,"initial",item.id+".wav"),context=join(folder,"context",item.id+".wav");
 const clip=pcmWindow(wav,item.startMs,item.endMs),around=pcmWindow(wav,Math.max(0,item.startMs-3000),Math.min(Math.floor(info.durationMs/10)*10,item.endMs+3000));
 for(const [path,bytes] of [[initial,clip],[context,around]] as const){if(existsSync(path)){if(listeningHash(readFileSync(path))!==listeningHash(bytes))throw Error("Retained clip differs: "+path);}else writeFileSync(path,bytes,{flag:"wx"});}
 item.initialClipPath=assetRelative(initial);item.contextClipPath=assetRelative(context);
}
if(items.length!==24||items.filter(i=>i.kind==="character").length!==17)throw Error("Unexpected listening inventory.");
const manifest:ListeningManifest={version:1,projectId,title:"Hatam · Mark 5",...hashes,originalAudioPath:source.paths.audioRelPath,originalAudioSha256:listeningHash(readFileSync(source.paths.audioPath)),pcmPath:assetRelative(pcmPath),pcmSha256:listeningHash(wav),durationMs:info.durationMs,sampleRate:info.sampleRate,channels:info.channels,items};
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
if(JSON.stringify(db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY id").all(projectId))!==sourceRowsBefore||Number(db.prepare("SELECT count(*) n FROM review_notes WHERE project_id=?").get(projectId)!.n)!==reviewRowsBefore)throw Error("Source/review records changed during local preparation; inspect.");
const report={preparedAt:new Date().toISOString(),projectId,items:items.length,spoken:17,narration:2,alignmentChecks:5,manifestHash:listeningHash(readFileSync(manifestPath)),sourceHash:hashes.sourceHash,alignmentHash:hashes.alignmentHash,pcmSha256:manifest.pcmSha256,durationMs:info.durationMs,sampleRate:info.sampleRate,channels:info.channels,originalSourceUnchanged:true,databaseWritten:false,providerCalls:0,filmGenerationAuthorized:false,verifiedWindows:0};
writeFileSync(join(folder,"preparation.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});db.close();
console.log(JSON.stringify({...report,url:`http://127.0.0.1:4000/api/projects/${projectId}/source-listening-review`},null,2));
