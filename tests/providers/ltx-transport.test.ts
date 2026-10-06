import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const commands = vi.hoisted(()=>({exec:vi.fn(),spawn:vi.fn()}));
vi.mock("node:child_process",()=>({
  execFile: Object.assign(()=>{}, {[Symbol.for("nodejs.util.promisify.custom")]:commands.exec}),
  spawn: commands.spawn
}));
import { SshLtxTransport } from "../../src/providers/ltx/transport.js";
let transport: SshLtxTransport, port: number, listeners: Server[];
beforeEach(()=>{
  listeners = [];port=45001;
  commands.exec.mockReset();commands.spawn.mockReset();
  commands.exec.mockImplementation(async()=>({stdout:`Server running on http://127.0.0.1:${port}`}));
  commands.spawn.mockImplementation((_file:string,args:string[])=>{
    const spec=args[args.indexOf("-L")+1]!;
    const listener=createServer(socket=>socket.end());listeners.push(listener);
    listener.listen(Number(spec.split(":")[1]),"127.0.0.1");
    const child=Object.assign(new EventEmitter(),{exitCode:null as number|null,killed:false,unref:vi.fn(),kill:vi.fn(()=>{child.killed=true;child.exitCode=0;listener.close();return true;})});
    return child;
  });
  vi.stubEnv("LTX_TOKEN","synthetic-only-token");
  transport=new SshLtxTransport("192.168.77.2","danieljbrennan");
});
afterEach(async()=>{
  transport.reset();
  for(const listener of listeners) if(listener.listening) await new Promise<void>(resolve=>listener.close(()=>resolve()));
  vi.unstubAllEnvs();
});
it("discovers the remote port for each job, reuses its tunnel, and recreates it after Desktop restarts",async()=>{
  const first=await transport.connect();expect(first).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(await transport.connect()).toBe(first);expect(commands.spawn).toHaveBeenCalledTimes(1);
  port=45002;
  const second=await transport.connect();expect(second).not.toBe(first);expect(commands.spawn).toHaveBeenCalledTimes(2);
  expect(commands.exec).toHaveBeenCalledTimes(3);
  const spawnArgs=commands.spawn.mock.calls[1]![1] as string[];
  expect(spawnArgs).toEqual(expect.arrayContaining([expect.stringMatching(/^127\.0\.0\.1:\d+:127\.0\.0\.1:45002$/)]));
  expect(spawnArgs).toContain("ExitOnForwardFailure=yes");
  expect(commands.spawn.mock.calls[1]![2]).toMatchObject({windowsHide:true,stdio:"ignore"});
});
it("passes Windows and Mac paths with spaces as separate SCP arguments and keeps the token out of children",async()=>{
  await transport.upload("C:\\HeartWordData\\assets\\key frame.png","/Users/danieljbrennan/LTX-Inbox/unique.png");
  await transport.download("/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/video.mp4","C:\\HeartWordData\\assets\\new video.mp4");
  expect(commands.exec.mock.calls[0]![1]).toContain("C:\\HeartWordData\\assets\\key frame.png");
  expect(commands.exec.mock.calls[1]![1]).toContain("danieljbrennan@192.168.77.2:/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/video.mp4");
  expect(commands.exec.mock.calls[1]![2].env.LTX_TOKEN).toBeUndefined();
  expect(commands.exec.mock.calls[1]![2]).toMatchObject({windowsHide:true,timeout:120000});
});
it("fails clearly on SSH authentication/connection errors and refuses host argument injection",async()=>{
  commands.exec.mockRejectedValueOnce(new Error("Permission denied"));
  await expect(transport.connect()).rejects.toThrow("SSH key authentication");
  expect(commands.spawn).not.toHaveBeenCalled();
  expect(()=>new SshLtxTransport("-malicious","user")).toThrow("Invalid LTX");
  expect(()=>new SshLtxTransport("192.168.77.2","user;rm")).toThrow("Invalid LTX");
});
