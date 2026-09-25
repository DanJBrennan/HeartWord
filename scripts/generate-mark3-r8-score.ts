/** Retain separate instrumental candidates for the Mark 3 r8 review cut. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiMusicProvider } from "../src/providers/soundtrack.js";

export const SCORE_CUES = [
  { name: "synagogue-v2", startMs: 69000, endMs: 128000, gainDb: -25,
    prompt: "Purely instrumental cinematic underscore for Mark 3's synagogue. NO HUMAN VOICE OF ANY KIND, no humming, breath vocalization, choir or chant, and no acoustic guitar. Only sparse low bowed strings, soft hand drum and a few quiet reed notes. Begin with a restrained dispute, open into tender wonder about 60% through as a man's hand is restored, then end with a quiet unresolved darkening as opponents leave. A cohesive single arc, human-scale, subtle, clean ending." },
  { name: "synagogue", startMs: 69000, endMs: 128000, gainDb: -25,
    prompt: "Instrumental film underscore for Mark 3: a hushed first-century synagogue dispute, sparse low strings and soft hand percussion. At about 60% of the cue, the tension opens into tender astonishment as a man's hand is restored; the ending carries a restrained, unresolved shadow as his opponents leave. Human-scale, acoustic, subtle, no heroic fanfare. A continuous musical arc with a clean ending." },
  { name: "calling", startMs: 204000, endMs: 266000, gainDb: -28,
    prompt: "Instrumental film underscore for Mark 3 at the Galilean hillside: quiet purposeful movement as Jesus calls the twelve. Light plucked strings, low warm drone and very spare wooden flute, with a modest rise of hope, never a victory fanfare. Leave abundant space for narrated Hatam speech. No repeated dramatic hits; a continuous arc and clean ending." },
  { name: "house-v2", startMs: 286000, endMs: 379000, gainDb: -29,
    prompt: "PURELY INSTRUMENTAL underscore for Mark 3's crowded house and tense accusation. Absolutely NO human voice, humming, wordless vocalization, choir, chanting or speech at any point. Use only sparse low bowed strings, a quiet uneven hand drum and restrained sustained instrumental tones. Anxious but humane, not horror or villain caricature. Leave room for dialogue; subtly tighten and then release before the family scene. One clean continuous arc and ending." },
  { name: "house", startMs: 286000, endMs: 379000, gainDb: -29,
    prompt: "Instrumental film underscore for the crowded house and growing accusation in Mark 3. Sparse low acoustic strings, soft uneven hand drum and restrained sustained tones; anxious but humane, not horror or villain caricature. Thin out under dialogue, subtly tighten through the dispute, then release before the family scene. Slow continuous development, no percussion accents that mimic words, clean ending." },
  { name: "family", startMs: 404000, endMs: 469875, gainDb: -28,
    prompt: "Instrumental film underscore for Mark 3's closing family scene. Begin with intimate unresolved concern, warm plucked strings and soft breathy flute; develop toward compassionate recognition. Keep the first two thirds very sparse under speech, then gently bloom for an eight-second wordless gesture near the last quarter as Jesus opens his arms to the seated crowd. Settle softly under his final words. No triumphal swell, no sentimental choir, clean ending." },
  { name: "chapter-bridge", startMs: 469375, endMs: 484375, gainDb: -17,
    prompt: "PURELY INSTRUMENTAL 17-second closing transition cue for a Scripture film. Match a warm, intimate acoustic score: plucked strings, sustained low strings and a very gentle hand-drum pulse. Begin quietly under the last fraction of a spoken line, then gradually become fuller and louder as Jesus walks from a village house toward the Sea of Galilee and the camera rises to a bird's-eye retreat. Hopeful and anticipatory, not triumphalist; end with a clean, soft resolve that invites the next chapter. Absolutely NO human voice, humming, wordless vocalization, choir, chant, lyrics or speech." }
  ,{ name: "chapter-bridge-r11", startMs: 469333, endMs: 500333, gainDb: -17,
    prompt: "PURELY INSTRUMENTAL 31-second closing cue for Mark 3's wordless transition. A warm, acoustic Galilean village tone: quiet plucked strings, low sustained strings and a very gentle hand-drum pulse. Start small, gradually rise and broaden as Jesus walks toward the sea and the camera cranes high and retreats. At 27 seconds begin a deliberate resolving final phrase; hold its last chord and let it decay naturally to silence by 31 seconds. No abrupt cutoff, no loop, no vocals, humming, chant, choir, lyrics or speech. Hopeful anticipation, not triumphalism." }
  ,{ name: "synagogue-celebration-r11", startMs: 105292, endMs: 120292, gainDb: -20,
    prompt: "PURELY INSTRUMENTAL 15-second joyful reaction cue following the restoration of a man's withered hand in a first-century synagogue. Human-scale astonishment becomes warm, lively communal gladness: nimble plucked strings, hand percussion and light reed or flute, with a clear but restrained rhythm that supports unsynchronized clapping and delighted movement. Begin at the moment of stunned recognition, bloom over the middle ten seconds, then lower into a brief darker turn as frustrated opponents are seen before they leave. Leave space for gasps and natural shouts; no vocals, chant, humming, choir, lyrics or speech, no magical sound effect, no modern pop beat." }
  ,{ name: "synagogue-celebration-r11-v2", startMs: 105292, endMs: 120292, gainDb: -20,
    prompt: "ONLY MUSICAL INSTRUMENTS. Fifteen-second film cue for a restored-hand celebration in a first-century synagogue. No human sound whatsoever in this music stem: no laughter, giggles, crowd, breaths, exclamations, voice, vocal samples, humming, chant, choir or speech. Use only lively plucked strings, bright wooden flute, low strings and light hand-drum pulse. Begin in surprised hush, bloom into measured joyful rhythm for ten seconds, then soften with a small tense color before the opponents depart. No modern pop beat, magical effect or abrupt ending. Instrumental sound only." }
  ,{ name: "synagogue-celebration-r11-v3", startMs: 105292, endMs: 120292, gainDb: -20,
    prompt: "Compose an INSTRUMENTAL MUSIC TRACK, beginning with clear musical notes at second zero. No foley or environmental sounds. No human sounds of any sort, no voices, laughter, giggles, gasps, speech, singing, chanting or humming. Fifteen-second acoustic film score: bright plucked string melody at moderate dance-like pulse, warm bowed-string harmony, small hand drum and wood flute. Build joyful wonder steadily over 10 seconds, then gently turn introspective for the final 5 seconds and resolve. Music instruments only from start to finish; do not depict the scene with sound effects." }
] as const;

const selected = process.argv[2];
if (!selected || !SCORE_CUES.some(c => c.name === selected)) throw new Error(`Pass one cue name: ${SCORE_CUES.map(c => c.name).join(", ")}`);
const cue = SCORE_CUES.find(c => c.name === selected)!;
const root = join(getDataDir(), "assets", "generated", "soundtrack", "mark3-r8");
mkdirSync(root, { recursive: true });
const manifestPath = join(root, `${cue.name}.json`);
if (existsSync(manifestPath)) throw new Error(`Candidate already retained: ${manifestPath}`);
const provider = new GeminiMusicProvider();
const result = await provider.generate({ kind: "music", prompt: cue.prompt, durationMs: cue.endMs - cue.startMs + 2000, loop: false });
const extension = result.mimeType.includes("wav") ? "wav" : result.mimeType.includes("mp4") ? "m4a" : "mp3";
const path = join(root, `${cue.name}-${randomUUID()}.${extension}`);
writeFileSync(path, result.bytes, { flag: "wx" });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" }).trim()) * 1000);
const manifest = { cue, path, durationMs, provider: result.provider, model: result.model,
  usage: result.usage, requestId: result.requestId, mimeType: result.mimeType, status: "held_for_review",
  warning: "No source speech, scene ambience, or prior music is replaced by this candidate." };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
if (durationMs < cue.endMs - cue.startMs) throw new Error(`Retained cue is too short (${durationMs} ms); do not stretch it.`);
if (readFileSync(path).length !== result.bytes.length) throw new Error("Retained cue size mismatch.");
console.log(JSON.stringify({ cue: cue.name, path, durationMs, mimeType: result.mimeType, requestId: result.requestId }));
