import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-omni-1.1-flash:generateContent?key=${apiKey}`;

async function tryCall(label: string, body: any) {
  console.log(`\n=== ${label} ===`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log("status:", res.status);
  console.log(text.slice(0, 1500));
}

// Baseline: plain text-only prompt, default config.
await tryCall("plain text, no generationConfig", {
  contents: [{ role: "user", parts: [{ text: "Say hello in one short sentence." }] }]
});

// Try asking for VIDEO output explicitly.
await tryCall("responseModalities: VIDEO", {
  contents: [{ role: "user", parts: [{ text: "Generate a short video of a calm lake at sunrise." }] }],
  generationConfig: { responseModalities: ["VIDEO"] }
});
