function packBits(mask) {
  const bytes = new Uint8Array(21);
  for (let i = 0; i < 168; i++) {
    if (mask[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return bytes;
}

function unpackBits(bytes) {
  const mask = new Uint8Array(168);
  for (let i = 0; i < 168; i++) {
    mask[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  return mask;
}

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa exists in browsers and modern Node (>= v16).
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin;
  try {
    bin = atob(padded);
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encode(mask) {
  if (mask.length !== 168) throw new Error(`expected mask length 168, got ${mask.length}`);
  return bytesToBase64Url(packBits(mask));
}

export function decode(s) {
  if (typeof s !== "string" || s.length !== 28) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const bytes = base64UrlToBytes(s);
  if (!bytes || bytes.length !== 21) return null;
  return unpackBits(bytes);
}

export function minutesPerDayOfWeek(mask) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (let d = 0; d < 7; d++) {
    let n = 0;
    for (let h = 0; h < 24; h++) if (mask[d * 24 + h]) n++;
    out[d] = n * 60;
  }
  return out;
}

export function expand(mask) {
  if (mask.length !== 168) {
    throw new Error(`expected mask length 168, got ${mask.length}`);
  }
  const out = new Uint8Array(168 * 60);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = mask[d * 24 + h];
      if (!v) continue;
      const base = d * 1440 + h * 60;
      for (let m = 0; m < 60; m++) out[base + m] = 1;
    }
  }
  return out;
}
