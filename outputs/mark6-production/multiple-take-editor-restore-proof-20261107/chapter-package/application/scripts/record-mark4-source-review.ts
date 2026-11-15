/** Records Dan's interval-level Mark 4 source-review decisions. */
import { getDb } from "../src/db/client.js";
import { recordSourceAlignmentCorrection } from "../src/pipeline/ingestion/source-alignment-corrections.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const decisions = [
  [4661, 17811, "Mark 4:1", "Mpe di gom bu lene Yesus ug gwam ei igpong nipimat leu api tri tut nihyet bak tungwatu nya leu api tungwatu nya ningot ndig induk yam kwei bingwig ttai Noni."],
  [17811, 32661, "Mark 4:1-2", "Gima rino Noni bri bigwam ei ut nsi ba, ut piar tut ei minyei ngwa dip lo, tungwatu nya igya nyahan ei igpong nipimat. 2Lene Noni ba nihyet nibiti nindati mang bibor"],
  [32661, 34440, "Mark 4:2", "bingginau yok bipai,"],
  [92445, 103308, "Mark 4:8", "Ninjem hi ngat ningat ningot ningai lene ninjem hi ngat ningat ningot muhwindagom lene ninjem hi ngat ningat sratus gom lene bikwop nok.”"],
  [144878, 149815, "Mark 4:12", "Leu binhyepo, ‘Mbro nok gino imian ser ninno lo, ingon dorti bi."],
  [150550, 154509, "Mark 4:12", "Mbro nok gino ingig itingou mem nihyet ninno lo, imiap bi."],
  [155298, 169227, "Mark 4:12", "Mun dini pek kep mem yok ser nhyema iba igyai bingat mungkun cem, iba ingon bisrip huk cem leu api ingkwei hanyen ndam Da bidibindei ba, ikei hanyen bidikos ser ide sisar cem au.’ ”"],
  [196959, 204199, "Mark 4:16", "Njita ngan di cut ei tigsi bindo tut yo di intu kep nihyet lene iba ingon di kei bingon jo kep."],
  [232910, 236110, "Mark 4:19", "hagom ceu nihyet leu api ningat ntun him bi."],
  [307458, 311754, "Mark 4:25", "Noro Noni mitug niken hanyen leu no di ningon dorti bi.”"],
  [335301, 339151, "Mark 4:28", "Lewo dihyei bindei ba, njita bou ngat ningat."],
  [259449, 261735, "Mark 4:21", "Leu api Yesus hig singgre yok"],
  [262484, 270880, "Mark 4:21", "Tou ritin mini ba, njeng lene ba bokor bikibou kep ninjeng hanyen bikes bijo ei bilen nibehei i?"],
  [271401, 271864, "Mark 4:21", "Hi bi!"],
  [272422, 275720, "Mark 4:21", "Noni kon ninjeng bikes ei nidihimti."],
  [359081, 360568, "Mark 4:30", "Yesus hig ser yok"],
  [361365, 364948, "Mark 4:30", "“Iba mindei ba, ibinai sut Allah Ninyeng Tak Kepti i?"],
  [365526, 368866, "Mark 4:30", "Notou miditri tut mun di bindo tut i?"]
] as const;

const db = getDb();
const correctionIds: string[] = [];
let skipped = 0;
for (const [startMs, endMs, verseRef, assignedText] of decisions) {
  const segment = db.prepare("SELECT id FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=? AND end_ms=?")
    .get(projectId, startMs, endMs) as { id: string } | undefined;
  if (!segment) throw new Error(`Missing current interval ${startMs}-${endMs}.`);
  const existing = db.prepare("SELECT id FROM source_alignment_corrections WHERE project_id=? AND audio_segment_id=? AND verse_ref=? AND assigned_text=?")
    .get(projectId, segment.id, verseRef, assignedText);
  if (existing) { skipped++; continue; }
  correctionIds.push(recordSourceAlignmentCorrection(db, {
    projectId, audioSegmentId: segment.id, verseRef, assignedText, reviewerName: "Dan",
    evidence: `Dan listened to ${(startMs / 1000).toFixed(3)}–${(endMs / 1000).toFixed(3)} seconds and supplied this exact Hatam text and verse assignment.`
  }));
}
console.log(JSON.stringify({ recorded: correctionIds.length, skipped, correctionIds }, null, 2));
