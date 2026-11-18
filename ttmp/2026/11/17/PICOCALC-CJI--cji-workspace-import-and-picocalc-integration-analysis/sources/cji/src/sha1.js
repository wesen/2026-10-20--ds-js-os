// CJI-3: SHA-1 in the subset, for canonical_names' component hashes (src/canon.js), which used
// node:crypto. The text is hashed as its UTF-8 bytes, as Node's hash.update(string) hashes it:
// a surrogate pair is one code point, and a lone surrogate is U+FFFD. The result is the digest
// in lowercase hexadecimal, 40 digits. All arithmetic is on 32-bit words (| 0, >>> 0).

function utf8Bytes(s) {
  const out = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    let c = s.charCodeAt(i);
    i++;
    if (c >= 0xd800 && c < 0xdc00 && i < n) {
      const d = s.charCodeAt(i);
      if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c >= 0xd800 && c < 0xe000) c = 0xfffd;   // a lone surrogate
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const rotl = (x, k) => (x << k) | (x >>> (32 - k));
const hex8 = (x) => (x >>> 0).toString(16).padStart(8, '0');

export function sha1Hex(text) {
  const bytes = utf8Bytes(text);
  const len = bytes.length;
  // the message, padded: a 1 bit, zeros to 56 bytes mod 64, the length in bits as 8 bytes
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitsHi = Math.floor(len / 0x20000000), bitsLo = (len * 8) % 0x100000000;
  bytes.push((bitsHi >>> 24) & 255, (bitsHi >>> 16) & 255, (bitsHi >>> 8) & 255, bitsHi & 255);
  bytes.push((bitsLo >>> 24) & 255, (bitsLo >>> 16) & 255, (bitsLo >>> 8) & 255, bitsLo & 255);
  let h0 = 0x67452301 | 0, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476 | 0, h4 = 0xc3d2e1f0 | 0;
  const w = new Int32Array(80);
  for (let at = 0; at < bytes.length; at += 64) {
    for (let t = 0; t < 16; t++) {
      const b = at + 4 * t;
      w[t] = (bytes[b] << 24) | (bytes[b + 1] << 16) | (bytes[b + 2] << 8) | bytes[b + 3];
    }
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f = 0, k = 0;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc | 0; }
      else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
      const x = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = x;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4);
}
