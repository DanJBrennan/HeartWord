import "dotenv/config";
const apiKey = process.env.GEMINI_API_KEY!;

async function listModels(version: string) {
  let all: any[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    if (data.error) { console.log(`${version} models list ERROR:`, JSON.stringify(data.error)); return []; }
    all.push(...(data.models ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

const v1Models = await listModels("v1");
console.log(`v1 total models: ${v1Models.length}`);
const omniInV1 = v1Models.filter((m) => m.name.toLowerCase().includes("omni"));
console.log("Omni models in v1:", JSON.stringify(omniInV1, null, 2));

const v1betaModels = await listModels("v1beta");
const omniInV1beta = v1betaModels.filter((m) => m.name.toLowerCase().includes("omni"));
console.log("\nOmni models in v1beta:", JSON.stringify(omniInV1beta.map((m:any)=>({name:m.name, displayName:m.displayName})), null, 2));
