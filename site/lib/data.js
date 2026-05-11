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
