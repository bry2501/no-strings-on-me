"""Build forms.json and examples.json from MorphGNT and greek_vocab.json.

The site has no build step; this script only regenerates the two data files.

    python3 tools/build_data.py MORPHGNT_DIR

MORPHGNT_DIR holds the 27 *-morphgnt.txt files from
https://github.com/morphgnt/sblgnt (the MorphGNT: SBLGNT edition).

- forms.json: inflected New Testament forms of the vocabulary words with
  their parsings, for the parsing drill. Derived from the MorphGNT parsing,
  so it is under the same CC BY-SA license.
- examples.json: one short SBLGNT verse per flashcard, with the word marked.
- topics.json: for the part-of-speech pages: pronoun kinds, New Testament
  counts for words without one, and common prepositions and pronouns that
  are not in the vocabulary list.
"""
import collections
import glob
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORMS_PER_WORD = 30
VERSE_MIN, VERSE_MAX = 5, 18  # preferred verse length in words

BOOKS = ["Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
         "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
         "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus",
         "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
         "3 John", "Jude", "Revelation"]
# SBLGNT marks for variant readings (⸀ ⸁ ⸂ ⸃ ⸄ ⸅), not part of the text.
APPARATUS = re.compile("[\u2e00-\u2e05]")
# A preposition's object: noun, article, adjective or personal pronoun.
OBJECT_POS = {"N-", "RA", "A-", "RP", "RD"}
CASES = {"N": "nominative", "G": "genitive", "D": "dative", "A": "accusative", "V": "vocative"}


def nfc(s):
    return unicodedata.normalize("NFC", s)


def headword(lemma):
    """'ἄγγελος, –ου, ὁ' -> 'ἄγγελος'; also fixes a spacing psili (᾿Α -> Ἀ)."""
    head = re.split(r"[,(]", lemma)[0].strip()
    return nfc(head.replace("᾿Α", "Ἀ"))


# Vocabulary entries that MorphGNT files under another lemma or that are
# single inflected forms: id -> test(token) -> bool.
def word_is(*forms):
    forms = {nfc(f) for f in forms}
    return lambda t: t["norm"] in forms


SPECIAL = {
    8: lambda t: t["lemma"] == "ἐγώ" and t["parse"][5] == "S",      # ἐγώ: singular
    52: lambda t: t["lemma"] == "σύ" and t["parse"][5] == "S",      # σύ: singular
    114: lambda t: t["lemma"] == "ἐγώ" and t["parse"][5] == "P",    # ἡμεῖς
    124: lambda t: t["lemma"] == "σύ" and t["parse"][5] == "P",     # ὑμεῖς
    43: lambda t: t["lemma"] == "λέγω" and t["parse"].startswith("3AAI-S"),  # εἶπεν
    61: word_is("ἦν"),
    80: word_is("ἀπεκρίθη"),
    87: lambda t: t["lemma"] == "ἐγώ" and t["parse"] == "----GS--",  # μου
    168: lambda t: t["lemma"] == nfc("οὕτω(ς)"),
    193: lambda t: t["lemma"] == "πολύς" and t["parse"][7] == "C",  # πλείων
    198: word_is("δεῖ", "ἔδει"),
    257: lambda t: t["lemma"] == "ἄρχω" and t["parse"][2] == "M",   # ἄρχομαι
    291: word_is("ἔφη"),
    292: lambda t: t["lemma"] == "ἱερός" and t["parse"][6] == "N",  # ἱερόν
}
# Single inflected forms: they get example verses but no parsing drill items.
FORM_ENTRIES = {43, 61, 80, 87, 198, 291}
PERSONAL_PRONOUNS = {8, 52, 114, 124}


