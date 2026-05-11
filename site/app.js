import { loadParsed } from "./lib/data.js";
import { feels } from "./lib/feels.js";
import { detectTimezone, isValidTimezone } from "./lib/tz.js";
import { parseHash, serializeHash } from "./lib/url-state.js";
import { minutesPerDayOfWeek } from "./lib/mask.js";
import { SERVICES, allSelected } from "./lib/services.js";
import { TimeGrid } from "./components/time-grid.js";
import { UptimeCard } from "./components/uptime-card.js";
import { ServiceList } from "./components/service-list.js";
import { ServicesFilter } from "./components/services-filter.js";

const STORAGE_KEY = "feels-like-state-v1";
// During local dev (served from repo root), the page path includes "/site/"
// and data lives at ../parsed (one level up from site/).
// On GitHub Pages, data is bundled inside site/parsed/ during deployment,
// so it's at ./parsed relative to the page URL.
const PATHNAME = location.pathname;
const PARSED_BASE = PATHNAME.includes("/site/")
  ? new URL("../parsed", location.href).href
  : new URL("parsed", location.href).href;

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
  return { tz: detectTimezone(), mask: defaultMask(), services: allSelected() };
}

function writeState({ tz, mask, services }) {
  const serialized = serializeHash({ tz, mask, services });
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
    services: initial.services ?? allSelected(),
    data: null,
    now: Date.now(),
  };

  const tzSelect = document.getElementById("tzSelect");
  buildTzSelect(tzSelect, state.tz);

  const servicesFilter = new ServicesFilter(document.getElementById("servicesFilter"), { selected: state.services });
  const grid = new TimeGrid(document.getElementById("timeGrid"), { mask: state.mask, firstDay: 1 });
  const card = new UptimeCard(document.getElementById("uptimeCard"));
  const list = new ServiceList(document.getElementById("serviceList"));

  function recompute() {
    state.now = Date.now();
    if (!state.data) return;
    // When every known service is selected, treat as "no filter" so untagged
    // incidents still count toward platform downtime. Narrowing the selection
    // switches to strict filtering: only windows tagged with a selected service
    // contribute (untagged windows are excluded because we can't tell what they
    // affected).
    const acceptedServices = state.services.size < SERVICES.length ? state.services : null;
    const result = feels({
      windows: state.data.windows,
      mask: state.mask,
      tz: state.tz,
      now: state.now,
      acceptedServices,
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
    list.update({
      perService: result.perService,
      activeMinutes: result.activeMinutes,
      selectedServices: state.services,
    });
    writeState(state);
  }

  // Wire events
  servicesFilter.on("change", (services) => {
    state.services = services;
    recompute();
  });
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
