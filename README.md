# Greek Flashcards

Static flashcards for the Biblical Greek vocabulary in `greek_vocab.json`
(Mounce, *Basics of Biblical Greek*). Plain HTML, CSS and JavaScript, with no build step.

## Use

- The **home page** has two groups of tiles. **Vocabulary**: Review (cards that are due),
  Learn (the next new words in your chapter order), Practice (all words) and Match. **Focus**:
  Parts of speech and Parsing. The lesson to do next is marked **Next**. Settings (⚙) is in the
  header; every other screen has a back button.
- **Parts of speech**: each part of speech (nouns, verbs, pronouns, prepositions, …) has its
  own page with Review, Learn, Practice and Match for just those words (each card shows its
  word inside a real New Testament phrase, e.g. a preposition with its object: διὰ τοῦ
  προφήτου, παρὰ τῷ θεῷ), a Parsing drill for
  the ones that inflect, and a chart of how often each word occurs in the New Testament,
  colored by how well you know it. Prepositions show which cases they take; pronouns are
  grouped by kind. The charts also include common prepositions and pronouns that are not in
  the vocabulary list (ἀνά, ἀντί, πρό; ἐμαυτοῦ, σεαυτοῦ, ὅδε, ποῖος, πόσος), marked as such.
- **Exercises** (Settings → Exercise):
  - **Mixed** (default): multiple choice while a card is new, typing the meaning once you
    know it (box 3 and up).
  - **Flip cards**: tap the card (or press **Space**), then mark it **Wrong** (`1` / `←`),
    **Skip** (`2` / `↓` / `s`) or **Right** (`3` / `→`).
  - **Multiple choice**: pick the meaning from four (keys `1`–`4`, then **Enter**).
  - **Type the meaning**: typed answers are matched loosely (any listed meaning, small typos
    allowed); **I was right** overrides a miss.
  - **Matching**: pair five Greek words with their meanings.
- After each answer the card shows a New Testament verse that uses the word.
- Missed cards come back later in the round. Skipped cards go to the end.
- Spaced repetition: cards you get right come back after 1, 3, 7, 14, then 30 days; cards you
  miss come back the next day. Only your first answer to a card in a round counts.
- Prepositions get one card per case (διά + genitive, διά + accusative), and words like ἕως
  get one card per use, so each meaning is learned and scheduled on its own.
- Under **Settings** you can study only some parts of speech (for example just prepositions),
  choose chapters, follow the textbook's Track One or Track Two chapter order for new cards,
  change the number of new words per lesson,
  flip to English→Greek, and turn off shuffling.
- Your settings, history and review schedule are saved in your browser.
- **Parsing drill**: parse New Testament forms of your vocabulary words (case, number and gender;
  or tense, voice, mood and person). Choose the chapter you have studied through, and only
  forms taught by then are included (for example participles from chapter 27). In the
  present, imperfect and perfect, middle and passive are accepted interchangeably.

## Offline and on your phone

After the site has been opened once, it keeps working without an internet connection.
You can also install it like an app: use **Install app** in Settings (Chrome, Edge, Android),
or **Share → Add to Home Screen** in Safari on iPhone and iPad.

When you change the list of files the site needs, bump `VERSION` in `sw.js`.

## Run locally

The page loads the JSON with `fetch`, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server
```

## Publish

In the repository settings on GitHub, go to **Pages** and deploy from the `main` branch, `/ (root)`.

## Data

- `greek_vocab.json`: the vocabulary list.
- `forms.json`, `examples.json` and `topics.json` are generated from
  [MorphGNT: SBLGNT Edition](https://github.com/morphgnt/sblgnt) by `tools/build_data.py`:

  ```bash
  python3 tools/build_data.py path/to/morphgnt-files
  ```

- `phrases.json` is generated from MACULA Greek's syntax trees for the whole New Testament
  ([Nestle1904/lowfat](https://github.com/Clear-Bible/macula-greek)) by `tools/build_phrases.py`:
  up to four common short Greek phrases per card, with a reference.

  ```bash
  python3 tools/build_phrases.py path/to/lowfat-directory
  ```

## Credits

- Example verses: SBL Greek New Testament, © 2010 Society of Biblical Literature and Logos
  Bible Software.
- Parsing data: MorphGNT (J. K. Tauber, ed.), CC BY-SA 3.0; `forms.json` is shared under the
  same license.
- Phrases: [MACULA Greek](https://github.com/Clear-Bible/macula-greek) (© Biblica, Inc.,
  CC BY 4.0); Greek text from the Nestle 1904 Greek New Testament (public domain).
