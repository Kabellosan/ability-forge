/**
 * Ability Forge — pure logic. No Foundry globals, no DOM: everything here runs in Node tests.
 *
 * createAtlas(catalogue) indexes a catalogue once. atlas.render(ctx) turns a view context
 * (who is looking, at which character, which constellation…) into HTML strings.
 */

export const ATTR = {
  Acrobatics: "AGL", Awareness: "INT", Bartering: "CHA", "Beast Lore": "INT", Bluffing: "CHA", Bushcraft: "INT",
  Crafting: "STR", Evade: "AGL", Healing: "INT", "Hunting & Fishing": "AGL", Languages: "INT", "Myths & Legends": "INT",
  Performance: "CHA", Persuasion: "CHA", Riding: "AGL", Seamanship: "INT", "Sleight of Hand": "AGL", Sneaking: "AGL",
  "Spot Hidden": "INT", Swimming: "AGL", Axes: "STR", Bows: "AGL", Brawling: "STR", Crossbows: "AGL", Hammers: "STR",
  Knives: "AGL", Slings: "AGL", Spears: "STR", Staves: "AGL", Swords: "STR"
};
export const WEAPONS = ["Axes", "Bows", "Brawling", "Crossbows", "Hammers", "Knives", "Slings", "Spears", "Staves", "Swords"];
export const MAGIC_SKILLS = ["Animism", "Demonology", "Elementalism", "Illusionism", "Mentalism", "Necromancy", "Symbolism",
  "Witchcraft", "Alchemy", "Enchanting", "Dracomancy"];
const ALIAS = { Swim: "Swimming" };
const KNOWN_SKILLS = [...Object.keys(ATTR), ...MAGIC_SKILLS];
export const baseChance = (a) => (a <= 5 ? 3 : a <= 8 ? 4 : a <= 12 ? 5 : a <= 15 ? 6 : 7);

export const SOURCE_LABEL = { core: "Core", "book-of-magic": "Book of Magic", homebrew: "Homebrew", svendsen: "Svendsen pack" };
export const SLOT_LABEL = { combat: "Combat", "non-combat": "Non-combat", either: "Either", untrainable: "Not trainable", undecided: "Undecided" };
export const STATUS_LABEL = { owned: "Has it", available: "Can take now", close: "Within reach", locked: "Locked" };
export const GROUPS = [["weapons", "Weapons"], ["strength", "Strength"], ["agility", "Agility"], ["intelligence", "Intelligence"],
  ["charisma", "Charisma"], ["open", "Untrained"], ["magic", "Magic"]];

