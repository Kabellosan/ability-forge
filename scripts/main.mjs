import * as L from "./lib.mjs";

const MOD = "ability-forge";
const log = (...a) => console.log("Ability Forge |", ...a);
const ApplicationV2 = foundry.applications.api.ApplicationV2;

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  game.settings.register(MOD, "catalogue", {
    name: "Private catalogue link",
    hint: "A secret GitHub gist (paste the gist page link) holding catalogue.json, or any URL or world file path serving it. The catalogue carries the rules text, so it never ships with this public module. Players could read this link from the browser console.",
    scope: "world", config: true, restricted: true, type: String, default: "",
    onChange: () => { catalogue = null; AbilityForgeApp.instance?.render(); }
  });
  game.settings.register(MOD, "playersCanOpen", {
    name: "Players can open Ability Forge",
    hint: "For their own characters only. They never see the GM notes, and earned-in-play abilities stay sealed until they have them.",
    scope: "world", config: true, restricted: true, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  game.modules.get(MOD).api = { open: (actor) => AbilityForgeApp.open(actor), reload: () => { catalogue = null; } };
  log("ready — open with game.modules.get('ability-forge').api.open(actor)");
});

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

let catalogue = null;   // Promise<atlas>

function loadAtlas() {
  catalogue ??= fetchCatalogue().then((data) => L.createAtlas(data)).catch((err) => { catalogue = null; throw err; });
  return catalogue;
}

