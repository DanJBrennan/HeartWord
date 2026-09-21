/**
 * Canon garment critic: the same skeptical, web-search-grounded review
 * critic.ts runs against a generated SHOT, run instead against a canon
 * CHARACTER's approved reference images -- built 2026-09-07 at Dan's
 * request after he noticed Jesus's canon design is missing tassels
 * (tzitzit) and carries ornamented gold trim he suspected wasn't
 * authentic to first-century Judean dress, and asked the Critic to review
 * the whole character canon's clothing rather than just shot-by-shot
 * output.
 *
 * Distinct from critic.ts's runCritic because a canon reference sheet
 * isn't staged action -- there's no motion/staging feasibility, no crowd
 * density, no continuity-debris question. This only judges the GARMENT
 * DESIGN itself against real historical/archaeological/scriptural
 * evidence: is this plausible first-century Judean/Galilean clothing, not
 * whether a specific shot's staging works. Reuses critic.ts's severity
 * parsing (parseCriticSeverity) rather than duplicating it.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getDataDir, getDb } from "../../db/client.js";
import { generateGroundedText } from "../../providers/gemini-text.js";
import { parseCriticSeverity, type CriticReport } from "./critic.js";

/**
 * Runs the grounded garment-authenticity review for one character against
 * up to a few of its approved reference images (a headshot alone won't
 * show tassels/hem -- callers should prefer full-body/turnaround assets
 * when available).
 *
 * `producerOverrides`, added 2026-09-07: deliberate storytelling choices
 * the producer (Dan) has explicitly approved that override strict
 * historical accuracy -- e.g. keeping the scribes' garments solid black
 * as a visual-identity device, despite black dye being historically rare/
 * costly in the period. Without this, the Critic (which has no memory
 * between calls) re-flags the same accepted deviation every time it
 * reviews this character, since a fresh grounded search call knows
 * nothing about prior decisions. Pass the durable override text (also
 * recorded in review_notes -- see recordProducerOverride below) so the
 * Critic explicitly excludes it from its findings instead of re-raising
 * it as an unresolved error each run.
 */
