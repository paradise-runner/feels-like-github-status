const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const SEV_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  minor: "Partial outage",
  major: "Major outage",
};

function pct(x) {
  if (x == null) return "—";
  return (x * 100).toFixed(2) + "%";
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtDuration(mins) {
  if (!mins) return "no downtime";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} affected`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hr = `${h}h`;
  return (m ? `${hr} ${m}m` : hr) + " affected";
}

function dowOfDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export class ServiceList {
  #root;
  #tip;

  constructor(rootEl) {
    this.#root = rootEl;
    rootEl.classList.add("service-list");
    rootEl.innerHTML = `
      <div class="sl-section-head">
        <h3>Services during your hours</h3>
        <p class="muted panel-sub">Last 30 days · hover a day for details</p>
      </div>
      <div class="sl-grid-rows"></div>
      <div class="sl-empty" hidden>No service-specific incidents during your hours.</div>
    `;
    this.#tip = this.#ensureTooltip();
    this.#wireTooltip();
  }

  update({ perService, activeMinutes, selectedServices = null }) {
    const rowsEl = this.#root.querySelector(".sl-grid-rows");
    const emptyEl = this.#root.querySelector(".sl-empty");
    rowsEl.innerHTML = "";

    if (activeMinutes === 0) {
      this.#root.style.display = "none";
      return;
    }
    this.#root.style.display = "";

    const entries = Object.entries(perService).filter(([name, v]) => {
      if (v.uptimePct === null) return false;
      if (selectedServices && !selectedServices.has(name)) return false;
      return true;
    });
    entries.sort((a, b) => a[1].uptimePct - b[1].uptimePct);

    if (entries.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    for (const [name, v] of entries) {
      const row = document.createElement("div");
      row.className = "sl-row";
      row.innerHTML = `
        <div class="sl-row-head">
          <span class="sl-name">${name}</span>
          <span class="sl-pct">${pct(v.uptimePct)}</span>
        </div>
        <div class="sl-cal">${this.#renderGrid(v.perDay)}</div>
      `;
      rowsEl.appendChild(row);
    }
  }

  #renderGrid(perDay) {
    if (!perDay.length) return "";
    const cells = [];
    const firstDow = dowOfDate(perDay[0].date);
    for (let i = 0; i < firstDow; i++) {
      cells.push(`<span class="sl-cell sl-cell-empty" aria-hidden="true"></span>`);
    }
    for (const d of perDay) {
      cells.push(
        `<button type="button" class="sl-cell sev-${d.severity}" ` +
        `data-date="${d.date}" data-sev="${d.severity}" ` +
        `data-down="${d.down}" data-active="${d.active}" ` +
        `aria-label="${fmtDate(d.date)}: ${SEV_LABEL[d.severity]}"></button>`
      );
    }
    return cells.join("");
  }

  #ensureTooltip() {
    let tip = document.querySelector(".sl-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "sl-tip";
      tip.setAttribute("role", "tooltip");
      tip.hidden = true;
      tip.innerHTML = `
        <div class="sl-tip-date"></div>
        <div class="sl-tip-row">
          <span class="sl-tip-dot"></span>
          <span class="sl-tip-sev"></span>
        </div>
        <div class="sl-tip-down"></div>
      `;
      document.body.appendChild(tip);
    }
    return tip;
  }

  #wireTooltip() {
    const root = this.#root;
    const tip = this.#tip;

    const show = (cell) => {
      const date = cell.dataset.date;
      const sev = cell.dataset.sev;
      const down = Number(cell.dataset.down || 0);
      tip.querySelector(".sl-tip-date").textContent = fmtDate(date);
      tip.querySelector(".sl-tip-sev").textContent = SEV_LABEL[sev] || sev;
      tip.querySelector(".sl-tip-down").textContent = fmtDuration(down);
      tip.querySelector(".sl-tip-dot").className = "sl-tip-dot sev-" + sev;
      tip.hidden = false;
      const rect = cell.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2 + window.scrollX;
      let top = rect.top - tipRect.height - 10 + window.scrollY;
      const maxLeft = window.scrollX + window.innerWidth - tipRect.width - 8;
      left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));
      if (top < window.scrollY + 8) {
        top = rect.bottom + 10 + window.scrollY;
      }
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    };
    const hide = () => { tip.hidden = true; };

    root.addEventListener("pointerover", (e) => {
      const cell = e.target.closest(".sl-cell:not(.sl-cell-empty)");
      if (cell) show(cell);
    });
    root.addEventListener("pointerout", (e) => {
      const cell = e.target.closest(".sl-cell:not(.sl-cell-empty)");
      if (!cell) return;
      const next = e.relatedTarget;
      if (next && next.closest && next.closest(".sl-cell:not(.sl-cell-empty)")) return;
      hide();
    });
    root.addEventListener("focusin", (e) => {
      const cell = e.target.closest(".sl-cell:not(.sl-cell-empty)");
      if (cell) show(cell);
    });
    root.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, { passive: true });
  }
}
