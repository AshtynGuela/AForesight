/* DOM behavior tests without a browser or network. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
class Element {
  constructor(tag, text = "", className = "") {
    this.tag = tag;
    this.text = text;
    this.className = className;
    this.children = [];
    this.attrs = {};
    this.dataset = {};
  }
  append(...items) {
    for (const item of items) {
      if (item.parent)
        item.parent.children.splice(item.parent.children.indexOf(item), 1);
      item.parent = this;
      this.children.push(item);
    }
  }
  get firstChild() {
    return this.children[0];
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  querySelector() {
    return null;
  }
  set textContent(v) {
    this.text = v;
    this.children = [];
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join(" ");
  }
}
function setup({ offline = false, expired = false } = {}) {
  const nodes = new Map();
  const $ = (key) => {
    if (!nodes.has(key)) nodes.set(key, new Element("div"));
    return nodes.get(key);
  };
  const el = (tag, text = "", cls = "") => new Element(tag, text, cls);
  const page = $("#forecasts"),
    old = el("section", "Original comparison controls");
  page.append(old);
  const first = expired ? "2025-01-01" : "2026-11-07";
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.parse(first) + i * 86400000).toISOString().slice(0, 10),
    rain: 5,
    high: 30,
    low: 24,
    et0: 3,
    weather_code: 61,
  }));
  const state = {
    farm: {
      name: "Saved farm",
      municipality: "Legazpi",
      latitude: 13,
      longitude: 123,
    },
    forecast: {
      days,
      source: "Open-Meteo",
      retrieved_at: new Date().toISOString(),
    },
    climate: { demo: true, source: "Sample history" },
  };
  const checks = [
    {
      label: "Heat",
      status: "okay",
      title: "No heat flag",
      action: "Check field",
      detail: "Provider data",
    },
  ];
  let renderer, plotCall;
  const ctx = vm.createContext({
    $,
    el,
    state,
    navigator: { onLine: !offline },
    isoDay: () => "2026-11-07",
    friendlyDate: (d) => d,
    num: (v) => (v == null ? "—" : v.toFixed(1)),
    renderForecastLab: () => {
      $("#simple-weather-update").hidden = true;
    },
    registerPageView: (id, fn) => {
      renderer = fn;
      fn();
    },
    visibleHistory: () => days,
    plot: (...args) => {
      plotCall = args;
    },
    makeTable: () => el("table"),
    tab: () => {},
    assessFarm: () => ({ checks, note: "Weather-based check" }),
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../static/forecasts.js"), "utf8"),
    ctx,
  );
  const find = (node, cls) =>
    node.className === cls
      ? node
      : node.children.map((c) => find(c, cls)).find(Boolean);
  return {
    page,
    $,
    find: (cls) => find(page, cls),
    render: () => renderer(),
    get plotCall() {
      return plotCall;
    },
  };
}
test("new Forecast screen renders saved days, recommendations, history and keeps old tools", () => {
  const ui = setup();
  assert.equal(ui.find("fc-days").children.length, 7);
  assert.equal(ui.find("fc-recommendation-grid").children.length, 1);
  assert.match(ui.find("fc-tools").textContent, /Original comparison controls/);
  assert.match(ui.find("fc-source").textContent, /Sample history/);
  assert.equal(ui.$("#simple-weather-update").hidden, false);
  assert.equal(
    ui.find("fc-days").attrs["aria-label"],
    "Daily forecasts. Scroll sideways for all days.",
  );
  assert.equal(ui.plotCall[0], "#fc-history-chart");
});
test("expired forecasts stay readable and are explicitly marked as reference", () => {
  const ui = setup({ expired: true });
  assert.equal(ui.find("fc-days").children.length, 7);
  assert.match(ui.find("fc-status").textContent, /dates have passed/);
});
test("offline screen states it is using saved weather and history selector changes plotted data", () => {
  const ui = setup({ offline: true });
  assert.match(ui.find("fc-status").textContent, /Offline/);
  const select = ui.find("fc-variable").children[0];
  select.value = "temp";
  select.onchange();
  assert.equal(ui.plotCall[2], "Temperature (°C)");
});