# Words shown on the part-of-speech pages that are not in the vocabulary list.
# ἀνά, ἀντί and πρό complete the seventeen proper prepositions every grammar lists;
# the pronouns complete the usual lexical list (ἐμαυτοῦ, σεαυτοῦ, ὅδε, ποῖος, πόσος).
EXTRA_WORDS = {
    "preposition": [("ἀνά", "+ acc. up; each (with numbers)"), ("ἀντί", "+ gen. instead of, for"),
                    ("πρό", "+ gen. before")],
    "pronoun": [("ἐμαυτοῦ", "myself", "reflexive"), ("σεαυτοῦ", "yourself", "reflexive"),
                ("ὅδε", "this (here)", "demonstrative"), ("ποῖος", "what kind of? which?", "interrogative"),
                ("πόσος", "how much? how many?", "interrogative")],
}
# Kinds of pronoun, by vocabulary id.
PRONOUN_KINDS = {
    8: "personal", 52: "personal", 114: "personal", 124: "personal", 87: "personal", 149: "personal",
    29: "personal", 146: "reflexive", 79: "reciprocal", 51: "demonstrative", 147: "demonstrative",
    166: "relative", 202: "relative", 105: "interrogative", 106: "indefinite",
}


def load_morphgnt(directory):
    verses = collections.OrderedDict()
    for path in sorted(glob.glob(os.path.join(directory, "*-morphgnt.txt"))):
        with open(path, encoding="utf-8") as f:
            for line in f:
                bcv, pos, parse, text, word, norm, lemma = line.split()
                verses.setdefault(bcv, []).append({
                    "bcv": bcv, "pos": pos, "parse": parse, "text": APPARATUS.sub("", nfc(text)),
                    "norm": nfc(norm), "lemma": nfc(lemma)})
    if len(verses) < 7000:
        sys.exit("Expected the 27 MorphGNT book files in " + directory)
    return verses


def reference(bcv):
    return "%s %d:%d" % (BOOKS[int(bcv[:2]) - 1], int(bcv[2:4]), int(bcv[4:6]))


# ---------- grammar chapter of a parsing (Mounce, chapter where it is taught) ----------

def declension_chapter(word):
    """Third-declension nouns and adjectives are taught in chapter 10."""
    parts = [p.strip(" –-") for p in word["lemma"].split(",")]
    if word["part_of_speech"] == "noun" and len(parts) >= 2:
        gen = nfc(parts[1])
        if not re.search(r"(ου|οῦ|ας|ης|ῆς|ᾶς)$", gen) and gen not in ("ὁ", "ἡ", "τό", "τά"):
            return 10
    if headword(word["lemma"]) in {nfc(w) for w in ("πᾶς", "μέγας", "πολύς", "εἷς", "οὐδείς", "μηδείς")}:
        return 10
    return 0


def grammar_chapter(word, parse):
    person, tense, voice, mood, case = parse[0], parse[1], parse[2], parse[3], parse[4]
    if mood == "-":  # nominal forms
        chapter = 6 if case in "NA" else 7
        if case == "V":
            chapter = 10
        if word["id"] in PERSONAL_PRONOUNS:
            chapter = max(chapter, 11)
        return max(chapter, declension_chapter(word))
    if headword(word["lemma"]) == "εἰμί" and mood == "I" and tense == "P":
        return 8
    if mood == "I":
        if tense == "P":
            return 16 if voice == "A" else 18
        if tense == "I":
            return 21
        if tense == "F":
            return 24 if voice == "P" else 19
        if tense == "A":
            return 24 if voice == "P" else 23
        return 25  # perfect, pluperfect
    if mood == "P":
        return {"P": 27, "A": 28}.get(tense, 30)
    return {"S": 31, "N": 32, "D": 33}.get(mood, 36)  # optative last


# ---------- matching tokens to vocabulary ----------

def matcher(word):
    if word["id"] in SPECIAL:
        return SPECIAL[word["id"]]
    head = headword(word["lemma"])
    if word["id"] == 94:  # εἰ μή: handled as a two-word phrase
        return None
    return lambda t: t["lemma"] == head