export async function runCanonGarmentCritic(
  characterName: string,
  referenceImages: Array<{ mimeType: string; data: string }>,
  producerOverrides: string[] = []
): Promise<CriticReport> {
  const overrideBlock =
    producerOverrides.length > 0
      ? `\n\nPRODUCER OVERRIDES -- the production has explicitly reviewed and approved the following deviations from ` +
        `strict historical accuracy as deliberate storytelling choices, not oversights. Do NOT flag these as errors ` +
        `or include them in your findings, even though they would normally be historically inaccurate:\n` +
        producerOverrides.map((o) => `- ${o}`).join("\n") +
        `\n\nStill flag any OTHER historical inaccuracy you find that isn't covered by the overrides above.\n`
      : "";

  const prompt =
    `You are a skeptical costume historian reviewing this canon character reference design for a Scripture video ` +
    `production set in first-century Judea/Galilee: "${characterName}". This is the LOCKED reference design -- ` +
    `every future generated shot will copy this exact clothing, so an error here repeats everywhere. Use REAL web ` +
    `research (biblical scholarship, archaeological textile finds from the Judean desert/Masada/Nahal Hever, ` +
    `Second Temple period Jewish dress customs) to check it, not just visual plausibility.${overrideBlock}\n\n` +
    `Specifically check:\n\n` +
    `1. TASSELS (tzitzit): Numbers 15:38-39 and Deuteronomy 22:12 command knotted fringes on the four corners of ` +
    `an Israelite man's outer garment -- and the Gospels themselves describe people reaching for "the fringe/hem ` +
    `of his garment" (e.g. Matthew 9:20, Mark 6:56, Luke 8:44), strong direct textual evidence Jesus himself would ` +
    `have worn visible tassels. If this character is a Jewish man and has no visible tassels on his outer garment, ` +
    `say so plainly as a real, citable omission -- do not treat it as a minor stylistic choice.\n\n` +
    `2. ORNAMENTATION AUTHENTICITY: is any decorative trim, embroidery, or color pattern on this garment plausible ` +
    `for the character's real social station in first-century Judea/Galilee, or does it read as later Byzantine- ` +
    `icon convention (e.g. gold trim, elaborate embroidered borders) rather than what archaeological textile finds ` +
    `from the period and region actually show (undyed or simply-dyed wool/linen, plain weave, natural dye colors -- ` +
    `see the real dyed/undyed wool fragments recovered from Masada and Nahal Hever)? Ornamentation that makes a ` +
    `character visually distinctive is a legitimate production need (helping viewers tell characters apart), but ` +
    `say clearly if the SPECIFIC way it's done here is not something the historical record supports, and suggest ` +
    `a more authentic way to achieve the same distinctiveness (e.g. a colored stripe/clavus pattern actually ` +
    `attested in the period, rather than invented gold trim).\n\n` +
    `3. Any other real historical inaccuracy in this garment design (fabric, cut, color, headwear, footwear) that ` +
    `a knowledgeable viewer or scholar would flag.\n\n` +
    `List every real problem you find, citing research where relevant. If you genuinely find nothing wrong, say so ` +
    `plainly rather than inventing a concern.\n\n` +
    `End your response with exactly one line in this format: "SEVERITY: none" (nothing wrong), "SEVERITY: minor" ` +
    `(a small, easily-overlooked detail), "SEVERITY: moderate" (worth fixing before this design ships further), or ` +
    `"SEVERITY: severe" (a clear, well-documented error that would visibly repeat across every future shot).`;

  const result = await generateGroundedText(prompt, referenceImages);
  const severity = parseCriticSeverity(result.text);
  const sources = [...new Map(result.sources.map((s) => [s.uri, s] as const)).values()];
  const sourcesFinding = sources.length
    ? `\n\nSources cited by the grounded research pass:\n${sources.map((s) => `- ${s.title} (${s.uri})`).join("\n")}`
    : "";
  // suggestedFix/preserve are shot-regeneration concepts (critic.ts's
  // runCritic asks for them explicitly) -- this garment review judges a
  // locked reference design, not a shot, and doesn't ask its prompt for
  // those trailer lines, so there's nothing real to parse out here.
  // This older canon-only review does not ask for structured confidence.
  // Preserve that absence rather than manufacturing a numeric estimate.
  return { severity, findings: `${result.text}${sourcesFinding}`, structuredFindings: [], sources, suggestedFix: null, preserve: null, costUsd: result.costUsd };
}

interface CanonCharacterRow {
  character_id: string;
  character_version_id: string;
  character_name: string;
}

interface CanonAssetRow {
  path: string;
  category: string;
  importedFrom: string | null;
}

function readCanonCharacters(rows: Record<string, unknown>[]): CanonCharacterRow[] {
  return rows.map((row) => {
    if (typeof row.character_id !== "string" || typeof row.character_version_id !== "string" || typeof row.character_name !== "string") {
      throw new Error("Expected canon character rows with string character and version identifiers.");
    }
    return { character_id: row.character_id, character_version_id: row.character_version_id, character_name: row.character_name };
  });
}

function readCanonAssets(rows: Record<string, unknown>[]): CanonAssetRow[] {
  return rows.map((row) => {
    if (typeof row.path !== "string" || typeof row.category !== "string") {
      throw new Error("Expected canon asset rows with string path and category.");
    }
    return { path: row.path, category: row.category, importedFrom: typeof row.importedFrom === "string" ? row.importedFrom : null };
  });
}

/** How many reference images the garment critic reads per character. A
 *  headshot alone can't show a hem or tassels, so two is the floor at
 *  which a garment verdict means anything; more than that multiplies the
 *  grounded-review cost across the whole canon for little added signal. */
