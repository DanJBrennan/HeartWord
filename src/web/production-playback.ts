export const mediaUrl = (path: string) => `/media/${path.split(/[\\/]/).map(encodeURIComponent).join("/")}`;

/** All producer auditions are solo. A cast/source switch, reel or existing
 * editor player pauses the previous sound before it can duplicate speech. */
export function soloPlayback<T extends { pause(): void }>(current: T, players: Iterable<T>) {
  for (const player of players) if (player !== current) player.pause();
}

/** Serial polls prevent late/overlapping responses from restoring stale state.
 * Cleanup aborts the request and rejects old-project callbacks even if a
 * transport ignores AbortSignal. Failures retain the last snapshot as stale. */
export function pollProduction<T>(url: string, receive: (data: T) => void, failed: (message: string) => void, intervalMs = 2500, fetcher: typeof fetch = fetch) {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  const load = async () => {
    controller = new AbortController();
    let expired = false;
    deadline = setTimeout(() => {
      expired = true;
      if (!stopped) failed("No fresh production snapshot for 15 seconds. The server may be busy or disconnected; state is unverified.");
      controller?.abort();
    }, 15000);
    try {
      const response = await fetcher(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Production evidence unavailable (${response.status}).`);
      const data = await response.json() as T;
      if (!stopped) receive(data);
    } catch (error) { if (!stopped && !expired) failed((error as Error).message); }
    finally { clearTimeout(deadline); if (!stopped) timer = setTimeout(() => void load(), intervalMs); }
  };
  void load();
  return () => { stopped = true; controller?.abort(); clearTimeout(timer); clearTimeout(deadline); };
}
