/** Create a separate, immutable quotation-turn listening set from the retained
 * Gemini verse anchors. The 40-entry verse manifest and its reviews are untouched. */
import {DatabaseSync} from "node:sqlite";
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {sourceReviewHashes} from "../src/pipeline/ingestion/source-review.js";
import {listeningFolder,listeningHash,pcmWindow,pcmWaveInfo,type ListeningItem,type ListeningManifest} from "../src/pipeline/ingestion/source-listening-review.js";

const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const root=resolve(import.meta.dirname,"..","output","mark4-donor-20261024"),assets=join(root,"assets"),folder=listeningFolder(root,projectId);
const speechPath=join(folder,"speech-manifest.json");
if(existsSync(speechPath))throw Error("Speech-turn listening set already exists. Preserve its review history.");
const verse=JSON.parse(readFileSync(join(folder,"manifest.json"),"utf8")) as ListeningManifest;
const source=new Map(verse.items.map(i=>[i.id,i]));
const specs:Array<{id:string;first:number;last:number;speaker:string;note?:string}>=[
 {id:"speech-jesus-v3-v8",first:3,last:8,speaker:"Jesus",note:"v3 has a narrator lead-in before the opening quotation."},
 {id:"speech-jesus-v9",first:9,last:9,speaker:"Jesus",note:"A new narrator lead-in introduces this separate quotation."},
 {id:"speech-jesus-v11-v12",first:11,last:12,speaker:"Jesus",note:"The quotation closes in v12."},
 {id:"speech-jesus-v13-v20",first:13,last:20,speaker:"Jesus",note:"One continuous quoted explanation; supplied v19 is a reference-only marker."},
 {id:"speech-jesus-v21-v23",first:21,last:23,speaker:"Jesus",note:"The quotation closes in v23."},
 {id:"speech-jesus-v24-v25",first:24,last:25,speaker:"Jesus",note:"English opens a new quotation in v24; the Meyah punctuation does not mark its opening. Confirm the actual spoken handoff."},
 {id:"speech-jesus-v26-v29",first:26,last:29,speaker:"Jesus",note:"The quotation closes in v29."},
 {id:"speech-jesus-v30-v32",first:30,last:32,speaker:"Jesus",note:"The quotation closes in v32."},
 {id:"speech-jesus-v35",first:35,last:35,speaker:"Jesus",note:"Narrator lead-in precedes the short quotation."},
 {id:"speech-disciples-v38",first:38,last:38,speaker:"disciples",note:"Narrator lead-in precedes group speech."},
 {id:"speech-jesus-v39",first:39,last:39,speaker:"Jesus",note:"English quotes Jesus addressing the sea; supplied Meyah text lacks explicit quotation punctuation. Native/source review must locate the spoken words, if present."},
 {id:"speech-jesus-v40",first:40,last:40,speaker:"Jesus",note:"Narrator lead-in precedes the quotation."},
 {id:"speech-disciples-v41",first:41,last:41,speaker:"disciples",note:"Narrator lead-in precedes group speech."},
];
const db=new DatabaseSync(join(root,"db/heartword.sqlite"),{readOnly:true});
try{
 const hashes=sourceReviewHashes(db,projectId,root);
 if(hashes.sourceHash!==verse.sourceHash||hashes.alignmentHash!==verse.alignmentHash)throw Error("Source changed since the retained verse review.");
 const pcm=readFileSync(join(assets,verse.pcmPath));
 if(listeningHash(pcm)!==verse.pcmSha256||Math.floor(pcmWaveInfo(pcm).durationMs)!==verse.durationMs)throw Error("Prepared PCM changed.");
 const assetRelative=(path:string)=>relative(assets,path).replaceAll("\\","/");
 mkdirSync(join(folder,"speech-initial"),{recursive:true});mkdirSync(join(folder,"speech-context"),{recursive:true});
 const items:ListeningItem[]=specs.map(spec=>{
  const members=verse.items.filter(i=>{const n=Number(i.id.match(/^v(\d+)$/)?.[1]);return n>=spec.first&&n<=spec.last;});
  const first=source.get(`v${spec.first}`),last=source.get(`v${spec.last}`);
  if(!first||!last||!members.length)throw Error(`Missing source verse for ${spec.id}.`);
  const startMs=first.startMs,endMs=last.endMs,initial=join(folder,"speech-initial",spec.id+".wav"),context=join(folder,"speech-context",spec.id+".wav");
  const warnings=["The proposed interval brackets one story-speaker turn using Gemini-aligned verse phrases. It is not an exact quotation cutoff. Listen to the first and last utterance; internal verse edges are navigation only.",spec.note??"",`English speaker evidence identifies ${spec.speaker}; verify against the supplied Meyah recording and text. This review does not by itself assign a canon character or approve a cast voice.`].filter(Boolean);
  const item:ListeningItem={id:spec.id,kind:"character",verseRef:`Mark 4:${spec.first}${spec.first===spec.last?"":`-${spec.last}`}`,title:`${spec.speaker} · quoted turn`,textHatam:members.map(i=>`[${i.verseRef}] ${i.textHatam}`).join("\n"),englishContext:members.map(i=>`[${i.verseRef}] ${i.englishContext}`).join("\n"),speakerName:spec.speaker,characterId:null,voiceName:null,startMs,endMs,initialClipPath:assetRelative(initial),contextClipPath:assetRelative(context),warnings,timingConfidence:Math.min(45,first.timingConfidence??35,last.timingConfidence??35),speakerConfidence:Math.min(...members.map(i=>i.speakerConfidence??50)),geminiMatchConfidence:null};
  writeFileSync(initial,pcmWindow(pcm,startMs,endMs),{flag:"wx"});writeFileSync(context,pcmWindow(pcm,Math.max(0,startMs-3000),Math.min(verse.durationMs,endMs+3000)),{flag:"wx"});
  return item;
 });
 const speech:ListeningManifest={...verse,title:"Meyah · Mark 4 · quoted speech turns",items};
 writeFileSync(speechPath,JSON.stringify(speech,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({speechPath,turns:items.length,verseManifestPreserved:true,sourceRowsChanged:false}));
}finally{db.close();}
