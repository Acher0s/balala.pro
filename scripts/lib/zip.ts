import { inflateRawSync } from "node:zlib";

/**
 * Minimal zip reader that also works on LÖVE "fused" executables (an .exe with the game's
 * zip appended), where every offset in the archive is shifted by the size of the .exe.
 */
export function readZip(buf: Buffer): Map<string, () => Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error("No zip archive found in this file");
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const shift = eocd - cdSize - cdOffset;
  const count = buf.readUInt16LE(eocd + 10);

  const files = new Map<string, () => Buffer>();
  let p = eocd - cdSize;
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42) + shift;
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    files.set(name, () => {
      const dataStart =
        local +
        30 +
        buf.readUInt16LE(local + 26) +
        buf.readUInt16LE(local + 28);
      const data = buf.subarray(dataStart, dataStart + compressed);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
