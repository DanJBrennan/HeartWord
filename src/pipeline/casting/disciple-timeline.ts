/**
 * Pure logic for the disciple-timeline gate: has a given canon character
 * actually joined Jesus's followers by the time of a given scene, or does
 * the story not introduce them until later?
 *
 * Built 2026-09-06 after Dan asked how to make sure a disciple who's
 * already joined by a given point in the story (e.g. Matthew, called at
 * Mark 2:14) stays present in every later scene's "the disciples" cast,
 * without relying on Gemini's own narrative judgment each time -- the
 * same "trust but verify with real data, not a model's memory" principle
 * as everywhere else in this codebase (framing/camera validation,
 * character-name resolution, canonical-likeness). `characters.
 * joined_narrative_at` records each disciple's calling verse once, and
 * casting/index.ts's canon-character query filters by it automatically
 * for every future scene/chapter/book -- "remembered" by living in the
 * database, not by hoping a prompt gets re-read carefully each time.
 *
 * Scope, stated plainly: this only compares chapter/verse WITHIN the same
 * book. A `joined_narrative_at` in a different book than the current
 * project's book can't be ordered by this alone (no canonical book-order
 * table exists yet) -- treated as already-joined (the permissive default)
 * rather than blocking a character over an unresolvable comparison. Every
 * real value populated so far (2026-09-06) is within Mark, so this
 * limitation isn't live yet, but it's a real gap if a future chapter's
 * project is a different book and needs to gate a same-book-as-Mark
 * disciple whose calling was recorded relative to Mark specifically.
 */

interface BookChapterVerse {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * Parses "Mark 1:16" or "Mark 1:16-18" (using the range's start) into its
 * book/chapter/verse. Book is lowercased for case-insensitive comparison.
 * Throws on a reference this loose format can't parse -- callers should
 * treat a throw as "can't determine" the same way the catch blocks
 * elsewhere in casting/index.ts do for a malformed verseRef.
 */
export function parseBookChapterVerse(ref: string): BookChapterVerse {
  const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)/);
  if (!match) {
    throw new Error(`parseBookChapterVerse: could not parse "${ref}" as "Book chapter:verse"`);
  }
  const [, book, chapter, verse] = match;
  if (!book || !chapter || !verse) {
    throw new Error(`parseBookChapterVerse: incomplete capture groups for "${ref}"`);
  }
  return { book: book.trim().toLowerCase(), chapter: Number(chapter), verse: Number(verse) };
}

/**
 * Has a character whose calling is recorded as `joinedNarrativeAt`
 * actually joined by `sceneStartRef`? A null/undefined `joinedNarrativeAt`
 * means this character isn't gated by a calling moment at all (Jesus, a
 * one-chapter character, a group member) -- always available. A
 * malformed reference on either side fails permissive (true) rather than
 * silently excluding a character over a parsing hiccup -- matches this
 * codebase's general "default to inclusion, flag the ambiguity" instinct
 * for casting (see casting/index.ts's unresolved-character-name handling,
 * which drops and flags rather than guessing, but here the safer default
 * is the opposite: wrongly EXCLUDING an already-joined disciple silently
 * breaks continuity in a way nothing downstream would ever catch, while
 * wrongly including one costs nothing but is easy to review away).
 */
export function hasJoinedByScene(joinedNarrativeAt: string | null | undefined, sceneStartRef: string): boolean {
  if (!joinedNarrativeAt) return true;
  try {
    const joined = parseBookChapterVerse(joinedNarrativeAt);
    const scene = parseBookChapterVerse(sceneStartRef);
    if (joined.book !== scene.book) return true; // can't order across books yet -- see module docstring
    if (joined.chapter !== scene.chapter) return joined.chapter < scene.chapter;
    return joined.verse <= scene.verse;
  } catch {
    return true;
  }
}
