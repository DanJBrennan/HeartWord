import { afterEach, expect, it, vi } from "vitest";
import { mediaUrl, pollProduction, soloPlayback } from "../../src/web/production-playback.js";
afterEach(() => vi.useRealTimers());
it("solo playback pauses source/cast/program/ambience competitors without stacking speech", () => {
  const players = Array.from({ length: 5 }, () => ({ pause: vi.fn() }));
  soloPlayback(players[1]!, players); expect(players[1]!.pause).not.toHaveBeenCalled();
  for (const player of players.filter((_, index) => index !== 1)) expect(player.pause).toHaveBeenCalledOnce();
  expect(mediaUrl("generated\\shot 1#take.mp4")).toBe("/media/generated/shot%201%23take.mp4");
});
it("serial polling receives arriving material, exposes disconnect and recovers without reopening", async () => {
  vi.useFakeTimers(); const receive = vi.fn(), failed = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ reel: [] }) }).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, json: async () => ({ reel: ["accepted"] }) });
  const stop = pollProduction("/p/view", receive, failed, 2500, fetcher); await vi.advanceTimersByTimeAsync(0); expect(receive).toHaveBeenLastCalledWith({ reel: [] });
  await vi.advanceTimersByTimeAsync(2500); expect(failed).toHaveBeenCalledWith("offline");
  await vi.advanceTimersByTimeAsync(2500); expect(receive).toHaveBeenLastCalledWith({ reel: ["accepted"] }); stop();
  await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(3);
});
it("aborts old-project polling and discards late replies even when transport ignores abort", async () => {
  vi.useFakeTimers(); let resolve!: (value: unknown) => void;
  const fetcher = vi.fn(() => new Promise(done => { resolve = done; })) as unknown as typeof fetch;
  const receive = vi.fn(), failed = vi.fn(); const stop = pollProduction("/old/view", receive, failed, 2500, fetcher); stop();
  resolve({ ok: true, json: async () => ({ project: "old" }) }); await vi.advanceTimersByTimeAsync(5000);
  expect(receive).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
});
it("never overlaps requests when the server is slow", async () => {
  vi.useFakeTimers(); const fetcher = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  const failed = vi.fn();
  const stop = pollProduction("/p/view", vi.fn(), failed, 2500, fetcher); await vi.advanceTimersByTimeAsync(30000); expect(fetcher).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledWith(expect.stringContaining("state is unverified")); stop();
});
