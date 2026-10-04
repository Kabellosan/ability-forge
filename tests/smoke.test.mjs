// Minimal Foundry mock: load the module, fetch the catalogue from a (fake) gist,
// open the window for a GM and for a player, and check what each one gets.
import assert from "node:assert/strict";
import { catalogue } from "./fixture.mjs";

const hooks = {};
globalThis.Hooks = { once: (n, f) => (hooks[n] ??= []).push(f), on: (n, f) => (hooks[n] ??= []).push(f) };
const call = (n, ...a) => (hooks[n] ?? []).forEach((f) => f(...a));
const warnings = [];
globalThis.ui = { notifications: { info() {}, warn: (m) => warnings.push(m), error: (m) => warnings.push(m) } };
globalThis.document = { activeElement: null };

class ApplicationV2 {
  #s = 0;
  constructor(o = {}) { this.options = { ...this.constructor.DEFAULT_OPTIONS, ...o }; }
  get state() { return this.#s; }            // read-only, like Foundry's
  get rendered() { return this.#s === 2; }
  async render() {
    const html = await this._renderHTML();
    const content = { innerHTML: "", querySelector: () => null };
    this._replaceHTML(html, content);
    this.#s = 2; this.lastHTML = html; this._onRender?.({}, {});
    return this;
  }
  async close() { this.#s = 0; }
}
let confirmed = 0;
globalThis.foundry = { applications: { api: { ApplicationV2, DialogV2: { confirm: async () => (confirmed++, true) } } } };

// World items and folders, for "Add the Book of Magic".
const worldItems = [], folders = [];
let nid = 0;
globalThis.Folder = { create: async (d) => { const f = { id: `f${++nid}`, ...d, folder: d.folder ? folders.find((x) => x.id === d.folder) : null }; folders.push(f); return f; } };
globalThis.Item = {
  createDocuments: async (list) => list.map((d) => { const i = { id: `i${++nid}`, ...d }; worldItems.push(i); return i; }),
  updateDocuments: async (list) => list.map((u) => Object.assign(worldItems.find((i) => i.id === u._id), u))
};

// Settings
const store = {}, registered = {};
let user = { isGM: true, character: null };
globalThis.game = {
  get user() { return user; },
  settings: {
    register: (m, k, o) => { registered[k] = o; store[k] = o.default; },
    get: (m, k) => store[k],
    set: async (m, k, v) => { store[k] = v; }
  },
  modules: new Map([["ability-forge", {}]]),
  i18n: { localize: (k) => (k === "DoD.spell.general" ? "General" : k) },
  items: worldItems,
  folders,
  actors: null
};

// A Dragonbane-shaped actor: skills, abilities and spells are items.
const item = (type, name, system = {}) => ({ type, name, system });
const vessa = {
  id: "a1", name: "Vessa", type: "character", isOwner: false,
  system: { attributes: { str: { value: 10 }, con: { value: 12 }, agl: { value: 9 }, int: { value: 15 }, wil: { value: 14 }, cha: { value: 10 } } },
  items: [item("skill", "Awareness", { value: 13 }), item("skill", "Necromancy", { value: 12, skillType: "magic" }),
    item("ability", "Keen Eye", { abilityType: "heroic" }), item("ability", "Adaptive", { abilityType: "kin" }),
    item("spell", "Chill", { school: "Necromancy", rank: 1 }), item("spell", "Glimmer", { school: "DoD.spell.general", rank: 0 })]
};
const orm = { id: "a2", name: "Orm", type: "character", isOwner: true, system: { attributes: {} },
  items: [item("skill", "Hunting & Fishing", { value: 13 }), item("ability", "Companion (Brisk)", { abilityType: "heroic" })] };
const actors = [vessa, orm, { id: "m1", name: "Troll", type: "monster", items: [] }];
game.actors = Object.assign(actors, { get: (id) => actors.find((a) => a.id === id) });

// The catalogue lives in a secret gist; the API truncates big files, the raw link has them whole.
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(url);
  if (url.startsWith("https://api.github.com/gists/")) return { ok: true, json: async () => ({ files: {
    "readme.md": { filename: "readme.md", content: "private" },
    "catalogue.json": { filename: "catalogue.json", truncated: true, raw_url: "https://gist.githubusercontent.com/raw/catalogue.json" } } }) };
  if (url === "https://gist.githubusercontent.com/raw/catalogue.json") return { ok: true, json: async () => catalogue };
  return { ok: false, status: 404 };
};

await import("../scripts/main.mjs");
call("init");
call("ready");
assert.ok(registered.catalogue && registered.playersCanOpen, "settings registered");
const api = game.modules.get("ability-forge").api;

// No link yet: a clear message, no crash.
let app = await api.open(vessa);
assert.match(app.lastHTML, /pastes the private catalogue link/);
await app.close();

// With the gist link: the truncated file comes from its raw URL.
store.catalogue = "https://gist.github.com/captain/0123456789abcdef0123";
api.reload();
app = await api.open(vessa);
assert.ok(fetched.includes("https://gist.githubusercontent.com/raw/catalogue.json"));
assert.ok(app.lastHTML.includes("<svg"), "the sky renders");
assert.ok(app.lastHTML.includes('data-tab="necromancy"') && !app.lastHTML.includes('data-tab="animism"'), "Vessa sees her own magic only");
assert.ok(app.lastHTML.includes("Nobody (show everything)"), "the GM can look at everything");
assert.ok(app.lastHTML.includes("Player view"), "the GM can preview the player view");
assert.ok(!app.lastHTML.includes(">Troll<"), "monsters are not in the character list");

// GM adds the Book of Magic to the world: once creates, twice refreshes; the core set's own copy is left alone.
assert.ok(app.lastHTML.includes('data-act="addBom"'), "the GM has the Book of Magic button");
worldItems.push({ id: "core1", name: "Mend", type: "spell", flags: {}, system: { school: "Animism" } });
let res = await api.addBookOfMagic();
assert.equal(confirmed, 1, "asks first");
assert.ok(res.created > 10 && res.updated === 0);
assert.ok(res.skipped.includes("Mend"));
assert.equal(worldItems.filter((i) => i.name === "Mend").length, 1);
assert.ok(worldItems.some((i) => i.type === "profession" && i.name === "Demonologist"), "character creation can now offer a demonologist");
const chillItem = worldItems.find((i) => i.name === "Chill");
assert.equal(folders.find((f) => f.id === chillItem.folder).name, "Necromancy");
assert.equal(folders.find((f) => f.id === chillItem.folder).folder.name, "Book of Magic");
const count = worldItems.length;
res = await api.addBookOfMagic({ confirm: false });
assert.equal(res.created, 0);
assert.equal(worldItems.length, count, "re-running makes no duplicates");
assert.equal(folders.filter((f) => f.name === "Book of Magic").length, 1);

// GM switches on All magic: every school appears.
app.af.allMagic = true; await app.render();
assert.ok(app.lastHTML.includes('data-tab="animism"'));
// Player view hides All magic again.
app.af.preview = true; await app.render();
assert.ok(!app.lastHTML.includes('data-tab="animism"') && !app.lastHTML.includes("All magic"));
await app.close();

// A player: only their own character, no GM controls.
user = { isGM: false, character: orm };
store.playersCanOpen = true;
warnings.length = 0;
await api.open(vessa);
assert.match(warnings[0] ?? "", /only open it for your own characters/);
app = await api.open();
assert.equal(app.af.actorId, "a2", "opens on the player's own character");
assert.ok(!app.lastHTML.includes("Player view") && !app.lastHTML.includes("Nobody") && !app.lastHTML.includes("addBom"), "no GM controls");
warnings.length = 0;
await api.addBookOfMagic();
assert.match(warnings[0] ?? "", /only the GM/);
assert.ok(!app.lastHTML.includes('data-tab="necromancy"'), "no schools for a non-mage");
store.playersCanOpen = false;
warnings.length = 0;
await app.close();
await api.open();
assert.ok(warnings.length, "players locked out when the setting is off");

console.log("smoke.test: ok");
