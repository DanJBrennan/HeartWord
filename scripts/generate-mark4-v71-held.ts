/**
 * Held Mark 4 v71 generation package (prepared by Claude, 2026-10-02, from
 * Dan's v70 review). Every output is a NEW, uniquely named, held file in
 *   HeartWordData/assets/generated/editorial/mark4-v71-held/
 * Nothing is written to the database and no existing file is overwritten.
 * Re-running a stage skips anything that already exists, so a failed or
 * interrupted run can simply be run again.
 *
 * Stages (run in order; Claude reviews between them):
 *   npx tsx scripts/generate-mark4-v71-held.ts keyframes   (~$1.70)
 *       Gemini edits of real film frames into the storm keyframes, the Peter
 *       keyframe, two lively Kling Avatar performances (4:20 and 4:29), and
 *       an expressive re-voice of Peter's 4:38 line.
 *   npx tsx scripts/generate-mark4-v71-held.ts videos      (~$5)
 *       Veo 3.1 start/end-frame clips for the storm (wake-and-rise, storm
 *       dying, great calm) and a 10 s Kling base of Peter shouting at the
 *       sleeping Jesus, plus Kling face detection on that base.
 *   npx tsx scripts/generate-mark4-v71-held.ts peter-lipsync <faceId> [expressive|original]   (~$0.50)
 *       Lip-syncs the face Claude confirms from the detection thumbnails.
 *   npx tsx scripts/generate-mark4-v71-held.ts ending   (~$3.20)
 *       Dan's new ending (2026-10-02): stay in the night after the calm and
 *       slowly pull out and rise until the boat is small and alone on the calm
 *       sea, 16 s, replacing the dawn landing. Two chained 8 s Veo clips.
 *   npx tsx scripts/generate-mark4-v71-held.ts revoice-4-18-19   (~$0.20)
 *       Re-voices Jesus's Mark 4:18-19 speech (source 218.910-236.110 s) as ONE
 *       continuous take. The aligner capped the segment at exactly 14.000 s
 *       mid-phrase, so the film butts two separately re-voiced halves together
 *       at 4:08 (the "sharp cut" Dan heard). The source reading itself is
 *       continuous there.
 *
 * Costs are the repo's own rough per-call estimates, not invoices.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiImageEditor } from "../src/providers/gemini/index.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const data = getDataDir();
const assets = join(data, "assets");
const REL = "generated/editorial/mark4-v71-held";
const DIR = join(assets, REL);
const SRC = `${REL}/src`;
mkdirSync(DIR, { recursive: true });
const logPath = join(DIR, "run-log.json");
const log: Record<string, unknown> = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : {};
const saveLog = () => writeFileSync(logPath, JSON.stringify(log, null, 2));
const has = (name: string) => existsSync(join(DIR, name));

// ---------- shared canon text ----------
const JESUS = "Jesus is a Papuan man with long dark wavy shoulder-length hair and a full black beard, wearing a cream woven tunic with indigo vertical bands (exactly as in the image)";
const CREW = "Keep exactly the same boat, the same six disciples with the same faces, clothes and positions, the same night storm lighting, rain, lightning and camera framing";

// ---------- keyframes (Gemini Nano Banana Pro region edits of real film frames) ----------
const KEYFRAMES: Array<{ out: string; from: string; edit: string }> = [
  { out: "k1-jesus-shaken-awake.jpg", from: `${SRC}/storm-wide-asleep.png`,
    edit: `${CREW}. Change only Jesus (the man lying asleep on the cushion at the stern on the right) and the disciple nearest him: that disciple now kneels beside Jesus gripping his shoulder and shouting at him, and Jesus is just waking, eyes opening, head lifting from the cushion. ${JESUS}.` },
  { out: "k2-jesus-standing-to-rebuke.jpg", from: `${SRC}/storm-wide-asleep.png`,
    edit: `${CREW}. Change only Jesus: he now stands upright at the stern on the right, steady and calm, facing out toward the wind and waves, his right arm beginning to lift toward the sea. ${JESUS}. The disciples cling to the boat and stare at him.` },
  { out: "k3-jesus-arm-raised-storm.jpg", from: `${REL}/k2-jesus-standing-to-rebuke.jpg`,
    edit: `${CREW} and the same Jesus. Change only Jesus's right arm: it is now raised high and outstretched toward the waves in command. The storm is still raging.` },
  { out: "k4-storm-dying-disciples-stunned.jpg", from: `${REL}/k3-jesus-arm-raised-storm.jpg`,
    edit: `Keep the same boat, the same six disciples and the same Jesus with his arm still raised, same framing. Change only the weather and the disciples' expressions: the waves are dropping and flattening, the rain is stopping, the lightning has gone, the dark clouds are beginning to break; every disciple is frozen, staring at Jesus in stunned awe.` },
  { out: "k5-great-calm-full-crew.jpg", from: `${REL}/k4-storm-dying-disciples-stunned.jpg`,
    edit: `Keep the same boat, the same six disciples (all six still visible, seated or kneeling, stunned) and the same Jesus, same framing. Change only: Jesus has lowered his arm and stands quietly; the sea is now completely still and glassy, reflecting a bright moon breaking through parted clouds; no rain, no spray, no wind.` },
  { out: "p1-peter-shouting-at-jesus.jpg", from: `${SRC}/peter-close.png`,
    edit: `Keep the same man in the red-brown mantle (Peter), the same sleeping Jesus on the cushion behind him, the same rain, storm and boat. Change only Peter's pose and expression: he has turned toward Jesus, leaning over him in three-quarter profile with his face still clearly visible to the camera, one hand gripping Jesus's shoulder, his mouth wide open shouting desperately at him. Jesus stays fully asleep with his eyes closed.` }
];

// ---------- Kling Avatar with liveliness ----------
const KLING_HOST = "https://api-singapore.klingai.com";
const klingKey = () => { const k = process.env.KLING_API_KEY_1; if (!k) throw new Error("KLING_API_KEY_1 is not set."); return k; };
const AVATARS = [
  { out: "avatar-jesus-4-20-tail-lively.mp4", image: `${SRC}/jesus-4-20-close.png`, audio: `${SRC}/avatar-4-20-tail-plus-1s.mp3` },
  { out: "avatar-jesus-4-29-tail-lively.mp4", image: `${SRC}/jesus-4-29-close.png`, audio: `${SRC}/avatar-4-29-tail-plus-1250ms.mp3` }
];
const AVATAR_PROMPT = "A natural, lively teaching performance: Jesus speaks with conviction and warmth to listeners just off camera, with natural head turns and nods, expressive eyebrows and eyes, clear and fully open mouth shapes that follow every syllable, small breathing and shoulder movement, and a calm settled pause with mouth closed at the end. Keep his face, hair, beard, clothing, background and lighting exactly as in the image. No camera move, no new people, no text.";

async function klingPoll(path: string, taskId: string): Promise<string> {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15000));
    const res = await fetch(`${KLING_HOST}${path}/${taskId}`, { headers: { Authorization: `Bearer ${klingKey()}` } });
    const j = await res.json() as { code: number; data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: Array<{ url?: string }> } } };
    const st = j.data?.task_status;
    if (st === "succeed") { const url = j.data?.task_result?.videos?.[0]?.url; if (!url) throw new Error(`${taskId}: no video url`); return url; }
    if (st === "failed") throw new Error(`${taskId} failed: ${j.data?.task_status_msg ?? "no message"}`);
  }
  throw new Error(`${taskId} did not finish in 20 minutes`);
}
async function download(url: string, out: string) {
  const res = await fetch(url); if (!res.ok) throw new Error(`download ${out}: ${res.status}`);
  writeFileSync(join(DIR, out), Buffer.from(await res.arrayBuffer()), { flag: "wx" });
}
async function avatar(item: typeof AVATARS[number]) {
  const image = readFileSync(join(assets, item.image)).toString("base64");
  const sound = readFileSync(join(assets, item.audio)).toString("base64");
  const base = { image, sound_file: sound };
  const submit = async (body: Record<string, unknown>) => {
    const res = await fetch(`${KLING_HOST}/v1/videos/avatar/image2video`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${klingKey()}` }, body: JSON.stringify(body) });
    return { ok: res.ok, j: await res.json() as { code: number; message?: string; data?: { task_id?: string } } };
  };
  // Verified controls. A rejection is a held request, never authority to omit
  // direction or silently incur another charge.
  const r = await submit({ ...base, prompt: AVATAR_PROMPT, mode: "pro" });
  const usedPrompt = true;
  const taskId = r.j.data?.task_id; if (!taskId) throw new Error(`avatar submit failed: ${JSON.stringify(r.j).slice(0, 300)}`);
  log[item.out] = { taskId, usedPrompt, submittedAt: new Date().toISOString() }; saveLog();
  await download(await klingPoll("/v1/videos/avatar/image2video", taskId), item.out);
  console.log(`wrote ${item.out}`);
}

// ---------- expressive Peter re-voice (ElevenLabs speech-to-speech) ----------
async function peterVoice() {
  const out = "peter-4-38-expressive-r1.mp3"; if (has(out)) return;
  const key = process.env.ELEVENLABS_API_KEY; if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const voiceId = "ZthjuvLPty3kTMaNKVKb"; // Peter's approved voice
  const form = new FormData();
  form.append("audio", new Blob([readFileSync(join(assets, SRC, "peter-4-38-source.mp3"))]), "peter-4-38-source.mp3");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  form.append("voice_settings", JSON.stringify({ stability: 0.15, similarity_boost: 0.8, style: 0.9, use_speaker_boost: true }));
  const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`Peter re-voice failed: ${res.status} ${await res.text()}`);
  writeFileSync(join(DIR, out), Buffer.from(await res.arrayBuffer()), { flag: "wx" });
  console.log(`wrote ${out}`);
}

// ---------- Veo 3.1 start/end frame clips ----------
const VEO_MODEL = "veo-3.1-generate-preview";
const VEO: Array<{ out: string; start: string; end?: string; seconds: 4 | 8; prompt: string }> = [
  { out: "s102-jesus-wakes-and-rises-8s.mp4", start: "k1-jesus-shaken-awake.jpg", end: "k2-jesus-standing-to-rebuke.jpg", seconds: 8,
    prompt: "Night storm on the Sea of Galilee, a wooden fishing boat with six terrified disciples. A disciple shakes the sleeping Jesus awake; Jesus opens his eyes, rises calmly to his feet at the stern and turns to face the wind, his right arm starting to lift. Heavy rain, spray, lightning, rocking boat. Realistic cinematic film, steady camera, no text." },
  { out: "s105a-storm-dies-down-8s.mp4", start: "k3-jesus-arm-raised-storm.jpg", end: "k4-storm-dying-disciples-stunned.jpg", seconds: 8,
    prompt: "Jesus stands at the stern with his arm raised; the wind drops, the waves rapidly flatten, the rain stops and the clouds begin to break. The six disciples freeze, staring at him in stunned awe. Realistic cinematic film, steady camera, no text." },
  { out: "s105b-great-calm-8s.mp4", start: "k4-storm-dying-disciples-stunned.jpg", end: "k5-great-calm-full-crew.jpg", seconds: 8,
    prompt: "The last ripples settle into a perfectly still, glassy sea under a bright moon breaking through the clouds. Jesus lowers his arm and stands quietly; the six disciples remain motionless, astonished. Silent, realistic cinematic film, gentle slow camera, no text." }
];
async function veo(item: typeof VEO[number]) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const img = (n: string) => ({ bytesBase64Encoded: readFileSync(join(DIR, n)).toString("base64"), mimeType: n.endsWith(".png") ? "image/png" : "image/jpeg" });
  const body = { instances: [{ prompt: item.prompt, image: img(item.start), ...(item.end ? { lastFrame: img(item.end) } : {}) }], parameters: { aspectRatio: "16:9", durationSeconds: item.seconds, resolution: "720p" } };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Veo submit ${item.out}: ${res.status} ${await res.text()}`);
  const op = (await res.json() as { name?: string }).name; if (!op) throw new Error(`Veo ${item.out}: no operation`);
  log[item.out] = { operation: op, submittedAt: new Date().toISOString() }; saveLog();
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15000));
    const p = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`)).json() as { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string; bytesBase64Encoded?: string } }> } } };
    if (!p.done) continue;
    if (p.error) throw new Error(`Veo ${item.out} failed: ${p.error.message}`);
    const v = p.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
    if (v?.bytesBase64Encoded) { writeFileSync(join(DIR, item.out), Buffer.from(v.bytesBase64Encoded, "base64"), { flag: "wx" }); }
    else if (v?.uri) { const f = await fetch(v.uri, { headers: { "x-goog-api-key": key } }); writeFileSync(join(DIR, item.out), Buffer.from(await f.arrayBuffer()), { flag: "wx" }); }
    else throw new Error(`Veo ${item.out}: no video (possibly filtered): ${JSON.stringify(p).slice(0, 300)}`);
    console.log(`wrote ${item.out}`); return;
  }
  throw new Error(`Veo ${item.out} did not finish in 20 minutes`);
}

// ---------- stages ----------
async function keyframes() {
  const editor = new GeminiImageEditor();
  for (const k of KEYFRAMES) {
    if (has(k.out)) continue;
    if (!existsSync(join(assets, k.from))) throw new Error(`missing input ${k.from} (run again after the earlier keyframe exists)`);
    const r = await editor.editRegion({ path: k.from }, k.edit);
    if (!r.media) throw new Error(`no image for ${k.out}`);
    copyFileSync(join(assets, r.media.path), join(DIR, k.out), constants.COPYFILE_EXCL);
    log[k.out] = { from: k.from, editAsset: r.media.path }; saveLog();
    console.log(`wrote ${k.out}`);
  }
  for (const a of AVATARS) if (!has(a.out)) await avatar(a);
  await peterVoice();
}
async function videos() {
  for (const v of VEO) if (!has(v.out)) await veo(v);
  const out = "s101-peter-base-10s.mp4";
  const provider = new KlingFaceLipSyncProvider();
  if (!has(out)) {
    const prompt = "Night storm in a small wooden fishing boat, heavy rain and spray. Peter, in a red-brown mantle, leans over the sleeping Jesus, grips his shoulder and shakes him, shouting desperately at him over the storm; his face stays visible to the camera in three-quarter profile. Jesus stays asleep on the cushion with his eyes closed. Other disciples struggle with the ropes behind. Realistic cinematic film, no text.";
    const { taskId, videoUrl } = await provider.generateSceneVideo({ path: `${REL}/p1-peter-shouting-at-jesus.jpg` }, prompt, 10, async t => { log[out] = { taskId: t }; saveLog(); });
    await download(videoUrl, out);
    log[out] = { taskId, videoUrl, prompt }; saveLog();
    console.log(`wrote ${out}`);
  }
  const entry = log[out] as { videoUrl: string };
  const faces = await provider.identifyFaces(entry.videoUrl);
  mkdirSync(join(DIR, "faces"), { recursive: true });
  for (const f of faces) { const res = await fetch(f.thumbnailUrl); if (res.ok) writeFileSync(join(DIR, "faces", `face-${f.faceId}.jpg`), Buffer.from(await res.arrayBuffer())); }
  log["s101-faces"] = faces; saveLog();
  console.log(`Detected ${faces.length} faces; thumbnails in ${REL}/faces. Tell Claude when this finishes.`);
}
async function peterLipsync(faceId: string, voice: string) {
  const out = `s101-peter-shouting-lipsync-${voice}.mp4`; if (has(out)) return;
  const entry = log["s101-peter-base-10s.mp4"] as { videoUrl: string } | undefined;
  if (!entry?.videoUrl) throw new Error("Run the videos stage first.");
  const audioRel = voice === "expressive" ? `${REL}/peter-4-38-expressive-r1.mp3` : "generated/hatam/mark-4/composite_cast_master/01-segment-0-elevenlabs.mp3";
  const ms = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", join(assets, audioRel)], { encoding: "utf8" }).trim()) * 1000);
  const r = await new KlingFaceLipSyncProvider().syncFace(entry.videoUrl, faceId, { path: audioRel, startMs: 0, endMs: ms }, 0);
  if (!r.media) throw new Error("no lip-sync video");
  copyFileSync(join(assets, r.media.path), join(DIR, out), constants.COPYFILE_EXCL);
  log[out] = { faceId, voice, source: r.media.path }; saveLog();
  console.log(`wrote ${out}`);
}

async function revoice41819() {
  const out = "jesus-4-18-19-continuous-elevenlabs-r1.mp3"; if (has(out)) return;
  const key = process.env.ELEVENLABS_API_KEY; if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const src = join(assets, "source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___04_Markus______HADLAIN1DA.mp3");
  const clip = join(DIR, "jesus-4-18-19-source-clip.tmp.mp3");
  execFileSync("ffmpeg", ["-y", "-i", src, "-ss", "218.910", "-t", "17.200", "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", clip], { stdio: ["ignore", "ignore", "pipe"] });
  const form = new FormData();
  form.append("audio", new Blob([readFileSync(clip)]), "jesus-4-18-19-source.mp3");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/nPczCjzI2devNBz1zQrb?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`4:18-19 re-voice failed: ${res.status} ${await res.text()}`);
  writeFileSync(join(DIR, out), Buffer.from(await res.arrayBuffer()), { flag: "wx" });
  console.log(`wrote ${out}`);
}

// ---------- night ending: 16 s rising pull-out from the last night boat shot ----------
const ENDING_PROMPT_1 = "Night on the Sea of Galilee after the storm: the same small wooden fishing boat with Jesus standing and the disciples seated, on a perfectly calm, glassy dark sea under a bright moon. The camera slowly and smoothly pulls back and rises higher and higher above the water, the boat growing smaller. Keep it night: deep blue darkness, moonlight on the water, no sunrise, no daylight, no land nearby, no new boats. Realistic cinematic film, silent, no text.";
const ENDING_PROMPT_2 = "Continue the same slow, smooth rising pull-back high above the dark, glassy, moonlit Sea of Galilee at night. The small wooden boat becomes a tiny, fragile, solitary shape on the vast calm water, alone under the moon. Keep it night with deep blue darkness and moonlight; no sunrise, no daylight, no other boats. Realistic cinematic film, silent, no text.";
async function ending() {
  const e1 = "ending-1-night-pullout-8s.mp4", e2 = "ending-2-night-pullout-high-8s.mp4";
  if (!has(e1)) await veo({ out: e1, start: "src/ending-start-night-boat.png", seconds: 8, prompt: ENDING_PROMPT_1 });
  const last = join(DIR, "ending-1-last-frame.png");
  if (!existsSync(last)) execFileSync("ffmpeg", ["-y", "-sseof", "-0.05", "-i", join(DIR, e1), "-frames:v", "1", "-update", "1", last], { stdio: ["ignore", "ignore", "pipe"] });
  if (!has(e2)) await veo({ out: e2, start: "ending-1-last-frame.png", seconds: 8, prompt: ENDING_PROMPT_2 });
}

const [stage, a1, a2] = process.argv.slice(2);
(async () => {
  if (stage === "keyframes") await keyframes();
  else if (stage === "videos") await videos();
  else if (stage === "peter-lipsync" && a1) await peterLipsync(a1, a2 ?? "expressive");
  else if (stage === "revoice-4-18-19") await revoice41819();
  else if (stage === "ending") await ending();
  else throw new Error("Usage: keyframes | videos | peter-lipsync <faceId> [expressive|original] | revoice-4-18-19 | ending");
  console.log("done");
})().catch(error => { console.error(error); process.exit(1); });
