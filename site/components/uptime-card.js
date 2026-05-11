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
        <div class="uc-legend" aria-hidden="true">
          <span class="uc-legend-item"><span class="uc-legend-dot sev-operational"></span>Operational</span>
          <span class="uc-legend-item"><span class="uc-legend-dot sev-maintenance"></span>Maintenance</span>
          <span class="uc-legend-item"><span class="uc-legend-dot sev-minor"></span>Minor</span>
          <span class="uc-legend-item"><span class="uc-legend-dot sev-major"></span>Major</span>
        </div>
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
