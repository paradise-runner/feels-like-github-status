import { SERVICES } from "../lib/services.js";

const CHIP_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"];

export class ServicesFilter {
  #root;
  #selected;
  #handlers = new Map();
  #chipEls = new Map();

  constructor(rootEl, { selected = new Set(SERVICES) } = {}) {
    this.#root = rootEl;
    this.#selected = new Set(selected);
    this.#render();
  }

  setSelected(selected) {
    this.#selected = new Set(selected);
    this.#refresh();
  }

  getSelected() {
    return new Set(this.#selected);
  }

  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
  }

  #emit() {
    for (const h of this.#handlers.get("change") ?? []) h(this.getSelected());
  }

  #render() {
    const root = this.#root;
    root.innerHTML = "";
    root.classList.add("services-filter");

    const chipRow = document.createElement("div");
    chipRow.className = "sf-row";
    for (const [idx, name] of SERVICES.entries()) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sf-chip";
      chip.textContent = name;
      chip.dataset.service = name;
      chip.setAttribute("aria-pressed", "false");
      chip.style.setProperty("--chip-color", `var(--day-${CHIP_COLORS[idx % CHIP_COLORS.length]})`);
      chipRow.appendChild(chip);
      this.#chipEls.set(name, chip);
    }
    root.appendChild(chipRow);

    const actions = document.createElement("div");
    actions.className = "sf-actions";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "sf-link";
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      this.#selected = new Set(SERVICES);
      this.#refresh();
      this.#emit();
    });
    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "sf-link";
    noneBtn.textContent = "None";
    noneBtn.addEventListener("click", () => {
      this.#selected = new Set();
      this.#refresh();
      this.#emit();
    });
    actions.append(allBtn, noneBtn);
    root.appendChild(actions);

    root.addEventListener("click", (e) => {
      const chip = e.target.closest(".sf-chip");
      if (!chip) return;
      const name = chip.dataset.service;
      if (this.#selected.has(name)) this.#selected.delete(name);
      else this.#selected.add(name);
      this.#refreshChip(name);
      this.#emit();
    });

    this.#refresh();
  }

  #refresh() {
    for (const name of SERVICES) this.#refreshChip(name);
  }

  #refreshChip(name) {
    const el = this.#chipEls.get(name);
    if (!el) return;
    const on = this.#selected.has(name);
    el.classList.toggle("is-on", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }
}
