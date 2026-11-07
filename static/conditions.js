/* Public, keyless Open-Meteo requests when the hosting server cannot reach it. */
const farmConditions = (() => {
  const cacheKey = "agriforesight-open-meteo-conditions-v1";
  const endpoint = "https://api.open-meteo.com/v1/forecast";
  const valid = (value, min, max) =>
    Number.isFinite(value) && value >= min && value <= max;
  const matches = (reading, farm) =>
    reading &&
    reading.latitude === farm.latitude &&
    reading.longitude === farm.longitude;

  function cached(farm) {
    try {
      const reading = JSON.parse(localStorage.getItem(cacheKey));
      const age = Date.now() - Date.parse(reading?.retrieved_at);
      return matches(reading, farm) &&
        reading.source === "Open-Meteo weather model" &&
        valid(reading.soil_moisture, 0, 1) &&
        age >= 0 &&
        age < 1800000
        ? reading
        : null;
    } catch {
      return null;
    }
  }

  function preferCached(farm, serverReading) {
    const reading = cached(farm);
    if (!reading) return serverReading;
    if (
      matches(serverReading, farm) &&
      valid(serverReading.soil_moisture, 0, 1) &&
      Date.parse(serverReading.retrieved_at) >= Date.parse(reading.retrieved_at)
    )
      return serverReading;
    return reading;
  }

  async function direct(farm) {
    const params = new URLSearchParams({
      latitude: farm.latitude,
      longitude: farm.longitude,
      timezone: "Asia/Manila",
      current: "temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm",
      temperature_unit: "celsius",
    });
    const response = await fetch(endpoint + "?" + params, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      throw new Error("Open-Meteo could not supply soil moisture.");
    const payload = await response.json();
    const current = payload?.current;
    if (
      payload?.utc_offset_seconds !== 28800 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(current?.time)
    ) {
      throw new Error("Open-Meteo returned an unreadable weather time.");
    }
    const stamp = Date.parse(current.time + "+08:00");
    if (!Number.isFinite(stamp) || Math.abs(Date.now() - stamp) > 21600000) {
      throw new Error(
        "Open-Meteo returned older estimates. Keeping the saved readings.",
      );
    }
    const unit = payload.current_units?.soil_moisture_0_to_1cm;
    if (
      !["m³/m³", "m3/m3"].includes(unit) ||
      !valid(current.soil_moisture_0_to_1cm, 0, 1)
    ) {
      throw new Error(
        "Open-Meteo did not return usable soil moisture for this point.",
      );
    }
    const reading = {
      latitude: farm.latitude,
      longitude: farm.longitude,
      temperature: valid(current.temperature_2m, -60, 65)
        ? current.temperature_2m
        : null,
      humidity: valid(current.relative_humidity_2m, 0, 100)
        ? current.relative_humidity_2m
        : null,
      soil_moisture: current.soil_moisture_0_to_1cm,
      soil_depth_cm: [0, 1],
      soil_moisture_unit: "m³/m³",
      source: "Open-Meteo weather model",
      source_url: "https://open-meteo.com/en/docs",
      kind: "model_estimate",
      retrieval_path: "browser",
      valid_at: new Date(stamp).toISOString(),
      retrieved_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(cacheKey, JSON.stringify(reading));
    } catch {
      /* Still show the loaded values. */
    }
    return reading;
  }

  async function load(farm, serverLoad) {
    const reading = cached(farm);
    if (reading) return { conditions: reading, cached: true };
    let result, serverError;
    try {
      result = await serverLoad();
    } catch (error) {
      serverError = error;
    }
    if (
      matches(result?.conditions, farm) &&
      result.conditions.source === "Open-Meteo weather model" &&
      valid(result.conditions.soil_moisture, 0, 1)
    )
      return result;
    try {
      return { conditions: await direct(farm), cached: false };
    } catch (error) {
      if (result?.conditions)
        return {
          ...result,
          warning: [result.warning, error.message].filter(Boolean).join(" "),
        };
      throw serverError || error;
    }
  }
  return { load, preferCached };
})();
