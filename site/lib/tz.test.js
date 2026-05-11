import test from "node:test";
import assert from "node:assert/strict";
import { detectTimezone, localPartsInZone, isValidTimezone } from "./tz.js";

test("detectTimezone returns a non-empty string", () => {
  const tz = detectTimezone();
  assert.equal(typeof tz, "string");
  assert.ok(tz.length > 0);
});

test("isValidTimezone: known good zone", () => {
  assert.equal(isValidTimezone("America/Denver"), true);
  assert.equal(isValidTimezone("UTC"), true);
});

test("isValidTimezone: garbage returns false", () => {
  assert.equal(isValidTimezone("Not/A/Zone"), false);
  assert.equal(isValidTimezone(""), false);
  assert.equal(isValidTimezone(null), false);
});

test("localPartsInZone: 2026-05-08T16:00:00Z in America/Denver is 10:00 Friday", () => {
  // 2026-05-08 is Friday. America/Denver in May is MDT (UTC-6). 16 - 6 = 10.
  const utcMs = Date.UTC(2026, 4, 8, 16, 0, 0); // month is 0-indexed
  const parts = localPartsInZone(utcMs, "America/Denver");
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 5);   // 1-indexed in our return shape
  assert.equal(parts.day, 8);
  assert.equal(parts.hour, 10);
  assert.equal(parts.minute, 0);
  assert.equal(parts.dayOfWeek, 5); // Friday
});

test("localPartsInZone: 2026-01-15T03:30:00Z in America/Denver is 20:30 Wednesday", () => {
  // 2026-01-15 (Thu UTC). Denver in January is MST (UTC-7). 03:30 - 7h = 20:30 prior day, which is Wed.
  const utcMs = Date.UTC(2026, 0, 15, 3, 30, 0);
  const parts = localPartsInZone(utcMs, "America/Denver");
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 1);
  assert.equal(parts.day, 14);
  assert.equal(parts.hour, 20);
  assert.equal(parts.minute, 30);
  assert.equal(parts.dayOfWeek, 3); // Wednesday
});

test("localPartsInZone: UTC zone returns the UTC parts unchanged", () => {
  const utcMs = Date.UTC(2026, 4, 8, 16, 0, 0); // Friday 16:00 UTC
  const parts = localPartsInZone(utcMs, "UTC");
  assert.equal(parts.hour, 16);
  assert.equal(parts.dayOfWeek, 5);
});

test("localPartsInZone: across DST forward (Denver, 2026-03-08 2am→3am)", () => {
  // At 2026-03-08T09:00:00Z, Denver has just gone from MST to MDT.
  // Pre-transition: UTC-7. Post-transition: UTC-6. 09:00 UTC == 03:00 MDT (post).
  const utcMs = Date.UTC(2026, 2, 8, 9, 0, 0);
  const parts = localPartsInZone(utcMs, "America/Denver");
  assert.equal(parts.day, 8);
  assert.equal(parts.hour, 3);
});
