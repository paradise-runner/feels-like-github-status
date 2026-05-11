# Feels-like GitHub Status — Design

**Status:** approved (brainstorming)
**Date:** 2026-05-08
**Inspired by:** [mrshu/github-statuses](https://github.com/mrshu/github-statuses) (MIT)

## Problem

The upstream "Missing GitHub Status Page" computes a single platform-wide uptime number over the last 90 days, treating every minute equally. Most engineers don't experience GitHub equally across all minutes — a 2am UTC outage during European sleep hours is invisible to a US-based user; a 30-minute disruption during their daily standup is the difference between a calm day and a fire drill.

We want to let a user paint the hours that matter to them and see how reliable GitHub felt **during those hours**.

## Goals

1. A user paints a weekly schedule of "hours when GitHub matters to me."
2. The site displays an uptime percentage and per-day bar chart over the last 90 days, where the denominator is the user's active minutes and the numerator is the active minutes hit by GitHub downtime.
3. Same calculation for each tagged service (Actions, Codespaces, Pages, etc.), shown as a sorted list.
4. Schedule + timezone are persisted in the URL hash (shareable) and in localStorage (sticky across sessions).

## Non-goals

- Real-time monitoring or alerting.
- Sub-hour grid resolution (downtime windows are minute-precision; UI is hour-precision).
- User-selectable lookback windows other than 90 days.
- Custom date ranges.
- Auth, user accounts, server-side state.
- Visualizing the upstream "everyone-equal" view in addition to the feels-like view.

## Architecture overview

```
                    ┌───────────────────────┐
                    │  pipeline/  (vendored) │
                    │   Python, run by CI    │
                    └───────────┬───────────┘
                                │ writes
                                ▼
                       ┌─────────────────┐
                       │  parsed/*.csv   │   committed by daily Action
                       │  parsed/*.jsonl │
                       └────────┬────────┘
                                │ fetch
                                ▼
        ┌──────────────────────────────────────────────────┐
        │                      site/                       │
        │                                                  │
        │  ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
        │  │ time-grid│──>│ app.js   │──>│ uptime-card  │  │
        │  └──────────┘   │ (state)  │   └──────────────┘  │
        │                 │          │   ┌──────────────┐  │
        │                 │          │──>│ service-list │  │
        │                 └──┬───────┘   └──────────────┘  │
        │                    │                             │
        │                    ▼                             │
        │            ┌──────────────┐                      │
        │            │  lib/feels   │  pure math           │
        │            │  lib/mask    │  pure math           │
        │            │  lib/tz      │  pure                │
        │            │  lib/url     │  pure                │
        │            │  lib/data    │  fetch + parse       │
        │            └──────────────┘                      │
        └──────────────────────────────────────────────────┘
```

Static site, vanilla ES modules, no bundler, no framework. Pure modules in `lib/`, DOM-owning modules in `components/`. `app.js` wires everything.

## Repo layout

```
feels-like-github-status/
├── pyproject.toml              # uv-managed
├── pipeline/                   # vendored from mrshu/github-statuses (MIT)
│   ├── LICENSE                 # upstream MIT, preserved
│   ├── UPSTREAM.md             # records the upstream commit SHA
│   ├── extract_incidents.py
│   ├── github-status-history.atom
│   └── ... (their scripts/, tests/)
├── parsed/                     # generated; committed by data action
│   ├── downtime_windows.csv
│   ├── incidents.jsonl
│   └── segments.csv
├── site/
│   ├── index.html
│   ├── styles.css
│   ├── app.js                  # entry — wires modules
│   ├── lib/
│   │   ├── data.js             # fetch + parse CSV/JSONL
│   │   ├── mask.js             # weekly grid <-> bitmask, encoding
│   │   ├── feels.js            # downtime ∩ active math
│   │   ├── tz.js               # detect + UTC↔local
│   │   └── url-state.js        # hash <-> state
│   └── components/
│       ├── time-grid.js
│       ├── uptime-card.js
│       └── service-list.js
├── .github/workflows/
│   ├── update-data.yml         # daily: run pipeline, commit parsed/
│   └── pages.yml               # deferred
└── docs/superpowers/specs/2026-05-08-feels-like-github-status-design.md
```

## Core math (`lib/feels.js`)

### Inputs

- `windows`: `Array<{ incidentId, startUtc: Date, endUtc: Date, severity: string, components: string[] }>`. Built in `lib/data.js` by joining `parsed/downtime_windows.csv` (columns: `incident_id, downtime_start, downtime_end, duration_minutes, source, title, impact`) against `parsed/incidents.jsonl` (which carries the `components` array) on `incident_id`. `severity` comes from the CSV's `impact` column (`minor` | `major` | `maintenance` | `none`). Windows whose impact is `none` are filtered out before this stage.
- `mask`: `Uint8Array(7 * 24 * 60)` — per-minute boolean. Indexed `[localDayOfWeek * 1440 + localMinuteOfDay]`. Built by expanding the hour-resolution grid the user paints (each hour-cell sets 60 contiguous minutes).
- `tz`: IANA zone string.
- `now`: timestamp (injected for tests).
- `service`: optional component filter. When set, only windows whose `components` array includes the service contribute to its result.

### Output

```js
{
  activeMinutes,          // total active minutes in the 90-day window
  downtimeMinutes,        // active minutes hit by qualifying downtime
  uptimePct,              // 1 - downtimeMinutes / activeMinutes
  perDay: Array<{         // 90 entries, oldest -> newest
    date,                 // local-zone YYYY-MM-DD
    active,               // active minutes that day
    down,                 // downtime minutes that day (within active)
    severity              // worst severity that hit any active minute
  }>,
  perService: {           // present when no service filter passed
    [name]: {
      activeMinutes,
      downtimeMinutes,
      uptimePct,
      perDay: Array<{ date, active, down, severity }>  // last 30 days, oldest -> newest
    }
  }
}
```

### Algorithm

1. Compute the 90-day local window: `[startOfDay(now - 89d), now]` in `tz`.
2. Build a weekly prefix sum over `mask` so `activeMinutesIn([startLocal, endLocal])` is O(1) once the day index is known.
3. For each downtime window:
   - Convert `startUtc`, `endUtc` to local time in `tz`.
   - Clip to the 90-day local window.
   - Split at local-day boundaries.
   - For each per-day piece, intersect with the day's mask via prefix sums; accumulate into `perDay[i].down`. Track the worst severity per day, where severity ordering is `operational < maintenance < minor < major` (matches upstream's color legend).
