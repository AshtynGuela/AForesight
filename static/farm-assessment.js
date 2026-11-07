/* Rules consume provider data only. Keep policy separate for later crop/NLP extensions. */
const assessFarm = (() => {
  const policy = Object.freeze({
    heatC: 35,
    heavyRainMm: 50,
    dryRainMm: 1,
    dryDays: 3,
    forecastHours: 48,
    currentHours: 6,
  });
  const valid = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const matches = (a, b) =>
    a && a.latitude === b.latitude && a.longitude === b.longitude;
  const fresh = (stamp, hours, now) => {
    const age = now - Date.parse(stamp);
    return Number.isFinite(age) && age >= 0 && age <= hours * 3600000;
  };
  const source = (reading) => ({
    title: reading?.source || "Weather provider",
    url: reading?.source_url?.startsWith("https://")
      ? reading.source_url
      : "https://open-meteo.com/en/docs",
    time: reading?.valid_at || reading?.retrieved_at,
  });
  return (state, now = Date.now()) => {
    const farm = state.farm;
    const today = new Date(now + 28800000).toISOString().slice(0, 10);
    const end = new Date(Date.parse(today) + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    const forecast = state.forecast;
    const usableForecast =
      matches(forecast, farm) &&
      !forecast.demo &&
      fresh(forecast.retrieved_at, policy.forecastHours, now);
    const rows = usableForecast
      ? (forecast.days || []).filter(
          (d) =>
            /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
            d.date >= today &&
            d.date <= end,
        )
      : [];
    const days = [...new Map(rows.map((d) => [d.date, d])).values()].sort(
      (a, b) => a.date.localeCompare(b.date),
    );
    const full =
      days.length === 7 &&
      days.every(
        (d, i) =>
          d.date ===
          new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10),
      );
    const current = state.current_conditions;
    const usableCurrent =
      matches(current, farm) &&
      !current.demo &&
      fresh(current.valid_at, policy.currentHours, now);
    const temperatures = days.filter((d) => valid(d.high, -60, 65));
    const rain = days.filter((d) => valid(d.rain, 0, 3000));
    const heatReady = full && temperatures.length === 7;
    const rainReady = full && rain.length === 7;
    const highs = temperatures.map((d) => d.high);
    if (usableCurrent && valid(current.temperature, -60, 65))
      highs.push(current.temperature);
    const hot = highs.some((v) => v >= policy.heatC);
    const heavy = rain.some((d) => d.rain >= policy.heavyRainMm);
    let streak = 0,
      longest = 0,
      previous;
    for (const d of rain) {
      if (previous && Date.parse(d.date) - Date.parse(previous) !== 86400000)
        streak = 0;
      streak = d.rain < policy.dryRainMm ? streak + 1 : 0;
      longest = Math.max(longest, streak);
      previous = d.date;
    }
    const etReady = rainReady && days.every((d) => valid(d.et0, 0, 30));
    const rainTotal = rainReady
      ? rain.reduce((sum, d) => sum + d.rain, 0)
      : null;
    const gap = etReady
      ? days.reduce((sum, d) => sum + d.rain - d.et0, 0)
      : null;
    const dry =
      longest >= policy.dryDays ||
      (farm.water === "rainfed" && gap !== null && gap < 0);
    const moisture =
      usableCurrent && valid(current.soil_moisture, 0, 1)
        ? (current.soil_moisture * 100).toFixed(1) + "% vol."
        : null;
    const make = (
      id,
      label,
      flag,
      available,
      title,
      detail,
      action,
      sources,
    ) => ({
      id,
      label,
      status: flag ? "attention" : available ? "okay" : "unknown",
      available,
      title,
      detail,
      action,
      sources,
    });
    const forecastSources = usableForecast ? [source(forecast)] : [];
    const currentSources = usableCurrent ? [source(current)] : [];
    const checks = [
      make(
        "heat",
        "Heat",
        hot,
        heatReady,
        hot ? "Hot conditions" : heatReady ? "No heat flag" : "Checking heat",
        highs.length
          ? `Highest available air temperature: ${Math.max(...highs).toFixed(1)} °C. ${temperatures.length}/7 forecast days available.`
          : "No recent temperature estimate for this field.",
        hot
          ? "Check for crop stress and work during cooler hours."
          : "Keep an eye on crop stress during the hottest part of the day.",
        [...forecastSources, ...currentSources],
      ),
      make(
        "rain",
        "Rain",
        heavy,
        rainReady,
        heavy
          ? "Heavy rain ahead"
          : rainReady
            ? "No heavy-rain flag"
            : "Checking rainfall",
        rain.length
          ? `${rain.length}/7 forecast days; highest daily rain ${Math.max(...rain.map((d) => d.rain)).toFixed(1)} mm.${rainTotal !== null ? ` Seven-day total ${rainTotal.toFixed(1)} mm.` : ""}`
          : "No recent rainfall forecast for this field.",
        heavy
          ? "Clear drains and check water outlets before the rain."
          : "Check the forecast again before planting or spraying.",
        forecastSources,
      ),
      make(
        "water",
        "Water",
        dry,
        etReady,
        dry
          ? "Check water supply"
          : etReady
            ? "No drying flag"
            : "Water outlook incomplete",
        `${rain.length ? `Longest forecast dry spell: ${longest} day(s). ` : ""}${gap !== null ? `Seven-day rain minus reference ET₀: ${gap.toFixed(1)} mm. ` : ""}${moisture ? `Surface moisture: ${moisture} in the top 0–1 cm. ` : ""}Surface moisture is context, not a root-zone health score. ${farm.water === "irrigated" ? "Irrigation delivery is not measured." : "Rainfed field."}`,
        dry
          ? farm.water === "irrigated"
            ? "Confirm irrigation delivery and check moisture near the roots."
            : "Check moisture near the roots and prepare a water source for dry days."
          : "Check near the roots before changing your watering plan.",
        [...forecastSources, ...(moisture ? currentSources : [])],
      ),
    ];
    checks[0].value = highs.length
      ? `${Math.max(...highs).toFixed(1)} °C highest available`
      : "No recent temperature";
    checks[1].value =
      rainTotal !== null
        ? `${rainTotal.toFixed(1)} mm over seven days`
        : `${rain.length}/7 forecast days available`;
    checks[2].value =
      gap !== null
        ? `${gap.toFixed(1)} mm rain − reference ET₀`
        : moisture
          ? `Surface moisture ${moisture}`
          : "No recent water outlook";
    const flagged = checks.find((c) => c.status === "attention");
    const ready = checks.filter((c) => c.available).length;
    const okay = checks.every((c) => c.status === "okay");
    return {
      checks,
      ready,
      status: flagged ? "attention" : okay ? "okay" : "unknown",
      badge: flagged ? "Watch" : okay ? "Good" : "—",
      title: flagged
        ? "Your field may need attention"
        : okay
          ? "Conditions look favorable"
          : "Checking farm conditions",
      action: flagged
        ? flagged.action
        : okay
          ? "Keep checking your crops. No weather or drying flags were found for the next seven days."
          : "We need a complete, recent forecast to finish the check. Update the sources below.",
      needsForecast: !heatReady || !rainReady || !etReady,
      period: days.length
        ? `${days[0].date} to ${days.at(-1).date}`
        : "Next seven days",
      note: "Weather-based farm health indicator, not a diagnosis of crop disease or soil fertility. pH and NPK are not supplied by these weather APIs and do not affect this indicator yet.",
      policy,
    };
  };
})();
