import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { getDb } from "../../db/client.js";
import { generateJson, type GeminiJsonSchema } from "../../providers/gemini-text.js";
import type { ProjectRow } from "../ingestion/index.js";
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { resolveAndBindSourcePaths } from "../ingestion/source-catalog.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import type { Stage } from "../types.js";
import { hasJoinedByScene } from "./disciple-timeline.js";
import { runProductionCrew } from "../creative-direction/crew-store.js";
import {
  CAMERA_MOVEMENTS,
  computeDialogueDurationMs,
  CROWD_DENSITIES,
  DEFAULT_CAMERA_MOVEMENT,
  DEFAULT_CROWD_DENSITY,
  DEFAULT_FRAMING,
  FRAMINGS,
  isCameraMovement,
  isCrowdDensity,
  isFraming,
  MAX_SINGLE_CLIP_LIPSYNC_MS,
  planCoverage,
  validateFraming,
  verseRangesRelated,
  type CameraMovement,
  type CrowdDensity,
  type Framing
} from "./coverage.js";
import { narrationBudgetFor, resolveNarrationSpans, type NarrationBudget } from "./narration-coverage.js";

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
  group_name: string | null;
  is_spokesperson: number;
  joined_narrative_at: string | null;
}

interface DialogueSegmentRow {
  speaker_character_id: string | null;
  speaker_name: string | null;
  verse_ref: string | null;
  start_ms: number;
  end_ms: number;
}

interface GeminiShot {
  action: string;
  characterNames: string[];
  verseRef: string;
  framing: string;
  cameraMovement: string;
  needsLipSync: boolean;
  dialogueCharacterName: string;
  crowdDensity: string;
  continuityNotes: string;
  spatialView: string;
}

interface GeminiSceneResponse {
  reasoning: string;
  lightingContinuity: string;
  spatialContinuity: string;
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
    lightingContinuity: {
      type: "string",
      description:
        "One sentence describing this scene's lighting/setting continuity (time of day, light source, interior vs. exterior) that every shot in the scene should share -- e.g. 'Bright midday sun, interior of a crowded mudbrick house, warm natural light through a roof opening.'"
    },
    spatialContinuity: {
      type: "string",
      description:
        "One shared production-design description for the ONE location used by every shot in this scene: relative scale, stable architectural anchors, and staging zones. Where the source is silent, call this a reconstruction choice, not a Scriptural fact. Later shots must never silently become a different or smaller room."
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
          },
          verseRef: {
            type: "string",
            description: "The specific verse or verse range this shot depicts, e.g. 'Mark 2:5' or 'Mark 2:5-7'."
          },
          framing: {
            type: "string",
            enum: FRAMINGS,
            description:
              "Shot framing. 'wide' establishes a whole location; 'medium_wide' shows several figures full-length; 'medium' is waist-up on one or two figures; 'medium_close' is chest-up, close enough to read a face clearly; 'close_up' is a full face; 'insert' is a tight detail (a hand, an object). Any shot with needsLipSync = true MUST be 'medium_close', 'close_up', or 'insert' -- never wider -- because the lip-sync provider needs a clear view of the mouth."
          },
          cameraMovement: {
            type: "string",
            enum: CAMERA_MOVEMENTS,
            description:
              "Camera movement for this shot: 'static' (locked off), 'push_in' (moves closer), 'pull_out' (moves back), 'pan_left'/'pan_right' (pivots), 'tracking' (moves alongside the subject), or 'handheld_follow' (loose, follows the action)."
          },
          needsLipSync: {
            type: "boolean",
            description:
              "True only if this shot's focus is a specific character speaking on camera and their mouth must be lip-synced to the dialogue audio. False for narration-only shots, silent action, or a shot where a character speaks off-screen/unseen."
          },
          dialogueCharacterName: {
            type: "string",
            description:
              "When needsLipSync is true, the exact canon name (copied verbatim from the provided list) of the character whose dialogue is heard and lip-synced in this shot. Empty string when needsLipSync is false."
          },
          crowdDensity: {
            type: "string",
            enum: CROWD_DENSITIES,
            description:
              "How full this shot's location should read, grounded strictly in what the verse text says or implies -- not a visual guess. 'packed' when the text says or implies no room / an overflowing crowd (e.g. Mark 2:2's 'no room, not even at the door'). 'empty' only when the text specifies solitude. Default to 'moderate' when the text doesn't address population at all. This is read literally downstream -- don't undersell a crowd the text explicitly calls large or overflowing."
          },
          continuityNotes: {
            type: "string",
            description:
              "Any object, prop, or physical state that must (or must NOT) be visible in this specific shot to stay consistent with the rest of the scene's own sequence of events -- e.g. a roof that hasn't been opened yet at this point in the story, a wound not yet inflicted, a door not yet opened, an object not yet introduced. Think across ALL the shots in this scene, not just this one: if an earlier shot in your own plan establishes something, later shots must keep it; if a later shot introduces something, earlier shots must NOT already show it. Empty string if nothing in this scene has this kind of ordering constraint."
          },
          spatialView: {
            type: "string",
            description:
              "How this camera relates to the shared scene location: camera position/direction and which stable anchors or zone should remain legible. For a close-up/insert, explicitly say that the wider room is intentionally out of frame but its scale must not be contradicted."
          }
        },
        required: [
          "action",
          "characterNames",
          "verseRef",
          "framing",
          "cameraMovement",
          "needsLipSync",
          "dialogueCharacterName",
          "crowdDensity",
          "continuityNotes",
          "spatialView"
        ]
      }
    }
  },
  required: ["reasoning", "lightingContinuity", "spatialContinuity", "shots"]
};

