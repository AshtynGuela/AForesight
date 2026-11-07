"use strict";
const $ = (s) => document.querySelector(s);
const crops = ["rice", "corn", "mungbean", "sweet potato"];
const CACHE = "agriforesight-state-v1",
  QUEUE = "agriforesight-queue-v1";
let state,
  syncing = false,
  farmDirty = false,
  latestModel = null,
  compareProvider = null,
  modelRequest = 0,
  latestActions = null,
  periodDirty = false;
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
const num = (value, digits = 1) =>
  value == null ? "—" : Number(value).toFixed(digits);
// Screens register their renderer once; switching pages does not replace global functions.
const pageViews = new Map();
function registerPageView(id, renderView) {
  pageViews.set(id, renderView);
  if (state && document.body.dataset.page === id) renderView();
}
function renderActivePage() {
  pageViews.get(document.body.dataset.page)?.();
}
const noticeAnchor = document.createComment("Shared status message");
$("#notice").before(noticeAnchor);
function notice(text, error = false) {
  const banner = $("#notice");
  const journal = document.querySelector("#journal.workspace-panel");
  if (document.body.dataset.page === "journal" && journal)
    journal.prepend(banner);
  else noticeAnchor.after(banner);
  banner.textContent = text;
  banner.classList.toggle("error", error);
}
function syncAssistantLauncher() {
  const farmPage = $("#farm");
  const mapArea = farmPage.querySelector(".mf-map-area");
  const mapBounds = mapArea?.getBoundingClientRect();
  const mapVisible =
    mapBounds &&
    mapBounds.height > 0 &&
    mapBounds.top < innerHeight &&
    mapBounds.bottom > 0;
  const dock =
    document.body.dataset.page === "farm" &&
    !farmPage.classList.contains("mf-details-open") &&
    mapVisible
      ? $("#mf-map-actions")
      : null;
  const launcher = $("#chat-toggle");
  const target = dock || document.body;
  if (launcher.parentElement !== target) target.append(launcher);
}
function tab(id) {
  document.body.dataset.page = id;
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== id));
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
  notice("");
  syncAssistantLauncher();
  window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(renderActivePage);
}
document
  .querySelectorAll("[data-tab],[data-go]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab || b.dataset.go)));
document.querySelectorAll(".crop-options").forEach((s) =>
  crops.forEach((c) => {
    const o = el("option", c[0].toUpperCase() + c.slice(1));
    o.value = c;
    s.append(o);
  }),
);
function isoDay(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
$("#journal-date").value = isoDay();
$("#start-date").value = isoDay(-731);
$("#end-date").value = isoDay(-1);
async function api(path, data) {
  if (
    ["/api/crop-suggestions", "/api/crop-plan"].includes(path) &&
    state?.farm
  ) {
    const cacheKey =
      "agriforesight-crop-result-v1:" +
      JSON.stringify({
        path,
        data,
        farm: state.farm,
        forecast: state.forecast?.retrieved_at,
      });
    const cached = read(cacheKey, null);
    const savedResult = () => ({
      ...cached.result,
      warning:
        "Saved result from " +
        new Date(cached.saved_at).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
        }) +
        ". Recheck the weather before planting.",
    });
    if (!navigator.onLine) {
      if (cached) return savedResult();
      throw new Error(
        "No saved crop result for these details yet. Connect once to compare crops or create a calendar.",
      );
    }
    try {
      const result = await apiRequest(path, data);
      try {
        save(cacheKey, { result, saved_at: new Date().toISOString() });
      } catch {
        notice(
          "Crop result is visible, but device storage could not save it.",
          true,
        );
      }
      return result;
    } catch (error) {
      if (cached && (!error.status || error.status >= 500))
        return savedResult();
      throw error;
    }
  }
  if (path === "/api/forecast" && state?.farm) {
    const farm = { ...state.farm };
    state.forecast = farmForecasts.preferCached(farm, state.forecast);
    const result = await farmForecasts.load(
      farm,
      () => apiRequest(path, data),
      navigator.onLine,
    );
    if (samePoint(farm, state.farm)) {
      state.forecast = result.forecast;
      state.forecast_status = result.warning || "";
      try {
        save(CACHE, state);
      } catch {
        /* The store reports storage failures. */
      }
    }
    return result;
  }
  return apiRequest(path, data);
}
async function apiRequest(path, data) {
  const r = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(120000),
  });
  let result;
  try {
    result = await r.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!r.ok) {
    const error = new Error(
      result.error || "The request could not be completed.",
    );
    error.status = r.status;
    error.code = result.code;
    throw error;
  }
  return result;
}
function connected(yes) {
  $("#connection").textContent = yes ? "Connected" : "Saved records";
  $("#offline").hidden = yes;
}
async function run(button, task) {
  button.disabled = true;
  try {
    await task();
  } catch (e) {
    notice(e.message, true);
  } finally {
    button.disabled = false;
  }
}
function makeTable(headers, rows) {
  const wrap = el("div", undefined, "table-scroll"),
    t = el("table"),
    head = el("thead"),
    hr = el("tr"),
    body = el("tbody");
  headers.forEach((h) => {
    const th = el("th", h);
    th.scope = "col";
    hr.append(th);
  });
  head.append(hr);
  rows.forEach((cells) => {
    const tr = el("tr");
    cells.forEach((c) => tr.append(el("td", c)));
    body.append(tr);
  });
  t.append(head, body);
  wrap.append(t);
  return wrap;
}
function plot(target, series, unit, threshold = null) {
  const host = $(target);
  host.replaceChildren();
  const valid = series
    .flatMap((s) => s.points)
    .filter((p) => p.value != null && Number.isFinite(p.value));
  if (!valid.length) return host.append(el("p", "No matching values to plot."));
  const dates = [...new Set(valid.map((p) => p.date))].sort(),
    times = dates.map((d) => Date.parse(d + "T12:00:00Z")),
    start = Math.min(...times),
    end = Math.max(...times);
  let lo = Math.min(...valid.map((p) => p.value), threshold ?? Infinity),
    hi = Math.max(...valid.map((p) => p.value), threshold ?? -Infinity);
  if (unit.includes("mm")) lo = Math.min(0, lo);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.12;
  hi += pad;
  if (lo !== 0) lo -= pad;
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 760 260");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    series.map((s) => s.name).join(" and ") +
      " · " +
      unit +
      " · exact values in the table",
  );
  const add = (name, attrs, text) => {
    const n = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  const x = (d) =>
      58 +
      ((Date.parse(d + "T12:00:00Z") - start) /
        Math.max(86400000, end - start)) *
        680,
    y = (v) => 218 - ((v - lo) / (hi - lo)) * 185;
  for (let i = 0; i <= 4; i++) {
    const value = lo + ((hi - lo) * i) / 4;
    add("line", {
      x1: 58,
      x2: 738,
      y1: y(value),
      y2: y(value),
      stroke: "#e1e8df",
    });
    add(
      "text",
      {
        x: 49,
        y: y(value) + 4,
        "text-anchor": "end",
        fill: "#647368",
        "font-size": 11,
      },
      value.toFixed(1),
    );
  }
  add("text", { x: 58, y: 16, fill: "#647368", "font-size": 11 }, unit);
  for (const d of [dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)])
    add(
      "text",
      {
        x: x(d),
        y: 244,
        "text-anchor":
          d === dates[0] ? "start" : d === dates.at(-1) ? "end" : "middle",
        fill: "#647368",
        "font-size": 11,
      },
      d,
    );
  if (threshold != null)
    add("line", {
      x1: 58,
      x2: 738,
      y1: y(threshold),
      y2: y(threshold),
      stroke: "#bd7c36",
      "stroke-dasharray": "5 4",
    });
  series.forEach((s) => {
    let segments = [],
      current = [],
      previous = null;
    for (const p of [...s.points].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      if (p.value == null || !Number.isFinite(p.value)) {
        if (current.length) segments.push(current);
        current = [];
        previous = null;
        continue;
      }
      if (previous && Date.parse(p.date) - Date.parse(previous) > 86400000) {
        segments.push(current);
        current = [];
      }
      current.push(p);
      previous = p.date;
    }
    if (current.length) segments.push(current);
    segments.forEach((segment) => {
      add("polyline", {
        points: segment.map((p) => `${x(p.date)},${y(p.value)}`).join(" "),
        fill: "none",
        stroke: s.color,
        "stroke-width": 2.5,
      });
      if (segment.length <= 14)
        segment.forEach((p) =>
          add("circle", { cx: x(p.date), cy: y(p.value), r: 3, fill: s.color }),
        );
    });
  });
  host.append(svg);
}
function actions(target, data) {
  const box = $(target);
  box.replaceChildren();
  let more;
  for (const [i, a] of (data || []).entries()) {
    if (i === 4) {
      more = el("details", undefined, "more-actions");
      more.append(el("summary", `More field checks (${data.length - 4})`));
      box.append(more);
    }
    const card = el("article");
    card.append(
      el("span", a.priority || "Check", "pill"),
      el("h3", a.title),
      el("p", a.action),
    );
    if (a.when) card.append(el("p", "When: " + a.when, "source"));
    if (a.context) card.append(el("p", a.context, "context-note"));
    const detail = el("details");
    detail.append(el("summary", "Why this advice?"), el("p", a.why));
    if (a.basis) detail.append(el("p", a.basis, "source"));
    if (a.reference) {
      const link = el("a", a.reference.title);
      link.href = a.reference.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      detail.append(link);
    }
    card.append(detail);
    (i >= 4 ? more : box).append(card);
  }
}

