#!/usr/bin/env bash
# Rebuild the catalogue from the books + the vault, and push it to the secret catalogue gist.
# Foundry picks it up on the next open (or the GM's reload button). No module release needed.
#
#   tools/publish_catalogue.sh            # uses ~/ability-forge-catalogue (a clone of the gist)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GIST="${ABILITY_FORGE_GIST_DIR:-$HOME/ability-forge-catalogue}"
V="${ABILITY_FORGE_VAULT:-/home/captain/cloud-lab/obsidian-data/vault/Ikairos-Server/Capt. Kabel Pairate Vault/50 TTRPG Sanctum}"

[ -d "$GIST/.git" ] || { echo "No gist clone at $GIST. Clone the catalogue gist there first."; exit 1; }
python3 "$ROOT/tools/export_vault.py" --campaign "$V/Veritapola" \
  --slots "$V/63 TTRPG Systems/Dragonbane/Dragonbane - Training Slots (Homebrew).md"
python3 "$ROOT/tools/build_catalogue.py" --out "$GIST/catalogue.json"
cd "$GIST"
git add catalogue.json
if git diff --cached --quiet; then echo "Catalogue unchanged."; exit 0; fi
git commit -qm "Catalogue $(date +%F)"
git push -q
echo "Pushed. In Foundry: reopen Ability Forge, or press its reload button."
