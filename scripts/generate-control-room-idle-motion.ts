/**
 * Generates a private control-room idle-motion candidate for visual review.
 *
 * This intentionally does not import the HeartWord DB or pipeline: the assets
 * are display-only portraits, not Scripture-video canon or runtime-agent data.
 * It sends one explicitly named portrait to Gemini Omni's existing image-to-
 * video API, then strips any generated audio and writes a web-friendly MP4.
 *
 * Usage: npx tsx scripts/generate-control-room-idle-motion.ts [rufus]
 * Omitting a name generates the initial Rufus candidate. Each Omni draft is
 * estimated at about $0.10; run only when a replacement clip is actually wanted.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");

const root = resolve(import.meta.dirname, "..");
const portraits = join(root, "docs", "assets", "control-room", "agent-portraits");
const outputDirectory = join(root, "docs", "assets", "control-room", "idle-motion");
const casts = {
  rufus: { source:"rufus-creative-director.png", output:"rufus-candidate.mp4", name:"Rufus" }
} as const;
type CastName = keyof typeof casts;

const requested = process.argv.slice(2);
const selected = (requested.length ? requested : ["rufus"]).map(name => {
  if (!(name in casts)) throw new Error(`Unknown private control-room cast member "${name}". Choose: ${Object.keys(casts).join(", ")}.`);
  return name as CastName;
});

const prompt = (name: string) =>
  `Animate this exact private HeartWord control-room portrait of ${name} as a quiet, nearly still three-second loop. ` +
  `Preserve the exact person, illustration style, composition, wardrobe, lighting, and background. No camera movement, zoom, crop change, ` +
  `text, speech, other people, or audio. The only motion is one soft blink, gentle breathing, a tiny eye glance, and a barely perceptible settled posture. ` +
  `Do not move hands, do not touch the face or nose, do not make overt gestures, and do not move the mouth. Return naturally to the opening neutral pose so the clip can loop.`;

async function generate(name: CastName) {
  const cast = casts[name];
  const sourcePath = join(portraits, cast.source);
  if (!existsSync(sourcePath)) throw new Error(`Missing approved private portrait: ${sourcePath}`);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions?key=" + apiKey, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      model:"gemini-omni-1.1-flash",
      input:[{ type:"user_input", content:[
        { type:"image", mime_type:"image/png", data:readFileSync(sourcePath).toString("base64") },
        { type:"text", text:prompt(cast.name) }
      ] }],
      response_format:{ type:"video", resolution:"360p", aspect_ratio:"16:9", delivery:"inline" }
    })
  });
  const payload = await response.json() as { error?: { message?: string }; steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }> };
  if (!response.ok || payload.error) throw new Error(`Gemini idle-motion request for ${cast.name} failed: ${response.status} ${payload.error?.message ?? "unexpected response"}`);
  const base64 = payload.steps?.find(step => step.type === "model_output")?.content?.find(item => item.type === "video")?.data;
  if (!base64) throw new Error(`Gemini returned no video for ${cast.name}.`);
  mkdirSync(outputDirectory, { recursive:true });
  const tempDirectory = mkdtempSync(join(tmpdir(), "heartword-control-room-motion-"));
  const temporaryVideo = join(tempDirectory, "generated.mp4");
  const outputPath = join(outputDirectory, cast.output);
  try {
    writeFileSync(temporaryVideo, Buffer.from(base64, "base64"));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", temporaryVideo, "-an", "-vf", "fps=24,scale=-2:360", "-c:v", "libx264", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]);
  } finally {
    rmSync(tempDirectory, { recursive:true, force:true });
  }
  console.log(`Wrote private presentation-only idle motion: ${outputPath}`);
}

for (const name of selected) await generate(name);