function visibleHistory() {
  const p = state?.analysis_period;
  return p
    ? state.climate.days.filter((d) => p.start <= d.date && d.date <= p.end)
    : state.climate.days;
}
function rainfallSummary(days, start, end) {
  const byDate = new Map();
  for (const d of days) {
    if (
      typeof d.date === "string" &&
      Number.isFinite(Date.parse(d.date + "T00:00:00Z")) &&
      typeof d.rain === "number" &&
      Number.isFinite(d.rain) &&
      d.rain >= 0 &&
      (!start || d.date >= start) &&
      (!end || d.date <= end)
    )
      byDate.set(d.date, d);
  }
  const valid = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  start = start || valid[0]?.date;
  end = end || valid.at(-1)?.date;
  const expected =
    start && end
      ? Math.round(
          (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
            86400000,
        ) + 1
      : 0;
  let longest = 0,
    run = 0,
    runStart = null,
    dryStart = null,
    dryEnd = null,
    previous = null,
    heaviest = null;
  for (const d of valid) {
    if (
      previous === null ||
      Date.parse(d.date + "T00:00:00Z") -
        Date.parse(previous + "T00:00:00Z") !==
        86400000
    )
      run = 0;
    if (d.rain < 1) {
      if (run === 0) runStart = d.date;
      run++;
      if (run > longest) {
        longest = run;
        dryStart = runStart;
        dryEnd = d.date;
      }
    } else run = 0;
    if (!heaviest || d.rain > heaviest.rain) heaviest = d;
    previous = d.date;
  }
  return {
    days: valid,
    start,
    end,
    expected,
    missing: Math.max(0, expected - valid.length),
    total: valid.length ? valid.reduce((sum, d) => sum + d.rain, 0) : null,
    longest,
    dryStart,
    dryEnd,
    heaviest,
  };
}
function renderRainfall(history, future, period) {
  const forecast = !period && future.length > 0;
  const rows = forecast ? future : history;
  const start = period?.start || rows[0]?.date,
    end = period?.end || rows.at(-1)?.date;
  const r = rainfallSummary(rows, start, end);
  const format = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const range =
    r.start && r.end
      ? format.formatRange(
          new Date(r.start + "T00:00:00Z"),
          new Date(r.end + "T00:00:00Z"),
        )
      : "No daily data";
  $("#rain-label").textContent =
    `Total ${forecast ? "forecast " : ""}rainfall · ${range}`;
  $("#rain-stat").textContent = r.total === null ? "—" : num(r.total) + " mm";
  $("#rain-caption").textContent = r.missing
    ? `Partial total · ${r.days.length} of ${r.expected} days available`
    : `Sum of ${r.days.length} daily amounts${forecast ? " · model forecast" : ""}`;
  $("#rainfall-source").textContent =
    `${forecast ? state.forecast.source : state.climate.source} · ${range}. ${r.missing ? r.missing + " missing day(s); gaps break dry-spell counts. " : ""}Rainfall depth is accumulated over these dates, not standing water in the field.`;
  $("#dry-spell-value").textContent =
    r.total === null ? "—" : `${r.longest} day${r.longest === 1 ? "" : "s"}`;
  $("#dry-spell-label").textContent =
    `Longest ${forecast ? "forecast " : r.missing ? "observed " : ""}dry spell`;
  $("#dry-spell-caption").textContent = r.longest
    ? `${r.dryStart} to ${r.dryEnd} · less than 1 mm each day`
    : "Days in a row with less than 1 mm of rain";
  $("#heaviest-rain-value").textContent = r.heaviest
    ? num(r.heaviest.rain) + " mm"
    : "—";
  $("#heaviest-rain-caption").textContent = r.heaviest
    ? r.heaviest.date
    : "No daily reading available";
  plot(
    "#overview-rainfall-chart",
    [
      {
        name: forecast ? "Daily forecast rainfall" : "Daily rainfall",
        color: "#356b50",
        points: r.days.map((d) => ({ date: d.date, value: d.rain })),
      },
    ],
    "Daily rainfall mm",
  );
  $("#overview-rainfall-readings").replaceChildren(
    makeTable(
      ["Date", "Rainfall (mm/day)"],
      r.days.map((d) => [d.date, num(d.rain)]),
    ),
  );
}
function provenance() {
  const c = state.climate;
  if (!c.days.length)
    return "No sourced weather downloaded for this field yet.";
  const p = state.analysis_period;
  return (
    (p
      ? `Analysis ${p.start} to ${p.end} · ${visibleHistory().length} available days. Training data: `
      : "") +
    `${c.source} · ${c.days[0].date} to ${c.days.at(-1).date} · ${c.days.length} valid days · ${c.missing_days} missing in the requested window`
  );
}
function render() {
  $("#demo-banner").hidden = !state.demo_mode;
  const { farm, recommendation: r } = state;
  $("#farm-title").textContent = `${farm.name} · ${farm.municipality}`;
  const period = state.analysis_period;
  const future = period
    ? []
    : (state.forecast?.days || []).filter((d) => d.date >= isoDay());
  const temps = future.map((d) => d.temp).filter((v) => v != null);
  $("#temp-stat").textContent =
    num(
      temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : r.temp,
    ) + " °C";
  $("#temp-label").textContent = temps.length
    ? "Average forecast temperature"
    : "Average past temperature";
  $("#temp-caption").textContent = temps.length
    ? "Open-Meteo model output"
    : "For the past dates you picked";
  $("#shared-context").textContent =
    `${farm.name} · ${farm.municipality} · ${period ? period.start + " to " + period.end : "No past dates picked"}`;
  if (period && !periodDirty) {
    $("#period-start").value = period.start;
    $("#period-end").value = period.end;
    $("#period-form").elements.provider.value = period.provider;
    $("#period-panel").open = false;
  }
  $("#ph-stat").textContent = farm.ph ?? "Not recorded";
  $("#soil-status").textContent = farm.sample_date
    ? "Sample: " + farm.sample_date
    : "No sample date yet";
  $("#provenance").textContent = provenance();
  $("#history-note").textContent = r.history_note;
  actions("#recommendations", r.actions);
  if (!farmDirty) {
    for (const [k, v] of Object.entries(farm)) {
      const f = $("#farm-form").elements.namedItem(k);
      if (f) f.type === "checkbox" ? (f.checked = v) : (f.value = v ?? "");
    }
  }
  const summary = $("#farm-summary");
  summary.replaceChildren(
    el(
      "span",
      farm.location ? "Location found" : "Check this location",
      "pill",
    ),
    el(
      "p",
      `${farm.crop} · ${{ establishment: "newly planted", vegetative: "growing leaves", flowering: "flowering", maturity: "nearing harvest" }[farm.crop_stage] || "stage unknown"} · ${farm.area} ha · ${farm.water}`,
    ),
    el(
      "p",
      farm.location
        ? [
            farm.location.municipality,
            farm.location.province,
            farm.location.region,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Check the coordinates in My farm & soil.",
      "source",
    ),
  );
  if (
    $("#model-dataset").value === "current" &&
    $("#model-mode").value === "forward" &&
    $("#model-method").value === "auto"
  )
    latestModel = state.internal;
  renderActivePage();
}
function renderHistory() {
  if (!state) return;
  $("#chart-source").textContent = provenance();
  const rows = document.createDocumentFragment();
  visibleHistory().forEach((d) => {
    const tr = el("tr");
    [d.date, num(d.rain), num(d.temp)].forEach((v) => tr.append(el("td", v)));
    const cell = el("td"),
      button = el("button", "Edit", "secondary");
    button.type = "button";
    button.onclick = () => {
      const f = $("#weather-record-form");
      f.elements.date.value = d.date;
      f.elements.temp.value = d.temp;
      f.elements.rain.value = d.rain;
      f.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    cell.append(button);
    cell.hidden = true;
    tr.append(cell);
    rows.append(tr);
  });
  $("#climate-rows").replaceChildren(rows);

  const v = $("#history-variable").value;
  plot(
    "#history-chart",
    [
      {
        name: "Historical reference",
        color: "#356b50",
        points: visibleHistory().map((d) => ({ date: d.date, value: d[v] })),
      },
    ],
    v === "rain" ? "Rain mm/day" : "Mean temperature °C",
  );
}
$("#history-variable").onchange = renderHistory;
async function refresh() {
  state = await api("/api/state");
  try {
    state.journals = farmJournal.merge(
      state.journals,
      state.deleted_journal_ids,
    );
  } catch {
    notice("Device storage is full. Export your notes for a backup.", true);
  }
  state.climate = farmHistory.preferCached(state.farm, state.climate);
  if (state.internal?.demo) state.internal = null;
  if (state.analysis?.internal?.demo) state.analysis = null;
  state.forecast = farmForecasts.preferCached(state.farm, state.forecast);
  const preferredConditions = farmConditions.preferCached(
    state.farm,
    state.current_conditions,
  );
  if (preferredConditions !== state.current_conditions) {
    state.current_conditions = preferredConditions;
    state.current_conditions_status = null;
  }
  try {
    save(CACHE, state);
  } catch {
    notice("Browser storage is full. Export records before closing.", true);
  }
  connected(true);
  render();
  if (!state.climate.days.length && navigator.onLine) ensureSourcedHistory();
}
let historyLoading = false;
const historyAttempts = new Map();
async function ensureSourcedHistory(manual = false) {
  if (!state || historyLoading || !navigator.onLine) return;
  const point = state.farm.latitude + ":" + state.farm.longitude;
  if (!manual && Date.now() - (historyAttempts.get(point) || 0) < 300000)
    return;
  historyAttempts.set(point, Date.now());
  historyLoading = true;
  notice("Downloading sourced weather history for your saved field…");
  try {
    await api("/api/history/sourced", {});
    await refresh();
    notice("Sourced history saved here for offline reading.");
  } catch (error) {
    notice(error.message + " No sample values are substituted.", true);
  } finally {
    historyLoading = false;
  }
}
$("#farm-form").addEventListener("input", (event) => {
  if (event.target.name) farmDirty = true;
});
$("#farm-form").onsubmit = (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  run(form.querySelector('button[type="submit"]'), async () => {
    const data = Object.fromEntries(new FormData(form));
    data.ash = form.elements.ash.checked;
    await api("/api/profile", data);
    farmDirty = false;
    await refresh();
    notice("Farm saved. Weather and advice now use this profile.");
  });
};
$("#climate-form").onsubmit = (e) => {
  e.preventDefault();
  run(e.currentTarget.querySelector("button"), async () => {
    notice("Loading NASA POWER history…");
    await api("/api/climate", Object.fromEntries(new FormData(e.target)));
    latestModel = null;
    await refresh();
    notice("History loaded. Fit the forecast again to use these records.");
  });
};
$("#recent-history").onclick = () => {
  $("#start-date").value = isoDay(-731);
  $("#end-date").value = isoDay(-1);
  notice(
    "Two-year window selected. Choose Load historical weather to retrieve it.",
  );
};
$("#demo").onclick = (e) =>
  run(e.target, async () => {
    await api("/api/climate", { mode: "demo" });
    await refresh();
    notice("Example loaded.");
  });
$("#import-history").onclick = (e) =>
  run(e.target, async () => {
    const file = $("#history-file").files[0];
    if (!file) throw new Error("Choose a CSV file first.");
    if (file.size > 300000) throw new Error("Use a CSV smaller than 300 KB.");
    await api("/api/history/import", { csv: await file.text() });
    await refresh();
    notice(
      "Daily records imported for the saved farm. Review the source and dates.",
    );
  });
$("#build-model").onclick = (e) =>
  run(e.target, async () => {
    notice("Building the forecast and checking it against past weather…");
    const selected = $("#model-dataset").value,
      requestId = ++modelRequest;
    const result = await api("/api/model", {
      dataset: selected,
      mode: $("#model-mode").value,
      method: $("#model-method").value,
      start: $("#period-start").value,
      end: $("#period-end").value,
    });
    if (requestId !== modelRequest || selected !== $("#model-dataset").value)
      return;
    latestModel = result.internal;
    compareProvider = result.provider;
    latestActions = result.actions;
    if (
      $("#model-dataset").value === "current" &&
      latestModel.mode === "forward" &&
      latestModel.method_override === "auto"
    ) {
      state.internal = latestModel;
      state.saved_evaluation = result.saved_evaluation;
      save(CACHE, state);
    }
    renderForecastLab();
    notice("Forecast ready. The dates and test results are below.");
  });
$("#model-dataset").onchange = () => {
  modelRequest++;
  latestModel =
    $("#model-dataset").value === "current" &&
    $("#model-mode").value === "forward"
      ? state?.internal
      : null;
  compareProvider = null;
  latestActions = null;
  renderForecastLab();
};
$("#forecast-variable").onchange = renderForecastLab;
function renderForecastLab() {
  if (!state) return;
  $("#load-comparison").disabled = $("#model-mode").value !== "replay";
  const m = latestModel;
  const provider =
    m?.mode === "replay"
      ? compareProvider
      : m
        ? samePoint(m, state.farm)
          ? state.forecast
          : compareProvider
        : $("#model-mode").value === "replay"
          ? compareProvider
          : $("#model-dataset").value === "current"
            ? state.forecast
            : null;
  const metrics = $("#model-metrics");
  metrics.replaceChildren();
  const status = $("#model-status");
  if (!m) {
    status.textContent =
      "Build a forecast using your saved weather, or try a sample.";
  } else if (m.status !== "ready") {
    status.textContent = m.message;
  } else {
    const q = m.quality;
    status.textContent =
      `${m.demo ? "Example · " : ""}${m.source} · ${q.valid_days} valid days · ${q.missing_days} gaps · ${m.mode === "replay" ? "method selection through" : "input ends"} ${q.training_end}. ${q.trailing_days_excluded || 0} trailing calendar day(s) excluded. ` +
      (m.ridge_eligible
        ? "Ridge regression and the 14-day mean were compared."
        : "Using a baseline: ridge needs at least 365 valid non-synthetic days.");
  }
  if (m?.status === "ready") {
    const chosen = Object.entries(m.evaluation)
      .map(([k, v]) => `${k}: ${v.selected}`)
      .join(" · ");
    status.textContent +=
      (m.mode === "replay"
        ? " Rolling one-day-ahead test " +
          m.period.start +
          " to " +
          m.period.end +
          ". "
        : " Forward 7-day outlook. ") +
      chosen +
      ". " +
      (m.mode !== "replay" &&
      Object.values(m.evaluation).some((v) => v.selected === "baseline")
        ? "The mean benchmark repeats a value across horizons; use historical test mode for day-by-day testing or select a regression override. "
        : "") +
      (m.method_override !== "auto"
        ? "Manual method override; not the automatic winner."
        : "");
  }
  actions("#model-actions", latestActions || state.recommendation.actions);
  const replayBox = $("#replay-metrics");
  replayBox.replaceChildren();
  if (m?.replay_metrics) {
    replayBox.append(
      el("p", m.message),
      makeTable(
        ["Variable", "Matched days", "MAE", "RMSE"],
        Object.entries(m.replay_metrics)
          .filter(([, v]) => v)
          .map(([k, v]) => [k, v.n, num(v.mae, 3), num(v.rmse, 3)]),
      ),
    );
  } else
    replayBox.append(
      el(
        "p",
        "Pick a past-date test to see how each day’s prediction compares with the saved weather.",
      ),
    );
  const own = new Map((m?.days || []).map((d) => [d.date, d])),
    external = new Map((provider?.days || []).map((d) => [d.date, d]));
  const dates = [...new Set([...own.keys(), ...external.keys()])].sort();
  const variable = $("#forecast-variable").value;
  plot(
    "#comparison-chart",
    [
      {
        name: "Internal",
        color: "#28604a",
        points: dates.map((date) => ({
          date,
          value: own.get(date)?.[variable],
        })),
      },
      {
        name: "Open-Meteo",
        color: "#bc7738",
        points: dates.map((date) => ({
          date,
          value: external.get(date)?.[variable],
        })),
      },
      {
        name: "Historical reference",
        color: "#73869a",
        points: dates.map((date) => ({
          date,
          value: own.get(date)?.["actual_" + variable],
        })),
      },
    ],
    variable === "temp" ? "Mean temperature °C" : "Rain mm/day",
  );
  const box = $("#forecast-comparison");
  box.replaceChildren();
  if (
    own.size &&
    external.size &&
    ![...own.keys()].some((d) => external.has(d))
  )
    box.append(
      el(
        "p",
        "These forecasts cover different dates. Load newer weather records to compare the same days.",
        "inline-status",
      ),
    );
  if (dates.length) {
    const rows = dates.map((date) => {
      const a = own.get(date),
        b = external.get(date);
      const gap =
        a?.[variable] != null && b?.[variable] != null
          ? a[variable] - b[variable]
          : null;
      const range = a?.[variable + "_range"];
      return [
        date,
        num(a?.[variable], 2),
        num(a?.["actual_" + variable], 2),
        a?.[variable] != null && a?.["actual_" + variable] != null
          ? num(a[variable] - a["actual_" + variable], 2)
          : "—",
        num(b?.[variable], 2),
        num(gap, 2),
        range ? range.map((v) => num(v)).join(" to ") : "Unavailable",
      ];
    });
    box.append(
      makeTable(
        [
          "Date",
          "Internal",
          "Reference",
          "Internal − reference",
          "Open-Meteo",
          "Internal − Open-Meteo",
          "Error range",
        ],
        rows,
      ),
      el(
        "p",
        "A blank means there’s no value. App forecast minus past weather shows the error against those records. A difference between forecasts doesn’t tell us which is right. Archived output combines runs with different lead times.",
        "source",
      ),
    );
  } else
    box.append(
      el(
        "p",
        "Update the weather or build an app forecast to see the daily numbers.",
      ),
    );
  if (m?.evaluation) {
    const rows = [];
    for (const [key, label] of [
      ["temp", "Temperature °C"],
      ["rain", "Rain mm/day"],
    ]) {
      const e = m.evaluation[key];
      for (const method of ["baseline", "ridge"]) {
        const t = e.holdout[method],
          v = e.selection_mae[method];
        if (t)
          rows.push([
            label,
            method + (e.selected === method ? " · selected" : ""),
            num(v?.mae, 3),
            num(t.mae, 3),
            num(t.rmse, 3),
            num(t.bias, 3),
            t.n,
          ]);
      }
    }
    metrics.append(
      rows.length
        ? makeTable(
            [
              "Variable",
              "Method",
              "Validation MAE",
              "Test MAE",
              "Test RMSE",
              "Test bias",
              "Test pairs",
            ],
            rows,
          )
        : el(
            "p",
            "The past-weather test needs at least 180 calendar days, with enough complete weather records.",
          ),
    );
    const rain = m.evaluation.rain.holdout[m.evaluation.rain.selected];
    if (rain?.mape != null)
      metrics.append(
        el(
          "p",
          `Rain MAPE on reference days ≥1 mm: ${rain.mape}% (${rain.mape_excluded} dry/light-rain pairs excluded). MAE and RMSE use all pairs. MAPE is not computed for Celsius temperature.`,
          "source",
        ),
      );
    metrics.append(el("p", m.range_note, "source"));
  } else metrics.append(el("p", "Build the forecast to see its test results."));
  renderArchive();
  renderProvider();
  renderSimpleForecast();
}
function renderArchive() {
  const target = $("#archive-evaluation"),
    a = state.saved_evaluation;
  target.replaceChildren();
  if (!a?.matched_forecasts)
    return target.append(
      el(
        "p",
        "No matching results yet. Save both forecasts before the dates they predict, then load the weather records after those dates.",
      ),
    );
  const rows = [];
  for (const kind of ["internal", "open_meteo"])
    for (const key of ["temp", "rain"]) {
      const s = a.scores[kind][key];
      if (s) rows.push([kind, key, s.n, num(s.mae, 3), num(s.rmse, 3)]);
    }
  target.append(
    el(
      "p",
      `${a.matched_forecasts} paired issue/target records across ${a.unique_target_days} target dates. Reference: ${a.reference}`,
    ),
    makeTable(["Forecast", "Variable", "Pairs", "MAE", "RMSE"], rows),
  );
}
function renderProvider() {
  const historical = $("#model-mode").value === "replay";
  const box = $("#forecast-result"),
    f = historical ? compareProvider : state.forecast;
  box.replaceChildren();
  if (!f)
    return box.append(
      el(
        "p",
        historical
          ? "Load the past comparison to see its daily numbers."
          : "No Open-Meteo forecast saved yet. Tap Update above.",
      ),
    );
  const age = Date.now() - Date.parse(f.retrieved_at);
  box.append(
    el(
      "p",
      `${age > 10800000 ? "Older forecast — update it before making plans. " : ""}Retrieved ${new Date(f.retrieved_at).toLocaleString()} · Asia/Manila · approximate model elevation ${num(f.elevation, 0)} m`,
      "source",
    ),
    makeTable(
      ["Date", "Mean °C", "Low / high °C", "Rain mm", "Chance", "ET₀ mm"],
      f.days.map((d) => [
        d.date,
        num(d.temp),
        `${num(d.low)} / ${num(d.high)}`,
        num(d.rain),
        d.probability == null ? "—" : d.probability + "%",
        num(d.et0),
      ]),
    ),
  );
}
async function updateFarmWeather(button) {
  await run(button, async () => {
    notice("Getting your farm’s weather…");
    const result = await api("/api/forecast", {});
    render();
    notice(
      result.warning ||
        "Weather saved on this device. Farm Performance uses the same forecast.",
    );
  });
}
$("#load-forecast").onclick = (e) => updateFarmWeather(e.target);
$("#simple-weather-update").onclick = (e) => updateFarmWeather(e.target);
let weatherView = "next";
function friendlyDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function renderSimpleForecast() {
  if (!state) return;
  const past = weatherView === "past",
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const forecast = farmForecasts.preferCached(state.farm, state.forecast);
  if (forecast) state.forecast = forecast;
  const upcoming = (forecast?.days || [])
    .filter((d) => d.date >= today)
    .slice(0, 7);
  const days = past
    ? visibleHistory()
    : upcoming.length
      ? upcoming
      : forecast?.days || [];
  const summary = $("#simple-weather-summary"),
    box = $("#simple-weather-days");
  summary.replaceChildren();
  box.replaceChildren();
  if (!past) {
    summary.append(
      el(
        "p",
        !navigator.onLine
          ? "Offline · saved forecast"
          : forecast
            ? "Saved forecast for this field"
            : "No forecast downloaded yet",
        "context-note",
      ),
    );
    if (state.forecast_status)
      summary.append(el("p", state.forecast_status, "context-note"));
    if (forecast && !upcoming.length)
      summary.append(
        el(
          "p",
          "These forecast dates have passed. They are kept for reference, not today's weather.",
          "context-note",
        ),
      );
    const assessment = assessFarm(state);
    summary.append(el("strong", assessment.title), el("p", assessment.action));
  }
  $("#weather-next").className = past ? "secondary" : "";
  $("#weather-past").className = past ? "" : "secondary";
  $("#simple-weather-update").hidden = past;
  $("#simple-weather-dates").hidden = !past;
  summary.append(
    el(
      "h2",
      past
        ? "Past weather — just for trying things out"
        : upcoming.length
          ? "Next 7 days at your farm"
          : forecast
            ? "Saved forecast · original dates"
            : "Next 7 days at your farm",
    ),
  );
  if (past && state.analysis_period) {
    const expected =
      Math.round(
        (Date.parse(state.analysis_period.end) -
          Date.parse(state.analysis_period.start)) /
          86400000,
      ) + 1;
    if (days.length < expected)
      summary.append(
        el(
          "p",
          `${expected - days.length} day(s) are missing from the selected dates. Load the missing weather before trying a water plan.`,
          "context-note",
        ),
      );
  }
  if (!days.length)
    summary.append(
      el(
        "p",
        past
          ? "Pick some past dates to see the weather."
          : "No upcoming weather saved yet. Go online and tap Update weather.",
      ),
    );
  else {
    summary.append(
      el(
        "p",
        friendlyDate(days[0].date) + " to " + friendlyDate(days.at(-1).date),
      ),
    );
    if (!past && Date.now() - Date.parse(forecast.retrieved_at) > 172800000)
      summary.append(
        el(
          "p",
          "This weather is over two days old. Give it an update before making plans.",
          "context-note",
        ),
      );
    let more;
    days.forEach((d, i) => {
      if (i === 7) {
        more = el("details", undefined, "more-weather");
        more.append(el("summary", `See the remaining ${days.length - 7} days`));
        box.append(more);
      }
      const card = el("article", undefined, "weather-day");
      card.append(
        el("h3", friendlyDate(d.date)),
        el(
          "strong",
          d.rain == null
            ? "No rain estimate"
            : d.rain < 1
              ? "Little rain"
              : num(d.rain) + " mm rain",
        ),
        el(
          "p",
          d.low != null && d.high != null
            ? num(d.low, 0) + "–" + num(d.high, 0) + " °C"
            : num(d.temp) + " °C average",
        ),
      );
      if (d.probability != null)
        card.append(el("small", d.probability + "% chance of rain"));
      (i >= 7 ? more : box).append(card);
    });
  }
  const source = $("#simple-weather-source");
  source.replaceChildren(
    el(
      "p",
      past
        ? "Past recorded weather from " +
            state.climate.source +
            ". This is past weather, rather than a forecast."
        : forecast
          ? forecast.source +
            " · saved " +
            new Date(forecast.retrieved_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            }) +
            " (Philippine time). Rain amounts are estimates. A nearby farm can get different rain."
          : "Tap Update weather to get a forecast for your farm.",
    ),
  );
  actions(
    "#forecast-actions",
    past
      ? state.recommendation.actions
      : assessFarm(state).checks.map((check) => ({
          title: check.title,
          action: check.action,
          why: check.detail,
          priority:
            check.status === "attention"
              ? "Check your field"
              : check.status === "okay"
                ? "Keep checking"
                : "Data needed",
          context: "Uses the same saved forecast as Farm Performance.",
          basis: assessFarm(state).period,
          reference: check.sources[0],
        })),
  );
}
$("#weather-next").onclick = () => {
  weatherView = "next";
  renderActivePage();
};
$("#weather-past").onclick = () => {
  weatherView = "past";
  renderActivePage();
};
$("#simple-weather-dates").onclick = () => {
  $("#period-panel").open = true;
  $("#period-panel").scrollIntoView({ behavior: "smooth" });
};
function savedJournalNotes() {
  return farmJournal.notes(
    state?.journals ?? farmJournal.archived(),
    read(QUEUE, []),
  );
}
function journalAction(note) {
  if (note.technique !== "Field note via assistant" || !note.note)
    return note.technique;
  const words = note.note.trim().replace(/\s+/g, " ");
  return words.length <= 120 ? words : words.slice(0, 119).trimEnd() + "…";
}
function renderJournal() {
  const notes = savedJournalNotes();
  const list = $("#journal-list");
  list.replaceChildren();
  if (document.querySelector("#journal.workspace-panel")) {
    const waiting = new Set(read(QUEUE, []).map((note) => note.id)).size;
    $("#queue-status").textContent =
      `${notes.length} saved ${notes.length === 1 ? "entry" : "entries"}` +
      (waiting ? ` · ${waiting} waiting to sync` : "");
    $("#sync").hidden = !waiting;
    const table = makeTable(
      ["", "Date", "Crop", "Field", "What did you try?", "Result"],
      notes.map((j) => [
        "",
        j.date,
        j.crop,
        j.field || j.farm_context?.name || "—",
        journalAction(j),
        {
          unobserved: "Too early to tell",
          better: "Good",
          same: "Fair",
          worse: "Worse",
        }[j.outcome] || j.outcome,
      ]),
    );
    const grid = table.querySelector("table");
    grid.className = "wj-notes-table";
    grid.setAttribute("aria-label", "Saved field notes");
    const columns = el("colgroup");
    for (const width of [59, 61, 62, 61, 148, 59]) {
      const col = el("col");
      col.style.width = (width / 450) * 100 + "%";
      columns.append(col);
    }
    grid.prepend(columns);
    grid.querySelector("th").setAttribute("aria-label", "Field photo");
    const rows = table.querySelectorAll("tbody tr");
    notes.forEach((j, i) => {
      const row = rows[i];
      const cells = row.children;
      const openNote = el("button", cells[4].textContent, "wj-note-open");
      openNote.type = "button";
      openNote.dataset.noteId = j.id;
      openNote.setAttribute(
        "aria-label",
        `Open note from ${j.date}: ${openNote.textContent}`,
      );
      openNote.onclick = () => openJournalNote(j);
      cells[4].replaceChildren(openNote);
      row.onclick = (event) => {
        if (
          !event.target.closest("button") &&
          !window.getSelection()?.toString()
        )
          openNote.click();
      };
      const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j.date);
      if (dateParts) {
        const time = el(
          "time",
          `${dateParts[2]}-${dateParts[3]}-${dateParts[1]}`,
        );
        time.dateTime = j.date;
        cells[1].replaceChildren(time);
      }
      cells[2].textContent = j.crop[0].toUpperCase() + j.crop.slice(1);
      const badge = el("span", undefined, "wj-result");
      badge.dataset.outcome = j.outcome;
      if (j.outcome === "better") badge.title = "Better than expected";
      if (j.outcome === "same") badge.title = "As expected";
      if (["better", "same", "worse"].includes(j.outcome)) {
        const icon = el("img");
        icon.src =
          "/static/journal-assets/" +
          (j.outcome === "better" ? "result-good.svg" : "result-fair.svg");
        icon.alt = "";
        badge.append(icon);
      }
      badge.append(el("span", cells[5].textContent));
      cells[5].replaceChildren(badge);
      if (j.photo_id)
        farmJournal
          .photo(j.photo_id)
          .then((file) => {
            if (!file) return;
            const img = el("img");
            img.className = "wj-note-photo";
            const url = URL.createObjectURL(file);
            img.alt = "";
            const crop = farmJournal.preview(j.photo_id);
            journalPhotos.frame(img, crop);
            img.onload = img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
            const view = el("button", undefined, "wj-photo-button");
            view.type = "button";
            view.setAttribute(
              "aria-label",
              `View field photo from ${j.date} and adjust preview`,
            );
            view.append(img);
            view.onclick = () => journalPhotos.open(j.photo_id, img);
            rows[i].firstChild.append(view);
          })
          .catch(() => {});
    });
    list.append(table);
    if (!notes.length)
      list.append(el("p", "No saved entries yet.", "wj-saved-empty"));
    return;
  }
  for (const j of notes) {
    const c = el("article");
    c.append(
      el("span", j.pending ? "Pending sync" : j.date, "pill"),
      el("h3", `${j.crop} · ${j.technique}`),
      el("p", j.note),
      el(
        "p",
        `Outcome: ${j.outcome}${j.yield_kg != null && j.yield_kg !== "" ? " · Harvest: " + j.yield_kg + " kg" : ""}`,
        "why",
      ),
    );
    list.append(c);
  }
  if (!list.children.length) list.append(el("p", "No notes yet."));
}
async function sync() {
  if (syncing) return;
  syncing = true;
  let synced = false;
  try {
    let item = read(QUEUE, [])[0];
    const changed = Boolean(item);
    while (item) {
      const result = await api("/api/journal", item);
      const { operation, mutation_id, ...note } = item;
      if (operation && !result.journal && !result.deleted)
        throw new Error("Restart the app server to sync edits and deletions.");
      const saved = result.deleted
        ? farmJournal.merge([], [item.id])
        : farmJournal.merge([{ ...note, ...result.journal }]);
      if (state) state.journals = saved;
      save(
        QUEUE,
        read(QUEUE, []).filter(
          (j) => (j.mutation_id || j.id) !== (mutation_id || item.id),
        ),
      );
      item = read(QUEUE, [])[0];
    }
    await refresh();
    synced = true;
    if (changed && document.body.dataset.page === "journal")
      notice("Notes synced.");
  } catch (e) {
    renderJournal();
    notice("Your notes are still saved here: " + e.message, true);
  } finally {
    syncing = false;
    if (synced && navigator.onLine && read(QUEUE, []).length) void sync();
  }
}
function queueJournalChange(item) {
  save(QUEUE, [...read(QUEUE, []), item]);
}
$("#journal-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (f.dataset.saving) return;
  f.dataset.saving = "yes";
  const submit =
    document.querySelector('button[form="journal-form"][type="submit"]') ||
    f.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  const farm = state?.farm;
  const item = {
    ...Object.fromEntries(new FormData(f)),
    id: crypto.randomUUID(),
    recorded_at: new Date().toISOString(),
    farm_context: farm
      ? {
          name: farm.name,
          municipality: farm.municipality,
          latitude: farm.latitude,
          longitude: farm.longitude,
          crop_stage: farm.crop_stage || "unknown",
          planting_date: farm.planting_date || "",
        }
      : null,
  };
  try {
    const photo = $("#journal-photo")?.files[0];
    if (photo) {
      if (
        photo.size > 2 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(photo.type)
      )
        throw new Error("Choose a JPG, PNG or WebP photo up to 2 MB.");
      await farmJournal.photo(item.id, photo);
      farmJournal.preview(item.id, journalPhotos.draftPreview());
      item.photo_id = item.id;
    }
    queueJournalChange(item);
    let archiveWarning = "";
    try {
      farmJournal.merge([item]);
    } catch {
      archiveWarning =
        " The sync queue is saved, but the extra local archive is full. Export a backup.";
    }
    localStorage.removeItem("agriforesight-journal-draft-v1");
    f.elements.note.value = "";
    f.elements.technique.value = "";
    if ($("#journal-photo")) $("#journal-photo").value = "";
    f.dispatchEvent(new Event("journal-saved"));
    renderJournal();
    notice("Note saved here." + archiveWarning);
    if (navigator.onLine) sync();
  } catch (error) {
    notice(
      error.message ||
        "This browser can’t save the note. Copy it somewhere before you leave.",
      true,
    );
  } finally {
    delete f.dataset.saving;
    if (submit) submit.disabled = false;
  }
};
$("#sync").onclick = sync;
$("#export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            state: { ...state, journals: savedJournalNotes() },
            pending: read(QUEUE, []),
          },
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    ),
  );
  const a = el("a");
  a.href = url;
  a.download = "agriforesight-records.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function samePoint(a, b) {
  return (
    a &&
    b &&
    Number(a.latitude) === Number(b.latitude) &&
    Number(a.longitude) === Number(b.longitude)
  );
}
$("#period-form").addEventListener("input", () => (periodDirty = true));
$("#october-preset").onclick = () => {
  $("#period-start").value = "2026-10-01";
  $("#period-end").value = "2026-10-31";
  periodDirty = true;
  notice("October 2026 picked. Tap Use these dates to load the weather.");
};
$("#period-form").onsubmit = (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  run(form.querySelector('button[type="submit"]'), async () => {
    notice("Getting the weather for those dates and the earlier records…");
    await api("/api/period", Object.fromEntries(new FormData(form)));
    periodDirty = false;
    latestModel = null;
    latestActions = null;
    weatherView = "past";
    $("#model-mode").value = "replay";
    await refresh();
    renderForecastLab();
    notice("Dates updated. The overview and past-weather tests now use them.");
  });
};
for (const selector of ["#model-mode", "#model-method"])
  $(selector).onchange = () => {
    modelRequest++;
    latestModel = null;
    latestActions = null;
    compareProvider = null;
    renderForecastLab();
  };
