/* One forecast per saved point, shared by Forecasts and Farm Performance. */
const farmForecasts = (() => {
  const prefix = "agriforesight-forecast-v1:";
  const flights = new Map();
  const cooldowns = new Map();
  const point = (f) => `${f.latitude}:${f.longitude}`;
  const finite = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const today = () =>
    new Date(Date.now() + 28800000).toISOString().slice(0, 10);
  function usable(f, farm) {
    return (
      f &&
      !f.demo &&
      point(f) === point(farm) &&
      Number.isFinite(Date.parse(f.retrieved_at)) &&
      Date.parse(f.retrieved_at) <= Date.now() + 60000 &&
      Array.isArray(f.days) &&
      f.days.length > 0 &&
      f.days.length <= 16 &&
      f.days.every(
        (d) =>
          /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
          (d.rain === null || finite(d.rain, 0, 3000)) &&
          (d.high === null || finite(d.high, -60, 65)),
      ) &&
      f.days.some((d) => finite(d.rain, 0, 3000) && finite(d.high, -60, 65))
    );
  }
  function cached(farm) {
    try {
      const f = JSON.parse(localStorage.getItem(prefix + point(farm)));
      return usable(f, farm) ? f : null;
    } catch {
      return null;
    }
  }
  function remember(farm, f) {
    if (!usable(f, farm)) return false;
    try {
      localStorage.setItem(prefix + point(farm), JSON.stringify(f));
      return true;
    } catch {
      return false;
    }
  }
  function preferCached(farm, server) {
    const local = cached(farm);
    const selected =
      usable(server, farm) &&
      (!local ||
        Date.parse(server.retrieved_at) >= Date.parse(local.retrieved_at))
        ? server
        : local;
    if (selected) remember(farm, selected);
    return selected;
  }
  function fresh(f) {
    const start = today();
    return (
      f &&
      Date.now() - Date.parse(f.retrieved_at) < 10800000 &&
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
      ).every((date) =>
        f.days.some(
          (d) =>
            d.date === date &&
            finite(d.rain, 0, 3000) &&
            finite(d.high, -60, 65) &&
            finite(d.et0, 0, 30),
        ),
      )
    );
  }
  async function direct(farm) {
    const params = new URLSearchParams({
      latitude: farm.latitude,
      longitude: farm.longitude,
      timezone: "Asia/Manila",
      forecast_days: 7,
      temperature_unit: "celsius",
      precipitation_unit: "mm",
      wind_speed_unit: "kmh",
      daily:
        "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,weather_code,wind_speed_10m_max",
    });
    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast?" + params,
      {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "Open-Meteo is busy on this connection too. Try again later."
          : "Open-Meteo could not provide a forecast.",
      );
    const data = await response.json();
    const daily = data?.daily,
      units = data?.daily_units;
    if (
      data.utc_offset_seconds !== 28800 ||
      !Array.isArray(daily?.time) ||
      daily.time.length > 16 ||
      units?.precipitation_sum !== "mm" ||
      units?.temperature_2m_max !== "°C" ||
      units?.et0_fao_evapotranspiration !== "mm"
    )
      throw new Error("The forecast returned unexpected dates or units.");
    const fields = {
      temp: ["temperature_2m_mean", -60, 65],
      high: ["temperature_2m_max", -60, 65],
      low: ["temperature_2m_min", -60, 65],
      rain: ["precipitation_sum", 0, 3000],
      probability: ["precipitation_probability_max", 0, 100],
      et0: ["et0_fao_evapotranspiration", 0, 30],
      weather_code: ["weather_code", 0, 99],
      wind: ["wind_speed_10m_max", 0, 500],
    };
    const days = daily.time.map((date, i) => {
      const row = { date };
      for (const [key, [field, lo, hi]] of Object.entries(fields)) {
        const v = daily[field]?.[i];
        row[key] = finite(v, lo, hi) ? v : null;
      }
      if (units.wind_speed_10m_max !== "km/h") row.wind = null;
      return row;
    });
    const result = {
      latitude: farm.latitude,
      longitude: farm.longitude,
      days,
      source: "Open-Meteo",
      source_url: "https://open-meteo.com/en/docs",
      timezone: "Asia/Manila",
      retrieved_at: new Date().toISOString(),
      retrieval_path: "browser",
    };
    if (
      !usable(result, farm) ||
      new Set(days.map((d) => d.date)).size !== days.length ||
      !days.some((d) => d.date === today())
    )
      throw new Error("No usable forecast for the saved field was returned.");
    return result;
  }
  async function load(farm, serverLoad, online = true) {
    const local = cached(farm);
    if (!online) {
      if (local)
        return {
          forecast: local,
          cached: true,
          warning:
            "Offline. Showing the forecast saved on this device, with its original dates.",
        };
      throw new Error(
        "No forecast saved for this field yet. Connect once to download it.",
      );
    }
    if (fresh(local)) return { forecast: local, cached: true };
    const key = point(farm);
    if (flights.has(key)) return flights.get(key);
    if (Date.now() < (cooldowns.get(key) || 0)) {
      if (local)
        return {
          forecast: local,
          cached: true,
          warning:
            "Update paused after a connection problem. Showing the saved forecast.",
        };
      throw new Error(
        "Weather update paused. Please wait a few minutes before trying again.",
      );
    }
    const work = (async () => {
      let forecast, serverError;
      try {
        const result = await serverLoad();
        if (usable(result.forecast, farm) && !result.stale)
          forecast = result.forecast;
        else
          throw new Error(result.warning || "Server forecast is unavailable.");
      } catch (error) {
        serverError = error;
      }
      if (!forecast) {
        try {
          forecast = await direct(farm);
        } catch (error) {
          cooldowns.set(key, Date.now() + 180000);
          if (local)
            return {
              forecast: local,
              cached: true,
              warning:
                "Could not update. Your saved forecast still has its original dates.",
            };
          throw new Error(
            `${serverError?.message || "Server unavailable."} ${error.message}`,
          );
        }
      }
      const stored = remember(farm, forecast);
      return {
        forecast,
        cached: false,
        warning: stored
          ? ""
          : "Browser storage is full or disabled. This forecast is only available while the page stays open.",
      };
    })();
    flights.set(key, work);
    try {
      return await work;
    } finally {
      flights.delete(key);
    }
  }
  return { load, preferCached, remember, cached };
})();
