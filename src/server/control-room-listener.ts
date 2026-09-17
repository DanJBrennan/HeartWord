/**
 * Configuration for the control-room's separate, presentation-only listener.
 * It receives short microphone turns to identify cast names; it must never
 * create a HeartWord production action or persist a transcript.
 */
export const CONTROL_ROOM_TRANSCRIPTION_PROMPT =
  "HeartWord control-room cast names: Mabel, Rufus, Pippa, Gus, Vera, Orion, June, Leon, Tessa, Arlo, Nell, Sam, Miriam, Dottie, Kit, Ada, Theo, Cora, Gene Siskel, Roger Ebert. Preserve these names when spoken.";

export const createControlRoomRealtimeSession = () => ({
  type: "realtime",
  model: "gpt-realtime",
  audio: {
    input: {
      transcription: {
        model: "gpt-4o-mini-transcribe",
        language: "en",
        prompt: CONTROL_ROOM_TRANSCRIPTION_PROMPT
      },
      turn_detection: {
        type: "server_vad",
        create_response: false,
        interrupt_response: false
      }
    }
  }
});