def main(directory):
    vocab = json.load(open(os.path.join(ROOT, "greek_vocab.json"), encoding="utf-8"))
    words = [w for c in vocab["chapters"] for w in c["words"]]
    verses = load_morphgnt(directory)
    tokens = [t for v in verses.values() for t in v]
    vocab_lemmas = {headword(w["lemma"]) for w in words}

    # ----- forms.json -----
    forms = []
    for word in words:
        test = matcher(word)
        if test is None or word["id"] in FORM_ENTRIES:
            continue
        if word["part_of_speech"] not in ("noun", "verb", "adjective", "pronoun", "article", "numeral"):
            continue
        found = collections.defaultdict(collections.Counter)
        for t in tokens:
            if test(t) and t["parse"].strip("-"):
                found[t["norm"].lower() if t["pos"] != "N-" else t["norm"]][t["parse"]] += 1
        ranked = sorted(found.items(), key=lambda kv: -sum(kv[1].values()))[:FORMS_PER_WORD]
        for form, parses in ranked:
            codes = sorted(parses)
            forms.append({
                "f": form, "w": word["id"], "n": sum(parses.values()),
                "p": codes, "g": min(grammar_chapter(word, c) for c in codes)})

    # ----- examples.json -----
    def card_ids(word):
        ids = []
        if word.get("gloss"):
            ids.append((str(word["id"]), None))
        for case in word.get("cases", {}):
            ids.append(("%s:%s" % (word["id"], case), case))
        return ids

    def next_case(verse, i):
        for t in verse[i + 1:]:
            if t["parse"][4] in CASES:
                return CASES[t["parse"][4]] if t["pos"] in OBJECT_POS else "other"
        return None

    def score(verse, hits):
        n = len(verse)
        known = sum(1 for t in verse if t["lemma"] in vocab_lemmas) / n
        fits = VERSE_MIN <= n <= VERSE_MAX
        return (fits, round(known, 2), -abs(n - 11), -len(hits))

    examples = {}
    unmatched = []
    for word in words:
        test = matcher(word)
        for card_id, case in card_ids(word):
            best = None
            for bcv, verse in verses.items():
                if word["id"] == 94:
                    hits = [i for i in range(len(verse) - 1)
                            if verse[i]["norm"] == "εἰ" and verse[i + 1]["norm"] == "μή"]
                    hits = [j for i in hits for j in (i, i + 1)]
                else:
                    hits = [i for i, t in enumerate(verse) if test(t)]
                    if word.get("cases"):
                        # preposition cards: the object must be in that case;
                        # the other card of ἕως/ἔξω: no case object follows
                        hits = [i for i in hits if next_case(verse, i) == case
                                or (case is None and next_case(verse, i) in (None, "nominative"))]
                if not hits:
                    continue
                key = score(verse, hits)
                if best is None or key > best[0]:
                    best = (key, bcv, hits)
            if best is None:
                unmatched.append(card_id)
                continue
            _, bcv, hits = best
            examples[card_id] = {"ref": reference(bcv),
                                 "text": [t["text"] for t in verses[bcv]],
                                 "hl": hits}

    # ----- topics.json -----
    lemma_count = collections.Counter(t["lemma"] for t in tokens)
    counts = {}
    for word in words:
        if word.get("frequency"):
            continue
        test = matcher(word)
        if word["id"] == 94:
            continue
        n = sum(1 for t in tokens if test(t))
        if n:
            counts[str(word["id"])] = n
    extras = {}
    for pos, items in EXTRA_WORDS.items():
        extras[pos] = []
        for item in items:
            lemma, gloss = nfc(item[0]), item[1]
            entry = {"lemma": lemma, "gloss": gloss, "count": lemma_count[lemma]}
            if len(item) > 2:
                entry["kind"] = item[2]
            extras[pos].append(entry)
    topics = {"pronoun_kinds": {str(k): v for k, v in PRONOUN_KINDS.items()},
              "counts": counts, "extras": extras}

    meta = {
        "source": "MorphGNT: SBLGNT Edition (Tauber, ed.), https://github.com/morphgnt/sblgnt",
    }
    with open(os.path.join(ROOT, "forms.json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta, license="Parsing data CC BY-SA 3.0 (MorphGNT)", forms=forms),
                  f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "examples.json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta, license="Greek text: SBL Greek New Testament, "
                       "Copyright 2010 Society of Biblical Literature and Logos Bible Software",
                       examples=examples), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "topics.json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta, license="Counts from MorphGNT (CC BY-SA 3.0)", **topics),
                  f, ensure_ascii=False, separators=(",", ":"))
    print("forms:", len(forms), "| examples:", len(examples),
          "| distinct verses:", len({e["ref"] for e in examples.values()}),
          "| cards without an example:", unmatched)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
