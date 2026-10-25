/** CLI wrapper for the shared chapter-title composition. */
import "dotenv/config";
import { buildChapterTitleCard } from "../src/pipeline/assembly/chapter-title-card.js";

const [bgFrame, title, language, outVideo, durationArg] = process.argv.slice(2);
if (!bgFrame || !title || !language || !outVideo) {
  console.error("Usage: npx tsx scripts/build-chapter-title-card.ts <clean-bg.png> <book chapter> <language name> <new-output.mp4> [durationSec]");
  process.exitCode = 2;
} else {
  const durationMs = durationArg === undefined ? 2500 : Math.round(Number(durationArg) * 1000);
  const result = buildChapterTitleCard({backgroundFrame:bgFrame,bookChapter:title,languageName:language,outputVideo:outVideo,durationMs,profile:"mark4-serif-over-establishing"});
  console.log(`Saved: ${result.path} (${result.durationMs}ms)`);
}
