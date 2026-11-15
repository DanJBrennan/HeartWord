import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTROL_ROOM_VOICE_PROFILES } from "../src/server/control-room-voice-profiles.js";

// This neutral line is rendered once per configured presentation voice. It is
// intentionally not saved as a HeartWord asset or used by the control room.
// Run it intentionally: it makes one paid TTS request for each saved profile.
const CALIBRATION_TEXT = "Please review this proposed scene with clarity and care. We will keep the Scripture, source audio, and producer approval in view before making any change.";
const PRESENTATION_SPEECH_SPEED = 1.15;
const PRESENTATION_SPEECH_STYLE = "Speak in connected, natural conversational sentences. Keep pauses purposeful and brief; do not space out words or use a slow, theatrical cadence unless the text itself requires it.";
const TARGET_INTEGRATED_LUFS = -22;
const MATERIAL_BOOST_DB = 1;

type Measurement = { agent: string; provider: string; integratedLufs: number; truePeakDbfs: number };

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stderr) : reject(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}

async function renderOpenAI(voice: string, instructions: string): Promise<Buffer> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: CALIBRATION_TEXT,
      instructions: `${instructions} ${PRESENTATION_SPEECH_STYLE}`,
      speed: PRESENTATION_SPEECH_SPEED,
      response_format: "mp3"
    })
  });
  if (!response.ok) throw new Error(`OpenAI synthesis failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function renderElevenLabs(voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      model_id: "eleven_multilingual_v2",
      text: CALIBRATION_TEXT,
      voice_settings: { stability: 0.42, similarity_boost: 0.72, style: 0.58, use_speaker_boost: true }
    })
  });
  if (!response.ok) throw new Error(`ElevenLabs synthesis failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function measure(path: string): Promise<{ integratedLufs: number; truePeakDbfs: number }> {
  const report = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
  const integrated = [...report.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)].at(-1)?.[1];
  const peak = [...report.matchAll(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/g)].at(-1)?.[1];
  if (!integrated || !peak) throw new Error(`Could not parse FFmpeg loudness report for ${path}`);
  return { integratedLufs: Number(integrated), truePeakDbfs: Number(peak) };
}

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.ELEVENLABS_API_KEY) throw new Error("Both OPENAI_API_KEY and ELEVENLABS_API_KEY are required.");
  const directory = await mkdtemp(join(tmpdir(), "heartword-control-room-calibration-"));
  try {
    const measurements: Measurement[] = [];
    for (const profile of CONTROL_ROOM_VOICE_PROFILES) {
      const audio = profile.voiceProvider === "elevenlabs"
        ? await renderElevenLabs(profile.voiceId)
        : await renderOpenAI(profile.voiceId, profile.deliveryInstructions);
      const path = join(directory, `${profile.agentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp3`);
      await writeFile(path, audio);
      const loudness = await measure(path);
      measurements.push({ agent: profile.agentName, provider: profile.voiceProvider, ...loudness });
    }
    console.log(JSON.stringify({
      method: "EBU R128 integrated loudness and true peak via ffmpeg ebur128=peak=true",
      calibrationText: CALIBRATION_TEXT,
      targetIntegratedLufs: TARGET_INTEGRATED_LUFS,
      measurements,
      recommendedBoosts: measurements
        .map(measurement => ({ agent: measurement.agent, gainDb: Math.round((TARGET_INTEGRATED_LUFS - measurement.integratedLufs) * 2) / 2 }))
        .filter(measurement => measurement.gainDb >= MATERIAL_BOOST_DB)
    }, null, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
