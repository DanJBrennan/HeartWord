import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, writeSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

type Row = Record<string, string | number | null>;
type Tables = Record<string, Row[]>;

/** The existing v1 JSON bytes, emitted one retained SQL row at a time. */
function* recordChunks(tables: Tables): Generator<string> {
  yield "{";
  let first = true;
  for (const [table, rows] of Object.entries(tables)) {
    if (!first) yield ",";
    first = false;
    yield JSON.stringify(table) + ":[";
    for (let index = 0; index < rows.length; index++) {
      if (index) yield ",";
      yield JSON.stringify(rows[index]);
    }
    yield "]";
  }
  yield "}";
}

export function hashPackageRecords(tables: Tables): string {
  const digest = createHash("sha256");
  for (const chunk of recordChunks(tables)) digest.update(chunk);
  return digest.digest("hex");
}

export function writePackageRecords(path: string, tables: Tables): void {
  const fd = openSync(path, "wx");
  try {
    for (const chunk of recordChunks(tables)) {
      const bytes = Buffer.from(chunk);
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset, null);
        if (written <= 0) throw new Error("Could not write retained package records.");
        offset += written;
      }
    }
  } finally { closeSync(fd); }
}

/** Parse the v1 object-of-row-arrays without constructing a file-sized string.
 * SQL rows stay intact; history, key ordering and embedded JSON strings survive.
 * chunkBytes is also used by boundary tests, including split UTF-8 characters. */
export function readPackageRecords(path: string, chunkBytes = 64 * 1024): Tables {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error("A positive record read chunk size is required.");
  const tables: Tables = Object.create(null);
  const state = { value: "start" };
  let table = "", key = "", depth = 0, inString = false, escaped = false;
  let parts: string[] = [];
  const invalid = (): never => { throw new Error(`Invalid package records JSON (${state.value}).`); };
  const consume = (chunk: string) => {
    let index = 0, rowStart = state.value === "row" ? 0 : -1;
    while (index < chunk.length) {
      if (state.value === "row") {
        // Skip ordinary prose in native regex code, rather than visiting every
        // character of multi-gigabyte historical discussion strings in JS.
        const tokens = /[{}\[\]"\\]/g;
        if (escaped) { index++; escaped = false; }
        tokens.lastIndex = index;
        let token: RegExpExecArray | null, complete = false;
        while ((token = tokens.exec(chunk))) {
          const character = token[0];
          if (inString) {
            if (character === "\\") {
              if (tokens.lastIndex === chunk.length) escaped = true;
              else tokens.lastIndex++;
            } else if (character === '"') inString = false;
          } else if (character === '"') inString = true;
          else if (character === "{" || character === "[") depth++;
          else if (character === "}" || character === "]") depth--;
          if (depth === 0) {
            parts.push(chunk.slice(rowStart, token.index + 1));
            let row: unknown;
            try { row = JSON.parse(parts.join("")); } catch { invalid(); }
            if (!row || typeof row !== "object" || Array.isArray(row)) invalid();
            tables[table]!.push(row as Row);
            parts = []; rowStart = -1; index = token.index + 1;
            state.value = "rowSeparator"; complete = true; break;
          }
        }
        if (!complete) { index = chunk.length; break; }
        continue;
      }
      const character = chunk[index++]!;
      if (state.value !== "key" && /[ \t\r\n]/.test(character)) continue;
      switch (state.value) {
        case "start":
          if (character !== "{") invalid();
          state.value = "firstTable"; break;
        case "firstTable": case "nextTable":
          if (character === "}" && state.value === "firstTable") { state.value = "done"; break; }
          if (character !== '"') invalid();
          key = '"'; escaped = false; state.value = "key"; break;
        case "key":
          key += character;
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') {
            try { table = JSON.parse(key); } catch { invalid(); }
            if (typeof table !== "string" || Object.hasOwn(tables, table)) invalid();
            tables[table] = []; state.value = "colon";
          }
          break;
        case "colon":
          if (character !== ":") invalid();
          state.value = "array"; break;
        case "array":
          if (character !== "[") invalid();
          state.value = "firstRow"; break;
        case "firstRow": case "nextRow":
          if (character === "]" && state.value === "firstRow") { state.value = "tableSeparator"; break; }
          if (character !== "{") invalid();
          rowStart = index - 1; depth = 1; inString = false; escaped = false;
          parts = []; state.value = "row"; break;
        case "rowSeparator":
          if (character === ",") state.value = "nextRow";
          else if (character === "]") state.value = "tableSeparator";
          else invalid();
          break;
        case "tableSeparator":
          if (character === ",") state.value = "nextTable";
          else if (character === "}") state.value = "done";
          else invalid();
          break;
        default: invalid();
      }
    }
    if (state.value === "row") parts.push(chunk.slice(rowStart));
  };
  const fd = openSync(path, "r"), buffer = Buffer.allocUnsafe(chunkBytes), decoder = new StringDecoder("utf8");
  try {
    let bytes: number;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) consume(decoder.write(buffer.subarray(0, bytes)));
    consume(decoder.end());
    if (state.value !== "done") invalid();
    return tables;
  } finally { closeSync(fd); }
}
