"""Build phrases.json: short New Testament phrases for every flashcard.

    python3 tools/build_phrases.py PATH/TO/macula-lowfat-dir

The directory holds MACULA Greek's "lowfat" syntax trees for the 27 books
(https://github.com/Clear-Bible/macula-greek, Nestle1904/lowfat/*.xml;
CC BY 4.0 by Biblica, Inc.; Nestle 1904 text and Berean glosses are public
domain). The trees mark where each phrase begins and ends, so a card can
show its word inside a real phrase: a preposition with its object
(διὰ τοῦ προφήτου), a noun with its article, and so on.
"""
import collections
import glob
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHRASES_PER_CARD = 4
MIN_WORDS, MAX_WORDS = 2, 5
CASE_CLASSES = {"det", "noun", "pron", "adj", "num"}
BOOKS = {"MAT": "Matthew", "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts", "ROM": "Romans",
         "1CO": "1 Corinthians", "2CO": "2 Corinthians", "GAL": "Galatians", "EPH": "Ephesians",
         "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
         "1TI": "1 Timothy", "2TI": "2 Timothy", "TIT": "Titus", "PHM": "Philemon", "HEB": "Hebrews",
         "JAS": "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
         "3JN": "3 John", "JUD": "Jude", "REV": "Revelation"}


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def headword(lemma):
    head = re.split(r"[,(]", lemma)[0].strip()
    return nfc(head.replace("᾿Α", "Ἀ"))


def plain(word):
    """A word's text without the punctuation that follows it (an elision mark stays: δι’)."""
    text, after = nfc(word.get("unicode") or word.text), word.get("after") or " "
    if after.strip() and after != "’" and text.endswith(after):
        text = text[:-len(after)]
    return text


def lemma_of(w):
    """MACULA numbers some homographs, e.g. "δοῦλος (II)"."""
    return nfc((w.get("lemma") or "").split(" (")[0])


def is_form(*forms):
    forms = {nfc(f) for f in forms}
    return lambda w: nfc(w.get("normalized")) in forms


# Vocabulary entries that MACULA lemmatizes differently, or that are single forms.
SPECIAL = {
    8: lambda w: w.get("lemma") == "ἐγώ" and w.get("number") == "singular",
    52: lambda w: w.get("lemma") == "σύ" and w.get("number") == "singular",
    114: lambda w: w.get("lemma") == "ἐγώ" and w.get("number") == "plural",
    124: lambda w: w.get("lemma") == "σύ" and w.get("number") == "plural",
    43: is_form("εἶπεν"),
    61: is_form("ἦν"),
    80: is_form("ἀπεκρίθη"),
    87: is_form("μου", "ἐμοῦ"),
    198: is_form("δεῖ", "ἔδει"),
    291: is_form("ἔφη"),
    116: is_form("ἴδε", "Ἴδε"),
    117: is_form("ἰδού", "Ἰδού", "ἰδοὺ", "Ἰδοὺ"),
    162: is_form("Ἰερουσαλήμ", "Ἱερουσαλήμ"),
    282: lambda w: lemma_of(w) == "Ἱεροσόλυμα" and nfc(w.get("normalized")) not in ("Ἰερουσαλήμ", "Ἱερουσαλήμ"),
    151: lambda w: lemma_of(w) == "μέγας" and w.get("degree") != "comparative",
    214: lambda w: lemma_of(w) == "μέγας" and w.get("degree") == "comparative",
    193: lambda w: lemma_of(w) == "πλείων" or (lemma_of(w) == "πολύς" and w.get("degree") == "comparative"),
}
ALT_LEMMAS = {168: {"οὕτω", "οὕτως"}, 257: {"ἄρχω", "ἄρχομαι"}, 292: {"ἱερόν", "ἱερός"},
              106: {"τὶς", "τις"}, 270: {"φοβέω", "φοβέομαι"}}


