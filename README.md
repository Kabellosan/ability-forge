# Ability Forge

A Foundry VTT module for **Dragonbane**: heroic abilities and spells as a Skyrim-style night sky. One constellation at a time. Each skill or school is a root at the bottom, stars climb by the skill level or rank they need, and lines run up to whatever each one opens. Pick a character and the sky lights up: what they have, what they can take now, what is within reach.

- **Constellations:** heroic abilities by attribute group (Weapons, Strength, Agility, Intelligence, Charisma, Untrained, Magic), plus one per school of magic.
- **Only the magic a character can use.** A school appears once they know it (General Magic once they know any school). A character with no magic sees one star in the Magic constellation: Magic Talent.
- **Rules text on every card**, for players too. Homebrew GM notes stay with the GM; abilities earned in play stay sealed until a character has them.
- **Filters** by source, training slot and status; search by name. Turn the sky with the arrows or the arrow keys.

## Install

Manifest URL: `https://github.com/Kabellosan/ability-forge/releases/latest/download/module.json`

Foundry v13–v14, Dragonbane system 4.x.

## The catalogue

This module ships **no rules text**. It reads a `catalogue.json` from a link you set in the module settings (*Private catalogue link*): a secret GitHub gist, or any URL or world file path that serves the JSON. Build the catalogue from books you own.

Shape (see `tests/fixture.mjs` for a complete small example):

```json
{
  "version": 1,
  "schools": [{ "id": "necromancy", "name": "Necromancy" }],
  "abilities": [{ "id": "keen-eye", "name": "Keen Eye", "source": "core", "wp": "1", "slot": "non-combat",
                  "requirement": { "type": "skill", "skills": ["Awareness"], "level": 12 }, "text": "…" }],
  "magic": [{ "id": "necromancy.chill", "kind": "spell", "name": "Chill", "school": "NECROMANCY", "rank": 1,
              "prerequisite": { "anyOf": [{ "school": "NECROMANCY" }] }, "text": "…" }]
}
```

Characters are read from their sheets: skill items, heroic ability items and spell items, matched to the catalogue by name. Anything that doesn't match is listed as *Not on the map*.

## Opening it

- The **Ability Forge** button in a character sheet's header.
- The **Ability Forge** button in the Actors sidebar.
- A macro: `game.modules.get("ability-forge").api.open(actor)`.

Players open it for their own characters (switch off in settings). The GM can pick any character or nobody, preview the player view, and show all magic.

## Tools (for building a catalogue)

`tools/` holds the scripts that build the author's catalogue: a parser for the rulebook text, an exporter for homebrew kept in an Obsidian vault, and a view prototype. Book text and campaign data stay in `private/` and `data/`, which are never committed.

## Tests

```bash
cd tests && node lib.test.mjs && node smoke.test.mjs
```
