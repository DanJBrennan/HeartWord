/**
 * Full-chapter alignment of the real FCBH Hatam narrator audio to the
 * Mark 2 chapter text -- ported from Dan's own working BVET project
 * (C:\Users\danbr\OneDrive\Documents\OpenAI-Code Comics\scripts\voice\
 * align-chapter.mjs), which he confirmed already does exactly the
 * captioning he wants for the Blender editor. NOT classical forced
 * alignment (no espeak/aeneas needed, which is why those tools kept
 * hitting dead ends on this Windows machine and can't speak Hatam
 * anyway) -- Gemini LISTENS to each real speech segment and identifies
 * which VERBATIM span of the known Hatam text it corresponds to, then
 * those matches are globally fuzzy-matched against the full word stream
 * and reduced to a monotonic, non-overlapping anchor chain.
 *
 * Method (identical to the BVET original):
 *   1. Silence-detect speech segments; recursively split segments > MAX_SEG_SEC
 *      with stricter silence params.
 *   2. Ask Gemini per segment for the VERBATIM chapter-text span it contains
 *      (structured JSON output; empty for announcements/framing).
 *   3. Globally fuzzy-match each span to the verse-tagged word stream, then
 *      select a monotonic chain of confident anchors (weighted LIS).
 *   4. Constrained second pass for unresolved segments between anchors
 *      (region-limited text, stronger model).
 *   5. Emit chapter-alignment.json with per-segment times, verse coverage.
 *
 * Usage: npx tsx scripts/align-mark-2-chapter.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { getDataDir } from "../src/db/client.js";
import { parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";

const dataDir = getDataDir();
const audioPath = path.join(dataDir, "assets", "source/hatam/mark-2/mark-2-fcbh-audio.mp3");
const docxPath = path.join(dataDir, "assets", "source/hatam/mark-2/mark-2-text.docx");
const outDir = path.join(dataDir, "assets", "generated/alignment/mark-2");
fs.mkdirSync(outDir, { recursive: true });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");
const FAST_MODEL = process.env.TRANSCRIBE_MODEL || "gemini-3.5-flash";
const STRONG_MODEL = process.env.TRANSCRIBE_MODEL_STRONG || "gemini-3.1-pro-preview";
const CONCURRENCY = Number(process.env.ALIGN_CONCURRENCY || 6);
const MAX_SEG_SEC = 14;

async function generateContent(model: string, audioBase64: string, promptText: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "audio/wav", data: audioBase64 } }, { text: promptText }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { span: { type: "string", nullable: true }, isScripture: { type: "boolean" } },
          required: ["isScripture"]
        },
        temperature: 0,
        maxOutputTokens: 2048
      }
    })
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`Gemini generateContent (${model}) failed: ${res.status} -- ${JSON.stringify(data).slice(0, 500)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini generateContent (${model}) returned no text -- ${JSON.stringify(data).slice(0, 500)}`);
  return text;
}

// ---------- 1. Verse word stream

const verseRecords = parseSourceTextByVerse(docxPath);
const rawVerses = new Map<number, string>();
for (const r of verseRecords) {
  rawVerses.set(r.verse, (rawVerses.get(r.verse) ? rawVerses.get(r.verse) + " " : "") + r.text);
}
const verses = [...rawVerses.entries()].map(([verse, text]) => ({ verse, text })).sort((a, b) => a.verse - b.verse);

const normWord = (w: string) => w.toLowerCase().replace(/[“”‘’"'!?.,;:()[\]-]/g, "").trim();

interface StreamWord {
  raw: string;
  norm: string;
  verse: number;
  inQuote: boolean;
}
const stream: StreamWord[] = [];
{
  let inQuote = false;
  for (const v of verses) {
    for (const raw of v.text.split(/\s+/)) {
      if (!raw) continue;
      if ((raw.match(/[“]/g) || []).length > 0) inQuote = true;
      const norm = normWord(raw);
      if (norm) stream.push({ raw, norm, verse: v.verse, inQuote });
      if ((raw.match(/[”]/g) || []).length > 0) inQuote = false;
    }
  }
}
console.log(`word stream: ${stream.length} words across ${verses.length} verses`);

// ---------- 2. Segmentation (recursive silence split)

const wav16k = path.join(outDir, "chapter-16k.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", audioPath, "-map", "a:0", "-ac", "1", "-ar", "16000", wav16k]);
const chapterDur = Number(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav16k]).toString().trim()
);

function detectSilence(file: string, noiseDb: number, minDur: number, offset = 0) {
  const sd = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minDur}`, "-f", "null", "-"], {
    encoding: "utf8"
  });
  const log = (sd.stderr || "") + (sd.stdout || "");
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]) + offset);
  const ends = [...log.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]) + offset);
  return { starts, ends };
}

function speechSegments(file: string, totalDur: number, noiseDb: number, minDur: number, offset = 0) {
  const { starts, ends } = detectSilence(file, noiseDb, minDur, offset);
  const segs: Array<{ start: number; end: number }> = [];
  let cursor = offset;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! - cursor > 0.4) segs.push({ start: cursor, end: starts[i]! });
    cursor = ends[i] ?? offset + totalDur;
  }
  if (offset + totalDur - cursor > 0.4) segs.push({ start: cursor, end: offset + totalDur });
  return segs;
}

let segments = speechSegments(wav16k, chapterDur, -35, 0.35);

const SPLIT_PARAMS = [
  { noiseDb: -32, minDur: 0.28 },
  { noiseDb: -28, minDur: 0.22 },
  { noiseDb: -25, minDur: 0.18 }
];
const tmpDir = path.join(outDir, "tmp-split");
fs.mkdirSync(tmpDir, { recursive: true });
for (const params of SPLIT_PARAMS) {
  const next: Array<{ start: number; end: number }> = [];
  for (const seg of segments) {
    if (seg.end - seg.start <= MAX_SEG_SEC) {
      next.push(seg);
      continue;
    }
    const piece = path.join(tmpDir, `piece-${seg.start.toFixed(2)}.wav`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(seg.start), "-t", String(seg.end - seg.start), "-i", wav16k, piece]);
    const sub = speechSegments(piece, seg.end - seg.start, params.noiseDb, params.minDur, seg.start);
    next.push(...(sub.length > 1 ? sub : [seg]));
  }
  segments = next;
}
segments = segments.map((s) => ({ start: Number(s.start.toFixed(2)), end: Number(s.end.toFixed(2)) }));
const longLeft = segments.filter((s) => s.end - s.start > MAX_SEG_SEC);
console.log(`speech segments: ${segments.length}; still >${MAX_SEG_SEC}s: ${longLeft.length}`);

// ---------- 3. Span identification per segment (structured output)

const segDir = path.join(outDir, "seg-audio");
fs.mkdirSync(segDir, { recursive: true });

const spanCachePath = path.join(outDir, "span-cache.json");
const spanCache: Record<string, string> = fs.existsSync(spanCachePath) ? JSON.parse(fs.readFileSync(spanCachePath, "utf8")) : {};
const saveSpanCache = () => fs.writeFileSync(spanCachePath, JSON.stringify(spanCache, null, 1));

function segFileFor(seg: { start: number; end: number }) {
  return path.join(segDir, `seg-${seg.start.toFixed(2)}-${seg.end.toFixed(2)}.wav`);
}

async function identifySpan(seg: { start: number; end: number }, contextText: string, model: string): Promise<string> {
  const cacheKey = `${seg.start.toFixed(2)}-${seg.end.toFixed(2)}-${model}`;
  if (cacheKey in spanCache) return spanCache[cacheKey]!;
  const segFile = segFileFor(seg);
  if (!fs.existsSync(segFile)) {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.max(0, seg.start - 0.1)), "-t", String(seg.end - seg.start + 0.2), "-i", wav16k, segFile]);
  }
  const audioBase64 = fs.readFileSync(segFile).toString("base64");
  const promptText =
    `Reference Hatam Bible text:\n${contextText}\n\n` +
    `The attached ${(seg.end - seg.start).toFixed(1)}-second audio clip is a consecutive portion of a narrator reading this text aloud — OR a book/chapter announcement or framing that is NOT in the text.\n` +
    `Return JSON: { "isScripture": boolean, "span": string } where span is the VERBATIM portion of the reference text the clip corresponds to (copy exact words, no [v#] markers). ` +
    `The span's length must be plausible for the clip duration (roughly 2-3 words per second). If not scripture, set isScripture=false and omit span.`;
  const responseText = await generateContent(model, audioBase64, promptText);
  const parsed = JSON.parse(responseText);
  const result = parsed.isScripture ? parsed.span || "" : "";
  spanCache[cacheKey] = result;
  return result;
}

const chapterText = verses.map((v) => `[v${v.verse}] ${v.text}`).join("\n");
const spans: Array<string | null> = new Array(segments.length);
{
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < segments.length) {
      const i = nextIndex++;
      try {
        spans[i] = await identifySpan(segments[i]!, chapterText, FAST_MODEL);
      } catch (err: any) {
        console.error(`\nseg-${i} span error: ${err.message}`);
        spans[i] = null;
      }
      process.stdout.write(`\rspan pass 1: ${i + 1}/${segments.length}   `);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveSpanCache();
  console.log("");
}

// ---------- 4. Global fuzzy matching + monotonic anchors

const editDistance = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.6) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
};
const wordSim = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = editDistance(a, b);
  return Math.max(0, 1 - d / Math.max(a.length, b.length));
};

function bestMatch(tWords: string[], fromOffset: number, toOffset: number) {
  let best = { score: -1, offset: fromOffset };
  for (let offset = fromOffset; offset <= toOffset; offset++) {
    let total = 0;
    for (let k = 0; k < tWords.length; k++) {
      const sw = stream[offset + k];
      if (!sw) break;
      total += wordSim(tWords[k]!, sw.norm);
    }
    const s = total / tWords.length;
    if (s > best.score) best = { score: s, offset };
  }
  return best;
}

const wordsPerSecOk = (nWords: number, seconds: number) => {
  const rate = nWords / Math.max(seconds, 0.3);
  return rate >= 0.8 && rate <= 5.5;
};

interface Result {
  index: number;
  start: number;
  end: number;
  span: string | null;
  tWords: string[];
  streamStart: number | null;
  streamEnd: number | null;
  score: number;
  nonScripture: boolean;
  errored: boolean;
  globalScore?: number;
  globalOffset?: number;
  anchor?: boolean;
  verses?: number[];
  quotePurity?: number;
  text?: string;
  note?: string;
}

const results: Result[] = segments.map((seg, i) => ({
  index: i,
  start: seg.start,
  end: seg.end,
  span: spans[i]!,
  tWords: (spans[i] || "").split(/\s+/).map(normWord).filter(Boolean),
  streamStart: null,
  streamEnd: null,
  score: 0,
  nonScripture: spans[i] === "",
  errored: spans[i] === null
}));

for (const r of results) {
  if (!r.tWords.length) continue;
  const m = bestMatch(r.tWords, 0, stream.length - 1);
  r.globalScore = Number(m.score.toFixed(3));
  r.globalOffset = m.offset;
}

const candidates = results.filter((r) => r.tWords.length >= 3 && (r.globalScore ?? 0) >= 0.6 && wordsPerSecOk(r.tWords.length, r.end - r.start));
const lisBest = new Array(candidates.length).fill(0);
const lisPrev = new Array(candidates.length).fill(-1);
for (let i = 0; i < candidates.length; i++) {
  lisBest[i] = candidates[i]!.globalScore! * candidates[i]!.tWords.length;
  for (let j = 0; j < i; j++) {
    const ok = candidates[j]!.index < candidates[i]!.index && candidates[j]!.globalOffset! + candidates[j]!.tWords.length <= candidates[i]!.globalOffset! + 2;
    if (ok && lisBest[j] + candidates[i]!.globalScore! * candidates[i]!.tWords.length > lisBest[i]) {
      lisBest[i] = lisBest[j] + candidates[i]!.globalScore! * candidates[i]!.tWords.length;
      lisPrev[i] = j;
    }
  }
}
let bestEnd = 0;
for (let i = 1; i < candidates.length; i++) if (lisBest[i] > lisBest[bestEnd]) bestEnd = i;
const anchorSet = new Set<number>();
if (candidates.length) {
  for (let i = bestEnd; i >= 0; i = lisPrev[i]) {
    anchorSet.add(candidates[i]!.index);
    if (lisPrev[i] === -1) break;
  }
}
for (const r of results) {
  if (anchorSet.has(r.index)) {
    r.streamStart = r.globalOffset!;
    r.streamEnd = Math.min(stream.length, r.globalOffset! + r.tWords.length);
    r.score = r.globalScore!;
    r.anchor = true;
  }
}
console.log(`anchors: ${anchorSet.size}/${results.length}`);

// ---------- 5. Constrained fill between anchors (with strong-model retry)

function anchorBounds(index: number) {
  let lo = 0;
  let hi = stream.length;
  for (const r of results) {
    if (r.streamStart == null) continue;
    if (r.index < index) lo = Math.max(lo, r.streamEnd! - 2);
    if (r.index > index && hi === stream.length) hi = Math.min(hi, r.streamStart + 2);
  }
  return { lo, hi };
}

const unresolved = results.filter((r) => !r.anchor && !r.nonScripture);
for (const r of unresolved) {
  const { lo, hi } = anchorBounds(r.index);
  if (hi - lo < 1) {
    r.note = "no room between anchors (likely repeat/announcement)";
    continue;
  }
  const regionVerses = [...new Set(stream.slice(lo, hi).map((w) => w.verse))];
  const regionText = verses
    .filter((v) => regionVerses.includes(v.verse))
    .map((v) => `[v${v.verse}] ${v.text}`)
    .join("\n");
  try {
    const span = await identifySpan({ start: r.start, end: r.end }, regionText, STRONG_MODEL);
    if (span) {
      r.span = span;
      r.tWords = span.split(/\s+/).map(normWord).filter(Boolean);
    } else {
      r.nonScripture = true;
      continue;
    }
  } catch (err: any) {
    console.error(`seg-${r.index} strong-model retry error: ${err.message}`);
  }
  if (!r.tWords.length) continue;
  const m = bestMatch(r.tWords, lo, Math.max(lo, hi - r.tWords.length));
  if (m.score >= 0.45 && wordsPerSecOk(r.tWords.length, r.end - r.start)) {
    r.streamStart = m.offset;
    r.streamEnd = Math.min(stream.length, m.offset + r.tWords.length);
    r.score = Number(m.score.toFixed(3));
  } else {
    r.note = `fill match too weak (${m.score.toFixed(2)})`;
  }
  process.stdout.write(`\rfill pass: seg ${r.index}   `);
}
saveSpanCache();
console.log("");

// ---------- 6. Decorate + emit

for (const r of results) {
  delete (r as any).tWords;
  if (r.streamStart == null) continue;
  const words = stream.slice(r.streamStart, r.streamEnd!);
  r.verses = [...new Set(words.map((w) => w.verse))];
  const quoteWords = words.filter((w) => w.inQuote).length;
  r.quotePurity = words.length ? Number((quoteWords / words.length).toFixed(2)) : 0;
  r.text = words.map((w) => w.raw).join(" ");
}

const matched = results.filter((r) => r.streamStart != null);
const covered = new Array(stream.length).fill(false);
for (const r of matched) for (let k = r.streamStart!; k < r.streamEnd!; k++) covered[k] = true;
const gaps: Array<{ fromWord: number; toWord: number; verses: number[] }> = [];
let gapStart: number | null = null;
for (let k = 0; k <= stream.length; k++) {
  if (k < stream.length && !covered[k]) {
    if (gapStart == null) gapStart = k;
  } else if (gapStart != null) {
    gaps.push({ fromWord: gapStart, toWord: k - 1, verses: [...new Set(stream.slice(gapStart, k).map((w) => w.verse))] });
    gapStart = null;
  }
}

const out = {
  audio: audioPath,
  docx: docxPath,
  models: { fast: FAST_MODEL, strong: STRONG_MODEL },
  chapterDurationSec: chapterDur,
  wordCount: stream.length,
  matchedSegments: matched.length,
  totalSegments: results.length,
  coverageGaps: gaps,
  segments: results
};
fs.writeFileSync(path.join(outDir, "chapter-alignment.json"), JSON.stringify(out, null, 2));

console.log(`Wrote ${path.join(outDir, "chapter-alignment.json")}`);
console.log(
  `matched ${matched.length}/${results.length}; non-scripture ${results.filter((r) => r.nonScripture).length}; ` +
    `unmatched ${results.filter((r) => !r.nonScripture && r.streamStart == null).length}; gaps ${gaps.length}`
);
if (gaps.length) {
  for (const g of gaps) console.log(`  gap: words ${g.fromWord}-${g.toWord} (verses ${g.verses.join(",")})`);
}