export const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const escapeHTML = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const esc = escapeHTML;
const cap = (s) => String(s ?? "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Gist page link → gist id, or null. */
export function gistId(url) {
  const m = /^https?:\/\/gist\.github\.com\/(?:[\w-]+\/)?([0-9a-f]{20,})\/?(?:[#?].*)?$/i.exec(String(url ?? "").trim());
  return m ? m[1] : null;
}

/** A spell item's school string → school id. The system stores general magic as "DoD.spell.general". */
export function schoolIdOf(school, schools) {
  const s = String(school ?? "").trim();
  if (!s) return null;
  if (s === "DoD.spell.general" || /^general/i.test(s)) return "general-magic";
  if (/^performance$/i.test(s)) return "harmonism";     // harmonists cast with PERFORMANCE (see SPELL_SCHOOL)
  const id = slug(s);
  return schools.some((x) => x.id === id) ? id : null;
}

/** Skill name as written on a sheet → the name the catalogue uses. */
export function canonSkill(name) {
  const n = String(name ?? "").trim();
  const a = ALIAS[n] ?? n;
  return KNOWN_SKILLS.find((k) => k.toLowerCase() === a.toLowerCase()) ?? a;
}

/* ------------------------------------------------------------------ */
/*  Sky layout constants                                               */
/* ------------------------------------------------------------------ */
const TIER = 100, BASE = 92, TOP = 56, GAP = 108;

function rng(seed) { let x = seed || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; }
function hash(str) { let h = 7; for (const k of String(str)) h = (h * 31 + k.charCodeAt(0)) % 2147483647; return h; }

/** Spread stars along a row near where they want to be; stagger them when the row is crowded. */
export function spread(list, W) {
  list.sort((a, b) => a.want - b.want);
  const n = list.length, left = 60, right = W - 60;
  if (!n) return;
  if (n === 1) { list[0].x = Math.min(right, Math.max(left, list[0].want)); list[0].dy = 0; return; }
  if ((n - 1) * GAP <= right - left) {
    list.forEach((o, i) => { o.x = Math.max(o.want, i ? list[i - 1].x + GAP : left); o.dy = 0; });
    for (let i = n - 1; i >= 0; i--) list[i].x = Math.min(list[i].x, i < n - 1 ? list[i + 1].x - GAP : right);
    return;
  }
  const step = (right - left) / (n - 1);
  list.forEach((o, i) => { o.x = left + i * step; o.dy = i % 2 ? -38 : 0; });
}

/* ------------------------------------------------------------------ */
/*  The atlas                                                          */
/* ------------------------------------------------------------------ */

export function createAtlas(catalogue) {
  const D = catalogue;
  const ABIL = Object.fromEntries(D.abilities.map((a) => [a.id, a]));
  const MAGIC = Object.fromEntries(D.magic.map((m) => [m.id, m]));
  const SCHOOLS = D.schools;
  const schoolOfSpell = (m) => SCHOOLS.find((s) => s.name.toUpperCase() === m.school)?.id;

  // Name lookups for matching a character sheet's items to the catalogue.
  const abilityByName = new Map();
  for (const a of D.abilities) if (!abilityByName.has(slug(a.name))) abilityByName.set(slug(a.name), a.id);
  const spellByKey = new Map(), spellsByName = new Map();
  for (const m of D.magic) {
    spellByKey.set(`${schoolOfSpell(m)}/${slug(m.name)}`, m.id);
    spellsByName.set(slug(m.name), [...(spellsByName.get(slug(m.name)) ?? []), m.id]);
  }

  /** A plain summary of a character → the profile the atlas evaluates. */
  function profileFrom(sum) {
    const skills = {};
    for (const [n, v] of Object.entries(sum.skills ?? {})) skills[canonSkill(n)] = Number(v) || 0;
    const abilities = [], spells = [], unknown = [];
    for (const n of sum.abilities ?? []) {
      const id = abilityByName.get(slug(n)) ?? abilityByName.get(slug(String(n).replace(/\s*\(.*\)\s*$/, "")));
      id ? abilities.push(id) : unknown.push(n);
    }
    for (const sp of sum.spells ?? []) {
      const sid = schoolIdOf(sp.school, SCHOOLS);
      const same = spellsByName.get(slug(sp.name)) ?? [];
      const id = (sid && spellByKey.get(`${sid}/${slug(sp.name)}`)) ?? (same.length === 1 ? same[0] : null);
      id ? spells.push(id) : unknown.push(sp.name);
    }
    return { id: sum.id ?? null, name: sum.name ?? "", attrs: sum.attrs ?? {}, skills, abilities, spells, unknown };
  }

  // ---- view state: set by render(), read by everything below ---------------
  let S = { viewer: "gm", view: "sky", off: new Set(), q: "", sel: null, allMagic: false };
  let CH = null;
  const ch = () => CH;
  const memo = new Map();
  function use(ctx) {
    S = { viewer: "gm", view: "sky", q: "", sel: null, allMagic: false, width: 760, ...ctx, off: new Set(ctx.off ?? []) };
    CH = ctx.profile ?? null;
    memo.clear();
  }

  // ---- evaluation ------------------------------------------------------------
  function sv(c, skill) {
    skill = ALIAS[skill] ?? skill;
    if (skill in c.skills) return c.skills[skill];
    if (MAGIC_SKILLS.includes(skill)) return 0;
    return ATTR[skill] ? baseChance(c.attrs[ATTR[skill]] ?? 10) : 0;
  }
  function reqLabel(r) {
    if (!r) return "";
    if (r.type === "none") return "No requirement";
    if (r.type === "allOf") return r.of.map(reqLabel).join(" + ");
    if (r.type === "mastered") return (ABIL[r.ability]?.name ?? r.ability) + " mastered";
    if (r.type === "has") return r.of.map((o) => (ABIL[o.ability] ?? MAGIC[o.spell])?.name ?? o.ability ?? o.spell).join(" or ");
    if (r.group) return ({ melee: "Any melee weapon", weapon: "Any weapon skill", "str-melee": "Any STR melee weapon", magic: "Any magic school" })[r.group] + " " + r.level;
    if (r.skills) return r.skills.join(" / ") + " " + r.level;
    return r.raw || "Not printed";
  }
  function evalReq(r, c) {
    if (r.type === "none") return { met: true, gap: 0, rows: [] };
    if (r.type === "mastered") {
      const ok = c.abilities.includes(r.ability);
      return { met: ok, gap: ok ? 0 : 99, rows: [{ label: reqLabel(r), ok, id: r.ability }] };
    }
    if (r.type === "has") {
      const ok = r.of.some((o) => (o.ability ? c.abilities.includes(o.ability) : c.spells.includes(o.spell)));
      return { met: ok, gap: ok ? 0 : 99, rows: [{ label: reqLabel(r), ok, links: r.of.map((o) => o.ability ?? o.spell) }] };
    }
    if (r.type === "allOf") {
      const parts = r.of.map((p) => evalReq(p, c));
      return { met: parts.every((p) => p.met), gap: parts.reduce((s, p) => s + p.gap, 0), rows: parts.flatMap((p) => p.rows) };
    }
    if (r.skills) {
      let best = r.skills[0], bv = -1;
      for (const s of r.skills) { const v = sv(c, s); if (v > bv) { bv = v; best = s; } }
      const gap = Math.max(0, r.level - bv);
      return { met: gap === 0, gap, rows: [{ label: reqLabel(r), ok: gap === 0, have: bv, best: r.skills.length > 1 ? best : null }] };
    }
    return { met: false, gap: 99, rows: [{ label: reqLabel(r), ok: false }] };
  }
  const anySchool = (c) => MAGIC_SKILLS.some((s) => (c.skills[s] ?? 0) > 0);
  function hasSchool(c, sid) {
    if (!c) return false;
    if (sid === "general-magic") return anySchool(c);
    if (sid === "harmonism") return sv(c, "Performance") >= 12;
    const skill = MAGIC_SKILLS.find((s) => slug(s) === sid);
    return (c.skills[skill] ?? 0) > 0;
  }
  function optMet(o, c) {
    if (o.anySchool) return anySchool(c);
    if (o.spell) return c.spells.includes(o.spell);
    if (o.anyRank) return c.spells.some((id) => MAGIC[id] && MAGIC[id].kind !== "trick" && MAGIC[id].rank === o.anyRank && (!o.school || MAGIC[id].school === o.school));
    if (o.school) return hasSchool(c, slug(o.school));
    if (o.skill) return sv(c, o.skill) >= o.level;
    return false;
  }
  function prereqMet(p, c) {
    if (p.anyOf) return p.anyOf.some((o) => optMet(o, c));
    if (p.allOf) return p.allOf.every((o) => optMet(o, c));
    return false;
  }
  function optLabel(o) {
    if (o.anySchool) return "Any school of magic";
    if (o.spell) return MAGIC[o.spell]?.name ?? o.spell;
    if (o.anyRank) return `Any rank ${o.anyRank}${o.school ? " " + cap(o.school) : ""} spell`;
    if (o.school) return cap(o.school);
    if (o.skill) return `${o.skill} ${o.level}`;
    return o.text ?? "?";
  }
  /** owned | available | close | locked — or null when no character is chosen. */
  function statusOf(id, c = ch()) {
    if (!c) return null;
    if (memo.has(id)) return memo.get(id);
    memo.set(id, "locked");                                   // guards cycles
    let s;
    if (ABIL[id]) {
      const a = ABIL[id];
      if (c.abilities.includes(id)) s = "owned";
      else if (a.stub) s = "locked";
      else {
        const r = evalReq(a.requirement, c);
        s = r.met ? "available" : r.gap <= 2 ? "close" : "locked";
        if (a.status === "earned" && s === "available") s = "close";   // granted in play, never trained
      }
    } else {
      const m = MAGIC[id];
      if (!m) s = "locked";
      else if (c.spells.includes(id)) s = "owned";
      else if (m.kind === "trick") s = hasSchool(c, schoolOfSpell(m)) ? "available" : "locked";
      else if (prereqMet(m.prerequisite, c)) s = "available";
      else {
        const opts = m.prerequisite.anyOf ?? m.prerequisite.allOf ?? [];
        const unmet = opts.filter((o) => !optMet(o, c));
        const reachable = (o) => o.spell && statusOf(o.spell, c) === "available";
        s = unmet.length > 0 && (m.prerequisite.anyOf ? unmet.some(reachable) : unmet.every(reachable)) ? "close" : "locked";
      }
    }
    memo.set(id, s);
    return s;
  }

  // ---- constellations ----------------------------------------------------------
  function laneOf(a) {
    let r = a.requirement;
    if (r.type === "allOf") r = r.of.find((p) => p.skills) ?? r;
    if (a.stub) return { key: "Not printed", group: "open", level: 0 };
    if (r.type === "none") return { key: "No requirement", group: "open", level: 0 };
    const level = r.level ?? 0;
    if (r.group) return { key: reqLabel({ ...r, level: "" }).trim(), group: r.group === "magic" ? "magic" : "weapons", level, skills: r.skills, any: true };
    if (!r.skills) return { key: r.raw || "Other", group: "open", level: 0 };
    const skills = r.skills.map((x) => ALIAS[x] ?? x);
    const first = skills[0];
    const group = WEAPONS.includes(first) ? "weapons" : MAGIC_SKILLS.includes(first) ? "magic"
      : ({ STR: "strength", AGL: "agility", INT: "intelligence", CHA: "charisma" })[ATTR[first]] ?? "open";
    return { key: skills.join(" / "), group, level, skills };
  }
  // magic by nature, whatever the requirement says: the gateway, the mage pack, the enchanter's stub
  const groupOf = (a) => (a.id === "magic-talent" || a.source === "svendsen" || a.id === "book-of-magic.demonsmith") ? "magic" : laneOf(a).group;
  const showAllMagic = () => !ch() || (S.viewer === "gm" && S.allMagic);
  const sealed = (a) => S.viewer === "player" && a.status === "earned" && !(ch() && ch().abilities.includes(a.id));

  function tabItems(tab) {
    if (tab.startsWith("g-")) {
      const g = tab.slice(2), c = ch();
      let items = D.abilities.filter((a) => groupOf(a) === g && !(a.stub && S.viewer === "player"));
      if (g === "magic" && !showAllMagic()) {
        if (!anySchool(c)) return items.filter((a) => a.id === "magic-talent");      // the doorway, nothing else
        items = items.filter((a) => { const l = laneOf(a); return !l.skills || l.any || l.skills.some((k) => (c.skills[k] ?? 0) > 0); });
      }
      return items;
    }
    const school = SCHOOLS.find((s) => s.id === tab);
    return school ? D.magic.filter((m) => m.school === school.name.toUpperCase()) : [];
  }
  function constellations() {
    const all = [...GROUPS.map(([g, n]) => ({ id: "g-" + g, name: n, kind: "abilities" })),
      ...SCHOOLS.map((s) => ({ id: s.id, name: s.name, kind: "school" }))];
    return all.filter((k) => (k.kind === "abilities" ? tabItems(k.id).length > 0 : showAllMagic() || hasSchool(ch(), k.id)));
  }
  const tabOf = (id) => (ABIL[id] ? "g-" + groupOf(ABIL[id]) : MAGIC[id] ? schoolOfSpell(MAGIC[id]) : null);
  function passes(item) {
    if (S.q && (sealed(item) || !item.name.toLowerCase().includes(S.q.toLowerCase()))) return false;
    if (S.off.has("src:" + item.source)) return false;
    if (item.slot && S.off.has("slot:" + item.slot)) return false;
    const st = statusOf(item.id);
    if (st && S.off.has("st:" + st)) return false;
    return true;
  }
  const prereqSpells = (m) => ((m.prerequisite?.anyOf ?? m.prerequisite?.allOf) ?? []).filter((o) => o.spell).map((o) => o.spell);
  function reqRefs(r) {
    if (!r) return [];
    if (r.type === "allOf") return r.of.flatMap(reqRefs);
    if (r.type === "mastered") return [r.ability];
    if (r.type === "has") return r.of.map((o) => o.ability ?? o.spell);
    return [];
  }
  function unlocksOf(id) {
    const out = [];
    for (const a of D.abilities) if (a.upgradeOf === id || reqRefs(a.requirement).includes(id)) out.push(a.id);
    for (const m of D.magic) if (prereqSpells(m).includes(id)) out.push(m.id);
    return [...new Set(out)];
  }
  function lineage(id, edges) {
    const set = new Set([id]);
    const up = [id];
    while (up.length) { const x = up.pop(); for (const e of edges) if (e.to === x && !set.has(e.from)) { set.add(e.from); up.push(e.from); } }
    const down = [id];
    while (down.length) { const x = down.pop(); for (const e of edges) if (e.from === x && !set.has(e.to)) { set.add(e.to); down.push(e.to); } }
    return set;
  }

  // ---- sky layout ----------------------------------------------------------------
  function layoutSky(tab, W) {
    const c = ch(), items = tabItems(tab);
    const stars = [], edges = [], roots = [], byId = {};
    if (tab.startsWith("g-")) {
      const lanes = new Map();
      for (const a of items) {
        const l = a.id === "magic-talent" ? { key: "Magic Talent", skills: null } : laneOf(a);
        if (!lanes.has(l.key)) lanes.set(l.key, { key: l.key, skills: l.skills, items: [] });
        lanes.get(l.key).items.push(a);
      }
      const ls = [...lanes.values()].sort((x, y) => x.key.localeCompare(y.key));
      const laneFor = (a) => ls.find((l) => l.items.includes(a));
      const levels = [...new Set(items.map((a) => laneOf(a).level))].sort((x, y) => x - y);
      const H = TOP + BASE + levels.length * TIER + 40;
      const rootY = H - BASE;
      const spots = ls.map((l, i) => ({ l, want: (W * (i + 1)) / (ls.length + 1) }));
      spread(spots, W);
      for (const r of spots) {
        r.l.x = r.x; r.l.y = rootY + r.dy;
        const have = c && r.l.skills ? Math.max(...r.l.skills.map((k) => sv(c, k))) : null;
        roots.push({ x: r.x, y: r.l.y, label: r.l.key === "Magic Talent" ? "The gift" : r.l.key, value: have });
      }
      levels.forEach((lv, t) => {
        const tier = items.filter((a) => laneOf(a).level === lv).map((a) => ({ a, want: laneFor(a).x }));
        spread(tier, W);
        for (const s of tier) {
          const star = { id: s.a.id, item: s.a, x: s.x, y: rootY - (t + 1) * TIER + s.dy };
          stars.push(star); byId[star.id] = star;
          const lane = laneFor(s.a);
          edges.push({ fx: lane.x, fy: lane.y, to: s.a.id, root: true });
        }
      });
      for (const a of items) for (const ref of new Set([a.upgradeOf, ...reqRefs(a.requirement)].filter(Boolean)))
        if (byId[ref]) edges.push({ from: ref, to: a.id, dash: ref !== a.upgradeOf });
      return { H, stars, edges, roots, byId, levels: levels.map((lv, t) => ({ y: rootY - (t + 1) * TIER, label: lv ? "Skill " + lv : "No requirement" })) };
    }
    // a school: the school is the root, tricks flank it, ranks climb
    const school = SCHOOLS.find((s) => s.id === tab);
    const tricks = items.filter((m) => m.kind === "trick");
    const ranked = items.filter((m) => m.kind !== "trick");
    const ranks = [...new Set(ranked.map((m) => m.rank))].sort((x, y) => x - y);
    const H = TOP + BASE + ranks.length * TIER + 70;
    const rootY = H - BASE - 30, cx = W / 2;
    const skill = tab === "harmonism" ? "Performance" : MAGIC_SKILLS.find((k) => slug(k) === tab);
    roots.push({ x: cx, y: rootY, label: school.name, value: c && skill ? sv(c, skill) : null, big: true });
    tricks.forEach((m, i) => {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
      const st = { id: m.id, item: m, x: cx + side * (40 + k * 92), y: rootY + 30, small: true };
      stars.push(st); byId[m.id] = st;
      edges.push({ fx: cx, fy: rootY, to: m.id, root: true });
    });
    ranks.forEach((r, t) => {
      const tier = ranked.filter((m) => m.rank === r).map((m) => {
        const ps = prereqSpells(m).filter((p) => byId[p]);
        return { m, want: ps.length ? ps.reduce((sum, p) => sum + byId[p].x, 0) / ps.length : cx };
      });
      spread(tier, W);
      for (const s of tier) {
        const st = { id: s.m.id, item: s.m, x: s.x, y: rootY - (t + 1) * TIER + s.dy };
        stars.push(st); byId[st.id] = st;
      }
    });
    for (const m of ranked) {
      const p = m.prerequisite ?? {}, opts = p.anyOf ?? p.allOf ?? [];
      for (const sp of prereqSpells(m)) if (byId[sp]) edges.push({ from: sp, to: m.id, dash: !!p.anyOf && p.anyOf.length > 1 });
      if (opts.some((o) => o.school || o.anySchool || o.skill)) edges.push({ fx: cx, fy: rootY, to: m.id, root: true });
    }
    return { H, stars, edges, roots, byId, levels: ranks.map((r, t) => ({ y: rootY - (t + 1) * TIER, label: "Rank " + r })) };
  }

  function renderSky(tab, W) {
    const L = layoutSky(tab, W), c = ch();
    const links = L.edges.filter((e) => e.from);
    const rel = S.sel && L.byId[S.sel] ? lineage(S.sel, links) : null;
    const R = rng(hash(tab));
    let bg = "";
    for (let i = 0; i < 130; i++) bg += `<circle class="af-bgstar" cx="${(R() * W).toFixed(1)}" cy="${(R() * L.H).toFixed(1)}" r="${(0.3 + R() * 1.1).toFixed(2)}" opacity="${(0.15 + R() * 0.6).toFixed(2)}"/>`;
    const lv = L.levels.map((l) => `<text class="af-tier" x="14" y="${l.y + 4}">${esc(l.label)}</text>`).join("");
    let ed = "";
    for (const e of L.edges) {
      const b = L.byId[e.to]; if (!b) continue;
      const a = e.from ? L.byId[e.from] : { x: e.fx, y: e.fy };
      const lit = e.from && statusOf(e.from) === "owned" && statusOf(e.to) === "owned";
      const cls = ["af-edge", e.root ? "af-root-line" : "", e.dash ? "af-dash" : "", lit ? "af-lit" : "",
        rel ? (e.from && rel.has(e.from) && rel.has(e.to) ? "af-hot" : "af-dim") : ""].join(" ");
      const my = (a.y + b.y) / 2;
      ed += `<path class="${cls}" d="M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}"/>`;
    }
    let rt = "";
    for (const r of L.roots) {
      const k = r.big ? 11 : 7;
      rt += `<g class="af-root" transform="translate(${r.x},${r.y})"><path d="M0,${-k} L${k},0 L0,${k} L${-k},0 Z"/>
        <text y="${k + 16}">${esc(r.label)}${r.value != null ? ` <tspan class="af-v">${r.value}</tspan>` : ""}</text></g>`;
    }
    let st = "";
    for (const s of L.stars) {
      const it = s.item, status = statusOf(it.id), seal = sealed(it);
      const cls = ["af-star", status ? "af-s-" + status : "", seal ? "af-sealed" : "", S.sel === it.id ? "af-sel" : "",
        passes(it) ? "" : "af-faded", rel && !rel.has(it.id) ? "af-dimstar" : ""].join(" ");
      const r = s.small ? 3 : status === "owned" ? 6 : status === "locked" ? 3.6 : 4.8;
      const name = seal ? "Sealed" : it.name;
      st += `<g class="${cls}" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(name)}${status ? ", " + STATUS_LABEL[status] : ""}" transform="translate(${s.x},${s.y})">
        <circle class="af-halo" r="${r * 3}" filter="url(#af-glow)"/><circle class="af-core" r="${r}"/><circle class="af-ring" r="${r + 6}"/>
        <text y="${r + 15}"${s.small ? ' font-size="10.5"' : ""}>${esc(name)}</text></g>`;
    }
    const list = constellations(), i = list.findIndex((k) => k.id === tab);
    const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
    const here = list[i] ?? { name: tab };
    let sub;
    if (c) {
      const cnt = { owned: 0, available: 0, close: 0 };
      for (const s of L.stars) { const k = statusOf(s.id); if (k in cnt) cnt[k]++; }
      const main = L.roots.length === 1 && L.roots[0].value != null ? `${esc(L.roots[0].label)} ${L.roots[0].value} · ` : "";
      sub = `${esc(c.name)}: ${main}${cnt.owned} lit · ${cnt.available} open · ${cnt.close} in reach`;
    } else sub = `${L.stars.length} stars`;
    return `<div class="af-sky"><svg class="${S.turn ? "af-turn-" + S.turn : ""}" viewBox="0 0 ${W} ${L.H}" width="${W}" height="${L.H}" role="img" aria-label="${esc(here.name)} constellation">
        <defs><filter id="af-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
        ${bg}${lv}${ed}${rt}${st}</svg>
      <div class="af-cap"><button type="button" class="af-prev" data-tab="${prev.id}" data-dir="l" aria-label="Previous constellation">‹ ${esc(prev.name)}</button>
        <div class="af-cap-name"><h2>${esc(here.name)}</h2><p>${sub}</p></div>
        <button type="button" class="af-next" data-tab="${next.id}" data-dir="r" aria-label="Next constellation">${esc(next.name)} ›</button></div></div>`;
  }

  // ---- cards (rules text always on the card) ---------------------------------
  function requirementLine(it) {
    if (ABIL[it.id]) return reqLabel(it.requirement);
    if (it.kind === "trick") return "Magic trick · 1 WP";
    const p = it.prerequisite;
    return p?.raw ? "Needs " + (p.anyOf ?? p.allOf).map(optLabel).join(p.allOf ? " and " : " or ") : "";
  }
  function renderCards(tab) {
    const order = { owned: 0, available: 1, close: 2, locked: 3 };
    const items = tabItems(tab).filter(passes)
      .sort((a, b) => ((order[statusOf(a.id)] ?? 0) - (order[statusOf(b.id)] ?? 0)) || (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name));
    if (!items.length) return `<p class="af-empty">Nothing matches these filters.</p>`;
    return `<div class="af-cards">${items.map((it) => {
      const st = statusOf(it.id);
      const cls = `af-card ${st ? "af-s-" + st : ""} ${S.sel === it.id ? "af-sel" : ""}`;
      if (sealed(it)) return `<article class="${cls} af-sealed" data-id="${esc(it.id)}" tabindex="0"><h3>Sealed</h3><p class="af-req">Earned in play. The GM grants it when the story earns it.</p></article>`;
      const right = ABIL[it.id] ? (it.wp ? `${esc(it.wp)} WP` : "") : it.rank ? `Rank ${it.rank}` : "";
      return `<article class="${cls}" data-id="${esc(it.id)}" tabindex="0"><h3>${esc(it.name)}</h3>
        <p class="af-req">${esc(requirementLine(it))}</p>
        ${it.text ? `<p class="af-text">${esc(it.text)}</p>` : ""}
        <p class="af-foot"><span>${esc(SOURCE_LABEL[it.source] ?? it.source)}${it.slot ? " · " + SLOT_LABEL[it.slot] : ""}</span><span>${right}</span></p></article>`;
    }).join("")}</div>`;
  }

  // ---- detail panel ------------------------------------------------------------
  function link(id) {
    const it = ABIL[id] ?? MAGIC[id];
    if (!it) return esc(id);
    const st = statusOf(id);
    return `<button type="button" class="af-link" data-id="${esc(id)}" data-jump="1">${esc(it.name)}</button>${st ? ` <span class="af-meta">· ${STATUS_LABEL[st].toLowerCase()}</span>` : ""}`;
  }
  function renderDetail() {
    const it = S.sel && (ABIL[S.sel] ?? MAGIC[S.sel]);
    const c = ch();
    if (!it) {
      const unknown = c?.unknown?.length ? `<p class="af-empty">Not on the map: ${c.unknown.map(esc).join(", ")}.</p>` : "";
      return `<div class="af-kicker">How to read this</div>
        <p>One constellation at a time. Turn the sky with the arrows or the arrow keys. Each skill or school is a root at the bottom; stars climb by the skill level or rank they need, and lines run up to what each one opens.</p>
        <div class="af-legend"><span class="af-chip af-s-owned">Lit: has it</span><span class="af-chip af-s-available">Can take now</span><span class="af-chip af-s-close">Within reach</span><span class="af-chip af-s-locked">Locked</span></div>
        ${unknown}`;
    }
    const st = statusOf(it.id);
    if (sealed(it)) return `<div class="af-kicker">Heroic ability</div><h2>Sealed</h2><p>Some abilities cannot be trained. The GM grants them when something in the story earns them.</p>`;
    const isAb = !!ABIL[it.id];
    let h = `<div class="af-kicker">${isAb ? "Heroic ability" : it.kind === "trick" ? "Magic trick" : cap(it.kind)} · ${esc(SOURCE_LABEL[it.source] ?? it.source)}${it.page ? " p. " + it.page : ""}</div><h2>${esc(it.name)}</h2>`;
    if (c && st) {
      const earnedMet = isAb && it.status === "earned" && st === "close" && evalReq(it.requirement, c).met;
      const why = earnedMet ? `${c.name} meets the requirement. It is granted in play, not trained.`
        : { owned: `${c.name} has it.`, available: `${c.name} meets the requirement.`, close: isAb ? `${c.name} is within two points.` : `${c.name} is one spell away.`, locked: `${c.name} does not meet it yet.` }[st];
      h += `<div class="af-verdict af-s-${st}">${esc(why)}</div>`;
    }
    if (it.text) h += `<p class="af-rules">${esc(it.text)}</p>`;
    else if (it.stub) h += `<p class="af-empty">The Book of Magic names this ability but never prints its rules. Write it as homebrew to put it on the map.</p>`;
    const dl = [];
    if (isAb) {
      dl.push(["Requires", esc(reqLabel(it.requirement))], ["WP", esc(it.wp || "—")]);
      if (it.status) dl.push(["Status", esc({ granted: "Granted", "on-offer": "On offer, trainable", earned: "Earned in play only" }[it.status] ?? it.status)]);
      if (it.training) dl.push(["Training", `starts at ${it.training.start ?? "?"}, mastered at ${it.training.mastery ?? "?"}`]);
    } else {
      if (it.rank) dl.push(["Rank", it.rank]);
      dl.push(["School", esc(cap(it.school))]);
      for (const [k, l] of [["requirement", "Casting needs"], ["castingTime", "Casting time"], ["range", "Range"], ["duration", "Duration"], ["ingredients", "Ingredients"], ["cost", "Cost"]])
        if (it[k]) dl.push([l, esc(it[k])]);
    }
    if (it.slot) dl.push(["Training slot", it.slot === "either" ? "Either: fills whichever slot is free" : it.slot === "untrainable" ? "Not trainable: skill 18 or granted" : SLOT_LABEL[it.slot]]);
    else if (it.kind === "trick") dl.push(["Training slot", "None: tricks are not trained"]);
    h += `<dl>${dl.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    if (isAb && it.requirement.type !== "none" && c) {
      const rows = evalReq(it.requirement, c).rows;
      if (rows.length) h += `<h4>Check for ${esc(c.name)}</h4><ul>${rows.map((r) => `<li><span class="${r.ok ? "af-ok" : "af-no"}">${r.ok ? "✓" : "✗"}</span> ${r.id ? link(r.id) : r.links ? r.links.map(link).join(" or ") : esc(r.label)}${r.have != null ? ` · has ${r.have}${r.best ? " (" + esc(r.best) + ")" : ""}` : ""}</li>`).join("")}</ul>`;
    }
    if (!isAb && it.prerequisite && it.kind !== "trick") {
      const p = it.prerequisite, opts = p.anyOf ?? p.allOf ?? [];
      h += `<h4>Needs ${opts.length > 1 ? (p.allOf ? "all of" : "one of") : ""}</h4><ul>${opts.map((o) => `<li>${c ? `<span class="${optMet(o, c) ? "af-ok" : "af-no"}">${optMet(o, c) ? "✓" : "✗"}</span> ` : ""}${o.spell ? link(o.spell) : esc(optLabel(o))}</li>`).join("")}</ul>`;
    }
    const un = unlocksOf(it.id);
    if (un.length) h += `<h4>Opens</h4><ul>${un.map((id) => `<li>${link(id)}</li>`).join("")}</ul>`;
    if (it.details && S.viewer === "gm") h += `<div class="af-gmnote"><b>GM notes</b>\n${esc(it.details.replace(/\*\*|`|\*/g, ""))}</div>`;
    return h;
  }

  // ---- strip + chips ---------------------------------------------------------------
  function renderStrip(list) {
    const c = ch();
    return list.map((k, i) => {
      const n = c ? tabItems(k.id).filter((x) => statusOf(x.id) === "available").length : 0;
      const sep = i && k.kind !== list[i - 1].kind ? '<span class="af-sep"></span>' : "";
      return sep + `<button type="button" role="tab" aria-selected="${S.tab === k.id}" data-tab="${k.id}">${esc(k.name)}${n ? `<span class="af-n" title="Can take now">${n}</span>` : ""}</button>`;
    }).join("");
  }
  function renderChips(items) {
    const c = ch();
    const chip = (key, label) => `<button type="button" class="af-chip" data-chip="${key}" aria-pressed="${!S.off.has(key)}">${esc(label)}</button>`;
    const sources = [...new Set(items.map((i) => i.source))];
    const slots = ["combat", "non-combat", "either", "untrainable"].filter((k) => items.some((i) => i.slot === k));
    let h = "";
    if (sources.length > 1) h += `<span class="af-lbl">Source</span>${sources.map((s) => chip("src:" + s, SOURCE_LABEL[s] ?? s)).join("")}`;
    if (slots.length) h += `<span class="af-lbl">Slot</span>${slots.map((k) => chip("slot:" + k, SLOT_LABEL[k])).join("")}`;
    if (c) h += `<span class="af-lbl">Show</span>${Object.entries(STATUS_LABEL).map(([k, v]) => chip("st:" + k, v)).join("")}`;
    return h;
  }

  /** Everything the window shows, for one view context. */
  function render(ctx) {
    use(ctx);
    const list = constellations();
    if (!list.some((k) => k.id === S.tab)) S.tab = list[0]?.id;
    const items = S.tab ? tabItems(S.tab) : [];
    return {
      tab: S.tab,
      constellations: list,
      strip: renderStrip(list),
      chips: renderChips(items),
      stage: !S.tab ? `<p class="af-empty">Nothing to show.</p>` : S.view === "cards" ? renderCards(S.tab) : renderSky(S.tab, S.width),
      detail: renderDetail()
    };
  }

  return {
    ABIL, MAGIC, SCHOOLS, profileFrom, render, tabOf,
    // exposed for tests
    statusOf: (id, ctx) => { use(ctx); return statusOf(id); },
    tabItems: (tab, ctx) => { use(ctx); return tabItems(tab); },
    constellations: (ctx) => { use(ctx); return constellations(); },
    layoutSky: (tab, W, ctx) => { use(ctx); return layoutSky(tab, W); }
  };
}

/* ------------------------------------------------------------------ */
/*  Book of Magic → world items                                        */
/* ------------------------------------------------------------------ */
// The character creation tool and the sheet read professions, school skills and spells as plain
// world items, so a school "exists" in Foundry once these items do. Skill lists are the Book of
// Magic's suggested starting skills (names only); every description here is our own words.

const SPELL_NOTE = "Starts with three rank 1 spells and three magic tricks from this school or general magic.";
export const BOM_SCHOOL_SKILLS = ["Demonology", "Illusionism", "Necromancy", "Symbolism", "Witchcraft", "Alchemy", "Enchanting", "Dracomancy"];
export const BOM_PROFESSIONS = [
  { name: "Demonologist", school: "Demonology", attribute: "wil",
    skills: ["Demonology", "Bartering", "Bluffing", "Evade", "Languages", "Myths & Legends", "Persuasion", "Sneaking"],
    note: `${SPELL_NOTE} Expect suspicion, or worse, in civilized lands.` },
  { name: "Illusionist", school: "Illusionism", attribute: "wil",
    skills: ["Illusionism", "Bartering", "Bluffing", "Evade", "Performance", "Persuasion", "Sleight of Hand", "Sneaking"], note: SPELL_NOTE },
  { name: "Necromancer", school: "Necromancy", attribute: "wil",
    skills: ["Necromancy", "Awareness", "Bluffing", "Healing", "Languages", "Myths & Legends", "Sneaking", "Spot Hidden"],
    note: `${SPELL_NOTE} Expect suspicion, or worse, in civilized lands.` },
  { name: "Symbolist", school: "Symbolism", attribute: "wil",
    skills: ["Symbolism", "Awareness", "Crafting", "Evade", "Myths & Legends", "Sleight of Hand", "Sneaking", "Spot Hidden"], note: SPELL_NOTE },
  { name: "Witch", school: "Witchcraft", attribute: "wil",
    skills: ["Witchcraft", "Awareness", "Beast Lore", "Bluffing", "Healing", "Myths & Legends", "Persuasion", "Sneaking"], note: SPELL_NOTE },
  { name: "Alchemist", school: "Alchemy", attribute: "wil",
    skills: ["Alchemy", "Bartering", "Beast Lore", "Bushcraft", "Healing", "Myths & Legends", "Sleight of Hand", "Spot Hidden"],
    note: "Alchemists learn recipes instead of spells. Starts with three rank 1 recipes and three magic tricks." },
  { name: "Enchanter", school: "Enchanting", attribute: "wil",
    skills: ["Enchanting", "Bartering", "Crafting", "Hammers", "Knives", "Myths & Legends", "Sleight of Hand", "Spot Hidden"],
    note: "Needs CRAFTING 12 to learn Enchanting, also at character creation. One piece of starting gear may carry an enchantment." },
  { name: "Bard (Harmonist)", school: "Harmonism", attribute: "cha",
    skills: ["Performance", "Acrobatics", "Bluffing", "Evade", "Knives", "Languages", "Myths & Legends", "Persuasion"],
    note: "A bard who knows harmonism: instead of the Musician heroic ability, starts with three rank 1 harmonism spells and three harmonism tricks. Harmonism is cast with PERFORMANCE and cannot learn general magic." }
];

const title = (s) => cap(s).replace(/\b(Of|And|The)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

/** The catalogue's school (e.g. "NECROMANCY") → the school string a Dragonbane spell item carries. */
export function spellSchool(catSchool, generalName = "General") {
  const s = String(catSchool ?? "").toUpperCase();
  if (s === "GENERAL MAGIC") return generalName;
  if (s === "HARMONISM") return "Performance";        // not a skill of its own: the sheet rolls PERFORMANCE
  return title(s);
}

/** "Action/stretch/shift" → "action": the power level 1 value, if the system knows it. */
function pick(raw, allowed, fallback) {
  const first = String(raw ?? "").trim().toLowerCase().split(/[\/ ,(]/)[0];
  return allowed.includes(first) ? first : fallback;
}
export const castingTimeOf = (raw, fallback = "action") => raw ? pick(raw, ["action", "reaction", "stretch", "shift"], "special") : fallback;
export const durationOf = (raw, fallback = "instant") => raw ? pick(raw, ["instant", "round", "stretch", "shift", "concentration", "permanent"], "special") : fallback;

/** "20 meters (sphere)" → { rangeType: "sphere", range: 20, areaOfEffect: "sphere" }. */
export function rangeOf(raw) {
  const r = String(raw ?? "").trim().toLowerCase();
  if (!r) return { rangeType: "range", range: 0, areaOfEffect: "none" };      // unknown: the sheet shows "-"
  if (r.startsWith("touch")) return { rangeType: "touch", range: 0, areaOfEffect: "none" };
  if (r.startsWith("personal")) return { rangeType: "personal", range: 0, areaOfEffect: "none" };
  const m = /^(\d+)\s*(meters?|m|kilometers?|km)\b/.exec(r);
  const range = m ? Number(m[1]) * (/^k/.test(m[2]) ? 1000 : 1) : 0;
  const shape = /\((sphere|cone)\)/.exec(r)?.[1];
  return shape ? { rangeType: shape, range, areaOfEffect: shape } : { rangeType: "range", range, areaOfEffect: "none" };
}

/** Damage or healing dice, only when the text states both the base and the per-power-level die plainly. */
export function damageOf(text) {
  const t = String(text ?? "").replace(/\s+/g, " ");
  const heal = /\bheals? [^.]*?\b(\d)D(\d+) HP/i.exec(t);
  const hurt = /\b(?:inflicts?|inflicting|takes?|suffers?|deals?)\b[^.]*?\b(\d)D(\d+)\b(?: \w+)? damage/i.exec(t);
  const hit = heal && (!hurt || heal.index < hurt.index) ? heal : hurt;
  if (!hit) return { damage: "", damagePerPowerlevel: "" };
  const die = hit[2];
  const per = new RegExp(`(?:power level[^.]*?(?:additional|another|by)|(?:additional|another) D${die}[^.]*?power level)[^.]*?\\bD${die}\\b|\\bD${die}\\b[^.]*?per power level`, "i");
  if (!per.test(t)) return { damage: "", damagePerPowerlevel: "" };
  return { damage: `${hit === heal ? "-" : ""}${hit[1]}D${die}`, damagePerPowerlevel: `D${die}` };
}

export const textToHTML = (text) => String(text ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean)
  .map((l) => `<p>${esc(l)}</p>`).join("");

/** One catalogue magic entry → a Dragonbane spell item's data (tricks are rank 0, recipes and enchantments ride along as spells). */
export function spellItem(e, generalName = "General") {
  const school = spellSchool(e.school, generalName);
  const rank = e.kind === "trick" ? 0 : Number(e.rank) || 0;
  const odd = e.kind === "recipe" || e.kind === "enchantment";     // brewed or crafted, not cast: the text says how long
  const extra = [e.ingredients && `Ingredients: ${e.ingredients}`, e.cost && `Cost: ${e.cost}`].filter(Boolean);
  return {
    name: e.name,
    type: "spell",
    system: {
      description: textToHTML([...extra, e.text].join("\n")),
      school,
      rank,
      prerequisite: e.prerequisite?.raw || (rank === 0 ? school : ""),
      requirement: e.requirement ?? "",
      castingTime: castingTimeOf(e.castingTime, odd ? "special" : "action"),
      ...rangeOf(e.range),
      duration: durationOf(e.duration, odd ? "special" : "instant"),
      ...damageOf(e.text),
      memorized: rank === 0
    },
    flags: { "ability-forge": { id: e.id, source: e.source ?? "book-of-magic" } }
  };
}

export const schoolSkillItem = (name) => ({
  name, type: "skill",
  system: { description: "", skillType: "magic", attribute: "int", value: 0, advance: 0, hideTrained: false },
  flags: { "ability-forge": { id: `skill.${slug(name)}`, source: "book-of-magic" } }
});

export const professionItem = (p) => ({
  name: p.name, type: "profession",
  system: { description: `<p>${esc(p.note)}</p><p><em>Book of Magic, ${esc(p.school)}.</em></p>`, attribute: p.attribute, skills: p.skills.join(", "), abilities: "" },
  flags: { "ability-forge": { id: `profession.${slug(p.name)}`, source: "book-of-magic" } }
});

/**
 * Everything the Book of Magic adds, as item data grouped by folder.
 * `has(type, name)` says whether the world already holds an item of that name that isn't ours (core set copies stay untouched).
 */
export function bookOfMagicItems(catalogue, { generalName = "General", has = () => false } = {}) {
  const groups = { Mages: [] }, skipped = [];
  for (const n of BOM_SCHOOL_SKILLS) has("skill", n) ? skipped.push(n) : groups.Mages.push(schoolSkillItem(n));
  for (const p of BOM_PROFESSIONS) has("profession", p.name) ? skipped.push(p.name) : groups.Mages.push(professionItem(p));
  for (const e of catalogue.magic ?? []) {
    if (e.source && e.source !== "book-of-magic") continue;
    if (has("spell", e.name)) { skipped.push(e.name); continue; }
    const folder = title(e.school);
    (groups[folder] ??= []).push(spellItem(e, generalName));
  }
  return { groups, skipped };
}
