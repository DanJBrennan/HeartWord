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
}

interface Voice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
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

function matchesFilter(v: Voice, filter: string): boolean {
  if (!filter.trim()) return true;
  const needle = filter.trim().toLowerCase();
  const haystack = [v.name, v.category ?? "", v.description ?? "", ...Object.values(v.labels)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ language: "hatam", book: "mark", chapter: 2 });

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  // "BVET" pre-filled because that's the ElevenLabs voice set Dan built for
  // this project (2026-09-05) -- clear it to browse the whole account.
  const [voiceFilter, setVoiceFilter] = useState("BVET");
  const [pendingSelection, setPendingSelection] = useState<Record<string, string>>({});

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
        <h2>Voice casting</h2>
        <p className="hint">
          Voices come from your ElevenLabs account (needs <code>ELEVENLABS_API_KEY</code> in{" "}
          <code>.env</code>). ElevenLabs doesn't have a real "voice group" API, so this filter is just a
          text match on name/category/labels — try "BVET" for the set you built for this project, or clear
          it to browse everything.
        </p>
        {voicesError && <p className="error">Couldn't load ElevenLabs voices: {voicesError}</p>}
        <input
          aria-label="voice filter"
          placeholder="Filter voices (e.g. BVET)"
          value={voiceFilter}
          onChange={(e) => setVoiceFilter(e.target.value)}
        />
        <ul>
          {characters.map((c) => {
            const filtered = voices.filter((v) => matchesFilter(v, voiceFilter));
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
                    {filtered.map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>
                        {v.name}
                        {v.category ? ` (${v.category})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedVoice?.previewUrl && (
                    <audio controls src={selectedVoice.previewUrl} style={{ height: 28, verticalAlign: "middle" }} />
                  )}
                  <button type="button" disabled={!selected} onClick={() => approveVoice(c.id, selected)}>
                    Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
