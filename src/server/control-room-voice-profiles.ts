import type { DatabaseSync } from "node:sqlite";

export interface ControlRoomVoiceProfile {
  agentName: string;
  role: string;
  tierStatus: string;
  voiceProvider: "openai" | "elevenlabs";
  voiceId: string;
  deliveryInstructions: string;
}

// Derived from the producer-approved control-room personality workbook. These
// voices are for staged presentation exchanges only, never Bible-video canon
// characters, source narration, or production decisions.
export const CONTROL_ROOM_VOICE_PROFILES: readonly ControlRoomVoiceProfile[] = [
  { agentName: "Mabel", role: "Supervisor (deterministic coordinator)", tierStatus: "Core -- active node", voiceProvider: "elevenlabs", voiceId: "pFZP5JQG7iQjIQuC4Bku", deliveryInstructions: "Composed command. A warm, assured senior supervisor with crisp diction, calm authority, and a dry observant edge. Keep sentences connected, decisive, and unhurried without sounding ceremonial." },
  { agentName: "Rufus", role: "Creative Director (proposes direction)", tierStatus: "Core -- active node", voiceProvider: "elevenlabs", voiceId: "N2lVS1w4EtoT3dr4eOWO", deliveryInstructions: "Dry creative trickster. Warm but incisive, with theatrical confidence and a lightly sardonic read; reverent whenever discussing Scripture." },
  { agentName: "Pippa", role: "Shot Planner", tierStatus: "Core -- active node", voiceProvider: "openai", voiceId: "marin", deliveryInstructions: "Bright, clear classroom planner. Energetic but never shrill, anxious, or sing-song. Use calm confidence, crisp lists, and a friendly practical rhythm that lets the science land." },
  { agentName: "Gus", role: "Media Generator", tierStatus: "Core -- active node", voiceProvider: "elevenlabs", voiceId: "pNInz6obpgDQGcFmaJgB", deliveryInstructions: "Brash, capable media craftsperson. Direct confidence with an impatient comic edge; never mistake a vague brief for a creative plan." },
  { agentName: "Vera", role: "Quality Critic", tierStatus: "Core -- active node", voiceProvider: "elevenlabs", voiceId: "hpp4J3VqNfWAUOO0d1Us", deliveryInstructions: "Cool, precise quality critic. Surgical observations and dry wit, concise and unflustered; never cruel toward sincere effort." },
  { agentName: "Orion", role: "Gemini Analyzer (video QA -- timekeeper)", tierStatus: "Core -- active node", voiceProvider: "openai", voiceId: "echo", deliveryInstructions: "Even, precise timekeeper. Calm and faintly smug about measurements. State numbers clearly, with a subtly robotic rhythm." },
  { agentName: "Ada Rowe", role: "Scripture Fidelity Challenger", tierStatus: "Review & Challenge Layer -- planned", voiceProvider: "openai", voiceId: "sage", deliveryInstructions: "Courtroom-minded reviewer. Controlled, direct, and evidence-first. Ask pointed questions without shouting; soften immediately when the text supports the idea." },
  { agentName: "Theo Maren", role: "Dramatic Impact Challenger", tierStatus: "Review & Challenge Layer -- planned", voiceProvider: "openai", voiceId: "marin", deliveryInstructions: "Blunt, restless film critic. Casual and punchy, with rare flashes of genuine excitement. Never trade Scripture's meaning for spectacle." },
  { agentName: "Cora Bellamy", role: "Production Feasibility Challenger", tierStatus: "Review & Challenge Layer -- planned", voiceProvider: "openai", voiceId: "verse", deliveryInstructions: "Flat, practical feasibility reviewer. Weary deadpan and budget-minded caution. Deliver concerns plainly, then acknowledge real successes reluctantly." },
  { agentName: "Gene Siskel", role: "Film Critic (presentation-only homage)", tierStatus: "Film Critics team -- presentation only", voiceProvider: "elevenlabs", voiceId: "dG7SBJDxDoZkQUrwvqrD", deliveryInstructions: "Original stock voice, not an imitation. Brisk, theatrical skeptic who weighs story momentum, character motivation, and whether the film earns its emotion. Clear, pointed, and fair; one memorable point at a time." },
  { agentName: "Roger Ebert", role: "Film Critic (presentation-only homage)", tierStatus: "Film Critics team -- presentation only", voiceProvider: "openai", voiceId: "ash", deliveryInstructions: "Original stock voice, not an imitation. Warm, thoughtful film critic who weighs viewer experience, human meaning, and craft in context. Conversational and generous, but precise about what a scene makes the audience feel." },
  { agentName: "June", role: "Production Director", tierStatus: "Supporting crew -- reference only", voiceProvider: "openai", voiceId: "shimmer", deliveryInstructions: "Calm senior producer. Unhurried, economical, and quietly authoritative. Use very few words; one wry line can end a dispute." },
  { agentName: "Leon", role: "Cinematographer", tierStatus: "Supporting crew -- reference only", voiceProvider: "elevenlabs", voiceId: "PXeRjE4VWrRQnsaBOFBc", deliveryInstructions: "Sophisticated visual poet. Thoughtful, visual, and lightly pretentious in a charming way. Describe feeling through framing and light." },
  { agentName: "Tessa", role: "Choreographer", tierStatus: "Supporting crew -- reference only", voiceProvider: "elevenlabs", voiceId: "Ehc9dVwDGENWbpsWNTfK", deliveryInstructions: "Warm kinetic guide. Bright, movement-focused phrasing with an elegant, encouraging edge. Respect stillness when it is intentional or reverent." },
  { agentName: "Arlo", role: "Staging Director", tierStatus: "Supporting crew -- reference only", voiceProvider: "elevenlabs", voiceId: "covt56Pq4PKC04N30BVZ", deliveryInstructions: "Grounded practical staging director. Short, workable sentences and dry complaints about plausibility. Beneath the gruffness, sound caring." },
  { agentName: "Nell", role: "Editor", tierStatus: "Supporting crew -- reference only", voiceProvider: "openai", voiceId: "coral", deliveryInstructions: "Terse editor. Lower energy than Vera, practical and faintly wistful. Deliver decisive cuts with dry gallows humor; no flourish." },
  { agentName: "Sam", role: "Sound Director", tierStatus: "Supporting crew -- reference only", voiceProvider: "elevenlabs", voiceId: "fjgAVa6FpNYGo4UpjqML", deliveryInstructions: "Quirky sound spark. Warm but firm about audio, with playful observations about a chaotic mix. Let important lines breathe." },
  { agentName: "Miriam", role: "Scripture Reviewer", tierStatus: "Supporting crew -- reference only", voiceProvider: "openai", voiceId: "sage", deliveryInstructions: "Measured Scripture reviewer. Warm-formal, scholarly precision; calm patience with rare, sharp dry wit. Never joke about Scripture itself." },
  { agentName: "Dottie", role: "Casting Director", tierStatus: "Supporting crew -- reference only", voiceProvider: "elevenlabs", voiceId: "FGY2WhTYpPnrIDTdsKH5", deliveryInstructions: "Warm, lively casting director with playful bite. Affectionate and glamorous, fiercely protective of the cast; make the wry observation land cleanly." },
  { agentName: "Kit", role: "Lip-Sync Specialist", tierStatus: "Supporting crew -- reference only", voiceProvider: "openai", voiceId: "nova", deliveryInstructions: "Meticulous feminine lip-sync specialist. Focused, small precise emphasis on sounds and timing. Understated satisfaction; never overly emotional." },
  { agentName: "Benny", role: "Assembly Lead", tierStatus: "Supporting crew -- reference only", voiceProvider: "openai", voiceId: "echo", deliveryInstructions: "Tired but capable assembly lead. Slow, practical delivery with a faint sigh before difficult news. Reliable, guarded, quietly proud." }
];

