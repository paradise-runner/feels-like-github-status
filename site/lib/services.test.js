import test from "node:test";
import assert from "node:assert/strict";
import { SERVICES, allSelected, encodeServices, decodeServices } from "./services.js";

test("catalog has 10 services in stable alphabetical order", () => {
  assert.equal(SERVICES.length, 10);
  assert.deepEqual(SERVICES, [
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
  ]);
});

test("allSelected returns a Set with every service", () => {
  const s = allSelected();
  assert.equal(s.size, 10);
  for (const name of SERVICES) assert.ok(s.has(name));
});

test("encode/decode round-trip: all selected", () => {
  const selected = allSelected();
  const out = decodeServices(encodeServices(selected));
  assert.deepEqual([...out].sort(), [...selected].sort());
});

test("encode/decode round-trip: none selected", () => {
  const selected = new Set();
  const out = decodeServices(encodeServices(selected));
  assert.equal(out.size, 0);
});

test("encode/decode round-trip: arbitrary subset", () => {
  const selected = new Set(["Actions", "Codespaces", "Pull Requests"]);
  const out = decodeServices(encodeServices(selected));
  assert.deepEqual([...out].sort(), [...selected].sort());
});

test("encoded string is base64url and has the expected length", () => {
  const s = encodeServices(allSelected());
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.equal(s.length, 3); // ceil(2 bytes * 8 / 6) = 3
});

test("decode rejects malformed input", () => {
  assert.equal(decodeServices(""), null);
  assert.equal(decodeServices("xx"), null);
  assert.equal(decodeServices("****"), null);
  assert.equal(decodeServices(null), null);
});

test("services outside the catalog are silently dropped from encoding", () => {
  const selected = new Set(["Actions", "NotAService"]);
  const out = decodeServices(encodeServices(selected));
  assert.ok(out.has("Actions"));
  assert.ok(!out.has("NotAService"));
});
