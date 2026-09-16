/**
 * Builds per-word caption timing cues for the Blender editor's two
 * caption tracks (Hatam + speaker name; English), per Dan's direction
 * (2026-09-10) to replicate what already works in his BVET project.
 *
 * Word-highlight timing mirrors BVET's own approach exactly (see
 * src/BvetApp.tsx's hatamPlaybackReference / englishPlaybackReference in
 * C:\Users\danbr\OneDrive\Documents\OpenAI-Code Comics):
 *   - Hatam: real segment-level timing from chapter-alignment.json
 *     (Gemini listened to the real narrator audio and matched it against
 *     the known text -- see align-mark-2-chapter.ts), with words WITHIN
 *     one matched segment evenly split across that segment's real
 *     duration. Any gap the alignment didn't cover falls back to an
 *     even split across the gap's own real time budget, so no word is
 *     ever left without a timing slot.
 *   - English: simple even split across the whole cue's real duration
 *     (BVET does not attempt real alignment for the English reference
 *     either -- it's a translation with different pacing than the Hatam
 *     audio).
 *
 * Covers BOTH the continuous narration beds AND every individual
 * dialogue-carrying shot (Dan caught by watching, 2026-09-10: captions
 * vanished during Jesus's real dialogue at Shot 5 because that plays on
 * the dialogue channel, not a narration bed -- v1 only covered beds).
 * Dialogue shots reuse the SAME chapter-wide alignment: the real FCBH
 * narrator audio reads the quoted dialogue too (just voiced separately
 * in the composite_cast_master redub), so the same global per-word
 * timing table applies -- anchored via each dialogue shot's own real
 * "vocals.mp3" audio_segments row instead of a bed's.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";

const dataDir = getDataDir();
const db = getDb();
const hatamDocx = join(dataDir, "assets", "source/hatam/mark-2/mark-2-text.docx");
const englishDocx = join(dataDir, "assets", "reference/english/mark-2/mark-2-text.docx");
const alignmentPath = join(dataDir, "assets", "generated/alignment/mark-2/chapter-alignment.json");
const healingSequencePath = process.argv[2];
if (!healingSequencePath) {
  console.error("Usage: npx tsx scripts/build-caption-cues.ts <healing-sequence.json>");
  process.exit(1);
}

interface AlignmentSegment {
  start: number;
  end: number;
  streamStart: number | null;
  streamEnd: number | null;
  nonScripture: boolean;
}
interface AlignmentFile {
  segments: AlignmentSegment[];
  chapterDurationSec?: number;
}
const alignment: AlignmentFile = JSON.parse(readFileSync(alignmentPath, "utf-8"));
const matchedSegments = alignment.segments
  .filter((s) => s.streamStart != null && s.streamEnd != null)
  .sort((a, b) => a.streamStart! - b.streamStart!);

// Rebuild the SAME global Hatam word stream align-mark-2-chapter.ts used,
// so word indices line up exactly with the alignment file's streamStart/
// streamEnd.
const normWord = (w: string) => w.toLowerCase().replace(/[“”‘’"'!?.,;:()[\]-]/g, "").trim();
const hatamVerseRecords = parseSourceTextByVerse(hatamDocx);
const hatamRawVerses = new Map<number, string>();
for (const r of hatamVerseRecords) {
  hatamRawVerses.set(r.verse, (hatamRawVerses.get(r.verse) ? hatamRawVerses.get(r.verse) + " " : "") + r.text);
}
interface StreamWord {
  raw: string;
  verse: number;
}
const hatamStream: StreamWord[] = [];
for (const [verse, text] of [...hatamRawVerses.entries()].sort((a, b) => a[0] - b[0])) {
  for (const raw of text.split(/\s+/)) {
    if (normWord(raw)) hatamStream.push({ raw, verse });
  }
}

const englishVerseRecords = parseSourceTextByVerse(englishDocx);
const englishRawVerses = new Map<number, string>();
for (const r of englishVerseRecords) {
  englishRawVerses.set(r.verse, (englishRawVerses.get(r.verse) ? englishRawVerses.get(r.verse) + " " : "") + r.text);
}
function englishWordsForVerseRange(verseStart: number, verseEnd: number): StreamWord[] {
  const words: StreamWord[] = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    const t = englishRawVerses.get(v);
    if (!t) continue;
    for (const raw of t.split(/\s+/)) {
      if (raw) words.push({ raw, verse: v });
    }
  }
  return words;
}

interface WordCue {
  word: string;
  verse: number;
  startMs: number;
  endMs: number;
}

/**
 * Real per-word timing for the WHOLE chapter's Hatam word stream, in the
 * source audio's own timeline (seconds) -- computed once, globally, so
 * slicing a bed's own [sourceStartMs, sourceStartMs+durationMs) window
 * out of it later is pure arithmetic with no boundary-straddling risk.
 * (An earlier per-bed version filtered words by VERSE NUMBER instead of
 * real time, which broke exactly where a verse's audio is split across
 * two different real segments -- e.g. Mark 2:5's narrated setup and its
 * quoted "your sins are forgiven" line are two separate audio pieces,
 * but both are verse 5 -- producing inverted/overflowing timestamps at
 * that boundary. Slicing by real time instead of verse number avoids
 * that entirely.)
 */
