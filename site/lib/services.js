// Canonical service catalog. The order is part of the URL hash schema —
// new services must be appended, never reordered.
export const SERVICES = [
  "API Requests",
  "Actions",
  "Codespaces",
  "Copilot",
  "Git Operations",
  "Issues",
  "Packages",
  "Pages",
  "Pull Requests",
  "Webhooks",
];

const N = SERVICES.length;
const BYTES = Math.ceil(N / 8);
const ENCODED_LEN = Math.ceil((BYTES * 8) / 6);

export function allSelected() {
  return new Set(SERVICES);
}

export function encodeServices(selected) {
  const bytes = new Uint8Array(BYTES);
  for (let i = 0; i < N; i++) {
    if (selected.has(SERVICES[i])) bytes[i >> 3] |= 1 << (i & 7);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeServices(s) {
  if (typeof s !== "string" || s.length !== ENCODED_LEN) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin;
  try { bin = atob(padded); } catch { return null; }
  if (bin.length < BYTES) return null;
  const out = new Set();
  for (let i = 0; i < N; i++) {
    if ((bin.charCodeAt(i >> 3) >> (i & 7)) & 1) out.add(SERVICES[i]);
  }
  return out;
}
