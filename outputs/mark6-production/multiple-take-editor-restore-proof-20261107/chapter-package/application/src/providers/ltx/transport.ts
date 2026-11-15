import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const latestLogCommand = 'latest=$(ls -t "$HOME/Library/Application Support/LTXDesktop/logs/"*.log 2>/dev/null | head -1); test -n "$latest" || exit 1;';
export const discoverPortCommand = `${latestLogCommand} grep 'Server running on http' "$latest" | tail -1`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface LtxTransport {
  connect(): Promise<string>;
  remote(command: string): Promise<string>;
  upload(local: string, remote: string): Promise<void>;
  download(remote: string, local: string): Promise<void>;
  reset(): void;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function parseBackendPort(logLine: string): number {
  const match = /Server running on http:\/\/127\.0\.0\.1:(\d+)\b/.exec(logLine);
  const port = Number(match?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("LTX Desktop backend port was not found in its newest log. Start LTX Desktop on the Mac.");
  return port;
}

export function childEnvironment() {
  const env = { ...process.env };
  // The session token is only used in HTTP headers, never in subprocesses.
  delete env.LTX_TOKEN;
  return env;
}

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("Cannot reserve a loopback port.")); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function portReady(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (ready: boolean) => { socket.destroy(); resolve(ready); };
    socket.setTimeout(200);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

/** Owns only its own loopback tunnel; never kills an existing user's tunnel. */
export class SshLtxTransport implements LtxTransport {
  private tunnel?: ChildProcess;
  private remotePort?: number;
  private baseUrl?: string;
  readonly destination: string;
  constructor(host = process.env.LTX_SSH_HOST ?? "192.168.77.2", user = process.env.LTX_SSH_USER ?? "danieljbrennan") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(user)) throw new Error("Invalid LTX SSH host or username.");
    this.destination = `${user}@${host}`;
  }
  async remote(command: string): Promise<string> {
    try {
      const { stdout } = await exec("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", this.destination, command], { windowsHide: true, timeout: 30_000, maxBuffer: 128 * 1024, env: childEnvironment() });
      return stdout.trim();
    } catch {
      throw new Error(`LTX SSH command failed for ${this.destination}. Verify the Mac is reachable, its paths exist, and SSH key authentication works without a password prompt.`);
    }
  }
  async upload(local: string, remote: string): Promise<void> {
    await this.copy(local, `${this.destination}:${remote}`);
  }
  async download(remote: string, local: string): Promise<void> {
    await this.copy(`${this.destination}:${remote}`, local);
  }
  private async copy(source: string, target: string) {
    try {
      // OpenSSH's current SCP uses SFTP; each path is one argv value, including spaces.
      await exec("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", source, target], { windowsHide: true, timeout: 120_000, env: childEnvironment() });
    } catch { throw new Error("LTX SCP transfer failed. Check SSH access, disk space, and the source/destination paths."); }
  }
  async connect(): Promise<string> {
    // This also verifies connectivity on every job and detects Desktop restarts.
    const port = parseBackendPort(await this.remote(discoverPortCommand));
    if (this.tunnel && this.tunnel.exitCode === null && !this.tunnel.killed && this.remotePort === port && this.baseUrl) return this.baseUrl;
    this.reset();
    const localPort = await freeLoopbackPort();
    let failed = false;
    const tunnel = spawn("ssh", ["-N", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-L", `127.0.0.1:${localPort}:127.0.0.1:${port}`, this.destination], { windowsHide: true, stdio: "ignore", env: childEnvironment() });
    tunnel.on("error", () => { failed = true; });
    // HTTP work keeps jobs alive. A finished standalone stage must be able
    // to exit, at which point the registered exit handler closes this tunnel.
    tunnel.unref();
    this.tunnel = tunnel;
    this.remotePort = port;
    this.baseUrl = `http://127.0.0.1:${localPort}`;
    for (let i = 0; i < 50; i++) {
      if (failed || tunnel.exitCode !== null) break;
      if (await portReady(localPort)) return this.baseUrl;
      await delay(200);
    }
    this.reset();
    throw new Error("LTX SSH tunnel did not start. Check SSH key authentication and LTX Desktop on the Mac.");
  }
  reset() {
    this.tunnel?.kill();
    this.tunnel = undefined;
    this.remotePort = undefined;
    this.baseUrl = undefined;
  }
}

let shared: SshLtxTransport | undefined;
export function sharedLtxTransport(): SshLtxTransport {
  if (!shared) {
    shared = new SshLtxTransport();
    process.once("exit", () => shared?.reset());
  }
  return shared;
}
export function closeLtxTunnel() { shared?.reset(); }
