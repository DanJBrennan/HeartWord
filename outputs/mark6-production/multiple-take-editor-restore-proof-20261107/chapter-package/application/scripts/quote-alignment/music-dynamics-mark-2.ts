/**
 * Music dynamics reader, Hatam Mark 2 drama edition -- for composer/sound-
 * design staff, not for quote alignment.
 *
 * Dan's request: the drama recording's underscore rises and falls in
 * volume at various points, and that shape probably reflects (or was
 * composed to support) emotional beats in the story -- can we extract
 * that shape and hand it to whoever crafts the eventual music overlay, so
 * they have more to go on than "add music somewhere in this chapter"?
 *
 * A FIRST ATTEMPT at this (before real source separation was available)
 * ran the same swell-detection logic against a classical-DSP "music-
 * emphasized" stream built from a modulation-based spectral gate, not a
 * real separation. It found 53 candidate events, of which only 3 cleared
 * a 15dB bar, and even those looked suspect (two sat right at the file's
 * absolute start/end, and one was an implausible rapid recede-then-build
 * pair) -- concluded NOT reliable enough to hand to anyone. See
 * docs/ARCHITECTURE.md and git history for that attempt.
 *
 * THIS version runs the identical detection logic against the real,
 * Demucs-separated music stem (assets/source/hatam/mark-2/separated/
 * music.mp3 -- drums+bass+other summed; see separate_audio.py) instead.
 * Results are qualitatively different and much more plausible: far fewer,
 * larger, more evenly-distributed events, most of which land right where
 * the text has a real dramatic turn (see the report's own annotations --
 * e.g. a recede-then-swell right around the crowd's amazed reaction to
 * the healing, and a sustained two-part build leading into the scribes'
 * objection scene). Treat this as a genuinely useful first pass for a
 * composer to react to, not a finished music-timing spec -- it reads
 * loudness only (not tempo, key, or instrumentation), and the two
 * boundary events (very start/end of the file) may still be the
 * recording's own fade-in/fade-out rather than a story-driven cue.
 *
 * Usage: npx tsx scripts/quote-alignment/music-dynamics-mark-2.ts
 * Output: HEARTWORD_DATA_DIR/exports/music-dynamics-Mark-2.txt
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../src/db/client.js";
import { getAudioDurationMs } from "../../src/pipeline/ingestion/detect-silences.js";
import { parseSourceTextByVerse, type VerseRecord } from "../../src/pipeline/ingestion/parse-source-text.js";
import { decodeToPcm16Mono } from "../../src/pipeline/ingestion/pitch.js";

const HOP_SEC = 1.0;
const SMOOTH_SEC = 3.0;
const MIN_RISE_DB = 6.0;

interface Envelope {
  times: number[];
  db: number[];
}

function rmsEnvelope(pcm: Int16Array, sampleRate: number): Envelope {
  const hop = Math.round(HOP_SEC * sampleRate);
  const n = Math.floor(pcm.length / hop);
  const times: number[] = [];
  const dbs: number[] = [];
  for (let i = 0; i < n; i++) {
    let sumSq = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) {
      const s = pcm[start + j]! / 32768;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / hop) + 1e-9;
    times.push(i * HOP_SEC);
    dbs.push(20 * Math.log10(rms));
  }
  return { times, db: dbs };
}

function smooth(values: number[], windowSec: number, hopSec: number): number[] {
  const win = Math.max(1, Math.round(windowSec / hopSec));
  const half = Math.floor(win / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j]!;
      count++;
    }
    out.push(sum / count);
  }
  return out;
}

interface SwellEvent {
  kind: "building" | "receding";
  tStart: number;
  tEnd: number;
  magnitudeDb: number;
}

function findSwells(times: number[], smoothedDb: number[], minRiseDb: number): SwellEvent[] {
  const events: SwellEvent[] = [];
  let i = 1;
  const n = smoothedDb.length;
  while (i < n) {
    if (smoothedDb[i]! > smoothedDb[i - 1]! + 1e-6) {
      let j = i;
      while (j + 1 < n && smoothedDb[j + 1]! >= smoothedDb[j]! - 0.05) j++;
      const rise = smoothedDb[j]! - smoothedDb[i - 1]!;
      if (rise >= minRiseDb) events.push({ kind: "building", tStart: times[i - 1]!, tEnd: times[j]!, magnitudeDb: rise });
      i = j + 1;
    } else if (smoothedDb[i]! < smoothedDb[i - 1]! - 1e-6) {
      let j = i;
      while (j + 1 < n && smoothedDb[j + 1]! <= smoothedDb[j]! + 0.05) j++;
      const fall = smoothedDb[i - 1]! - smoothedDb[j]!;
      if (fall >= minRiseDb) events.push({ kind: "receding", tStart: times[i - 1]!, tEnd: times[j]!, magnitudeDb: -fall });
      i = j + 1;
    } else {
      i++;
    }
  }
  return events;
}

function nearestVerse(verseTimes: Array<{ verse: number; startSec: number }>, t: number): number {
  let best = verseTimes[0]!.verse;
  for (const v of verseTimes) {
    if (v.startSec <= t) best = v.verse;
    else break;
  }
  return best;
}

function fmtMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

async function main() {
  const dataDir = getDataDir();
  const docxPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-text.docx");
  const musicPath = join(dataDir, "assets/source/hatam/mark-2/separated/music.mp3");

  const verses = parseSourceTextByVerse(docxPath);
  const totalDurationMs = getAudioDurationMs(musicPath);

  // Correct proportional verse-start-time computation (cumulative char
  // offset / total chars * duration), matching extractQuoteSpan exactly.
  const byVerse = new Map(verses.map((v) => [v.verse, v.text]));
  let cumulative = 0;
  const verseOffsets: Array<{ verse: number; charOffset: number }> = [];
  for (let verse = 1; verse <= 28; verse++) {
    const text = byVerse.get(verse);
    if (text === undefined) continue;
    verseOffsets.push({ verse, charOffset: cumulative });
    cumulative += text.length + 1;
  }
  const totalChars = cumulative - 1;
  const verseTimes = verseOffsets.map((v) => ({ verse: v.verse, startSec: (v.charOffset / totalChars) * (totalDurationMs / 1000) }));

  console.log(`Decoding ${musicPath} to PCM...`);
  const pcm = decodeToPcm16Mono(musicPath, 22050);
  const env = rmsEnvelope(pcm, 22050);
  const smoothed = smooth(env.db, SMOOTH_SEC, HOP_SEC);
  const events = findSwells(env.times, smoothed, MIN_RISE_DB).sort((a, b) => a.tStart - b.tStart);

  const lines: string[] = [];
  lines.push("HeartWord -- Music Dynamics Read: Hatam Mark 2 (for composer / sound-design staff)");
  lines.push("Edition: FCBH Drama, real Demucs-separated music stem (drums+bass+other, vocals removed)");
  lines.push("Generated: " + new Date().toISOString());
  lines.push(`Music track analyzed: ${musicPath} (${(totalDurationMs / 1000).toFixed(1)}s)`);
  lines.push(`Detection: loudness (RMS) envelope, 1s hop, ${SMOOTH_SEC}s smoothing, >= ${MIN_RISE_DB}dB threshold for a reportable rise/fall run`);
  lines.push("");
  lines.push("WHAT THIS IS: a read of the existing FCBH drama recording's own underscore -- where it swells");
  lines.push("(\"building\") and where it drops back (\"receding\"), each labeled with the nearest Hatam verse by");
  lines.push("proportional text position (same estimate convention as the quote-alignment reports, NOT word-level");
  lines.push("timing). This is meant as a REFERENCE for a composer writing new music for this chapter's video --");
  lines.push("evidence of where the original recording's own composer/producer chose to add emphasis -- not a");
  lines.push("spec to be reproduced exactly, and not itself the final music.");
  lines.push("");
  lines.push("CAVEATS:");
  lines.push("  - Loudness only. This says nothing about tempo, key, instrumentation, or melodic content.");
  lines.push("  - The very first and very last events in this list sit at the file's absolute start/end and may");
  lines.push("    simply be this recording's own fade-in/fade-out rather than a story-driven cue -- treat those");
  lines.push("    two with extra skepticism.");
  lines.push("  - Verse labels are the same proportional-position estimate the quote-alignment reports use, not a");
  lines.push("    verified word-level alignment -- treat as \"roughly here,\" not exact.");
  lines.push("  - This supersedes an earlier attempt run against a classical-DSP heuristic separation (not real");
  lines.push("    source separation), which found mostly noise (53 events, only 3 above 15dB, those looking like");
  lines.push("    artifacts) and was explicitly not delivered as reliable -- see docs/ARCHITECTURE.md.");
  lines.push("");
  lines.push("=".repeat(78));
  lines.push(`EVENTS (${events.length} found, >= ${MIN_RISE_DB}dB)`);
  lines.push("=".repeat(78));
  for (const e of events) {
    const v0 = nearestVerse(verseTimes, e.tStart);
    const v1 = nearestVerse(verseTimes, e.tEnd);
    const verseLabel = v0 === v1 ? `v${v0}` : `v${v0}-${v1}`;
    lines.push(`  ${e.kind.padEnd(9)} ${fmtMinSec(e.tStart)} -> ${fmtMinSec(e.tEnd)}  (${verseLabel})  ${e.magnitudeDb >= 0 ? "+" : ""}${e.magnitudeDb.toFixed(1)} dB`);
  }
  lines.push("");

  const outDir = join(dataDir, "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "music-dynamics-Mark-2.txt");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
