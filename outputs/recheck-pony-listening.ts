// Deliberate standalone repair of a malformed review, never a generation retry.
import "dotenv/config";
import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewNativeAmbience,nativeAmbiencePassed } from "../src/pipeline/assembly/soundtrack.js";
const folder=process.argv[2]!;
const first=JSON.parse(readFileSync(join(folder,"listening-review.json"),"utf8"));
const review=await reviewNativeAmbience(join(folder,"pony-native.mp4.ambience.wav"),"Standalone test: a close Shetland pony gives a clear unmistakable horse neigh/whinny followed by a soft snort with quiet outdoor wind. A neigh is a permitted nonverbal animal call, not human speech. No human speech, singing or music. Independently identify the actual sound. REVIEW OUTPUT REQUIREMENT: confidence must be a percentage on the 0–100 scale (for example 98), never a 0–1 fraction; preserve uncertainty honestly.");
const result={...review,passed:nativeAmbiencePassed(review.verdict),reasonForRepeat:"The first retained listening verdict used fractional confidence 0.98; no scale conversion or approval was fabricated",firstReviewFile:"listening-review.json",combinedEstimatedReviewUsd:first.costUsd+review.costUsd,productionAdmission:"No production DB or approved asset collection modified"};
writeFileSync(join(folder,"listening-review-r2.json"),JSON.stringify(result,null,2),{flag:"wx"});
console.log(JSON.stringify(result,null,2));
