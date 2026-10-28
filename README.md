# Greek Flashcards

Static flashcards for the Biblical Greek vocabulary in `greek_vocab.json`
(Mounce, *Basics of Biblical Greek*). Plain HTML, CSS and JavaScript, with no build step.

## Use

- Tap the card (or press **Space**) to reveal the answer.
- Mark it **Wrong** (`1` / `←`), **Skip** (`2` / `↓` / `s`), or **Right** (`3` / `→`).
- Missed cards come back later in the round. Skipped cards go to the end.
- Under **Settings** you can choose chapters, Greek→English or English→Greek, and shuffling.
- Your settings and per-word right/wrong history are saved in your browser.

## Run locally

The page loads the JSON with `fetch`, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server
```

## Publish

In the repository settings on GitHub, go to **Pages** and deploy from the `main` branch, `/ (root)`.
