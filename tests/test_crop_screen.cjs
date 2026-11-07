const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function setup() {
  const nodes = new Map(),
    storage = new Map();
  const el = (tag, text = "", className = "") => ({
    tag,
    textContent: text,
    className,
    children: [],
    append(...items) {
      this.children.push(...items);
    },
    prepend(...items) {
      this.children.unshift(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    scrollIntoView() {},
    focus() {},
    dispatchEvent() {},
  });
  const $ = (key) => {
    if (!nodes.has(key)) nodes.set(key, el("div"));
    return nodes.get(key);
  };
  $("#crop-plan-form").elements = Object.fromEntries(
    ["crop", "previous_crop", "drainage", "duration", "start"].map((k) => [
      k,
      { value: "", focus() {} },
    ]),
  );
  const state = { farm: { latitude: 13, longitude: 123, crop: "rice" } };
  const ctx = vm.createContext({
    $,
    el,
    state,
    Event,
    read: (key, fallback) => storage.get(key) ?? fallback,
    save: (key, value) => storage.set(key, structuredClone(value)),
    notice() {},
    makeTable: () => el("table"),
  });
  const source = fs.readFileSync("static/app.js", "utf8");
  vm.runInContext(
    source.slice(source.indexOf("function renderCropPlan(")),
    ctx,
  );
  return { $, ctx, state, storage };
}
const comparison = {
  timing: "Check drainage",
  inputs: { current_crop: "rice", drainage: "good" },
  options: [
    {
      crop: "mungbean",
      status: "Consider",
      reasons: [],
      cautions: [],
      blocked: false,
    },
  ],
  method: "Rule-based comparison",
  missing: [],
  sources: [],
};
test("saved comparison restores with dated warning and never follows a changed farm", () => {
  const { ctx, $, state } = setup();
  ctx.saveCropResult("agriforesight-crop-comparison-v1", comparison);
  ctx.restoreCropResults();
  assert.match(
    $("#crop-comparison-timing").textContent,
    /Saved crop comparison/,
  );
  assert.match(
    $("#crop-suggestions").children[0].textContent,
    /Saved result from/,
  );
  state.farm.latitude = 14;
  ctx.restoreCropResults();
  assert.match(
    $("#crop-suggestions").children[0].textContent,
    /farm details changed/,
  );
  assert.equal($("#crop-comparison-inputs").hidden, true);
});
test("choosing a different crop clears the old variety duration and opens calendar", () => {
  const { ctx, $ } = setup();
  const form = $("#crop-plan-form");
  form.elements.crop.value = "rice";
  form.elements.duration.value = "120";
  ctx.renderCropSuggestions(comparison);
  const card = $("#crop-suggestions").children[0];
  card.children.at(-1).onclick();
  assert.equal(form.elements.crop.value, "mungbean");
  assert.equal(form.elements.duration.value, "");
  assert.equal(form.elements.previous_crop.value, "rice");
  assert.equal(form.elements.drainage.value, "good");
  assert.equal($("#planting .cp-calendar").open, true);
});
test("saved calendar is hidden after changing farms", () => {
  const { ctx, $, state } = setup();
  ctx.saveCropResult("agriforesight-crop-plan-v1", {
    crop: "rice",
    previous_crop: "corn",
    calendar: [],
  });
  ctx.restoreCropResults();
  assert.equal($("#crop-plan-result").hidden, false);
  state.farm.longitude = 124;
  ctx.restoreCropResults();
  assert.equal($("#crop-plan-result").hidden, true);
});
