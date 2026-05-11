import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseDowntimeCsv, parseIncidentsJsonl, joinWindows } from "./data.js";

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(here, "__fixtures__/downtime_windows.csv"), "utf8");
const jsonl = readFileSync(join(here, "__fixtures__/incidents.jsonl"), "utf8");

test("parseDowntimeCsv parses rows and omits impact=none", () => {
  const rows = parseDowntimeCsv(csv);
  assert.equal(rows.length, 3); // 4 in fixture, one is impact=none
  const r0 = rows[0];
  assert.equal(r0.incidentId, "100");
  assert.equal(r0.startUtc.toISOString(), "2026-04-01T10:00:00.000Z");
  assert.equal(r0.endUtc.toISOString(), "2026-04-01T10:30:00.000Z");
  assert.equal(r0.durationMinutes, 30);
  assert.equal(r0.impact, "major");
});

test("parseIncidentsJsonl builds an id -> components map", () => {
  const map = parseIncidentsJsonl(jsonl);
  assert.equal(map.size, 4);
  assert.deepEqual(map.get("100").components, ["Actions", "Pull Requests"]);
  assert.deepEqual(map.get("102").components, ["Pages"]);
});

test("joinWindows attaches components and falls back to [] when missing", () => {
  const windows = parseDowntimeCsv(csv);
  const incidents = parseIncidentsJsonl(jsonl);
  const joined = joinWindows(windows, incidents);
  assert.deepEqual(joined[0].components, ["Actions", "Pull Requests"]);
  assert.deepEqual(joined[1].components, ["Codespaces"]);
  assert.deepEqual(joined[2].components, ["Pages"]);
});

test("joinWindows: incident with no entry in map gets components: []", () => {
  const windows = parseDowntimeCsv(csv);
  const incidents = new Map(); // empty
  const joined = joinWindows(windows, incidents);
  for (const w of joined) assert.deepEqual(w.components, []);
});
