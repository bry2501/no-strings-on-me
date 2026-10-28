# Greek Flashcards

Static flashcards for the Biblical Greek vocabulary in `greek_vocab.json`
(Mounce, *Basics of Biblical Greek*). Plain HTML, CSS and JavaScript, with no build step.

## Use

- Tap the card (or press **Space**) to reveal the answer.
- Mark it **Wrong** (`1` / `←`), **Skip** (`2` / `↓` / `s`), or **Right** (`3` / `→`).
- Missed cards come back later in the round. Skipped cards go to the end.
- By default each round is a spaced-repetition review: the words that are due, then up to
  20 new words in chapter order. Words you get right come back after 1, 3, 7, 14, then 30 days;
  words you miss come back the next day. Only your first answer to a word in a round counts.
- Under **Settings** you can switch to studying every word in the selected chapters, change the
  number of new words per round, choose chapters, flip to English→Greek, and turn off shuffling.
- Your settings, history and review schedule are saved in your browser.

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
