/** Documented REST adapters; vendor changes stay outside the Composer/Sound Designer. */
export interface SoundtrackRequest { kind: "music" | "sfx"; prompt: string; durationMs: number; loop: boolean }
export interface SoundtrackResult { bytes: Buffer; mimeType: string; provider: string; model: string; usage: unknown; requestId: string | null }
export interface SoundtrackProvider { generate(request: SoundtrackRequest): Promise<SoundtrackResult> }

export class GeminiMusicProvider implements SoundtrackProvider {
  constructor(private readonly request: typeof fetch = fetch) {}
  async generate(input: SoundtrackRequest): Promise<SoundtrackResult> {
    if (input.kind !== "music" || !Number.isFinite(input.durationMs) || input.durationMs < 1000 || input.durationMs > 180000) throw new Error("Music requests must be 1–180 seconds.");
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required for music generation.");
    const model = process.env.GEMINI_MUSIC_MODEL || "lyria-3.5";
    const response = await this.request("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(300000),
      body: JSON.stringify({ model, input: `${input.prompt}\nCreate approximately ${input.durationMs / 1000} seconds. Instrumental only: no vocals, lyrics, spoken words, chanting or narration.${input.loop ? " Make the ending join the beginning smoothly." : " Provide a clean musical ending."}` })
    });
    if (!response.ok) throw new Error(`Gemini music generation failed (${response.status}).`);
    const data = await response.json() as { id?: string; usage?: unknown; steps?: Array<{ type: string; content?: Array<{ type: string; data?: string; mime_type?: string }> }> };
    const audio = data.steps?.filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(c => c.type === "audio" && c.data);
    if (!audio || audio.length !== 1) throw new Error("Gemini did not return one complete audio asset; review the request before retrying.");
    const bytes = Buffer.from(audio[0]!.data!, "base64");
    if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("Invalid music payload size.");
    return { bytes, mimeType: audio[0]!.mime_type ?? "audio/mpeg", provider: "gemini", model, usage: data.usage ?? null, requestId: data.id ?? null };
  }
}

export class ElevenLabsEffectsProvider implements SoundtrackProvider {
  constructor(private readonly request: typeof fetch = fetch) {}
  async generate(input: SoundtrackRequest): Promise<SoundtrackResult> {
    if (input.kind !== "sfx" || !Number.isFinite(input.durationMs) || input.durationMs < 500 || input.durationMs > 30000) throw new Error("Sound effects must be 0.5–30 seconds.");
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY is required for sound effects.");
    const model = "eleven_text_to_sound_v2";
    const response = await this.request("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
      method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": key }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ text: `${input.prompt}\nSound effect only. No intelligible speech, narration or music.`, model_id: model,
        duration_seconds: input.durationMs / 1000, loop: input.loop, prompt_influence: 0.5 })
    });
    if (!response.ok) throw new Error(`ElevenLabs sound generation failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Invalid effect payload size.");
    return { bytes, mimeType: "audio/mpeg", provider: "elevenlabs", model,
      usage: { characterCost: response.headers.get("character-cost") }, requestId: response.headers.get("request-id") };
  }
}
