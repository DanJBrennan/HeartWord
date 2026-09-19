export type StoryStateAsset = {
  category: string;
  path: string;
  story_state?: string | null;
  available_from_verse?: string | null;
  available_through_verse?: string | null;
  asset_role?: string | null;
};

function verseNumber(verseRef: string | undefined) {
  const match = verseRef?.match(/^[^:]+:(\d+)(?:-\d+)?$/);
  return match ? Number(match[1]) : null;
}

/** Excludes proof images and state-bound references unless a shot supplies an
 * in-range canonical verse. This prevents later-story healing references from
 * leaking into an earlier frame through ordinary asset ordering. */
export function sceneReferenceAssetsForVerse<T extends StoryStateAsset>(assets: T[], verseRef?: string) {
  const verse = verseNumber(verseRef);
  return assets.filter((asset) => {
    if ((asset.asset_role ?? "scene_reference") !== "scene_reference") return false;
    if (!asset.story_state && !asset.available_from_verse && !asset.available_through_verse) return true;
    if (verse === null) return false;
    const from = verseNumber(asset.available_from_verse ?? undefined);
    const through = verseNumber(asset.available_through_verse ?? undefined);
    return (from === null || verse >= from) && (through === null || verse <= through);
  });
}
