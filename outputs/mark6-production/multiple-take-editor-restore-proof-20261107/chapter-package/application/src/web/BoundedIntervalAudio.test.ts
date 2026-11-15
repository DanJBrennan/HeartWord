import { expect, it, vi } from "vitest";
import { beginInterval, endInterval, intervalTimecode } from "./BoundedIntervalAudio.js";

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

it("shows an interval-relative clock in hundredths, clamped to the source excerpt",()=>{
  expect(intervalTimecode(133.062,133.062,144.13)).toBe("0.00 / 11.07 s");
  expect(intervalTimecode(135.567,133.062,144.13)).toBe("2.50 / 11.07 s");
  expect(intervalTimecode(145,133.062,144.13)).toBe("11.07 / 11.07 s");
});
