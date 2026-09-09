import "dotenv/config";
const apiKey = process.env.GEMINI_API_KEY!;
const candidates = [
  "https://generativelanguage.googleapis.com/v1beta2/interactions",
  "https://generativelanguage.googleapis.com/v1beta/interactions",
  "https://generativelanguage.googleapis.com/v1/interactions",
  "https://generativelanguage.googleapis.com/v1beta2/models/gemini-omni-1.1-flash:interact",
];
for (const url of candidates) {
  const res = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-omni-1.1-flash", input: "ping" })
  });
  const text = await res.text();
  console.log(url, "->", res.status, text.slice(0, 300));
  console.log("---");
}