$("#load-comparison").onclick = (e) =>
  run(e.target, async () => {
    const result = await api("/api/comparison", {
      dataset: $("#model-dataset").value,
      start: $("#period-start").value,
      end: $("#period-end").value,
    });
    compareProvider = result.provider;
    renderForecastLab();
    notice(
      "Past model output loaded. It combines different forecast runs, so the lead times may differ.",
    );
  });
async function updateWeather(operation) {
  const form = $("#weather-record-form"),
    data = Object.fromEntries(new FormData(form));
  await api("/api/history/record", { ...data, operation });
  latestModel = null;
  latestActions = null;
  await refresh();
  await loadBackups();
  notice(
    "Weather record saved. Build the forecast again to include the change.",
  );
}
$("#weather-record-form").elements.date.onchange = () => {
  const f = $("#weather-record-form");
  const row = state.climate.days.find((r) => r.date === f.elements.date.value);
  f.elements.temp.value = row?.temp ?? "";
  f.elements.rain.value = row?.rain ?? "";
  notice(
    row
      ? "Here’s the saved reading. You can edit it."
      : "Nothing saved for this date yet. Add a reading here.",
  );
};
$("#weather-record-form").onsubmit = (e) => {
  e.preventDefault();
  run(e.currentTarget.querySelector('button[type="submit"]'), () =>
    updateWeather("upsert"),
  );
};
$("#delete-weather-record").onclick = (e) =>
  run(e.target, () => updateWeather("delete"));
