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
  return { severity, findings: `${result.text}${sourcesFinding}`, structuredFindings: [], sources, suggestedFix: null, preserve: null };
}

interface CanonCharacterRow {
  character_id: string;
  character_version_id: string;
  character_name: string;
}

interface CanonAssetRow {
  path: string;
  category: string;
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
    return { path: row.path, category: row.category };
  });
}

export interface CanonGarmentAuditEntry {
  characterId: string;
  characterVersionId: string;
  characterName: string;
  severity: CriticReport["severity"];
  findings: string;
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
export async function auditCanonGarments(projectId: string): Promise<CanonGarmentAuditEntry[]> {
  const db = getDb();
  const dataDir = getDataDir();

  const characters = readCanonCharacters(db
    .prepare(
      `SELECT c.id AS character_id, cv.id AS character_version_id, c.name AS character_name
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.canon_status = 'approved'
       ORDER BY c.name`
    )
    .all());

  const assetStmt = db.prepare(
    `SELECT path, category FROM character_assets WHERE character_version_id = ?
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
    const images: Array<{ mimeType: string; data: string }> = [];
    for (const asset of assets) {
      if (images.length >= 2) break;
      const absPath = join(dataDir, "assets", asset.path);
      if (!existsSync(absPath)) continue;
      images.push({ mimeType: "image/png", data: readFileSync(absPath).toString("base64") });
    }
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
      findings: critic.findings
    });

    const now = Date.now();
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
