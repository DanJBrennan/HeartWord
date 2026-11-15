import { Router } from "express";
import { listElevenLabsVoices, type ElevenLabsVoice } from "../providers/elevenlabs.js";

export const voicesRouter = Router();

// ElevenLabs' voice list changes rarely; avoid re-fetching on every page
// load/render.
let cache: { voices: ElevenLabsVoice[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

voicesRouter.get("/", async (_req, res) => {
  try {
    if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
      cache = { voices: await listElevenLabsVoices(), fetchedAt: Date.now() };
    }
    res.json({ voices: cache.voices });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
