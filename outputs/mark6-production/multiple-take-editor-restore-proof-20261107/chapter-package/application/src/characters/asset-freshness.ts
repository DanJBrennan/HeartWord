/** Select one asset predictably when a canon version retains older poses. */
export function isAssetCarriedForward(importedFrom: string | null | undefined): boolean {
  return importedFrom != null && /carried forward/i.test(importedFrom);
}

/**
 * Applies a caller-owned category priority, then favors an asset regenerated
 * by its promotion over siblings recorded as carried forward unchanged.
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
