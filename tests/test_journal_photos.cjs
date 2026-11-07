/* Isolated photo viewer checks: no files, notes or photos are added to the app. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  class Element {
    constructor(tag, text, className) {
      Object.assign(this, {
        tag,
        text,
        className,
        children: [],
        style: {},
        events: {},
      });
    }
    append(...children) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }
    setAttribute() {}
    addEventListener(name, fn) {
      this.events[name] = fn;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
      this.events.close?.();
    }
    remove() {
      this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }
  const body = new Element("body");
  const original = { type: "image/png", size: 100 };
  const positions = new Map();
  const revoked = [],
    notices = [];
  let renders = 0;
  const context = vm.createContext({
    el: (...args) => new Element(...args),
    document: { body },
    farmJournal: {
      photo: async (id) => (id === "existing-photo" ? original : undefined),
      preview: (id, position) => {
        if (position) positions.set(id, { ...position });
        return positions.get(id) || { x: 50, y: 50, zoom: 1 };
      },
    },
    URL: {
      createObjectURL: (file) => {
        assert.equal(file, original);
        return "blob:isolated-test";
      },
      revokeObjectURL: (url) => revoked.push(url),
    },
    notice: (message) => notices.push(message),
    renderJournal: () => renders++,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../static/journal-photos.js"),
      "utf8",
    ) + ";globalThis.photos = journalPhotos;",
    context,
  );
  const find = (predicate) => {
    const walk = (node) =>
      predicate(node) ? node : node.children.map(walk).find(Boolean);
    return walk(body);
  };
  return {
    photos: context.photos,
    body,
    original,
    positions,
    revoked,
    notices,
    find,
    renders: () => renders,
  };
}

test("original photo stays unchanged while the chosen thumbnail framing is saved", async () => {
  const s = setup();
  await s.photos.open("existing-photo");
  const full = s.find((n) => n.className === "wj-photo-original");
  assert.equal(full.src, "blob:isolated-test");
  assert.deepEqual(full.style, {});
  const slider = s.find((n) => n.tag === "input" && n.max === 3);
  slider.value = "2";
  slider.oninput();
  s.find((n) => n.text === "Use this preview").onclick();
  assert.equal(s.positions.get("existing-photo").zoom, 2);
  assert.equal(s.renders(), 1);
  assert.equal(s.original.size, 100);
  assert.equal(s.body.children.length, 0);
  assert.deepEqual(s.revoked, ["blob:isolated-test"]);
});

test("closing a draft preview discards changes; applying it keeps framing until reset", () => {
  const s = setup();
  const adjust = () => {
    const slider = s.find((n) => n.tag === "input" && n.max === 3);
    slider.value = "2.5";
    slider.oninput();
  };
  s.photos.choose(s.original);
  adjust();
  s.find((n) => n.text === "Close").onclick();
  assert.equal(s.photos.draftPreview().zoom, 1);
  s.photos.choose(s.original);
  adjust();
  s.find((n) => n.text === "Use this preview").onclick();
  assert.equal(s.photos.draftPreview().zoom, 2.5);
  assert.equal(s.positions.size, 0);
  s.photos.reset();
  assert.equal(s.photos.draftPreview().zoom, 1);
});

test("missing or oversized photos show a useful message without opening a dialog", async () => {
  const s = setup();
  await s.photos.open("not-on-this-device");
  assert.match(s.notices[0], /device where it was saved/);
  s.photos.choose({ type: "image/png", size: 3 * 1024 * 1024 });
  assert.match(s.notices[1], /up to 2 MB/);
  assert.equal(s.body.children.length, 0);
});
