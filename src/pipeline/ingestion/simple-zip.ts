import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Minimal, dependency-free ZIP reader for pulling one named entry out of a
 * .docx (a plain ZIP container) -- just enough of the format to read
 * word/document.xml, not a general-purpose ZIP library.
 *
 * Previously shelled out to the `unzip` CLI on the theory that it's "a
 * preinstalled system tool" -- true on Linux (where this was originally
 * tested, via this project's Claude session bridge) but NOT true on
 * native Windows, where Dan actually runs the app (`spawnSync unzip
 * ENOENT`). Rather than add an npm zip-parsing dependency (the thing this
 * code was originally trying to avoid) or require Dan to install a CLI
 * tool, this reads the ZIP's End-Of-Central-Directory record and Central
 * Directory entries directly (see PKZIP's APPNOTE.TXT) and inflates the
 * one entry we need with node:zlib -- pure Node built-ins, works
 * identically on every platform.
 */
export function readZipEntry(zipPath: string, entryName: string): Buffer {
  const data = readFileSync(zipPath);

  // End Of Central Directory record: signature 0x06054b50, then a
  // fixed-size body, then an optional comment. Scan backward from the end
  // (comment is usually empty, but don't assume it always is).
  const EOCD_SIGNATURE = 0x06054b50;
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0 && i >= data.length - 22 - 0xffff; i--) {
    if (data.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(`${zipPath} doesn't look like a valid .docx/.zip file (no End Of Central Directory record found).`);
  }

  const entryCount = data.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = data.readUInt32LE(eocdOffset + 16);

  let offset = centralDirOffset;
  const CENTRAL_DIR_SIGNATURE = 0x02014b50;

  for (let i = 0; i < entryCount; i++) {
    if (data.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`${zipPath}: central directory entry ${i} has an unexpected signature -- file may be corrupt.`);
    }

    const compressionMethod = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const fileNameLength = data.readUInt16LE(offset + 28);
    const extraFieldLength = data.readUInt16LE(offset + 30);
    const fileCommentLength = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);
    const fileName = data.toString("utf-8", offset + 46, offset + 46 + fileNameLength);

    if (fileName === entryName) {
      // Local file header: signature 0x04034b50, then a fixed-size body
      // (including this entry's OWN name/extra field lengths, which can
      // differ from the central directory's), then the name, then the
      // extra field, then the actual (possibly compressed) data.
      const localFileNameLength = data.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = data.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressed = data.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) return Buffer.from(compressed); // stored, no compression
      if (compressionMethod === 8) return inflateRawSync(compressed); // deflate
      throw new Error(`${zipPath}: entry "${entryName}" uses unsupported compression method ${compressionMethod}.`);
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  throw new Error(`${zipPath}: no entry named "${entryName}" found in the zip's central directory.`);
}
