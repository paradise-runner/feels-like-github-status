import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, serializeHash } from "./url-state.js";

const sampleMask = (() => {
  const m = new Uint8Array(168);
  for (let i = 9; i < 17; i++) m[1 * 24 + i] = 1;
  return m;
})();

test("serializeHash builds tz + m params (no leading #)", () => {
  const out = serializeHash({ tz: "America/Denver", mask: sampleMask });
  assert.match(out, /^tz=America%2FDenver&m=[A-Za-z0-9_-]{28}$/);
});

test("parseHash returns tz and mask for a well-formed hash", () => {
  const hash = "#" + serializeHash({ tz: "America/Denver", mask: sampleMask });
  const parsed = parseHash(hash);
  assert.equal(parsed.tz, "America/Denver");
  assert.deepEqual(Array.from(parsed.mask), Array.from(sampleMask));
});

test("parseHash without leading # also works", () => {
  const hash = serializeHash({ tz: "UTC", mask: new Uint8Array(168) });
  const parsed = parseHash(hash);
  assert.equal(parsed.tz, "UTC");
});

test("parseHash returns null on missing inputs", () => {
  assert.equal(parseHash(""), null);
  assert.equal(parseHash("#"), null);
  assert.equal(parseHash("#nothing=here"), null);
});

test("parseHash returns null on garbage mask", () => {
  assert.equal(parseHash("#tz=UTC&m=not-valid-base64!!!"), null);
});

test("parseHash rejects unknown timezone strings", () => {
  // Unknown tz should fall through to null (caller falls back).
  assert.equal(parseHash("#tz=Bogus%2FZone&m=" + "A".repeat(28)), null);
});

import { allSelected, SERVICES } from "./services.js";

test("serializeHash includes s param when services are provided", () => {
  const mask = new Uint8Array(168);
  const services = new Set(["Actions"]);
  const out = serializeHash({ tz: "UTC", mask, services });
  assert.match(out, /(^|&)s=[A-Za-z0-9_-]+(&|$)/);
});

test("parseHash returns services from s param", () => {
  const mask = new Uint8Array(168);
  const services = new Set(["Actions", "Codespaces"]);
  const out = serializeHash({ tz: "UTC", mask, services });
  const parsed = parseHash("#" + out);
  assert.deepEqual([...parsed.services].sort(), [...services].sort());
});

test("parseHash defaults to all services when s is absent", () => {
  const mask = new Uint8Array(168);
  const out = serializeHash({ tz: "UTC", mask });
  const parsed = parseHash("#" + out);
  assert.equal(parsed.services.size, SERVICES.length);
});

test("parseHash defaults to all services when s is invalid", () => {
  const parsed = parseHash("#tz=UTC&m=" + "A".repeat(28) + "&s=not-valid");
  assert.equal(parsed.services.size, SERVICES.length);
});
