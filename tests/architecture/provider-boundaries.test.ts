import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name)) : entry.name.endsWith(".ts") ? [join(root, entry.name)] : []);
}

describe("provider layering", () => {
  it("keeps pipeline independent from server adapters and providers below both layers", () => {
    const root = resolve(process.cwd(), "src");
    for (const file of files(join(root, "pipeline"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'][^"']*server\//);
    for (const file of files(join(root, "providers"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'][^"']*(server|pipeline)\//);
  });
});
