// A tiny invented catalogue in the real shape. Original content only: the book text never enters this repo.
export const catalogue = {
  version: 1,
  schools: [
    { id: "general-magic", name: "General Magic", study: null },
    { id: "animism", name: "Animism", study: null },
    { id: "necromancy", name: "Necromancy", study: null }
  ],
  abilities: [
    { id: "keen-eye", kind: "ability", name: "Keen Eye", source: "core", slot: "non-combat", wp: "1",
      requirement: { raw: "Awareness 12", type: "skill", skills: ["Awareness"], level: 12 }, text: "You spot what others miss." },
    { id: "shield-wall", kind: "ability", name: "Shield Wall", source: "core", slot: "combat", wp: "2",
      requirement: { raw: "Any melee weapon skill 12", type: "anyOf", group: "melee", skills: ["Axes", "Knives", "Swords"], level: 12 }, text: "Brace together." },
    { id: "companion", kind: "ability", name: "Companion", source: "core", slot: "non-combat", wp: "3",
      requirement: { raw: "Hunting & Fishing 12", type: "skill", skills: ["Hunting & Fishing"], level: 12 }, text: "An animal follows you." },
    { id: "brave", kind: "ability", name: "Brave", source: "core", slot: "combat", wp: "2", requirement: { raw: "—", type: "none" }, text: "Fear slides off you." },
    { id: "magic-talent", kind: "ability", name: "Magic Talent", source: "core", slot: "untrainable", wp: "—", requirement: { raw: "—", type: "none" }, text: "Learn a school." },
    { id: "spell-weaver", kind: "ability", name: "Spell Weaver", source: "core", slot: "combat", wp: "3",
      requirement: { raw: "Any magic school 12", type: "anyOf", group: "magic", skills: ["Animism", "Necromancy"], level: 12 }, text: "Two spells at once." },
    { id: "homebrew.wolf-call", kind: "ability", name: "Wolf Call", source: "homebrew", status: "on-offer", slot: "combat", wp: "2",
      requirement: { raw: "Beast Lore 10 + COMPANION", type: "allOf", of: [{ type: "skill", skills: ["Beast Lore"], level: 10 }, { type: "has", of: [{ ability: "companion" }] }] },
      text: "Your animal answers across a valley.", details: "- GM only: it will not come into a town." },
    { id: "homebrew.pack-leader", kind: "ability", name: "Pack Leader", source: "homebrew", status: "on-offer", slot: "combat", wp: "3", upgradeOf: "homebrew.wolf-call",
      requirement: { raw: "WOLF CALL mastered + BEAST LORE 12", type: "allOf", of: [{ type: "mastered", ability: "homebrew.wolf-call" }, { type: "skill", skills: ["Beast Lore"], level: 12 }] }, text: "Two animals answer." },
    { id: "homebrew.sixth-sense", kind: "ability", name: "Sixth Sense", source: "homebrew", status: "earned", slot: "combat", wp: "1",
      requirement: { raw: "AWARENESS 12", type: "skill", skills: ["Awareness"], level: 12 }, text: "Never surprised." }
  ],
  magic: [
    { id: "general-magic.ward", kind: "spell", name: "Ward", source: "book-of-magic", school: "GENERAL MAGIC", rank: 1, slot: "combat",
      prerequisite: { raw: "Any school of magic", anyOf: [{ anySchool: true }] }, text: "A shimmer turns a blow." },
    { id: "general-magic.glimmer", kind: "trick", name: "Glimmer", source: "book-of-magic", school: "GENERAL MAGIC", rank: 0, text: "A small light." },
    { id: "necromancy.chill", kind: "spell", name: "Chill", source: "book-of-magic", school: "NECROMANCY", rank: 1, slot: "combat",
      prerequisite: { raw: "Necromancy", anyOf: [{ school: "NECROMANCY" }] }, text: "Cold fingers." },
    { id: "necromancy.whisper", kind: "spell", name: "Whisper", source: "book-of-magic", school: "NECROMANCY", rank: 1, slot: "non-combat",
      prerequisite: { raw: "Necromancy", anyOf: [{ school: "NECROMANCY" }] }, text: "The dead talk." },
    { id: "necromancy.frost-grip", kind: "spell", name: "Frost Grip", source: "book-of-magic", school: "NECROMANCY", rank: 2, slot: "combat",
      prerequisite: { raw: "CHILL", anyOf: [{ spell: "necromancy.chill" }] }, text: "The cold holds." },
    { id: "necromancy.cold-heart", kind: "spell", name: "Cold Heart", source: "book-of-magic", school: "NECROMANCY", rank: 3, slot: "combat",
      prerequisite: { raw: "FROST GRIP or WHISPER", anyOf: [{ spell: "necromancy.frost-grip" }, { spell: "necromancy.whisper" }] }, text: "Stops a heart." },
    { id: "necromancy.hush", kind: "trick", name: "Hush", source: "book-of-magic", school: "NECROMANCY", rank: 0, text: "Silence a candle." },
    { id: "animism.mend", kind: "spell", name: "Mend", source: "book-of-magic", school: "ANIMISM", rank: 1, slot: "combat",
      prerequisite: { raw: "Animism", anyOf: [{ school: "ANIMISM" }] }, text: "Close a wound." }
  ]
};

// What a Foundry character sheet summary looks like (see actorSummary in main.mjs).
export const necromancer = {
  id: "a1", name: "Vessa",
  attrs: { STR: 10, CON: 12, AGL: 9, INT: 15, WIL: 14, CHA: 10 },
  skills: { Awareness: 13, Necromancy: 12, "Beast Lore": 5, Swords: 7 },
  abilities: ["Keen Eye", "Army of Two"],
  spells: [{ name: "Chill", school: "Necromancy", rank: 1 }, { name: "Glimmer", school: "DoD.spell.general", rank: 0 }]
};
export const ranger = {
  id: "a2", name: "Orm",
  attrs: { STR: 12, CON: 13, AGL: 15, INT: 10, WIL: 11, CHA: 9 },
  skills: { "Hunting & Fishing": 13, "Beast Lore": 11, Awareness: 12, Knives: 11 },
  abilities: ["Companion (Brisk)"],
  spells: []
};
