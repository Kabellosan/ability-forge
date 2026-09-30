#!/usr/bin/env python3
"""Extract heroic abilities, spells, recipes and magic tricks from the Dragonbane books.

Input:  private/books/core.txt, private/books/bom.txt
        (NotebookLM `source fulltext` dumps of the Core Rulebook and the Book of Magic)
Output: data/book-catalogue.json
        data/extract-report.txt   (every check that failed, for a human to look at)

Book text is Free League's. It stays in private/ and data/ (both gitignored) and
travels to the module through the secret gist, never through this repo.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / "private" / "books"
OUT = ROOT / "data"

SCHOOLS = ["GENERAL MAGIC", "ANIMISM", "DEMONOLOGY", "ELEMENTALISM", "HARMONISM",
           "ILLUSIONISM", "MENTALISM", "NECROMANCY", "SYMBOLISM", "WITCHCRAFT",
           "ALCHEMY", "ENCHANTING", "DRACOMANCY"]

FIELD_KEYS = ["Rank", "Prerequisite", "Requirement", "Casting Time", "Range",
              "Duration", "Ingredients", "Cost", "Willpower Points"]
FIELD_RE = re.compile(r"✦\s*(" + "|".join(FIELD_KEYS) + r"):")

report = []


def warn(msg):
    report.append(msg)


# ---------------------------------------------------------------- text cleanup

JUNK_LINE = re.compile(r"^https://|^[0-9a-f]{8}-[0-9a-f]{4}-|^[A-Za-z0-9_-]{30,}=w\d+-h\d+")


def load(name):
    lines = (BOOKS / name).read_text(encoding="utf-8").splitlines()
    return [l for l in lines if l.strip() and not JUNK_LINE.search(l)]


VOCAB = Counter()


def build_vocab():
    for name in ("core.txt", "bom.txt"):
        VOCAB.update(w.lower() for w in re.findall(r"[A-Za-z]+", (BOOKS / name).read_text(encoding="utf-8")))


def dehyphen(m):
    """'Cast-ing' → 'Casting', but 'two-handed' stays: join only if the joined word is in the books."""
    a, b = m.group(1), m.group(2)
    return a + b if VOCAB[(a + b).lower()] > 0 else a + "-" + b


def tidy(text):
    """Join wrapped lines into paragraphs and undo the PDF's hyphenation."""
    text = text.replace("­", "")
    text = re.sub(r"([A-Za-z]+)- ?\n\s*([A-Za-z]+)", dehyphen, text)   # hyphen at a line break
    text = re.sub(r"([A-Za-z]+)-([A-Za-z]+)", dehyphen, text)          # soft hyphen left mid-line
    text = re.sub(r"(\w)- (\w)", r"\1-\2", text)                       # real compound: "bread- and- butter"
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    # a line that ends mid-sentence continues on the next one
    text = re.sub(r"(?<![.:!?”\"])\n(?=[a-z(–—])", " ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def clean_value(v):
    v = re.sub(r"\s+", " ", v).strip(" .")
    v = re.sub(r"([A-Za-z]+)- ?([a-zA-Z]+)", dehyphen, v)
    return v


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def title(name):
    small = {"of", "the", "with", "and", "or", "to", "a"}
    words = name.lower().split()
    cap = lambda w: "-".join(p[:1].upper() + p[1:] for p in w.split("-"))
    return " ".join(w if (i and w in small) else cap(w) for i, w in enumerate(words))


# ---------------------------------------------------------------- header parsing

def parse_headers(lines):
    """Find every '✦ Rank:' / '✦ Requirement: … ✦ Willpower Points:' header.

    Returns a list of (start_line, end_line, name, fields). A header can wrap: the name
    on the line above, or a field value continued on the following line.
    """
    headers = []
    i = 0
    while i < len(lines):
        line = lines[i]
        first = FIELD_RE.search(line)
        if not first or first.group(1) not in ("Rank", "Requirement"):
            i += 1
            continue
        # a Requirement-first header is a heroic ability only if Willpower Points follows
        if first.group(1) == "Requirement" and "Willpower Points" not in line:
            i += 1
            continue
        start = i
        name = line[:first.start()].strip()
        if not name:
            j = i - 1
            name = lines[j].strip()
            start = j
            # the name itself may wrap over two all-caps lines
            if j > 0 and lines[j - 1].strip().isupper() and len(lines[j - 1].strip()) < 25 \
                    and not FIELD_RE.search(lines[j - 1]) and name.split()[0] in ("OF", "THE", "AND"):
                name = lines[j - 1].strip() + " " + name
                start = j - 1
        # gather the header body: this line plus continuations
        body = line[first.start():]
        k = i
        while k + 1 < len(lines):
            nxt = lines[k + 1]
            last_key = FIELD_RE.findall(body)[-1]
            terminal = last_key in ("Duration", "Cost", "Willpower Points")
            if nxt.lstrip().startswith("✦"):
                body += " " + nxt
                k += 1
                continue
            # a bare wrapped line (no ✦) sandwiched between header pieces
            if not terminal and "✦" not in nxt and k + 2 < len(lines) and lines[k + 2].lstrip().startswith("✦"):
                body += " " + nxt
                k += 1
                continue
            # a value that visibly continues: "Prerequisite: FIREBOMB, HAILSTORM," / "… or"
            if re.search(r"(,|\bor|\band)\s*$", body) and "✦" not in nxt:
                body += " " + nxt
                k += 1
                continue
            # a sidebar (stat block) dropped between the name line and the rest of the header:
            # "SCALDING SHOWER ✦ Rank: 4" … 13 lines of SYLPH stats … " ✦ Prerequisite: UNDINE …"
            if last_key == "Rank" and "✦" not in nxt:
                ahead = next((j for j in range(k + 1, min(k + 25, len(lines))) if "✦" in lines[j]), None)
                if ahead is not None and lines[ahead].lstrip().startswith("✦") and \
                        FIELD_RE.search(lines[ahead]).group(1) == "Prerequisite":
                    body += " " + lines[ahead]
                    k = ahead
                    continue
            nf = FIELD_RE.search(nxt)
            new_header = nf and (nf.group(1) == "Rank" or "Willpower Points" in nxt)
            if not terminal and nf and not new_header:
                # value wrapped: "ingredient (something to" / "draw with) ✦ Casting Time …"
                body += " " + nxt
                k += 1
                continue
            break
        fields = {}
        parts = FIELD_RE.split(body)
        for key, val in zip(parts[1::2], parts[2::2]):
            fields[key] = clean_value(val)
        spill = ""
        if "Prerequisite" in fields and "Casting Time" not in fields and "Ingredients" not in fields:
            m = re.match(r"^(.*?[A-Z]{2,})\s+([A-Z][a-z]+ .*)$", fields["Prerequisite"])
            if m:
                fields["Prerequisite"], spill = m.group(1).strip(), m.group(2)
        if "Duration" in fields:
            m = re.match(r"^((?:Instant|Round|Stretch|Shift|Concentration|Permanent|Until use|Day|Varies)"
                         r"(?:/[A-Za-z]+)*(?: \([^)]*\))?) ([A-Z].*)$", fields["Duration"])
            if m:
                fields["Duration"], spill = m.group(1), m.group(2)
        if "Cost" in fields and not spill:
            m = re.match(r"^(.*?\))\s+([A-Z].*)$", fields["Cost"])
            if m:
                fields["Cost"], spill = m.group(1), m.group(2)
        headers.append((start, k, clean_value(name), fields, spill))
        i = k + 1
    return headers


# ---------------------------------------------------------------- junk inside descriptions

def strip_sidebars(lines):
    """Remove Masters tables and rank diagrams that the PDF dropped into spell text."""
    out = []
    skip = False
    for l in lines:
        s = l.strip()
        if re.fullmatch(r"[A-Z ]+ MASTERS", s):
            skip = True
            continue
        if re.fullmatch(r"[A-Z ]+ (SPELLS|RECIPIES|RECIPES) BY RANK", s):
            skip = False
            continue
        if skip:
            continue
        if l.startswith(" ") and s.isupper():          # diagram label: " RAISE MUMMY"
            continue
        if re.fullmatch(r"RANK \d|SPELLS|RECIPES|ENCHANTMENTS", s):
            continue
        if s == "DRAWBACKS":                           # Enchanting's drawback table follows the last enchantment
            break
        if re.fullmatch(r"[A-Z][A-Z ’'-]{2,30}", s) and len(s.split()) <= 3:   # stray all-caps caption: "PUFF BOMB"
            continue
        if re.fullmatch(r"[A-Z][a-z]+(?: [A-Z][a-z]+)?", s):                   # stray title caption: "Doubt"
            continue
        out.append(l)
    return out


# ---------------------------------------------------------------- requirements

WEAPON_SKILLS = ["Axes", "Bows", "Brawling", "Crossbows", "Hammers", "Knives", "Slings",
                 "Spears", "Staves", "Swords"]
MELEE = ["Axes", "Brawling", "Hammers", "Knives", "Spears", "Staves", "Swords"]
STR_MELEE = ["Axes", "Brawling", "Hammers", "Spears", "Swords"]  # core p. 33: the (STR) weapon skills
SCHOOL_SKILLS = ["Animism", "Demonology", "Elementalism", "Illusionism", "Mentalism",
                 "Necromancy", "Symbolism", "Witchcraft", "Alchemy", "Enchanting", "Dracomancy"]


def parse_ability_requirement(raw):
    """'Knives 12' / 'Axes, Hammers, or Swords 12' / 'Any melee weapon skill 12' / '—'."""
    if raw in ("—", "-", ""):
        return {"type": "none"}
    m = re.fullmatch(r"(.+?)\s+(\d+)", raw)
    if not m:
        warn(f"ability requirement not understood: {raw!r}")
        return {"type": "text", "raw": raw}
    what, level = m.group(1), int(m.group(2))
    groups = {
        "Any melee weapon skill": ("melee", MELEE),
        "Any weapon skill": ("weapon", WEAPON_SKILLS),
        "Any STR-based melee weapon skill": ("str-melee", STR_MELEE),
        "Any magic school": ("magic", SCHOOL_SKILLS),
    }
    if what in groups:
        g, skills = groups[what]
        return {"type": "anyOf", "group": g, "skills": skills, "level": level}
    skills = [s.strip() for s in re.split(r",\s*or\s+|,\s*|\s+or\s+", what) if s.strip()]
    return {"type": "anyOf" if len(skills) > 1 else "skill", "skills": skills, "level": level}


def parse_prerequisite(raw, school):
    """Spell prerequisite → {"anyOf" | "allOf": [option, …]}.

    Options: {"school": S} · {"anySchool": True} · {"spell": NAME} (resolved to an id later)
             · {"anyRank": N, "school"?: S} · {"skill": S, "level": N}
    """
    r = re.sub(r"enchant ?ing", "enchanting", raw.strip())
    mode = "allOf" if re.search(r"\band\b", r) else "anyOf"
    parts = [p.strip() for p in re.split(r"\s+or\s+|\s+and\s+|,\s*(?:or\s+)?|^and\s+", r) if p.strip()]
    opts = []
    for part in parts:
        if part.lower() in ("any school of magic", "any magic school"):
            opts.append({"anySchool": True})
        elif m := re.fullmatch(r"any rank (\d)(?: (\w+))? spell", part, re.I):
            o = {"anyRank": int(m.group(1))}
            if m.group(2):
                o["school"] = m.group(2).upper()
            opts.append(o)
        elif m := re.fullmatch(r"any (\w+) spell", part, re.I):
            opts.append({"anyRank": 1, "school": m.group(1).upper()})
        elif m := re.fullmatch(r"Skill level (\d+) in ([A-Z &]+)", part):
            opts.append({"skill": title(m.group(2)), "level": int(m.group(1))})
        elif part.upper() in SCHOOLS or part.capitalize() in SCHOOL_SKILLS:
            opts.append({"school": part.upper()})
        elif part.isupper():
            opts.append({"spell": part})
        else:
            warn(f"prerequisite part not understood ({school}): {part!r} in {raw!r}")
            opts.append({"text": part})
    if raw.strip().lower().startswith("and "):
        warn(f"BOOK ERROR ({school}): prerequisite {raw!r} is missing its first part")
    return {mode: opts}


def resolve_prerequisites(magic):
    """Turn {"spell": NAME} into {"spell": id}, same school first. Fixes truncated names (book typos)."""
    by_school = defaultdict(dict)
    for e in magic:
        by_school[e["school"]][slug(e["name"])] = e["id"]
    everywhere = {}
    for sch in by_school.values():
        for k, v in sch.items():
            everywhere.setdefault(k, v)
    for e in magic:
        pre = e.get("prerequisite", {})
        for opts in (pre.get("anyOf", []), pre.get("allOf", [])):
            for o in opts:
                if "spell" not in o:
                    continue
                key = slug(o["spell"])
                hit = by_school[e["school"]].get(key) or everywhere.get(key)
                if not hit:
                    near = [v for k, v in by_school[e["school"]].items() if k.startswith(key)] or \
                           [v for k, v in by_school[e["school"]].items() if k.split("-")[0] == key.split("-")[0]]
                    if len(near) == 1:
                        hit = near[0]
                        warn(f"BOOK TYPO ({e['school']}): {e['name']} prerequisite {o['spell']!r} read as {hit}")
                if hit:
                    o["spell"] = hit
                else:
                    warn(f"{e['name']}: prerequisite spell {o['spell']!r} not found")


# ---------------------------------------------------------------- core: heroic abilities

def extract_core():
    lines = load("core.txt")
    headers = [h for h in parse_headers(lines) if "Willpower Points" in h[3]]
    entries = []
    for n, (start, end, name, f, spill) in enumerate(headers):
        stop = headers[n + 1][0] if n + 1 < len(headers) else end + 1
        if n + 1 == len(headers):
            # last ability runs until the next chapter heading
            stop = end + 1
            while stop < len(lines) and not re.fullmatch(r"[A-Z &]{6,}", lines[stop].strip()):
                stop += 1
        text = tidy("\n".join(strip_sidebars(lines[end + 1:stop])))
        entries.append({
            "id": slug(name),
            "kind": "ability",
            "name": title(name),
            "source": "core",
            "requirement": {"raw": f["Requirement"], **parse_ability_requirement(f["Requirement"])},
            "wp": f["Willpower Points"],
            "text": text,
        })
    return entries


# ---------------------------------------------------------------- book of magic

def school_ranges(lines):
    """Line ranges of each school chapter (second occurrence; the first is the contents page)."""
    seen = Counter()
    starts = []
    for i, l in enumerate(lines):
        s = l.strip()
        if s in SCHOOLS:
            seen[s] += 1
            if seen[s] == 2:
                starts.append((i, s))
    index_at = next(i for i, l in enumerate(lines) if l.startswith("INDEX OF SPELLS"))
    ranges = []
    for n, (i, s) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else index_at
        ranges.append((s, i, end))
    return ranges, index_at


def parse_index(lines, index_at):
    """The book's own index: name → page. Our checklist."""
    blob = " ".join(l.strip() for l in lines[index_at + 1:])
    blob = blob.split("ISBN")[0]
    blob = re.sub(r"(?<=\s)[A-Z](?=\s+[A-Z][a-z])", " ", blob)   # letter dividers "B Bane…"
    entries = {}
    for m in re.finditer(r"([A-Z][A-Za-z’',/ -]+?)\s+(\d+(?:,\s*\d+)*)", blob):
        name = m.group(1).strip()
        name = re.sub(r"^[A-Z] (?=[A-Z])", "", name)
        if "," in name:          # "Demon, Guardian" is a see-also for Guardian Demon
            continue
        entries[name] = [int(p) for p in m.group(2).split(",")]
    return entries


def parse_tricks(block_lines, school):
    """'MAGIC TRICKS Name: text' paragraphs up to the SPELLS heading."""
    text = "\n".join(block_lines)
    text = re.sub(r"^MAGIC TRICKS\s*", "", text)
    tricks = []
    for m in re.finditer(r"(?:^|\n)([A-Z][A-Za-z’/ -]{2,30}): (.+?)(?=\n[A-Z][A-Za-z’/ -]{2,30}: |\Z)", text, re.S):
        tricks.append({
            "id": f"{slug(school)}.{slug(m.group(1))}",
            "kind": "trick",
            "name": m.group(1).strip(),
            "source": "book-of-magic",
            "school": school,
            "rank": 0,
            "text": tidy(m.group(2)),
        })
    return tricks


def study_requirement(chapter_lines, school):
    """'STUDYING X …' paragraph: entry requirement for the school, if any."""
    for l in chapter_lines:
        if l.startswith("STUDYING "):
            m = re.search(r"(?:at least )?skill level (\d+) in ([A-Z &]+)", l)
            if m:
                return {"type": "skill", "skills": [title(m.group(2).strip())], "level": int(m.group(1)),
                        "raw": tidy(l)}
            return {"type": "none", "raw": tidy(l)}
    return None


def extract_bom():
    lines = load("bom.txt")
    ranges, index_at = school_ranges(lines)
    index = parse_index(lines, index_at)
    schools, entries = [], []
    for school, a, b in ranges:
        chap = lines[a:b]
        # magic tricks
        t0 = next((i for i, l in enumerate(chap) if l.startswith("MAGIC TRICKS")), None)
        if t0 is not None:
            t1 = next((i for i in range(t0 + 1, len(chap)) if chap[i].strip() in ("SPELLS", "RECIPES", "ENCHANTMENTS")
                       or FIELD_RE.search(chap[i]) or re.fullmatch(r"[A-Z ]+ MASTERS", chap[i].strip())), len(chap))
            entries += parse_tricks(chap[t0:t1], school)
        masters = None
        m0 = next((i for i, l in enumerate(chap) if re.fullmatch(r"[A-Z ]+ MASTERS", l.strip())), None)
        if m0 is not None:
            m1 = next((i for i in range(m0 + 1, len(chap)) if re.fullmatch(r"[A-Z ]+ (SPELLS|RECIPIES|RECIPES) BY RANK", chap[i].strip())
                       or (chap[i].startswith(" ") and chap[i].strip().isupper())), len(chap))
            body = [l for l in chap[m0 + 2:m1] if not FIELD_RE.search(l)]
            masters = tidy("\n".join(body))
        schools.append({"id": slug(school), "name": title(school), "study": study_requirement(chap, school),
                        "masters": masters})
        # spells / recipes / enchantments
        hs = [h for h in parse_headers(chap) if "Rank" in h[3]]
        for n, (start, end, name, f, spill) in enumerate(hs):
            stop = hs[n + 1][0] if n + 1 < len(hs) else len(chap)
            text = tidy("\n".join(([spill] if spill else []) + strip_sidebars(chap[end + 1:stop])))
            kind = "recipe" if "Ingredients" in f else "enchantment" if school == "ENCHANTING" and "Casting Time" not in f else "spell"
            e = {
                "id": f"{slug(school)}.{slug(name)}",
                "kind": kind,
                "name": title(name),
                "source": "book-of-magic",
                "school": school,
                "rank": int(f.get("Rank", "0")[:1] or 0),
                "prerequisite": {"raw": f.get("Prerequisite", ""), **parse_prerequisite(f.get("Prerequisite", ""), school)},
                "text": text,
            }
            for key, out in (("Requirement", "requirement"), ("Casting Time", "castingTime"), ("Range", "range"),
                             ("Duration", "duration"), ("Ingredients", "ingredients"), ("Cost", "cost")):
                if key in f:
                    e[out] = f[key]
            entries.append(e)
    return schools, entries, index


# ---------------------------------------------------------------- checks

def check(abilities, schools, magic, index):
    # ids unique
    ids = Counter(e["id"] for e in abilities + magic)
    for i, c in ids.items():
        if c > 1:
            where = [e.get("school", "core") for e in abilities + magic if e["id"] == i]
            warn(f"duplicate id {i!r} in {where}")
    # every indexed name found, every found name indexed
    norm = lambda s: re.sub(r"[^a-z]", "", s.lower())
    found = {norm(e["name"]): e for e in magic}
    idx = {norm(n): n for n in index}
    not_spells = {"guardiandemon"}   # a creature stat block, indexed alongside the spells
    for k, n in idx.items():
        if k not in found and k not in not_spells:
            warn(f"in the index but not extracted: {n} (p. {index[n]})")
    for k, e in found.items():
        if k not in idx:
            warn(f"extracted but not in the index: {e['name']} [{e['school']}]")
    for e in magic:
        if len(e["text"]) < (15 if e["kind"] in ("trick", "recipe") else 60):
            warn(f"short text ({len(e['text'])} chars): {e['name']} [{e['school']}]")
        if re.search(r"SPELLS BY RANK|MASTERS|lh3\.google", e["text"]):
            warn(f"sidebar debris in text: {e['name']}")
    for e in abilities:
        if len(e["text"]) < 40:
            warn(f"short ability text: {e['name']}")


def main():
    build_vocab()
    abilities = extract_core()
    schools, magic, index = extract_bom()
    for e in magic:
        n = re.sub(r"[^a-z]", "", e["name"].lower())
        page = next((p for k, p in index.items() if re.sub(r"[^a-z]", "", k.lower()) == n), None)
        if page:
            e["page"] = page[0]
    idx_names = {re.sub(r"[^a-z]", "", n.lower()) for n in index}
    for e in [e for e in magic if e["kind"] == "trick"]:
        if re.sub(r"[^a-z]", "", e["name"].lower()) not in idx_names:
            warn(f"dropped non-trick paragraph: {e['name']} [{e['school']}]")
            magic.remove(e)
    resolve_prerequisites(magic)
    check(abilities, schools, magic, index)
    OUT.mkdir(exist_ok=True)
    cat = {"version": 1, "abilities": abilities, "schools": schools, "magic": magic}
    (OUT / "book-catalogue.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = defaultdict(Counter)
    for e in magic:
        counts[e["school"]][e["kind"]] += 1
    summary = [f"abilities: {len(abilities)}", f"index entries: {len(index)}", f"magic entries: {len(magic)}"]
    for s in SCHOOLS:
        summary.append(f"  {s:14} " + ", ".join(f"{k} {v}" for k, v in sorted(counts[s].items())))
    (OUT / "extract-report.txt").write_text("\n".join(summary + ["", f"{len(report)} warnings:"] + report) + "\n",
                                            encoding="utf-8")
    print("\n".join(summary))
    print(f"{len(report)} warnings → data/extract-report.txt")


if __name__ == "__main__":
    sys.exit(main())