export const CANON_CRITIC_MAX_IMAGES = 2;

const CANON_CATEGORY_RANK: Record<string, number> = { body_pose: 0, turnaround: 1, headshot: 2 };

/** A costume-fix promotion (see scripts/character-tool/promote-*.ts) marks
 *  each asset row it left untouched with an `imported_from` note saying so
 *  -- it never overwrites what "carried forward" means, so matching that
 *  phrase is a reliable signal rather than a guess at wording. Every other
 *  value (a freshly generated candidate, or the original import path for a
 *  character nothing has ever promoted) counts as fresh. */
function isCarriedForward(importedFrom: string | null): boolean {
  return importedFrom !== null && /carried forward/i.test(importedFrom);
}

/**
 * The reference images this audit will actually look at, in the order it
 * reads them. Exported because the canon review page states WHICH images a
 * verdict rests on, and a page that re-derives that independently drifts
 * from the truth -- it already did, labelling all four of a character's
 * body poses as "sampled" when only two were read.
 *
 * Within a category, an asset a promotion left untouched sorts behind one
 * it actually regenerated -- found 2026-09-21 re-auditing a costume-fix
 * batch: "Man with Withered Hand" had its neutral-standing pose corrected,
 * but path order alone sampled two unrelated, never-touched healing-state
 * poses instead, so the re-audit judged a fix by images that didn't contain
 * it and called the (real, verified-by-eye) fix severe. Path is still the
 * final tie-break within the same freshness, so the choice stays
 * reproducible when nothing distinguishes two assets otherwise.
 *
 * `exists` drops assets whose file is missing from disk, because a missing
 * body pose silently demotes the verdict to whatever was readable next --
 * the one case where the page must not claim a body pose was seen.
 */
export function criticSampledAssets<T extends { path: string; category: string; importedFrom?: string | null }>(
  assets: readonly T[],
  exists: (relativePath: string) => boolean
): T[] {
  return [...assets]
    .sort((a, b) => {
      const categoryDelta = (CANON_CATEGORY_RANK[a.category] ?? 9) - (CANON_CATEGORY_RANK[b.category] ?? 9);
      if (categoryDelta !== 0) return categoryDelta;
      const staleDelta = Number(isCarriedForward(a.importedFrom ?? null)) - Number(isCarriedForward(b.importedFrom ?? null));
      if (staleDelta !== 0) return staleDelta;
      return a.path.localeCompare(b.path);
    })
    .filter((asset) => exists(asset.path))
    .slice(0, CANON_CRITIC_MAX_IMAGES);
}

export interface CanonGarmentAuditEntry {
  characterId: string;
  characterVersionId: string;
  characterName: string;
  severity: CriticReport["severity"];
  findings: string;
  /** What this character's grounded review actually cost. */
  costUsd: number;
}

/**
 * Audits every approved canon character's garment design -- built for a
 * one-time full-canon pass, same shape as director.ts's runProjectReview
 * for shots. `projectId` is only used to attach the resulting review_notes
 * rows (review_notes.project_id is NOT NULL) -- canon characters are
 * global/book/chapter scoped independent of any one project, but v1 only
 * has one real project to attach these to. Sequential, not parallel, for
 * the same rate-limit reason runProjectReview is sequential.
 */