/**
 * Real measured narration time for this scene, stated as a floor on how
 * many non-dialogue shots it takes to cover it. Without this the planner
 * split scenes purely by text structure, blind to duration, and
 * systematically under-provisioned b-roll -- Mark 3 came out with roughly
 * half the non-dialogue video its narration needs (docs/plans/
 * CURRENT_GOAL.md, 2026-09-20). The arithmetic stays in code rather than
 * being left to the model, same reasoning as planCoverage's use of real
 * dialogue durations.
 */
function narrationBudgetSection(budget: NarrationBudget): string {
  if (budget.totalMs === 0) {
    return `NARRATION TIMING FOR THIS SCENE: none -- every second of this scene's audio is attributed dialogue, so it needs no narration-only coverage.`;
  }
  const seconds = (ms: number) => (ms / 1000).toFixed(1);
  const perSpan = budget.spans
    .map(span => `  - ${span.verseRef}: ${seconds(span.durationMs)}s of narration -> at least ${span.minimumShots} non-dialogue shot(s)`)
    .join("\n");
  return `NARRATION TIMING FOR THIS SCENE (measured from the real recording, not an estimate):
This scene carries ${seconds(budget.totalMs)}s of narration that plays under NON-dialogue shots -- shots where nobody is speaking on camera. One generated clip holds about ${seconds(MAX_SINGLE_CLIP_LIPSYNC_MS)}s, so covering this narration takes AT LEAST ${budget.minimumNonDialogueShots} non-dialogue shots:
${perSpan}

Plan at least that many non-dialogue shots, on top of whatever lip-synced dialogue shots the scene needs -- a dialogue shot carries its own audio and does not cover narration. Planning fewer leaves the picture running out before the narrator does.

More shots here means more COVERAGE of what the text already says: another angle on the same action, a closer or wider view, the moment just before or just after a stated action, or a reaction from someone the text places in the scene. It never means new events, new dialogue, or new theology. A wordless reaction beat -- awe, alarm, someone taking in what just happened -- is legitimate where the passage genuinely supports one, and must stay within the decorum of the passage.`;
}

