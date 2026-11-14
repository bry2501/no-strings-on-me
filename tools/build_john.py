"""Build john/01.json … john/21.json for the reader from MACULA Greek.

    python3 tools/build_john.py PATH/TO/Nestle1904_lowfat_04-john.xml

The input is MACULA Greek's "lowfat" syntax trees for John
(https://github.com/Clear-Bible/macula-greek, Nestle1904/lowfat/04-john.xml),
CC BY 4.0 by Biblica, Inc. The text is the Nestle 1904 Greek New Testament
(public domain); the English glosses are from the Berean Interlinear Bible
(public domain).

Each sentence is stored flat, word by word, with what the reader needs to lay
it out: the clause each word belongs to (clauses get their own indented line)
and the phrase role it plays inside that clause (subject, verb, object, …).
"""
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "john")
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def headword(lemma):
    head = re.split(r"[,(]", lemma)[0].strip()
    return nfc(head.replace("᾿Α", "Ἀ"))


def parse_text(w):
    """Readable parsing from MACULA's morphology attributes."""
    cls = w.get("class")
    a = lambda k: w.get(k) or ""
    nominal = " ".join(x for x in (a("case"), a("number"), a("gender")) if x)
    if cls == "verb":
        verb = " ".join(x for x in (a("tense"), a("voice"), a("mood")) if x)
        if a("mood") == "participle":
            return verb + (", " + nominal if nominal else "")
        if a("mood") == "infinitive":
            return verb
        person = {"first": "1st", "second": "2nd", "third": "3rd"}.get(a("person"), "")
        return verb + (", %s person %s" % (person, a("number")) if person else "")
    names = {"noun": "noun", "pron": "pronoun", "det": "article", "adj": "adjective", "num": "number",
             "prep": "preposition", "conj": "conjunction", "adv": "adverb", "ptcl": "particle"}
    kind = names.get(cls, cls or "")
    return kind + (": " + nominal if nominal else "")


def main(path):
    vocab = json.load(open(os.path.join(ROOT, "greek_vocab.json"), encoding="utf-8"))
    vocab_ids = {}
    for chapter in vocab["chapters"]:
        for word in chapter["words"]:
            vocab_ids.setdefault(headword(word["lemma"]), word["id"])

    root = ET.parse(path).getroot()
    chapters = {}
    for sentence in root.findall("sentence"):
        words, clauses = [], []
        state = {"verse": None}

        # Walk the tree, tracking the innermost clause and the role-bearing
        # phrase inside that clause.
        def walk(el, clause, depth, role_el, role, in_clause=True):
            if el.tag == "w":
                ref = el.get("ref")  # "JHN 1:1!3"
                verse = ref.split(" ")[1].split("!")[0]
                r = el.get("role") or role
                if r is None and el.get("class") == "conj":
                    r = "conj"
                # "after" is the punctuation that follows (a space if none); keep the
                # word itself bare so the reader can mark it without its punctuation.
                text, after = nfc(el.get("unicode") or el.text), el.get("after") or " "
                if after.strip() and text.endswith(after):
                    text = text[:-len(after)]
                entry = {"w": text, "a": after.strip(),
                         "l": nfc(el.get("lemma")), "g": el.get("gloss") or "",
                         "p": parse_text(el), "c": clause, "k": id(el) if el.get("role") else role_el,
                         "r": r or ""}
                if verse != state["verse"]:
                    entry["v"] = verse
                    state["verse"] = verse
                vid = vocab_ids.get(nfc(el.get("lemma")))
                if vid:
                    entry["id"] = vid
                words.append(entry)
                return
            if el.tag != "wg":
                return
            cls, el_role = el.get("class"), el.get("role")
            if cls == "cl":
                # A clause that fills a role (object clause, adverbial clause …) or
                # sits inside a phrase (a relative clause) is subordinate: one level
                # deeper. Clauses coordinated directly under a clause stay level.
                sub = el_role is not None or not in_clause
                key = len(clauses)
                clauses.append({"d": depth + (1 if sub else 0), "r": el_role or ""})
                for child in el:
                    walk(child, key, depth + (1 if sub else 0), None, None, True)
                return
            if el_role:
                r = el_role + ("-pp" if cls == "pp" else "")
                for child in el:
                    walk(child, clause, depth, id(el), r, False)
                return
            for child in el:
                walk(child, clause, depth, role_el, role, in_clause and cls is None)

        for child in sentence:
            walk(child, -1, 0, None, None)
        if not words:
            continue
        # Replace Python object ids with small per-sentence numbers.
        keys = {}
        for entry in words:
            if entry["k"] is not None:
                entry["k"] = keys.setdefault(entry["k"], len(keys))
            else:
                del entry["k"]
            if not entry["r"]:
                del entry["r"]
            if not entry["a"]:
                del entry["a"]
        chapter = int(words[0].get("v", "0:0").split(":")[0] or 0)
        if not chapter:
            continue
        chapters.setdefault(chapter, []).append({"words": words, "clauses": clauses})

    os.makedirs(OUT, exist_ok=True)
    total = 0
    for n, sentences in sorted(chapters.items()):
        with open(os.path.join(OUT, "%02d.json" % n), "w", encoding="utf-8") as f:
            json.dump({"book": "John", "chapter": n,
                       "source": "MACULA Greek (Biblica, CC BY 4.0); Nestle 1904 text and Berean glosses, public domain",
                       "sentences": sentences}, f, ensure_ascii=False, separators=(",", ":"))
        total += len(sentences)
    print("chapters:", len(chapters), "| sentences:", total,
          "| sizes (KB):", [round(os.path.getsize(os.path.join(OUT, "%02d.json" % n)) / 1024) for n in sorted(chapters)])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
