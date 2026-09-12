import type { JsonValue } from "../agent-task/json-types.js";

export function canonicalHash(value: JsonValue): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

function sha256(input: string): string {
  const constants: readonly number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state: [number, number, number, number, number, number, number, number] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const inputBytes = new TextEncoder().encode(input);
  const padded = new Uint8Array(Math.ceil((inputBytes.length + 9) / 64) * 64);
  padded.set(inputBytes); padded[inputBytes.length] = 0x80;
  // SHA-256 appends the complete 64-bit big-endian message length.  The
  // profile target payloads are small, but retaining the high word keeps this
  // browser implementation byte-for-byte compatible with Node for any valid
  // canonical JSON input rather than silently truncating at 2^32 bits.
  const bitLength = inputBytes.length * 8;
  const lengthView = new DataView(padded.buffer);
  lengthView.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32), false);
  lengthView.setUint32(padded.length - 4, bitLength >>> 0, false);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    const view = new DataView(padded.buffer, offset, 64);
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const value = words[index - 15]!; const value2 = words[index - 2]!;
      words[index] = (sigma1(value2) + words[index - 7]! + sigma0(value) + words[index - 16]!) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const temp1 = (h + sum1(e) + ((e & f) ^ (~e & g)) + constants[index]! + words[index]!) >>> 0;
      const temp2 = (sum0(a) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [a, b, c, d, e, f, g, h] = [
        (temp1 + temp2) >>> 0, a, b, c, (d + temp1) >>> 0, e, f, g,
      ];
    }
    state[0] = (state[0]! + a) >>> 0; state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0; state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0; state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0; state[7] = (state[7]! + h) >>> 0;
  }
  return state.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function rotate(value: number, amount: number): number { return (value >>> amount) | (value << (32 - amount)); }
function sigma0(value: number): number { return rotate(value, 7) ^ rotate(value, 18) ^ (value >>> 3); }
function sigma1(value: number): number { return rotate(value, 17) ^ rotate(value, 19) ^ (value >>> 10); }
function sum0(value: number): number { return rotate(value, 2) ^ rotate(value, 13) ^ rotate(value, 22); }
function sum1(value: number): number { return rotate(value, 6) ^ rotate(value, 11) ^ rotate(value, 25); }
