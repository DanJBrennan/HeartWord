/**
 * Pure logic for scoping a review_notes decision to exactly one coverage
 * beat -- split out from director.ts for the same reason director-
 * verdict.ts is split from its own caller: zero DB/network imports, so a
 * plain vitest unit test doesn't pull in db/client.ts's node:sqlite.
 *
 * Built 2026-09-11 after Dan's report (via Codex review) that an
 * exception recorded for one coverage beat's candidate ("the missing
 * debris here is fine, people obscure the floor") was silently excusing
 * a DIFFERENT beat where the same area is clearly, unambiguously
 * visible -- a covered_sequence shot's beats can look nothing alike (a
 * wide master vs. a tight cutaway vs. a lip-sync close-up), so a
 * decision about one frame is not evidence about another.
 *
 * Every override/correction a coverage beat's review writes is tagged
 * "BEAT: <beat_id>" as its first line (see director.ts's
 * recordCoverageBeatOverride and runCoverageBeatCandidateReview's own
 * review-note insert). An UNTAGGED note -- every override recorded
 * through the single-clip path, which has no notion of beats -- still
 * applies everywhere, since it was never beat-specific to begin with.
 */
const BEAT_TAG_LINE = /^BEAT:\s*(\S+)/m;

/** Strips a leading "BEAT: <id>" tag line before handing a note's text to
 *  the Critic -- the tag is bookkeeping for matchesBeatScope, not part
 *  of the actual decision text. */
export function stripBeatTag(note: string): string {
  return note.replace(BEAT_TAG_LINE, "").trim();
}

/**
 * true if `note` should apply when reviewing `beatId` (or a single-clip
 * shot, when `beatId` is omitted). An untagged note always matches
 * (shot-wide). A tagged note matches only its own beat -- when `beatId`
 * is omitted entirely (the single-clip call sites), a tagged note never
 * matches, since a single-clip shot has no beats of its own to compare
 * against.
 */
export function matchesBeatScope(note: string, beatId?: string): boolean {
  const tag = note.match(BEAT_TAG_LINE)?.[1];
  if (!tag) return true;
  return tag === beatId;
}
