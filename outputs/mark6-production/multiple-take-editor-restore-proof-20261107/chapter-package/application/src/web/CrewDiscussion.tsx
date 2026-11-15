import {useEffect,useRef,useState} from "react";
import type {ProductionView as Snapshot} from "../server/production-view";
import type {ChapterDiscussion,DiscussionEntry} from "../server/chapter-discussion";
import {PRODUCTION_ROLE_REGISTRY} from "../pipeline/creative-direction/role-registry";
import {crewPortraits} from "./crew-portraits";
import {pollProduction} from "./production-playback";
import {discussionReplay,replayStep,replayHistoryAppended,replayTime} from "./discussion-replay";
export function Evidence({value,title="Saved evidence"}:{value:unknown;title?:string}) {return <details><summary>{title}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>;}
export function CrewDiscussion({projectId:explicitId,snapshot,onShot,paused=false}:{projectId?:string;snapshot?:Snapshot;onShot:(id:string)=>void;paused?:boolean}) {
  const projectId=explicitId??snapshot!.project.id;
  const [loaded,setData]=useState<ChapterDiscussion|null>(null),[error,setError]=useState("");
  const [role,setRole]=useState("all"),[run,setRun]=useState("all"),[shot,setShot]=useState("all");
  const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[speed,setSpeed]=useState(1),[notice,setNotice]=useState("");
  const data=loaded?.project.id===projectId?loaded:null;
  const previous=useRef<string[]>([]),log=useRef<HTMLDivElement>(null);
  useEffect(()=>pollProduction<ChapterDiscussion>(`/api/projects/${encodeURIComponent(projectId)}/production/discussion`,value=> {
    if(value.project.id!==projectId){setError("Chapter identity mismatch; discussion rejected.");return;}
    setData(value);setError("");
  },setError,5000),[projectId]);
  const entries=data?.entries.filter(entry=>(role==="all"||entry.role===role)&&(run==="all"||(run==="legacy"?!entry.runId:entry.runId===run))&&(shot==="all"||entry.shotIds.includes(shot)))??[];
  const plan=discussionReplay(entries),active=replayStep(plan.steps,position),activeIndex=active?plan.steps.indexOf(active):-1;
  const identity=entries.map(entry=>`${entry.id}:${entry.revision}`);
  useEffect(()=> {
    if(previous.current.length&&!replayHistoryAppended(previous.current,identity)){setPlaying(false);setPosition(0);setNotice("Saved history or filters changed. Replay reset to preserve the recorded order.");}
    previous.current=identity;
  },[identity.join("|")]);
  useEffect(()=> {if(error||paused)setPlaying(false);},[error,paused]);
  useEffect(()=> {
    if(!playing)return;
    const timer=setInterval(()=>setPosition(value=>Math.min(plan.durationMs,value+100*speed)),100);
    return ()=>clearInterval(timer);
  },[playing,speed,plan.durationMs]);
  useEffect(()=>{if(playing&&position>=plan.durationMs)setPlaying(false);},[playing,position,plan.durationMs]);
  useEffect(()=> {log.current?.querySelector("[aria-current=true]")?.scrollIntoView({block:"nearest",behavior:"auto"});},[active?.entry.id]);
  const runs=[...new Map(data?.entries.filter(entry=>entry.runId).map(entry=>[entry.runId!,entry])??[]).values()].reverse();
  const changeFilter=(change:()=>void)=> {setPlaying(false);setPosition(0);previous.current=[];setNotice("");change();};
  const jump=(entry:DiscussionEntry)=> {setPlaying(false);setPosition(plan.steps.find(step=>step.entry.id===entry.id)?.startMs??0);};
  return <div className="discussion-workspace" aria-label="Saved cast and crew discussion">
    <header className="discussion-heading"><div><h2>Cast &amp; crew discussion</h2><p>Animated replay of saved production replies · {data?`${data.project.language} / ${data.project.book} ${data.project.chapter}`:"Opening chapter…"}</p></div><span className="recorded-label">RECORDED · NOT LIVE AGENTS</span></header>
    {error&&<div className="console-alert" role="alert">{error} · Saved snapshot is stale. Replay paused; reconnecting.</div>}
    {notice&&<div className="discussion-notice" role="status">{notice}</div>}
    {!!data?.gaps.length&&<div className="console-alert">{data.gaps.join(" ")} Missing history is not an empty approved discussion.</div>}
    <div className="discussion-filters"><label>Run <select aria-label="Discussion run" value={run} onChange={event=>changeFilter(()=>setRun(event.target.value))}><option value="all">All saved exchanges</option><option value="legacy">Historical casting / coverage</option>{runs.map(entry=><option key={entry.runId} value={entry.runId!}>{entry.phase} · {new Date(entry.at).toLocaleDateString()} · {entry.runId!.slice(0,8)}</option>)}</select></label><label>Shot <select aria-label="Discussion shot" value={shot} onChange={event=>changeFilter(()=>setShot(event.target.value))}><option value="all">Whole chapter</option>{data?.shots.map(item=><option key={item.id} value={item.id}>S{item.sceneSequence} / shot {item.sequence} · {item.verse_ref}</option>)}</select></label><span>{entries.length} saved replies · original timestamps retained</span></div>
    <div className="discussion-columns"><aside className="crew-roster"><button className={role==="all"?"chosen":""} onClick={()=>changeFilter(()=>setRole("all"))}>All roles</button>{PRODUCTION_ROLE_REGISTRY.filter(item=>item.authority!=="presentation_only").map(item=><button key={item.id} className={`${role===item.id?"chosen":""} ${active?.entry.role===item.id?"replay-speaking":""}`} onClick={()=>changeFilter(()=>setRole(item.id))}>{crewPortraits[item.owner]?<img loading="lazy" src={crewPortraits[item.owner]} alt={`${item.owner} cartoon portrait`} />:<span className="role-initial">{item.owner[0]}</span>}<span><strong>{item.owner}</strong><small>{item.label}</small><small>{item.runtime==="declared"?"Declared role · no worker":"Bounded review role"}</small></span>{playing&&active?.entry.role===item.id&&<span className="replay-pulse" aria-label="Active in recorded replay">▥</span>}</button>)}</aside>
      <section className="discussion-reader" aria-label="Recorded contribution"><p className="discussion-kicker">{playing?"REPLAYING SAVED ENTRY":"SAVED ENTRY"} · {activeIndex>=0?activeIndex+1:0} / {entries.length}</p>{active?<article key={active.entry.id} className={`replay-contribution ${playing?"animating":""}`}>
        <div className="replay-author">{crewPortraits[active.entry.owner]&&<img src={crewPortraits[active.entry.owner]} alt={`${active.entry.owner} cartoon portrait`} />}<div><h3>{active.entry.owner}</h3><p>{active.entry.roleLabel}</p><time>{new Date(active.entry.at).toLocaleString()}</time></div><span className={`discussion-verdict ${active.entry.status}`}>{active.entry.status.replaceAll("_"," ")}</span></div>
        <p className="replay-summary">{active.entry.summary}</p><small>{active.entry.phase} · pass {active.entry.round} · {active.entry.source.replaceAll("_"," ")}{active.entry.verseRef?` · ${active.entry.verseRef}`:""}</small>
        {!!active.entry.shotIds.length&&<details><summary>Affected shots ({active.entry.shotIds.length}) · open to inspect</summary><div>{active.entry.shotIds.filter(id=>data?.shots.some(item=>item.id===id)).map(id=>{const target=data!.shots.find(item=>item.id===id)!;return <button key={id} onClick={()=>{setPlaying(false);onShot(id);}}>Inspect S{target.sceneSequence} / shot {target.sequence} ↗</button>;})}</div></details>}
        <p className="historical-finding">This is a historical contribution or verdict. Current dispositions remain in the saved production record; an old approval is not release approval.</p><Evidence value={active.entry.details} title="Full actual saved reply / findings / evidence" />
      </article>:<p className="console-empty">{!data&&!error?"Loading saved discussion…":"No saved replies in this chapter/filter. No dialogue is generated to fill it."}</p>}
      {data?.current&&<details className="current-disagreements"><summary>Current planning record · {data.current.status} · {data.current.objections.filter(item=>item.status==="open").length} open objections</summary>{data.current.objections.map(item=><article key={item.id}><strong>{item.owner} · {item.status} · {item.severity}</strong><p>{item.requestedChange}</p><small>{item.evidence} {item.limitations}</small></article>)}<small>Revision {data.current.revision}; separate from replay position.</small></details>}
      </section>
      <aside className="discussion-log"><header><strong>Animated discussion log</strong><small>Saved order · select any entry</small></header><div ref={log}>{plan.steps.map((step,index)=><button key={step.entry.id} aria-current={active?.entry.id===step.entry.id} className={position>=step.startMs?"replayed":""} onClick={()=>jump(step.entry)}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{step.entry.owner} · {step.entry.status.replaceAll("_"," ")}</strong><small>{new Date(step.entry.at).toLocaleString()}</small><p>{step.entry.summary}</p></div></button>)}</div></aside>
    </div>
    <footer className="discussion-transport"><div><button aria-label="Previous discussion entry" disabled={activeIndex<=0} onClick={()=>{setPlaying(false);setPosition(plan.steps[Math.max(0,activeIndex-1)]?.startMs??0);}}>◀</button><button aria-label={playing?"Pause discussion replay":"Play discussion replay"} disabled={!entries.length||!!error||paused} className="play-control" onClick={()=>{setNotice("");if(position>=plan.durationMs)setPosition(0);setPlaying(!playing);}}>{playing?"Ⅱ Pause":"▶ Replay"}</button><button aria-label="Next discussion entry" disabled={activeIndex>=entries.length-1} onClick={()=>{setPlaying(false);setPosition(plan.steps[Math.min(entries.length-1,activeIndex+1)]?.startMs??0);}}>▶</button><button aria-label="Restart discussion replay" onClick={()=>{setPlaying(false);setPosition(0);}}>↺</button><output aria-label="Discussion replay position">{replayTime(position)} / {replayTime(plan.durationMs)}</output><label>Speed <select aria-label="Discussion replay speed" value={speed} onChange={event=>setSpeed(Number(event.target.value))}>{[.5,1,2,4].map(value=><option key={value} value={value}>{value}×</option>)}</select></label></div><input aria-label="Discussion replay playhead" type="range" min="0" max={Math.max(1,plan.durationMs)} step="100" value={position} onChange={event=>{setPlaying(false);setPosition(Number(event.target.value));}} /><small>Presentation pacing; long recorded gaps are compressed. No synthesized speech. {data?.note}</small></footer>
  </div>;
}