export async function auditCanonGarments(
  projectId: string,
  // Re-checking a just-promoted fix batch needs only those characters, not
  // a full-canon pass -- narrowing by name (not id) because that's what a
  // caller re-running a batch actually has on hand: the character list from
  // a promotion handoff, not their internal ids. Omitted means every
  // approved character, same as before this parameter existed.
  characterNames?: readonly string[]
): Promise<CanonGarmentAuditEntry[]> {
  const db = getDb();
  const dataDir = getDataDir();

  const characterQuery = characterNames
    ? `SELECT c.id AS character_id, cv.id AS character_version_id, c.name AS character_name
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.canon_status = 'approved' AND c.name IN (${characterNames.map(() => "?").join(",")})
       ORDER BY c.name`
    : `SELECT c.id AS character_id, cv.id AS character_version_id, c.name AS character_name
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.canon_status = 'approved'
       ORDER BY c.name`;
  const characters = readCanonCharacters(
    characterNames ? db.prepare(characterQuery).all(...characterNames) : db.prepare(characterQuery).all()
  );

  const assetStmt = db.prepare(
    `SELECT path, category, imported_from AS importedFrom FROM character_assets WHERE character_version_id = ?
     ORDER BY CASE category WHEN 'body_pose' THEN 0 WHEN 'turnaround' THEN 1 WHEN 'headshot' THEN 2 ELSE 3 END`
  );

  const insertReviewNote = db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'character_version', ?, 'qc', ?, ?, ?)`
  );
  // The prior gap this closes: recordProducerOverride below writes a
  // durable, resolved 'human' review_notes row for a character version,
  // but this audit never read it back -- so a producer-approved deviation
  // (e.g. the scribes' solid-black garments, see recordProducerOverride's
  // docstring) got re-flagged as an unresolved error on every subsequent
  // audit run, forever, even though the decision had already been made.
  const loadOverrides = db.prepare(
    `SELECT note FROM review_notes WHERE subject_type = 'character_version' AND subject_id = ? AND source = 'human' ORDER BY created_at`
  );

  const results: CanonGarmentAuditEntry[] = [];
  for (const character of characters) {
    const assets = readCanonAssets(assetStmt.all(character.character_version_id));
    const sampled = criticSampledAssets(assets, (path) => existsSync(join(dataDir, "assets", path)));
    const images = sampled.map((asset) => ({
      mimeType: "image/png",
      data: readFileSync(join(dataDir, "assets", asset.path)).toString("base64")
    }));
    if (images.length === 0) continue;

    const overrides = (loadOverrides.all(character.character_version_id) as Array<{ note: string }>).map((r) =>
      // Strip the "Producer override: " prefix recordProducerOverride writes, so the bullet list handed to the
      // Critic reads as a clean list of decisions rather than repeating that label on every line.
      r.note.replace(/^Producer override:\s*/, "")
    );
    const critic = await runCanonGarmentCritic(character.character_name, images, overrides);
    results.push({
      characterId: character.character_id,
      characterVersionId: character.character_version_id,
      characterName: character.character_name,
      severity: critic.severity,
      findings: critic.findings,
      costUsd: critic.costUsd ?? 0
    });

    const now = Date.now();
    // Grounded search with reference images is the most expensive call
    // this project makes, and a full-canon pass is dozens of them --
    // recorded like any other spend rather than left invisible.
    if (critic.costUsd) {
      db.prepare(
        "INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, NULL, ?, ?)"
      ).run(randomUUID(), projectId, critic.costUsd, now);
    }
    insertReviewNote.run(
      randomUUID(),
      projectId,
      character.character_version_id,
      `Canon garment review (${character.character_name}), severity: ${critic.severity}:\n${critic.findings}`,
      critic.severity === "none" ? 1 : 0,
      now
    );
  }

  return results;
}

/**
 * Durably records a producer override (a deliberate storytelling
 * deviation from strict historical accuracy) against a character
 * version, as a resolved human review_notes row -- so the decision has a
 * permanent record independent of any one runCanonGarmentCritic call.
 * Callers should also pass the same override text into
 * runCanonGarmentCritic's producerOverrides parameter for any future
 * review of this character, since the Critic itself has no memory
 * between calls and this note alone doesn't change its behavior.
 */
export function recordProducerOverride(projectId: string, characterVersionId: string, overrideText: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'character_version', ?, 'human', ?, 1, ?)`
  ).run(randomUUID(), projectId, characterVersionId, `Producer override: ${overrideText}`, Date.now());
}
