import "dotenv/config";
const apiKey = process.env.GEMINI_API_KEY!;
const res = await fetch(`https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta&key=${apiKey}`);
console.log("status:", res.status);
const data = await res.json() as any;
console.log("Top-level resources:", Object.keys(data.resources ?? {}));
// Look for anything related to "interaction"
const json = JSON.stringify(data);
const idx = json.toLowerCase().indexOf("interaction");
console.log("Contains 'interaction'?", idx !== -1);
if (idx !== -1) {
  console.log(json.slice(Math.max(0, idx - 200), idx + 1000));
}
