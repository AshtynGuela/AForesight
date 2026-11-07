const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../static/conditions.js"),
  "utf8",
);
const farm = { latitude: 13.1391, longitude: 123.7438 };
const fallback = {
  ...farm,
  source: "MET Norway (CC BY 4.0)",
  temperature: 27,
  humidity: 80,
  soil_moisture: null,
};
function setup(fetch) {
  const storage = new Map();
  const context = vm.createContext({
    fetch,
    URLSearchParams,
    AbortSignal,
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });
  vm.runInContext(source + ";globalThis.client=farmConditions;", context);
  return context.client;
}
function payload(soil = 0.338, unit = "m³/m³") {
  const time = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16);
  return {
    utc_offset_seconds: 28800,
    current: {
      time,
      temperature_2m: 27,
      relative_humidity_2m: 80,
      soil_moisture_0_to_1cm: soil,
    },
    current_units: { soil_moisture_0_to_1cm: unit },
  };
}
test("browser obtains soil moisture when hosted provider falls back, and keeps it on refresh", async () => {
  let calls = 0;
  const client = setup(async (url) => {
    calls++;
    assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
    return { ok: true, json: async () => payload() };
  });
  const result = await client.load(farm, async () => ({
    conditions: fallback,
  }));
  assert.equal(result.conditions.soil_moisture, 0.338);
  assert.equal(result.conditions.source, "Open-Meteo weather model");
  assert.equal(client.preferCached(farm, fallback).soil_moisture, 0.338);
  await client.load(farm, async () => {
    throw Error("Should use device cache");
  });
  assert.equal(calls, 1);
  assert.equal(client.preferCached({ ...farm, latitude: 14 }, null), null);
});
test("does not invent soil values when the direct request fails", async () => {
  const client = setup(async () => {
    throw Error("Connection unavailable");
  });
  const result = await client.load(farm, async () => ({
    conditions: fallback,
  }));
  assert.equal(result.conditions.soil_moisture, null);
  assert.match(result.warning, /Connection unavailable/);
});
test("rejects malformed, out-of-range and wrong-unit provider values", async () => {
  for (const body of [
    null,
    payload(true),
    payload(1.1),
    payload(0.3, "percent"),
    { ...payload(), utc_offset_seconds: 0 },
  ]) {
    const client = setup(async () => ({ ok: true, json: async () => body }));
    const result = await client.load(farm, async () => ({
      conditions: fallback,
    }));
    assert.equal(result.conditions.soil_moisture, null);
    assert.ok(result.warning);
  }
});
test("uses the server directly when it already provides valid soil moisture", async () => {
  const client = setup(async () => {
    throw Error("No extra provider request should be made");
  });
  const result = await client.load(farm, async () => ({
    conditions: {
      ...fallback,
      source: "Open-Meteo weather model",
      soil_moisture: 0.2,
    },
  }));
  assert.equal(result.conditions.soil_moisture, 0.2);
});
