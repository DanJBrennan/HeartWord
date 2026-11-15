import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPackageRecords, readPackageRecords, writePackageRecords } from "../../src/pipeline/assembly/chapter-package-records.js";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "heartword-records-")); });
afterEach(() => {
  vi.restoreAllMocks();
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("heartword-records-")) throw new Error("Unexpected test cleanup root.");
  rmSync(directory, { recursive: true, force: true });
});
const records = () => ({
  history: [{ id: "one", note: 'Hatam œ 漢字 😀; brackets {}[] and quotes " \\ \\\"; embedded JSON: {"a":[1]}\n\t', cost: .019, none: null },
    { id: "two", note: "A second retained decision.", cost: 0, none: null }],
  empty: [],
  'escaped"table': [{ value: "Preserve original keys and order." }]
});

describe("v1 chapter records beyond the aggregate string ceiling", () => {
  it("keeps exactly the original v1 bytes/hash without serializing the whole record set", () => {
    const tables = records(), expected = JSON.stringify(tables), original = JSON.stringify;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      if (args[0] === tables) throw new RangeError("Aggregate record string exceeds runtime limit");
      return original(...args);
    });
    const path = join(directory, "records.json");
    writePackageRecords(path, tables);
    expect(readFileSync(path, "utf8")).toBe(expected);
    expect(hashPackageRecords(tables)).toBe(createHash("sha256").update(expected).digest("hex"));
    expect(readPackageRecords(path)).toEqual(tables);
    spy.mockRestore();
    expect(() => writePackageRecords(path, tables)).toThrow(/exist/i);
  });

  it.each([1, 2, 3, 7, 64])("preserves Unicode, escaped strings and record boundaries with %i-byte reads", bytes => {
    const tables = records(), path = join(directory, "records.json");
    writeFileSync(path, JSON.stringify(tables, null, 2));
    expect(readPackageRecords(path, bytes)).toEqual(tables);
  });

  it("reads long embedded history strings across the normal buffer boundary", () => {
    const tables = { runs: [{ result_json: JSON.stringify({ evidence: '😀 " [\\] '.repeat(12000) }) }], events: [] };
    const path = join(directory, "records.json");
    writePackageRecords(path, tables);
    expect(readPackageRecords(path)).toEqual(tables);
  });

  it.each(['', '[]', '{"a":{}}', '{"a":[1]}', '{"a":[{},]}', '{"a":[],}', '{"a":[]}x',
    '{"a":[],"a":[]}', '{"a":[{"x":"unfinished}', '{"a":[{"x":true]]}', '\u00a0{}'])
  ("rejects incomplete or malformed records: %s", value => {
    const path = join(directory, "bad.json"); writeFileSync(path, value);
    expect(() => readPackageRecords(path, 3)).toThrow(/Invalid package records JSON/);
  });

  it("keeps special table names as own properties and accepts an empty record set", () => {
    const path = join(directory, "records.json");
    writeFileSync(path, '{"__proto__":[{"note":"original"}],"constructor":[]}');
    const tables = readPackageRecords(path, 1);
    expect(Object.getPrototypeOf(tables)).toBeNull();
    expect(Object.hasOwn(tables, "__proto__")).toBe(true);
    expect(tables.__proto__).toEqual([{ note: "original" }]);
    writeFileSync(path, "{}"); expect(readPackageRecords(path, 1)).toEqual({});
    expect(() => readPackageRecords(path, 0)).toThrow(/positive/);
  });
});
