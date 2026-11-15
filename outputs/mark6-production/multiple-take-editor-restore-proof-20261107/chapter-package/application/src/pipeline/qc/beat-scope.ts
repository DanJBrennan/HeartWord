/**
 * Pure logic for scoping a review_notes decision to exactly the record it
 * was actually about -- split out from director.ts for the same reason
 * director-verdict.ts is split from its own caller: zero DB/network
 * imports, so a plain vitest unit test doesn't pull in db/client.ts's
 * node:sqlite.
 *
 * Built 2026-09-11 after Dan's report (via Codex review) that an
 * exception recorded for one coverage beat's candidate ("the missing
 * debris here is fine, people obscure the floor") was silently excusing
 * a DIFFERENT beat where the same area is clearly, unambiguously
 * visible -- a covered_sequence shot's beats can look nothing alike (a
 * wide master vs. a tight cutaway vs. a lip-sync close-up), so a
 * decision about one frame is not evidence about another. Extended the
 * same day, after a second Codex pass, to a second tag level: an
 * exception recorded against one CANDIDATE image must not automatically
 * apply to every future candidate of that same beat too (a regenerated
 * candidate can have a completely different composition), and a
 * "review could not run" marker must be tied to the exact
 * generation_attempts row it's about, not just "this shot's newest
 * unresolved note" -- which a coverage beat's own newer, unrelated note
 * can mask.
 *
 * Two independent tag lines, each optional, at the very start of a
 * note's text:
 *   BEAT: <beat_id>
 *   ATTEMPT: <attempt_id>
 * (`attempt_id` names either a generation_attempts.id or a
 * coverage_keyframe_attempts.id, depending on context -- this module
 * doesn't care which, it only compares strings.)
 *
 * - No BEAT tag: shot-wide, matches every beat (every override recorded
 *   through the single-clip path, which has no notion of beats, is
 *   untagged and was never beat-specific to begin with).
 * - BEAT tag, no ATTEMPT tag: a deliberate STANDING decision for that
 *   whole beat -- matches any candidate of that beat.
 * - BEAT tag + ATTEMPT tag: scoped to that ONE candidate only -- does
 *   NOT match a different candidate of the same beat, even though the
 *   beat matches.
 * - ATTEMPT tag with no BEAT tag: scoped to that one generation attempt
 *   only (the single-clip "review status: incomplete" marker) --
 *   independent of any beat matching, since a single-clip shot has none.
 */
export interface NoteScope {
  beatId?: string;
  attemptId?: string;
}

const TAG_LINE = /^(BEAT|ATTEMPT):\s*(\S+)\n?/;

function parseLeadingTags(note: string): { tags: Partial<Record<"BEAT" | "ATTEMPT", string>>; rest: string } {
  const tags: Partial<Record<"BEAT" | "ATTEMPT", string>> = {};
  let rest = note;
  let match: RegExpMatchArray | null;
  while ((match = rest.match(TAG_LINE))) {
    tags[match[1] as "BEAT" | "ATTEMPT"] = match[2];
    rest = rest.slice(match[0].length);
  }
  return { tags, rest: rest.trim() };
}

/** Strips any leading BEAT:/ATTEMPT: tag lines before handing a note's
 *  text to the Critic or a prompt -- the tags are bookkeeping for
 *  matchesNoteScope, not part of the actual decision text. */
export function stripBeatTag(note: string): string {
  return parseLeadingTags(note).rest;
}

/** true if `note` should apply when reviewing the given scope. See the
 *  module docstring for the exact matching rules per tag combination. */
export function matchesBeatScope(note: string, scope: NoteScope = {}): boolean {
  const { tags } = parseLeadingTags(note);
  if (tags.BEAT !== undefined && tags.BEAT !== scope.beatId) return false;
  if (tags.ATTEMPT !== undefined && tags.ATTEMPT !== scope.attemptId) return false;
  return true;
}

/** Prepends the tag line(s) for `scope` (only the ones actually set) to
 *  `text` -- the inverse of parseLeadingTags/stripBeatTag. */
export function tagNote(scope: NoteScope, text: string): string {
  const lines: string[] = [];
  if (scope.beatId) lines.push(`BEAT: ${scope.beatId}`);
  if (scope.attemptId) lines.push(`ATTEMPT: ${scope.attemptId}`);
  return lines.length ? `${lines.join("\n")}\n${text}` : text;
}
