/** Non-destructive producer review revision of Mark 3. Source Scripture is retained. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets");
const review = join(root, "generated/video/review");
const input = join(review, "mark3-full-chapter-r10-nextchapter-bridge-review-v1.mp4");
const sound = join(review, "mark3-full-chapter-r9-score-review-v1.mp4");
const output = join(review, "mark3-full-chapter-r11-continuity-emotion-review-v2.mp4");
if (existsSync(output) || existsSync(output.replace(/\.mp4$/, ".json"))) throw new Error("Review output exists; refusing overwrite.");
const video = (id: string) => join(root, `generated/video/kling-${id}.mp4`);
const lip = (id: string) => join(root, `generated/lipsync/${id}.mp4`);
const sources = [
  input, sound,
  video("932279275914002444"), // moving entrance
  video("932279599827517474"), // Jesus OTS man
  video("932283073868865577"), // leaders in the established synagogue
  video("932279869482864712"), // healed man discovers his hand
  video("932280342159949862"), // celebrating crowd
  video("932280748387344411"), // leaders contain their anger
  video("932281112611651606"), // house: Jesus and crowd
  video("932281601936597010"), // house: listeners OTS
  video("932283212133433354"), // house: lateral reverse
  video("932286404171399210"), // house: close listeners
  lip("932279788453105716"),
  lip("932280579553361999"),
  lip("932281417160720454"),
  lip("932283474424897609"),
  lip("932284118522527746"),
  video("932258552361263148"),
  video("932259656267857977"),
  video("932261199469740070"),
  video("932273062803415107"),
  video("932273464973590534"),
  video("932273750254034947"),
  video("932274397753249822")
];
const scoreRoot = join(root, "generated/soundtrack/mark3-r8");
const celebration = JSON.parse(readFileSync(join(scoreRoot, "synagogue-celebration-r11-v3.json"), "utf8")) as { path: string; status: string; review: { instrumental: boolean; intelligibleSpeech: boolean; audibleArtifact: boolean } };
const closing = JSON.parse(readFileSync(join(scoreRoot, "chapter-bridge-r11.json"), "utf8")) as typeof celebration;
for (const [name, cue] of [["celebration", celebration], ["closing", closing]] as const) {
  if (cue.status !== "screened_candidate" || !cue.review.instrumental || cue.review.intelligibleSpeech || cue.review.audibleArtifact) throw new Error(`${name} score has not passed screening`);
}
if (![...sources, celebration.path, closing.path].every(existsSync)) throw new Error("A held source clip is missing.");
// All cuts use frame boundaries on the 24 fps review master. The 10-second
// nonverbal pause is inserted after frame 2647; no source-language words move
// relative to each other. The new announcement is the original audio, moved.
const fps = 24;
const edits = [
  { at: 635, until: 745, source: 2, frames: 110, label: "moving-entry" },
  { at: 936, until: 951, source: -1, frames: 15, label: "scribe-dissolve" },
  { at: 1340, until: 1388, source: 3, frames: 48, label: "jesus-ots-man" },
  { at: 1952, until: 2020, source: 4, frames: 68, label: "same-synagogue-leaders" },
  { at: 2527, until: 2647, source: 5, frames: 120, label: "healed-man-joy" },
  { at: 2647, until: 2647, source: 6, frames: 120, label: "crowd-celebration" },
  { at: 2647, until: 2647, source: 7, frames: 120, label: "leaders-disappointment" },
  { at: 6642, until: 6762, source: 8, frames: 120, label: "house-jesus-crowd" },
  { at: 6762, until: 6882, source: 9, frames: 120, label: "house-listeners" },
  { at: 7050, until: 7170, source: 10, frames: 120, label: "house-lateral" },
  { at: 7170, until: 7290, source: 11, frames: 120, label: "house-listener-close" },
  { at: 7842, until: 7962, source: 10, frames: 120, label: "house-lateral-reprise" },
  { at: 7962, until: 7986, source: 11, frames: 24, label: "house-listener-response" },
  { at: 8485, until: 8677, source: 12, frames: 192, label: "jesus-closeup-1" },
  { at: 8822, until: 9014, source: 13, frames: 192, label: "jesus-closeup-2" },
  { at: 9014, until: 9206, source: 14, frames: 192, label: "jesus-closeup-3" },
  { at: 9206, until: 9326, source: 15, frames: 120, label: "jesus-closeup-4" },
  { at: 9326, until: 9339, source: 9, frames: 13, label: "listener-over-flash" },
  { at: 9339, until: 9507, source: 16, frames: 168, label: "jesus-closeup-5" },
  { at: 11624, until: 11624, source: 20, frames: 120, label: "aerial-extension-1" },
  { at: 11624, until: 11624, source: 21, frames: 120, label: "aerial-extension-2" },
  { at: 11624, until: 11624, source: 22, frames: 120, label: "aerial-extension-3" },
  { at: 11624, until: 11624, source: 23, frames: 24, label: "aerial-extension-4" }
] as const;
const v: string[] = [];
const segments: string[] = [];
let cursor = 0;
function addOriginal(from: number, to: number) {
  if (to <= from) return;
  const tag = `v${segments.length}`;
  v.push(`[0:v]trim=start_frame=${from}:end_frame=${to},setpts=PTS-STARTPTS,fps=${fps},setsar=1[${tag}]`);
  segments.push(`[${tag}]`);
}
for (const edit of edits) {
  if (edit.at < cursor) throw new Error(`Overlapping patch: ${edit.label}`);
  addOriginal(cursor, edit.at);
  const tag = `v${segments.length}`;
  if (edit.source < 0) {
    v.push(`[0:v]trim=start_frame=921:end_frame=936,setpts=PTS-STARTPTS,fps=${fps}[prior]`,
      `[0:v]trim=start_frame=939:end_frame=954,setpts=PTS-STARTPTS,fps=${fps}[next]`,
      `[prior][next]xfade=transition=fade:duration=0.625:offset=0,trim=end_frame=15,setpts=PTS-STARTPTS,setsar=1[${tag}]`);
  } else {
    v.push(`[${edit.source}:v]setpts=PTS-STARTPTS,scale=1280:720,fps=${fps},trim=end_frame=${edit.frames},setpts=PTS-STARTPTS,setsar=1[${tag}]`);
  }
  segments.push(`[${tag}]`);
  cursor = edit.until;
}
addOriginal(cursor, 11624);
v.push(`${segments.join("")}concat=n=${segments.length}:v=1:a=0[v]`);
const a = [
  `[1:a]atrim=end=26.5,asetpts=PTS-STARTPTS[a0]`,
  `[2:a]atrim=duration=4.6166667,asetpts=PTS-STARTPTS,volume=-5dB[a1]`,
  `[1:a]atrim=start=31.1166667:end=110.2916667,asetpts=PTS-STARTPTS[a2]`,
  `[6:a]atrim=duration=5,asetpts=PTS-STARTPTS,volume=-3dB[a3]`,
  `[7:a]atrim=duration=5,asetpts=PTS-STARTPTS,volume=-5dB[a4]`,
  `[1:a]atrim=start=110.2916667:end=469.9,asetpts=PTS-STARTPTS[a5]`,
  `[a0][a1][a2][a3][a4][a5]concat=n=6:v=0:a=1,aresample=48000,aformat=channel_layouts=stereo[original]`,
  `[1:a]atrim=start=26.5:end=31.1166667,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=19412|19412[announcement]`,
  `[24:a]atrim=duration=15,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=-15dB,afade=t=in:st=0:d=0.5,afade=t=out:st=14:d=1,adelay=105292|105292[celebrateScore]`,
  `[25:a]atrim=duration=31,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume='0.12+0.25*t/31':eval=frame,afade=t=in:st=0:d=1,adelay=479333|479333[endScore]`
];
const ambience: string[] = [];
for (let i = 0; i < 7; i++) {
  const index = 17 + i;
  const duration = i === 6 ? 1 : 5;
  const delay = 479333 + i * 5000;
  const tag = `amb${i}`;
  const fade = duration === 1 ? 0.25 : 0.5;
  a.push(`[${index}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=-7dB,afade=t=in:st=0:d=0.2,afade=t=out:st=${duration - fade}:d=${fade},adelay=${delay}|${delay}[${tag}]`);
  ambience.push(`[${tag}]`);
}
a.push(`[original][announcement][celebrateScore][endScore]${ambience.join("")}amix=inputs=${4 + ambience.length}:duration=longest:normalize=0,alimiter=limit=0.98:level=false[mix]`);
const filter = [...v, ...a].join(";");
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", ...sources.flatMap(path => ["-i", path]), "-i", celebration.path, "-i", closing.path,
  "-filter_complex", filter, "-map", "[v]", "-map", "[mix]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-r", "24", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", "510.333333", "-movflags", "+faststart", output],
  { stdio: "inherit", timeout: 3600000 });
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ status: "held_for_producer_review", input, sound, output, sourceAudioPreserved: true,
  announcementStartSeconds: 20, wordlessInsertAtOriginalSeconds: 110.291667, wordlessInsertDurationSeconds: 10,
  closingExtensionSeconds: 16, edits, celebrationScore: celebration.path, closingScore: closing.path,
  note: "Imagegen keyframes and AI motion are review candidates; inferred emotion and sea departure are nonverbal and not Scripture dialogue." }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, durationSeconds: 510.333333 }));