function globalHatamWordStartSec(): number[] {
  const starts = new Array<number>(hatamStream.length);
  let idx = 0;
  let cursorSec = 0;
  const chapterEndSec = alignment.chapterDurationSec ?? matchedSegments.at(-1)?.end ?? 0;
  while (idx < hatamStream.length) {
    const seg = matchedSegments.find((s) => s.streamStart! <= idx && idx < s.streamEnd!);
    if (seg) {
      const segWordCount = seg.streamEnd! - seg.streamStart!;
      const segStartSec = Math.max(cursorSec, seg.start);
      const perWordSec = (seg.end - segStartSec) / segWordCount;
      for (let w = idx; w < seg.streamEnd!; w++) {
        const offsetInSeg = w - seg.streamStart!;
        starts[w] = segStartSec + offsetInSeg * perWordSec;
      }
      cursorSec = Math.max(cursorSec, seg.end);
      idx = seg.streamEnd!;
    } else {
      const nextSeg = matchedSegments.find((s) => s.streamStart! > idx);
      const gapEndIdx = nextSeg ? nextSeg.streamStart! : hatamStream.length;
      const gapEndSec = nextSeg ? nextSeg.start : chapterEndSec;
      const gapWordCount = gapEndIdx - idx;
      const perWordSec = Math.max(0.001, (gapEndSec - cursorSec) / Math.max(1, gapWordCount));
      for (let w = idx; w < gapEndIdx; w++) {
        starts[w] = cursorSec + (w - idx) * perWordSec;
      }
      cursorSec = gapEndSec;
      idx = gapEndIdx;
    }
  }
  return starts;
}
const hatamWordStartSec = globalHatamWordStartSec();

/**
 * Slices the global per-word timing table down to one bed's real audio
 * window, mapped onto that bed's own project-timeline position.
 */
function hatamWordCues(sourceStartMs: number, sourceDurationMs: number, timelineStartMs: number): WordCue[] {
  const sourceStartSec = sourceStartMs / 1000;
  const sourceEndSec = (sourceStartMs + sourceDurationMs) / 1000;
  const cues: WordCue[] = [];
  for (let i = 0; i < hatamStream.length; i++) {
    const startSec = hatamWordStartSec[i]!;
    if (startSec < sourceStartSec || startSec >= sourceEndSec) continue;
    const endSec = i + 1 < hatamStream.length ? Math.min(hatamWordStartSec[i + 1]!, sourceEndSec) : sourceEndSec;
    const startMs = timelineStartMs + (startSec - sourceStartSec) * 1000;
    const endMs = timelineStartMs + (Math.max(startSec, endSec) - sourceStartSec) * 1000;
    cues.push({
      word: hatamStream[i]!.raw,
      verse: hatamStream[i]!.verse,
      startMs: Math.round(startMs),
      endMs: Math.round(Math.max(startMs + 1, endMs))
    });
  }
  return cues;
}

