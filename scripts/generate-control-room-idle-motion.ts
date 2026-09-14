/**
 * Generates a private control-room idle-motion candidate for visual review.
 *
 * This intentionally does not import the HeartWord DB or pipeline: the assets
 * are display-only portraits, not Scripture-video canon or runtime-agent data.
 * It sends one explicitly named portrait to Gemini Omni's existing image-to-
 * video API, then strips any generated audio and writes a web-friendly MP4.
 *
 * Usage: npx tsx scripts/generate-control-room-idle-motion.ts [name ...]
 * Each named draft is one non-retrying Omni request, estimated at about $0.10.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");

const root = resolve(import.meta.dirname, "..");
const outputDirectory = join(root, "docs", "assets", "control-room", "idle-motion");
const casts = {
  mabel: { source:"mabel-motion-safe-source-v1.png", output:"mabel-omni-loop-closure-candidate-v1.mp4", name:"Mabel", loopClosure:true },
  rufus: { source:"rufus-motion-safe-source-v1.png", output:"rufus-motion-safe-candidate-v1.mp4", name:"Rufus", loopClosure:false },
  pippa: { source:"pippa-motion-safe-source-v1.png", output:"pippa-omni-loop-closure-candidate-v1.mp4", name:"Pippa", loopClosure:true },
  gus: { source:"gus-motion-safe-source-v1.png", output:"gus-omni-loop-closure-candidate-v1.mp4", name:"Gus", loopClosure:true },
  vera: { source:"vera-motion-safe-source-v1.png", output:"vera-omni-loop-closure-candidate-v1.mp4", name:"Vera", loopClosure:true },
  orion: { source:"orion-motion-safe-source-v1.png", output:"orion-omni-loop-closure-candidate-v1.mp4", name:"Orion", loopClosure:true },
  june: { source:"june-motion-safe-source-v1.png", output:"june-omni-loop-closure-candidate-v1.mp4", name:"June", loopClosure:true },
  leon: { source:"leon-motion-safe-source-v1.png", output:"leon-omni-loop-closure-candidate-v1.mp4", name:"Leon", loopClosure:true },
  tessa: { source:"tessa-motion-safe-source-v1.png", output:"tessa-omni-loop-closure-candidate-v1.mp4", name:"Tessa", loopClosure:true },
  arlo: { source:"arlo-motion-safe-source-v1.png", output:"arlo-omni-loop-closure-candidate-v1.mp4", name:"Arlo", loopClosure:true },
  nell: { source:"nell-motion-safe-source-v1.png", output:"nell-omni-loop-closure-candidate-v1.mp4", name:"Nell", loopClosure:true },
  sam: { source:"sam-motion-safe-source-v1.png", output:"sam-omni-loop-closure-candidate-v1.mp4", name:"Sam", loopClosure:true },
  miriam: { source:"miriam-motion-safe-source-v1.png", output:"miriam-omni-loop-closure-candidate-v1.mp4", name:"Miriam", loopClosure:true },
  dottie: { source:"dottie-motion-safe-source-v1.png", output:"dottie-omni-loop-closure-candidate-v1.mp4", name:"Dottie", loopClosure:true },
  kit: { source:"kit-motion-safe-source-v1.png", output:"kit-omni-loop-closure-candidate-v1.mp4", name:"Kit", loopClosure:true },
  benny: { source:"benny-motion-safe-source-v1.png", output:"benny-omni-loop-closure-candidate-v1.mp4", name:"Benny", loopClosure:true },
  ada: { source:"ada-motion-safe-source-v1.png", output:"ada-omni-loop-closure-candidate-v1.mp4", name:"Ada", loopClosure:true },
  theo: { source:"theo-motion-safe-source-v1.png", output:"theo-omni-loop-closure-candidate-v1.mp4", name:"Theo", loopClosure:true },
  cora: { source:"cora-motion-safe-source-v1.png", output:"cora-omni-loop-closure-candidate-v1.mp4", name:"Cora", loopClosure:true }
} as const;
type CastName = keyof typeof casts;

const requested = process.argv.slice(2);
const selected = (requested.length ? requested : []).map(name => {
  if (!(name in casts)) throw new Error(`Unknown private control-room cast member "${name}". Choose: ${Object.keys(casts).join(", ")}.`);
  return name as CastName;
});

const prompt = (name: string, closesLoop = false) =>
  `Animate this exact private HeartWord control-room portrait of ${name} as a quiet, nearly still three-second locked-camera loop. ` +
  `Preserve the exact person, illustrated identity, face, headroom, shoulders, composition, framing, crop, pose, wardrobe, props, lighting, and background. ` +
  (name === "Pippa" ? `Preserve Pippa's identity, illustrated style, face, hair and pencil, shirt and skirt, blueprint and ruler, office setting, composition, and lighting exactly. ` : "") +
  `Do not move the camera, reframe, crop, zoom, pan, tilt, change the face, change the pose, change wardrobe or props, add text, speech, other people, or audio. ` +
  `The only motion is natural breathing, one gentle blink, and one very small gaze shift. Do not move hands, do not touch the face or nose, do not make overt gestures, and do not move the mouth. ` +
  (closesLoop
    ? `The first supplied image is the exact first frame and the second supplied image is the exact final frame; settle precisely back to that first pose so the clip can loop.`
    : `Return naturally to the opening neutral pose so the three-second clip can loop.`);

async function generate(name: CastName) {
  const cast = casts[name];
  const sourcePath = join(outputDirectory, cast.source);
  if (!existsSync(sourcePath)) throw new Error(`Missing approved private portrait: ${sourcePath}`);
  const sourceImage = { type:"image" as const, mime_type:"image/png", data:readFileSync(sourcePath).toString("base64") };
  const isLoopClosure = cast.loopClosure;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions?key=" + apiKey, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      model:"gemini-omni-1.1-flash",
      input:[{ type:"user_input", content:[
        sourceImage,
        ...(isLoopClosure ? [sourceImage] : []),
        { type:"text", text:isLoopClosure ? `<FIRST_FRAME> <LAST_FRAME> ${prompt(cast.name, true)}` : prompt(cast.name) }
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

let failed = false;
for (const name of selected) {
  try {
    await generate(name);
  } catch (error) {
    failed = true;
    console.error(error instanceof Error ? error.message : String(error));
  }
}
if (failed) process.exitCode = 1;
