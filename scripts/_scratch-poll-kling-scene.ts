import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const apiKey = process.env.KLING_API_KEY_1!;
const HOST = "https://api-singapore.klingai.com";
const taskId = "926654085506400347";

let final;
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 15000));
  const res = await fetch(`${HOST}/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const data = await res.json() as any;
  const status = data.data?.task_status;
  console.log(`poll ${i+1}: ${status}`);
  if (status === "succeed" || status === "failed") { final = data; break; }
}
console.log(JSON.stringify(final, null, 2));

const videoUrl = final?.data?.task_result?.videos?.[0]?.url;
if (videoUrl) {
  const vidRes = await fetch(videoUrl);
  const buf = Buffer.from(await vidRes.arrayBuffer());
  const outPath = join(process.env.TEMP || "/tmp", "kling-scene-test.mp4");
  writeFileSync(outPath, buf);
  console.log("Saved:", outPath, buf.length, "bytes");
}
