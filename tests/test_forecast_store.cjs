const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const farm = { latitude: 13.1391, longitude: 123.7438 };
const today = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
function forecast(age = 0) {
  return {
    ...farm,
    source: "Open-Meteo",
    retrieved_at: new Date(Date.now() - age).toISOString(),
    days: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.parse(today) + i * 86400000)
        .toISOString()
        .slice(0, 10),
      rain: 5,
      high: 30,
      low: 24,
      temp: 27,
      et0: 3,
      probability: 50,
    })),
  };
}
function payload() {
  const f = forecast(),
    daily = { time: f.days.map((d) => d.date) };
  for (const [name, key] of Object.entries({
    temperature_2m_mean: "temp",
    temperature_2m_max: "high",
    temperature_2m_min: "low",
    precipitation_sum: "rain",
    precipitation_probability_max: "probability",
    et0_fao_evapotranspiration: "et0",
  }))
    daily[name] = f.days.map((d) => d[key]);
  return {
    utc_offset_seconds: 28800,
    daily,
    daily_units: {
      temperature_2m_max: "°C",
      precipitation_sum: "mm",
      et0_fao_evapotranspiration: "mm",
    },
  };
}
function setup(fetch, storage = new Map()) {
  const ctx = vm.createContext({
    fetch,
    URLSearchParams,
    AbortSignal,
    localStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../static/forecast-store.js"),
      "utf8",
    ) + ";globalThis.store=farmForecasts;",
    ctx,
  );
  return ctx.store;
}
test("Render failure uses validated direct forecast; persists across reload and offline without fetching", async () => {
  const storage = new Map();
  let calls = 0;
  const client = setup(async (url) => {
    calls++;
    assert.match(url, /^https:\/\/api.open-meteo.com\/v1\/forecast\?/);
    return { ok: true, json: async () => payload() };
  }, storage);
  const r = await client.load(farm, async () => {
    throw Error("429 busy");
  });
  assert.equal(r.forecast.retrieval_path, "browser");
  assert.equal(calls, 1);
  const reloaded = setup(() => {
    throw Error("Must not fetch offline");
  }, storage);
  const offline = await reloaded.load(
    farm,
    () => {
      throw Error("Must not hit server");
    },
    false,
  );
  assert.equal(offline.forecast.retrieved_at, r.forecast.retrieved_at);
  assert.match(offline.warning, /Offline/);
  assert.equal(reloaded.preferCached(farm, null).days.length, 7);
  assert.equal(reloaded.preferCached({ ...farm, latitude: 14 }, null), null);
});
test("simultaneous consumers share one request and recent cache avoids calls", async () => {
  let calls = 0;
  const store = setup(() => {
    throw Error("No fallback needed");
  });
  const load = async () => {
    calls++;
    return { forecast: forecast() };
  };
  await Promise.all([store.load(farm, load), store.load(farm, load)]);
  await store.load(farm, load);
  assert.equal(calls, 1);
});
test("older server state cannot wipe newer device forecast; coordinates remain isolated", () => {
  const store = setup();
  const local = forecast();
  store.remember(farm, local);
  assert.equal(
    store.preferCached(farm, forecast(3600000)).retrieved_at,
    local.retrieved_at,
  );
  assert.equal(store.remember({ ...farm, latitude: 14 }, local), false);
  assert.equal(store.remember(farm, { ...local, demo: true }), false);
});
test("outage retains dates and cooldown stops repeated attempts even without saved data", async () => {
  let calls = 0;
  const store = setup(async () => {
    calls++;
    throw Error("offline");
  });
  const old = forecast(86400000 * 5);
  store.remember(farm, old);
  const fail = () => {
    calls++;
    throw Error("server down");
  };
  const r = await store.load(farm, fail);
  assert.equal(r.forecast.retrieved_at, old.retrieved_at);
  await store.load(farm, fail);
  assert.equal(calls, 2);
  const empty = setup(async () => {
    throw Error("fail");
  });
  await assert.rejects(empty.load(farm, fail));
  await assert.rejects(empty.load(farm, fail), /paused/);
});
test("bad units, dates and values never become a forecast cache", async () => {
  for (const edit of [
    (p) => (p.daily_units.precipitation_sum = "inch"),
    (p) => p.daily.time.fill(today),
    (p) => p.daily.temperature_2m_max.fill(999),
    (p) => p.daily.time.fill("bad"),
  ]) {
    const p = payload();
    edit(p);
    const store = setup(async () => ({ ok: true, json: async () => p }));
    await assert.rejects(
      store.load(farm, async () => {
        throw Error("busy");
      }),
    );
    assert.equal(store.cached(farm), null);
  }
});
test("local forecasts do not bypass stale-data gates in Farm Performance", () => {
  const ctx = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../static/farm-assessment.js"),
      "utf8",
    ) + ";globalThis.assess=assessFarm;",
    ctx,
  );
  assert.equal(
    ctx.assess({ farm: { ...farm, water: "rainfed" }, forecast: forecast() })
      .badge,
    "Good",
  );
  assert.notEqual(
    ctx.assess({ farm, forecast: forecast(86400000 * 3) }).badge,
    "Good",
  );
});
