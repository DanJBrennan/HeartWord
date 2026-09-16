import { useEffect, useState } from "react";

interface Run { id: string; phase: string; status: string; result_json: string | null; calls: number; created_at: number }
interface Event { id: string; role: string; round: number; prompt: string; output_json: string | null; error: string | null }
import type { CrewContribution as Contribution } from "../pipeline/creative-direction/crew-types";
import type { CutTimingAudit } from "../pipeline/assembly/cut-timing-audit";
interface Asset { id: string; kind: string; description: string; path: string }
interface Attempt { id: string; kind: string; status: string; path: string | null; error: string | null; cost_usd: number | null }
interface Snapshot { runs: Run[]; assets: Asset[]; attempts: Attempt[]; render: { id: string; path: string } | null; timingAudit?: CutTimingAudit | null }
interface MonitorEvent { id:string; kind:string; sender:string; round:number; status:"active"|"completed"|"held"|"error"; context:string; summary:string; createdAt:number }
interface Monitor { events: MonitorEvent[]; outstanding: MonitorEvent[]; state:string; note:string }
const mediaUrl = (path: string) => `/media/${path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`;
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
  const [selected, setSelected] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [guidance, setGuidance] = useState("");
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [asset, setAsset] = useState({ path: "", kind: "music", description: "" });
  async function refresh() {
    const data = await request<Snapshot>(base);
    setRuns(data.runs); setAssets(data.assets); setAttempts(data.attempts); setRender(data.render); setTimingAudit(data.timingAudit ?? null);
    setMonitor(await request<Monitor>(`${base}/monitor`));
  }
  useEffect(() => {
    let active = true;
    const load = () => Promise.all([request<Snapshot>(base), request<Monitor>(`${base}/monitor`)]).then(([data, monitor]) => { if (active) { setRuns(data.runs); setAssets(data.assets); setAttempts(data.attempts); setRender(data.render); setTimingAudit(data.timingAudit ?? null); setMonitor(monitor); } }).catch(e => { if (active) setError(e.message); });
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
  return <section className="production-crew" aria-label="Production crew">
    <h2>Production crew</h2>
    <p>Plan the chapter together, review the assembled film, and inspect why each choice was made. Approved takes and the source recording are retained.</p>
    <section className="production-monitor" aria-label="Production interaction monitor">
      <h3>Chapter interaction monitor</h3>
      <p>{monitor?.note ?? "Loading recorded workflow events…"}</p>
      {monitor?.outstanding.length ? <><h4>Producer input needed</h4>{monitor.outstanding.map(event => <article key={`hold-${event.id}`}><strong>{event.sender.replaceAll("_", " ")} · {event.status}</strong><p>{event.context} — {event.summary}</p></article>)}</> : <p>No recorded producer decision is outstanding for this chapter.</p>}
      <div className="monitor-stream" aria-live="polite">{monitor?.events.map(event => <article key={event.id} className={`monitor-event ${event.status}`}><small>{event.kind === "negotiation" ? "Recorded negotiation" : "Recorded role exchange"} · {event.sender.replaceAll("_", " ")} · pass {event.round} · {new Date(event.createdAt).toLocaleString()}</small><p><strong>{event.context}</strong> — {event.summary}</p><small>Open the matching run below for the full recorded structured contribution, directions, objections, requested changes, and resolution.</small></article>)}</div>
    </section>
    {render && <video key={render.id} controls preload="metadata" src={mediaUrl(render.path)} aria-label="Current chapter cut" style={{ width: "100%", maxHeight: "30rem" }} />}
    {timingAudit && <details><summary>Recorded timing audit — source coverage needs review</summary>
      <p>{timingAudit.summary}</p><ul>{timingAudit.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
      <p>{timingAudit.picture.length} picture intervals recorded. These observations do not approve the film or enable automatic finishing.</p>
    </details>}
    <div className="crew-actions">
      <button disabled={running} onClick={() => void act("plan", { maxCalls: 24 })}>{running ? "Crew working…" : "Create / review storyboard"}</button>
      <button disabled={running} onClick={() => void act("review-cut", { maxCalls: 16 })}>Review assembled cut</button>
      <button disabled={running} onClick={() => void act("edit-cut")}>Build Picture Editor cut</button>
      <button disabled={running || finish?.status !== "awaiting_assets"} onClick={() => finish && void act(`soundtrack/${finish.id}`)}>Generate requested music / effects</button>
      <button disabled={running || finish?.status !== "approved"} onClick={() => finish && void act(`finish/${finish.id}`)}>Apply approved finishing</button>
    </div>
    <p className="hint">Planning allows up to 24 role calls; cut review allows up to 16. Music uses Google Gemini; effects use ElevenLabs, with at most eight audio generations per request and an independent listening review. Provider charges apply. Unreported costs are not counted as free.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <label>Producer guidance / decision<textarea value={guidance} onChange={e => setGuidance(e.target.value)} placeholder="A scoped correction, creative preference, or decision for the next review" /></label>
    <button disabled={running || !guidance.trim()} onClick={() => void act("guidance", { note: guidance }).then(saved => { if (saved) setGuidance(""); })}>Record guidance</button>
    <div className="crew-runs">{runs.map(run => {
      const result = run.result_json ? JSON.parse(run.result_json) as { summary: string } : null;
      return <article key={run.id}>
        <button aria-expanded={selected === run.id} onClick={() => setSelected(selected === run.id ? null : run.id)}>
          {run.phase === "planning" ? "Storyboard" : run.phase === "editing" ? "Picture editing" : "Cut review"} · {run.status.replaceAll("_", " ")} · {run.calls} calls · {new Date(run.created_at).toLocaleString()}
        </button>
        {result && <p>{result.summary}</p>}
        {run.status === "running" && <button disabled={busy} onClick={() => void act(`recover/${run.id}`)}>Recover interrupted review</button>}
        {selected === run.id && events.map(event => {
          const output = event.output_json ? JSON.parse(event.output_json) as Contribution : null;
          return <details key={event.id}>
            <summary>{event.role.replaceAll("_", " ")} · pass {event.round}{event.error ? " · incomplete" : ""}</summary>
            {event.error && <p className="error">{event.error}</p>}
            {output && <><p>{output.summary}</p>
              {output.findings.map((f, i) => <p key={i}><strong>{f.severity}{f.shotId ? ` · ${f.shotId}` : ""}:</strong> {f.evidence}<br />Requested change: {f.requestedChange}</p>)}
              {output.coverageRequests?.map((c, i) => <p key={i}>Coverage needed: {(c.additionalMs / 1000).toFixed(1)}s · {c.description} · {c.reason}</p>)}
              {output.pauses?.map((p, i) => <p key={`pause-${i}`}>Breathing room: {p.durationMs / 1000}s · {p.reason}</p>)}
              {output.edits?.length ? <p>{output.edits.length} shots selected, {output.edits.reduce((sum, e) => sum + e.durationMs, 0) / 1000}s of footage.</p> : null}
              {output.generationRequests?.map((g, i) => <p key={`request-${i}`}><strong>Generate {event.role === "composer" ? "music" : "sound effect"}:</strong> {g.prompt}<br />At {g.startMs / 1000}s for {g.durationMs / 1000}s, {g.gainDb} dB{g.loop ? ", seamless loop" : ""}. {g.reason}</p>)}
              {output.audioCues?.map((c, i) => <p key={`cue-${i}`}>Cue: {assets.find(a => a.id === c.assetId)?.description ?? c.assetId} · {c.startMs / 1000}–{c.endMs / 1000}s at {c.gainDb} dB · {c.reason}</p>)}
              {output.colorAdjustments?.map((c, i) => <p key={`color-${i}`}>Color correction: {c.reason} · brightness {c.brightness}, contrast {c.contrast}, saturation {c.saturation}</p>)}
              {output.directions.map(d => <p key={d.shotId}><strong>{d.shotId}</strong>: {d.instruction}<br /><em>{d.scriptureBasis}</em></p>)}</>}
            <details><summary>Full recorded context</summary><pre>{event.prompt}</pre></details>
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
