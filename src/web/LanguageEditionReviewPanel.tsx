import { useEffect, useState } from "react";

type Segment={id:string;startMs:number;endMs:number;verseRef:string|null;speakerId:string|null};
type Disposition="reuse_picture"|"replace_avatar"|"needs_coverage"|"omit_picture";
type PictureReuse={attemptId:string;sourceStartMs:number;durationMs:number;path?:string;sha256?:string};
type Mapping={donorShotId:string;targetSegmentId:string|null;targetSpeechRunId?:string|null;targetStartMs:number|null;targetEndMs:number|null;treatment:Disposition;reason:string;pictureReuse?:PictureReuse;narratorOnlyAction?:string;addedForEdition?:boolean;addedAction?:string;addedVerseRef?:string;addedCharacterIds?:string[]};
type Shot={shotId:string;startMs:number;endMs:number;shot:{action:string;verse_ref:string|null;needs_lip_sync:number;dialogue_character_id:string|null};sceneCast:Array<{id:string;name:string}>;
  reuseCandidates:Array<{attemptId:string;path:string;provider:string;recordedDurationMs:number}>};
type Workspace={edition:null|{donor:{renderId:string};target:{language:string;book:string;chapter:number;title:{bookChapter:string;languageName:string}};
  donorShots:Shot[];segments:Segment[];speechRuns:Array<{id:string;verseRef:string;startMs:number;endMs:number;speakerId:string|null;anchorSegmentId:string|null;memberIds:string[]}>;
  castAudio:Array<{segmentId:string;path:string}>;voiceAudition:{sourceSegmentIds:string[];reviewer:string;planHash:string}|null;sourceQuestions:string[];targetShotCount:number;
  titleCandidate:{path:string;sha256:string;durationMs:number}|null;selectedTitleId:string|null;
  plan:{hash:string;revision:{correspondence:Mapping[];reviewer:string;evidence:string}|null}}};

