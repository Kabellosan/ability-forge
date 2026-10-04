import assert from "node:assert/strict";
import { createAtlas, gistId, schoolIdOf, canonSkill, spread, rangeOf, castingTimeOf, durationOf, damageOf, spellItem, spellSchool, bookOfMagicItems, BOM_PROFESSIONS } from "../scripts/lib.mjs";
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

// ---- Book of Magic → Dragonbane items
assert.equal(schoolIdOf("Performance", [...catalogue.schools, { id: "harmonism", name: "Harmonism" }]), "harmonism", "harmonists cast with Performance");
assert.equal(spellSchool("GENERAL MAGIC", "General"), "General");
assert.equal(spellSchool("HARMONISM"), "Performance");
assert.equal(spellSchool("NECROMANCY"), "Necromancy");
assert.deepEqual(rangeOf("20 meters (sphere)"), { rangeType: "sphere", range: 20, areaOfEffect: "sphere" });
assert.deepEqual(rangeOf("10 meters"), { rangeType: "range", range: 10, areaOfEffect: "none" });
assert.deepEqual(rangeOf("1 kilometer"), { rangeType: "range", range: 1000, areaOfEffect: "none" });
assert.equal(rangeOf("Touch").rangeType, "touch");
assert.equal(rangeOf("Personal/touch").rangeType, "personal");
assert.equal(castingTimeOf("Action/stretch/shift"), "action", "power level 1 value");
assert.equal(castingTimeOf("Round"), "special");
assert.equal(durationOf("Concentration"), "concentration");
assert.equal(durationOf("One day per power level"), "special");
assert.equal(durationOf(undefined), "instant");
assert.deepEqual(damageOf("The bolt deals 2D6 damage. Each power level beyond the first increases the damage by D6."), { damage: "2D6", damagePerPowerlevel: "D6" });
assert.deepEqual(damageOf("You heal a friend for 2D8 HP. For each power level beyond the first, the spell heals an additional D8 HP."), { damage: "-2D8", damagePerPowerlevel: "D8" });
assert.deepEqual(damageOf("The target takes 2D4 damage."), { damage: "", damagePerPowerlevel: "" }, "no per-level die stated: leave it to the text");
const chill = spellItem({ ...catalogue.magic.find((m) => m.id === "necromancy.chill"), requirement: "Word", castingTime: "Action", range: "10 meters", duration: "Instant" });
assert.equal(chill.type, "spell");
assert.equal(chill.system.school, "Necromancy");
assert.equal(chill.system.prerequisite, "Necromancy");
assert.equal(chill.system.range, 10);
assert.equal(chill.system.description, "<p>Cold fingers.</p>");
assert.equal(chill.flags["ability-forge"].id, "necromancy.chill");
const hush = spellItem(catalogue.magic.find((m) => m.id === "necromancy.hush"));
assert.equal(hush.system.rank, 0);
assert.equal(hush.system.memorized, true, "tricks are always prepared");
assert.equal(spellItem({ id: "a.r", kind: "recipe", name: "Brew", school: "ALCHEMY", rank: 1, text: "x", ingredients: "a root" }).system.castingTime, "special");
const bom = bookOfMagicItems(catalogue, { has: (type, name) => type === "spell" && name === "Mend" });
assert.ok(bom.skipped.includes("Mend"), "a spell the world already has stays untouched");
assert.ok(!Object.values(bom.groups).flat().some((i) => i.name === "Mend"));
assert.equal(bom.groups.Necromancy.length, 5);
assert.equal(bom.groups["General Magic"].length, 2);
assert.ok(bom.groups.Mages.some((i) => i.type === "skill" && i.name === "Demonology" && i.system.skillType === "magic"));
const necro = bom.groups.Mages.find((i) => i.type === "profession" && i.name === "Necromancer");
assert.ok(necro.system.skills.startsWith("Necromancy, "), "the school is a trained skill of the profession");
assert.equal(necro.system.attribute, "wil");
for (const p of BOM_PROFESSIONS) assert.equal(p.skills.length, 8, `${p.name}: eight profession skills`);
for (const i of bom.groups.Mages) assert.ok(!/undefined/.test(JSON.stringify(i)), i.name);

console.log("lib.test: ok");
