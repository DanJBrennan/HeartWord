/**
 * Shared by every place that must pick ONE character_assets row out of
 * several in the same category (the garment critic's sampler in
 * qc/canon-critic.ts, and real keyframe reference selection in
 * media-generation/external-keyframes.ts and external-coverage-
 * keyframes.ts) -- built 2026-09-21 after both kinds of picker turned out
 * to have the identical bug: with no notion of which asset a costume-fix
 * promotion actually just replaced, an unrelated older asset that happened
 * to sort alphabetically first got used instead of the fix. For the
 * critic that produced a false "still severe" verdict on a real,
 * verified fix; for keyframe selection it would have been worse -- a shot
 * silently generated from the pre-fix garment.
 *
 * A promotion (scripts/character-tool/promote-*.ts) marks every asset row
 * it left untouched with an `imported_from` note saying so ("Carried
 * forward unchanged[...]"); it never overwrites what that phrase means, so
 * matching it is a reliable signal rather than a guess at wording. Every
 * other value -- a freshly generated candidate, or the original import
 * path for a character nothing has ever promoted -- counts as fresh.
 */
export function isAssetCarriedForward(importedFrom: string | null | undefined): boolean {
  return importedFrom != null && /carried forward/i.test(importedFrom);
}

/**
 * Sorts assets by category (per the caller's own priority order -- a
 * costume critic wants full-body views first, keyframe selection wants a
 * headshot first as its no-body-pose fallback, so this deliberately does
 * NOT hardcode one ranking), then prefers one a promotion didn't mark
 * carried-forward, then finally breaks any remaining tie on path so the
 * result stays reproducible. Does not filter or slice -- callers do that
 * themselves (the critic drops missing files first; keyframe selection
 * just wants the first matching category after this sort).
 */
export function sortAssetsByFreshness<T extends { path: string; category: string; importedFrom?: string | null }>(
  assets: readonly T[],
  categoryRank: Record<string, number>,
  defaultRank = 9
): T[] {
  return [...assets].sort((a, b) => {
    const categoryDelta = (categoryRank[a.category] ?? defaultRank) - (categoryRank[b.category] ?? defaultRank);
    if (categoryDelta !== 0) return categoryDelta;
    const staleDelta = Number(isAssetCarriedForward(a.importedFrom ?? null)) - Number(isAssetCarriedForward(b.importedFrom ?? null));
    if (staleDelta !== 0) return staleDelta;
    return a.path.localeCompare(b.path);
  });
}