4. `activeMinutes` is computed once at start by summing `perDay[*].active`, which depends only on the mask and `tz`.
5. `perService` runs the same loop with a component filter, in parallel inside one pass over `windows`.

### Why per-minute resolution

Upstream emits minute-level downtime. Hour-precision in the math would over-count: a 3-minute outage at 8:58 should not register against a user's "9–5" mask. Hour-precision in the UI is fine because the user thinks in hour blocks.

### Edge cases

- **Window crosses local midnight** → split into two pieces.
- **Window crosses a DST transition** → handled by going through `tz`-aware datetime conversion (no manual hour offsets); a "fall-back" hour exists twice in local time and a "spring-forward" hour doesn't exist — we trust the timezone library.
- **Empty mask** → return `{ activeMinutes: 0, downtimeMinutes: 0, uptimePct: null, perDay: <90 entries with active=0, down=0>, perService: {} }`. UI checks `activeMinutes === 0` and shows a "pick at least one hour" message instead of rendering bars.
- **Full mask** → equivalent to upstream's calculation.
- **Service with zero active matches** → `uptimePct: null`, hidden from the list.

## Time grid component (`components/time-grid.js`)

7 rows × 24 columns. Rows are days, locale-aware first-day-of-week. Columns are hours 0–23. Active cells filled; inactive outlined. Hour markers above (0/6/12/18); day labels left.

### Interaction

- Click cell → toggle.
- Drag cell → paint. Mode (paint vs erase) is decided by the first cell in the drag.
- Click row label → toggle whole day.
- Click hour label → toggle that hour across all 7 days.
- Touch behaves the same via Pointer Events.
- Arrow keys move focus between cells; space/enter toggles. Day/hour labels are real buttons for keyboard users.

### Presets

A row of buttons above the grid: **Work hours (Mon–Fri 9–5)**, **Evenings & weekends**, **Always**, **Clear**. Non-sticky — they paint the grid; user tweaks freely afterward. No "active preset" highlighting.

### Resolution

Hour-resolution UI, expanded to per-minute when handed to `feels.js` (cell `(day, hour)` sets 60 mask minutes).

### State emitted

Component owns a `Uint8Array(7 * 24)` and emits a `change` event with the array. Parent (`app.js`) re-runs the math and updates URL/storage.

## Uptime card (`components/uptime-card.js`)

Header: "Last 90 days, your hours". One headline percentage. 90 vertical bars below — one per local day, oldest left, today right. Bar color is the worst severity that day; bar height encodes downtime fraction within the day's active minutes (so a tall bar means "GitHub failed me a lot during my hours that day," not "GitHub had a lot of downtime that day").

Hover/tap a bar shows a tooltip with date, active minutes, downtime minutes, and the incident(s) intersecting.

Footer line: "X hours active per week · `<timezone>`" — keeps the denominator visible.

