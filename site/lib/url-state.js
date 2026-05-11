import { encode as encodeMask, decode as decodeMask } from "./mask.js";
import { isValidTimezone } from "./tz.js";
import { encodeServices, decodeServices, allSelected } from "./services.js";

export function serializeHash({ tz, mask, services }) {
  const params = new URLSearchParams();
  params.set("tz", tz);
  params.set("m", encodeMask(mask));
  if (services) params.set("s", encodeServices(services));
  return params.toString();
}

export function parseHash(hash) {
  if (typeof hash !== "string") return null;
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!stripped) return null;
  const params = new URLSearchParams(stripped);
  const tz = params.get("tz");
  const m = params.get("m");
  const s = params.get("s");
  if (!tz || !m) return null;
  if (!isValidTimezone(tz)) return null;
  const mask = decodeMask(m);
  if (!mask) return null;
  // Services are optional — fall back to "all selected" if absent or invalid.
  const services = s ? (decodeServices(s) ?? allSelected()) : allSelected();
  return { tz, mask, services };
}
