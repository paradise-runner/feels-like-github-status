const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = { 0: "12am", 6: "6am", 12: "12pm", 18: "6pm" };

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
      c.textContent = HOUR_LABELS[h] ?? "";
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
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);

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
