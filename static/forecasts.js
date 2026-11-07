/* Figma Forecasts: shared sources, readable cards, and existing tools underneath. */
(() => {
  const page = $("#forecasts");
  const updateButton = $("#simple-weather-update");
  const tools = el("details", undefined, "fc-tools");
  tools.append(el("summary", "More weather tools"));
  while (page.firstChild) tools.append(page.firstChild);
  const heading = el("div", undefined, "fc-heading");
  heading.append(el("h1", "Forecasts"), updateButton);
  const location = el("p", "", "fc-location");
  const status = el("p", "", "fc-status");
  status.setAttribute("role", "status");
  const weather = el("section", undefined, "fc-weather");
  weather.setAttribute("aria-label", "Seven-day forecast");
  const daysHost = el("div", undefined, "fc-days");
  daysHost.tabIndex = 0;
  daysHost.setAttribute("role", "region");
  daysHost.setAttribute(
    "aria-label",
    "Daily forecasts. Scroll sideways for all days.",
  );
  weather.append(daysHost);
  const history = el("section", undefined, "fc-history");
  const historyHeader = el("div", undefined, "fc-section-heading");
  const variableLabel = el("label", undefined, "fc-variable");
  const variable = el("select");
  variable.setAttribute("aria-label", "Daily History measurement");
  for (const [value, text] of [
    ["rain", "Rainfall (mm)"],
    ["temp", "Temperature (°C)"],
  ]) {
    const option = el("option", text);
    option.value = value;
    variable.append(option);
  }
  variableLabel.append(variable);
  variable.value = "rain";
  historyHeader.append(el("h2", "Daily History"), variableLabel);
  const historySource = el("p", "", "fc-source");
  const chart = el("div");
  chart.id = "fc-history-chart";
  const values = el("details", undefined, "fc-history-values");
  values.append(el("summary", "Read the daily values"));
  const table = el("div");
  values.append(table);
  history.append(historyHeader, historySource, chart, values);
  const recommendations = el("section", undefined, "fc-recommendations");
  recommendations.append(el("h2", "Farm Recommendations"));
  const recommendationHost = el("div", undefined, "fc-recommendation-grid");
  recommendations.append(recommendationHost);
  const sourceDetails = el("details", undefined, "fc-sources");
  sourceDetails.append(el("summary", "Sources & saved dates"));
  const sourceCopy = el("div");
  sourceDetails.append(sourceCopy);
  const metadata = el("div", undefined, "fc-metadata");
  metadata.append(location, status, historySource, values);
  sourceDetails.append(metadata);
  page.append(heading, weather, history, recommendations, sourceDetails, tools);

  const asset = (name) => "/static/forecast-assets/" + name;
  function weatherIcon(day) {
    const code = day.weather_code;
    if (Number.isFinite(code)) {
      if (code >= 95) return ["storm.svg", "Thunderstorms forecast"];
      if (code >= 51) return ["rain.svg", "Rain or showers forecast"];
      if (code <= 2)
        return ["cloud-sunny.svg", "Clear or partly cloudy forecast"];
      return ["cloud.svg", "Cloudy or foggy forecast"];
    }
    return day.rain >= 1
      ? ["rain.svg", "Rain forecast"]
      : ["cloud.svg", "Weather estimate"];
  }
  function historyRows() {
    return visibleHistory().slice(-30);
  }
  function renderDailyHistory() {
    if (!state) return;
    const rows = historyRows(),
      key = variable.value;
    historySource.textContent =
      state.climate.source +
      (rows.length
        ? " · " +
          friendlyDate(rows[0].date) +
          " – " +
          friendlyDate(rows.at(-1).date)
        : " · No saved records");
    plot(
      "#fc-history-chart",
      [
        {
          name: key === "rain" ? "Past rainfall" : "Past temperature",
          color: "#7ba2f5",
          points: rows.map((d) => ({ date: d.date, value: d[key] })),
        },
      ],
      key === "rain" ? "Rainfall (mm/day)" : "Temperature (°C)",
    );
    // Fill each continuous segment separately so missing dates stay as gaps.
    const svg = chart.querySelector("svg");
    if (svg) {
      const ns = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(ns, "defs");
      const gradient = document.createElementNS(ns, "linearGradient");
      gradient.id = "fc-history-fill";
      for (const [name, value] of Object.entries({
        x1: "0",
        y1: "0",
        x2: "0",
        y2: "1",
      }))
        gradient.setAttribute(name, value);
      for (const [offset, opacity] of [
        ["0%", "0.48"],
        ["100%", "0"],
      ]) {
        const stop = document.createElementNS(ns, "stop");
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", "#7ba2f5");
        stop.setAttribute("stop-opacity", opacity);
        gradient.append(stop);
      }
      defs.append(gradient);
      svg.prepend(defs);
      svg.querySelectorAll("polyline").forEach((line) => {
        const points = line.getAttribute("points").trim().split(/\s+/);
        if (points.length < 2) return;
        const area = document.createElementNS(ns, "polygon");
        area.setAttribute(
          "points",
          `${points[0].split(",")[0]},218 ${points.join(" ")} ${points.at(-1).split(",")[0]},218`,
        );
        area.setAttribute("fill", "url(#fc-history-fill)");
        svg.insertBefore(area, line);
      });
      for (let i = 0; i <= 5; i++) {
        const line = document.createElementNS(ns, "line");
        const x = 58 + i * 136;
        for (const [k, v] of Object.entries({ x1: x, x2: x, y1: 33, y2: 218 }))
          line.setAttribute(k, v);
        svg.insertBefore(line, defs.nextSibling);
      }
    }
    table.replaceChildren(
      makeTable(
        ["Date", key === "rain" ? "Rain mm" : "Mean °C"],
        rows.map((d) => [d.date, num(d[key])]),
      ),
    );
  }
  variable.onchange = renderDailyHistory;
  $("#simple-weather-dates").onclick = () => {
    tab("climate");
    $("#period-panel").open = true;
    $("#period-panel").scrollIntoView({ behavior: "smooth" });
  };
  function renderForecastScreen() {
    if (!state) return;
    heading.dataset.offline = String(!navigator.onLine);
    // Existing comparison/30-day controls remain functional inside More weather tools.
    renderForecastLab();
    $("#simple-weather-update").hidden = false;
    const farm = state.farm,
      forecast = state.forecast;
    const today = isoDay();
    const future = (forecast?.days || [])
      .filter((d) => d.date >= today)
      .slice(0, 7);
    const days = future.length ? future : forecast?.days || [];
    location.textContent = `${farm.name} · ${farm.municipality}`;
    status.textContent =
      state.forecast_status ||
      (!navigator.onLine
        ? "Offline · reading the forecast saved here"
        : !forecast
          ? "Go online and tap Update weather to save a forecast."
          : "Saved on this device · scroll for all seven days");
    if (forecast && !future.length)
      status.textContent =
        "Saved forecast dates have passed. Connect to update; these values are for reference.";
    else if (
      forecast &&
      Date.now() - Date.parse(forecast.retrieved_at) > 172800000
    )
      status.textContent =
        "Older forecast · update before making plans. " +
        (state.forecast_status || "");
    daysHost.replaceChildren();
    for (const day of days) {
      const card = el("article", undefined, "fc-day");
      const date = new Date(day.date + "T12:00:00+08:00");
      const time = el(
        "time",
        date.toLocaleDateString("en-PH", { weekday: "short" }).toUpperCase(),
      );
      time.dateTime = day.date;
      time.textContent += " " + date.getDate();
      time.setAttribute(
        "aria-label",
        date.toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
      );
      const [name, alt] = weatherIcon(day),
        icon = el("img");
      icon.src = asset(name);
      icon.alt = alt;
      const iconSlot = el("div", undefined, "fc-icon");
      iconSlot.append(icon);
      card.append(time, iconSlot, el("strong", num(day.high, 1) + "°C"));
      card.setAttribute(
        "aria-label",
        day.date + ". Daily high " + num(day.high) + " degrees Celsius",
      );
      card.append(
        el("small", `Rain: ${num(day.rain)} mm`),
        el(
          "small",
          day.probability == null
            ? "Rain chance: —"
            : `Rain chance: ${num(day.probability, 0)}%`,
        ),
      );
      card.append(
        el(
          "small",
          day.wind == null
            ? `Low: ${num(day.low, 1)}°C`
            : `Max wind: ${num(day.wind, 0)} km/h`,
        ),
      );
      daysHost.append(card);
    }
    if (!days.length)
      daysHost.append(el("p", "No forecast saved for this field yet."));
    renderDailyHistory();
    const assessment = assessFarm(state);
    recommendationHost.replaceChildren();
    for (const check of assessment.checks) {
      const card = el("article");
      card.dataset.status = check.status;
      card.append(
        el("small", check.label),
        el("h3", check.title),
        el(
          "p",
          {
            heat:
              check.status === "attention"
                ? "Work during cooler hours. Check crop stress."
                : "Check crops during hot hours.",
            rain:
              check.status === "attention"
                ? "Clear drains before the rain."
                : "Recheck before planting or spraying.",
            water:
              check.status === "attention"
                ? "Check near the roots and prepare your water supply."
                : "Check near the roots before watering.",
          }[check.id] || check.action,
        ),
      );
      const why = el("details");
      why.append(
        el("summary", "Why?"),
        el("p", check.action),
        el("p", check.detail),
      );
      card.append(why);
      recommendationHost.append(card);
    }
    sourceCopy.replaceChildren(
      el(
        "p",
        "Forecasts and Farm Performance use the same saved weather for this point.",
      ),
      el("p", assessment.note),
    );
    if (forecast) {
      sourceCopy.append(
        el(
          "p",
          `${forecast.source} · downloaded ${new Date(forecast.retrieved_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Philippine time`,
        ),
      );
      const link = el("a", "Open-Meteo · CC BY 4.0");
      link.href = "https://open-meteo.com/en/docs";
      link.target = "_blank";
      link.rel = "noreferrer";
      sourceCopy.append(link);
    }
    sourceCopy.append(
      el(
        "p",
        "Forecast values are model estimates. Daily History shows your saved historical records, separately labeled if they are samples. Download once while online to read here offline.",
      ),
    );
  }
  registerPageView("forecasts", renderForecastScreen);
})();
