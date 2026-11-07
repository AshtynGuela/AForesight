const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function load(file, exportName, storage = new Map()) {
  const ctx = vm.createContext({
    localStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../static/" + file), "utf8") +
      `;globalThis.store=${exportName};`,
    ctx,
  );
  return ctx.store;
}
const farm = { latitude: 13, longitude: 123 };
const history = {
  ...farm,
  kind: "gridded_reference",
  source: "Adapter test fixture",
  demo: false,
  retrieved_at: "2026-11-07T08:00:00Z",
  days: [{ date: "2026-10-30", rain: 3, temp: 27 }],
};
test("legacy synthetic or unverified browser history never reaches live views", () => {
  const store = load("history-store.js", "farmHistory");
  for (const change of [
    { demo: true },
    { kind: "user_edited" },
    { retrieved_at: "invalid" },
  ])
    assert.equal(
      store.preferCached(farm, { ...history, ...change }).days.length,
      0,
    );
});
test("source history survives a reload and an empty or older server response", () => {
  const storage = new Map(),
    store = load("history-store.js", "farmHistory", storage);
  store.preferCached(farm, history);
  const reloaded = load("history-store.js", "farmHistory", storage);
  assert.equal(reloaded.preferCached(farm, null).days.length, 1);
  assert.equal(
    reloaded.preferCached(farm, { ...history, retrieved_at: "2025-01-01" })
      .retrieved_at,
    history.retrieved_at,
  );
});
test("history remains isolated by field coordinates and rejects malformed values", () => {
  const store = load("history-store.js", "farmHistory");
  assert.equal(
    store.preferCached({ ...farm, latitude: 14 }, history).days.length,
    0,
  );
  assert.equal(
    store.preferCached(farm, {
      ...history,
      days: [{ date: "2026-10-30", rain: -3, temp: 27 }],
    }).days.length,
    0,
  );
});
test("local farmer notes survive server restart and device module reload", () => {
  const storage = new Map();
  const store = load("journal-store.js", "farmJournal", storage);
  store.merge([
    {
      id: "unit-only",
      date: "2026-11-01",
      note: "Isolated test note",
      photo_id: "local-photo",
    },
  ]);
  const reload = load("journal-store.js", "farmJournal", storage);
  assert.equal(reload.merge([]).length, 1);
  assert.equal(
    reload.merge([
      { id: "unit-only", date: "2026-11-01", note: "Synced note" },
    ])[0].photo_id,
    "local-photo",
  );
});
test("sync retries merge by note id instead of duplicating local records", () => {
  const store = load("journal-store.js", "farmJournal");
  const note = {
    id: "unit-only",
    date: "2026-11-01",
    note: "Isolated test note",
  };
  store.merge([note]);
  store.merge([note]);
  assert.equal(store.merge([]).length, 1);
});

test("photo framing survives reloads and stays separate from synced notes", () => {
  const storage = new Map();
  const store = load("journal-store.js", "farmJournal", storage);
  store.preview("device-photo", { x: 20, y: 80, zoom: 2 });
  const reloaded = load("journal-store.js", "farmJournal", storage);
  const position = reloaded.preview("device-photo");
  assert.equal(position.x, 20);
  assert.equal(position.y, 80);
  assert.equal(position.zoom, 2);
  assert.equal(reloaded.merge([]).length, 0);
  assert.equal(reloaded.preview("other-photo").zoom, 1);
  const clamped = reloaded.preview("device-photo", { x: -10, y: 150, zoom: 9 });
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 100);
  assert.equal(clamped.zoom, 3);
});

test("pending edits and deletes survive reloads and stale server responses", () => {
  const storage = new Map();
  const original = {
    id: "field-note",
    date: "2026-11-01",
    note: "Original",
    photo_id: "existing-photo",
  };
  const local = load("journal-store.js", "farmJournal", storage);
  local.merge([original]);
  const reloaded = load("journal-store.js", "farmJournal", storage);
  const edit = { id: original.id, operation: "edit", note: "Edited details" };
  const saved = reloaded.merge([original]);
  assert.equal(reloaded.notes(saved, [edit])[0].note, edit.note);
  assert.equal(reloaded.notes(saved, [edit])[0].photo_id, original.photo_id);
  const deletion = { id: original.id, operation: "delete" };
  assert.equal(reloaded.notes(saved, [edit, deletion]).length, 0);
  reloaded.merge([
    { ...original, note: edit.note, updated_at: "2026-11-07T00:00:00+00:00" },
  ]);
  assert.equal(reloaded.merge([original])[0].note, edit.note);
  reloaded.merge([], [original.id]);
  assert.equal(reloaded.merge([original]).length, 0);
  assert.equal(reloaded.notes(saved, [edit]).length, 0);
});
