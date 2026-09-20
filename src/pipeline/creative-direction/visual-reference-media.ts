import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "./crew-context.js";
import type { CrewBrief, ReviewMedia } from "./crew-types.js";

const MIME_BY_EXTENSION: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/**
 * One captioned reference image per chapter character, for the planning
 * roles whose job is inherently visual (see VISUAL_ROLES in crew.ts) --
 * see docs/plans/CURRENT_GOAL.md, 2026-09-19. Without this, every visual
 * judgment during planning was made from a character's name and free-text
 * canon notes alone, never the actual approved art.
 *
 * brief.canon is already scoped to only characters appearing somewhere in
 * this chapter (see loadCrewBrief), so no further filtering happens here.
 * True per-shot scoping (only the characters in the specific shot a role
 * is currently directing) isn't achievable without restructuring the crew
 * into per-shot calls -- a materially bigger change than this -- so a
 * visual role sees every chapter character's reference art on every call,
 * not just the ones in whichever shot it's currently reasoning about.
 */
export function canonReferenceMedia(db: DatabaseSync, dataDir: string, brief: CrewBrief): ReviewMedia[] {
  const media: ReviewMedia[] = [];
  for (const character of brief.canon) {
    let asset: { path: string } | undefined;
    try {
      asset = db.prepare(
        `SELECT path FROM character_assets WHERE character_version_id=?
         ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 ELSE 2 END LIMIT 1`
      ).get(character.versionId) as { path: string } | undefined;
    } catch { continue; } // pre-migration or minimal test database
    if (!asset) continue;
    const extension = asset.path.slice(asset.path.lastIndexOf(".")).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) continue;
    try {
      const data = readFileSync(productionAssetPath(dataDir, asset.path)).toString("base64");
      media.push({ mimeType, data, caption: `Canon reference image for "${character.name}":` });
    } catch { /* asset row exists but the file is missing/unreadable -- skip it rather than fail the whole call */ }
  }
  return media;
}
