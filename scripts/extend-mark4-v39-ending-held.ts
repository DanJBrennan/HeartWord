/**
 * Produce a held, post-source Mark 4 ending extension.
 *
 * Dan asked for two further 8-second slow pull-aways after the approved
 * dawn handoff.  This never changes the chapter's source/cast audio: it
 * appends editorial picture and a restrained tail of the already reviewed
 * finale cue, then records the result as held review media.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v39-shore-generic-talk-removed-held.mp4";
const firstRel = "generated/editorial/mark4-ending/held-extension-pullaway-1-v1.png";
const secondRel = "generated/editorial/mark4-ending/held-extension-pullaway-2-v1.png";
const cueRel = "generated/soundtrack/8a5659a4-b033-4d5f-80e2-904b217cf8a0/mark4-overnight-outro-v1-23db88b3-3c42-4467-87ec-ea460b5e1173.mp3";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v40-ending-extension-held.mp4";
const extensionRel = "generated/editorial/mark4-ending/held-extension-pullaways-v1.mp4";
const extensionFrames = 16 * fps;
const data = getDataDir(), assets = join(data, "assets");
const required = [baseRel, firstRel, secondRel, cueRel].map(path => join(assets, path));
for (const path of required) if (!existsSync(path)) throw new Error(`Missing required held-ending asset: ${path}`);

const output = join(assets, outputRel);
const extension = join(assets, extensionRel);
const frames = (path: string) => Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" }).trim());
const baseFrames = frames(join(assets, baseRel));
if (!Number.isInteger(baseFrames) || baseFrames < 1) throw new Error("The held v39 input does not have a decoded frame count.");

const filter = [
  // Both stills begin a little closer and settle to their full view: a true
  // slow pull-away, not a freeze or a new story event.
  `[0:v]scale=1434:806,zoompan=z='if(lte(on,1),1.10,max(1.0,1.10-on*0.00052))':d=192:s=1280x720:fps=${fps},setpts=PTS-STARTPTS[pull1]`,
  `[1:v]scale=1434:806,zoompan=z='if(lte(on,1),1.10,max(1.0,1.10-on*0.00052))':d=192:s=1280x720:fps=${fps},setpts=PTS-STARTPTS[pull2]`,
  `[pull1][pull2]concat=n=2:v=1:a=0[video]`,
  // Use the resolving 16 seconds of the existing reviewed finale cue.  It
  // starts softly under the old cut's tail and fades to silence at the end.
  `[2:a]atrim=start=8:duration=16,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.75,afade=t=out:st=12.5:d=3.5[endingMusic]`,
  `[endingMusic]anull,aresample=96000[audio]`
].join(";");

// Generate exactly one 192-frame output from each still.  A 1/8fps looping
// input is intentional: feeding the zoompan filter a 24fps loop would ask it
// to expand *every* input image into eight seconds.
execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-loop", "1", "-framerate", "1/8", "-t", "8", "-i", join(assets, firstRel),
  "-loop", "1", "-framerate", "1/8", "-t", "8", "-i", join(assets, secondRel),
  "-i", join(assets, cueRel), "-filter_complex", filter,
  "-map", "[video]", "-map", "[audio]", "-c:v", "libx264", "-profile:v", "high", "-level:v", "3.1", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-video_track_timescale", "12288", "-c:a", "aac", "-ar", "96000", "-b:a", "192k", "-movflags", "+faststart", extension
], { stdio: "inherit" });

if (frames(extension) !== extensionFrames) throw new Error("The two pull-away segment is not exactly sixteen seconds.");
// Joining compatible H.264/AAC streams avoids an expensive, lossy re-encode
// of the entire approved chapter.  FFmpeg reads the concat listing on stdin,
// leaving no helper file in the project.
const quoteConcat = (path: string) => path.replace(/'/g, "'\\\\''");
execFileSync("ffmpeg", ["-v", "error", "-y", "-protocol_whitelist", "file,pipe,fd,crypto,data", "-f", "concat", "-safe", "0", "-i", "-", "-c", "copy", "-movflags", "+faststart", output], {
  input: `file '${quoteConcat(join(assets, baseRel))}'\nfile '${quoteConcat(extension)}'\n`, stdio: ["pipe", "inherit", "inherit"]
});

const actualFrames = frames(output), expectedFrames = baseFrames + extensionFrames;
if (actualFrames !== expectedFrames) throw new Error(`Frame-lock failure: expected ${expectedFrames}, received ${actualFrames}.`);
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (Math.abs(duration - expectedFrames / fps) > 0.15) throw new Error(`Duration failure: expected ${expectedFrames / fps}, received ${duration}.`);

const db = getDb(), now = Date.now(), renderId = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(renderId, projectId, outputRel, Math.round(duration * 1000), 2, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(renderId,
      JSON.stringify({ pictureBase: baseRel, heldForReview: true, postSourceExtension: [
        { startFrame: baseFrames, endFrame: baseFrames + 191, durationFrames: 192, keyframe: firstRel, treatment: "slow dawn-shore pull-away" },
        { startFrame: baseFrames + 192, endFrame: expectedFrames - 1, durationFrames: 192, keyframe: secondRel, treatment: "slow broad-lake final pull-away" }
      ] }),
      JSON.stringify({ baseAudio: baseRel, sourceCastAudioUnchanged: true, editorialMusic: { path: cueRel, startSeconds: 8, durationSeconds: 16, postSourceOnly: true } }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, baseFrames, extensionFrames, expectedFrames, durationSeconds: duration, heldForReview: true }, null, 2));
