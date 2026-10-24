/**
 * ElevenLabs client: voice listing (for the voice-casting dropdown -- see
 * docs/design/character-tool.md, "Voice Mapping and Live Test") and the
 * speech-to-speech re-voicing call that produces the composite cast
 * master (see the VoiceProvider interface in docs/ARCHITECTURE.md).
 *
 * ElevenLabs has no native "voice group"/"collection" API object -- any
 * grouping Dan has set up in his account (e.g. a "BVET" set) lives only in
 * the ElevenLabs dashboard UI or as a custom label value, not as a
 * queryable field this client can filter on server-side. So listVoices
 * returns every voice on the account, and the web UI does the filtering.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
}

const API_BASE = "https://api.elevenlabs.io/v2/voices";

export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env (see .env.example) -- this calls ElevenLabs' API to list " +
        "the voices available on Dan's account for casting."
    );
  }

  const voices: ElevenLabsVoice[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(API_BASE);
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("next_page_token", pageToken);

    const res = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs voice list failed: ${res.status} ${res.statusText} -- ${body}`);
    }
    const data = (await res.json()) as {
      voices: Array<{
        voice_id: string;
        name: string;
        category?: string;
        labels?: Record<string, string>;
        description?: string;
        preview_url?: string;
      }>;
      has_more: boolean;
      next_page_token?: string;
    };

    for (const v of data.voices) {
      voices.push({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category ?? null,
        labels: v.labels ?? {},
        description: v.description ?? null,
        previewUrl: v.preview_url ?? null
      });
    }

    pageToken = data.has_more ? data.next_page_token : undefined;
  } while (pageToken);

  return voices;
}


export interface ReVoiceResult {
  audioBuffer: Buffer;
  contentType: string;
  requestSettings: { model_id: string; remove_background_noise: boolean; output_format: string; voice_settings?: Record<string,number|boolean> };
  usage?: {requestId:string|null;historyItemId:string|null;characterCost:string|null};
}

/**
 * Speech-to-speech (voice changer): re-performs a REAL Hatam audio clip
 * (a stage-1 original_reading segment) in the chosen character voice.
 * Not text-to-speech -- there's no Hatam TTS model, so this transforms
 * the actual recorded performance rather than synthesizing speech from
 * text. Uses the multilingual model since the source audio is Hatam, not
 * English. Output feeds the composite cast master (PRODUCT_VISION.md's
 * Three-Layer Audio Architecture) and, later, Kling's Avatar API for
 * lip-sync.
 */
export async function reVoiceAudio(voiceId: string, sourceAudioPath: string, options: {voiceSettings?:Record<string,number|boolean>} = {}): Promise<ReVoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env (see .env.example) -- this calls ElevenLabs' speech-to-speech " +
        "API to re-voice a Hatam audio clip into the character's chosen voice."
    );
  }

  const audioBytes = await readFile(sourceAudioPath);
  const requestSettings:ReVoiceResult["requestSettings"] = { model_id: "eleven_multilingual_sts_v2", remove_background_noise: true, output_format: "mp3_44100_128",...(options.voiceSettings?{voice_settings:options.voiceSettings}:{}) };
  const form = new FormData();
  form.append("audio", new Blob([audioBytes]), basename(sourceAudioPath));
  form.append("model_id", requestSettings.model_id);
  form.append("remove_background_noise", String(requestSettings.remove_background_noise));
  if(requestSettings.voice_settings)form.append("voice_settings",JSON.stringify(requestSettings.voice_settings));

  const url = `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=${requestSettings.output_format}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs speech-to-speech failed for voice ${voiceId} on ${sourceAudioPath}: ${res.status} ${res.statusText} -- ${body}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return { audioBuffer: Buffer.from(arrayBuffer), contentType: res.headers.get("content-type") ?? "audio/mpeg", requestSettings,usage:{requestId:res.headers.get("request-id"),historyItemId:res.headers.get("history-item-id"),characterCost:res.headers.get("character-cost")} };
}
