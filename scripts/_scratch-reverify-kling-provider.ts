import "dotenv/config";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const provider = new KlingVideoProvider();
const result = await provider.generateFinal(
  {
    shotId: "_scratch-reverify",
    prompt: "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat, eyes open, alert and hopeful.",
    characters: []
  },
  { startFrame: { path: "generated/edits/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea-0ad985c8.jpg" } }
);
console.log(JSON.stringify(result, null, 2));