def main(directory):
    vocab = json.load(open(os.path.join(ROOT, "greek_vocab.json"), encoding="utf-8"))
    words = [w for c in vocab["chapters"] for w in c["words"]]

    tests = {}
    for word in words:
        if word["id"] in SPECIAL:
            tests[word["id"]] = SPECIAL[word["id"]]
        elif word["id"] in ALT_LEMMAS:
            alts = {nfc(x) for x in ALT_LEMMAS[word["id"]]}
            tests[word["id"]] = lambda w, alts=alts: lemma_of(w) in alts
        else:
            head = headword(word["lemma"])
            tests[word["id"]] = lambda w, head=head: lemma_of(w) == head
    by_lemma = collections.defaultdict(list)
    for word in words:
        if word["id"] not in SPECIAL and word["id"] not in ALT_LEMMAS and word["id"] != 94:
            by_lemma[headword(word["lemma"])].append(word["id"])

    # candidates[card id][phrase text] = {"t", "h", "e", "ref", "n"}
    candidates = collections.defaultdict(dict)

    def add(card_id, group_words, target, ref, noun=False):
        if not (MIN_WORDS <= len(group_words) <= MAX_WORDS):
            return False
        tokens = [plain(w) for w in group_words]
        # Grave and acute are the same accent for counting (Ἱερουσαλὴμ = Ἱερουσαλήμ).
        key = nfc(unicodedata.normalize("NFD", " ".join(tokens).lower()).replace("\u0300", "\u0301"))
        entry = candidates[card_id].get(key)
        if entry:
            entry["n"] += 1
            return True
        gloss = " ".join(g for g in (w.get("gloss") for w in group_words) if g and g != "-")
        candidates[card_id][key] = {"t": tokens, "h": [group_words.index(t) for t in target],
                                    "e": gloss, "ref": ref, "n": 1, "noun": noun}
        return True

    def reference(w):
        book, rest = w.get("ref").split(" ")
        return "%s %s" % (BOOKS.get(book, book), rest.split("!")[0])

    for path in sorted(glob.glob(os.path.join(directory, "*.xml"))):
        tree = ET.parse(path)
        parent = {c: p for p in tree.iter() for c in p}
        for sentence in tree.getroot().iter("sentence"):
            sent_words = list(sentence.iter("w"))
            position = {id(w): i for i, w in enumerate(sent_words)}
            for i, w in enumerate(sent_words):
                lemma = lemma_of(w)
                ids = set(by_lemma.get(lemma, []))
                ids |= {vid for vid in list(SPECIAL) + list(ALT_LEMMAS) if tests[vid](w)}
                # εἰ μή: the two-word phrase itself
                if lemma == "εἰ" and i + 1 < len(sent_words) and lemma_of(sent_words[i + 1]) == "μή":
                    span = sent_words[i:i + 4]
                    add("94", span, span[:2], reference(w))
                for vid in ids:
                    word = next(x for x in words if x["id"] == vid)
                    # Preposition cards: the prepositional phrase, object in the card's case.
                    pp = parent.get(w)
                    if word.get("cases") and pp is not None and pp.get("class") == "pp" and w.get("class") == "prep":
                        members = list(pp.iter("w"))
                        obj = next((m for m in members if m is not w and m.get("class") in CASE_CLASSES and m.get("case")), None)
                        if obj is not None and obj.get("case") in word["cases"]:
                            noun = any(m.get("class") == "noun" for m in members)
                            if add("%s:%s" % (vid, obj.get("case")), members, [w], reference(w), noun):
                                continue
                            # A long phrase: keep the preposition and the start of its object.
                            head = [m for m in members if m.get("class") in CASE_CLASSES]
                            start = members.index(w)
                            short = members[start:start + MAX_WORDS]
                            cut = max(k for k, m in enumerate(short) if m in head) + 1 if any(m in head for m in short) else len(short)
                            add("%s:%s" % (vid, obj.get("case")), short[:cut], [w], reference(w),
                                any(m.get("class") == "noun" for m in short[:cut]))
                        continue
                    if not word.get("gloss"):
                        continue
                    if word.get("cases") and w.get("class") == "prep":
                        continue  # ἕως/ἔξω used as prepositions belong to the case cards
                    # Other cards: the smallest phrase around the word with 2-5 words.
                    node = w
                    group = None
                    while node in parent and parent[node].tag == "wg":
                        node = parent[node]
                        members = list(node.iter("w"))
                        if len(members) >= MIN_WORDS:
                            group = members
                            break
                    if group is None or len(group) > MAX_WORDS:
                        # Fall back to the word and its closest neighbors in the sentence.
                        start = max(0, min(i - 1, len(sent_words) - 3))
                        group = sent_words[start:start + 3]
                    add(str(vid), group, [w], reference(w))

    cards = {}
    for card_id, found in candidates.items():
        ranked = sorted(found.values(), key=lambda e: (-e["n"], len(e["t"])))
        if ":" in card_id:
            # Prepositions: lead with the commonest phrases that have a noun object
            # (ἐν τῷ κόσμῳ), then the commonest of the rest (ἐν αὐτῷ).
            nouns = [e for e in ranked if e["noun"]][:PHRASES_PER_CARD // 2]
            ranked = nouns + [e for e in ranked if e not in nouns]
        cards[card_id] = [{k: v for k, v in e.items() if k != "noun"} for e in ranked[:PHRASES_PER_CARD]]

    expected = []
    for word in words:
        if word.get("gloss"):
            expected.append(str(word["id"]))
        for case in word.get("cases", {}):
            expected.append("%s:%s" % (word["id"], case))
    missing = [c for c in expected if c not in cards]
    with open(os.path.join(ROOT, "phrases.json"), "w", encoding="utf-8") as f:
        json.dump({"source": "MACULA Greek (Biblica, CC BY 4.0); Nestle 1904 text and Berean glosses, public domain",
                   "cards": {c: cards[c] for c in expected if c in cards}},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("cards with phrases:", len(expected) - len(missing), "of", len(expected), "| missing:", missing)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
