#!/usr/bin/env python3
"""Merge book extraction + vault homebrew + training slots → data/catalogue.json.

This is the file the Foundry module loads (from the secret gist). It carries the full
rules text, so it never enters this repo.

  python3 tools/build_catalogue.py [--out PATH]
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DATA / "catalogue.json"))
    args = ap.parse_args()

    book = json.loads((DATA / "book-catalogue.json").read_text(encoding="utf-8"))
    home = json.loads((DATA / "homebrew.json").read_text(encoding="utf-8"))
    slots_file = DATA / "slots.json"
    slots = json.loads(slots_file.read_text(encoding="utf-8")) if slots_file.exists() else {}

    abilities = book["abilities"] + home["abilities"]
    # Named in the Book of Magic, never defined (beta gap): a stub the Captain can replace with homebrew.
    abilities.append({"id": "book-of-magic.demonsmith", "kind": "ability", "name": "Demonsmith", "source": "book-of-magic",
                      "requirement": {"raw": "not printed", "type": "unknown"}, "wp": "?", "stub": True, "text": ""})
    magic = book["magic"]
    for e in abilities + magic:
        if e["id"] in slots:
            e["slot"] = slots[e["id"]] or "undecided"
        e.pop("grantedTo", None)          # who holds it comes from the actors, not the catalogue

    schools = [{"id": s["id"], "name": s["name"], "study": s.get("study")} for s in book["schools"]]
    out = {"version": 1, "abilities": abilities, "magic": magic, "schools": schools}

    ids = [e["id"] for e in abilities + magic]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"duplicate ids: {sorted(dupes)}")
    path = Path(args.out)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path}: {len(abilities)} abilities, {len(magic)} magic, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
