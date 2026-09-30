#!/usr/bin/env python3
"""Bundle catalogue + homebrew into a slim JSON for the view prototype.

Book entries keep names, stat lines and links only; their prose stays out.
Only the Captain's own homebrew keeps its text.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
book = json.loads((ROOT / "data/book-catalogue.json").read_text())
home = json.loads((ROOT / "data/homebrew.json").read_text())

KEEP = ("id", "kind", "name", "source", "school", "rank", "page", "requirement", "prerequisite", "wp",
        "castingTime", "range", "duration", "ingredients", "cost", "status", "upgradeOf", "training",
        "fits", "grantedTo")
slim = lambda e: {k: e[k] for k in KEEP if k in e}

abilities = [slim(e) for e in book["abilities"]]
for e in home["abilities"]:
    s = slim(e)
    if e["source"] == "homebrew":      # the Captain's own words
        s["text"] = e["text"]
        s["details"] = e.get("details", "")
    abilities.append(s)
# Demonsmith: named in the Book of Magic, never defined (beta gap)
abilities.append({"id": "book-of-magic.demonsmith", "kind": "ability", "name": "Demonsmith", "source": "book-of-magic",
                  "requirement": {"raw": "not printed", "type": "unknown"}, "wp": "?", "stub": True})
slots_file = ROOT / "data/slots.json"
slots = json.loads(slots_file.read_text()) if slots_file.exists() else {}
def with_slot(e):
    if e["id"] in slots:
        e["slot"] = slots[e["id"]] or "undecided"
    return e
abilities = [with_slot(a) for a in abilities]
out = {"abilities": abilities, "schools": [{k: s[k] for k in ("id", "name", "study")} for s in book["schools"]],
       "magic": [with_slot(slim(e)) for e in book["magic"]]}
chars_file = ROOT / "private/characters.json"
if chars_file.exists():
    out["characters"] = json.loads(chars_file.read_text())
(ROOT / "data/prototype.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(len(abilities), "abilities,", len(out["magic"]), "magic,", (ROOT / "data/prototype.json").stat().st_size // 1024, "KB")
