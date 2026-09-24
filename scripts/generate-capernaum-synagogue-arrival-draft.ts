/**
 * Creates one silent, standalone reusable location-motion draft. It is not
 * attached to a chapter or selected on a timeline. The existing r4 synagogue
 * exterior locks the place; Jesus v5's walking pose locks his canon.
 *
 * Usage: npx tsx scripts/generate-capernaum-synagogue-arrival-draft.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { registerStandaloneLibraryAsset } from "../src/pipeline/media-generation/media-library.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");

const dataDir = getDataDir();
const synagoguePath = join(dataDir, "assets", "generated", "keyframes", "capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r4-pivot-doors-16x9.png");
const jesusPath = join(dataDir, "assets", "characters", "jesus", "motion", "motion-walking-v3.png");
const relativeOutput = "generated/media-library/capernaum-synagogue-arrival-and-town-life-omni-draft-r4-entered-before-end.mp4";
const outputPath = join(dataDir, "assets", relativeOutput);

const prompt = `Use case: historical-scene
Asset type: standalone reusable Hatam/Papuan location-motion reference, silent review draft
Input image 1: exact set reference. Preserve this exact early-Roman Capernaum synagogue exterior: its scale, dark-basalt masonry, roofline, sun direction, camera framing, open main doorway, and plain vertical-plank pivot doors. Do not modernize or replace the building.
Input image 2: exact canon reference for ONE person, Jesus. Preserve his Papuan/Hatam face, shoulder-length hair, beard, build, cream outer mantle with restrained indigo vertical bands and corner detail, cream tunic, compact hand-knotted corner fringes, and simple first-century sandals. His mantle must never become predominantly blue. Use this image only as Jesus's identity and wardrobe reference, not as a second person.
Primary action: locked wide exterior shot. At first the familiar synagogue foreground is lightly populated. Several unnamed Papuan/Hatam townspeople enter naturally from different edges at independent times: one pair passes across the street beyond the synagogue, a merchant adjusts a small basket or folded cloth near the side, a parent guides a child, and two people pause briefly to speak quietly before moving on. They carry on ordinary business; no one poses or looks at the camera. Jesus enters the frame from one side after the background activity has begun, walks with calm purpose across the courtyard path, and enters the already-open synagogue early. By the midpoint of the clip Jesus has fully crossed the threshold; from the final third through the final frame, he is entirely inside and not visible in the doorway, while the open doorway is visibly empty. Do not end while he is approaching, crossing, standing in, or partly visible in the doorway. Other people continue their ordinary movements without synchronized gestures or parting theatrically for him.
Style/medium: photorealistic first-century Galilee, cinematic but locked-off documentary-wide composition, clear readable late-morning daylight.
Constraints: Jesus is a normal-height adult man, approximately 1.7 metres / 5 ft 7 in. Match his body scale to every other adult and to the existing doorway: his head and shoulders must be comfortably below the lintel, he must never be taller than the doorway or nearby adults, and he must not dominate the façade or appear giant-sized. Keep all townspeople normal adult or child scale as appropriate. Natural independently timed walking and small business motions; varied eyelines, depth, and pace; people remain Papuan/Hatam in appearance; controlled first-century wool/linen palette of cream, brown, charcoal, ochre, muted madder, and restrained indigo. The setting must remain coherent from first to last frame. Jesus appears once only. No spoken dialogue, chanting, singing, lip-sync, subtitles, title cards, text, logos, watermarks, modern objects, modern hinges, metal door hardware, ornate later limestone synagogue, crowds, miracles, confrontation, theatrical bowing, synchronized movement, camera movement, zoom, pan, or reframing.`;

async function main() {
  if (existsSync(outputPath)) throw new Error(`Refusing to overwrite retained video: ${outputPath}`);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-omni-1.1-flash",
      input: [{ type: "user_input", content: [
        { type: "image", mime_type: "image/png", data: readFileSync(synagoguePath).toString("base64") },
        { type: "text", text: "Image 1 is the sole location/set reference." },
        { type: "image", mime_type: "image/png", data: readFileSync(jesusPath).toString("base64") },
        { type: "text", text: prompt }
      ] }],
      response_format: { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
    })
  });
  const payload = await response.json() as { error?: { message?: string }, steps?: Array<{ type?: string, content?: Array<{ type?: string, data?: string }> }> };
  if (!response.ok || payload.error) throw new Error(`Gemini Omni request failed: ${response.status} ${payload.error?.message ?? "unexpected response"}`);
  const encoded = payload.steps?.find(step => step.type === "model_output")?.content?.find(item => item.type === "video")?.data;
  if (!encoded) throw new Error("Gemini Omni returned no video.");
  mkdirSync(join(dataDir, "assets", "generated", "media-library"), { recursive: true });
  writeFileSync(outputPath, Buffer.from(encoded, "base64"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", outputPath, "-an", "-vf", "fps=24,scale=-2:360", "-c:v", "libx264", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${outputPath}.normalized.mp4`]);
  execFileSync("powershell", ["-NoProfile", "-Command", `Move-Item -LiteralPath '${outputPath}.normalized.mp4' -Destination '${outputPath}' -Force`]);
  const library = registerStandaloneLibraryAsset(getDb(), dataDir, {
    assetPath: relativeOutput,
    title: "Capernaum synagogue: town life and Jesus entering",
    location: "Capernaum synagogue exterior, first-century production reconstruction",
    tags: ["capernaum", "synagogue", "exterior", "town-life", "jesus-entering", "hatam", "papuan", "silent-draft"],
    language: "Hatam",
    canonRegion: "Papuan",
    provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", tier: "draft", prompt, sourceReferences: ["generated/keyframes/capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r4-pivot-doors-16x9.png", "characters/jesus/motion/motion-walking-v3.png"], audio: "discarded", reviewStatus: "hold_for_review" }
  });
  console.log(JSON.stringify({ outputPath, library, prompt }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.stack : String(error)); process.exit(1); });
