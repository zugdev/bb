const mask = (1n << 64n) - 1n;

function rotate(value: bigint, bits: bigint): bigint {
  return ((value << bits) | (value >> (64n - bits))) & mask;
}

function sipHash13(bytes: Uint8Array): bigint {
  let v0 = 0x736f6d6570736575n;
  let v1 = 0x646f72616e646f6dn;
  let v2 = 0x6c7967656e657261n;
  let v3 = 0x7465646279746573n;
  const round = () => {
    v0 = (v0 + v1) & mask;
    v1 = rotate(v1, 13n) ^ v0;
    v0 = rotate(v0, 32n);
    v2 = (v2 + v3) & mask;
    v3 = rotate(v3, 16n) ^ v2;
    v0 = (v0 + v3) & mask;
    v3 = rotate(v3, 21n) ^ v0;
    v2 = (v2 + v1) & mask;
    v1 = rotate(v1, 17n) ^ v2;
    v2 = rotate(v2, 32n);
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const whole = bytes.length - (bytes.length % 8);
  for (let offset = 0; offset < whole; offset += 8) {
    const word = view.getBigUint64(offset, true);
    v3 ^= word;
    round();
    v0 ^= word;
  }
  let last = BigInt(bytes.length & 0xff) << 56n;
  for (let offset = whole; offset < bytes.length; offset++)
    last |= BigInt(bytes[offset]!) << BigInt(8 * (offset - whole));
  v3 ^= last;
  round();
  v0 ^= last;
  v2 ^= 0xffn;
  round();
  round();
  round();
  return v0 ^ v1 ^ v2 ^ v3;
}

export function rustStringHash(value: string): bigint {
  return sipHash13(Buffer.concat([Buffer.from(value), Buffer.from([0xff])]));
}

export function rustPathHash(path: string): bigint {
  const bytes = Buffer.from(path);
  const chunks: Buffer[] = [];
  let chunkBits = 0n;
  const take = (chunk: Buffer) => {
    chunkBits = (chunkBits + BigInt(chunk.length)) & mask;
    chunkBits = ((chunkBits >> 2n) | (chunkBits << 62n)) & mask;
    chunks.push(chunk);
  };
  let start = 0;
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] !== 0x2f) continue;
    if (index > start) take(bytes.subarray(start, index));
    start = index + 1;
    if (
      bytes[start] === 0x2e &&
      (start + 1 === bytes.length || bytes[start + 1] === 0x2f)
    )
      start += 1;
  }
  if (start < bytes.length) take(bytes.subarray(start));
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(chunkBits);
  return sipHash13(Buffer.concat([...chunks, length]));
}

const hex = (value: bigint, digits: number) =>
  value.toString(16).padStart(digits, "0");

export function sharedSessionName(profile: string): string {
  return `profile-${hex(rustStringHash(profile), 16)}`;
}

export function checkoutSessionName(profile: string, checkout: string): string {
  const low = (value: bigint) => hex(value & 0xffffffffn, 8);
  return `checkout-${low(rustStringHash(profile))}${low(rustPathHash(checkout))}`;
}
