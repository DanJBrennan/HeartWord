import { useEffect, useRef, useState } from "react";

interface Interval { id: string; start_ms: number; end_ms: number; verse_ref: string | null }
interface Run { id: string; characterId: string | null; verseRef: string; startMs: number; endMs: number; internalVerseTiming: string; reviewerName: string; evidence: string }
export function ContinuousSpeechReview({ projectId, intervals, characters, onSaved }: {
  projectId: string; intervals: Interval[];
  characters: Array<{ id: string; name: string; canon_status: string; region: string }>;
  onSaved: () => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [speaker, setSpeaker] = useState(""); const [verseRef, setVerseRef] = useState("");
  const [timing, setTiming] = useState("unresolved"); const [reviewer, setReviewer] = useState("");
  const [evidence, setEvidence] = useState(""); const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  async function load() {
    const response = await fetch(`/api/projects/${projectId}/continuous-speech`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setRuns(result.runs);
  }
  useEffect(() => { void load().catch(e => setError(e.message)); }, [projectId]);
  const start = intervals.findIndex(i => i.id === first), end = intervals.findIndex(i => i.id === last);
  const selected = start >= 0 && end >= start ? intervals.slice(start, end + 1) : [];
  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { audioSegmentIds: selected.map(i => i.id), characterId: speaker === "narrator" ? null : speaker,
        verseRef, internalVerseTiming: timing, reviewerName: reviewer, evidence };
      const signature = JSON.stringify(body);
      if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
      const response = await fetch(`/api/projects/${projectId}/continuous-speech`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: pending.current.key }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load(); onSaved(); pending.current = null; setFirst(""); setLast(""); setEvidence("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const label = (i: Interval) => `${(i.start_ms / 1000).toFixed(2)}–${(i.end_ms / 1000).toFixed(2)}s · ${i.verse_ref ?? "unassigned"}`;
  return <details>
    <summary>Continuous speech — confirm the whole run</summary>
    <p className="hint">Confirm the outer audio boundaries and covered verses once. Internal verse timing can remain uncertain. Review narration interruptions and speaker changes separately; exact performance or emotional beats still need timing evidence.</p>
    {runs.map(run => <p key={run.id}><strong>{run.verseRef}</strong> · {characters.find(c => c.id === run.characterId)?.name ?? "Narrator"} · {(run.startMs / 1000).toFixed(2)}–{(run.endMs / 1000).toFixed(2)}s · internal verse timing {run.internalVerseTiming}<br />{run.reviewerName}: {run.evidence}</p>)}
    <label>First interval <select value={first} onChange={e => { setFirst(e.target.value); if (!last) setLast(e.target.value); }}><option value="">Select</option>{intervals.map(i => <option key={i.id} value={i.id}>{label(i)}</option>)}</select></label>{" "}
    <label>Last interval <select value={last} onChange={e => setLast(e.target.value)}><option value="">Select</option>{intervals.map(i => <option key={i.id} value={i.id}>{label(i)}</option>)}</select></label><br />
    <label>Speaker <select value={speaker} onChange={e => setSpeaker(e.target.value)}><option value="">Select</option><option value="narrator">Narrator — original reading</option>{characters.filter(c => c.canon_status === "approved" && c.region === "Papuan").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{" "}
    <label>Covered verses <input value={verseRef} onChange={e => setVerseRef(e.target.value)} placeholder="Mark 4:3-8" /></label>{" "}
    <label>Internal verse timing <select value={timing} onChange={e => setTiming(e.target.value)}><option value="unresolved">Unresolved</option><option value="approximate">Approximate</option></select></label><br />
    <label>Reviewer <input value={reviewer} onChange={e => setReviewer(e.target.value)} /></label><br />
    <label>Evidence for speaker, uninterrupted speech and outer boundaries <textarea value={evidence} onChange={e => setEvidence(e.target.value)} /></label><br />
    <button disabled={busy || !selected.length || !speaker || !verseRef.trim() || !reviewer.trim() || !evidence.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Confirm continuous speech"}</button>
    {error && <p className="error">{error}</p>}
  </details>;
}
