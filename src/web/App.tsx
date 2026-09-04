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
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/projects", { method: "POST", body: JSON.stringify(form) });
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
    </main>
  );
}
