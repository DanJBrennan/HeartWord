import { expect, it, vi } from "vitest";
import { beginInterval, endInterval } from "./BoundedIntervalAudio.js";

it("starts outside playback at the displayed interval start and resets after its end",()=>{
  const audio={currentTime:12,pause:vi.fn()};
  beginInterval(audio,0.59,2.99);
  expect(audio.currentTime).toBe(0.59);
  audio.currentTime=2.99;
  endInterval(audio,0.59);
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(0.59);
});

it("does not interrupt a native play already inside the displayed interval",()=>{
  const audio={currentTime:1.2,pause:vi.fn()};
  beginInterval(audio,0.59,2.99);
  expect(audio.currentTime).toBe(1.2);
});