async function loadBackups() {
  try {
    const result = await api("/api/history/backups");
    const select = $("#history-backup");
    select.replaceChildren();
    for (const b of result.backups) {
      const option = el("option", `${b.start} to ${b.end} · ${b.source}`);
      option.value = b.id;
      select.append(option);
    }
    if (!result.backups.length)
      select.append(el("option", "No edit backups yet"));
  } catch {}
}
$("#restore-weather").onclick = (e) =>
  run(e.target, async () => {
    await api("/api/history/restore", { id: $("#history-backup").value });
    latestModel = null;
    await refresh();
    notice("Older weather records restored.");
  });
window.addEventListener("offline", () => {
  connected(false);
  if (state) renderActivePage();
});
window.addEventListener("online", sync);
async function start() {
  try {
    await refresh();
    if (read(QUEUE, []).length) await sync();
  } catch {
    state = read(CACHE, null);
    connected(false);
    if (state) {
      try {
        state.journals = farmJournal.merge(
          state.journals,
          state.deleted_journal_ids,
        );
      } catch {
        /* Keep cached notes available even when browser storage is full. */
      }
      state.climate = farmHistory.preferCached(state.farm, state.climate);
      if (state.internal?.demo) state.internal = null;
      if (state.analysis?.internal?.demo) state.analysis = null;
      if (!state.climate.days.length)
        state.recommendation = {
          ...state.recommendation,
          rain: null,
          temp: null,
          baseline_rain: null,
          baseline_temp: null,
        };
      state.forecast = farmForecasts.preferCached(state.farm, state.forecast);
      render();
    } else
      notice("Start the app’s server, then refresh to see your records.", true);
  }
  loadBackups();
  if (state?.analysis_period) {
    weatherView = "past";
    $("#model-mode").value = "replay";
    latestModel = null;
  }
  if (state?.analysis) {
    latestModel = state.analysis.internal;
    compareProvider = state.analysis.provider;
    latestActions = state.analysis.actions;
    $("#model-mode").value = latestModel.mode;
    $("#model-method").value = latestModel.method_override || "auto";
  }
  renderActivePage();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() =>
        notice(
          "Couldn’t save the offline files. Keep the server running for now.",
          true,
        ),
      );
}
registerPageView("climate", renderHistory);
registerPageView("forecasts", () => {
  renderForecastLab();
  renderProvider();
});
registerPageView("journal", renderJournal);
start();

