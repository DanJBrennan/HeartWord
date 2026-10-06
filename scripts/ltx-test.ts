import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { getDataDir } from "../src/db/client.js";
import { LtxVideoProvider, validateLtxOptions } from "../src/providers/ltx/index.js";
import { closeLtxTunnel } from "../src/providers/ltx/transport.js";
import { nativeAmbiencePassed, reviewNativeAmbience, type NativeAmbienceResult } from "../src/pipeline/assembly/soundtrack.js";

const { values } = parseArgs({ options: { image: {type:"string"}, prompt: {type:"string"}, duration: {type:"string",default:"5"}, resolution: {type:"string",default:"720p"}, seed: {type:"string"}, output: {type:"string"}, audio: {type:"string",default:"ambient"}, health: {type:"boolean"}, help: {type:"boolean"} } });
const usage = 'npm run ltx:test -- --image "C:\\path\\keyframe.png" --prompt "Natural cinematic movement..." --duration 5 --resolution 720p\nHealth only: npm run ltx:test -- --health\nAudio defaults to environmental ambience with a listening review (uses existing GEMINI_API_KEY); --audio none produces a silent clip.\nOutput defaults to HeartWordData/assets/generated/video; --output must stay inside HeartWordData/assets. Set LTX_TOKEN in this shell, never in a project file.';
if (values.help) console.log(usage);
else {
  try {
    const provider = new LtxVideoProvider();
    if (values.health) console.log(JSON.stringify(await provider.checkHealth(), null, 2));
    else {
      if (!values.image || !values.prompt) throw new Error(usage);
      const durationSeconds = Number(values.duration), resolution = values.resolution!;
      validateLtxOptions(resolution, durationSeconds, 24);
      if (values.audio !== "ambient" && values.audio !== "none") throw new Error("--audio must be ambient or none.");
      if (!process.env.LTX_TOKEN?.trim()) throw new Error("LTX_TOKEN is missing from this process environment.");
      const dataDir = getDataDir(), id = `diagnostic-${randomUUID()}`;
      const source = resolve(values.image);
      const relativeInput = `generated/ltx-diagnostics/${id}${extname(source)}`;
      mkdirSync(join(dataDir,"assets","generated","ltx-diagnostics"),{recursive:true});
      copyFileSync(source,join(dataDir,"assets",relativeInput));
      const result = await provider.generateFinal({shotId:id,prompt:values.prompt,characters:[]},{startFrame:{path:relativeInput},durationSeconds,resolution,fps:24,audioMode:values.audio,seed:values.seed === undefined ? undefined : Number(values.seed),outputPath:values.output ? resolve(values.output) : undefined,onProgress:progress=>console.log(JSON.stringify({at:new Date().toISOString(),...progress}))});
      if (result.ambientAudio) {
        const metadataPath = `${result.ambientAudio.path}.review.json`;
        let ambienceReview: NativeAmbienceResult;
        console.log(JSON.stringify({phase:"reviewing_ambience"}));
        try {
          const review = await reviewNativeAmbience(join(dataDir,"assets",result.ambientAudio.path), result.provenance.prompt);
          ambienceReview = {status:nativeAmbiencePassed(review.verdict) ? "accepted" : "held",reason:review.verdict.reason,costUsd:review.costUsd,verdict:review.verdict,metadataPath};
        } catch(error) {
          ambienceReview = {status:"held",reason:error instanceof Error ? error.message : "Listening review unavailable.",metadataPath};
        }
        writeFileSync(join(dataDir,"assets",metadataPath),JSON.stringify(ambienceReview,null,2),{flag:"wx"});
        result.metadata = {...result.metadata,ambienceReview};
        writeFileSync(`${join(dataDir,"assets",result.media!.path)}.json`,JSON.stringify(result.metadata,null,2));
      }
      console.log(JSON.stringify(result,null,2));
    }
  } catch(error) {
    console.error(error instanceof Error ? error.message : "LTX diagnostic failed.");
    process.exitCode = 1;
  } finally { closeLtxTunnel(); }
}
