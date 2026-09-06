import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJson, type GeminiJsonSchema } from "../../server/providers/gemini.js";
import type { ProjectRow } from "../ingestion/index.js";
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import type { Stage } from "../types.js";

interface SceneRow {
  id: string;
  sequence: number;
  verse_start: string;
  verse_end: string;
}

interface CanonCharacterRow {
  id: string;
  name: string;
  notes: string | null;
}

interface AttributedSegmentRow {
  speaker_character_id: string | null;
  speaker_name: string | null;
  verse_ref: string | null;
}

interface GeminiShot {
  action: string;
  characterNames: string[];
}

interface GeminiSceneResponse {
  reasoning: string;
  shots: GeminiShot[];
}

const SHOT_RESPONSE_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    reasoning: {
      type: "string",
      description:
        "One paragraph explaining how you broke this scene into shots and why each character appears where they do."
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              "What happens in this shot -- blocking/action grounded only in the verse text given, not invented dialogue or events."
          },
          characterNames: {
            type: "array",
            items: { type: "string" },
            description: "Exact names of canon characters visible in this shot, copied verbatim from the provided list."
          }
        },
        required: ["action", "characterNames"]
      }
    }
  },
  required: ["reasoning", "shots"]
};

function resolveEnglishReferencePath(project: ProjectRow): string {
  const chapterDir = `${project.book}-${project.chapter}`;
  return join(getDataDir(), "assets", "reference", "english", chapterDir, `${chapterDir}-text.docx`);
}

function buildScenePrompt(
  project: ProjectRow,
  scene: SceneRow,
  verseText: string,
  attributedSpeakers: string[],
  canonCharacters: CanonCharacterRow[]
): string {
  const characterList = canonCharacters.map((c) => `- ${c.name}${c.notes ? `: ${c.notes}` : ""}`).join("\n");

  return `You are directing a scene for a Scripture video adaptation of ${project.book} ${project.chapter} (${scene.verse_start}-${scene.verse_end}).

The English reference text for this scene (the source of truth for what happens -- do not add events, dialogue, or details beyond what is written here):
"""
${verseText}
"""

Characters already confirmed to speak in this scene from audio analysis: ${
    attributedSpeakers.length > 0 ? attributedSpeakers.join(", ") : "none"
  }.

Available canon characters for this project (use ONLY these names, copied exactly):
${characterList}

Break this scene into a sequence of shots (a shot is one unit of blocking/action -- start a new shot when the framing, action, or which characters are the focus changes). For each shot, describe the action in one or two sentences grounded strictly in the text above, and list which canon characters are visible in that shot (include silent/background characters where the text implies their presence -- e.g. the crowd, or the men carrying the mat -- even if they don't speak). Do not invent theological content, dialogue, or narrative beyond what the text says: you are deciding HOW the text is shown, not adding to WHAT it says.`;
}

/**
 * Stage 3: Casting & direction -- for each scene, decides how to break it
 * into shots, which canon characters appear in each, and what the action
 * is. v1 runs this as ONE Gemini planning call per scene (see the "v1
 * simplification" callout in docs/ARCHITECTURE.md) rather than the full
 * multi-agent negotiation in docs/design/shot-planning.md.
 *
 * Grounds every call in the chapter's real English reference text (not
 * the Hatam source, which an LLM can't read, and not invented content --
 * see NON_GOALS.md: "Scene/action decisions fill in *how* the text is
 * shown, not *what* the text says"). Any character name Gemini returns
 * that isn't an exact match to the supplied canon list is dropped and
 * flagged in review_notes rather than silently kept -- a hallucinated
 * name is exactly the kind of thing AGENTS.md asks stages to log for a
 * human to catch, not paper over.
 *
 * Idempotent: re-running replaces this project's shots/shot_characters
 * and scene reasoning rather than appending duplicates.
 */
