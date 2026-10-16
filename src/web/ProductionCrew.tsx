import { useEffect, useState } from "react";

interface Run { id: string; phase: string; status: string; result_json: string | null; brief_json: string; calls: number; created_at: number }
interface Event { id: string; role: string; round: number; prompt: string; output_json: string | null; error: string | null }
import type { CrewContribution as Contribution, CrewResult } from "../pipeline/creative-direction/crew-types";
import type { CutTimingAudit } from "../pipeline/assembly/cut-timing-audit";
import type { ProductionRecord } from "../pipeline/creative-direction/production-record";
interface Asset { id: string; kind: string; description: string; path: string }
interface Attempt { id: string; kind: string; status: string; path: string | null; error: string | null; cost_usd: number | null }
interface Snapshot { runs: Run[]; assets: Asset[]; attempts: Attempt[]; render: { id: string; path: string } | null; timingAudit?: CutTimingAudit | null; backup?: { stale: boolean; summary: string }; productionRecord?:ProductionRecord|null }
interface MonitorEvent { id:string; runId?:string; kind:string; sender:string; round:number; status:"active"|"completed"|"held"|"error"; context:string; summary:string; createdAt:number }
interface Monitor { events: MonitorEvent[]; outstanding: MonitorEvent[]; state:string; note:string }
interface Lesson { id:string; scope_kind:string; requested_change:string; rationale:string|null; status:string; subject_id?:string|null }
interface LessonEvent { id:string; lesson_id:string; kind:string; detail:string|null; created_at:number }
interface LessonResponse { lessons:Lesson[]; applicableLessons:Lesson[]; history:LessonEvent[]; unavailable?: string }
interface CrewRole { id:string; label:string; owner:string; authority:string; runtime:string; owns:string; cannot:string }
interface Roster { roster: CrewRole[] }
const mediaUrl = (path: string) => `/media/${path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`;
async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Production request failed.");
  return data as T;
}
export function ProductionCrew({ projectId, onUpdated }: { projectId: string; onUpdated?: () => void }) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/production`;
  const [runs, setRuns] = useState<Run[]>([]), [events, setEvents] = useState<Event[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [render, setRender] = useState<Snapshot["render"]>(null);
  const [timingAudit, setTimingAudit] = useState<CutTimingAudit | null>(null);
  const [backup, setBackup] = useState<Snapshot["backup"]>();
  const [productionRecord,setProductionRecord]=useState<ProductionRecord|null>(null);
  const [selected, setSelected] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [guidance, setGuidance] = useState("");
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [applicableLessons, setApplicableLessons] = useState<Lesson[]>([]);
  const [lessonHistory, setLessonHistory] = useState<LessonEvent[]>([]);
  const [lessonUnavailable, setLessonUnavailable] = useState("");
  const [reusable, setReusable] = useState(false);
  const [principle, setPrinciple] = useState("");
  const [lessonScope, setLessonScope] = useState("chapter");
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, { principle: string; rationale: string; scope: string }>>({});
  const [roster, setRoster] = useState<CrewRole[]>([]);
  const [asset, setAsset] = useState({ path: "", kind: "music", description: "" });
  async function refresh() {
    const data = await request<Snapshot>(base);
    setRuns(data.runs); setAssets(data.assets); setAttempts(data.attempts); setRender(data.render); setTimingAudit(data.timingAudit ?? null); setBackup(data.backup); setProductionRecord(data.productionRecord??null);
    setMonitor(await request<Monitor>(`${base}/monitor`));
    const lessonData = await request<LessonResponse>(`${base}/lessons`).catch(e => ({ lessons: [], applicableLessons: [], history: [], unavailable: e.message }));
    setLessonUnavailable(lessonData.unavailable ?? "");
    setLessons(lessonData.lessons); setApplicableLessons(lessonData.applicableLessons); setLessonHistory(lessonData.history);
    setRoster((await request<Roster>("/api/control-room/roster", undefined, "GET")).roster);
  }
  useEffect(() => {
    let active = true;
    const load = () => Promise.all([request<Snapshot>(base), request<Monitor>(`${base}/monitor`), request<LessonResponse>(`${base}/lessons`).catch(e => ({ lessons: [], applicableLessons: [], history: [], unavailable: e.message })), request<Roster>("/api/control-room/roster", undefined, "GET")]).then(([data, monitor, lessonData, rosterData]) => { if (active) { setRuns(data.runs); setAssets(data.assets); setAttempts(data.attempts); setRender(data.render); setTimingAudit(data.timingAudit ?? null); setBackup(data.backup); setProductionRecord(data.productionRecord??null); setMonitor(monitor); setLessons(lessonData.lessons); setApplicableLessons(lessonData.applicableLessons); setLessonHistory(lessonData.history); setLessonUnavailable(lessonData.unavailable ?? ""); setRoster(rosterData.roster); } }).catch(e => { if (active) setError(e.message); });
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [base]);
  useEffect(() => {
    setEvents([]);
    if (!selected) return;
    let active = true;
    void request<{ events: Event[] }>(`${base}/runs/${selected}`).then(data => { if (active) setEvents(data.events); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base, selected, runs.find(r => r.id === selected)?.calls]);
  async function act(path: string, body: unknown = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ summary?: string; reasoning?: string; path?: string; runId?: string }>(`${base}/${path}`, body);
      setNotice(result.summary ?? result.reasoning ?? (result.path ? `New finished cut: ${result.path}` : "Saved."));
      if (result.runId) setSelected(result.runId);
      await refresh();
      onUpdated?.();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  const running = busy || runs.some(r => r.status === "running");
  const finish = runs.find(r => r.phase === "finishing");
  const plan = runs.find(r => r.phase === "planning");
  const planResult = plan?.result_json ? JSON.parse(plan.result_json) as CrewResult : null;
  const treatment = planResult?.contributions?.creative_director?.emotionalTreatment;
  return <section className="production-crew" aria-label="Production crew">
    <h2>Production crew</h2>
    <p>Plan the chapter together, review the assembled film, and inspect why each choice was made. Approved takes and the source recording are retained.</p>
    {backup && <p role="status"><strong>Disaster backup{backup.stale ? " overdue" : ""}:</strong> {backup.summary}</p>}
    <section aria-label="Advance emotional treatment">
      <h3>Advance emotional treatment · {plan?.status ?? "not planned"}</h3>
      {treatment ? <>
        <p>{treatment.progression}</p>
        <p><strong>Verdict:</strong> {planResult?.summary} Passing reviews allow production to continue under the existing gates. Add corrections through chapter guidance below.</p>
        {treatment.beats.map(beat => <details key={beat.id}><summary>{beat.sourceTrigger.verseRef} · {beat.audienceExperience}</summary>
          <blockquote>{beat.sourceTrigger.quote}</blockquote><p>{beat.characterResponse}</p>
          <p><strong>Intensity:</strong> {beat.intensity} <strong>Progression:</strong> {beat.progression}</p>
          <p><strong>Picture:</strong> {beat.filmableMeans}</p><p>{beat.limitations}</p>
          <p>Shots: {beat.shotIds.join(", ")}{productionRecord?.producerOverrideShotIds.some(id => beat.shotIds.includes(id)) ? " · Producer edits take precedence over earlier craft direction." : ""}</p>
        </details>)}
        <details><summary>Pause and sound purposes, timing, coverage and cost</summary><pre>{JSON.stringify({pauses:treatment.pauses,cues:treatment.cues},null,2)}</pre></details>
        <details><summary>Treatment reviews</summary>{Object.entries(planResult?.contributions ?? {}).filter(([, c]) => c?.treatmentReview).map(([role,c]) => <p key={role}><strong>{role.replaceAll("_"," ")} · {c!.treatmentReview!.status}:</strong> {c!.treatmentReview!.evidence} {c!.treatmentReview!.requestedChange}</p>)}</details>
      </> : <p>No advance treatment recorded for this plan. Previous film records remain available in review history.</p>}
    </section>
    {productionRecord && <section aria-label="Saved production revision">
      <h3>Saved production revision · {productionRecord.status}</h3>
      <p>{productionRecord.revision}{productionRecord.parentRevision ? ` · Previous: ${productionRecord.parentRevision}` : ""}</p>
      {productionRecord.objections.some(o=>o.status==="open"&&o.severity==="blocking")&&<p role="alert">New generation is held while the blocking objections below need resolution.</p>}
      {productionRecord.objections.filter(o=>o.status==="open").map(o=><article key={o.id}><strong>{o.severity} · {o.owner.replaceAll("_"," ")}</strong><p>{o.requestedChange}</p><p>{o.evidence}</p><small>{o.limitations} · {o.id}</small></article>)}
      <details><summary>Proposals, objections and resolutions ({productionRecord.history.length})</summary>{productionRecord.history.map(h=><article key={h.id}><strong>{h.kind} · {h.owner.replaceAll("_"," ")}</strong><p>{h.rationale}</p><small>{h.id} · Input: {h.inputRevision}{h.resolution ? ` · ${h.resolution.outcome}` : ""}</small><pre>{JSON.stringify({changes:h.proposedChanges,objections:h.objections,resolution:h.resolution},null,2)}</pre></article>)}</details>
      <details><summary>Saved FDL snapshot · {productionRecord.status}</summary><pre>{JSON.stringify(productionRecord.snapshots,null,2)}</pre></details>
    </section>}
    <details className="crew-roster"><summary>Production roster ({roster.length} declared roles and reviewers)</summary><p>Implemented labels identify bounded recorded calls. Declared roles describe ownership and handoffs; they do not imply a live autonomous worker.</p><div className="crew-map">{roster.map(role => <article key={role.id} className="department-card"><strong>{role.label}</strong><p>{role.owner} · {role.authority.replaceAll("_", " ")} · {role.runtime}</p><p>Owns: {role.owns}</p><small>Cannot: {role.cannot}</small></article>)}</div></details>
    <details className="production-monitor" aria-label="Production interaction history">
      <summary>Recorded chapter interaction history</summary>
      <p>{monitor?.note ?? "Loading recorded workflow events…"}</p>
      <p>Current pipeline work, holds and available footage are shown in the live producer view above. These are retained interaction records.</p>
      <div className="monitor-stream" aria-live="polite">{monitor?.events.map(event => <article key={event.id} className={`monitor-event ${event.status}`}><small>{event.kind === "negotiation" ? "Recorded negotiation" : "Recorded role exchange"} · {event.sender.replaceAll("_", " ")} · pass {event.round} · {new Date(event.createdAt).toLocaleString()}</small><p><strong>{event.context}</strong> — {event.summary}</p>{event.runId && <button onClick={() => setSelected(event.runId!)}>Open recorded contribution</button>}</article>)}</div>
    </details>
    {render && <p>Recorded chapter cut: {render.id}. Inspect availability, restart status and playback in the live producer view above.</p>}
    {timingAudit && <details><summary>Recorded timing audit — source coverage needs review</summary>
      <p>{timingAudit.summary}</p><ul>{timingAudit.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
      <p>{timingAudit.picture.length} picture intervals recorded. These observations do not approve the film or enable automatic finishing.</p>
    </details>}
    <div className="crew-actions">
      {lessonUnavailable && <p className="hint">Correction lessons unavailable: {lessonUnavailable} Other chapter review controls remain available.</p>}
      <button disabled={running} onClick={() => void act("plan", { maxCalls: 30 })}>{running ? "Crew working…" : "Create / review storyboard"}</button>
      <button disabled={running} onClick={() => void act("review-cut", { maxCalls: 16 })}>Review assembled cut</button>
      <button disabled={running} onClick={() => void act("edit-cut")}>Build Picture Editor cut</button>
      <button disabled={running || finish?.status !== "awaiting_assets"} onClick={() => finish && void act(`soundtrack/${finish.id}`)}>Generate requested music / effects</button>
      <button disabled={running || finish?.status !== "approved"} onClick={() => finish && void act(`finish/${finish.id}`)}>Apply approved finishing</button>
      <button disabled={busy} onClick={() => void act("preservation")}>Preserve chapter for later editing</button>
    </div>
    <p className="hint">Planning allows up to 30 role calls, including sound, music and critic review of revisions; cut review allows up to 16. Music uses Google Gemini; effects use ElevenLabs, with at most eight audio generations per request and an independent listening review. Provider charges apply. Unreported costs are not counted as free.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <label>Producer guidance / decision<textarea value={guidance} onChange={e => setGuidance(e.target.value)} placeholder="A scoped correction, creative preference, or decision for the next review" /></label>
    <label><input type="checkbox" checked={reusable} onChange={e => setReusable(e.target.checked)} /> Use my explicit reusable principle instead of a proposed candidate</label>
    {reusable && <><label>Reusable principle<textarea value={principle} onChange={e => setPrinciple(e.target.value)} placeholder="State the generalized practice for matching work; do not copy the raw correction." /></label><label>Scope<select value={lessonScope} onChange={e => setLessonScope(e.target.value)}><option value="chapter">This chapter</option><option value="book">This book and matching language/region</option><option value="language">This language and matching region</option><option value="region">This region and matching language</option><option value="global">Explicit global directive</option></select></label></>}
    <button disabled={running || !guidance.trim() || (reusable && !principle.trim())} onClick={() => void act("guidance", { note: guidance, reusable, principle, scope: lessonScope }).then(saved => { if (saved) { setGuidance(""); setReusable(false); setPrinciple(""); setLessonScope("chapter"); } })}>Record guidance</button>
    <details><summary>Correction lessons ({lessons.length})</summary><p>HeartWord proposes a narrowly scoped candidate from each recorded correction. Inspect, edit, and activate it before it can guide matching work; disabled and superseded lessons remain history.</p>{applicableLessons.length > 0 && <p>Guidance currently applicable to this project: {applicableLessons.map(lesson => `${lesson.scope_kind}: ${lesson.requested_change}`).join(" · ")}</p>}{lessons.map(lesson => { const draft = lessonDrafts[lesson.id] ?? { principle: lesson.requested_change, rationale: lesson.rationale ?? "", scope: lesson.scope_kind }; const editable = lesson.status === "candidate" || lesson.status === "active"; return <article key={lesson.id}><strong>{lesson.status} · {lesson.scope_kind}</strong><p>{lesson.requested_change}</p>{lesson.rationale && <small>{lesson.rationale}</small>} {editable && <><label>Reusable principle<input value={draft.principle} onChange={e => setLessonDrafts({ ...lessonDrafts, [lesson.id]: { ...draft, principle:e.target.value } })} /></label><label>Reason<input value={draft.rationale} onChange={e => setLessonDrafts({ ...lessonDrafts, [lesson.id]: { ...draft, rationale:e.target.value } })} /></label><label>Scope<select value={draft.scope} onChange={e => setLessonDrafts({ ...lessonDrafts, [lesson.id]: { ...draft, scope:e.target.value } })}><option value="chapter">This chapter</option><option value="book">Book</option><option value="language">Language</option><option value="region">Region</option><option value="global">Explicit global</option></select></label><button disabled={running || !draft.principle.trim()} onClick={() => void request(`${base}/lessons/${lesson.id}`, { requestedChange:draft.principle, rationale:draft.rationale, scope:draft.scope }, "PATCH").then(refresh).catch(e => setError(e.message))}>{lesson.status === "active" ? "Save superseding revision" : "Activate reviewed principle"}</button></>} {lesson.status !== "disabled" && <button disabled={running} onClick={() => void act(`lessons/${lesson.id}/status`, { status:"disabled" })}>Disable</button>} {lesson.status === "active" && <button disabled={running} onClick={() => void act(`lessons/${lesson.id}/status`, { status:"superseded" })}>Supersede</button>}</article>; })}{lessonHistory.length > 0 && <details><summary>Lesson history ({lessonHistory.length})</summary>{lessonHistory.map(event => <p key={event.id}><small>{new Date(event.created_at).toLocaleString()} · {event.kind}{event.detail ? ` · ${event.detail}` : ""}</small></p>)}</details>}</details>
    <div className="crew-runs">{runs.map(run => {
      const result = run.result_json ? JSON.parse(run.result_json) as { summary: string } : null;
      const appliedLessons = JSON.parse(run.brief_json).appliedLessons as Array<{ id:string; subjectId:string|null; scopeKind:string; requestedChange:string }> | undefined;
      return <article key={run.id}>
        <button aria-expanded={selected === run.id} onClick={() => setSelected(selected === run.id ? null : run.id)}>
          {run.phase === "planning" ? "Storyboard" : run.phase === "editing" ? "Picture editing" : "Cut review"} · {run.status.replaceAll("_", " ")} · {run.calls} calls · {new Date(run.created_at).toLocaleString()}
        </button>
        {result && <p>{result.summary}</p>}
        {appliedLessons?.length ? <p className="hint">Applied lessons: {appliedLessons.map(lesson => `${lesson.scopeKind}${lesson.subjectId ? ` (${lesson.subjectId})` : ""}: ${lesson.requestedChange}`).join(" · ")}</p> : null}
        {run.status === "running" && <button disabled={busy} onClick={() => void act(`recover/${run.id}`)}>Recover interrupted review</button>}
        {selected === run.id && events.map(event => {
          const output = event.output_json ? JSON.parse(event.output_json) as Contribution : null;
          return <details key={event.id}>
            <summary>{event.role.replaceAll("_", " ")} · pass {event.round}{event.error ? " · incomplete" : ""}</summary>
            {event.error && <p className="error">{event.error}</p>}
            {output && <><p>{output.summary}</p>
              {output.findings.map((f, i) => <p key={i}><strong>{f.severity}{f.shotId ? ` · ${f.shotId}` : ""}:</strong> {f.evidence}<br />Confidence: {typeof f.confidence === "number" ? `${f.confidence}/100 agent estimate (uncalibrated)` : "not reported (legacy record)"}<br />Limitations: {f.limitations ?? "not reported (legacy record)"}<br />Requested change: {f.requestedChange}</p>)}
              {output.coverageRequests?.map((c, i) => <p key={i}>Coverage needed: {(c.additionalMs / 1000).toFixed(1)}s · {c.description} · {c.reason}</p>)}
              {output.treatmentReview && <p><strong>Treatment · {output.treatmentReview.status}:</strong> {output.treatmentReview.evidence} {output.treatmentReview.requestedChange}<br />{output.treatmentReview.limitations}</p>}
              {output.emotionalBeatChecks?.map(c => <p key={c.beatId}><strong>Effect · {c.beatId} · {c.status}:</strong> {c.startMs / 1000}–{c.endMs / 1000}s · {c.evidence}<br />{c.requestedChange} · {c.limitations}</p>)}
              {output.pauses?.map((p, i) => <p key={`pause-${i}`}>Breathing room: {p.durationMs / 1000}s · {p.reason}</p>)}
              {output.edits?.length ? <p>{output.edits.length} shots selected, {output.edits.reduce((sum, e) => sum + e.durationMs, 0) / 1000}s of footage.</p> : null}
              {output.generationRequests?.map((g, i) => <p key={`request-${i}`}><strong>Generate {event.role === "composer" ? "music" : "sound effect"}:</strong> {g.prompt}<br />At {g.startMs / 1000}s for {g.durationMs / 1000}s, {g.gainDb} dB{g.loop ? ", seamless loop" : ""}. {g.reason}</p>)}
              {output.audioCues?.map((c, i) => <p key={`cue-${i}`}>Cue: {assets.find(a => a.id === c.assetId)?.description ?? c.assetId} · {c.startMs / 1000}–{c.endMs / 1000}s at {c.gainDb} dB · {c.reason}</p>)}
              {output.colorAdjustments?.map((c, i) => <p key={`color-${i}`}>Color correction: {c.reason} · brightness {c.brightness}, contrast {c.contrast}, saturation {c.saturation}</p>)}
              {output.directions.map(d => <p key={d.shotId}><strong>{d.shotId}</strong>: {d.instruction}<br /><em>{d.scriptureBasis}</em></p>)}</>}
            <details><summary>Full recorded context</summary><pre>{event.prompt}</pre></details>
            {output && <details><summary>Full saved role output</summary><pre>{JSON.stringify(output,null,2)}</pre></details>}
          </details>;
        })}
      </article>;
    })}</div>
    <details><summary>Approved music and sound effects ({assets.length})</summary>
      <p>Register an audio file already in HeartWord’s assets folder for this chapter. The crew can select it for restrained, speech-prioritized mixing.</p>
      <ul>{assets.map(a => <li key={a.id}>{a.kind}: {a.description}<br /><audio controls preload="none" src={mediaUrl(a.path)} aria-label={a.description} /></li>)}</ul>
      <label>Asset path<input value={asset.path} onChange={e => setAsset({ ...asset, path: e.target.value })} placeholder="music/approved-cue.wav" /></label>
      <label>Type<select value={asset.kind} onChange={e => setAsset({ ...asset, kind: e.target.value })}><option value="music">Music</option><option value="sfx">Sound effect</option></select></label>
      <label>Description<input value={asset.description} onChange={e => setAsset({ ...asset, description: e.target.value })} /></label>
      <button disabled={running || !asset.path.trim() || !asset.description.trim()} onClick={() => void act("audio-assets", asset)}>Approve audio asset</button>
    </details>
    {!!attempts.length && <details><summary>Audio generation history ({attempts.length})</summary>{attempts.map(a => <article key={a.id}>
      <p>{a.kind} · {a.status.replaceAll("_", " ")} · {a.cost_usd === null ? "Provider cost not reported" : `$${a.cost_usd.toFixed(2)}`}</p>
      {a.error && <p>{a.error}</p>}{a.path && <audio controls preload="none" src={mediaUrl(a.path)} aria-label={`${a.kind} candidate`} />}
    </article>)}</details>}
    <details><summary>Timing from an existing editor</summary>
      <p>A hand-edited film can be reviewed immediately. Automatic finishing also needs its shot timings and original-audio placements. Import the timing file exported for that exact cut; the film itself is retained.</p>
      <label>Import cut timing<input type="file" accept=".json,application/json" disabled={running} onChange={e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 1024 * 1024) { setError("Timing file must be under 1 MB."); return; }
        void file.text().then(text => act("cut-timing", JSON.parse(text))).catch(e => setError(e.message));
        e.target.value = "";
      }} /></label>
    </details>
  </section>;
}
