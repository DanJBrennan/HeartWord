import { useEffect, useState } from "react";

interface Project {
  id: string;
  language: string;
  book: string;
  chapter: number;
  stage: string;
  status: string;
}

interface Character {
  id: string;
  name: string;
  scope_kind: string;
  scope_book: string | null;
  scope_chapter: number | null;
  canon_status: string;
  region: string;
  version_label: string | null;
  version_status: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  spoken_segment_count: number;
}

interface Voice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
}

interface CastMasterSegment {
  id: string;
  source_path: string;
  verse_ref: string | null;
  speaker_name: string | null;
}

interface VoicingResult {
  ok: boolean;
  reasoning: string;
  generated: number;
  reused: number;
  passthrough: number;
  skippedNoVoice: number;
}

interface CastingResult {
  ok: boolean;
  reasoning: string;
}

interface MediaGenerationResult {
  ok: boolean;
  reasoning: string;
}

interface Shot {
  id: string;
  sequence: number;
  action: string;
  status: string;
  characters: string | null;
  verse_ref: string | null;
  framing: string | null;
  camera_movement: string | null;
  needs_lip_sync: number;
  dialogue_character: string | null;
  coverage_plan: string;
  coverage_notes: string | null;
  keyframe_path: string | null;
  latest_human_note: string | null;
  latest_human_note_resolved: number | null;
}

