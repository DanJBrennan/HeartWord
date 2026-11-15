/** Source-only preparation: no production DB writes or model/provider calls. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { auditSourceBodyCoverage, parseChapterTitle, parseSourceTextByVerse, parseSourceHeadings } from "../src/pipeline/ingestion/parse-source-text.js";
import { planAlignmentIntervals } from "../src/pipeline/ingestion/gemini-alignment.js";
import { detectSilences, getAudioDurationMs } from "../src/pipeline/ingestion/detect-silences.js";

const [dataRoot, destination] = process.argv.slice(2);
if (!dataRoot || !destination) throw new Error("Usage: prepare-mark6-source.ts <data-root> <new-output-directory>");
const root = resolve(dataRoot), output = resolve(destination);
const hatam = join(root, "assets/source/hatam/text/Mark/Mark 6.docx");
const english = join(root, "assets/source/english-esv/text/Mark/Mark 6.docx");
const audio = join(root, "assets/source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___06_Markus______HADLAIN1DA.mp3");
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const verses = parseSourceTextByVerse(hatam), reference = parseSourceTextByVerse(english);
const expected = Array.from({ length: 56 }, (_, i) => i + 1);
for (const [label, records] of [["Hatam", verses], ["English reference", reference]] as const) {
  if (JSON.stringify(records.map(v => v.verse)) !== JSON.stringify(expected)) throw new Error(`${label} verse markers are not exactly Mark 6:1–56 in order. Retain for source inspection.`);
}
const durationMs = getAudioDurationMs(audio), gaps = detectSilences(audio, { noiseFloorDb: -30, minDurationSec: .15 });
const bodyCoverage = auditSourceBodyCoverage(hatam,6);
if (!bodyCoverage.complete) throw new Error("Mark 6 source extraction loses or reorders supplied body words.");
const alignmentGaps = detectSilences(audio);
const alignmentIntervals = planAlignmentIntervals(audio,durationMs,alignmentGaps);
const sourceHashes = { hatam: hash(hatam), reference: hash(english), audio: hash(audio) };
mkdirSync(output); // a new immutable packet, never replace an earlier preparation
execFileSync("ffmpeg", ["-v", "error", "-n", "-i", audio, "-t", "16", "-ar", "24000", "-ac", "2", "-c:a", "pcm_s16le", join(output, "opening-source.wav")], { windowsHide: true });
const packet = { project: { language: "hatam", book: "mark", chapter: 6 },
  input: { hatam, english, audio, selectedEdition: "non_drama", selectionReason: "Same edition used by the approved Mark 5 source binding; selection is not new source attestation.", sourceHashes },
  bodyCoverage, printedChapterTitle: parseChapterTitle(hatam, 6), verses, reference, headings: parseSourceHeadings(hatam),
  durationMs, alignmentPreflight: { maxSegmentMs:14000, fastCalls:alignmentIntervals.length, maximumStrongCalls:alignmentIntervals.length, intervals:alignmentIntervals, gaps:alignmentGaps }, silenceDetection: { noiseFloorDb: -30, minDurationSec: .15, gaps },
  openingReview: { path: join(output, "opening-source.wav"), sha256: hash(join(output, "opening-source.wav")),
    originalSourceStartMs: 0, originalSourceEndMs: Math.min(durationMs, 16000),
    instruction: "Dan confirms the recording speaks the chapter name before verse 1. Identify the exact announcement and its end from this audio; printed MARKUS 6 may omit spoken Hatam words. Preserve a separate chapter_title interval. Verify headings/references by listening, not their printed presence.",
    candidatePauses: gaps.filter(g => g.startMs < 16000), announcementVerified: false, verseOneOnsetVerified: false },
  alignmentStatus: "not_submitted", sourceApproval: "not_inferred", nativeReview: "not_inferred",
  nextAction: "Budgeted audio identification and ordered alignment, with explicit opening announcement and distributed chapter anchors. Only unresolved evidence needs targeted listening. No prior-chapter timestamps transfer." };
writeFileSync(join(output, "source-packet.json"), JSON.stringify(packet, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, verses: verses.length, durationMs, headingCount: packet.headings.length,
  candidateOpeningPauses: packet.openingReview.candidatePauses, alignmentStatus: packet.alignmentStatus }));