/** Exact source-clock review before inherited shots enter the normal pipeline. */
export function LanguageEditionReviewPanel({projectId}:{projectId:string}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [mapping,setMapping]=useState<Mapping[]>([]),[reviewer,setReviewer]=useState(""),[evidence,setEvidence]=useState("");
  const [requestId,setRequestId]=useState("");
  const [titleReviewer,setTitleReviewer]=useState(""),[titleEvidence,setTitleEvidence]=useState("");
  const [auditionIds,setAuditionIds]=useState<string[]>([]),[auditionReviewer,setAuditionReviewer]=useState(""),[auditionEvidence,setAuditionEvidence]=useState("");
  async function load(){const response=await fetch(`/api/projects/${projectId}/language-edition-workspace`,{cache:"no-store"});
    const value=await response.json();if(!response.ok)throw new Error(value.error??"Edition workspace is unavailable.");
    const next=value as Workspace;setWorkspace(next);
    if(next.edition){setMapping(next.edition.plan.revision?.correspondence??next.edition.donorShots.map(item=>({
      donorShotId:item.shotId,targetSegmentId:null,targetStartMs:null,targetEndMs:null,
      treatment:item.shot.needs_lip_sync?"replace_avatar" as const:"reuse_picture" as const,reason:""})));
      setReviewer(next.edition.plan.revision?.reviewer??"");setEvidence(next.edition.plan.revision?.evidence??"");}
  }
  useEffect(()=>{let active=true;fetch(`/api/projects/${projectId}/language-edition-workspace`,{cache:"no-store"}).then(async response=>{
    const value=await response.json();if(!response.ok)throw new Error(value.error??"Edition workspace is unavailable.");return value as Workspace;
  }).then(value=>{if(!active)return;setWorkspace(value);if(value.edition){setMapping(value.edition.plan.revision?.correspondence??value.edition.donorShots.map(item=>({
    donorShotId:item.shotId,targetSegmentId:null,targetStartMs:null,targetEndMs:null,treatment:item.shot.needs_lip_sync?"replace_avatar" as const:"reuse_picture" as const,reason:""})));
    setReviewer(value.edition.plan.revision?.reviewer??"");setEvidence(value.edition.plan.revision?.evidence??"");}}).catch(e=>{if(active)setError((e as Error).message);});
    return()=>{active=false;};},[projectId]);
  function edit(index:number,patch:Partial<Mapping>){setMapping(items=>items.map((item,i)=>i===index?{...item,...patch}:item));setRequestId("");setError("");}
  async function save(){if(!workspace?.edition)return;setBusy(true);setError("");const key=requestId||crypto.randomUUID();setRequestId(key);
    try{const response=await fetch(`/api/projects/${projectId}/language-edition-plan`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({requestId:key,expectedParentHash:workspace.edition.plan.hash,correspondence:mapping,reviewer,evidence})});
      const value=await response.json();if(!response.ok)throw new Error(value.error??"Correspondence review could not be saved.");
      await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function titleAction(action:"candidate"|"selection"){
    if(!workspace?.edition)return;setBusy(true);setError("");
    try{const response=await fetch(`/api/projects/${projectId}/language-edition-title-${action}`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(action==="selection"?{sha256:workspace.edition.titleCandidate?.sha256,reviewer:titleReviewer,evidence:titleEvidence}:{})});
      const value=await response.json();if(!response.ok)throw new Error(value.error??"Title operation failed.");await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function auditionAction(action:"run"|"approve"){
    if(!auditionIds.length)return;setBusy(true);setError("");
    try{const response=await fetch(`/api/projects/${projectId}/${action==="run"?"voicing":"language-edition-voice-audition-approval"}`,
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action==="run"?
        {sourceSegmentIds:auditionIds}:{sourceSegmentIds:auditionIds,reviewer:auditionReviewer,evidence:auditionEvidence})});
      const result=await response.json();if(!response.ok||result.ok===false)throw new Error(result.error??result.reasoning??"Voice audition failed.");await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(error&&!workspace)return <p className="error" role="alert">{error}</p>;
  if(!workspace)return <p>Loading edition evidence…</p>;
  const edition=workspace.edition;
  if(!edition)return null;
  const runMembers=new Set(edition.speechRuns.flatMap(run=>run.memberIds));
  const auditionChoices=[...edition.segments.filter(segment=>segment.speakerId&&!runMembers.has(segment.id)&&segment.endMs-segment.startMs>=2000&&segment.endMs-segment.startMs<=15000)
    .map(segment=>({ids:[segment.id],label:`${segment.verseRef??segment.id} · ${segment.startMs}–${segment.endMs} ms`})),
    ...edition.speechRuns.filter(run=>run.speakerId&&run.endMs-run.startMs>=2000&&run.endMs-run.startMs<=15000)
      .map(run=>({ids:run.memberIds,label:`${run.verseRef} · continuous ${run.startMs}–${run.endMs} ms`}))];
  const auditionCast=edition.castAudio.find(item=>item.segmentId===auditionIds[0])?.path;
  return <section className="edition-panel" aria-label="Language edition correspondence">
    <h2>{edition.target.title.bookChapter} · {edition.target.title.languageName}</h2>
    <p>Donor render {edition.donor.renderId}. Review every target-language source interval against the selected picture. Use a reviewed trim of retained footage when it fits the Meyah narration. A visible speaking mouth needs a new Kling Avatar take. Mark a shot “Needs coverage” only when its retained picture cannot cover the reviewed beat; use the Codex image handoff for its keyframe and local LTX for non-speaking motion. “Omit from this edition” records a reviewed editorial omission without creating a target shot or media. This plan records your evidence; it does not contact a provider.</p>
    {edition.sourceQuestions.length>0&&<div><strong>Source questions</strong><ul>{edition.sourceQuestions.map((question,index)=><li key={index}>{question}</li>)}</ul></div>}
    {!edition.segments.length&&<p>Ingest and review the target chapter audio before mapping its picture.</p>}
    {edition.targetShotCount>0&&<p>Target shots already exist. A changed correspondence will hold their previous selections until reconciled.</p>}
    {mapping.map((value,index)=>{const occurrence=mapping.slice(0,index+1).filter(row=>row.donorShotId===value.donorShotId&&!row.addedForEdition).length-1;
      const choices=edition.donorShots.filter(row=>row.shotId===value.donorShotId),item=choices[Math.max(0,occurrence)]??choices[0];if(!item)return null;const speaking=Boolean(item.shot.needs_lip_sync);
      return <fieldset key={`${item.shotId}-${index}`}><legend>{index+1}. {item.shot.verse_ref??"Unassigned"} · {item.shot.action}</legend>
        <p>{value.addedForEdition?"New target coverage beat based on this donor scene":`Donor ${item.startMs}–${item.endMs} ms`} · {speaking?`Visible speaker ${item.shot.dialogue_character_id}`:"No visible speaking mouth"}</p>
        {value.addedForEdition&&<><label>New beat verse (for example, Mark 4:38) <input value={value.addedVerseRef??""}
          onChange={event=>edit(index,{addedVerseRef:event.target.value})} /></label>
          <label>New source-grounded beat action <input value={value.addedAction??""}
            onChange={event=>edit(index,{addedAction:event.target.value})} /> Describe this new picture instead of repeating the donor shot action.</label>
          <label><input type="checkbox" checked={value.addedCharacterIds!==undefined}
            onChange={event=>edit(index,{addedCharacterIds:event.target.checked?[]:undefined})} /> Select the cast for this beat explicitly</label>
          {value.addedCharacterIds!==undefined&&<details><summary>Approved scene cast · {value.addedCharacterIds.length?`${value.addedCharacterIds.length} selected`:"no named character"}</summary>
            <p>Leave every box clear for an environmental or anonymous-actor cutaway. Select only approved Papuan characters actually shown in this new beat.</p>
            {item.sceneCast.map(member=><label key={member.id}><input type="checkbox" checked={value.addedCharacterIds?.includes(member.id)??false}
              onChange={event=>edit(index,{addedCharacterIds:event.target.checked?[...(value.addedCharacterIds??[]),member.id]:(value.addedCharacterIds??[]).filter(id=>id!==member.id)})} /> {member.name}</label>)}
          </details>}</>}
        <label>Treatment <select value={value.treatment} onChange={event=>{const treatment=event.target.value as Disposition;
          edit(index,{treatment,pictureReuse:undefined,...(treatment==="needs_coverage"?{}:{narratorOnlyAction:undefined}),
            ...(treatment==="omit_picture"?{targetSegmentId:null,targetSpeechRunId:null,targetStartMs:null,targetEndMs:null}: {})});}}>
          {!value.addedForEdition&&(speaking?<option value="replace_avatar">Replace Avatar mouth</option>:<option value="reuse_picture">Reuse picture</option>)}
          <option value="needs_coverage">Needs coverage</option>
          {!value.addedForEdition&&<option value="omit_picture">Omit from this edition</option>}</select></label>
        {!speaking&&value.treatment==="reuse_picture"&&<><label>Reviewed picture source <select value={value.pictureReuse?.attemptId??""}
          onChange={event=>{const candidate=item.reuseCandidates.find(row=>row.attemptId===event.target.value);
            edit(index,{pictureReuse:candidate?{attemptId:candidate.attemptId,sourceStartMs:0,durationMs:candidate.recordedDurationMs}:undefined});}}>
          <option value="">Exact selected final-cut interval</option>{item.reuseCandidates.map(candidate=><option key={candidate.attemptId} value={candidate.attemptId}>
            {candidate.provider} · {candidate.path} · recorded {candidate.recordedDurationMs} ms</option>)}</select></label>
          {value.pictureReuse&&<><label>Start in retained take (ms) <input type="number" min="0" value={value.pictureReuse.sourceStartMs}
            onChange={event=>edit(index,{pictureReuse:{...value.pictureReuse!,sourceStartMs:Number(event.target.value)}})} /></label>
            <label>Picture duration (ms) <input type="number" min="1" value={value.pictureReuse.durationMs}
              onChange={event=>edit(index,{pictureReuse:{...value.pictureReuse!,durationMs:Number(event.target.value)}})} /></label>
            <video controls preload="metadata" src={`/media/${item.reuseCandidates.find(candidate=>candidate.attemptId===value.pictureReuse?.attemptId)?.path??""}`} aria-label="Retained donor picture handle preview" />
            <p>Review the full action and target audio timing. The saved trim is verified against this take; no speech audio is copied.</p></>}
        </>}
        {speaking&&value.treatment==="needs_coverage"&&<label><input type="checkbox" checked={value.narratorOnlyAction!==undefined}
          onChange={event=>edit(index,{narratorOnlyAction:event.target.checked?"":undefined,...(event.target.checked?{targetSegmentId:null,targetSpeechRunId:null,targetStartMs:null,targetEndMs:null}:{})})} />
          The Meyah narrator describes this action; replace the old speaking insert with silent picture</label>}
        {value.treatment==="omit_picture"?<p>This donor placement remains in the reviewed history. No target speech, picture handle, shot or media is selected for it.</p>:
          value.narratorOnlyAction!==undefined?<label>Reviewed silent action <input value={value.narratorOnlyAction}
            onChange={event=>edit(index,{narratorOnlyAction:event.target.value})} /> Describe only what the supplied passage says or clearly shows.</label>:<>
        <label>Confirmed continuous speech, if this mouth window crosses segments <select value={value.targetSpeechRunId??""} onChange={event=>{const run=edition.speechRuns.find(row=>row.id===event.target.value);
          edit(index,{targetSpeechRunId:run?.id??null,targetSegmentId:run?.anchorSegmentId??null,targetStartMs:run?.startMs??null,targetEndMs:run?.endMs??null});}}>
          <option value="">Single original interval</option>{edition.speechRuns.filter(run=>run.speakerId===item.shot.dialogue_character_id).map(run=><option key={run.id} value={run.id}>
            {run.verseRef} · {run.startMs}–{run.endMs} ms</option>)}</select></label>
        {!value.targetSpeechRunId&&<label>Target original audio interval <select value={value.targetSegmentId??""} onChange={event=>{const segment=edition.segments.find(row=>row.id===event.target.value);
          edit(index,{targetSegmentId:segment?.id??null,targetSpeechRunId:null,targetStartMs:segment?.startMs??null,targetEndMs:segment?.endMs??null});}}>
          <option value="">No linked target interval</option>{edition.segments.map(segment=><option key={segment.id} value={segment.id}>
            {segment.verseRef??"Unassigned"} · {segment.startMs}–{segment.endMs} ms · {segment.speakerId??"narrator"}</option>)}</select></label>}
        {value.targetSegmentId&&<><label>Start ms <input type="number" value={value.targetStartMs??""} onChange={event=>edit(index,{targetStartMs:Number(event.target.value)})} /></label>
          <label>End ms <input type="number" value={value.targetEndMs??""} onChange={event=>edit(index,{targetEndMs:Number(event.target.value)})} /></label></>}</>}
        <label>{value.treatment==="omit_picture"?"Why this picture is omitted":"Why this mapping fits the target recording"} <input value={value.reason} onChange={event=>edit(index,{reason:event.target.value})} /></label>
        {!edition.targetShotCount&&value.treatment!=="omit_picture"&&<button type="button" onClick={()=>{setMapping(rows=>{
          const extra:Mapping={donorShotId:value.donorShotId,targetSegmentId:null,targetStartMs:null,targetEndMs:null,treatment:"needs_coverage",reason:"",addedForEdition:true,addedAction:"",addedVerseRef:""};
          return [...rows.slice(0,index+1),extra,...rows.slice(index+1)];});setRequestId("");setError("");}}>Add target coverage beat after this shot</button>}
        {value.addedForEdition&&!edition.targetShotCount&&<button type="button" onClick={()=>{setMapping(rows=>rows.filter((_,position)=>position!==index));setRequestId("");setError("");}}>Remove this added beat</button>}
      </fieldset>;})}
    <label>Reviewer <input value={reviewer} onChange={event=>{setReviewer(event.target.value);setRequestId("");}} /></label>
    <label>Listening and visual evidence <textarea value={evidence} onChange={event=>{setEvidence(event.target.value);setRequestId("");}} /></label>
    <button disabled={busy||!edition.segments.length||edition.targetShotCount>0} onClick={()=>void save()}>Save reviewed correspondence</button>
    {edition.plan.revision&&<p>Saved revision {edition.plan.hash.slice(0,12)} by {edition.plan.revision.reviewer}.</p>}
    <h3>Target-language voice audition</h3>
    <p>Choose one complete 2–15 second spoken sample. Converting it uses ElevenLabs credits. Listen for the exact Meyah words, pronunciation and preserved timing before approving chapter-wide voice work.</p>
    <label>Audition sample <select value={auditionIds.join(",")} onChange={event=>setAuditionIds(event.target.value?event.target.value.split(","):[])}>
      <option value="">Choose reviewed speech</option>{auditionChoices.map(choice=><option key={choice.ids.join(",")} value={choice.ids.join(",")}>{choice.label}</option>)}</select></label>
    <button disabled={busy||!edition.plan.revision||!auditionIds.length||!!edition.voiceAudition} onClick={()=>void auditionAction("run")}>Convert this short audition</button>
    {auditionCast&&<audio controls src={`/media/${auditionCast.replaceAll("\\","/")}`} aria-label="Converted target-language audition" />}
    {!edition.voiceAudition&&auditionCast&&<><label>Native-language listener <input value={auditionReviewer} onChange={event=>setAuditionReviewer(event.target.value)} /></label>
      <label>Pronunciation and source-fidelity evidence <textarea value={auditionEvidence} onChange={event=>setAuditionEvidence(event.target.value)} /></label>
      <button disabled={busy||!auditionReviewer.trim()||!auditionEvidence.trim()} onClick={()=>void auditionAction("approve")}>Approve heard voice audition</button></>}
    {edition.voiceAudition&&<p>Voice audition approved by {edition.voiceAudition.reviewer} for plan {edition.voiceAudition.planHash.slice(0,12)}.</p>}
    <h3>Opening title</h3>
    <p>The local title uses the pinned clean establishing frame and the approved {edition.target.title.bookChapter} / {edition.target.title.languageName} text. Inspect the rendered clip before selecting it for the existing opening beat.</p>
    {!edition.titleCandidate&&<button disabled={busy} onClick={()=>void titleAction("candidate")}>Build title preview locally</button>}
    {edition.titleCandidate&&<><video controls src={`/media/${edition.titleCandidate.path}`} aria-label="Target-language opening title preview" />
      <p>Title candidate {edition.titleCandidate.sha256.slice(0,12)} · {edition.titleCandidate.durationMs} ms.</p>
      {!edition.selectedTitleId&&<><label>Title reviewer <input value={titleReviewer} onChange={event=>setTitleReviewer(event.target.value)} /></label>
        <label>Visual review evidence <textarea value={titleEvidence} onChange={event=>setTitleEvidence(event.target.value)} /></label>
        <button disabled={busy||!edition.targetShotCount||!titleReviewer.trim()||!titleEvidence.trim()} onClick={()=>void titleAction("selection")}>Select reviewed title for opening</button></>}</>}
    {edition.selectedTitleId&&<p>Opening title selected as editorial beat {edition.selectedTitleId}.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