export const runCasting: Stage = async (projectId) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `Casting failed: no project with id ${projectId}.` };
  }

  const scenes = db
    .prepare(`SELECT id, sequence, verse_start, verse_end FROM scenes WHERE project_id = ? ORDER BY sequence`)
    .all(project.id) as unknown as SceneRow[];

  if (scenes.length === 0) {
    return { ok: false, reasoning: "Casting failed: no scenes found -- run scene breakdown (stage 2) first." };
  }

  const referencePath = resolveEnglishReferencePath(project);
  if (!existsSync(referencePath)) {
    return {
      ok: false,
      reasoning:
        `Casting failed: no English reference text found at ${referencePath}. Stage 3 grounds its shot ` +
        "descriptions in this text (see NON_GOALS.md) rather than the Hatam source, which an LLM can't read directly."
    };
  }
  const verses = parseSourceTextByVerse(referencePath);

  const canonCharacters = db
    .prepare(
      `SELECT c.id, c.name, cv.notes
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id
       WHERE cv.status = 'approved'
         AND (c.scope_kind = 'global' OR (c.scope_book = ? AND (c.scope_chapter IS NULL OR c.scope_chapter = ?)))
       ORDER BY c.name`
    )
    .all(project.book, project.chapter) as unknown as CanonCharacterRow[];

  if (canonCharacters.length === 0) {
    return { ok: false, reasoning: "Casting failed: no approved canon characters found for this project." };
  }
  const characterByName = new Map(canonCharacters.map((c) => [c.name.trim().toLowerCase(), c]));

  const attributedSegments = db
    .prepare(
      `SELECT a.speaker_character_id, c.name AS speaker_name, a.verse_ref
       FROM audio_segments a
       LEFT JOIN characters c ON c.id = a.speaker_character_id
       WHERE a.project_id = ? AND a.layer = 'original_reading' AND a.speaker_character_id IS NOT NULL`
    )
    .all(project.id) as unknown as AttributedSegmentRow[];

  const now = Date.now();
  const unresolvedNames = new Set<string>();
  let totalShots = 0;

  db.exec("BEGIN TRANSACTION");
  try {
    // Idempotent re-run: clear this project's existing shots (and the
    // shot_characters rows that reference them) before regenerating.
    db.prepare(
      `DELETE FROM shot_characters WHERE shot_id IN (SELECT id FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?))`
    ).run(project.id);
    db.prepare(`DELETE FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)`).run(project.id);
    db.prepare(
      `DELETE FROM review_notes WHERE project_id = ? AND subject_type = 'project' AND source = 'qc' AND note LIKE 'Casting:%'`
    ).run(project.id);

    const insertShot = db.prepare(
      `INSERT INTO shots (id, scene_id, sequence, action, status, created_at) VALUES (?, ?, ?, ?, 'planned', ?)`
    );
    const insertShotCharacter = db.prepare(`INSERT INTO shot_characters (shot_id, character_id) VALUES (?, ?)`);
    const updateSceneReasoning = db.prepare(`UPDATE scenes SET reasoning = ? WHERE id = ?`);

    for (const scene of scenes) {
      const sceneStart = parseVerseRange(scene.verse_start).start;
      const sceneEnd = parseVerseRange(scene.verse_end).end;
      const sceneVerses = verses.filter((v) => v.verse >= sceneStart && v.verse <= sceneEnd);
      const verseText = sceneVerses.map((v) => `${v.verse}. ${v.text}`).join(" ");

      const attributedSpeakers = [
        ...new Set(
          attributedSegments
            .filter((s) => {
              if (!s.verse_ref) return false;
              const { start, end } = parseVerseRange(s.verse_ref);
              return start <= sceneEnd && end >= sceneStart;
            })
            .map((s) => s.speaker_name)
            .filter((n): n is string => n !== null)
        )
      ];

      const prompt = buildScenePrompt(project, scene, verseText, attributedSpeakers, canonCharacters);
      const response = await generateJson<GeminiSceneResponse>(prompt, SHOT_RESPONSE_SCHEMA);

      response.shots.forEach((shot, index) => {
        const shotId = randomUUID();
        insertShot.run(shotId, scene.id, index + 1, shot.action, now);
        totalShots++;

        for (const rawName of shot.characterNames) {
          const match = characterByName.get(rawName.trim().toLowerCase());
          if (!match) {
            unresolvedNames.add(rawName);
            continue;
          }
          insertShotCharacter.run(shotId, match.id);
        }
      });

      updateSceneReasoning.run(response.reasoning, scene.id);
    }

    if (unresolvedNames.size > 0) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(
        randomUUID(),
        project.id,
        project.id,
        `Casting: Gemini named character(s) not in the canon list, dropped from their shot(s): ${[...unresolvedNames].join(", ")}.`,
        now
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return { ok: false, reasoning: `Casting failed: ${(err as Error).message}` };
  }

  return {
    ok: true,
    reasoning:
      `Cast and directed ${scenes.length} scene(s) for ${project.book} ${project.chapter}: ${totalShots} shots ` +
      `planned via Gemini, grounded in the English reference text.` +
      (unresolvedNames.size > 0
        ? ` ${unresolvedNames.size} character name(s) Gemini returned didn't match the canon list and were dropped ` +
          "-- flagged in review_notes."
        : "")
  };
};