$("#month-update").onclick = (e) =>
  run(e.target, async () => {
    const r = await api("/api/month-outlook", {});
    const box = $("#month-result");
    box.replaceChildren(
      el(
        "p",
        r.source + " · saved " + new Date(r.retrieved_at).toLocaleString(),
      ),
      el("p", r.note),
    );
    for (let i = 0; i < r.days.length; i += 7) {
      const days = r.days.slice(i, i + 7),
        rain = days.filter((d) => d.rain != null),
        temp = days.filter((d) => d.temp != null);
      box.append(
        el(
          "h3",
          friendlyDate(days[0].date) + " to " + friendlyDate(days.at(-1).date),
        ),
        el(
          "p",
          rain.length === days.length
            ? num(rain.reduce((a, d) => a + d.rain, 0)) +
                " mm estimated total rain"
            : "Rain data incomplete",
        ),
        el(
          "p",
          temp.length
            ? num(temp.reduce((a, d) => a + d.temp, 0) / temp.length) +
                " °C average"
            : "Temperature unavailable",
        ),
      );
    }
    const detail = el("details");
    detail.append(
      el("summary", "See daily estimates"),
      makeTable(
        ["Date", "Rain estimate mm", "Average °C"],
        r.days.map((d) => [d.date, num(d.rain), num(d.temp)]),
      ),
    );
    box.append(detail);
  });
