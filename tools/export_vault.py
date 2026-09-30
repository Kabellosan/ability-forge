#!/usr/bin/env python3
"""Export homebrew heroic abilities from the Obsidian vault → data/homebrew.json.

The vault note is where the Captain writes. This is a one-way mirror of it:
never edit homebrew.json by hand, re-run this instead.

  python3 tools/export_vault.py [--campaign DIR]

DIR is the campaign folder (default: $ABILITY_FORGE_CAMPAIGN). It must contain
Custom-Heroic-Abilities.md; granted abilities are read from Characters/<name>.md.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"

sys.path.insert(0, str(Path(__file__).parent))
from extract import parse_ability_requirement, slug, title  # noqa: E402

SECTIONS = {  # heading prefix → (source, status)
    "Granted": ("homebrew", "granted"),
    "On offer": ("homebrew", "on-offer"),
    "Earned in play": ("homebrew", "earned"),
    "Mage pack": ("svendsen", "on-offer"),
}
HEADER_RE = re.compile(r"◆\s*\*\*Requirement:\*\*\s*(.+?)\s*◆\s*\*\*Willpower Points:\*\*\s*(.+)$")

warnings = []


def md_plain(s):
    """Strip markdown emphasis, code ticks and wikilinks."""
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", s)
    s = s.replace("`", "")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", s)
    return s.strip()


def resolve_name(name, prefix):
    """An ability or spell named in a homebrew requirement → {"ability": id} or {"spell": id}."""
    book = json.loads((OUT / "book-catalogue.json").read_text(encoding="utf-8"))
    key = slug(name)
    for a in book["abilities"]:
        if a["id"] == key:
            return {"ability": key}
    spells = [m["id"] for m in book["magic"] if m["kind"] != "trick" and slug(m["name"]) == key]
    if len(spells) == 1:
        return {"spell": spells[0]}
    return {"ability": f"{prefix}.{key}"}     # another homebrew ability; checked after export


def parse_requirement(raw, prefix):
    """Book forms, plus homebrew parts joined by ' + ':
    'X mastered' · 'COMPANION or FAMILIAR' (has one of these abilities/spells) · 'Skill N'."""
    r = md_plain(raw).strip()
    if r in ("–", "—", "-", ""):
        return {"raw": r, "type": "none"}
    parts = []
    for part in [p.strip() for p in r.split(" + ")]:
        if m := re.fullmatch(r"(.+?) mastered", part):
            parts.append({"type": "mastered", "ability": f"{prefix}.{slug(m.group(1))}"})
        elif re.fullmatch(r"[A-Z][A-Z' -]+(?: or [A-Z][A-Z' -]+)*", part):
            parts.append({"type": "has", "of": [resolve_name(n, prefix) for n in part.split(" or ")]})
        else:
            parts.append(parse_ability_requirement(title_skill(part)))
    if len(parts) == 1:
        return {"raw": r, **parts[0]}
    return {"raw": r, "type": "allOf", "of": parts}


def title_skill(r):
    """'NECROMANCY 12' → 'Necromancy 12'; 'Any magic school 12' untouched."""
    m = re.fullmatch(r"([A-Z][A-Z &]+) (\d+)", r)
    return f"{title(m.group(1))} {m.group(2)}" if m else r


def split_body(lines):
    """Lead paragraph (the rules) vs bullets (GM notes, rulings, training data)."""
    lead, bullets = [], []
    for l in lines:
        if re.match(r"^\s*- ", l) or (bullets and l.startswith("  ")):
            bullets.append(l)
        elif not bullets:
            lead.append(l)
    return md_plain(" ".join(x.strip() for x in lead)), "\n".join(bullets).strip()


def training(details):
    start = re.search(r"Start \*\*(\d+)\*\*", details)
    mastery = re.search(r"mastered at \*\*(\d+)\*\*", details)
    fits = re.search(r"\*\*Fits:\*\* ([^.]+)\.", details)
    t = {}
    if start:
        t["start"] = int(start.group(1))
    if mastery:
        t["mastery"] = int(mastery.group(1))
    return t, (md_plain(fits.group(1)) if fits else None)


def granted_effect(campaign, character, name):
    """The '**Effect:**' sub-bullet under the ability on the character sheet."""
    sheet = campaign / "Characters" / f"{character}.md"
    if not sheet.exists():
        warnings.append(f"{name}: character sheet not found: {sheet.name}")
        return ""
    lines = sheet.read_text(encoding="utf-8").splitlines()
    i = next((n for n, l in enumerate(lines) if f"**{name}**" in l and l.lstrip().startswith("- ")), None)
    if i is None:
        warnings.append(f"{name}: not found on {sheet.name}")
        return ""
    for n in range(i + 1, min(i + 40, len(lines))):
        if "**Effect:**" in lines[n]:
            out = [lines[n].split("**Effect:**", 1)[1]]
            for l in lines[n + 1:]:
                if re.match(r"^\s*- ", l) or not l.startswith("    "):
                    break
                out.append(l)
            return md_plain(" ".join(x.strip() for x in out))
    # no Effect line: the indented paragraph straight under the bullet is the rule
    out = []
    for l in lines[i + 1:]:
        if re.match(r"^\s*- ", l) or not l.startswith("  "):
            break
        out.append(l)
    if not out:
        warnings.append(f"{name}: no rules text under it on {sheet.name}")
    return md_plain(" ".join(x.strip() for x in out))


def export(campaign):
    note = campaign / "Custom-Heroic-Abilities.md"
    lines = note.read_text(encoding="utf-8").splitlines()
    entries = []
    section = None
    i = 0
    while i < len(lines):
        l = lines[i]
        if l.startswith("## "):
            head = l[3:].strip()
            section = next((v for k, v in SECTIONS.items() if head.startswith(k)), None)
            i += 1
            continue
        if not section:
            i += 1
            continue
        source, status = section
        if status == "granted" and (m := re.match(r"^- \*\*(.+?)\*\* → \[\[(.+?)\]\] · (.+?) · (.+?) · (.+?)(?: \*\((\d{4}-\d\d-\d\d)\)\*)?$", l)):
            name, who, req, wp, roll, date = m.groups()
            entries.append({
                "id": f"{source}.{slug(name)}", "kind": "ability", "name": title(name), "source": source,
                "status": "granted", "grantedTo": [who], "grantedOn": date,
                "requirement": parse_requirement(req, source),
                "wp": re.sub(r"\s*WP$", "", wp).replace("no extra", "—"),
                "text": granted_effect(campaign, who, name),
            })
            i += 1
            continue
        if l.startswith("### "):
            head = l[4:]
            upgrade = re.search(r"locked until (.+?) is mastered", head)
            name = re.sub(r"\s*\*\(.*\)\*|🎯", "", head).strip()
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            hm = HEADER_RE.search(lines[j]) if j < len(lines) else None
            if not hm:
                warnings.append(f"{name}: no ◆ Requirement / Willpower Points line")
                i += 1
                continue
            wp = hm.group(2)
            body_start = j + 1
            # the WP value wraps: "**+2** on" / "top of Deeper Than Flesh"
            if body_start < len(lines) and lines[body_start][:1].islower():
                wp += " " + lines[body_start].strip()
                body_start += 1
            k = body_start
            while k < len(lines) and not lines[k].startswith(("### ", "## ", "---")):
                k += 1
            text, details = split_body(lines[body_start:k])
            train, fits = training(details)
            e = {
                "id": f"{source}.{slug(name)}", "kind": "ability", "name": title(name), "source": source,
                "status": status,
                "requirement": parse_requirement(hm.group(1), source),
                "wp": md_plain(wp),
                "text": text,
                "details": details,
            }
            if upgrade:
                e["upgradeOf"] = f"{source}.{slug(upgrade.group(1))}"
            if train:
                e["training"] = train
            if fits:
                e["fits"] = fits
            entries.append(e)
            i = k
            continue
        i += 1
    ids = {e["id"] for e in entries}
    for e in entries:
        if e.get("upgradeOf") and e["upgradeOf"] not in ids:
            warnings.append(f"{e['name']}: upgrades {e['upgradeOf']}, which isn't in the note")
        if e["requirement"].get("type") == "text":
            warnings.append(f"{e['name']}: requirement not understood: {e['requirement']['raw']!r}")
    return entries


def export_slots(note, entries):
    """Training Slots note → {id: "combat" | "non-combat" | "either" | "untrainable" | None (undecided)}.

    Every trainable entry (abilities, and magic that isn't a trick) must appear exactly once.
    """
    book = json.loads((OUT / "book-catalogue.json").read_text(encoding="utf-8"))
    items = book["abilities"] + entries + [m for m in book["magic"] if m["kind"] != "trick"]
    tab_of = lambda e: "heroic abilities" if e["kind"] == "ability" else e["school"].lower()
    key = lambda name, tab: (re.sub(r"[^a-z]", "", name.lower()), tab.lower())
    lookup = {key(e["name"], tab_of(e)): e["id"] for e in items}
    slots, seen = {}, {}

    def put(name, tab, slot, where):
        k = key(name, tab)
        if k not in lookup:
            warnings.append(f"slots: {name!r} ({tab}) is not a known ability or spell [{where}]")
            return
        i = lookup[k]
        if i in seen:
            warnings.append(f"slots: {name} ({tab}) is listed twice: {seen[i]} and {where}")
        seen[i] = where
        slots[i] = slot

    section = None
    for line in note.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
            continue
        if section and ("Undecided" in section or "Not trainable" in section):
            if m := re.match(r"^- \*\*(.+?)\*\* \*\((.+?)\)\*", line):
                slot = None if "Undecided" in section else "untrainable"
                put(m.group(1), m.group(2), slot, section)
            continue
        if m := re.match(r"^\*\*(Combat|Non-combat|Either):\*\*\s*(.*)$", line):
            slot = m.group(1).lower()
            for name in [n.strip() for n in m.group(2).split(",") if n.strip() and n.strip() != "—"]:
                put(name, section, slot, f"{section} / {m.group(1)}")
    for e in items:
        if e["id"] not in slots:
            warnings.append(f"slots: {e['name']} ({tab_of(e)}) is missing from the note")
    return slots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign", default=os.environ.get("ABILITY_FORGE_CAMPAIGN"))
    ap.add_argument("--slots", default=os.environ.get("ABILITY_FORGE_SLOTS"),
                    help="the Training Slots note (Dragonbane - Training Slots (Homebrew).md)")
    args = ap.parse_args()
    if not args.campaign:
        sys.exit("give --campaign DIR or set ABILITY_FORGE_CAMPAIGN")
    entries = export(Path(args.campaign))
    if args.slots:
        slots = export_slots(Path(args.slots), entries)
        (OUT / "slots.json").write_text(json.dumps(slots, ensure_ascii=False, indent=1), encoding="utf-8")
        tally = {k: sum(1 for v in slots.values() if v == k) for k in ("combat", "non-combat", "either", "untrainable", None)}
        print(f"slots: {tally['combat']} combat, {tally['non-combat']} non-combat, {tally['either']} either, "
              f"{tally['untrainable']} not trainable, {tally[None]} undecided")
    OUT.mkdir(exist_ok=True)
    (OUT / "homebrew.json").write_text(json.dumps({"version": 1, "abilities": entries}, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    by = {}
    for e in entries:
        by.setdefault(f"{e['source']}/{e['status']}", []).append(e["name"])
    for k, v in by.items():
        print(f"{k:22} {len(v):2}  {', '.join(v)}")
    print(f"{len(warnings)} warnings")
    for w in warnings:
        print("  " + w)


if __name__ == "__main__":
    main()