async function fetchCatalogue() {
  const url = String(game.settings.get(MOD, "catalogue") ?? "").trim();
  if (!url) throw new Error("No catalogue yet. The GM pastes the private catalogue link in the module settings.");
  const id = L.gistId(url);
  if (!id) return getJSON(url);
  const res = await fetch(`https://api.github.com/gists/${id}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for the catalogue gist. Check the link in the module settings.`);
  const gist = await res.json();
  const files = Object.values(gist.files ?? {});
  const file = files.find((f) => f.filename === "catalogue.json") ?? files.find((f) => f.filename.endsWith(".json"));
  if (!file) throw new Error("The catalogue gist has no catalogue.json.");
  // The gist API cuts files over 1 MB short; the raw link always has the whole thing.
  return file.truncated ? getJSON(file.raw_url) : JSON.parse(file.content);
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load the catalogue (${res.status}) from ${url}.`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Characters                                                         */
/* ------------------------------------------------------------------ */

const isCharacter = (a) => a?.type === "character";
function canOpen(actor) {
  if (game.user.isGM) return true;
  if (!game.settings.get(MOD, "playersCanOpen")) return false;
  return !actor || (isCharacter(actor) && actor.isOwner);
}
function characters() {
  return game.actors.filter((a) => isCharacter(a) && (game.user.isGM || a.isOwner)).sort((a, b) => a.name.localeCompare(b.name));
}

/** What the atlas needs from a Dragonbane character: plain data, matched to the catalogue by name. */
function actorSummary(actor) {
  const s = actor.system ?? {}, at = s.attributes ?? {};
  const val = (k) => Number(at[k]?.value ?? 10);
  const skills = {}, abilities = [], spells = [];
  for (const i of actor.items ?? []) {
    if (i.type === "skill") skills[i.name] = Number(i.system?.value ?? 0);
    else if (i.type === "ability" && !["kin", "profession"].includes(i.system?.abilityType)) abilities.push(i.name);
    else if (i.type === "spell") spells.push({ name: i.name, school: i.system?.school, rank: Number(i.system?.rank ?? 0) });
  }
  return { id: actor.id, name: actor.name, attrs: { STR: val("str"), CON: val("con"), AGL: val("agl"), INT: val("int"), WIL: val("wil"), CHA: val("cha") }, skills, abilities, spells };
}

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document;
  if (!isCharacter(actor) || !canOpen(actor)) return;
  controls.push({ icon: "fa-solid fa-star", label: "Ability Forge", action: "abilityForge", onClick: () => AbilityForgeApp.open(actor) });
});
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (!isCharacter(app.actor) || !canOpen(app.actor)) return;
  buttons.unshift({ label: "Ability Forge", class: "ability-forge-open", icon: "fa-solid fa-star", onclick: () => AbilityForgeApp.open(app.actor) });
});
Hooks.on("renderActorDirectory", (app, html) => {
  if (!canOpen(null)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".af-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "af-open";
  btn.innerHTML = `<i class="fa-solid fa-star"></i> Ability Forge`;
  btn.addEventListener("click", () => AbilityForgeApp.open());
  (root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root).append(btn);
});

// Keep an open window in step with the character it shows.
const refresh = (actor) => { const app = AbilityForgeApp.instance; if (app?.rendered && actor?.id === app.af.actorId) app.softRender(); };
Hooks.on("updateActor", (actor) => refresh(actor));
for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, (item) => refresh(item.parent));

/* ------------------------------------------------------------------ */
/*  The window                                                         */
/* ------------------------------------------------------------------ */

class AbilityForgeApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ability-forge",
    tag: "div",
    classes: ["ability-forge"],
    window: { title: "Ability Forge", icon: "fa-solid fa-star", resizable: true },
    position: { width: 1120, height: 780 }
  };

  static instance = null;

  static async open(actor = null) {
    if (!canOpen(actor)) return ui.notifications.warn("Ability Forge: you can only open it for your own characters.");
    actor ??= game.user.character && canOpen(game.user.character) ? game.user.character : characters()[0] ?? null;
    let app = AbilityForgeApp.instance;
    if (!app) app = AbilityForgeApp.instance = new AbilityForgeApp();
    if (actor) app.af.actorId = actor.id;
    return app.render({ force: true });
  }

  constructor() {
    super();
    this.af = { actorId: null, tab: null, view: "sky", sel: null, q: "", off: new Set(), allMagic: false, preview: false, width: 760, turn: null, lastPlace: null };
  }

  get actor() { return this.af.actorId ? game.actors.get(this.af.actorId) : null; }
  get viewer() { return game.user.isGM && !this.af.preview ? "gm" : "player"; }

  /** Re-render without losing the search box's focus or the sky's scroll. */
  softRender() { return this.render(); }

  async _renderHTML() {
    const s = this.af;
    let atlas;
    try { atlas = await loadAtlas(); }
    catch (err) {
      return `<div class="af-message"><h2>Ability Forge</h2><p>${L.escapeHTML(err.message)}</p>
        ${game.user.isGM ? `<button type="button" data-act="reload">Try again</button>` : ""}</div>`;
    }
    const actor = this.actor;
    const profile = actor ? atlas.profileFrom(actorSummary(actor)) : null;
    const out = atlas.render({ profile, viewer: this.viewer, allMagic: s.allMagic, tab: s.tab, view: s.view, sel: s.sel, q: s.q, off: s.off, width: s.width, turn: s.turn });
    s.tab = out.tab;
    s.turn = null;
    const chars = characters();
    const picker = `<select data-act="actor" aria-label="Character">
        ${game.user.isGM ? `<option value="" ${!actor ? "selected" : ""}>Nobody (show everything)</option>` : ""}
        ${chars.map((a) => `<option value="${a.id}" ${a.id === s.actorId ? "selected" : ""}>${L.escapeHTML(a.name)}</option>`).join("")}
      </select>`;
    const gm = game.user.isGM ? `
        <button type="button" class="af-toggle" data-act="preview" aria-pressed="${s.preview}" title="See it the way a player does">Player view</button>
        ${actor && !s.preview ? `<button type="button" class="af-toggle" data-act="allMagic" aria-pressed="${s.allMagic}" title="Show magic this character cannot use">All magic</button>` : ""}
        <button type="button" class="af-icon" data-act="reload" title="Reload the catalogue"><i class="fa-solid fa-rotate"></i></button>` : "";
    return `
      <div class="af-bar">
        ${picker}
        <div class="af-seg" role="group" aria-label="View">
          <button type="button" data-view="sky" aria-pressed="${s.view === "sky"}">Sky</button><button type="button" data-view="cards" aria-pressed="${s.view === "cards"}">Cards</button>
        </div>
        <input type="search" data-act="q" value="${L.escapeHTML(s.q)}" placeholder="Search by name" aria-label="Search by name">
        <span class="af-spacer"></span>
        ${gm}
      </div>
      <nav class="af-strip" role="tablist">${out.strip}</nav>
      <div class="af-chips">${out.chips}</div>
      <div class="af-body">
        <div class="af-stage">${out.stage}</div>
        <aside class="af-detail" aria-live="polite">${out.detail}</aside>
      </div>`;
  }

  _replaceHTML(result, content) {
    const stage = content.querySelector?.(".af-stage");
    const keepScroll = stage && this.af.lastPlace === `${this.af.tab}/${this.af.view}` ? stage.scrollTop : null;
    const hadFocus = content.querySelector?.("[data-act=q]") === document.activeElement;
    content.innerHTML = result;
    const next = content.querySelector?.(".af-stage");
    const place = `${this.af.tab}/${this.af.view}`;
    if (next) next.scrollTop = keepScroll ?? (this.af.view === "sky" ? next.scrollHeight : 0);   // a new sky opens at its roots
    this.af.lastPlace = place;
    if (hadFocus) { const q = content.querySelector("[data-act=q]"); q?.focus(); q?.setSelectionRange?.(q.value.length, q.value.length); }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;
    // The sky is drawn to the stage's width; redraw once when the window's real width is known.
    const w = root.querySelector(".af-stage")?.clientWidth;
    if (w && Math.abs(w - 2 - this.af.width) > 24) { this.af.width = Math.max(560, w - 2); this.render(); }
    if (root.dataset.afWired) return;
    root.dataset.afWired = "1";
    root.addEventListener("click", (e) => this.#onClick(e));
    root.addEventListener("keydown", (e) => this.#onKey(e));
    root.addEventListener("input", (e) => {
      if (e.target.dataset?.act !== "q") return;
      this.af.q = e.target.value.trim();
      this.render();
    });
    root.addEventListener("change", (e) => {
      if (e.target.dataset?.act !== "actor") return;
      this.af.actorId = e.target.value || null;
      this.af.sel = null;
      this.render();
    });
  }

  _onPosition(position) {
    super._onPosition?.(position);
    clearTimeout(this._resize);
    this._resize = setTimeout(() => this.rendered && this.render(), 150);
  }

  #turn(step) {
    const list = [...this.element.querySelectorAll(".af-strip [data-tab]")].map((b) => b.dataset.tab);
    const i = list.indexOf(this.af.tab);
    if (i < 0 || !list.length) return;
    this.af.tab = list[(i + step + list.length) % list.length];
    this.af.sel = null;
    this.af.turn = step < 0 ? "l" : "r";
    this.render();
  }

  async #onClick(e) {
    const t = e.target.closest("button, [data-id]");
    if (!t || !this.element.contains(t)) return;
    const s = this.af, d = t.dataset;
    if (d.tab) { s.turn = d.dir ?? null; s.tab = d.tab; s.sel = null; s.off = new Set([...s.off].filter((k) => !k.startsWith("src:"))); return this.render(); }
    if (d.view) { s.view = d.view; return this.render(); }
    if (d.chip) { s.off.has(d.chip) ? s.off.delete(d.chip) : s.off.add(d.chip); return this.render(); }
    if (d.act === "preview") { s.preview = !s.preview; return this.render(); }
    if (d.act === "allMagic") { s.allMagic = !s.allMagic; return this.render(); }
    if (d.act === "reload") { catalogue = null; return this.render(); }
    if (d.id) {
      if (d.jump) {
        const atlas = await loadAtlas();
        const tab = atlas.tabOf(d.id);
        if (tab && this.element.querySelector(`.af-strip [data-tab="${tab}"]`)) s.tab = tab;
        s.sel = d.id;
      } else s.sel = s.sel === d.id ? null : d.id;
      return this.render();
    }
  }

  #onKey(e) {
    if (e.target.matches?.("input, select, textarea")) return;
    if (e.key === "ArrowLeft" && this.af.view === "sky") { e.preventDefault(); this.#turn(-1); }
    else if (e.key === "ArrowRight" && this.af.view === "sky") { e.preventDefault(); this.#turn(1); }
    else if ((e.key === "Enter" || e.key === " ") && e.target.dataset?.id) {
      e.preventDefault();
      // SVG stars have no click(); cards do. Either way, exactly one click.
      if (typeof e.target.click === "function") e.target.click();
      else e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }

  async close(options) {
    AbilityForgeApp.instance = null;
    return super.close(options);
  }
}
