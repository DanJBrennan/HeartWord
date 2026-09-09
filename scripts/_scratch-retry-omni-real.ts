import "dotenv/config";
import { GeminiDraftVideoProvider } from "../src/providers/gemini/index.js";

const keyframeRelPath = "generated/keyframes/codex-coverage/0d43887a-8c20-4271-a6d8-3cafad177558/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea.png";
const prompt = "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat.";

const provider = new GeminiDraftVideoProvider();
try {
  const result = await provider.generateDraft(
    { shotId: "_scratch-pilot-omni-fallback", prompt, characters: [] },
    { startFrame: { path: keyframeRelPath } }
  );
  console.log("SUCCESS:", JSON.stringify(result, null, 2));
} catch (err) {
  console.log("FAILED:", (err as Error).message.slice(0, 1500));
}
