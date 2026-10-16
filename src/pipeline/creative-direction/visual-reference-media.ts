import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "./crew-context.js";
import type { CrewBrief, ReviewMedia } from "./crew-types.js";

const MIME_BY_EXTENSION: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** Bounded samples of already selected coverage, inside Nell's existing call.
 * This never generates a proxy or approves missing/unseen footage. */
export function acceptedCoverageMedia(dataDir: string, brief: CrewBrief): ReviewMedia[] {
  const selected = brief.shots.filter(s => s.clip), media: ReviewMedia[] = [];
  let bytesUsed = 0;
  for (const shot of selected) {
    if (media.length >= 3) break;
    const path = productionAssetPath(dataDir, shot.clip!.path);
    try {
      const size = statSync(path).size;
      if (bytesUsed + size > 18 * 1024 * 1024 || !/\.mp4$/i.test(path)) continue;
      const bytes = readFileSync(path); bytesUsed += bytes.length;
      media.push({mimeType:"video/mp4",data:bytes.toString("base64"),caption:`Accepted coverage sample: shot ${shot.id}, clip ${shot.clip!.id}, SHA256 ${createHash("sha256").update(bytes).digest("hex")}. ${shot.clip!.durationMs} ms. At most three selected clips / 18 MiB are sampled from ${selected.length} selections; omitted footage is unobserved. This is not an assembled cut. Provider audio is not the approved source/cast performance; judge picture only.`});
    } catch { /* Missing or inaccessible coverage remains unobserved, not approved. */ }
  }
  return media;
}

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
