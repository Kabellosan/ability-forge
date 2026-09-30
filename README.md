# Ability Forge

A Foundry VTT module for Dragonbane: a map of heroic abilities and spells — what each one needs,
what it unlocks, and what a given character can reach from where they stand.

**Status:** data layer only. The Foundry module comes after the view prototype is workshopped.

## Data

- `tools/extract.py` — parses the Core Rulebook and Book of Magic text (`private/books/`, gitignored)
  into `data/book-catalogue.json`, and checks the result against the book's own index.
- `tools/export_vault.py --campaign DIR` — mirrors a campaign's `Custom-Heroic-Abilities.md`
  into `data/homebrew.json`. The vault note is the source; never edit the JSON by hand.

Book text is Free League's and never enters this repo. `private/` and `data/` are gitignored;
catalogues reach Foundry through a secret gist.