function englishWordCues(words: StreamWord[], timelineStartMs: number, timelineDurationMs: number): WordCue[] {
  const perWordMs = timelineDurationMs / Math.max(1, words.length);
  return words.map((w, i) => ({
    word: w.raw,
    verse: w.verse,
    startMs: Math.round(timelineStartMs + i * perWordMs),
    endMs: Math.round(timelineStartMs + (i + 1) * perWordMs)
  }));
}

interface CaptionCue {
  id: string;
  speaker: string;
  verseLabel: string;
  timelineStartMs: number;
  timelineEndMs: number;
  hatamWords: WordCue[];
  englishWords: WordCue[];
}

const healingSequence = JSON.parse(readFileSync(healingSequencePath, "utf-8"));
const cues: CaptionCue[] = [];

for (const bed of healingSequence.audioBeds as Array<{ label: string; sourceStartMs: number; durationMs: number; timelineStartMs: number }>) {
  // bed.label looks like "Mark 2:1-5 (narration)" -- pull the verse range.
  const m = bed.label.match(/Mark 2:(\d+)(?:-(\d+))?/);
  if (!m) continue;
  const verseStart = Number(m[1]);
  const verseEnd = m[2] ? Number(m[2]) : verseStart;

  // Sliced by REAL TIME (not verse number -- see hatamWordCues's header
  // comment for why verse-number slicing broke at exactly this kind of
  // boundary).
  const hatamWords = hatamWordCues(bed.sourceStartMs, bed.durationMs, bed.timelineStartMs);
  if (!hatamWords.length) continue;
  const englishWordsSource = englishWordsForVerseRange(verseStart, verseEnd);
  const englishWords = englishWordCues(englishWordsSource, bed.timelineStartMs, bed.durationMs);

  cues.push({
    id: bed.label.replace(/[^a-zA-Z0-9]+/g, "-"),
    speaker: "Narrator",
    verseLabel: `Mark 2:${verseStart}${verseEnd !== verseStart ? `-${verseEnd}` : ""}`,
    timelineStartMs: bed.timelineStartMs,
    timelineEndMs: bed.timelineStartMs + bed.durationMs,
    hatamWords,
    englishWords
  });
  console.log(`${bed.label}: ${hatamWords.length} Hatam words, ${englishWords.length} English words, ${verseEnd - verseStart + 1} verse(s)`);
}

