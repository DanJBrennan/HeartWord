import { useEffect, useState } from "react";
import { LanguageEditionReviewPanel } from "./LanguageEditionReviewPanel";

type Render = {id:string;path:string;durationMs:number;createdAt:number;normalized:number};
type Preflight = {status:"ready"|"held";holds:string[];sourceQuestions:string[];fingerprint:string|null;donor:{renderId:string};
  target:{language:string;book:string;chapter:number};estimate:{newSpeakingPictures:number|null;reuseCandidates:number|null;costUsd:null}};
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers}});
  const value=await response.json();if(!response.ok)throw new Error(value.error??`Request failed (${response.status})`);return value as T;
}
export function LanguageEditionPanel({donorProjectId,book,chapter,onCreated}:{donorProjectId:string;book:string;chapter:number;onCreated:(id:string)=>void}){
  const [renders,setRenders]=useState<Render[]>([]),[renderId,setRenderId]=useState("");
  const [language,setLanguage]=useState("meyah"),[bookChapter,setBookChapter]=useState(chapter===4?"Markus 4":""),
    [languageName,setLanguageName]=useState("Meyah"),[authority,setAuthority]=useState(chapter===4?"Dan approved 2026-10-22":""),
    [durationMs,setDurationMs]=useState(4000),[backgroundFramePath,setBackgroundFramePath]=useState(chapter===4?"generated/editorial/mark4-intro/establishing-r1.png":"");
  const [preflight,setPreflight]=useState<Preflight|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[requestId,setRequestId]=useState("");
  const [isEdition,setIsEdition]=useState<boolean|null>(null);
  useEffect(()=>{let alive=true;setRenders([]);setRenderId("");setPreflight(null);setIsEdition(null);
    request<{edition:unknown}>(`/projects/${donorProjectId}/language-edition-workspace`).then(value=>{if(!alive)return;const edition=Boolean(value.edition);setIsEdition(edition);
      if(!edition)request<{renders:Render[]}>(`/projects/${donorProjectId}/language-edition-renders`).then(result=>{if(alive)setRenders(result.renders);}).catch(e=>{if(alive)setError((e as Error).message);});
    }).catch(e=>{if(alive)setError((e as Error).message);});return()=>{alive=false;};},[donorProjectId]);
  const title={bookChapter,languageName,authority,durationMs,backgroundFramePath,profile:"mark4-serif-over-establishing" as const};
  const changed=()=>{setPreflight(null);setRequestId("");setError("");};
  async function check(){setBusy(true);setError("");try{setPreflight(await request<Preflight>(`/projects/${donorProjectId}/language-edition-preflight`,{method:"POST",body:JSON.stringify({renderId,targetLanguage:language,title})}));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function create(){if(!preflight?.fingerprint||preflight.status!=="ready")return;setBusy(true);setError("");const key=requestId||crypto.randomUUID();setRequestId(key);
    try{const result=await request<{project:{id:string}}>(`/projects/${donorProjectId}/language-editions`,{method:"POST",body:JSON.stringify({renderId,targetLanguage:language,title,checkedFingerprint:preflight.fingerprint,requestId:key})});onCreated(result.project.id);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(isEdition)return <LanguageEditionReviewPanel projectId={donorProjectId} />;
  if(isEdition===null)return <p>{error||"Loading chapter edition evidence…"}</p>;
  return <section aria-label="Create language edition" className="edition-panel">
    <h2>Create language edition</h2><p>Choose a saved cut of {book} {chapter}. This check reads its retained recipe, target sources and approved voices. Creation records a new editable chapter identity; it does not run providers.</p>
    <label>Donor render <select value={renderId} onChange={event=>{changed();setRenderId(event.target.value);}}><option value="">Select an exact render…</option>{renders.map(render=><option key={render.id} value={render.id}>{render.path} · {render.id.slice(0,8)} · {render.normalized?"normalized":"needs reconstruction"}</option>)}</select></label>
    <label>Target language <select value={language} onChange={event=>{changed();const next=event.target.value;setLanguage(next);setLanguageName(next==="meyah"?"Meyah":"");}}><option value="meyah">Meyah</option><option value="sougb">Sougb (source review pending)</option></select></label>
    <label>Book and chapter as printed <input value={bookChapter} onChange={event=>{changed();setBookChapter(event.target.value);}} /></label>
    <label>Language name as printed <input value={languageName} onChange={event=>{changed();setLanguageName(event.target.value);}} /></label>
    <label>Clean establishing frame in chapter assets <input value={backgroundFramePath} onChange={event=>{changed();setBackgroundFramePath(event.target.value);}} /></label>
    <label>Title approval evidence <input value={authority} onChange={event=>{changed();setAuthority(event.target.value);}} /></label>
    <label>Approved title hold (ms) <input type="number" min="1000" max="12000" value={durationMs} onChange={event=>{changed();setDurationMs(Number(event.target.value));}} /></label>
    <div><button disabled={busy||!renderId} onClick={()=>void check()}>Check edition</button> <button disabled={busy||preflight?.status!=="ready"} onClick={()=>void create()}>Create editable edition</button></div>
    {preflight&&<div role="status"><p>Preflight: <strong>{preflight.status}</strong>. New speaking pictures: {preflight.estimate.newSpeakingPictures??"unknown"}; reusable picture candidates: {preflight.estimate.reuseCandidates??"unknown"}; provider cost: unknown until review and requests.</p>
      {preflight.holds.length>0&&<ul>{preflight.holds.map((hold,index)=><li key={index}>{hold}</li>)}</ul>}
      {preflight.sourceQuestions.length>0&&<div><strong>Source questions for alignment review</strong><ul>{preflight.sourceQuestions.map((question,index)=><li key={index}>{question}</li>)}</ul></div>}</div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
