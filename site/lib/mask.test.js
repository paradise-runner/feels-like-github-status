import test from "node:test";
import assert from "node:assert/strict";
import { expand, encode, decode, minutesPerDayOfWeek } from "./mask.js";

test("expand: an empty mask expands to all zeros", () => {
  const mask = new Uint8Array(168);
  const expanded = expand(mask);
  assert.equal(expanded.length, 10080);
  assert.equal(expanded.reduce((a, b) => a + b, 0), 0);
});

test("expand: a single hour cell expands to 60 contiguous minutes", () => {
  const mask = new Uint8Array(168);
  // Monday (day 1), hour 9
  mask[1 * 24 + 9] = 1;
  const expanded = expand(mask);
  // Minutes 1*1440 + 9*60 = 1440 + 540 = 1980 .. 2039 inclusive should be 1
  for (let i = 0; i < 10080; i++) {
    const expected = i >= 1980 && i < 2040 ? 1 : 0;
    assert.equal(expanded[i], expected, `index ${i}`);
  }
});

test("expand: every cell set produces all 1s", () => {
  const mask = new Uint8Array(168).fill(1);
  const expanded = expand(mask);
  assert.equal(expanded.reduce((a, b) => a + b, 0), 10080);
});

test("minutesPerDayOfWeek: empty mask returns seven zeros", () => {
  const mask = new Uint8Array(168);
  assert.deepEqual(minutesPerDayOfWeek(mask), [0, 0, 0, 0, 0, 0, 0]);
});

test("minutesPerDayOfWeek: each set hour-cell contributes 60 minutes to its day", () => {
  const mask = new Uint8Array(168);
  mask[1 * 24 + 9] = 1;  // Monday 9am
  mask[1 * 24 + 10] = 1; // Monday 10am
  mask[5 * 24 + 14] = 1; // Friday 2pm
  assert.deepEqual(minutesPerDayOfWeek(mask), [0, 120, 0, 0, 0, 60, 0]);
});

test("minutesPerDayOfWeek: full mask gives 1440 per day", () => {
  const mask = new Uint8Array(168).fill(1);
  assert.deepEqual(minutesPerDayOfWeek(mask), [1440, 1440, 1440, 1440, 1440, 1440, 1440]);
});

test("encode/decode: empty mask round-trips", () => {
  const mask = new Uint8Array(168);
  const encoded = encode(mask);
  // 168 bits = 21 bytes = 28 base64 chars (no padding)
  assert.equal(encoded.length, 28);
  const decoded = decode(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(mask));
});

test("encode/decode: arbitrary mask round-trips", () => {
  const mask = new Uint8Array(168);
  for (let i = 0; i < 168; i++) mask[i] = i % 3 === 0 ? 1 : 0;
  const decoded = decode(encode(mask));
  assert.deepEqual(Array.from(decoded), Array.from(mask));
});

test("encode: produces base64url-safe characters only", () => {
  const mask = new Uint8Array(168).fill(1);
  const encoded = encode(mask);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
});

test("decode: invalid input returns null", () => {
  assert.equal(decode(""), null);
  assert.equal(decode("not-a-real-base64-string-of-the-right-length-no"), null);
  assert.equal(decode("***"), null);
});
