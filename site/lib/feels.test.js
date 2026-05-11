import test from "node:test";
import assert from "node:assert/strict";
import { feels } from "./feels.js";

const NOW = Date.UTC(2026, 4, 8, 16, 0, 0); // 2026-05-08 16:00 UTC

test("empty mask + empty windows: activeMinutes=0, uptimePct=null, perDay has 90 entries", () => {
  const out = feels({
    windows: [],
    mask: new Uint8Array(168),
    tz: "UTC",
    now: NOW,
  });
  assert.equal(out.activeMinutes, 0);
  assert.equal(out.downtimeMinutes, 0);
  assert.equal(out.uptimePct, null);
  assert.equal(out.perDay.length, 90);
  for (const d of out.perDay) {
    assert.equal(d.active, 0);
    assert.equal(d.down, 0);
    assert.equal(d.severity, "operational");
  }
  assert.deepEqual(out.perService, {});
});

function utcWindow(startIso, endIso, impact, components = []) {
  return {
    incidentId: "x",
    startUtc: new Date(startIso),
    endUtc: new Date(endIso),
    impact,
    components,
  };
}

test("full mask, no windows: uptime is 1, activeMinutes is 90*1440", () => {
  const mask = new Uint8Array(168).fill(1);
  const out = feels({ windows: [], mask, tz: "UTC", now: NOW });
  assert.equal(out.activeMinutes, 90 * 1440);
  assert.equal(out.downtimeMinutes, 0);
  assert.equal(out.uptimePct, 1);
});

test("full mask, single 30-minute major window: 30 downtime minutes", () => {
  const mask = new Uint8Array(168).fill(1);
  // 2026-04-15 (well within the 90-day window before NOW=2026-05-08)
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "major", ["Actions"]);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 30);
  assert.equal(out.uptimePct, 1 - 30 / (90 * 1440));
  // perDay: the 2026-04-15 entry should have down=30, severity=major
  const day = out.perDay.find((d) => d.date === "2026-04-15");
  assert.ok(day);
  assert.equal(day.down, 30);
  assert.equal(day.severity, "major");
  // perService: Actions present, others absent
  assert.equal(out.perService["Actions"].downtimeMinutes, 30);
  assert.ok(!("Codespaces" in out.perService));
});

test("window outside 90-day lookback is ignored", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z", "major", ["Actions"]);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 0);
});

test("window straddling lookback start is clipped", () => {
  // NOW=2026-05-08 16:00Z, lookback start ≈ 2026-02-08 00:00Z.
  // Window from 2026-02-07 23:30Z to 2026-02-08 00:30Z (60 min).
  // Only the 30 minutes from 00:00 to 00:30 are in-range.
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-02-07T23:30:00Z", "2026-02-08T00:30:00Z", "minor", []);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 30);
});

test("severity precedence: minor + major on same day = major", () => {
  const mask = new Uint8Array(168).fill(1);
  const ws = [
    utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:10:00Z", "minor", []),
    utcWindow("2026-04-15T11:00:00Z", "2026-04-15T11:05:00Z", "major", []),
  ];
  const out = feels({ windows: ws, mask, tz: "UTC", now: NOW });
  const day = out.perDay.find((d) => d.date === "2026-04-15");
  assert.equal(day.severity, "major");
  assert.equal(day.down, 15);
});

test("service filter via components array: Codespaces incident only counts for Codespaces", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:20:00Z", "minor", ["Codespaces"]);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 20);
  assert.equal(out.perService["Codespaces"].downtimeMinutes, 20);
  assert.ok(!("Actions" in out.perService));
});

test("mask filtering: a window outside active hours contributes zero downtime", () => {
  // mask: only Tuesday 9-17 UTC active
  const mask = new Uint8Array(168);
  for (let h = 9; h < 17; h++) mask[2 * 24 + h] = 1;
  // 2026-04-15 is a Wednesday — window does NOT intersect Tuesday hours.
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T11:00:00Z", "major", []);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 0);
});