$("#crop-plan-form").onsubmit = (e) => {
  e.preventDefault();
  run(e.currentTarget.querySelector("button"), async () => {
    const r = await api(
      "/api/crop-plan",
      Object.fromEntries(new FormData($("#crop-plan-form"))),
    );
    save("agriforesight-crop-plan-v1", r);
    const box = $("#crop-plan-result");
    box.replaceChildren(
      el("h2", r.previous_crop + " → " + r.crop),
      el("p", r.note),
    );
    if (r.warning) box.prepend(el("p", r.warning, "context-note"));
    r.checks.forEach((t) => box.append(el("p", "• " + t)));
    box.append(
      makeTable(
        ["When", "What to do"],
        r.calendar.map((d) => [d.date, d.task]),
      ),
    );
    for (const source of r.sources) {
      const a = el("a", source.title);
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      const p = el("p");
      p.append(a);
      box.append(p);
    }
  });
};

$("#suggest-crops").onclick = (e) =>
  run(e.target, async () => {
    const r = await api("/api/crop-suggestions", {
      drainage: $("#suggest-drainage").value,
    });
    const box = $("#crop-suggestions");
    box.replaceChildren(
      el("p", r.timing, "weather-summary"),
      el(
        "p",
        `Using: ${r.inputs.previous_crop} → ${r.inputs.current_crop} → next crop · ${r.inputs.terrain} · ${r.inputs.water}. ${r.inputs.forecast_days_used} usable forecast days.`,
      ),
    );
    if (r.warning) box.prepend(el("p", r.warning, "context-note"));
    for (const option of r.options) {
      const card = el("article", undefined, "panel");
      card.append(el("h2", option.crop), el("span", option.status, "pill"));
      option.reasons.forEach((t) => card.append(el("p", t)));
      const details = el("details");
      details.append(el("summary", "What to check first"));
      option.cautions.forEach((t) => details.append(el("p", t)));
      card.append(details);
      const choose = el(
        "button",
        "Use this crop in a draft calendar",
        "secondary",
      );
      choose.disabled = option.blocked;
      choose.onclick = () => {
        const f = $("#crop-plan-form");
        f.elements.crop.value = option.crop;
        f.elements.previous_crop.value = r.inputs.current_crop;
        f.elements.drainage.value = r.inputs.drainage;
        f.closest("details").hidden = false;
        f.closest("details").open = true;
        f.scrollIntoView({ behavior: "smooth" });
      };
      card.append(choose);
      box.append(card);
    }
    const detail = el("details", undefined, "panel");
    detail.append(
      el("summary", "Missing details and how this works"),
      el("p", r.method),
    );
    r.missing.forEach((t) => detail.append(el("p", t)));
    for (const source of r.sources) {
      const p = el("p"),
        a = el("a", source.title);
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      p.append(a);
      detail.append(p);
    }
    box.append(detail);
  });
