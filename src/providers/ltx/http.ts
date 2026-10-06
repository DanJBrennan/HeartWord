import { request } from "node:http";

export class LtxHttpError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
export function redactLtxSecret(text: string, token: string): string {
  return text.split(token).join("[redacted]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
}

/** node:http avoids fetch/undici's default headers timeout during long inference. */
export async function ltxJson(baseUrl: string, path: string, token: string, timeoutMs: number, body?: unknown): Promise<Record<string, unknown>> {
  const url = new URL(path, baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("LTX API must use the SSH tunnel on IPv4 loopback.");
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(url, { method: payload ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { data += chunk; if (data.length > 1024 * 1024) req.destroy(new Error("LTX response exceeded one MiB.")); });
      res.on("error", error => req.destroy(error));
      res.on("aborted", () => req.destroy(new Error("LTX response connection closed.")));
      res.on("end", () => {
        clearTimeout(timer);
        if ((res.statusCode ?? 500) >= 300) {
          const reason = res.statusCode === 401 ? "LTX_TOKEN was rejected. Copy the current Desktop backend token and restart HeartWord with it." : redactLtxSecret(data, token).slice(0, 500);
          reject(new LtxHttpError(res.statusCode ?? 500, `LTX ${path} HTTP ${res.statusCode}: ${reason}`));
          return;
        }
        try {
          const value: unknown = JSON.parse(data);
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
          resolve(value as Record<string, unknown>);
        } catch { reject(new Error(`LTX ${path} returned invalid JSON.`)); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error(`LTX ${path} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
    req.on("error", error => { clearTimeout(timer); reject(new Error(redactLtxSecret(error.message, token))); });
    req.end(payload);
  });
}