test("mask filtering with local timezone: window inside Denver work hours", () => {
  // mask: Mon-Fri 9-17 (in tz-local)
  const mask = new Uint8Array(168);
  for (let d = 1; d <= 5; d++) for (let h = 9; h < 17; h++) mask[d * 24 + h] = 1;
  // 2026-04-15 14:00 UTC == 08:00 MDT (still before active hours).
  // 2026-04-15 16:00 UTC == 10:00 MDT (active).
  // Window 16:00–16:30 UTC -> 10:00–10:30 MDT, 30 minutes during work hours.
  const w = utcWindow("2026-04-15T16:00:00Z", "2026-04-15T16:30:00Z", "minor", []);
  const out = feels({ windows: [w], mask, tz: "America/Denver", now: NOW });
  assert.equal(out.downtimeMinutes, 30);
});

test("perService.perDay always has 30 entries (last 30 days)", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "major", ["Actions"]);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.perService["Actions"].perDay.length, 30);
});

test("overlapping windows are counted once for platform", () => {
  const mask = new Uint8Array(168).fill(1);
  // Two incidents whose minutes overlap from 10:15 to 10:30 (15 min overlap)
  const ws = [
    utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "minor", ["A"]),
    utcWindow("2026-04-15T10:15:00Z", "2026-04-15T10:45:00Z", "major", ["B"]),
  ];
  const out = feels({ windows: ws, mask, tz: "UTC", now: NOW });
  // Total unique minutes: 30 (10:00-10:30) + 15 (10:30-10:45) = 45
  assert.equal(out.downtimeMinutes, 45);
  // Severity worst on the day = major
  const day = out.perDay.find((d) => d.date === "2026-04-15");
  assert.equal(day.down, 45);
  assert.equal(day.severity, "major");
  // Per-service: A has 30 min, B has 30 min (independent — these don't dedupe across services)
  assert.equal(out.perService["A"].downtimeMinutes, 30);
  assert.equal(out.perService["B"].downtimeMinutes, 30);
});

test("localMidnightUtc handles fractional-offset zones (Asia/Kolkata, UTC+5:30)", () => {
  const mask = new Uint8Array(168).fill(1);
  // 2026-04-15T18:30:00Z = 2026-04-16T00:00:00 IST. Window 18:30-19:00Z = 00:00-00:30 IST.
  const w = utcWindow("2026-04-15T18:30:00Z", "2026-04-15T19:00:00Z", "minor", []);
  const out = feels({ windows: [w], mask, tz: "Asia/Kolkata", now: NOW });
  // 30 minutes of downtime, recorded against local date 2026-04-16
  assert.equal(out.downtimeMinutes, 30);
  const day = out.perDay.find((d) => d.date === "2026-04-16");
  assert.ok(day, "Apr 16 IST should be in perDay");
  assert.equal(day.down, 30);
});

test("acceptedServices filter: window with no matching component is excluded from platform downtime", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "major", ["Codespaces"]);
  const out = feels({
    windows: [w],
    mask,
    tz: "UTC",
    now: NOW,
    acceptedServices: new Set(["Actions"]),
  });
  assert.equal(out.downtimeMinutes, 0);
  // Per-service breakdown is unaffected by the filter.
  assert.equal(out.perService["Codespaces"].downtimeMinutes, 30);
});

test("acceptedServices filter: window with a matching component is counted", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "minor", ["Actions", "Pull Requests"]);
  const out = feels({
    windows: [w],
    mask,
    tz: "UTC",
    now: NOW,
    acceptedServices: new Set(["Actions"]),
  });
  assert.equal(out.downtimeMinutes, 30);
});

test("acceptedServices null = no filter (existing behavior)", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "minor", ["Codespaces"]);
  const out = feels({ windows: [w], mask, tz: "UTC", now: NOW });
  assert.equal(out.downtimeMinutes, 30);
});

test("acceptedServices empty Set: nothing qualifies for platform downtime", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "minor", ["Codespaces"]);
  const out = feels({
    windows: [w],
    mask,
    tz: "UTC",
    now: NOW,
    acceptedServices: new Set(),
  });
  assert.equal(out.downtimeMinutes, 0);
  assert.equal(out.uptimePct, 1);
});

test("acceptedServices filter: window with empty components is excluded when filter is set", () => {
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-04-15T10:00:00Z", "2026-04-15T10:30:00Z", "minor", []);
  const out = feels({
    windows: [w],
    mask,
    tz: "UTC",
    now: NOW,
    acceptedServices: new Set(["Actions"]),
  });
  assert.equal(out.downtimeMinutes, 0);
});
