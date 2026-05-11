import { expand, minutesPerDayOfWeek } from "./mask.js";
import { localPartsInZone } from "./tz.js";

const SEVERITY_RANK = { operational: 0, maintenance: 1, minor: 2, major: 3 };
const MS_PER_MIN = 60_000;

function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(parts) { return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`; }

// Find UTC ms corresponding to local midnight of the given (y, m, d) in tz.
// Probe-and-adjust: start at UTC(y, m-1, d), then walk in 15-minute increments up to ±14h
// until we find an instant whose local parts are exactly (y, m, d, 0, 0).
// 15-minute steps are required for fractional-offset zones like Asia/Kolkata (UTC+5:30).
function localMidnightUtc(year, month, day, tz) {
  const target = new Date(Date.UTC(year, month - 1, day)).getTime();
  for (let offset = -14 * 4; offset <= 14 * 4; offset++) {
    const t = target + offset * (3600_000 / 4);
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
  // Compute the local date 89 days ago via calendar arithmetic on a UTC anchor.
  // Subtracting 89 days of ms from local-midnight-as-UTC is DST-naive: in zones
  // where today's UTC offset differs from the offset 89 days ago, the result
  // lands an hour off and localPartsInZone returns the wrong calendar day.
  const anchor = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  anchor.setUTCDate(anchor.getUTCDate() - 89);
  const startParts = {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  };

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

export function feels({ windows, mask, tz, now, acceptedServices = null }) {
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

  // Dedup sets: platform-level keyed by UTC minute timestamp; per-service keyed by "svc utcMin".
  const seenPlatformMin = new Set();
  const seenServiceMin = new Set();

  let downtimeMinutes = 0;
  for (const w of windows) {
    const startMs = Math.max(w.startUtc.getTime(), lookbackStartUtc);
    const endMs = Math.min(w.endUtc.getTime(), now);
    if (startMs >= endMs) continue;

    // Clamp to whole minute boundaries.
    const startMin = Math.floor(startMs / MS_PER_MIN) * MS_PER_MIN;
    const endMin = Math.ceil(endMs / MS_PER_MIN) * MS_PER_MIN;
    const sevRank = SEVERITY_RANK[w.impact] ?? 0;
    // A window counts toward the platform metric only if at least one of its
    // components is in the user's accepted services. null = no filter.
    const platformQualifies =
      acceptedServices === null ||
      w.components.some((c) => acceptedServices.has(c));

    for (let t = startMin; t < endMin; t += MS_PER_MIN) {
      const p = localPartsInZone(t, tz);
      if (!expandedMask[p.dayOfWeek * 1440 + p.hour * 60 + p.minute]) continue;
      const dateKey = ymd(p);
      const dayIdx = indexByDate.get(dateKey);
      if (dayIdx === undefined) continue; // outside lookback in local time

      const dayEntry = perDay[dayIdx];
      if (platformQualifies) {
        // Platform-level dedup: count each minute once across overlapping windows.
        if (!seenPlatformMin.has(t)) {
          seenPlatformMin.add(t);
          dayEntry.down += 1;
          downtimeMinutes += 1;
        }
        // Severity escalation applies on every qualifying hit, deduped or not.
        if (sevRank > SEVERITY_RANK[dayEntry.severity]) dayEntry.severity = w.impact;
      }

      for (const svc of w.components) {
        const acc = getServiceAcc(svc);
        const svcKey = `${svc} ${t}`;
        // Per-service dedup: count this minute only once per service.
        if (!seenServiceMin.has(svcKey)) {
          seenServiceMin.add(svcKey);
          acc.downtimeMinutes += 1;
          const sd = acc.perDay[dayIdx];
          sd.down += 1;
          if (sevRank > SEVERITY_RANK[sd.severity]) sd.severity = w.impact;
        } else {
          // Already counted this minute for this service — still update severity.
          const sd = acc.perDay[dayIdx];
          if (sevRank > SEVERITY_RANK[sd.severity]) sd.severity = w.impact;
        }
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
