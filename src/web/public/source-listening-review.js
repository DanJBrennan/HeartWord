const $=id=>document.getElementById(id);
const projectId=document.body.dataset.projectId;
const api="/api/projects/"+encodeURIComponent(projectId)+"/source-listening-review";
const scope=new URLSearchParams(location.search).get("scope")==="speech"?"speech":"verse";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clock=ms=>{if(!Number.isFinite(ms))return "—";const t=Math.max(0,Math.round(ms));return String(Math.floor(t/60000)).padStart(2,"0")+":"+String(Math.floor(t/1000)%60).padStart(2,"0")+"."+String(t%1000).padStart(3,"0");};
let data,selected,headMs=0,audioContext,audioBuffer,playing=null,frame,busy=false,waveCache=null,viewMode="window";
const drafts=new Map();
const item=()=>data?.items.find(i=>i.id===selected);
function draft(i=item()) {
 if(!drafts.has(i.id))drafts.set(i.id,{startMs:i.current?.startMs??i.startMs,endMs:i.current?.endMs??i.endMs,note:i.current?.note??"",speakerLabel:i.current?.speakerLabel??i.speakerName,baseRevision:i.current?.id??null,dirty:false,pending:null});
 return drafts.get(i.id);
}
const valid=d=>Number.isInteger(d.startMs)&&Number.isInteger(d.endMs)&&d.startMs>=0&&d.endMs>d.startMs&&d.endMs<=data.durationMs;
function error(message){$("error").textContent=message??"";$("error").hidden=!message;}
function activeVerified(i){return !!i.current?.verified&&!draft(i).dirty;}
function resolved(i){return !!i.resolution||activeVerified(i);}
function speakerLabel(i){return i.resolution?.treatment==="narration"?"Original narrator":i.resolution?.treatment==="covered"?(data.items.find(p=>p.id===i.resolution.coveredBy)?.speakerName??i.speakerName)+" · merged utterance":draft(i).speakerLabel;}
function updateLeadIn(i){const quoteAt=i.textHatam.search(/["“]/u),mixed=/^Narrator,\s*\S/u.test(speakerLabel(i)),lead=scope==="speech"&&quoteAt>0?i.textHatam.slice(0,quoteAt).replace(/^\[[^\]]+\]\s*/,"").trim():"";$("speech-leadin").hidden=!(mixed&&quoteAt>0)&&!lead;$("speech-leadin").textContent=mixed&&quoteAt>0?`Narrator lead-in before the first opening quotation mark: “${i.textHatam.slice(0,quoteAt).trim()}” The quoted speech starts after that mark; listen to locate the exact audio handoff.`:lead?`Narrator lead-in before the first quotation: “${lead}” Set the start at the first quoted word you hear.`:"";}
function list() {
 const filter=$("filter").value;
 $("progress").textContent=data.application?data.verifiedCount+" verified · "+data.resolvedCount+" / "+data.items.length+" resolved · boundaries applied":data.items.filter(activeVerified).length+" / "+data.items.length+(scope==="speech"?" speech turns verified":" verse windows verified");
 $("items").innerHTML=data.items.filter(i=>filter==="all"||(filter==="pending"?!resolved(i):i.kind===filter)).map(i=>'<button class="clip" data-item="'+esc(i.id)+'" aria-current="'+(i.id===selected)+'"'+(busy?' disabled':'')+'><strong>'+esc(i.verseRef)+' · '+esc(i.title)+'</strong><small>'+esc(speakerLabel(i))+'</small><small class="'+(resolved(i)?"done":"")+'">'+(draft(i).dirty?"Unsaved changes":i.resolution?(i.resolution.treatment==="covered"?"✓ Covered by merged utterance":"✓ Narrator confirmed"):activeVerified(i)?"✓ Verified":i.current?"Saved draft":"Proposed timing")+'</small></button>').join("");
}
function contextRange() {
 const d=draft(),start=valid(d)?d.startMs:item().startMs,end=valid(d)?d.endMs:item().endMs;
 if(viewMode==="start"||viewMode==="end"){const edge=viewMode==="start"?start:end;return {start:Math.max(0,edge-1000),end:Math.min(data.durationMs,edge+1000)};}
 return {start:Math.max(0,start-3000),end:Math.min(data.durationMs,end+3000)};
}
function currentHead() {
 if(!playing)return headMs;
 const elapsed=(audioContext.currentTime-playing.started)*1000;
 return playing.loop?playing.from+(elapsed%(playing.to-playing.from)):Math.min(playing.to,playing.from+elapsed);
}
function pause() {
 headMs=currentHead();const old=playing;playing=null;cancelAnimationFrame(frame);
 if(old){old.node.onended=null;try{old.node.stop();}catch{}old.node.disconnect();}
 paintClock();draw();
}
function paintClock() {
 if(!data||!selected)return;
 const range=contextRange(),h=currentHead();$("clock").textContent=clock(h);
 $("scrub").min=(range.start/1000).toFixed(3);$("scrub").max=(range.end/1000).toFixed(3);$("scrub").value=(h/1000).toFixed(3);
}
function draw() {
 if(!data||!selected)return;
 const canvas=$("wave"),ctx=canvas.getContext("2d"),w=Math.max(1,Math.floor(canvas.clientWidth)),h=150,ratio=devicePixelRatio||1;
 if(canvas.width!==w*ratio||canvas.height!==h*ratio){canvas.width=w*ratio;canvas.height=h*ratio;waveCache=null;}
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle="#0c131b";ctx.fillRect(0,0,w,h);
 const range=contextRange(),duration=range.end-range.start,x=ms=>(ms-range.start)/duration*w,d=draft();
 if(audioBuffer) {
  const key=range.start+":"+range.end+":"+w;
  if(waveCache?.key!==key){const samples=audioBuffer.getChannelData(0),peaks=[];
   for(let pixel=0;pixel<w;pixel++){const a=Math.max(0,Math.floor((range.start+pixel/w*duration)/1000*audioBuffer.sampleRate)),b=Math.min(samples.length,Math.ceil((range.start+(pixel+1)/w*duration)/1000*audioBuffer.sampleRate));let max=0;for(let n=a;n<b;n++)max=Math.max(max,Math.abs(samples[n]));peaks.push(max);}
   waveCache={key,peaks};
  }
  ctx.fillStyle="#6f96ad";waveCache.peaks.forEach((p,n)=>ctx.fillRect(n,h/2-p*60,1,Math.max(1,p*120)));
 }else{ctx.fillStyle="#91a6b7";ctx.font="14px system-ui";ctx.fillText("Loading original source waveform…",18,75);}
 const anchor=item();if(Number.isInteger(anchor.geminiAnchorStartMs)&&Number.isInteger(anchor.geminiAnchorEndMs)){ctx.fillStyle="#62b9d744";ctx.fillRect(x(anchor.geminiAnchorStartMs),0,x(anchor.geminiAnchorEndMs)-x(anchor.geminiAnchorStartMs),h);}
 if(valid(d)){ctx.fillStyle="#dfbb6a24";ctx.fillRect(x(d.startMs),0,x(d.endMs)-x(d.startMs),h);
  [[d.startMs,"#a5d7b2","START"],[d.endMs,"#91cafa","END"]].forEach(([ms,color,label])=>{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(ms),0);ctx.lineTo(x(ms),h);ctx.stroke();ctx.fillStyle=color;ctx.font="11px system-ui";ctx.fillText(label,Math.min(w-40,Math.max(4,x(ms)+5)),15);});
 }
 ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(currentHead()),0);ctx.lineTo(x(currentHead()),h);ctx.stroke();
 ctx.fillStyle="#aab9c5";ctx.font="11px monospace";ctx.fillText(clock(range.start),8,h-8);ctx.fillText(clock(range.end),Math.max(8,w-75),h-8);
}
function summary() {
 const i=item(),d=draft(),ok=valid(d),verified=activeVerified(i);
 updateLeadIn(i);$("speaker").textContent=speakerLabel(i)+(i.voiceName?" · "+i.voiceName:"");
 $("status").textContent=i.resolution?(i.resolution.treatment==="covered"?"Covered by merged utterance":"Narrator confirmed"):d.dirty?"Unsaved changes":verified?"Verified":i.current?"Saved draft":"Proposed timing";
 $("status").className="pill"+(verified?" verified":"");
 $("start-clock").textContent=clock(d.startMs);$("end-clock").textContent=clock(d.endMs);
 $("duration").textContent=ok?((d.endMs-d.startMs)/1000).toFixed(3)+" seconds selected":"Enter valid start/end times to continue";
 for(const button of document.querySelectorAll("[data-action]")){const action=button.dataset.action;button.disabled=busy||(data.application&&!["play","context","start-edge","end-edge","pause","zoom-window","zoom-start","zoom-end"].includes(action))||(["play","context","start-edge","end-edge","verify"].includes(action)&&(!ok||!audioBuffer))||(action==="draft"&&!ok);}
 for(const button of document.querySelectorAll("[data-bound]"))button.disabled=busy||!!data.application;
 $("start").disabled=$("end").disabled=$("note").disabled=$("speaker-choice").disabled=busy||!!data.application;
 document.querySelector('[data-action="draft"]').textContent=verified&&!d.dirty?"Reopen as draft":"Save changes";
 $("download").href=api+"/items/"+encodeURIComponent(i.id)+"/audio?scope="+scope;
 $("download").textContent=d.dirty?"Download last saved WAV":i.current?"Download saved WAV":"Download initial WAV";
 list();paintClock();draw();
}
function select(id) {
 pause();selected=id;viewMode="window";const i=item();if(!i)return;const d=draft();
 headMs=Number.isFinite(d.startMs)?d.startMs:i.startMs;
 $("workspace").hidden=false;$("kind").textContent=scope==="speech"?"Quoted speech turn":i.kind==="character"?"Spoken quotation":i.kind==="narration"?"Narration passage":"Verse timing aid";
 $("title").textContent=i.verseRef+" · "+i.title;$("speaker").textContent=speakerLabel(i)+(i.voiceName?" · "+i.voiceName:"");
 $("hatam").textContent=i.textHatam||"Listen to the original context and note what you hear.";$("english").textContent=i.englishContext;
 $("confidence").textContent=[i.timingConfidence==null?null:`Timing boundary confidence ${i.timingConfidence}%`,i.geminiMatchConfidence==null?null:`Gemini text-match score ${i.geminiMatchConfidence}%`,i.speakerConfidence==null?null:`English speaker evidence score ${i.speakerConfidence}%`,i.current?.speakerLabel&&i.current.speakerLabel!==i.speakerName?"Saved speaker correction; exact handoff still unreviewed":null].filter(Boolean).join(" · ")||"Confidence has not been estimated.";
 $("warnings").textContent=i.warnings.join(" ");$("warnings").hidden=!i.warnings.length;
 $("start").value=(d.startMs/1000).toFixed(3);$("end").value=(d.endMs/1000).toFixed(3);$("note").value=d.note;$("speaker-choice").value=d.speakerLabel;
 $("saved").textContent=i.resolution?i.resolution.evidence:i.current?(i.current.verified?"Verified":"Draft saved")+" by "+i.current.reviewerName+" · "+new Date(i.current.createdAt).toLocaleString():"No verification recorded.";
 if(data.application)$("saved").textContent+=" Applied by producer instruction. This retained listening set is read-only; later changes require a source-binding revision.";
 $("history").innerHTML=i.history.length?i.history.slice().reverse().map(r=>"<li>"+clock(r.startMs)+"–"+clock(r.endMs)+" · "+(r.verified?"verified":"draft")+(r.speakerLabel?" · "+esc(r.speakerLabel):"")+" · "+esc(r.reviewerName)+" · "+esc(new Date(r.createdAt).toLocaleString())+"</li>").join(""):"<li>No saved history yet.</li>";
 history.replaceState(null,"","#"+encodeURIComponent(id));summary();
}
function change(bound,value) {
 pause();const d=draft();d[bound+"Ms"]=value;d.dirty=true;d.pending=null;
 $("saved").textContent="Changes are not saved or verified.";$("status").className="pill";error(null);summary();
}
async function play(from,to,loop=false) {
 pause();if(!audioBuffer||!Number.isFinite(from)||to<=from)return;
 await audioContext.resume();
 const node=audioContext.createBufferSource();node.buffer=audioBuffer;node.connect(audioContext.destination);
 const timing={node,from,to,loop,started:audioContext.currentTime};
 playing=timing;headMs=from;node.loop=loop;node.loopStart=from/1000;node.loopEnd=to/1000;
 node.onended=()=>{if(playing===timing){headMs=to;playing=null;cancelAnimationFrame(frame);node.disconnect();paintClock();draw();}};
 if(loop)node.start(0,from/1000);else node.start(0,from/1000,(to-from)/1000);
 function tick(){if(playing!==timing)return;paintClock();draw();frame=requestAnimationFrame(tick);}tick();
}
async function save(action) {
 pause();const i=item(),d=draft();if(!valid(d))return;
 const body={startMs:d.startMs,endMs:d.endMs,action,reviewerName:$("reviewer").value.trim(),note:d.note,speakerLabel:d.speakerLabel,baseRevision:d.baseRevision,manifestHash:data.manifestHash,scope,...(action==="verify"?{attestation:"confirm"}:{})};
 if(!body.reviewerName){error("Enter the name of the person reviewing this recording.");$("reviewer").focus();return;}
 const signature=JSON.stringify(body);if(d.pending?.signature!==signature)d.pending={signature,id:crypto.randomUUID()};
 busy=true;error(null);summary();
 try {
  const response=await fetch(api+"/items/"+encodeURIComponent(i.id),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,requestId:d.pending.id})}),result=await response.json();
  if(!response.ok)throw Error(result.error||"The review could not be saved.");
  i.current=result;i.history.push({id:result.id,startMs:result.startMs,endMs:result.endMs,verified:result.verified,reviewerName:result.reviewerName,speakerLabel:result.speakerLabel??null,createdAt:result.createdAt});
  drafts.set(i.id,{startMs:result.startMs,endMs:result.endMs,note:result.note,speakerLabel:result.speakerLabel??i.speakerName,baseRevision:result.id,dirty:false,pending:null});
  busy=false;select(i.id);
 }catch(e){busy=false;error(e.message);summary();}
}
$("items").addEventListener("click",e=>{const b=e.target.closest("[data-item]");if(b&&!busy)select(b.dataset.item);});
$("filter").addEventListener("change",list);
for(const key of ["start","end"])$(key).addEventListener("input",()=>change(key,$(key).value===""?NaN:Math.round(Number($(key).value)*1000)));
$("speaker-choice").addEventListener("input",()=>{const d=draft();d.speakerLabel=$("speaker-choice").value;d.dirty=true;d.pending=null;summary();});
$("note").addEventListener("input",()=>{const d=draft();d.note=$("note").value;d.dirty=true;d.pending=null;summary();});
document.addEventListener("click",async e=>{
 const nudge=e.target.closest("[data-bound]");if(nudge&&!busy){const key=nudge.dataset.bound,d=draft(),value=d[key+"Ms"]+Number(nudge.dataset.step);$(key).value=(value/1000).toFixed(3);change(key,value);return;}
 const b=e.target.closest("[data-action]");if(!b||b.disabled)return;const d=draft(),action=b.dataset.action;
 try{
  if(action==="zoom-window"||action==="zoom-start"||action==="zoom-end"){viewMode=action.slice(5);waveCache=null;paintClock();draw();return;}
  if(action==="pause"){pause();return;}
  if(action==="play"){await play(d.startMs,d.endMs,$("loop").checked);return;}
  if(action==="context"){await play(Math.max(0,d.startMs-2000),Math.min(data.durationMs,d.endMs+2000));return;}
  if(action==="start-edge"){await play(Math.max(0,d.startMs-750),Math.min(data.durationMs,d.startMs+1250));return;}
  if(action==="end-edge"){await play(Math.max(0,d.endMs-1250),Math.min(data.durationMs,d.endMs+750));return;}
  if(action.startsWith("set-")){const key=action.slice(4),value=Math.round(currentHead());$(key).value=(value/1000).toFixed(3);change(key,value);return;}
  if(action==="draft"||action==="verify"){await save(action);return;}
  if(action==="revert"){drafts.delete(selected);error(null);select(selected);return;}
  if(action==="next"){const index=data.items.findIndex(i=>i.id===selected),ordered=[...data.items.slice(index+1),...data.items.slice(0,index+1)],next=ordered.find(i=>!activeVerified(i));if(next)select(next.id);else $("saved").textContent="Every listening window has a saved verification.";}
 }catch(err){error(err.message);}
});
$("scrub").addEventListener("input",()=>{pause();headMs=Math.round(Number($("scrub").value)*1000);paintClock();draw();});
$("wave").addEventListener("click",e=>{pause();const r=contextRange(),box=$("wave").getBoundingClientRect();headMs=Math.round(r.start+(e.clientX-box.left)/box.width*(r.end-r.start));paintClock();draw();});
$("wave").addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();pause();const r=contextRange();headMs=Math.max(r.start,Math.min(r.end,headMs+(e.key==="ArrowLeft"?-1:1)));paintClock();draw();}});
document.addEventListener("keydown",e=>{if(e.code==="Space"&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)){e.preventDefault();if(playing)pause();else document.querySelector('[data-action="play"]').click();}});
window.addEventListener("resize",draw);
window.addEventListener("beforeunload",e=>{if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue="";}});
async function load(){
 try{
  const response=await fetch(api+"/data?scope="+scope,{cache:"no-store"});data=await response.json();if(!response.ok)throw Error(data.error);
  $("speech-mode").href="?scope=speech";$("verse-mode").href="?scope=verse";$(scope+"-mode").setAttribute("aria-current","page");
  $("chapter").textContent=data.title+" · "+data.items.length+(scope==="speech"?" proposed speech turns":" source verse entries");
  if(scope==="speech"){$("speaker-label").firstChild.textContent="Story speaker for this turn ";$("wave-hint").textContent="Gold: proposed speech interval. Gemini aligned the surrounding verses; the exact quote edges still need your ear.";$("review-scope").textContent="Each entry is one proposed quoted speech turn, even when it crosses verses. Set start at its first quoted word and end after its last spoken word. Verse markers and narrator lead-ins are context only. These reviews do not automatically attribute source rows, choose a canon character, approve a cast voice or dispatch generation.";document.querySelector('[data-action="verify"]').textContent="Verify this speech turn";document.querySelector('#filter option[value="all"]').textContent="All speech turns";}
  select(data.items.some(i=>i.id===decodeURIComponent(location.hash.slice(1)))?decodeURIComponent(location.hash.slice(1)):data.items[0].id);
  audioContext=new AudioContext({sampleRate:data.sampleRate});
  const pcmResponse=await fetch(data.pcmUrl);if(!pcmResponse.ok)throw Error("The original listening audio could not be loaded.");
  audioBuffer=await audioContext.decodeAudioData(await pcmResponse.arrayBuffer());
  if(Math.abs(audioBuffer.duration*1000-data.durationMs)>50)throw Error("The decoded source duration differs from the prepared review.");
  $("audio-state").textContent="Original source audio ready";summary();
 }catch(e){error(e.message);$("audio-state").textContent="Source audio unavailable";}
}
void load();
