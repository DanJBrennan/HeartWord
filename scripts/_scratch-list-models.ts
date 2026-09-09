import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY not set");

let allModels: any[] = [];
let pageToken: string | undefined;
do {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Status:", res.status, res.statusText);
    console.error(await res.text());
    process.exit(1);
  }
  const data = await res.json() as any;
  allModels.push(...(data.models ?? []));
  pageToken = data.nextPageToken;
} while (pageToken);

console.log(`Total models: ${allModels.length}\n`);
for (const m of allModels) {
  console.log(`${m.name}  --  displayName="${m.displayName}"  methods=${JSON.stringify(m.supportedGenerationMethods)}`);
}
