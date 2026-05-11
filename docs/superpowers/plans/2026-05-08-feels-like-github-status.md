# Feels-like GitHub Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static site that shows GitHub uptime filtered to the user's personally-relevant hours (a 7×24 weekly grid), so the percentage reflects how reliable GitHub *feels* to them rather than aggregate availability.

**Architecture:** Greenfield static site (vanilla ES modules, no bundler, no framework) consuming a vendored copy of mrshu/github-statuses' Python data pipeline. Pure-function libraries (`site/lib/`) handle math/parsing/state; DOM-owning components (`site/components/`) render. `app.js` wires events and manages the single state object. Data is committed under `parsed/`; a daily GitHub Action keeps it fresh.

**Tech Stack:**
- Frontend: vanilla JS (ES modules), HTML, CSS — no framework, no bundler
- Tests: `node --test` (Node's built-in test runner) for pure libs; manual browser testing for components
- Pipeline: Python via `uv`, vendored from upstream
- CI: GitHub Actions

**Spec:** `docs/superpowers/specs/2026-05-08-feels-like-github-status-design.md`

---

## File map

Created or modified by this plan:

| Path | Responsibility |
|---|---|
| `README.md` | Project overview, dev/test instructions |
| `.gitignore` | Standard ignores for Python+JS |
| `package.json` | Marks repo as ESM (`type: module`); no deps |
| `pyproject.toml` | Pipeline deps; uv-managed |
| `pipeline/UPSTREAM.md` | Records upstream commit SHA |
| `pipeline/LICENSE` | Upstream MIT license, preserved |
| `pipeline/extract_incidents.py` | Vendored verbatim |
| `pipeline/run_gliner_experiment.py` | Vendored verbatim |
| `pipeline/github-status-history.atom` | Vendored verbatim |
| `pipeline/tests/test_extract_incidents.py` | Vendored verbatim |
| `parsed/downtime_windows.csv` | Generated; initial snapshot from upstream |
| `parsed/incidents.jsonl` | Generated; initial snapshot from upstream |
| `parsed/segments.csv` | Generated; not consumed by site, kept for parity |
| `.github/workflows/update-data.yml` | Daily pipeline run + commit |
| `site/index.html` | Page shell, mounts components |
| `site/styles.css` | Visual design tokens, layout |
| `site/app.js` | State, event wiring, boot |
| `site/lib/mask.js` | Hour-mask encode/decode/expand |
| `site/lib/mask.test.js` | mask.js unit tests |
| `site/lib/tz.js` | Timezone detect, local parts in zone |
| `site/lib/tz.test.js` | tz.js unit tests |
| `site/lib/url-state.js` | URL hash <-> state |
| `site/lib/url-state.test.js` | url-state.js unit tests |
| `site/lib/data.js` | Fetch + parse parsed/ files, join components |
| `site/lib/data.test.js` | data.js fixture tests |
| `site/lib/feels.js` | Core "feels-like" math |
| `site/lib/feels.test.js` | feels.js unit tests (multiple cases) |
| `site/components/time-grid.js` | 7×24 click/drag editor |
| `site/components/uptime-card.js` | Headline percentage + 90-day bars |
| `site/components/service-list.js` | Per-service rows |

---

## Conventions

- **Test runner.** Node's built-in: `node --test site/lib/*.test.js`.
- **ESM everywhere.** Root `package.json` declares `"type": "module"` so plain `.js` files are ESM. The site uses `<script type="module">`. No CommonJS.
- **Imports.** Use relative paths with explicit `.js` extensions: `import { feels } from "./feels.js";` — works in both Node and browser.
- **Commit messages.** [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`.
- **DayOfWeek convention.** Sunday=0, Monday=1, ..., Saturday=6 (matches `Date.prototype.getDay()`).
- **Mask shapes.**
  - Hour mask: `Uint8Array(168)`, indexed `[dayOfWeek * 24 + hour]`. Owned by the time-grid component, persisted in URL/localStorage.
  - Per-minute mask: `Uint8Array(7 * 24 * 60) = Uint8Array(10080)`, indexed `[dayOfWeek * 1440 + hour * 60 + minute]`. Computed by `mask.expand()` and consumed by `feels()`.
- **Severity ordering.** `operational < maintenance < minor < major`. Encoded numerically: `{ operational: 0, maintenance: 1, minor: 2, major: 3 }`.

---

## Task 1: Repo scaffolding

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `package.json`

- [ ] **Step 1: Create `README.md`**

Write to `README.md`:

```markdown
# Feels-like GitHub Status

GitHub uptime, filtered to the hours you actually use it.

This is a remix of [mrshu/github-statuses](https://github.com/mrshu/github-statuses) (MIT) — instead of computing one platform-wide uptime number across every minute of the last 90 days, you paint a weekly schedule of *your* hours, and the page shows how reliable GitHub felt during them.

## Develop locally

```bash
# Serve the static site
python3 -m http.server 8000
# open http://localhost:8000/site/
```

## Run the unit tests

```bash
node --test site/lib/*.test.js
```

## Refresh the data (optional)

The `parsed/` directory is committed and updated daily by CI. To regenerate locally:

```bash
uv sync
uv run python pipeline/extract_incidents.py --out parsed --enrich-impact --infer-components gliner2
```

(Requires Python 3.11–3.13. The GLiNER2 step downloads PyTorch and is heavy; omit `--infer-components gliner2` if you don't need ML-inferred components.)

## Layout

- `site/` — static site (HTML, CSS, vanilla ES modules)
- `pipeline/` — vendored Python data pipeline (MIT, see `pipeline/LICENSE`)
- `parsed/` — generated incident data committed by CI
- `docs/superpowers/specs/` — design spec
- `docs/superpowers/plans/` — implementation plan

## License

MIT for original code in this repo. Vendored pipeline retains its upstream MIT license — see `pipeline/LICENSE`.
```

- [ ] **Step 2: Create `.gitignore`**

Write to `.gitignore`:

```
# Python
__pycache__/
*.pyc
.venv/
.cache/
.pytest_cache/

# Node
node_modules/

# OS
.DS_Store

# Pipeline cache
pipeline/.cache/
```

- [ ] **Step 3: Create `package.json`**

Write to `package.json`:

```json
{
  "name": "feels-like-github-status",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore package.json
git commit -m "chore: scaffold repo (README, gitignore, package.json)"
```

---

## Task 2: Vendor the upstream pipeline

**Files:**
- Create: `pipeline/UPSTREAM.md`
- Create: `pipeline/LICENSE`
- Create: `pipeline/extract_incidents.py`
- Create: `pipeline/run_gliner_experiment.py`
- Create: `pipeline/github-status-history.atom`
- Create: `pipeline/tests/test_extract_incidents.py`
- Create: `pipeline/tests/__init__.py` (empty)
- Create: `pyproject.toml`

The upstream commit pinned for this vendor: `01cf69735cb8fa8c89c0135ef9acb9523976cf12` (mrshu/github-statuses, master, 2026-05-08).

- [ ] **Step 1: Clone upstream at the pinned SHA into a temp directory**

```bash
git clone https://github.com/mrshu/github-statuses /tmp/upstream-gh-statuses
cd /tmp/upstream-gh-statuses
git checkout 01cf69735cb8fa8c89c0135ef9acb9523976cf12
cd -
```

Expected: clone succeeds, `git status` in `/tmp/upstream-gh-statuses` shows detached HEAD at the pinned SHA.

- [ ] **Step 2: Copy the pipeline files into `pipeline/`**

```bash
mkdir -p pipeline/tests
cp /tmp/upstream-gh-statuses/scripts/extract_incidents.py pipeline/extract_incidents.py
cp /tmp/upstream-gh-statuses/scripts/run_gliner_experiment.py pipeline/run_gliner_experiment.py
cp /tmp/upstream-gh-statuses/github-status-history.atom pipeline/github-status-history.atom
cp /tmp/upstream-gh-statuses/tests/test_extract_incidents.py pipeline/tests/test_extract_incidents.py
cp /tmp/upstream-gh-statuses/LICENSE pipeline/LICENSE
touch pipeline/tests/__init__.py
```

The vendored Python files import each other via `from extract_incidents import ...` (relative imports) — verify that the test file works without modification by running it later. If it has a `from scripts.extract_incidents` reference, fix the import paths to match the new layout.

- [ ] **Step 3: Create `pipeline/UPSTREAM.md`**

Write to `pipeline/UPSTREAM.md`:

```markdown
# Vendored pipeline

This directory contains the data extraction pipeline from [mrshu/github-statuses](https://github.com/mrshu/github-statuses), used under its MIT license (see `LICENSE`).

- **Upstream commit:** `01cf69735cb8fa8c89c0135ef9acb9523976cf12`
- **Vendored on:** 2026-05-08
- **Reason for vendoring:** independence from upstream availability and freedom to evolve our schema.

To re-vendor at a newer commit:

1. Clone upstream and checkout the new SHA.
2. Copy the same files listed below.
3. Update this `UPSTREAM.md` with the new SHA and date.
4. Run `node --test site/lib/data.test.js` to confirm our parser still handles the data shape.

Files vendored:
- `extract_incidents.py` (from `scripts/`)
- `run_gliner_experiment.py` (from `scripts/`)
- `github-status-history.atom`
- `tests/test_extract_incidents.py`
- `LICENSE`
```

- [ ] **Step 4: Create root `pyproject.toml`**

Write to `pyproject.toml` (a minor adaptation of upstream's: same deps, our project name):

```toml
[project]
name = "feels-like-github-status"
version = "0.1.0"
description = "GitHub status, filtered to your hours."
readme = "README.md"
requires-python = ">=3.11,<3.14"
dependencies = [
    "gliner2>=1.2.3",
    "torch==2.9.1+cpu ; sys_platform == 'linux'",
    "torch==2.9.1 ; sys_platform != 'linux'",
]

[tool.uv]
package = false

[[tool.uv.index]]
name = "pypi"
url = "https://pypi.org/simple"

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"

[tool.uv.sources]
torch = [
    { index = "pytorch-cpu", marker = "sys_platform == 'linux'" },
]
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/ pyproject.toml
git commit -m "feat: vendor mrshu/github-statuses pipeline (commit 01cf697)"
```

(We do NOT run `uv sync` here — pulling PyTorch is heavy and the dev workflow doesn't require it. CI will sync. Verifying the vendored Python tests pass is also deferred to CI.)

---

## Task 3: Snapshot initial `parsed/` data

We snapshot upstream's parsed output rather than re-running the pipeline locally — this avoids requiring every contributor to install PyTorch. CI regenerates fresh data daily (Task 4).

**Files:**
- Create: `parsed/downtime_windows.csv`
- Create: `parsed/incidents.jsonl`
- Create: `parsed/segments.csv`

- [ ] **Step 1: Download the three parsed files from upstream at the pinned SHA**

```bash
mkdir -p parsed
BASE="https://raw.githubusercontent.com/mrshu/github-statuses/01cf69735cb8fa8c89c0135ef9acb9523976cf12/parsed"
curl -sSL "$BASE/downtime_windows.csv" -o parsed/downtime_windows.csv
curl -sSL "$BASE/incidents.jsonl" -o parsed/incidents.jsonl
curl -sSL "$BASE/segments.csv" -o parsed/segments.csv
```

Expected: three files downloaded.

- [ ] **Step 2: Verify the files look right**

```bash
head -1 parsed/downtime_windows.csv
wc -l parsed/incidents.jsonl
ls -lh parsed/
```

Expected:
- `downtime_windows.csv` first line is `incident_id,downtime_start,downtime_end,duration_minutes,source,title,impact`.
- `incidents.jsonl` has hundreds of lines.
- File sizes roughly: `downtime_windows.csv` ~80KB, `incidents.jsonl` ~1.7MB, `segments.csv` ~230KB.

- [ ] **Step 3: Commit**

```bash
git add parsed/
git commit -m "feat: snapshot initial parsed/ data from upstream"
```

---

## Task 4: GitHub Action for daily data refresh

**Files:**
- Create: `.github/workflows/update-data.yml`

- [ ] **Step 1: Write the workflow**

Write to `.github/workflows/update-data.yml`:

```yaml
name: Update incident data

on:
  schedule:
    # Daily at 06:00 UTC
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3

      - name: Set up Python 3.13
        run: uv python install 3.13

      - name: Sync dependencies
        run: uv sync --python 3.13

      - name: Run extractor
        run: |
          uv run python pipeline/extract_incidents.py \
            --out parsed \
            --enrich-impact \
            --infer-components gliner2

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain parsed/)" ]]; then
            git add parsed/
            git commit -m "chore(data): daily refresh"
            git push
          else
            echo "No data changes."
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "ci: daily pipeline run that commits parsed/ updates"
```

(The first scheduled run, or a manual `workflow_dispatch`, will validate that the vendored pipeline runs end-to-end. We're not running it locally.)

---

## Task 5: `lib/mask.js` — encode, decode, expand, sum-per-DoW

**Files:**
- Create: `site/lib/mask.js`
- Create: `site/lib/mask.test.js`

The hour mask is `Uint8Array(168)`, indexed `[dayOfWeek * 24 + hour]`, with values 0 or 1. The per-minute mask is `Uint8Array(10080)`, indexed `[dayOfWeek * 1440 + hour * 60 + minute]`.

We TDD this module function-by-function.

- [ ] **Step 1: Write the failing test for `expand`**

Write to `site/lib/mask.test.js`:

```js
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
```

- [ ] **Step 2: Run the test — should fail**

```bash
node --test site/lib/mask.test.js
```

Expected: import errors / `expand is not a function`.

- [ ] **Step 3: Implement `expand`**

Write to `site/lib/mask.js`:

```js
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
```

- [ ] **Step 4: Run the test — should pass for `expand` (others still fail)**

```bash
node --test site/lib/mask.test.js
```

Expected: 3 expand tests PASS, others fail (encode/decode/minutesPerDayOfWeek).

- [ ] **Step 5: Add tests for `minutesPerDayOfWeek`**

Append to `site/lib/mask.test.js`:

```js
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
```

- [ ] **Step 6: Run — should fail**

```bash
node --test site/lib/mask.test.js
```

Expected: 3 new tests fail.

- [ ] **Step 7: Implement `minutesPerDayOfWeek`**

Append to `site/lib/mask.js`:

```js
export function minutesPerDayOfWeek(mask) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (let d = 0; d < 7; d++) {
    let n = 0;
    for (let h = 0; h < 24; h++) if (mask[d * 24 + h]) n++;
    out[d] = n * 60;
  }
  return out;
}
```

- [ ] **Step 8: Run — should pass**

```bash
node --test site/lib/mask.test.js
```

Expected: 6 tests PASS, encode/decode tests still fail.

- [ ] **Step 9: Add tests for `encode`/`decode`**

Append to `site/lib/mask.test.js`:

```js
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
```

- [ ] **Step 10: Run — should fail**

```bash
node --test site/lib/mask.test.js
```

Expected: 4 new tests fail.

- [ ] **Step 11: Implement `encode`/`decode`**

Append to `site/lib/mask.js`:

```js
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
```

- [ ] **Step 12: Run — all 10 tests should pass**

```bash
node --test site/lib/mask.test.js
```

Expected: 10/10 PASS.

- [ ] **Step 13: Commit**

```bash
git add site/lib/mask.js site/lib/mask.test.js
git commit -m "feat(mask): hour-mask encode/decode/expand utilities (TDD)"
```

---

## Task 6: `lib/tz.js` — detect timezone, local parts in zone

**Files:**
- Create: `site/lib/tz.js`
- Create: `site/lib/tz.test.js`

`tz.js` exposes:
- `detectTimezone()` — returns the browser/host IANA zone string, or `"UTC"` if undetectable.
- `localPartsInZone(utcMs, tz)` — returns `{ year, month, day, hour, minute, dayOfWeek }` for the given UTC instant in the given zone. `dayOfWeek` follows JS convention (Sunday=0).
- `isValidTimezone(tz)` — returns `true` if `Intl.DateTimeFormat({timeZone: tz})` constructs without throwing.

- [ ] **Step 1: Write the failing tests**

Write to `site/lib/tz.test.js`:

```js
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
```

- [ ] **Step 2: Run — should fail**

```bash
node --test site/lib/tz.test.js
```

Expected: import errors.

- [ ] **Step 3: Implement `tz.js`**

Write to `site/lib/tz.js`:

```js
export function detectTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.length > 0) return tz;
  } catch {}
  return "UTC";
}

export function isValidTimezone(tz) {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const FORMATTER_CACHE = new Map();
function formatter(tz) {
  let f = FORMATTER_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    FORMATTER_CACHE.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localPartsInZone(utcMs, tz) {
  const parts = formatter(tz).formatToParts(new Date(utcMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl can return hour="24" at midnight in some locales; normalize.
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    dayOfWeek: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}
```

- [ ] **Step 4: Run — should pass**

```bash
node --test site/lib/tz.test.js
```

Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add site/lib/tz.js site/lib/tz.test.js
git commit -m "feat(tz): timezone detection and zone-aware local parts (TDD)"
```

---

## Task 7: `lib/url-state.js` — hash <-> state

**Files:**
- Create: `site/lib/url-state.js`
- Create: `site/lib/url-state.test.js`

The hash format is `#tz=<encoded>&m=<base64url>`. Decoding is permissive: any failure → returns `null` and the caller falls back.

- [ ] **Step 1: Write the failing tests**

Write to `site/lib/url-state.test.js`:

```js
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
```

- [ ] **Step 2: Run — should fail**

```bash
node --test site/lib/url-state.test.js
```

Expected: import errors.

- [ ] **Step 3: Implement `url-state.js`**

Write to `site/lib/url-state.js`:

```js
import { encode as encodeMask, decode as decodeMask } from "./mask.js";
import { isValidTimezone } from "./tz.js";

export function serializeHash({ tz, mask }) {
  const params = new URLSearchParams();
  params.set("tz", tz);
  params.set("m", encodeMask(mask));
  return params.toString();
}

export function parseHash(hash) {
  if (typeof hash !== "string") return null;
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!stripped) return null;
  const params = new URLSearchParams(stripped);
  const tz = params.get("tz");
  const m = params.get("m");
  if (!tz || !m) return null;
  if (!isValidTimezone(tz)) return null;
  const mask = decodeMask(m);
  if (!mask) return null;
  return { tz, mask };
}
```

- [ ] **Step 4: Run — should pass**

```bash
node --test site/lib/url-state.test.js
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add site/lib/url-state.js site/lib/url-state.test.js
git commit -m "feat(url-state): hash serialize/parse with mask + tz (TDD)"
```

---

## Task 8: `lib/data.js` — fetch + parse + join

**Files:**
- Create: `site/lib/data.js`
- Create: `site/lib/data.test.js`
- Create: `site/lib/__fixtures__/downtime_windows.csv`
- Create: `site/lib/__fixtures__/incidents.jsonl`

`data.js` exposes:
- `parseDowntimeCsv(text)` — returns `Array<{incidentId, startUtc, endUtc, durationMinutes, source, title, impact}>`. `startUtc` and `endUtc` are `Date` instances. Rows with `impact === "none"` are omitted.
- `parseIncidentsJsonl(text)` — returns `Map<incidentId, { components: string[] }>`.
- `joinWindows(windows, incidents)` — attaches `components` to each window. Windows whose incident isn't in the map get `components: []`.
- `loadParsed(baseUrl)` — async. Fetches `${baseUrl}/downtime_windows.csv` and `${baseUrl}/incidents.jsonl`, joins, returns `{ windows, services }`. `services` is the sorted set of distinct component names that appear on at least one window.

CSV parsing is hand-rolled (the upstream files do not contain quoted commas in any sampled row, but defensively handle quoted values).

- [ ] **Step 1: Create fixture files**

Write to `site/lib/__fixtures__/downtime_windows.csv`:

```
incident_id,downtime_start,downtime_end,duration_minutes,source,title,impact
100,2026-04-01T10:00:00Z,2026-04-01T10:30:00Z,30,updates,Incident with Actions,major
101,2026-04-02T15:00:00Z,2026-04-02T15:15:00Z,15,updates,Incident with Codespaces,minor
102,2026-04-03T08:00:00Z,2026-04-03T09:00:00Z,60,updates,Routine maintenance,maintenance
103,2026-04-04T08:00:00Z,2026-04-04T08:01:00Z,1,updates,No-impact note,none
```

Write to `site/lib/__fixtures__/incidents.jsonl`:

```
{"id":"100","title":"Incident with Actions","impact":"major","components":["Actions","Pull Requests"]}
{"id":"101","title":"Incident with Codespaces","impact":"minor","components":["Codespaces"]}
{"id":"102","title":"Routine maintenance","impact":"maintenance","components":["Pages"]}
{"id":"103","title":"No-impact note","impact":"none","components":["API Requests"]}
```

- [ ] **Step 2: Write the failing tests**

Write to `site/lib/data.test.js`:

```js
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
```

- [ ] **Step 3: Run — should fail**

```bash
node --test site/lib/data.test.js
```

Expected: import errors.

- [ ] **Step 4: Implement `data.js`**

Write to `site/lib/data.js`:

```js
function parseCsvLine(line) {
  // Minimal CSV: handles "double-quoted" fields containing commas.
  const out = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cur += ch; i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { out.push(cur); cur = ""; i++; continue; }
      cur += ch; i++;
    }
  }
  out.push(cur);
  return out;
}

export function parseDowntimeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const idx = (name) => headers.indexOf(name);
  const iId = idx("incident_id");
  const iStart = idx("downtime_start");
  const iEnd = idx("downtime_end");
  const iDur = idx("duration_minutes");
  const iSrc = idx("source");
  const iTitle = idx("title");
  const iImp = idx("impact");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const impact = cols[iImp];
    if (impact === "none") continue;
    out.push({
      incidentId: cols[iId],
      startUtc: new Date(cols[iStart]),
      endUtc: new Date(cols[iEnd]),
      durationMinutes: parseInt(cols[iDur], 10),
      source: cols[iSrc],
      title: cols[iTitle],
      impact,
    });
  }
  return out;
}

export function parseIncidentsJsonl(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    map.set(String(obj.id), { components: Array.isArray(obj.components) ? obj.components : [] });
  }
  return map;
}

export function joinWindows(windows, incidents) {
  return windows.map((w) => ({
    ...w,
    components: incidents.get(w.incidentId)?.components ?? [],
  }));
}

export async function loadParsed(baseUrl) {
  const [csv, jsonl] = await Promise.all([
    fetch(`${baseUrl}/downtime_windows.csv`).then((r) => {
      if (!r.ok) throw new Error(`downtime_windows.csv ${r.status}`);
      return r.text();
    }),
    fetch(`${baseUrl}/incidents.jsonl`).then((r) => {
      if (!r.ok) throw new Error(`incidents.jsonl ${r.status}`);
      return r.text();
    }),
  ]);
  const windows = joinWindows(parseDowntimeCsv(csv), parseIncidentsJsonl(jsonl));
  const services = [...new Set(windows.flatMap((w) => w.components))].sort();
  return { windows, services };
}
```

- [ ] **Step 5: Run — should pass**

```bash
node --test site/lib/data.test.js
```

Expected: 4/4 PASS.

- [ ] **Step 6: Commit**

```bash
git add site/lib/data.js site/lib/data.test.js site/lib/__fixtures__/
git commit -m "feat(data): CSV/JSONL loader joining components onto windows"
```

---

## Task 9: `lib/feels.js` — the math (TDD)

**Files:**
- Create: `site/lib/feels.js`
- Create: `site/lib/feels.test.js`

This is the most important module. Algorithm: brute-force per-minute over downtime windows (small total) using `tz.localPartsInZone` to look up the per-minute mask and the local-day index.

### Public API

```js
export function feels({ windows, mask, tz, now }) -> {
  activeMinutes,           // number
  downtimeMinutes,         // number, platform-wide
  uptimePct,               // number in [0,1] or null when activeMinutes === 0
  perDay: Array<{          // exactly 90 entries, oldest -> newest
    date: "YYYY-MM-DD",    // local date in tz
    active: number,
    down: number,
    severity: "operational" | "maintenance" | "minor" | "major"
  }>,
  perService: {            // present always; empty object if no services involved
    [name]: {
      activeMinutes,
      downtimeMinutes,
      uptimePct,
      perDay: Array<{date, active, down, severity}>  // last 30 entries (oldest -> newest)
    }
  }
}
```

`mask` is the **hour mask** (`Uint8Array(168)`); `feels()` expands internally.

### Algorithm

1. Find local "today" in tz (parts of `now`). `endLocalDate = today`.
2. Build the 90-day local date list: 89 days before `today`, ..., today. Each entry is keyed by `YYYY-MM-DD`.
3. Compute each day's `active` minutes from `minutesPerDayOfWeek(mask)[dayOfWeek(localDate)]`.
4. Compute `lookbackStartUtc` = the UTC instant corresponding to local-midnight of the first day. Use a binary-ish approach: try `new Date(year, month-1, day)` and adjust until `localPartsInZone(t, tz)` matches `{year, month, day, hour: 0, minute: 0}`. Practical implementation: start from `Date.UTC(year, month-1, day)`, iterate at most 24 hours of one-minute steps backward/forward — overkill, but correctness over speed for a one-shot per call. (See implementation for the chosen approach.)
5. For each window, clamp `[startUtc, endUtc]` to `[lookbackStartUtc, now]`, skip if empty.
6. Iterate per-minute through the clamped window:
   - `parts = localPartsInZone(t, tz)`
   - hour-cell index `hc = parts.dayOfWeek * 24 + parts.hour`
   - if `mask[hc]` is set:
     - find perDay index by `YYYY-MM-DD` → integer (build a lookup map up front)
     - `perDay[idx].down += 1`; bump `perDay[idx].severity` to `max(current, window.impact)`
     - for each component in `window.components`: same accumulation under `perService[component]`
7. Compute totals from `perDay`. `perService[name].perDay` = last 30 entries of its full 90-entry per-day array (slice).

### Step-by-step

- [ ] **Step 1: Write the simplest failing test (empty input)**

Write to `site/lib/feels.test.js`:

```js
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
```

- [ ] **Step 2: Run — should fail**

```bash
node --test site/lib/feels.test.js
```

Expected: import error.

- [ ] **Step 3: Initial implementation — empty-mask path only**

Write to `site/lib/feels.js`:

```js
import { expand, minutesPerDayOfWeek } from "./mask.js";
import { localPartsInZone } from "./tz.js";

const SEVERITY_RANK = { operational: 0, maintenance: 1, minor: 2, major: 3 };
const RANK_TO_NAME = ["operational", "maintenance", "minor", "major"];
const MS_PER_MIN = 60_000;

function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(parts) { return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`; }

// Find UTC ms corresponding to local midnight of the given (y, m, d) in tz.
// Probe-and-adjust: start at UTC(y, m-1, d), then walk hour-by-hour up to ±24h
// until we find an instant whose local parts are exactly (y, m, d, 0, 0).
function localMidnightUtc(year, month, day, tz) {
  const target = new Date(Date.UTC(year, month - 1, day)).getTime();
  for (let offset = -14; offset <= 14; offset++) {
    const t = target + offset * 3600_000;
    const p = localPartsInZone(t, tz);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) {
      return t;
    }
  }
  // Fallback: return the offset=0 anchor (should not happen for IANA zones).
  return target;
}

function buildPerDay(mask, tz, now) {
  const todayParts = localPartsInZone(now, tz);
  // Compute the local date 89 days ago.
  const todayUtcMidnight = localMidnightUtc(todayParts.year, todayParts.month, todayParts.day, tz);
  const startUtcMidnight = todayUtcMidnight - 89 * 86_400_000;
  const startParts = localPartsInZone(startUtcMidnight, tz);

  const minutesByDow = minutesPerDayOfWeek(mask);
  const perDay = [];
  const indexByDate = new Map();
  let cursor = localMidnightUtc(startParts.year, startParts.month, startParts.day, tz);
  for (let i = 0; i < 90; i++) {
    const p = localPartsInZone(cursor, tz);
    const date = ymd(p);
    perDay.push({ date, active: minutesByDow[p.dayOfWeek], down: 0, severity: "operational" });
    indexByDate.set(date, i);
    // Advance one local day. Use 25h then snap, to survive DST.
    cursor = localMidnightUtc(p.year, p.month, p.day, tz) + 25 * 3600_000;
    const next = localPartsInZone(cursor, tz);
    cursor = localMidnightUtc(next.year, next.month, next.day, tz);
  }
  return { perDay, indexByDate, lookbackStartUtc: localMidnightUtc(startParts.year, startParts.month, startParts.day, tz) };
}

export function feels({ windows, mask, tz, now }) {
  const expandedMask = expand(mask);
  const { perDay, indexByDate, lookbackStartUtc } = buildPerDay(mask, tz, now);
  const activeMinutes = perDay.reduce((s, d) => s + d.active, 0);

  if (activeMinutes === 0) {
    return {
      activeMinutes: 0,
      downtimeMinutes: 0,
      uptimePct: null,
      perDay,
      perService: {},
    };
  }

  // Per-service accumulators (keyed by component name).
  const perService = new Map();
  function getServiceAcc(name) {
    let s = perService.get(name);
    if (!s) {
      s = {
        downtimeMinutes: 0,
        perDay: perDay.map((d) => ({ date: d.date, active: d.active, down: 0, severity: "operational" })),
      };
      perService.set(name, s);
    }
    return s;
  }

  let downtimeMinutes = 0;
  for (const w of windows) {
    const startMs = Math.max(w.startUtc.getTime(), lookbackStartUtc);
    const endMs = Math.min(w.endUtc.getTime(), now);
    if (startMs >= endMs) continue;

    // Clamp to whole minute boundaries.
    const startMin = Math.floor(startMs / MS_PER_MIN) * MS_PER_MIN;
    const endMin = Math.ceil(endMs / MS_PER_MIN) * MS_PER_MIN;
    const sevRank = SEVERITY_RANK[w.impact] ?? 0;

    for (let t = startMin; t < endMin; t += MS_PER_MIN) {
      const p = localPartsInZone(t, tz);
      const hc = p.dayOfWeek * 24 + p.hour;
      if (!expandedMask[p.dayOfWeek * 1440 + p.hour * 60 + p.minute]) continue;
      const dateKey = ymd(p);
      const dayIdx = indexByDate.get(dateKey);
      if (dayIdx === undefined) continue; // outside lookback in local time

      const dayEntry = perDay[dayIdx];
      dayEntry.down += 1;
      if (sevRank > SEVERITY_RANK[dayEntry.severity]) dayEntry.severity = w.impact;
      downtimeMinutes += 1;

      for (const svc of w.components) {
        const acc = getServiceAcc(svc);
        acc.downtimeMinutes += 1;
        const sd = acc.perDay[dayIdx];
        sd.down += 1;
        if (sevRank > SEVERITY_RANK[sd.severity]) sd.severity = w.impact;
      }
    }
  }

  // Build the perService output object.
  const perServiceOut = {};
  for (const [name, acc] of perService.entries()) {
    perServiceOut[name] = {
      activeMinutes,
      downtimeMinutes: acc.downtimeMinutes,
      uptimePct: 1 - acc.downtimeMinutes / activeMinutes,
      perDay: acc.perDay.slice(-30),
    };
  }

  return {
    activeMinutes,
    downtimeMinutes,
    uptimePct: 1 - downtimeMinutes / activeMinutes,
    perDay,
    perService: perServiceOut,
  };
}
```

- [ ] **Step 4: Run the empty-mask test — should pass**

```bash
node --test site/lib/feels.test.js
```

Expected: 1/1 PASS.

- [ ] **Step 5: Add full-mask, single-window tests**

Append to `site/lib/feels.test.js`:

```js
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
  // NOW=2026-05-08 16:00Z, 90 days back ≈ 2026-02-07 00:00Z.
  // Window from 2026-02-06 23:30Z to 2026-02-07 00:30Z (60 min).
  // Only the 30 minutes from 00:00 to 00:30 are in-range.
  const mask = new Uint8Array(168).fill(1);
  const w = utcWindow("2026-02-06T23:30:00Z", "2026-02-07T00:30:00Z", "minor", []);
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
```

- [ ] **Step 6: Run — every test should pass**

```bash
node --test site/lib/feels.test.js
```

Expected: 10/10 PASS. If any fail, investigate; the most likely culprit is `localMidnightUtc` for unusual zones — verify that `localPartsInZone(localMidnightUtc(y, m, d, tz), tz)` returns exactly midnight of that date.

- [ ] **Step 7: Commit**

```bash
git add site/lib/feels.js site/lib/feels.test.js
git commit -m "feat(feels): core feels-like uptime math (TDD, 10 cases)"
```

---

## Task 10: `components/time-grid.js` — 7×24 click/drag editor

**Files:**
- Create: `site/components/time-grid.js`

This component is tested manually in the browser (per spec). It exports a class:

```js
export class TimeGrid {
  constructor(rootEl, { mask = new Uint8Array(168), firstDay = 1 } = {})
  setMask(mask)            // bulk update; triggers re-render but NOT a change event
  getMask()                // returns a copy of the internal mask
  applyPreset(name)        // "work-hours" | "evenings-weekends" | "always" | "clear"
  on(event, handler)       // event = "change"; handler receives the new mask
  off(event, handler)
}
```

`firstDay` is the column of the first day shown (0=Sun, 1=Mon). `mask` is always indexed canonically (Sun=0).

- [ ] **Step 1: Implement the class**

Write to `site/components/time-grid.js`:

```js
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class TimeGrid {
  #root;
  #mask;
  #firstDay;
  #handlers = new Map(); // event -> Set<handler>
  #cellEls = new Array(168);
  #dragMode = null; // null | 1 | 0  (paint vs erase)
  #dragging = false;

  constructor(rootEl, { mask = new Uint8Array(168), firstDay = 1 } = {}) {
    this.#root = rootEl;
    this.#mask = new Uint8Array(mask);
    this.#firstDay = firstDay;
    this.#render();
    this.#wireEvents();
  }

  setMask(mask) {
    this.#mask = new Uint8Array(mask);
    this.#refresh();
  }

  getMask() { return new Uint8Array(this.#mask); }

  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
  }

  applyPreset(name) {
    this.#mask.fill(0);
    if (name === "work-hours") {
      for (let d = 1; d <= 5; d++) for (let h = 9; h < 17; h++) this.#mask[d * 24 + h] = 1;
    } else if (name === "evenings-weekends") {
      for (let d = 1; d <= 5; d++) for (let h = 18; h < 22; h++) this.#mask[d * 24 + h] = 1;
      for (const d of [0, 6]) for (let h = 9; h < 22; h++) this.#mask[d * 24 + h] = 1;
    } else if (name === "always") {
      this.#mask.fill(1);
    } else if (name === "clear") {
      // already cleared
    }
    this.#refresh();
    this.#emit();
  }

  // -- internals --

  #emit() {
    for (const h of this.#handlers.get("change") ?? []) h(this.getMask());
  }

  #render() {
    const root = this.#root;
    root.innerHTML = "";
    root.classList.add("time-grid");
    root.setAttribute("role", "grid");
    root.setAttribute("aria-label", "Weekly schedule");

    // Hour header row
    const headRow = document.createElement("div");
    headRow.className = "tg-row tg-head";
    headRow.appendChild(spacer());
    for (let h = 0; h < 24; h++) {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "tg-hour-label";
      c.textContent = h % 6 === 0 ? String(h) : "";
      c.dataset.hour = String(h);
      c.setAttribute("aria-label", `Toggle column ${h}:00`);
      headRow.appendChild(c);
    }
    root.appendChild(headRow);

    // Day rows
    for (let row = 0; row < 7; row++) {
      const d = (this.#firstDay + row) % 7;
      const r = document.createElement("div");
      r.className = "tg-row";
      const lbl = document.createElement("button");
      lbl.type = "button";
      lbl.className = "tg-day-label";
      lbl.textContent = DAY_NAMES[d];
      lbl.dataset.day = String(d);
      lbl.setAttribute("aria-label", `Toggle ${DAY_NAMES[d]}`);
      r.appendChild(lbl);
      for (let h = 0; h < 24; h++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "tg-cell";
        cell.dataset.day = String(d);
        cell.dataset.hour = String(h);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${DAY_NAMES[d]} ${h}:00`);
        cell.setAttribute("aria-pressed", "false");
        this.#cellEls[d * 24 + h] = cell;
        r.appendChild(cell);
      }
      root.appendChild(r);
    }

    this.#refresh();

    function spacer() {
      const s = document.createElement("span");
      s.className = "tg-spacer";
      return s;
    }
  }

  #refresh() {
    for (let i = 0; i < 168; i++) {
      const el = this.#cellEls[i];
      if (!el) continue;
      const on = !!this.#mask[i];
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  #toggleCell(d, h, force) {
    const i = d * 24 + h;
    const next = force === undefined ? (this.#mask[i] ? 0 : 1) : force;
    if (this.#mask[i] === next) return;
    this.#mask[i] = next;
    const el = this.#cellEls[i];
    el.classList.toggle("is-on", !!next);
    el.setAttribute("aria-pressed", next ? "true" : "false");
  }

  #wireEvents() {
    const root = this.#root;

    root.addEventListener("pointerdown", (e) => {
      const cell = e.target.closest(".tg-cell");
      if (cell) {
        e.preventDefault();
        const d = Number(cell.dataset.day);
        const h = Number(cell.dataset.hour);
        this.#dragMode = this.#mask[d * 24 + h] ? 0 : 1;
        this.#toggleCell(d, h, this.#dragMode);
        this.#dragging = true;
        cell.setPointerCapture?.(e.pointerId);
        return;
      }
      const dayLbl = e.target.closest(".tg-day-label");
      if (dayLbl) {
        const d = Number(dayLbl.dataset.day);
        // toggle: if any cell on, clear the row; else set the row
        const anyOn = (() => { for (let h = 0; h < 24; h++) if (this.#mask[d * 24 + h]) return true; return false; })();
        for (let h = 0; h < 24; h++) this.#toggleCell(d, h, anyOn ? 0 : 1);
        this.#emit();
        return;
      }
      const hourLbl = e.target.closest(".tg-hour-label");
      if (hourLbl) {
        const h = Number(hourLbl.dataset.hour);
        const anyOn = (() => { for (let d = 0; d < 7; d++) if (this.#mask[d * 24 + h]) return true; return false; })();
        for (let d = 0; d < 7; d++) this.#toggleCell(d, h, anyOn ? 0 : 1);
        this.#emit();
        return;
      }
    });

    root.addEventListener("pointerover", (e) => {
      if (!this.#dragging) return;
      const cell = e.target.closest(".tg-cell");
      if (!cell) return;
      const d = Number(cell.dataset.day);
      const h = Number(cell.dataset.hour);
      this.#toggleCell(d, h, this.#dragMode);
    });

    const stop = () => {
      if (!this.#dragging) return;
      this.#dragging = false;
      this.#dragMode = null;
      this.#emit();
    };
    root.addEventListener("pointerup", stop);
    root.addEventListener("pointercancel", stop);
    root.addEventListener("pointerleave", stop);

    // Keyboard: space/enter on a focused cell toggles it.
    root.addEventListener("keydown", (e) => {
      const cell = e.target.closest(".tg-cell");
      if (!cell) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const d = Number(cell.dataset.day);
        const h = Number(cell.dataset.hour);
        this.#toggleCell(d, h);
        this.#emit();
      }
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/components/time-grid.js
git commit -m "feat(time-grid): 7x24 click/drag schedule editor"
```

(Manual browser test happens in Task 14 once the page is wired.)

---

## Task 11: `components/uptime-card.js` — headline + 90-day bars

**Files:**
- Create: `site/components/uptime-card.js`

```js
export class UptimeCard {
  constructor(rootEl)
  update({ uptimePct, perDay, activeMinutes, downtimeMinutes, tz, weeklyHours })
}
```

Bar height: `down / active` clamped to `[0.05, 1]` so days with any downtime are visible. Days where `active === 0` render as empty cells.

- [ ] **Step 1: Implement**

Write to `site/components/uptime-card.js`:

```js
function pct(x) {
  if (x == null) return "—";
  return (x * 100).toFixed(2) + "%";
}

export class UptimeCard {
  #root;
  #barsEl;
  #pctEl;
  #footEl;
  #emptyEl;

  constructor(rootEl) {
    this.#root = rootEl;
    rootEl.classList.add("uptime-card");
    rootEl.innerHTML = `
      <div class="uc-head">
        <h3>Last 90 days, your hours</h3>
      </div>
      <div class="uc-row">
        <div class="uc-label">
          <span>GitHub Platform</span>
          <span class="uc-pct"></span>
        </div>
        <div class="uc-bars" aria-hidden="true"></div>
        <div class="uc-empty" hidden>Pick at least one hour above to compute your feels-like uptime.</div>
        <div class="uc-axis"><span>90 days ago</span><span>Today</span></div>
      </div>
      <div class="uc-foot"></div>
    `;
    this.#barsEl = rootEl.querySelector(".uc-bars");
    this.#pctEl = rootEl.querySelector(".uc-pct");
    this.#footEl = rootEl.querySelector(".uc-foot");
    this.#emptyEl = rootEl.querySelector(".uc-empty");
  }

  update({ uptimePct, perDay, activeMinutes, downtimeMinutes, tz, weeklyHours }) {
    if (activeMinutes === 0) {
      this.#pctEl.textContent = "—";
      this.#barsEl.hidden = true;
      this.#emptyEl.hidden = false;
      this.#footEl.textContent = "";
      return;
    }
    this.#barsEl.hidden = false;
    this.#emptyEl.hidden = true;
    this.#pctEl.textContent = pct(uptimePct);

    this.#barsEl.innerHTML = "";
    for (const d of perDay) {
      const bar = document.createElement("div");
      bar.className = "uc-bar sev-" + d.severity;
      let h = 0;
      if (d.active > 0 && d.down > 0) {
        const r = d.down / d.active;
        h = Math.max(0.08, Math.min(1, r));
      }
      bar.style.setProperty("--h", h.toFixed(3));
      bar.title = `${d.date} · ${d.down}/${d.active} active min affected`;
      this.#barsEl.appendChild(bar);
    }

    this.#footEl.textContent = `${weeklyHours} hours active per week · ${tz}`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/components/uptime-card.js
git commit -m "feat(uptime-card): headline percentage and 90-day bars"
```

---

## Task 12: `components/service-list.js` — per-service rows

**Files:**
- Create: `site/components/service-list.js`

```js
export class ServiceList {
  constructor(rootEl)
  update({ perService, activeMinutes })  // hidden when activeMinutes === 0
}
```

- [ ] **Step 1: Implement**

Write to `site/components/service-list.js`:

```js
function pct(x) {
  if (x == null) return "—";
  return (x * 100).toFixed(2) + "%";
}

export class ServiceList {
  #root;

  constructor(rootEl) {
    this.#root = rootEl;
    rootEl.classList.add("service-list");
    rootEl.innerHTML = `
      <h3>Services during your hours</h3>
      <div class="sl-rows"></div>
      <div class="sl-empty" hidden>No service-specific incidents during your hours.</div>
    `;
  }

  update({ perService, activeMinutes }) {
    const rowsEl = this.#root.querySelector(".sl-rows");
    const emptyEl = this.#root.querySelector(".sl-empty");
    rowsEl.innerHTML = "";

    if (activeMinutes === 0) {
      this.#root.style.display = "none";
      return;
    }
    this.#root.style.display = "";

    const entries = Object.entries(perService).filter(([, v]) => v.uptimePct !== null);
    entries.sort((a, b) => a[1].uptimePct - b[1].uptimePct);

    if (entries.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    for (const [name, v] of entries) {
      const row = document.createElement("div");
      row.className = "sl-row";
      const bars = v.perDay.map((d) => {
        let h = 0;
        if (d.active > 0 && d.down > 0) {
          const r = d.down / d.active;
          h = Math.max(0.08, Math.min(1, r));
        }
        return `<div class="sl-bar sev-${d.severity}" style="--h:${h.toFixed(3)}" title="${d.date} · ${d.down}/${d.active} min"></div>`;
      }).join("");
      row.innerHTML = `
        <span class="sl-name">${name}</span>
        <span class="sl-pct">${pct(v.uptimePct)}</span>
        <span class="sl-bars">${bars}</span>
      `;
      rowsEl.appendChild(row);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/components/service-list.js
git commit -m "feat(service-list): per-service rows with 30-day strips"
```

---

## Task 13: `site/index.html` and `site/styles.css`

**Files:**
- Create: `site/index.html`
- Create: `site/styles.css`

- [ ] **Step 1: Write `site/index.html`**

Write to `site/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Feels-like GitHub Status</title>
  <link rel="stylesheet" href="styles.css" />
  <meta name="theme-color" content="#0d1117" />
</head>
<body>
  <header class="site-header">
    <h1>Feels-like GitHub Status</h1>
    <p class="lede">GitHub uptime, filtered to the hours you actually use it.</p>
  </header>

  <main>
    <section class="panel">
      <div class="panel-head">
        <h3>Your hours</h3>
        <div class="presets">
          <button type="button" data-preset="work-hours">Work hours</button>
          <button type="button" data-preset="evenings-weekends">Evenings &amp; weekends</button>
          <button type="button" data-preset="always">Always</button>
          <button type="button" data-preset="clear">Clear</button>
        </div>
        <div class="tz">
          <label for="tzSelect">Timezone</label>
          <select id="tzSelect"></select>
        </div>
      </div>
      <div id="timeGrid"></div>
    </section>

    <section class="panel" id="uptimeCard"></section>

    <section class="panel" id="serviceList"></section>

    <section class="panel about">
      <h3>About</h3>
      <p>
        This is a remix of <a href="https://github.com/mrshu/github-statuses">mrshu/github-statuses</a> (MIT). Instead of computing one platform-wide uptime number across every minute of the last 90 days, it filters to the hours you marked above.
      </p>
      <p class="muted">
        Source on <a href="https://github.com/edwardchampion/feels-like-github-status">GitHub</a>.
      </p>
    </section>
  </main>

  <div id="errorBanner" class="error-banner" hidden>
    Couldn't load incident data. <button type="button" id="retryButton">Retry</button>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `site/styles.css`**

Write to `site/styles.css`:

```css
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --panel-2: #1c232c;
  --text: #c9d1d9;
  --muted: #8b949e;
  --accent: #58a6ff;
  --border: #30363d;
  --sev-operational: #2ea043;
  --sev-maintenance: #58a6ff;
  --sev-minor: #d29922;
  --sev-major: #f85149;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f6f8fa;
    --panel: #ffffff;
    --panel-2: #f0f3f6;
    --text: #1f2328;
    --muted: #57606a;
    --accent: #0969da;
    --border: #d0d7de;
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
.site-header {
  max-width: 960px;
  margin: 32px auto 16px;
  padding: 0 16px;
}
.site-header h1 { margin: 0; font-size: 28px; }
.lede { color: var(--muted); margin: 4px 0 0; }
main {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 16px 64px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.panel-head h3 { margin: 0; flex: 0 0 auto; }
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button, .tz select, #retryButton {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
}
.tz { margin-left: auto; display: flex; gap: 6px; align-items: center; font-size: 13px; }

/* Time grid */
.time-grid { user-select: none; }
.tg-row { display: flex; align-items: center; gap: 1px; }
.tg-row + .tg-row { margin-top: 1px; }
.tg-spacer, .tg-day-label { width: 38px; flex: 0 0 38px; text-align: right; padding-right: 4px; font-size: 11px; color: var(--muted); background: none; border: 0; cursor: pointer; }
.tg-day-label:hover { color: var(--text); }
.tg-hour-label {
  flex: 1; min-width: 0;
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 10px;
  cursor: pointer;
  height: 14px;
  line-height: 14px;
}
.tg-cell {
  flex: 1; min-width: 0;
  height: 24px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  cursor: pointer;
  padding: 0;
  border-radius: 2px;
}
.tg-cell.is-on {
  background: var(--accent);
  border-color: var(--accent);
}
.tg-cell:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

/* Uptime card */
.uptime-card .uc-row { position: relative; padding: 8px 0; }
.uc-label { display: flex; justify-content: space-between; align-items: baseline; }
.uc-pct { font-family: ui-monospace, Menlo, monospace; font-size: 22px; }
.uc-bars { display: flex; gap: 1px; height: 32px; align-items: flex-end; margin: 8px 0 4px; }
.uc-bar {
  flex: 1;
  height: calc(var(--h, 0) * 100%);
  min-height: 2px;
  background: var(--sev-operational);
  border-radius: 1px 1px 0 0;
}
.uc-bar.sev-operational { background: var(--sev-operational); height: 8%; opacity: 0.5; }
.uc-bar.sev-maintenance { background: var(--sev-maintenance); }
.uc-bar.sev-minor { background: var(--sev-minor); }
.uc-bar.sev-major { background: var(--sev-major); }
.uc-axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }
.uc-foot { font-size: 12px; color: var(--muted); margin-top: 8px; }
.uc-empty { color: var(--muted); padding: 12px 0; }

/* Service list */
.service-list .sl-row {
  display: grid;
  grid-template-columns: 160px 80px 1fr;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
}
.sl-pct { font-family: ui-monospace, Menlo, monospace; font-size: 13px; text-align: right; color: var(--muted); }
.sl-bars { display: flex; gap: 1px; height: 16px; align-items: flex-end; }
.sl-bar {
  flex: 1; min-width: 0;
  height: calc(var(--h, 0) * 100%);
  min-height: 1px;
  background: var(--sev-operational);
  border-radius: 1px 1px 0 0;
}
.sl-bar.sev-operational { background: var(--sev-operational); height: 8%; opacity: 0.4; }
.sl-bar.sev-maintenance { background: var(--sev-maintenance); }
.sl-bar.sev-minor { background: var(--sev-minor); }
.sl-bar.sev-major { background: var(--sev-major); }

.muted { color: var(--muted); }
.about p { margin: 8px 0; }
.error-banner {
  position: fixed; left: 16px; right: 16px; bottom: 16px;
  background: var(--sev-major); color: #fff; padding: 12px;
  border-radius: 8px; display: flex; gap: 12px; align-items: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add site/index.html site/styles.css
git commit -m "feat(site): page shell and styles"
```

---

## Task 14: `site/app.js` — wiring + state + persistence + manual test

**Files:**
- Create: `site/app.js`

- [ ] **Step 1: Implement `app.js`**

Write to `site/app.js`:

```js
import { loadParsed } from "./lib/data.js";
import { feels } from "./lib/feels.js";
import { detectTimezone, isValidTimezone } from "./lib/tz.js";
import { parseHash, serializeHash } from "./lib/url-state.js";
import { minutesPerDayOfWeek } from "./lib/mask.js";
import { TimeGrid } from "./components/time-grid.js";
import { UptimeCard } from "./components/uptime-card.js";
import { ServiceList } from "./components/service-list.js";

const STORAGE_KEY = "feels-like-state-v1";
const PARSED_BASE = new URL("../parsed", import.meta.url).href;

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function defaultMask() {
  // Mon–Fri 9–5
  const m = new Uint8Array(168);
  for (let d = 1; d <= 5; d++) for (let h = 9; h < 17; h++) m[d * 24 + h] = 1;
  return m;
}

function readInitialState() {
  // Priority: URL hash -> localStorage -> defaults
  const fromHash = parseHash(location.hash);
  if (fromHash) return fromHash;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseHash("#" + raw);
      if (parsed) return parsed;
    }
  } catch {}
  return { tz: detectTimezone(), mask: defaultMask() };
}

function writeState({ tz, mask }) {
  const serialized = serializeHash({ tz, mask });
  history.replaceState(null, "", "#" + serialized);
  try { localStorage.setItem(STORAGE_KEY, serialized); } catch {}
}

function buildTzSelect(selectEl, current) {
  const zones = new Set(COMMON_TIMEZONES);
  zones.add(current);
  // Add browser-detected zone too
  const detected = detectTimezone();
  if (isValidTimezone(detected)) zones.add(detected);
  selectEl.innerHTML = "";
  for (const z of [...zones].sort()) {
    const opt = document.createElement("option");
    opt.value = z;
    opt.textContent = z;
    if (z === current) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function main() {
  const initial = readInitialState();
  const state = {
    tz: isValidTimezone(initial.tz) ? initial.tz : "UTC",
    mask: initial.mask,
    data: null,
    now: Date.now(),
  };

  const tzSelect = document.getElementById("tzSelect");
  buildTzSelect(tzSelect, state.tz);

  const grid = new TimeGrid(document.getElementById("timeGrid"), { mask: state.mask, firstDay: 1 });
  const card = new UptimeCard(document.getElementById("uptimeCard"));
  const list = new ServiceList(document.getElementById("serviceList"));

  function recompute() {
    if (!state.data) return;
    const result = feels({
      windows: state.data.windows,
      mask: state.mask,
      tz: state.tz,
      now: state.now,
    });
    const weeklyHours = minutesPerDayOfWeek(state.mask).reduce((s, n) => s + n, 0) / 60;
    card.update({
      uptimePct: result.uptimePct,
      perDay: result.perDay,
      activeMinutes: result.activeMinutes,
      downtimeMinutes: result.downtimeMinutes,
      tz: state.tz,
      weeklyHours,
    });
    list.update({ perService: result.perService, activeMinutes: result.activeMinutes });
    writeState(state);
  }

  // Wire events
  grid.on("change", (mask) => {
    state.mask = mask;
    recompute();
  });
  tzSelect.addEventListener("change", () => {
    if (isValidTimezone(tzSelect.value)) {
      state.tz = tzSelect.value;
      recompute();
    }
  });
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => grid.applyPreset(btn.dataset.preset));
  });

  const errorBanner = document.getElementById("errorBanner");
  const retryButton = document.getElementById("retryButton");
  async function loadData() {
    errorBanner.hidden = true;
    try {
      state.data = await loadParsed(PARSED_BASE);
      recompute();
    } catch (e) {
      console.error(e);
      errorBanner.hidden = false;
    }
  }
  retryButton.addEventListener("click", loadData);

  // First render with empty data so the grid shows up immediately
  recompute();
  await loadData();
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add site/app.js
git commit -m "feat(app): wire state, components, persistence"
```

- [ ] **Step 3: Run the unit tests once more end-to-end**

```bash
node --test site/lib/*.test.js
```

Expected: ALL tests PASS (mask + tz + url-state + data + feels = ~33 tests across 5 files).

- [ ] **Step 4: Manual browser test (golden path)**

Start the static server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/site/` and verify:

1. The page renders with the "Mon–Fri 9–5" preset already painted on the grid.
2. The uptime card shows a percentage (not "—") and 90 bars.
3. The service list shows at least one row.
4. Clicking the **Always** preset paints the entire grid; the percentage drops (or stays the same), and the bar count is unchanged.
5. Clicking a single cell toggles it (visible immediately).
6. Click-and-drag across a few cells paints them in one motion.
7. Changing the timezone dropdown changes the percentage.
8. After a change, the URL fragment updates (visible in the address bar).
9. Reload the page — the grid and timezone are restored.
10. Open in an incognito window with a fresh URL fragment from the previous tab — the same view is shown.

If any of these fail, fix before moving on. Common fixes:
- If `loadParsed` 404s: check the relative path. `PARSED_BASE` resolves to `<page-url>/../parsed` which from `site/app.js` should give `<root>/parsed/`. With `python -m http.server 8000` from repo root that's `http://localhost:8000/parsed/`, which is correct.
- If the tooltip is invisible on the bars: the `title` attribute is enough — no extra fix needed.
- If the bars overflow on mobile: the CSS uses `flex: 1` — bars get thin but should not overflow.

- [ ] **Step 5: Edge case: empty mask**

Click **Clear**. Verify:

- The percentage shows "—".
- The empty-state message renders ("Pick at least one hour above…").
- The service list disappears.
- Adding any cell brings the values back.

- [ ] **Step 6: Commit any fixes**

If you needed fixes:

```bash
git add -p
git commit -m "fix: address manual-test findings"
```

---

## Self-review

Spec coverage check (run after writing the plan, fix gaps inline):

- [x] Vendoring upstream pipeline (Task 2) — covers `pipeline/UPSTREAM.md`, license, deps.
- [x] Initial parsed/ snapshot (Task 3) so contributors don't need PyTorch locally.
- [x] Daily refresh CI (Task 4) — implements the spec's pipeline automation; hosting deferred per Q7.
- [x] `lib/mask.js` (Task 5) — encode/decode/expand/sum-per-DoW.
- [x] `lib/tz.js` (Task 6) — detection + zone-aware local parts.
- [x] `lib/url-state.js` (Task 7) — hash format `#tz=...&m=<base64url>`.
- [x] `lib/data.js` (Task 8) — CSV+JSONL parse, `incident_id` join, services list.
- [x] `lib/feels.js` (Task 9) — full math contract including `perDay` (90), `perService.perDay` (30), severity ordering, edge cases (empty mask, lookback clipping, service filter, mask filter, DST via Intl).
- [x] `time-grid` (Task 10) — drag/click, presets, day/hour-label toggles, keyboard accessibility.
- [x] `uptime-card` (Task 11) — headline + 90-day bars + footer denominator + empty state.
- [x] `service-list` (Task 12) — sorted, hidden-when-null, 30-day strips.
- [x] `index.html` + `styles.css` (Task 13) — page shell, severity color tokens, dark/light.
- [x] `app.js` (Task 14) — state, recompute, URL+localStorage persistence, error boundary with retry, manual test checklist.

Type/name consistency check: `feels()` returns `perDay[*].severity` strings; `uptime-card` and `service-list` consume `sev-${d.severity}` CSS classes; `styles.css` defines `.sev-operational/.sev-maintenance/.sev-minor/.sev-major`. Consistent.

Mask shape consistency: `mask.js` defines hour mask (168) and per-minute (10080); `feels.js` accepts hour mask and expands internally; `time-grid.js` and `app.js` both handle hour masks; `url-state.js` round-trips hour masks. Consistent.

No placeholders, TBDs, or "TODO" entries in the plan body.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-feels-like-github-status.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
