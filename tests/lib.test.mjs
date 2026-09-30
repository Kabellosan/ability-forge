import assert from "node:assert/strict";
import { createAtlas, gistId, schoolIdOf, canonSkill, spread } from "../scripts/lib.mjs";
import { catalogue, necromancer, ranger } from "./fixture.mjs";

const A = createAtlas(catalogue);

// ---- small helpers
assert.equal(gistId("https://gist.github.com/someone/0123456789abcdef0123"), "0123456789abcdef0123");
assert.equal(gistId("https://example.com/catalogue.json"), null);
assert.equal(schoolIdOf("DoD.spell.general", catalogue.schools), "general-magic");
assert.equal(schoolIdOf("General Magic", catalogue.schools), "general-magic");
assert.equal(schoolIdOf("Necromancy", catalogue.schools), "necromancy");
assert.equal(schoolIdOf("Pyromancy", catalogue.schools), null);
assert.equal(canonSkill("hunting & fishing"), "Hunting & Fishing");
assert.equal(canonSkill("Swim"), "Swimming");

// ---- a sheet becomes a profile; unknown items are reported, not dropped silently
const vessa = A.profileFrom(necromancer), orm = A.profileFrom(ranger);
assert.deepEqual(vessa.abilities, ["keen-eye"]);
assert.deepEqual(vessa.unknown, ["Army of Two"]);
assert.deepEqual(vessa.spells.sort(), ["general-magic.glimmer", "necromancy.chill"]);
assert.deepEqual(orm.abilities, ["companion"], "a named companion still matches");

// ---- statuses
const st = (p, id, viewer = "player") => A.statusOf(id, { profile: p, viewer });
assert.equal(st(vessa, "keen-eye"), "owned");
assert.equal(st(vessa, "spell-weaver"), "available", "any magic school 12");
assert.equal(st(vessa, "necromancy.whisper"), "available");
assert.equal(st(vessa, "necromancy.frost-grip"), "available", "she knows Chill");
assert.equal(st(vessa, "necromancy.cold-heart"), "close", "one of its prerequisites is open to her");
assert.equal(st(vessa, "animism.mend"), "locked");
assert.equal(st(vessa, "homebrew.sixth-sense"), "close", "earned abilities are never 'can take now'");
assert.equal(st(orm, "homebrew.wolf-call"), "available", "Beast Lore 10 and a companion");
assert.equal(st(orm, "homebrew.pack-leader"), "locked", "needs Wolf Call mastered");
assert.equal(st(orm, "shield-wall"), "close", "Knives 11 is one short");
assert.equal(st(null, "keen-eye"), null, "no character, no status");

// ---- who sees which magic
const ids = (p, viewer = "player", allMagic = false) => A.constellations({ profile: p, viewer, allMagic }).map((k) => k.id);
assert.deepEqual(ids(vessa).filter((x) => !x.startsWith("g-")), ["general-magic", "necromancy"]);
assert.deepEqual(ids(orm).filter((x) => !x.startsWith("g-")), [], "no school, no school constellations");
assert.deepEqual(A.tabItems("g-magic", { profile: orm, viewer: "player" }).map((a) => a.id), ["magic-talent"], "only the doorway");
assert.ok(ids(orm, "gm", true).includes("animism"), "the GM's All magic shows everything");
assert.ok(!ids(orm, "player", true).includes("animism"), "players never get All magic");
assert.ok(ids(null).includes("animism"), "no character: everything");

// ---- rendering
const out = A.render({ profile: vessa, viewer: "player", tab: "necromancy", width: 800 });
assert.equal(out.tab, "necromancy");
assert.ok(out.stage.includes("<svg") && out.stage.includes('data-id="necromancy.frost-grip"'));
assert.ok(out.strip.includes('data-tab="general-magic"') && !out.strip.includes('data-tab="animism"'));
const fallback = A.render({ profile: orm, viewer: "player", tab: "necromancy" });
assert.equal(fallback.tab, "g-weapons", "a hidden constellation falls back to the first visible one");
const sealed = A.render({ profile: vessa, viewer: "player", tab: "g-intelligence", view: "cards" });
assert.ok(sealed.stage.includes("Sealed") && !sealed.stage.includes("Sixth Sense"), "players see earned abilities sealed");
const gm = A.render({ profile: vessa, viewer: "gm", tab: "g-agility", sel: "homebrew.wolf-call" });
assert.ok(gm.detail.includes("GM notes"), "GM sees the notes");
const pl = A.render({ profile: vessa, viewer: "player", tab: "g-agility", sel: "homebrew.wolf-call" });
assert.ok(!pl.detail.includes("GM notes") && pl.detail.includes("Your animal answers"), "players see the rules, not the notes");
const cards = A.render({ profile: vessa, viewer: "player", tab: "necromancy", view: "cards" });
assert.ok(cards.stage.includes("The cold holds."), "rules text on the card face");
const filtered = A.render({ profile: vessa, viewer: "player", tab: "necromancy", view: "cards", off: ["st:locked", "st:close"] });
assert.ok(!filtered.stage.includes("Cold Heart"));
assert.ok(A.render({ profile: vessa, viewer: "player" }).detail.includes("Not on the map: Army of Two"));

// ---- layout: nothing leaves the sky, crowded rows stay readable
for (const tab of ids(null)) {
  const L = A.layoutSky(tab, 700, { profile: null });
  for (const s of L.stars) assert.ok(s.x >= 0 && s.x <= 700 && s.y > 0 && s.y < L.H, `${tab}: ${s.id} off the sky`);
}
const row = Array.from({ length: 20 }, (_, i) => ({ want: 350 }));
spread(row, 700);
for (let i = 1; i < row.length; i++) {
  const same = row.filter((o, j) => j !== i && o.dy === row[i].dy);
  assert.ok(same.every((o) => Math.abs(o.x - row[i].x) >= 56), "stars on the same line keep their distance");
}

console.log("lib.test: ok");
