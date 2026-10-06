import { useEffect, useRef, useState } from "react";
import { ProductionCrew } from "./ProductionCrew";
import { MediaLibrary } from "./MediaLibrary";
import { BoundedIntervalAudio } from "./BoundedIntervalAudio";
import { Dailies } from "./Dailies";

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
interface SourceSegment { id:string; source_path:string; start_ms:number; end_ms:number; verse_ref:string|null; automatedVerseRef?:string|null; alignmentStatus?:string; alignmentMethod?:string; textMatchScore?:number|null; assignedText?:string; editorialTitle?:string; crossReferenceText?:string; editorialNextVerseRef?:string|null; reviewerName?:string; }

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
interface ImageGenerationCost { scene_sequence:number; shot_sequence:number; shot_id:string; attempt_id:string; provider:string; model:string; operation:string; status:string; cost_usd:number; created_at:number; }
interface ImageGenerationCosts { attempts:ImageGenerationCost[]; totalUsd:number; }
interface VideoGenerationCosts { attempts:ImageGenerationCost[]; totalUsd:number; }

interface PipelineRunResult {
  stoppedAt?: string;
  results: Array<{ stage: string; ok: boolean; reasoning: string }>;
}
interface CanonReadiness { planned: boolean; allApproved: boolean; needed: Array<{ id: string; name: string; canon_status: string; has_approved_version: number }>; gaps: Array<{ id: string; name: string; canon_status: string; has_approved_version: number }>; }

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
  latest_qc_note: string | null;
  latest_qc_created_at: number | null;
  latest_generation_status: string | null;
  reuse_candidate_notes?: string | null;
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

interface ChapterIntroPlan {
  titleCard: { title: string; language: string; durationMs: number; audio: string };
  shots: Array<{ role: string; description: string; reason: string; evidence: string; durationMs: number; endpointRule: string; audio: string }>;
  sourceClockStartMs: number;
  reasoning: string;
  status: "proposed" | "needs_review";
  reviewNotes: string[];
}

interface ChapterEndingPlan {
  nextChapterRef: string | null;
  shots: Array<{ role: string; description: string; reason: string; currentEvidence: string; nextEvidence: string; durationMs: number; audio: string }>;
  sourceClockEndMs: number;
  postSourceDurationMs: number;
  reasoning: string;
  status: "proposed" | "needs_review";
  reviewNotes: string[];
}