function buildScenePrompt(
  project: ProjectRow,
  scene: SceneRow,
  verseText: string,
  attributedSpeakers: string[],
  canonCharacters: CanonCharacterRow[],
  narrationBudget: NarrationBudget
): string {
  const characterList = canonCharacters
    .map((c) => {
      const groupTag = c.group_name
        ? c.is_spokesperson
          ? ` [spokesperson for the "${c.group_name}" group -- the only member who can carry dialogue]`
          : ` [member of the "${c.group_name}" group, not its spokesperson -- may appear and react but never carry dialogue]`
        : "";
      return `- ${c.name}${groupTag}${c.notes ? `: ${c.notes}` : ""}`;
    })
    .join("\n");

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

${narrationBudgetSection(narrationBudget)}

Break this scene into a sequence of shots (a shot is one unit of blocking/action -- start a new shot when the framing, action, or which characters are the focus changes). For each shot, describe the action in one or two sentences grounded strictly in the text above, list which canon characters are visible (include silent/background characters where the text implies their presence -- e.g. the crowd, or the men carrying the mat -- even if they don't speak), and give it a specific verse reference from the range above.

A character tagged as a group member (not its spokesperson) may appear in a shot and react non-verbally (a gasp, a murmur) but must never be dialogueCharacterName -- only that group's tagged spokesperson can carry a lip-synced line for the group.\n\nAlso decide the camera for each shot: a framing, a camera movement, and whether it needs lip-sync. Lip-sync is only for a shot whose focus is a specific character actually speaking on camera -- not narration, not silent action, not a character speaking off-screen. Because the lip-sync provider needs a clear view of the mouth, any shot with needsLipSync = true must use a framing of 'medium_close', 'close_up', or 'insert', never wider. When needsLipSync is true, name the exact speaking character in dialogueCharacterName; otherwise leave it an empty string.

Before planning the shots, define spatialContinuity: one shared production-design description for this scene's physical location. Name its relative scale, stable anchors, and staging zones. This does not add a narrative event or claim uncertain architecture is Scripture; it stops each shot from reinventing the same room. For every shot set spatialView: camera position/direction plus the anchors or zone that should remain legible. A tight shot may intentionally omit the room, but must never imply a contradictory room size.

For each shot, also set crowdDensity (how full the location should read -- ground this in what the text actually says about population, don't leave it to guesswork) and continuityNotes (anything that must or must not be visible in THIS shot to stay consistent with the other shots you're planning in this same scene -- read your own full shot sequence before answering this: an object introduced in a later shot must not already appear earlier; something established earlier must persist later, unless the text says otherwise).

Finally, state one shared lighting/setting continuity note for the whole scene (time of day, light source, interior vs. exterior) that every shot's generation should follow, so the scene doesn't drift in lighting from shot to shot.

Do not invent theological content, dialogue, or narrative beyond what the text says: you are deciding HOW the text is shown, not adding to WHAT it says.`;
}

/**
 * Stage 3: Casting & direction -- for each scene, decides how to break it
 * into shots, which canon characters appear in each, what the action is,
 * and the camera decisions that shape how it will actually be generated and
 * lip-synced (framing, movement, and whether/who needs lip-sync). v1 runs
 * this as ONE Gemini planning call per scene (see the "v1 simplification"
 * callout in docs/ARCHITECTURE.md) rather than the full multi-agent
 * negotiation in docs/design/shot-planning.md.
 *
 * Grounds every call in the chapter's real English reference text (not the
 * Hatam source, which an LLM can't read, and not invented content -- see
 * NON_GOALS.md: "Scene/action decisions fill in *how* the text is shown,
 * not *what* the text says"). Any character name Gemini returns that isn't
 * an exact match to the supplied canon list is dropped and flagged in
 * review_notes rather than silently kept -- a hallucinated name is exactly
 * the kind of thing AGENTS.md asks stages to log for a human to catch, not
 * paper over. The same distrust applies to the camera fields: Gemini's
 * framing/movement choices are validated against the known enums (falling
 * back to a safe default and flagging it if not), and a shot flagged
 * needsLipSync with too wide a framing is corrected rather than trusted --
 * see coverage.ts's validateFraming.
 *
 * Also decides, per lip-synced shot, whether its dialogue's REAL duration
 * (from stage 1's audio_segments, not a guess) fits one generated clip or
 * needs to become a covered sequence -- see coverage.ts's planCoverage for
 * the full reasoning. This stage only detects and records that need
 * (shots.coverage_plan / coverage_notes); building the actual covered
 * sequence is stage 4/5's job once media generation exists.
 *
 * Re-running refines the existing shot plan through the production crew.
 */
const buildCasting: Stage = async (projectId) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `Casting failed: no project with id ${projectId}.` };
  }
  if (project.language.toLowerCase() !== "hatam") return { ok: false, reasoning: "Configure and approve the regional canon for this language before storyboard generation." };

  // Refinement keeps shot IDs, approved takes, costs and producer edits.
  const existing = db.prepare(`SELECT s.id FROM shots s JOIN scenes sc ON sc.id = s.scene_id
    WHERE sc.project_id = ? LIMIT 1`).get(projectId);
  if (existing) {
    try {
      const result = await runProductionCrew(projectId, "planning");
      return { ok: result.status === "approved", reasoning: result.summary };
    } catch (error) { return { ok: false, reasoning: (error as Error).message }; }
  }

  const scenes = db
    .prepare(`SELECT id, sequence, verse_start, verse_end FROM scenes WHERE project_id = ? ORDER BY sequence`)
    .all(project.id) as unknown as SceneRow[];

  if (scenes.length === 0) {
    return { ok: false, reasoning: "Casting failed: no scenes found -- run scene breakdown (stage 2) first." };
  }

  let referencePath: string;
  try { referencePath = resolveAndBindSourcePaths(db, project).referencePath; }
  catch (error) {
    return {
      ok: false,
      reasoning:
        `Casting failed: ${(error as Error).message} Stage 3 grounds its shot ` +
        "descriptions in this text (see NON_GOALS.md) rather than the Hatam source, which an LLM can't read directly."
    };
  }
  if (!existsSync(referencePath)) {
    return {
      ok: false,
      reasoning:
        `Casting failed: no English reference text found at ${referencePath}. Stage 3 grounds its shot ` +
        "descriptions in this text (see NON_GOALS.md) rather than the Hatam source, which an LLM can't read directly."
    };
  }
  const verses = parseSourceTextByVerse(referencePath);

  const allCanonCharacters = db
    .prepare(
      `SELECT c.id, c.name, cv.notes, g.name AS group_name, c.is_spokesperson, c.joined_narrative_at
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id
       LEFT JOIN character_groups g ON g.id = c.group_id
       WHERE cv.status = 'approved' AND c.canon_status = 'approved' AND c.region = 'Papuan'
         AND (c.scope_kind = 'global' OR (c.scope_book = ? AND (c.scope_chapter IS NULL OR c.scope_chapter = ?)))
       ORDER BY c.name`
    )
    .all(project.book, project.chapter) as unknown as CanonCharacterRow[];

  if (allCanonCharacters.length === 0) {
    return { ok: false, reasoning: "Casting failed: no approved canon characters found for this project." };
  }
  // Full list, unfiltered by narrative timeline -- used for resolving a
  // Gemini-returned name back to a character (see characterByName below).
  // A disciple who hasn't "joined" yet by an earlier scene must still
  // resolve correctly if named later in the SAME casting run, since scenes
  // are processed in order but share this one lookup map.
  const characterByName = new Map(allCanonCharacters.map((c) => [c.name.trim().toLowerCase(), c]));

  const dialogueSegments = db
    .prepare(
      `SELECT a.speaker_character_id, c.name AS speaker_name, a.verse_ref, a.start_ms, a.end_ms
       FROM audio_segments a
       LEFT JOIN characters c ON c.id = a.speaker_character_id
       WHERE a.project_id = ? AND a.layer = 'original_reading' AND a.speaker_character_id IS NOT NULL`
    )
    .all(project.id) as unknown as DialogueSegmentRow[];

  /** Real dialogue-duration lookup for coverage.ts's planCoverage -- uses
   *  stage 1's actual measured segment timing, not a guess at how long a
   *  line takes to read. */
  function dialogueDurationForShot(characterId: string, verseStart: number, verseEnd: number): number {
    const matching = dialogueSegments
      .filter((s) => s.speaker_character_id === characterId && s.verse_ref !== null)
      .filter((s) => verseRangesRelated(parseVerseRange(s.verse_ref!), { start: verseStart, end: verseEnd }))
      .map((s) => ({ startMs: s.start_ms, endMs: s.end_ms }));
    return computeDialogueDurationMs(matching);
  }

  // Real narration timing, resolved through the correction/editorial
  // overlay once for the whole chapter and sliced per scene below.
  const { spans: narrationSpans } = resolveNarrationSpans(db, project.id);

  const now = Date.now();
  const unresolvedNames = new Set<string>();
  const framingCorrections: string[] = [];
  const coverageFlags: string[] = [];
  let totalShots = 0;

  // Model calls complete before the short write transaction. Other local
  // requests must never join a transaction suspended across a network await.
  const responses = new Map<string, GeminiSceneResponse>();
  try {
    for (const scene of scenes) {
      const start = parseVerseRange(scene.verse_start).start, end = parseVerseRange(scene.verse_end).end;
      const text = verses.filter(v => v.verse >= start && v.verse <= end).map(v => `${v.verse}. ${v.text}`).join(" ");
      const speakers = [...new Set(dialogueSegments.filter(s => s.verse_ref && parseVerseRange(s.verse_ref).start <= end && parseVerseRange(s.verse_ref).end >= start)
        .map(s => s.speaker_name).filter((n): n is string => n !== null))];
      const canon = allCanonCharacters.filter(c => hasJoinedByScene(c.joined_narrative_at, scene.verse_end));
      const narrationBudget = narrationBudgetFor(narrationSpans, start, end);
      responses.set(scene.id, await generateJson<GeminiSceneResponse>(buildScenePrompt(project, scene, text, speakers, canon, narrationBudget), SHOT_RESPONSE_SCHEMA));
    }
  } catch (error) { return { ok: false, reasoning: `Initial storyboard planning incomplete: ${(error as Error).message}` }; }

  db.exec("BEGIN TRANSACTION");
  try {
    // Initial planning never deletes earlier decisions or generated media.
    if (db.prepare("SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? LIMIT 1").get(projectId)) throw new Error("Another request saved shots while planning; review those shots before proceeding.");

    const insertShot = db.prepare(
      `INSERT INTO shots
         (id, scene_id, sequence, action, verse_ref, framing, camera_movement, needs_lip_sync,
          dialogue_character_id, coverage_plan, coverage_notes, crowd_density, continuity_notes, spatial_view, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)`
    );
    const insertShotCharacter = db.prepare(
      `INSERT OR IGNORE INTO shot_characters (shot_id, character_id) VALUES (?, ?)`
    );
    const updateScene = db.prepare(`UPDATE scenes SET reasoning = ?, lighting_continuity = ?, spatial_continuity = ? WHERE id = ?`);

    for (const scene of scenes) {
      const response = responses.get(scene.id)!;

      response.shots.forEach((shot, index) => {
        const shotId = randomUUID();
        const shotLabel = `scene ${scene.sequence} shot ${index + 1}`;

        // Resolve visible characters, same distrust-and-flag pattern as before.
        const matchedCharacterIds = new Set<string>();
        for (const rawName of shot.characterNames) {
          const match = characterByName.get(rawName.trim().toLowerCase());
          if (!match) {
            unresolvedNames.add(rawName);
            continue;
          }
          matchedCharacterIds.add(match.id);
        }

        // Framing/movement: fall back to a safe default and flag it rather
        // than writing an enum value the rest of the system doesn't expect.
        let framing: Framing = isFraming(shot.framing) ? shot.framing : DEFAULT_FRAMING;
        if (!isFraming(shot.framing)) {
          framingCorrections.push(`${shotLabel}: unrecognized framing "${shot.framing}", defaulted to "${DEFAULT_FRAMING}"`);
        }
        const cameraMovement: CameraMovement = isCameraMovement(shot.cameraMovement)
          ? shot.cameraMovement
          : DEFAULT_CAMERA_MOVEMENT;
        if (!isCameraMovement(shot.cameraMovement)) {
          framingCorrections.push(
            `${shotLabel}: unrecognized camera movement "${shot.cameraMovement}", defaulted to "${DEFAULT_CAMERA_MOVEMENT}"`
          );
        }
        const crowdDensity: CrowdDensity = isCrowdDensity(shot.crowdDensity) ? shot.crowdDensity : DEFAULT_CROWD_DENSITY;
        if (!isCrowdDensity(shot.crowdDensity)) {
          framingCorrections.push(
            `${shotLabel}: unrecognized crowd density "${shot.crowdDensity}", defaulted to "${DEFAULT_CROWD_DENSITY}"`
          );
        }
        const continuityNotes = shot.continuityNotes?.trim() || null;
        const spatialView = shot.spatialView?.trim() || null;

        // Resolve the dialogue character (if any) the same way as the visible
        // cast list -- an unresolved name is flagged, not silently dropped.
        let dialogueCharacterId: string | null = null;
        let needsLipSync = shot.needsLipSync;
        const dialogueName = shot.dialogueCharacterName.trim();
        if (needsLipSync && dialogueName.length > 0) {
          const match = characterByName.get(dialogueName.toLowerCase());
          if (match && match.group_name && !match.is_spokesperson) {
            // A group member who isn't the spokesperson can't carry dialogue --
            // see canonical-characters.md's "Character Groups" section.
            framingCorrections.push(
              `${shotLabel}: dialogueCharacterName "${dialogueName}" is a member of the "${match.group_name}" group but not its spokesperson -- can't carry dialogue, treated as needsLipSync = false`
            );
            needsLipSync = false;
          } else if (match) {
            dialogueCharacterId = match.id;
            matchedCharacterIds.add(match.id); // a speaking character must be visible in their own shot
          } else {
            unresolvedNames.add(dialogueName);
            needsLipSync = false; // can't lip-sync a character that doesn't resolve to canon
          }
        } else if (needsLipSync) {
          // Flagged needsLipSync with no named speaker -- can't lip-sync nobody.
          needsLipSync = false;
          framingCorrections.push(`${shotLabel}: needsLipSync was true with no dialogueCharacterName, treated as false`);
        }

        // Lip-sync forces framing -- enforced here, not left to the model.
        const framingResult = validateFraming(framing, needsLipSync);
        framing = framingResult.framing;
        if (framingResult.corrected && framingResult.note) {
          framingCorrections.push(`${shotLabel}: ${framingResult.note}`);
        }

        // Coverage: only meaningful once we know who's actually speaking and
        // for how long, per stage 1's real measured segment timing.
        let coveragePlan: "single_clip" | "covered_sequence" = "single_clip";
        let coverageNotes: string | null = null;
        if (needsLipSync && dialogueCharacterId) {
          try {
            const { start, end } = parseVerseRange(shot.verseRef);
            const durationMs = dialogueDurationForShot(dialogueCharacterId, start, end);
            const plan = planCoverage(durationMs);
            coveragePlan = plan.coveragePlan;
            coverageNotes = plan.notes;
            if (plan.coveragePlan === "covered_sequence") {
              coverageFlags.push(`${shotLabel} (${shot.verseRef}): ${plan.notes}`);
            }
          } catch {
            coverageFlags.push(
              `${shotLabel}: could not parse verseRef "${shot.verseRef}" to check dialogue duration -- coverage left as single_clip, confirm manually.`
            );
          }
        }

        insertShot.run(
          shotId,
          scene.id,
          index + 1,
          shot.action,
          shot.verseRef || null,
          framing,
          cameraMovement,
          needsLipSync ? 1 : 0,
          dialogueCharacterId,
          coveragePlan,
          coverageNotes,
          crowdDensity,
          continuityNotes,
          spatialView,
          now
        );
        totalShots++;

        for (const characterId of matchedCharacterIds) {
          insertShotCharacter.run(shotId, characterId);
        }
      });

      updateScene.run(response.reasoning, response.lightingContinuity || null, response.spatialContinuity?.trim() || null, scene.id);
    }

    const reviewNoteParts: string[] = [];
    if (unresolvedNames.size > 0) {
      reviewNoteParts.push(
        `Gemini named character(s) not in the canon list, dropped from their shot(s): ${[...unresolvedNames].join(", ")}.`
      );
    }
    if (framingCorrections.length > 0) {
      reviewNoteParts.push(`${framingCorrections.length} camera field(s) corrected: ${framingCorrections.join("; ")}.`);
    }
    if (coverageFlags.length > 0) {
      reviewNoteParts.push(
        `${coverageFlags.length} shot(s) need covered-sequence coverage (see shots.coverage_notes): ${coverageFlags.join(" | ")}`
      );
    }
    if (reviewNoteParts.length > 0) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(randomUUID(), project.id, project.id, `Casting: ${reviewNoteParts.join(" ")}`, now);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return { ok: false, reasoning: `Casting failed: ${(err as Error).message}` };
  }

  let crew;
  try { crew = await runProductionCrew(projectId, "planning"); }
  catch (error) { return { ok: false, reasoning: `Initial shots saved. Crew review incomplete: ${(error as Error).message}` }; }
  return {
    ok: crew.status === "approved",
    reasoning:
      crew.summary + " " +
      `Cast and directed ${scenes.length} scene(s) for ${project.book} ${project.chapter}: ${totalShots} shots ` +
      `planned via Gemini, grounded in the English reference text, each with a framing/camera-movement decision ` +
          `and shared lighting and spatial-continuity plans set per scene.` +
      (unresolvedNames.size > 0
        ? ` ${unresolvedNames.size} character name(s) Gemini returned didn't match the canon list and were dropped ` +
          "-- flagged in review_notes."
        : "") +
      (framingCorrections.length > 0
        ? ` ${framingCorrections.length} camera field(s) needed correction (e.g. lip-sync forcing a tighter framing) ` +
          "-- flagged in review_notes."
        : "") +
      (coverageFlags.length > 0
        ? ` ${coverageFlags.length} shot(s) have dialogue too long for one generated clip and need covered-sequence ` +
          "coverage when stage 4/5 build them -- flagged in review_notes."
        : "")
  };
};

// Prevent duplicate paid planning when the same request arrives twice.
const activeCasting = new Set<string>();
export const runCasting: Stage = async projectId => {
  if (activeCasting.has(projectId)) return { ok: false, reasoning: "Storyboard creation is already running for this chapter." };
  activeCasting.add(projectId);
  try { return await buildCasting(projectId); }
  finally { activeCasting.delete(projectId); }
};
