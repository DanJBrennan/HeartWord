/** Prepare the isolated Meyah Mark 4 waveform review from retained model evidence.
 *  Writes assets/manifest only; leaves source alignment rows and approvals intact.
 */
import {DatabaseSync} from "node:sqlite";
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {parseSourceTextByVerse} from "../src/pipeline/ingestion/parse-source-text.js";
import {sourceReviewHashes} from "../src/pipeline/ingestion/source-review.js";
import {listeningFolder,listeningHash,pcmWaveInfo,pcmWindow,type ListeningItem,type ListeningManifest} from "../src/pipeline/ingestion/source-listening-review.js";
import type {GeminiAlignment,AlignmentSegment} from "../src/pipeline/ingestion/gemini-alignment.js";

const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const root=resolve(import.meta.dirname,"..","output","mark4-donor-20261024"),assets=join(root,"assets"),folder=listeningFolder(root,projectId);
const audio=join(assets,"source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3");
const meyah=join(assets,"source/meyah/text/Mark/Mark 4.docx"),english=join(assets,"source/english-esv/text/Mark/Mark 4.docx");
const geminiPath=join(root,"review/gemini-mark4-meyah-result.json"),speakerPath=join(root,"review/gemini-mark4-english-speakers-result.json");
const manifestPath=join(folder,"manifest.json");
if(existsSync(manifestPath))throw Error("Listening set already exists; preserve its reviews and do not overwrite it.");
const gemini=JSON.parse(readFileSync(geminiPath,"utf8")) as {audioSha256:string;textSha256:string;alignment:GeminiAlignment;calls:number;costUsd:number};
const speaker=JSON.parse(readFileSync(speakerPath,"utf8")) as {sha256:string;verses:Array<{verse:number;label:string;confidence:number;evidence:string;mixed:boolean}>};
if(gemini.audioSha256!==listeningHash(readFileSync(audio))||gemini.textSha256!==listeningHash(readFileSync(meyah))||speaker.sha256!==listeningHash(readFileSync(english)))throw Error("Retained model evidence does not match staged source files.");
const sourceVerses=parseSourceTextByVerse(meyah),englishVerses=parseSourceTextByVerse(english);
const byMeyah=new Map<number,string>(),byEnglish=new Map<number,string>();
for(const v of sourceVerses)byMeyah.set(v.verse,[byMeyah.get(v.verse),v.text].filter(Boolean).join(" "));
for(const v of englishVerses)byEnglish.set(v.verse,[byEnglish.get(v.verse),v.text].filter(Boolean).join(" "));
const bySpeaker=new Map(speaker.verses.map(v=>[v.verse,v]));
const db=new DatabaseSync(join(root,"db/heartword.sqlite"),{readOnly:true});
try{
 const rows=db.prepare("SELECT id,start_ms startMs,end_ms endMs,verse_ref verseRef,confidence FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(projectId) as unknown as Array<{id:string;startMs:number;endMs:number;verseRef:string|null;confidence:number|null}>;
 if(rows.length!==40||rows[0]?.verseRef!==null)throw Error("Expected separate chapter title and 39 provisional verses.");
 const hashes=sourceReviewHashes(db,projectId,root),before=JSON.stringify(rows);
 const matched=gemini.alignment.segments.filter(s=>s.status==="matched"&&s.sourceKind==="scripture"&&s.verseRef) as AlignmentSegment[];
 const titleAnchor=gemini.alignment.segments.find(s=>s.status==="matched"&&s.sourceKind==="chapter_title");
 const spans=(verse:number)=>matched.filter(s=>{const m=s.verseRef?.match(/^v(\d+)(?:-(\d+))?$/);return !!m&&verse>=Number(m[1])&&verse<=Number(m[2]??m[1]);});
 const anchors=new Map<number,{center:number;score:number;range:[number,number]}>();
 for(const verse of byMeyah.keys()){const relevant=spans(verse).filter(s=>s.score>=.6);if(relevant.length){const total=relevant.reduce((n,s)=>n+s.score,0);anchors.set(verse,{center:Math.round(relevant.reduce((n,s)=>n+(s.startMs+s.endMs)/2*s.score,0)/total),score:Math.round(total/relevant.length*100),range:[Math.min(...relevant.map(s=>s.startMs)),Math.max(...relevant.map(s=>s.endMs))]});}}
 // Use the midpoint between consecutive matched phrase extents as a proposed
 // verse edge. Shared phrase spans lower boundary confidence; none of these
 // estimates is a forced word boundary or a source-row correction.
 mkdirSync(join(folder,"initial"),{recursive:true});mkdirSync(join(folder,"context"),{recursive:true});
 const pcmPath=join(folder,"source.wav");
 if(!existsSync(pcmPath))execFileSync("ffmpeg",["-nostdin","-v","error","-n","-i",audio,"-map","0:a:0","-c:a","pcm_s16le","-ar","16000","-ac","1",pcmPath]);
 const wav=readFileSync(pcmPath),info=pcmWaveInfo(wav),durationMs=Math.floor(info.durationMs);
 const assetRelative=(path:string)=>relative(assets,path).replaceAll("\\","/");
 const verseRows=rows.slice(1),verseNumbers=verseRows.map(row=>Number(row.verseRef?.match(/:(\d+)/)?.[1]));
 const verseEdges=[rows[0]!.endMs,...verseNumbers.slice(0,-1).map((verse,i)=>{
  const left=anchors.get(verse),right=anchors.get(verseNumbers[i+1]!);
  return left&&right?Math.round((left.range[1]+right.range[0])/2):verseRows[i]!.endMs;
 }),durationMs];
 if(verseEdges.some((edge,i)=>i&&edge<=verseEdges[i-1]!))throw Error("Gemini phrase order produced overlapping verse windows; inspect the retained alignment.");
 const items:ListeningItem[]=rows.map((row,index)=>{
  const v=row.verseRef?Number(row.verseRef.match(/:(\d+)/)?.[1]):0,englishSpeaker=bySpeaker.get(v),anchor=anchors.get(v);
  const startMs=index===0?0:verseEdges[index-1]!,endMs=index===0?verseEdges[0]!:verseEdges[index]!;
  const previous=anchors.get(verseNumbers[index-2]!),next=anchors.get(verseNumbers[index]!);
  const overlapping=!!anchor&&(!!previous&&previous.range[1]>anchor.range[0]||!!next&&anchor.range[1]>next.range[0]);
  const timingConfidence=v===0?row.confidence:anchor?Math.min(index===rows.length-1?55:overlapping?55:70,Math.round(anchor.score*.7)):35;
  const warnings=[v===0?"Spoken chapter heading before verse 1. Listen to both edges; the 4.094-second cutoff is an observed-pause estimate, not a forced word boundary.":"Gemini-based proposed verse window from neighboring phrase anchors. Listen to both edges; these are not forced word boundaries or a verified change of performer."];
  warnings.push(`Boundary confidence re-estimated from Gemini phrase evidence: ${timingConfidence}%; previous silence-only score ${row.confidence??"unavailable"}% and window ${row.startMs/1000}–${row.endMs/1000} s.`);
  if(v===0)warnings.push("Dan heard the chapter heading before verse 1. The 4.094-second cutoff is the midpoint of a measured pause, pending listening review.");
  if(v===0&&titleAnchor)warnings.push(`Gemini matched supplied spoken title ${titleAnchor.text} at ${titleAnchor.startMs/1000}–${titleAnchor.endMs/1000} s; match score ${Math.round(titleAnchor.score*100)}%.`);
  if(anchor)warnings.push(`Gemini matched source text at ${anchor.range[0]/1000}–${anchor.range[1]/1000} s within this chapter; match score ${anchor.score}%. This is a phrase anchor, not a complete verse window.`);
  else if(v)warnings.push("Gemini found no reliable verse-specific phrase anchor. Timing confidence remains low.");
  if(englishSpeaker){warnings.push(`English speaker evidence: ${englishSpeaker.evidence}`);if(englishSpeaker.mixed)warnings.push("This English verse mixes narration and quotation. Split exact speech after listening; the whole verse is not one character utterance.");}
  if(v===5||v===18)warnings.push("The Meyah text has a reference-only next verse marker; check whether the recording voices that reference.");
  return {id:v?`v${v}`:"chapter-heading",kind:"alignment",verseRef:row.verseRef??"Mark 4 heading",title:v?`Verse ${v}`:"Spoken chapter heading",textHatam:v?byMeyah.get(v)??"":"Markus 4",englishContext:v?byEnglish.get(v)??"":"Mark chapter 4",speakerName:v?englishSpeaker?.label??"Unknown":"Narrator",characterId:null,voiceName:null,startMs,endMs,initialClipPath:"",contextClipPath:"",warnings,timingConfidence,geminiMatchConfidence:v===0?(titleAnchor?Math.round(titleAnchor.score*100):null):anchor?.score??null,geminiAnchorStartMs:v===0?titleAnchor?.startMs??null:anchor?.range[0]??null,geminiAnchorEndMs:v===0?titleAnchor?.endMs??null:anchor?.range[1]??null,speakerConfidence:englishSpeaker?Math.min(englishSpeaker.confidence,englishSpeaker.mixed?70:90):null};
 });
 for(const item of items){const initial=join(folder,"initial",item.id+".wav"),context=join(folder,"context",item.id+".wav");
  writeFileSync(initial,pcmWindow(wav,item.startMs,item.endMs),{flag:"wx"});
  writeFileSync(context,pcmWindow(wav,Math.max(0,item.startMs-3000),Math.min(durationMs,item.endMs+3000)),{flag:"wx"});
  item.initialClipPath=assetRelative(initial);item.contextClipPath=assetRelative(context);
 }
 const manifest:ListeningManifest={version:1,projectId,title:"Meyah · Mark 4",...hashes,originalAudioPath:assetRelative(audio),originalAudioSha256:listeningHash(readFileSync(audio)),pcmPath:assetRelative(pcmPath),pcmSha256:listeningHash(wav),durationMs,sampleRate:info.sampleRate,channels:info.channels,items};
 writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
 if(JSON.stringify(db.prepare("SELECT id,start_ms startMs,end_ms endMs,verse_ref verseRef,confidence FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(projectId))!==before)throw Error("Source rows changed during review preparation.");
 console.log(JSON.stringify({manifestPath,items:items.length,geminiAnchoredVerses:anchors.size,geminiCoverage:gemini.alignment.coverage,geminiCalls:gemini.calls,geminiCostUsd:gemini.costUsd,databaseWritten:false},null,2));
}finally{db.close();}
