const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    require("node:path").join(__dirname, "../static/farm-assessment.js"),
    "utf8",
  ) + ";globalThis.assess=assessFarm;",
  context,
);
const now = Date.parse("2026-11-07T08:00:00Z");
const farm = {
  latitude: 13.1391,
  longitude: 123.7438,
  crop: "rice",
  water: "rainfed",
};
const forecast = {
  ...farm,
  source: "Open-Meteo",
  retrieved_at: new Date(now).toISOString(),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(7 + i).padStart(2, "0")}`,
    rain: 8,
    high: 30,
    et0: 4,
  })),
};
const assess = (changes = {}) =>
  context.assess({ farm, forecast, ...changes }, now);
vm.runInContext(
  fs.readFileSync(
    require("node:path").join(__dirname, "../static/dashboard-tips.js"),
    "utf8",
  ) + ";globalThis.tips=dashboardTips;",
  context,
);
test("provider weather can clear all checks without manual soil data", () => {
  const r = assess();
  assert.equal(r.badge, "Good");
  assert.equal(r.ready, 3);
  assert.equal(r.checks[0].sources[0].title, "Open-Meteo");
  assert.equal(r.score, undefined);
  assert.equal(
    r.checks.some((c) => c.id === "soil"),
    false,
  );
});
test("missing, old, sample, future and wrong-coordinate forecasts cannot clear checks", () => {
  for (const f of [
    null,
    { ...forecast, demo: true },
    { ...forecast, retrieved_at: "2025-01-01" },
    { ...forecast, retrieved_at: "2027-01-01" },
    { ...forecast, longitude: 124 },
  ])
    assert.equal(assess({ forecast: f }).status, "unknown");
});
test("heat and heavy rain independently trigger Watch and relevant action", () => {
  for (const change of [{ high: 36 }, { rain: 60 }]) {
    const r = assess({
      forecast: {
        ...forecast,
        days: forecast.days.map((d) => ({ ...d, ...change })),
      },
    });
    assert.equal(r.badge, "Watch");
    assert.equal(r.status, "attention");
    assert.ok(r.action.length);
  }
});
test("dry spells and ET0 gap trigger a water check, not irrigation doses", () => {
  for (const change of [{ rain: 0 }, { rain: 2, et0: 5 }]) {
    const r = assess({
      forecast: {
        ...forecast,
        days: forecast.days.map((d) => ({ ...d, ...change })),
      },
    });
    assert.equal(r.checks[2].status, "attention");
    assert.match(r.checks[2].action, /roots/);
  }
});
test("partial, duplicate or missing ET0 data never produce Good", () => {
  for (const days of [
    forecast.days.slice(1),
    forecast.days.map((d) => ({ ...d, et0: null })),
    Array(7).fill(forecast.days[0]),
  ]) {
    assert.notEqual(assess({ forecast: { ...forecast, days } }).badge, "Good");
  }
  assert.equal(
    assess({
      forecast: {
        ...forecast,
        days: forecast.days.map((d) => ({ ...d, high: null })),
      },
    }).status,
    "unknown",
  );
});
test("current heat can flag a field while moisture alone cannot declare it healthy", () => {
  const current_conditions = {
    ...farm,
    source: "Open-Meteo weather model",
    valid_at: new Date(now).toISOString(),
    temperature: 36,
    soil_moisture: 0.2,
  };
  const r = assess({ forecast: null, current_conditions });
  assert.equal(r.badge, "Watch");
  assert.match(r.checks[2].value, /20.0/);
  assert.equal(r.checks[2].status, "unknown");
  assert.equal(
    assess({
      forecast: null,
      current_conditions: { ...current_conditions, latitude: 14 },
    }).status,
    "unknown",
  );
});
test("manual soil values do not alter the weather outlook; irrigated fields avoid ET0-only alarms", () => {
  assert.equal(
    assess({ farm: { ...farm, ph: 2, nitrogen_rating: "low" } }).badge,
    "Good",
  );
  const f = {
    ...forecast,
    days: forecast.days.map((d) => ({ ...d, rain: 2, et0: 5 })),
  };
  assert.equal(
    assess({ farm: { ...farm, water: "irrigated" }, forecast: f }).checks[2]
      .status,
    "okay",
  );
  assert.equal(
    assess({
      forecast: {
        ...forecast,
        days: forecast.days.map((d) => ({ ...d, rain: NaN })),
      },
    }).checks[1].available,
    false,
  );
});

test("dashboard daily tips rotate at Manila midnight even without weather", () => {
  const farm_tips = [{ title: "Walk the field" }, { title: "Check water" }];
  const state = { farm, farm_tips };
  const midnight = Date.parse("2026-11-07T16:00:00Z");
  const before = context.tips(state, midnight - 1);
  const after = context.tips(state, midnight);
  assert.notEqual(before.tips[0].title, after.tips[0].title);
  assert.equal(after.needsWeather, true);
  assert.equal(
    context.tips(state, midnight + 60_000).tips[0].title,
    after.tips[0].title,
  );
});

test("near-term weather comes first, with a dated reason, only for a fresh forecast at this field", () => {
  const farm_tips = [{ title: "Walk the field" }];
  const rainy = {
    ...forecast,
    days: forecast.days.map((day, i) => ({ ...day, rain: i === 1 ? 55 : 8 })),
  };
  const urgent = context.tips({ farm, forecast: rainy, farm_tips }, now);
  assert.equal(urgent.tips[0].title, "Heavy rain ahead");
  assert.match(urgent.tips[0].why, /Open-Meteo.*55\.0 mm.*Nov 8/);
  assert.equal(urgent.tips[1].title, "Walk the field");
  assert.equal(urgent.needsWeather, false);
  for (const unusable of [
    { ...rainy, retrieved_at: new Date(now - 49 * 3600000).toISOString() },
    { ...rainy, latitude: 14 },
    { ...rainy, demo: true },
  ]) {
    const tips = context.tips({ farm, forecast: unusable, farm_tips }, now);
    assert.equal(tips.tips[0].title, "Walk the field");
    assert.equal(tips.needsWeather, true);
  }
  const later = {
    ...rainy,
    days: forecast.days.map((day, i) => ({ ...day, rain: i === 4 ? 55 : 8 })),
  };
  assert.equal(
    context.tips({ farm, forecast: later, farm_tips }, now).tips[0].title,
    "Walk the field",
  );
});