// Every individual dialogue-carrying shot (real audio, not muted) --
// these play on the dialogue channel, independent of the narration
// beds, and need their own captions using the same alignment table.
for (const seg of healingSequence.videoSegments as Array<{
  label: string;
  hasAudio: boolean;
  muteOwnAudio: boolean;
  startMs: number;
  durationMs: number;
}>) {
  if (!seg.hasAudio || seg.muteOwnAudio) continue;
  const m = seg.label.match(/Mark 2:(\d+)(?:-(\d+))?/);
  if (!m) continue;
  const verseStart = Number(m[1]);
  const verseEnd = m[2] ? Number(m[2]) : verseStart;
  const verseRef = `Mark 2:${verseStart}${verseEnd !== verseStart ? `-${verseEnd}` : ""}`;

  let audioRow = db
    .prepare(`SELECT verse_ref, source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = ? AND source_path LIKE '%vocals%'`)
    .get(verseRef) as { verse_ref: string; source_path: string; start_ms: number; end_ms: number } | undefined;
  if (!audioRow) {
    // Fallback: the shot's own verse label doesn't always match the real
    // dialogue audio's verse range exactly (e.g. a shot labeled "8-9"
    // whose actual composite_cast_master line spans "8-10") -- fall back
    // to any vocals.mp3 row whose own verse range OVERLAPS this shot's.
    // Dialogue shots must match a real dialogue line, never a narration
    // bed row -- a narration bed's verse range can spuriously "overlap" a
    // dialogue shot's own range (e.g. shot "8-9" vs bed "5-8 (narration)")
    // while the real matching dialogue line ("8-10") sits right next to it.
    const candidates = db
      .prepare(
        `SELECT verse_ref, source_path, start_ms, end_ms FROM audio_segments
         WHERE source_path LIKE '%vocals%' AND verse_ref LIKE 'Mark 2:%' AND verse_ref NOT LIKE '%narration%'`
      )
      .all() as Array<{ verse_ref: string; source_path: string; start_ms: number; end_ms: number }>;
    let bestOverlap: { verse_ref: string; source_path: string; start_ms: number; end_ms: number } | undefined;
    let bestDistance = Infinity;
    for (const c of candidates) {
      const cm = c.verse_ref.match(/Mark 2:(\d+)(?:-(\d+))?/);
      if (!cm) continue;
      const cStart = Number(cm[1]);
      const cEnd = cm[2] ? Number(cm[2]) : cStart;
      if (cStart > verseEnd || cEnd < verseStart) continue;
      const distance = Math.abs(cStart - verseStart) + Math.abs(cEnd - verseEnd);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOverlap = c;
      }
    }
    const overlap = bestOverlap;
    if (overlap) {
      console.log(`  (verse label mismatch: "${seg.label}" [${verseRef}] using overlapping audio_segments row "${overlap.verse_ref}")`);
      audioRow = overlap;
    }
  }
  if (!audioRow) {
    console.log(`  (no vocals.mp3 audio_segments row for "${seg.label}" [${verseRef}] -- skipping caption)`);
    continue;
  }

  const speakerRow = db
    .prepare(
      `SELECT c.name FROM shots s JOIN characters c ON c.id = s.dialogue_character_id
       WHERE s.verse_ref = ? LIMIT 1`
    )
    .get(verseRef) as { name: string } | undefined;
  const speaker = speakerRow?.name ?? "Speaker";

  const hatamWords = hatamWordCues(audioRow.start_ms, seg.durationMs, seg.startMs);
  if (!hatamWords.length) {
    console.log(`  (no aligned Hatam words for "${seg.label}" [${verseRef}] -- skipping caption)`);
    continue;
  }
  // Use the RESOLVED audio segment's own verse range for the English text
  // (not the shot's label), so a fallback-matched wider range (e.g.
  // "8-10" resolved from a "8-9" label) shows the full corresponding
  // English text instead of running short.
  const resolvedRangeMatch = audioRow.verse_ref.match(/Mark 2:(\d+)(?:-(\d+))?/);
  const englishVerseStart = resolvedRangeMatch ? Number(resolvedRangeMatch[1]) : verseStart;
  const englishVerseEnd = resolvedRangeMatch ? (resolvedRangeMatch[2] ? Number(resolvedRangeMatch[2]) : englishVerseStart) : verseEnd;
  const englishWordsSource = englishWordsForVerseRange(englishVerseStart, englishVerseEnd);
  const englishWords = englishWordCues(englishWordsSource, seg.startMs, seg.durationMs);

  cues.push({
    id: seg.label.replace(/[^a-zA-Z0-9]+/g, "-"),
    speaker,
    verseLabel: verseRef,
    timelineStartMs: seg.startMs,
    timelineEndMs: seg.startMs + seg.durationMs,
    hatamWords,
    englishWords
  });
  console.log(`${seg.label} (${speaker}): ${hatamWords.length} Hatam words, ${englishWords.length} English words`);
}

const outPath = healingSequencePath.replace(/\.json$/, "-captions.json");
writeFileSync(outPath, JSON.stringify(cues, null, 2));
console.log(`Wrote ${outPath}`);
