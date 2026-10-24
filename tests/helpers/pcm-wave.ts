/** Playable synthetic mono PCM for timing tests; never production speech. */
export function fixtureWave(durationMs: number, frequency: number | ((seconds: number) => number) = 0): Buffer {
  const sampleRate = 48000, count = Math.round(durationMs * sampleRate / 1000), dataSize = count * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(dataSize, 40);
  for (let n = 0; n < count; n++) {
    const t = n / sampleRate, hz = typeof frequency === "number" ? frequency : frequency(t);
    bytes.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * hz * t)), 44 + n * 2);
  }
  return bytes;
}