Empty mask → renders "Pick at least one hour above to compute your feels-like uptime" in place of the percentage and bars.

## Service list (`components/service-list.js`)

One row per tagged service — Actions, Codespaces, Pages, Pull Requests, Webhooks, API Requests, Git Operations, Issues, Packages, Copilot (the labels upstream's GLiNER setup uses). Sorted by uptime ascending — most-painful service first.

Each row: service name, percentage, compact 30-day strip (per-day bars). The list shows 30 days, not 90, because per-service incidents are rarer and 90 days of mostly-blank bars look noisy.

Services with `uptimePct === null` (no downtime intersected the user's hours) are hidden. If all services are hidden, render a small "No service-specific incidents during your hours" line.

## State and data flow (`app.js`)

```js
const state = {
  tz: detectTimezone(),
  mask: new Uint8Array(168),    // 7 * 24 hour cells
  data: null,                    // { windows, services }
  now: Date.now(),
};
```

### Boot

1. Try URL hash → if missing/invalid, try localStorage → if missing, default preset (`Mon–Fri 9–5` in detected zone).
2. Fetch `parsed/downtime_windows.csv` and `parsed/incidents.jsonl` in parallel.
3. First render.

### Update loop

Any change (grid edit, timezone dropdown):

1. Update `state`.
2. Run `feels(state.data.windows, expand(state.mask), state.tz, state.now)` → result.
3. Pass result to `uptime-card` and `service-list`.
4. Write URL hash.
5. Write localStorage.

Recomputation is cheap (a few hundred windows × ~90 days), no debounce needed.

### URL hash format

```
#tz=America/Denver&m=<base64url-of-Uint8Array(21)>
```

21 bytes packs 168 bits. base64url so it copy/pastes cleanly without percent-encoding.

## Error handling

Three boundaries:

1. **Data fetch fails** → render "Couldn't load incident data" with a retry button. No partial render of the cards.
2. **Bad URL hash** → silent fallback to localStorage / default. Log to console for debugging.
3. **Unrecognized timezone** → fall back to UTC, surface a small "?" tooltip explaining the fallback.

No try/catch through the math — inputs validated at boundaries; the math trusts them.

## Testing

- `lib/feels.js`, `lib/mask.js`, `lib/url-state.js`, `lib/tz.js` get unit tests using Node's built-in `node:test` runner. No test framework dependency.
- Run with `node --test site/lib/*.test.js`.
- `feels.js` test cases (fixture-based):
  - Empty mask → all zeros, `uptimePct: null`.
  - Full mask → matches upstream-style platform calculation.
  - Window crossing local midnight → split correctly.
  - Window crossing DST transition (forward and back) → correct minute count.
  - Service filter → unaffected windows excluded.
  - Window before lookback start → ignored.
  - Window straddling lookback start → clipped.
- Components tested manually in browser. No headless UI tests for v1.
- Pipeline retains upstream's `tests/` directory and runs them in CI.

## Pipeline vendoring

Vendor a pinned upstream commit into `pipeline/`. Record SHA in `pipeline/UPSTREAM.md`. Preserve `pipeline/LICENSE` (MIT). Merge their `pyproject.toml` deps into ours.

Daily GitHub Action (`update-data.yml`):

```
uv sync
uv run python pipeline/extract_incidents.py \
  --out parsed \
  --enrich-impact \
  --infer-components gliner2
```

If `parsed/` differs, commit and push.

Hosting / Pages deploy is deferred. Local development serves the repo root with `python -m http.server 8000` and opens `http://localhost:8000/site/`.

## Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | Vendor + run upstream pipeline ourselves | Independence from upstream availability; their parsing work is the hard part to redo |
| 2 | 7×24 weekly grid (not presets-only) | Most expressive single input; presets paint into it |
| 3 | Auto-detect timezone, allow override | "Feels-like" only makes sense in user-local time |
| 4 | Platform + per-service, both filtered | Per-service is where surprises live (Actions vs Codespaces) |
| 5 | Fixed 90-day lookback | Matches upstream, keeps math simple, easy to compare |
| 6 | URL hash + localStorage | Shareable links; sticky across sessions; no server |
| 7 | Hosting deferred | Out of scope for v1 build |
| 8 | Greenfield static site | Time-range model deserves a UI built around it, not bolted onto upstream |
| 9 | Vanilla ES modules, no bundler/framework | Tiny app, static deploy, fewer moving parts |
| 10 | Per-minute math, hour UI | Matches data granularity; users think in hour blocks |

## Open questions (deferred to follow-ups)

- Hosting target and Pages deploy workflow.
- Rendering of the social/share image.
- Whether to also surface upstream's full timeline view as a secondary page.
