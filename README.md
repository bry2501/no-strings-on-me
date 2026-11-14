# Greek Flashcards

Static flashcards for the Biblical Greek vocabulary in `greek_vocab.json`
(Mounce, *Basics of Biblical Greek*). Plain HTML, CSS and JavaScript, with no build step.

## Use

- The **home page** shows what is due today and offers five lessons:
  - **Today's review**: the cards that are due.
  - **Learn new words**: the next words in your chapter order (20 by default).
  - **Practice**: every card in your chosen chapters and parts of speech.
  - **Matching game**: 15 cards, paired five at a time.
  - **Parsing drill**: New Testament forms of your vocabulary words.

  During a lesson, the bar at the top names the lesson and how you answer; **← Home** goes back.
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
- `forms.json` and `examples.json` are generated from
  [MorphGNT: SBLGNT Edition](https://github.com/morphgnt/sblgnt) by `tools/build_data.py`:

  ```bash
  python3 tools/build_data.py path/to/morphgnt-files
  ```

## Credits

- Example verses: SBL Greek New Testament, © 2010 Society of Biblical Literature and Logos
  Bible Software.
- Parsing data: MorphGNT (J. K. Tauber, ed.), CC BY-SA 3.0; `forms.json` is shared under the
  same license.