const QC_STATUS_LABELS: Record<string, string> = {
  accepted: "✓ QC passed",
  retry_same: "⟳ QC: flagged for retry",
  retry_modified: "⟳ QC: flagged, needs a revised prompt",
  escalate: "⚠ QC: escalated (Critic found a severe issue)",
  hold_for_review: "⚑ QC: held for human review"
};

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProjectRef = useRef<string | null>(null);
  const selectionEpochRef = useRef(0);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Record<string, string>>({});

  const [castMasterSegments, setCastMasterSegments] = useState<CastMasterSegment[]>([]);
  const [castMasterError, setCastMasterError] = useState<string | null>(null);
  const [castMasterBusy, setCastMasterBusy] = useState(false);
  const [castMasterResult, setCastMasterResult] = useState<VoicingResult | null>(null);

  const [scenesWithShots, setScenesWithShots] = useState<SceneWithShots[]>([]);
  const [introPlan, setIntroPlan] = useState<ChapterIntroPlan | null>(null);
  const [endingPlan, setEndingPlan] = useState<ChapterEndingPlan | null>(null);
  const [castingError, setCastingError] = useState<string | null>(null);
  const [castingBusy, setCastingBusy] = useState(false);
  const [castingResult, setCastingResult] = useState<CastingResult | null>(null);
  const [mediaGenError, setMediaGenError] = useState<string | null>(null);
  const [mediaGenBusy, setMediaGenBusy] = useState(false);
  const [mediaGenResult, setMediaGenResult] = useState<MediaGenerationResult | null>(null);
  const [imageGenerationCosts, setImageGenerationCosts] = useState<ImageGenerationCosts | null>(null);
  const [videoGenerationCosts, setVideoGenerationCosts] = useState<VideoGenerationCosts | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [reviewBusyShotId, setReviewBusyShotId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [zoomedKeyframe, setZoomedKeyframe] = useState<{ path: string; label: string } | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineRunResult | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [canonReadiness, setCanonReadiness] = useState<CanonReadiness | null>(null);
  const [sourceSegments, setSourceSegments] = useState<SourceSegment[]>([]);

  async function refresh() {
    try {
      const [{ projects }, { characters }] = await Promise.all([
        api<{ projects: Project[] }>("/projects"),
        api<{ characters: Character[] }>("/characters")
      ]);
      setProjects(projects);
      if (!selectedProjectRef.current || !projects.some((project) => project.id === selectedProjectRef.current)) { selectedProjectRef.current = projects[0]?.id ?? null; setSelectedProjectId(selectedProjectRef.current); }
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
      const { project } = await api<{project:Project}>("/projects", { method: "POST", body: JSON.stringify(form) });
      await refresh();
      selectProject(project.id);
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

  const activeProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  function selectProject(id: string) { selectionEpochRef.current++; selectedProjectRef.current = id; setSelectedProjectId(id); setScenesWithShots([]); setIntroPlan(null); setEndingPlan(null); setCastMasterSegments([]); setReviewDrafts({}); setReviewError(null); setCastingResult(null); setCastingError(null); setMediaGenResult(null); setMediaGenError(null); setImageGenerationCosts(null); setVideoGenerationCosts(null); setCastMasterResult(null); setCastMasterError(null); setCastingBusy(false); setMediaGenBusy(false); setCastMasterBusy(false); setReviewBusyShotId(null); setZoomedKeyframe(null); setPipelineBusy(false); setPipelineResult(null); setPipelineError(null); setCanonReadiness(null); }

  async function startChapterPreparation() {
    if (!activeProject || pipelineBusy) return;
    const projectId = activeProject.id, epoch = selectionEpochRef.current;
    setPipelineBusy(true); setPipelineResult(null); setPipelineError(null);
    try {
      const result = await api<PipelineRunResult>(`/projects/${projectId}/run`, { method: "POST" });
      if (selectedProjectRef.current !== projectId || selectionEpochRef.current !== epoch) return;
      setPipelineResult(result);
      await refresh();
      await Promise.all([loadShots(projectId), loadCastMaster(projectId), loadCanonReadiness(projectId)]);
    } catch (err) {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setPipelineError((err as Error).message);
    } finally {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setPipelineBusy(false);
    }
  }

  async function loadCastMaster(projectId: string) {
    try {
      const { segments } = await api<{ segments: CastMasterSegment[] }>(
        `/projects/${projectId}/audio-segments?layer=composite_cast_master`
      );
      if (selectedProjectRef.current === projectId) setCastMasterSegments(segments);
    } catch (err) {
      if (selectedProjectRef.current === projectId) setCastMasterError((err as Error).message);
    }
  }

  useEffect(() => {
    if (activeProject) {
      loadCastMaster(activeProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  async function loadCanonReadiness(projectId: string) {
    try {
      const result = await api<CanonReadiness>(`/projects/${projectId}/canon-readiness`);
      if (selectedProjectRef.current === projectId) setCanonReadiness(result);
    } catch {
      if (selectedProjectRef.current === projectId) setCanonReadiness(null);
    }
  }

  async function loadSourceSegments(projectId: string) {
    try { const result=await api<{segments:SourceSegment[]}>(`/projects/${projectId}/audio-segments?layer=original_reading`); if(selectedProjectRef.current===projectId) setSourceSegments(result.segments); }
    catch { if(selectedProjectRef.current===projectId) setSourceSegments([]); }
  }

  async function loadImageGenerationCosts(projectId: string) {
    try { const result=await api<ImageGenerationCosts>(`/projects/${projectId}/image-generation-costs`); if(selectedProjectRef.current===projectId) setImageGenerationCosts(result); }
    catch { if(selectedProjectRef.current===projectId) setImageGenerationCosts(null); }
  }
  async function loadVideoGenerationCosts(projectId: string) {
    try { const result=await api<VideoGenerationCosts>(`/projects/${projectId}/video-generation-costs`); if(selectedProjectRef.current===projectId) setVideoGenerationCosts(result); }
    catch { if(selectedProjectRef.current===projectId) setVideoGenerationCosts(null); }
  }

  useEffect(() => { if (activeProject) void loadCanonReadiness(activeProject.id); }, [activeProject?.id]);
  useEffect(() => { if (activeProject) void loadSourceSegments(activeProject.id); }, [activeProject?.id]);
  useEffect(() => { if (activeProject) void loadImageGenerationCosts(activeProject.id); }, [activeProject?.id]);
  useEffect(() => { if (activeProject) void loadVideoGenerationCosts(activeProject.id); }, [activeProject?.id]);

  async function generateCastMaster() {
    if (!activeProject) return;
    const projectId = activeProject.id, epoch = selectionEpochRef.current;
    setCastMasterBusy(true);
    setCastMasterError(null);
    setCastMasterResult(null);
    try {
      const result = await api<VoicingResult>(`/projects/${projectId}/voicing`, { method: "POST" });
      if (selectedProjectRef.current !== projectId || selectionEpochRef.current !== epoch) return;
      setCastMasterResult(result);
      if (!result.ok) {
        setCastMasterError(result.reasoning);
      }
      await loadCastMaster(projectId);
    } catch (err) {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setCastMasterError((err as Error).message);
    } finally {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setCastMasterBusy(false);
    }
  }

  async function loadShots(projectId: string) {
    try {
      const { scenes, introPlan, endingPlan } = await api<{ scenes: SceneWithShots[]; introPlan: ChapterIntroPlan | null; endingPlan: ChapterEndingPlan | null }>(`/projects/${projectId}/shots`);
      if (selectedProjectRef.current === projectId) { setScenesWithShots(scenes); setIntroPlan(introPlan); setEndingPlan(endingPlan); }
    } catch (err) {
      if (selectedProjectRef.current === projectId) setCastingError((err as Error).message);
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
    const projectId = activeProject.id, epoch = selectionEpochRef.current;
    setCastingBusy(true);
    setCastingError(null);
    setCastingResult(null);
    try {
      const result = await api<CastingResult>(`/projects/${projectId}/casting`, { method: "POST" });
      if (selectedProjectRef.current !== projectId || selectionEpochRef.current !== epoch) return;
      setCastingResult(result);
      if (!result.ok) {
        setCastingError(result.reasoning);
      }
      await Promise.all([loadShots(projectId), loadCanonReadiness(projectId)]);
    } catch (err) {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setCastingError((err as Error).message);
    } finally {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setCastingBusy(false);
    }
  }

  async function generateMedia() {
    if (!activeProject) return;
    const projectId = activeProject.id, epoch = selectionEpochRef.current;
    setMediaGenBusy(true);
    setMediaGenError(null);
    setMediaGenResult(null);
    try {
      const result = await api<MediaGenerationResult>(`/projects/${projectId}/media-generation`, {
        method: "POST"
      });
      if (selectedProjectRef.current !== projectId || selectionEpochRef.current !== epoch) return;
      setMediaGenResult(result);
      if (!result.ok) {
        setMediaGenError(result.reasoning);
      }
      await Promise.all([loadShots(projectId), loadImageGenerationCosts(projectId), loadVideoGenerationCosts(projectId)]);
    } catch (err) {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setMediaGenError((err as Error).message);
    } finally {
      if (selectedProjectRef.current === projectId && selectionEpochRef.current === epoch) setMediaGenBusy(false);
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
              <button type="button" onClick={() => selectProject(p.id)} aria-pressed={activeProject?.id === p.id}>Open {p.language} / {p.book} {p.chapter}</button> — stage: {p.stage}, status: {p.status}
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
          <button type="submit">Create or open chapter workspace</button>
        </form>
        {activeProject && <p className="hint">Open workspace: {activeProject.language} / {activeProject.book} {activeProject.chapter}. A new chapter begins empty and never inherits another chapter’s shots, takes, timing, or provider work.</p>}
      </section>

      <section>
        <h2>Chapter preparation</h2>
        {!activeProject && <p className="empty">Open a chapter workspace first.</p>}
        {activeProject && <>
          <p className="hint">Start with the verified chapter inputs. HeartWord will stop here when source alignment or another required producer review is needed; it does not skip those safeguards.</p>
          <button type="button" onClick={() => void startChapterPreparation()} disabled={pipelineBusy}>
            {pipelineBusy ? "Preparing chapter…" : "Start ingestion and chapter preparation"}
          </button>
          {pipelineError && <p className="error">{pipelineError}</p>}
          {pipelineResult && <div aria-live="polite">
            <p className={pipelineResult.stoppedAt ? "hint" : "approved"}>
              {pipelineResult.stoppedAt ? `Preparation paused at ${pipelineResult.stoppedAt.replaceAll("_", " ")}. Review the reason below before continuing.` : "Chapter preparation completed."}
            </p>
            <ol>{pipelineResult.results.map((result) => <li key={result.stage}><strong>{result.stage.replaceAll("_", " ")}</strong> — {result.reasoning}</li>)}</ol>
          </div>}
          {sourceSegments.length > 0 && <details><summary>Source alignment intervals — listen to anything marked uncertain</summary><ul>{sourceSegments.map(segment => <li key={segment.id}><code>{(segment.start_ms/1000).toFixed(2)}–{(segment.end_ms/1000).toFixed(2)}s</code> · {segment.verse_ref ?? (segment.editorialTitle ? "editorial material" : "unassigned")} · {segment.alignmentStatus ?? "Legacy alignment — detailed evidence not recorded"}{segment.reviewerName ? ` · reviewed by ${segment.reviewerName}` : ""}{segment.assignedText ? ` · ${segment.assignedText}` : ""}{segment.editorialTitle ? ` · title: ${segment.editorialTitle}` : ""}{segment.crossReferenceText ? ` · references: (${segment.crossReferenceText})` : ""}{segment.editorialNextVerseRef ? ` · next Scripture begins ${segment.editorialNextVerseRef}` : ""}{segment.automatedVerseRef ? ` · automated span was ${segment.automatedVerseRef}` : ""}{segment.textMatchScore !== null && segment.textMatchScore !== undefined ? ` · local text-match score ${segment.textMatchScore}/100` : ""}<br /><BoundedIntervalAudio src={`/media/${segment.source_path}`} startMs={segment.start_ms} endMs={segment.end_ms} /></li>)}</ul></details>}
        </>}
      </section>

      <details key={activeProject?.id ?? "no-project"} open={Boolean(canonReadiness?.planned && !canonReadiness.allApproved)}>
        <summary>{canonReadiness?.allApproved ? "All identified chapter characters are approved." : canonReadiness?.planned ? `Character canon needs attention: ${canonReadiness.gaps.length} gap${canonReadiness.gaps.length === 1 ? "" : "s"}.` : "Character canon — needs will be checked after storyboard planning."}</summary>
      <section>
        <h2>Character canon</h2>
        {canonReadiness?.planned && !canonReadiness.allApproved && <p className="error">Resolve before media generation: {canonReadiness.gaps.map(character => `${character.name}${character.canon_status !== "approved" ? " is not approved" : " has no approved version"}`).join("; ")}.</p>}
        {canonReadiness?.allApproved && <p className="approved">All characters identified by this chapter's planned shots have an approved canon record and version.</p>}
        {!canonReadiness?.planned && <p className="hint">No storyboard cast is recorded for this chapter yet. This list remains available, but it does not establish chapter readiness.</p>}
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
      </details>

      <section>
        <h2>Casting &amp; direction</h2>
        <p className="hint">
          Creates the initial shots from the chapter’s reference text, then brings in the filmmaking specialists.
          Reviewing an existing storyboard preserves its shots and approved takes. Provider charges apply.
        </p>
        {!activeProject && <p className="empty">No project yet — create one above first.</p>}
        {activeProject && (
          <>
            <ProductionCrew key={activeProject.id} projectId={activeProject.id} onUpdated={() => void loadShots(activeProject.id)} />
            {castingResult && <p>{castingResult.reasoning}</p>}
            {castingError && <p className="error">{castingError}</p>}
            {introPlan && <div className="scene-block">
              <h3>Chapter opening — {introPlan.status.replaceAll("_", " ")}</h3>
              <p>{introPlan.titleCard.title} · {introPlan.titleCard.language} title card ({(introPlan.titleCard.durationMs / 1000).toFixed(1)}s), then {introPlan.shots.length} pre-story location shot{introPlan.shots.length === 1 ? "" : "s"}. Natural location ambience; source recording begins at {(introPlan.sourceClockStartMs / 1000).toFixed(1)}s.</p>
              <p className="hint">{introPlan.reasoning}</p>
              {introPlan.reviewNotes.map((note, index) => <p className="error" key={index}>{note}</p>)}
              <ol>{introPlan.shots.map((shot, index) => <li key={index}><strong>{shot.role}</strong> ({(shot.durationMs / 1000).toFixed(1)}s) — {shot.description} Purpose: {shot.reason} Evidence: “{shot.evidence}”. {shot.endpointRule === "match_adjacent_frames" ? "Match its first/last frames to the adjacent shots. " : ""}Media is not assigned; reuse requires target-shot review.</li>)}</ol>
            </div>}
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
                      {shot.reuse_candidate_notes && <p className="hint">Reusable media candidate: {shot.reuse_candidate_notes}</p>}
                      {shot.keyframe_path && (
                        <div className="keyframe-review">
                          <img
                            src={`/media/${shot.keyframe_path}`}
                            loading="lazy"
                            decoding="async"
                            alt={`Generated keyframe for shot ${shot.sequence}`}
                            title="Click to zoom"
                            style={{ maxWidth: 360, display: "block", marginTop: 4, cursor: "zoom-in" }}
                            onClick={() =>
                              setZoomedKeyframe({ path: shot.keyframe_path!, label: `Shot ${shot.sequence} — ${shot.action}` })
                            }
                          />
                          {shot.latest_qc_note && (
                            <details className="qc-review" style={{ marginTop: 4 }}>
                              <summary
                                className={shot.latest_generation_status === "accepted" ? "hint" : "error"}
                                style={{ cursor: "pointer" }}
                              >
                                {QC_STATUS_LABELS[shot.latest_generation_status ?? ""] ?? "QC review available"}
                                {shot.latest_qc_created_at && (
                                  <span className="hint"> — {new Date(shot.latest_qc_created_at).toLocaleString()}</span>
                                )}
                              </summary>
                              <div style={{ whiteSpace: "pre-wrap", maxWidth: 480, fontSize: "0.9em" }}>
                                {shot.latest_qc_note}
                              </div>
                            </details>
                          )}
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
            {endingPlan && <div className="scene-block">
              <h3>Chapter ending — {endingPlan.status.replaceAll("_", " ")}</h3>
              <p>After the complete source recording ({(endingPlan.sourceClockEndMs / 1000).toFixed(1)}s), {endingPlan.shots.length} wordless transition shot{endingPlan.shots.length === 1 ? "" : "s"} may hint at {endingPlan.nextChapterRef ?? "the next chapter"} for {(endingPlan.postSourceDurationMs / 1000).toFixed(1)}s. Natural ambience; optional score.</p>
              <p className="hint">{endingPlan.reasoning} Inferred movement is visual staging, not narrated Scripture.</p>
              {endingPlan.reviewNotes.map((note, index) => <p className="error" key={index}>{note}</p>)}
              <ol>{endingPlan.shots.map((shot, index) => <li key={index}><strong>{shot.role}</strong> ({(shot.durationMs / 1000).toFixed(1)}s) — {shot.description} Purpose: {shot.reason} Current: “{shot.currentEvidence}”; next: “{shot.nextEvidence}”. Media is not assigned; reuse requires target-shot review.</li>)}</ol>
            </div>}
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
            <h3>Image-generation cost</h3>
            <p className="hint">Every retained image-generation attempt is listed, including retries and held candidates. Video and lip-sync costs are not included here.</p>
            {imageGenerationCosts && imageGenerationCosts.attempts.length > 0 ? <table>
              <thead><tr><th>Scene</th><th>Shot</th><th>Image model</th><th>Status</th><th>Cost</th></tr></thead>
              <tbody>{imageGenerationCosts.attempts.map(attempt => <tr key={attempt.attempt_id}><td>Scene {attempt.scene_sequence}</td><td>Shot {attempt.shot_sequence}</td><td>{attempt.model}</td><td>{attempt.status.replaceAll("_", " ")}</td><td>${attempt.cost_usd.toFixed(2)}</td></tr>)}</tbody>
              <tfoot><tr><th colSpan={4}>Total image-generation cost</th><th>${imageGenerationCosts.totalUsd.toFixed(2)}</th></tr></tfoot>
            </table> : <p className="empty">No image-generation attempts recorded for this chapter. Total: $0.00.</p>}
            <h3>Video-generation cost</h3>
            <p className="hint">Every retained draft and final-video attempt is listed, including candidates awaiting automated or producer review.</p>
            {videoGenerationCosts && videoGenerationCosts.attempts.length > 0 ? <table>
              <thead><tr><th>Scene</th><th>Shot</th><th>Video model</th><th>Operation</th><th>Status</th><th>Cost</th></tr></thead>
              <tbody>{videoGenerationCosts.attempts.map(attempt => <tr key={attempt.attempt_id}><td>Scene {attempt.scene_sequence}</td><td>Shot {attempt.shot_sequence}</td><td>{attempt.model}</td><td>{attempt.operation.replaceAll("_", " ")}</td><td>{attempt.status.replaceAll("_", " ")}</td><td>${attempt.cost_usd.toFixed(2)}</td></tr>)}</tbody>
              <tfoot><tr><th colSpan={5}>Total video-generation cost</th><th>${videoGenerationCosts.totalUsd.toFixed(2)}</th></tr></tfoot>
            </table> : <p className="empty">No video-generation attempts recorded for this chapter. Total: $0.00.</p>}
          </>
        )}
      </section>

      <details onToggle={(event) => setMediaLibraryOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>Reusable media library</summary>
        {mediaLibraryOpen && <MediaLibrary key={activeProject?.id ?? "no-project"} projectId={activeProject?.id ?? null} targets={scenesWithShots.flatMap(scene => scene.shots.map(shot => ({ id:shot.id, sequence:shot.sequence, action:shot.action })))} />}
      </details>

      {activeProject && <details>
        <summary>Generation dailies and rolling reel</summary>
        <p className="hint">Each retained candidate is shown with its video, five sampled positions, approved keyframe, provider, cost, critic record, and timeline placement. The rolling reel begins only after new restart-pilot clips are accepted.</p>
        <Dailies projectId={activeProject.id} />
      </details>}

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
