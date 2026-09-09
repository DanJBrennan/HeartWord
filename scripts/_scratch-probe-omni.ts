import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY!;

// 1. Get the model's own metadata (input/output token limits, supported
// modalities if the API exposes them) before spending a call.
const infoUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-omni-1.1-flash?key=${apiKey}`;
const infoRes = await fetch(infoUrl);
console.log("=== Model info ===");
console.log(JSON.stringify(await infoRes.json(), null, 2));