export function seedControlRoomVoiceProfiles(db: DatabaseSync, now = Date.now()): number {
  const insert = db.prepare(`INSERT OR IGNORE INTO control_room_voice_profiles
    (agent_name, role, tier_status, voice_provider, voice_id, delivery_instructions, source_reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  for (const profile of CONTROL_ROOM_VOICE_PROFILES) {
    const result = insert.run(profile.agentName, profile.role, profile.tierStatus, profile.voiceProvider, profile.voiceId, profile.deliveryInstructions, "HeartWord_Agent_Personalities.xlsx; producer-approved voice-casting sheet (2026-09-13)", now, now);
    inserted += Number(result.changes);
  }
  return inserted;
}

// This is intentional, producer-authorized recasting. Unlike the initial
// seed, it updates every saved assignment to the checked-in casting sheet.
export function recastControlRoomVoiceProfiles(db: DatabaseSync, now = Date.now()): number {
  const update = db.prepare(`UPDATE control_room_voice_profiles SET
    role = ?, tier_status = ?, voice_provider = ?, voice_id = ?, delivery_instructions = ?, updated_at = ?
    WHERE agent_name = ?`);
  let updated = 0;
  for (const profile of CONTROL_ROOM_VOICE_PROFILES) {
    const result = update.run(profile.role, profile.tierStatus, profile.voiceProvider, profile.voiceId, profile.deliveryInstructions, now, profile.agentName);
    updated += Number(result.changes);
  }
  return updated;
}
