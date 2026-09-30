# Ability Forge — context for Claude

Foundry VTT module for Captain's Dragonbane campaign: a map of heroic abilities and spells — what each needs, what it opens, and what a given character can reach. For new players' overview and for the Captain's homebrew training rules.

## Design decisions (and why)

- **The map is a Skyrim-style sky** (Captain, 2026-09-30). One constellation at a time; turn with arrows/arrow keys. Heroic abilities are split by attribute group (Weapons, Strength, Agility, Intelligence, Charisma, Untrained, Magic); each school is its own constellation. Roots (the skill or school) sit at the bottom, stars climb by level or rank, lines run up to what they open. Lit = held, bright = open now, ring = within reach, dark = locked. The sky is night in both themes on purpose.
- **Characters see only the magic they can use.** A school's constellation shows only if the character knows it (General Magic once they know any school; Harmonism at Performance 12). A non-mage's Magic constellation holds one star, Magic Talent: the doorway. The GM has an "All magic" toggle. Svendsen pack and Demonsmith always count as Magic.
- **Tabs:** Heroic Abilities, then General Magic and one per school.
- **Everything filterable** (source, status, training slot, search). 50–300 entries at once must not overwhelm.
- **Rules text always visible on the cards in Foundry** (Captain, 2026-09-30). Full text on the card face, for players too. GM notes (the bullets under a homebrew ability) stay GM-only. Sealed earned-in-play cards stay sealed in player view.
- **No card art for now** (Captain, 2026-09-30: "maybe later"). A 16-image pilot in the Face Forge token style (GPT Image 1.5 edit, 8 refs from `~/face-forge-style`, `~/.fal_key`) worked well; script and contact sheets in `private/art-pilot/`. If revived: art for every entry or none, high fidelity, one editable brief per entry.
- **No teachers.** The Book of Magic's school Masters are extracted but not shown (Captain declined).
- **Book text stays private.** Free League text never enters this repo (public later). `private/` and `data/` are gitignored; the catalogue reaches Foundry via a secret gist, like Terrain Forge's tables. The claude.ai prototype carries stat lines only, never book prose.
- **The vault is where the Captain writes.** Homebrew abilities come from `Veritapola/Custom-Heroic-Abilities.md` (granted ones' text from the character sheets); training slots from `63 TTRPG Systems/Dragonbane/Dragonbane - Training Slots (Homebrew).md`. Both are mirrored by `tools/export_vault.py`; never hand-edit the JSON.
- **Training slots:** combat / non-combat / either (fills whichever slot is free; keep it short) / undecided. Tricks are untrainable. Rulings: healing = combat, condition cures = non-combat.
- **Book of Magic is beta 3** (Captain: nothing changed in the final).

## Pipeline

```bash
python3 tools/extract.py                     # private/books/*.txt → data/book-catalogue.json + extract-report.txt
V="/home/captain/cloud-lab/obsidian-data/vault/Ikairos-Server/Capt. Kabel Pairate Vault/50 TTRPG Sanctum"
python3 tools/export_vault.py --campaign "$V/Veritapola" \
  --slots "$V/63 TTRPG Systems/Dragonbane/Dragonbane - Training Slots (Homebrew).md"   # → homebrew.json, slots.json
python3 tools/prototype_data.py              # → data/prototype.json (no book prose)
```

Book text came from NotebookLM notebook "DBV Max" (`f3f4b3cd`): `notebooklm source fulltext -n f3f4b3cd <source> -o private/books/<file>.txt` — Core `4e288c73`, Book of Magic `9c4d9cb4`. Verbatim indexed text, not a synthesis.

The extractor checks itself against the Book of Magic's index. Remaining report lines are real book faults, not parser bugs: Dimensional Travel's prerequisite is missing its first half; typos WARDING MAR and INVIGORATING CONCOCTION are auto-resolved. Demonsmith is named in the book but never defined (a stub on the map).

## Open threads (2026-09-30)

- Captain to rule on three slot groups: summoned servants, always-on abilities (suggested: untrainable), spell modifiers (suggested: Either).
- Player visibility beyond the sealed cards still being workshopped on the prototype (https://claude.ai/artifact/UvV2pUYQshFGYFyDgp9Q2W).
- Foundry build not started. Environment will match Terrain Forge: Foundry v14, Dragonbane system 4.1.1 on Sqyre, manifest-URL installs. Heroic abilities are `ability` items with `abilityType: "heroic"` and a free-text `requirement`.
