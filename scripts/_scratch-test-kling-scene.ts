import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.KLING_API_KEY_1!;
const dataDir = getDataDir();
const keyframePath = join(dataDir, "assets", "generated/edits/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea-0ad985c8.jpg");
const imageBase64 = readFileSync(keyframePath).toString("base64");

const HOST = "https://api-singapore.klingai.com";
const submitRes = await fetch(`${HOST}/v1/videos/image2video`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model_name: "kling-v1",
    image: imageBase64,
    prompt: "Static wide shot, everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. No one speaks.",
    duration: "5",
    aspect_ratio: "16:9"
  })
});
console.log("status:", submitRes.status);
const submitData = await submitRes.json() as any;
console.log(JSON.stringify(submitData, null, 2).slice(0, 2000));