interface SceneWithShots {
  id: string;
  sequence: number;
  verse_start: string;
  verse_end: string;
  summary: string | null;
  reasoning: string | null;
  lighting_continuity: string | null;
  englishText: string | null;
  shots: Shot[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${path} failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ language: "hatam", book: "mark", chapter: 2 });

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Record<string, string>>({});

  const [castMasterSegments, setCastMasterSegments] = useState<CastMasterSegment[]>([]);
  const [castMasterError, setCastMasterError] = useState<string | null>(null);
  const [castMasterBusy, setCastMasterBusy] = useState(false);
  const [castMasterResult, setCastMasterResult] = useState<VoicingResult | null>(null);

  const [scenesWithShots, setScenesWithShots] = useState<SceneWithShots[]>([]);
  const [castingError, setCastingError] = useState<string | null>(null);
  const [castingBusy, setCastingBusy] = useState(false);
  const [castingResult, setCastingResult] = useState<CastingResult | null>(null);
  const [mediaGenError, setMediaGenError] = useState<string | null>(null);
  const [mediaGenBusy, setMediaGenBusy] = useState(false);
  const [mediaGenResult, setMediaGenResult] = useState<MediaGenerationResult | null>(null);

  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [reviewBusyShotId, setReviewBusyShotId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [zoomedKeyframe, setZoomedKeyframe] = useState<{ path: string; label: string } | null>(null);

  async function refresh() {
    try {
      const [{ projects }, { characters }] = await Promise.all([
        api<{ projects: Project[] }>("/projects"),
        api<{ characters: Character[] }>("/characters")
      ]);
      setProjects(projects);
      setCharacters(characters);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    api<{ voices: Voice[] }>("/voices")
      .then(({ voices }) => setVoices(voices))
      .catch((err) => setVoicesError((err as Error).message));
  }, []);

  // Pre-select Brian for Jesus (Dan's existing decision) once both the
  // voice list and character list are in, so it's a one-click Approve
  // rather than making him find it in a long dropdown every time.
  const speakingCharacters = characters.filter((c) => c.spoken_segment_count > 0);

  useEffect(() => {
    if (voices.length === 0 || characters.length === 0) return;
    const jesus = characters.find((c) => c.name.toLowerCase() === "jesus" && !c.voice_id);
    const brian = voices.find((v) => v.name.toLowerCase() === "brian");
    if (jesus && brian && !pendingSelection[jesus.id]) {
      setPendingSelection((prev) => ({ ...prev, [jesus.id]: brian.voiceId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices, characters]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/projects", { method: "POST", body: JSON.stringify(form) });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function approveVoice(characterId: string, voiceId: string) {
    try {
      await api(`/characters/${characterId}/voice`, {
        method: "PATCH",
        body: JSON.stringify({ voiceProvider: "elevenlabs", voiceId })
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const activeProject = projects[0] ?? null;

  async function loadCastMaster(projectId: string) {
    try {
      const { segments } = await api<{ segments: CastMasterSegment[] }>(
        `/projects/${projectId}/audio-segments?layer=composite_cast_master`
      );
      setCastMasterSegments(segments);
    } catch (err) {
      setCastMasterError((err as Error).message);
    }
  }

  useEffect(() => {
    if (activeProject) {
      loadCastMaster(activeProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  async function generateCastMaster() {
    if (!activeProject) return;
    setCastMasterBusy(true);
    setCastMasterError(null);
    setCastMasterResult(null);
    try {
      const result = await api<VoicingResult>(`/projects/${activeProject.id}/voicing`, { method: "POST" });
      setCastMasterResult(result);
      if (!result.ok) {
        setCastMasterError(result.reasoning);
      }
      await loadCastMaster(activeProject.id);
    } catch (err) {
      setCastMasterError((err as Error).message);
    } finally {
      setCastMasterBusy(false);
    }
  }

  async function loadShots(projectId: string) {
    try {
      const { scenes } = await api<{ scenes: SceneWithShots[] }>(`/projects/${projectId}/shots`);
      setScenesWithShots(scenes);
    } catch (err) {
      setCastingError((err as Error).message);
    }
  }

  useEffect(() => {
    if (activeProject) {
      loadShots(activeProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  async function submitShotReview(shotId: string, decision: "approved" | "flagged") {
    if (!activeProject) return;
    const comment = (reviewDrafts[shotId] ?? "").trim();
    if (decision === "flagged" && comment.length === 0) {
      setReviewError("Add a comment before flagging a shot.");
      return;
    }
    setReviewBusyShotId(shotId);
    setReviewError(null);
    try {
      await api(`/projects/${activeProject.id}/shots/${shotId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: comment.length > 0 ? comment : undefined })
      });
      setReviewDrafts((prev) => ({ ...prev, [shotId]: "" }));
      await loadShots(activeProject.id);
    } catch (err) {
      setReviewError((err as Error).message);
    } finally {
      setReviewBusyShotId(null);
    }
  }

  async function generateCasting() {
    if (!activeProject) return;
    setCastingBusy(true);
    setCastingError(null);
    setCastingResult(null);
    try {
      const result = await api<CastingResult>(`/projects/${activeProject.id}/casting`, { method: "POST" });
      setCastingResult(result);
      if (!result.ok) {
        setCastingError(result.reasoning);
      }
      await loadShots(activeProject.id);
    } catch (err) {
      setCastingError((err as Error).message);
    } finally {
      setCastingBusy(false);
    }
  }

  async function generateMedia() {
    if (!activeProject) return;
    setMediaGenBusy(true);
    setMediaGenError(null);
    setMediaGenResult(null);
    try {
      const result = await api<MediaGenerationResult>(`/projects/${activeProject.id}/media-generation`, {
        method: "POST"
      });
      setMediaGenResult(result);
      if (!result.ok) {
        setMediaGenError(result.reasoning);
      }
      await loadShots(activeProject.id);
    } catch (err) {
      setMediaGenError((err as Error).message);
    } finally {
      setMediaGenBusy(false);
    }
  }

  return (
    <main>
      <h1>HeartWord</h1>
      <p className="tagline">Scripture media for every heart language.</p>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Projects</h2>
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              {p.language} / {p.book} {p.chapter} — stage: {p.stage}, status: {p.status}
            </li>
          ))}
          {projects.length === 0 && <li className="empty">No projects yet.</li>}
        </ul>

        <form onSubmit={createProject}>
          <input
            aria-label="language"
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
          />
          <input
            aria-label="book"
            value={form.book}
            onChange={(e) => setForm({ ...form, book: e.target.value })}
          />
          <input
            aria-label="chapter"
            type="number"
            value={form.chapter}
            onChange={(e) => setForm({ ...form, chapter: Number(e.target.value) })}
          />
          <button type="submit">New project</button>
        </form>
      </section>

      <section>
        <h2>Character canon</h2>
        <ul>
          {characters.map((c) => (
            <li key={c.id}>
              {c.name} — {c.canon_status} ({c.region}
              {c.scope_chapter ? `, ${c.scope_book} ${c.scope_chapter}` : ""})
              {c.voice_provider ? ` — voice: ${c.voice_provider}` : ""}
            </li>
          ))}
          {characters.length === 0 && (
            <li className="empty">No characters yet — run `npm run db:seed-characters`.</li>
          )}
        </ul>
      </section>

      <section>
        <h2>Casting &amp; direction</h2>
        <p className="hint">
          For each scene, asks Gemini to plan shots -- which canon characters appear and what the action is --
          grounded in the chapter's English reference text. Costs one Gemini call per scene, so re-running
          replaces the existing shot plan rather than adding to it.
        </p>
        {!activeProject && <p className="empty">No project yet — create one above first.</p>}
        {activeProject && (
          <>
            <button type="button" onClick={generateCasting} disabled={castingBusy}>
              {castingBusy ? "Planning…" : "Generate shot plan"}
            </button>
            {castingResult && <p>{castingResult.reasoning}</p>}
            {castingError && <p className="error">{castingError}</p>}
            {scenesWithShots.map((scene) => (
              <div key={scene.id} className="scene-block">
                <h3>
                  Scene {scene.sequence}: {scene.verse_start}–{scene.verse_end}
                </h3>
                {scene.englishText && (
                  <blockquote style={{ margin: "4px 0", padding: "8px 12px", borderLeft: "3px solid #999" }}>
                    {scene.englishText}
                  </blockquote>
                )}
                {scene.reasoning && <p className="hint">{scene.reasoning}</p>}
                {scene.lighting_continuity && (
                  <p className="hint">
                    <em>Lighting/continuity:</em> {scene.lighting_continuity}
                  </p>
                )}
                <ul>
                  {scene.shots.map((shot) => (
                    <li key={shot.id}>
                      <strong>Shot {shot.sequence}</strong> ({shot.characters ?? "no characters"}) — {shot.action}
                      {(shot.framing || shot.camera_movement) && (
                        <span className="hint">
                          {" "}
                          [{shot.framing ?? "framing?"}, {shot.camera_movement ?? "movement?"}
                          {shot.needs_lip_sync ? `, lip-sync: ${shot.dialogue_character ?? "?"}` : ""}]
                        </span>
                      )}
                      {shot.verse_ref && <span className="hint"> ({shot.verse_ref})</span>}
                      {shot.coverage_plan === "covered_sequence" && (
                        <p className="hint">Needs covered-sequence coverage: {shot.coverage_notes}</p>
                      )}
                      {shot.keyframe_path && (
                        <div className="keyframe-review">
                          <img
                            src={`/media/${shot.keyframe_path}`}
                            alt={`Generated keyframe for shot ${shot.sequence}`}
                            title="Click to zoom"
                            style={{ maxWidth: 360, display: "block", marginTop: 4, cursor: "zoom-in" }}
                            onClick={() =>
                              setZoomedKeyframe({ path: shot.keyframe_path!, label: `Shot ${shot.sequence} — ${shot.action}` })
                            }
                          />
                          {shot.latest_human_note && (
                            <p className={shot.latest_human_note_resolved ? "hint" : "error"}>
                              {shot.latest_human_note_resolved ? "✓ " : "⚑ "}
                              {shot.latest_human_note}
                            </p>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
                            <button
                              type="button"
                              onClick={() => submitShotReview(shot.id, "approved")}
                              disabled={reviewBusyShotId === shot.id}
                            >
                              Approve
                            </button>
                            <textarea
                              aria-label={`Comment on shot ${shot.sequence}`}
                              placeholder="Comment (required to flag)…"
                              rows={2}
                              value={reviewDrafts[shot.id] ?? ""}
                              onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [shot.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => submitShotReview(shot.id, "flagged")}
                              disabled={reviewBusyShotId === shot.id}
                            >
                              Flag
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                  {scene.shots.length === 0 && <li className="empty">No shots planned yet.</li>}
                </ul>
              </div>
            ))}
            {reviewError && <p className="error">{reviewError}</p>}
          </>
        )}
      </section>

      <section>
        <h2>Media generation</h2>
        <p className="hint">
          Generates one keyframe still image per shot via Nano Banana (Gemini) -- Nano Banana Pro for any shot
          needing lip-sync, standard tier otherwise -- grounded in each visible character's approved canon
          reference image. Costs one real Gemini image call per shot not already generated; re-running reuses
          any shot whose keyframe already exists on disk. Still images only for now -- no video clips yet.
        </p>
        {!activeProject && <p className="empty">No project yet — create one above first.</p>}
        {activeProject && (
          <>
            <button type="button" onClick={generateMedia} disabled={mediaGenBusy}>
              {mediaGenBusy ? "Generating…" : "Generate media"}
            </button>
            {mediaGenResult && <p>{mediaGenResult.reasoning}</p>}
            {mediaGenError && <p className="error">{mediaGenError}</p>}
          </>
        )}
      </section>

      <section>
        <h2>Voice casting</h2>
        <p className="hint">
          Voices come from your ElevenLabs account (needs <code>ELEVENLABS_API_KEY</code> in{" "}
          <code>.env</code>). Pick a voice, listen to the preview, then Approve to save it. Only
          characters with attributed spoken lines in this chapter are listed here.
        </p>
        {voicesError && <p className="error">Couldn't load ElevenLabs voices: {voicesError}</p>}
        <ul>
          {speakingCharacters.map((c) => {
            const selected = pendingSelection[c.id] ?? c.voice_id ?? "";
            const selectedVoice = voices.find((v) => v.voiceId === selected);
            const approvedVoiceName =
              c.voice_id && voices.find((v) => v.voiceId === c.voice_id)?.name;

            return (
              <li key={c.id} className="voice-cast-row">
                <strong>{c.name}</strong>{" "}
                {c.voice_id ? (
                  <span className="approved">approved: {approvedVoiceName ?? c.voice_id}</span>
                ) : (
                  <span className="empty">no voice yet</span>
                )}
                <div>
                  <select
                    aria-label={`voice for ${c.name}`}
                    value={selected}
                    onChange={(e) => setPendingSelection({ ...pendingSelection, [c.id]: e.target.value })}
                  >
                    <option value="">— choose a voice —</option>
                    {voices.map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>
                        {v.name}
                        {v.category ? ` (${v.category})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedVoice &&
                    (selectedVoice.previewUrl ? (
                      <audio
                        controls
                        src={selectedVoice.previewUrl}
                        style={{ height: 28, verticalAlign: "middle" }}
                      />
                    ) : (
                      <span className="empty">no preview available for this voice</span>
                    ))}
                  <button type="button" disabled={!selected} onClick={() => approveVoice(c.id, selected)}>
                    Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Composite cast master</h2>
        <p className="hint">
          Re-voices each speaking segment of the real Hatam reading into its approved character voice via
          ElevenLabs speech-to-speech (narration carries through unchanged). Costs ElevenLabs credits per
          newly re-voiced segment, so re-running this reuses any clip already generated instead of
          regenerating it.
        </p>
        {!activeProject && <p className="empty">No project yet — create one above first.</p>}
        {activeProject && (
          <>
            <button type="button" onClick={generateCastMaster} disabled={castMasterBusy}>
              {castMasterBusy ? "Generating…" : "Generate composite cast master"}
            </button>
            {castMasterResult && <p>{castMasterResult.reasoning}</p>}
            {castMasterError && <p className="error">{castMasterError}</p>}
            <ul>
              {castMasterSegments.map((s) => (
                <li key={s.id}>
                  <strong>{s.verse_ref ?? "—"}</strong> — {s.speaker_name ?? "narration"}
                  <div>
                    <audio controls src={`/media/${s.source_path}`} style={{ height: 28, verticalAlign: "middle" }} />
                  </div>
                </li>
              ))}
              {castMasterSegments.length === 0 && (
                <li className="empty">Not generated yet — click the button above.</li>
              )}
            </ul>
          </>
        )}
      </section>

      {zoomedKeyframe && (
        <div
          role="button"
          aria-label="Close zoomed image"
          onClick={() => setZoomedKeyframe(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            cursor: "zoom-out",
            padding: 24
          }}
        >
          <img
            src={`/media/${zoomedKeyframe.path}`}
            alt={zoomedKeyframe.label}
            style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain" }}
          />
          <p style={{ color: "#fff", marginTop: 12 }}>{zoomedKeyframe.label} — click anywhere to close</p>
        </div>
      )}
    </main>
  );
}
