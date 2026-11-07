const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../static/farm-assessment.js"),
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
  crop_stage: "vegetative",
  ph: null,
};
const completeFarm = {
  ...farm,
  ph: 6.2,
  ph_medium: "water",
  sample_date: "2026-11-01",
  soil_method: "lab",
  nitrogen_rating: "medium",
  phosphorus_rating: "medium",
  potassium_rating: "medium",
};
const forecast = {
  ...farm,
  source: "Provider test fixture",
  retrieved_at: new Date(now).toISOString(),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(7 + i).padStart(2, "0")}`,
    rain: 8,
    high: 30,
    temp: 28,
    et0: 4,
  })),
};
test("missing readings are unknown, never a zero health score", () => {
  const result = context.assess({ farm }, now);
  assert.equal(result.status, "unknown");
  assert.equal(result.ready, 0);
  assert.equal(result.score, undefined);
});
test("complete recent report plus unflagged forecast can clear the three checks", () => {
  const result = context.assess({ farm: completeFarm, forecast }, now);
  assert.equal(result.ready, 3);
  assert.equal(result.status, "okay");
});
test("crop pH ranges change the assessment and numeric NPK is not interpreted automatically", () => {
  assert.equal(
    context.assess(
      { farm: { ...completeFarm, crop: "mungbean" }, forecast },
      now,
    ).checks[0].status,
    "attention",
  );
  const result = context.assess(
    {
      farm: { ...completeFarm, nitrogen_rating: "unknown", nitrogen: 50 },
      forecast,
    },
    now,
  );
  assert.equal(result.checks[0].available, false);
  assert.match(result.checks[0].detail, /ask the lab/i);
});
test("old or relocated samples cannot pass the soil check", () => {
  for (const change of [
    { sample_date: "2025-01-01" },
    { soil_sample_point: { latitude: 14, longitude: 121 } },
    { ph_medium: "cacl2" },
  ]) {
    assert.equal(
      context.assess({ farm: { ...completeFarm, ...change }, forecast }, now)
        .checks[0].available,
      false,
    );
  }
});
test("surface moisture alone cannot determine root water stress", () => {
  const result = context.assess(
    {
      farm,
      current_conditions: {
        ...farm,
        valid_at: new Date(now).toISOString(),
        soil_moisture: 0.01,
      },
    },
    now,
  );
  assert.equal(result.checks[1].status, "unknown");
  assert.match(
    result.checks[1].detail,
    /does not tell us whether the roots need water/,
  );
});
test("stale, sample and wrong-point forecasts do not trigger present-day alerts", () => {
  const risky = {
    ...forecast,
    days: forecast.days.map((day) => ({ ...day, rain: 100, high: 40 })),
  };
  for (const change of [
    { demo: true },
    { latitude: 14 },
    { retrieved_at: "2025-01-01T00:00:00Z" },
  ]) {
    assert.equal(
      context.assess({ farm, forecast: { ...risky, ...change } }, now).checks[2]
        .status,
      "unknown",
    );
  }
  assert.equal(
    context.assess({ farm, forecast: risky }, now).checks[2].status,
    "attention",
  );
});
test("dry sequences and reference ET0 flag water checks without prescribing irrigation amounts", () => {
  const dry = {
    ...forecast,
    days: forecast.days.map((day) => ({ ...day, rain: 0 })),
  };
  assert.equal(
    context.assess({ farm, forecast: dry }, now).checks[1].status,
    "attention",
  );
  const deficit = {
    ...forecast,
    days: forecast.days.map((day) => ({ ...day, rain: 2, et0: 5 })),
  };
  assert.equal(
    context.assess({ farm, forecast: deficit }, now).checks[1].status,
    "attention",
  );
});
