(function () {
  "use strict";

  var DATA_URL = "greek_vocab.json";
  var SETTINGS_KEY = "greekFlashcards.settings";
  var STATS_KEY = "greekFlashcards.stats";
  var CASE_ORDER = ["nominative", "genitive", "dative", "accusative", "vocative"];
  var CASE_ABBR = { nominative: "nom.", genitive: "gen.", dative: "dat.", accusative: "acc.", vocative: "voc." };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    settings: $("settings"),
    settingsToggle: $("settings-toggle"),
    chapterList: $("chapter-list"),
    shuffle: $("opt-shuffle"),
    repeat: $("opt-repeat"),
    study: $("study"),
    summary: $("summary"),
    card: $("card"),
    prompt: $("prompt"),
    answer: $("answer"),
    cardChapter: $("card-chapter"),
    cardPos: $("card-pos"),
    btnWrong: $("btn-wrong"),
    btnSkip: $("btn-skip"),
    btnRight: $("btn-right"),
    progressFill: $("progress-fill"),
    countRemaining: $("count-remaining"),
    countRight: $("count-right"),
    countWrong: $("count-wrong"),
    countSkip: $("count-skip"),
    summaryText: $("summary-text"),
    missedList: $("missed-list"),
    practiceMissed: $("practice-missed"),
    error: $("error"),
    source: $("source")
  };

  var words = [];
  var byId = {};
  var chapters = [];
  var settings = { chapters: null, direction: "greek", shuffle: true, repeat: true };
  var stats = {};
  var round = null;

  // ---------- storage (best effort; the app works without it) ----------

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function sortedCases(word) {
    if (!word.cases) return [];
    return Object.keys(word.cases).sort(function (a, b) {
      return CASE_ORDER.indexOf(a) - CASE_ORDER.indexOf(b);
    });
  }

  // English meaning as a single line, used for prompts and the missed list.
  function meaning(word) {
    var parts = [];
    if (word.gloss) parts.push(word.gloss);
    sortedCases(word).forEach(function (c) {
      parts.push("(" + CASE_ABBR[c] + ") " + word.cases[c]);
    });
    return parts.join("; ");
  }

  // ---------- settings UI ----------

  function renderChapterChips() {
    el.chapterList.textContent = "";
    chapters.forEach(function (ch) {
      var label = make("label", "chip");
      var input = make("input");
      input.type = "checkbox";
      input.value = ch.chapter;
      input.checked = settings.chapters.indexOf(ch.chapter) !== -1;
      input.addEventListener("change", readChapterChips);
      label.appendChild(input);
      var span = make("span", null, "Ch. " + ch.chapter);
      span.title = ch.words.length + " words";
      label.appendChild(span);
      el.chapterList.appendChild(label);
    });
  }

  function readChapterChips() {
    settings.chapters = Array.prototype.map.call(
      el.chapterList.querySelectorAll("input:checked"),
      function (input) { return Number(input.value); }
    );
    save(SETTINGS_KEY, settings);
  }

  function setAllChapters(checked) {
    el.chapterList.querySelectorAll("input").forEach(function (input) { input.checked = checked; });
    readChapterChips();
  }

  function applySettingsToForm() {
    document.querySelectorAll('input[name="direction"]').forEach(function (input) {
      input.checked = input.value === settings.direction;
    });
    el.shuffle.checked = settings.shuffle;
    el.repeat.checked = settings.repeat;
    renderChapterChips();
  }

  function toggleSettings(open) {
    if (open === undefined) open = el.settings.hidden;
    el.settings.hidden = !open;
    el.settingsToggle.setAttribute("aria-expanded", String(open));
    el.settingsToggle.textContent = open ? "Close settings" : "Settings";
  }

  // ---------- round ----------

  function startRound(ids) {
    if (!ids) {
      ids = words
        .filter(function (w) { return settings.chapters.indexOf(w.chapter) !== -1; })
        .map(function (w) { return w.id; });
    }
    if (!ids.length) {
      el.study.hidden = true;
      el.summary.hidden = true;
      toggleSettings(true);
      showError("Select at least one chapter to study.");
      return;
    }
    showError("");
    ids = ids.slice();
    if (settings.shuffle) shuffle(ids);

    round = {
      queue: ids,
      total: ids.length,
      done: 0,
      right: 0,
      wrong: 0,
      skip: 0,
      missed: [],
      revealed: false
    };
    el.summary.hidden = true;
    el.study.hidden = false;
    toggleSettings(false);
    showCard();
  }

  function currentWord() {
    return round && round.queue.length ? byId[round.queue[0]] : null;
  }

  function showCard() {
    var word = currentWord();
    updateProgress();
    if (!word) {
      finishRound();
      return;
    }
    round.revealed = false;
    el.card.classList.remove("revealed", "flash-right", "flash-wrong");
    el.card.setAttribute("aria-label", "Flashcard. Press to reveal the answer.");
    el.answer.hidden = true;
    el.answer.textContent = "";
    el.btnRight.disabled = true;
    el.btnWrong.disabled = true;

    el.cardChapter.textContent = "Chapter " + word.chapter;
    el.cardPos.textContent = word.part_of_speech;

    var english = settings.direction === "english";
    el.prompt.className = english ? "prompt english" : "prompt greek";
    el.prompt.lang = english ? "en" : "grc";
    el.prompt.textContent = english ? meaning(word) : word.lemma;

    // Keep focus on the card so Space flips it rather than re-pressing a button.
    if (el.settings.hidden) el.card.focus({ preventScroll: true });
  }

  function reveal() {
    var word = currentWord();
    if (!word || round.revealed) return;
    round.revealed = true;
    el.card.classList.add("revealed");
    el.card.setAttribute("aria-label", "Flashcard, answer shown.");
    el.answer.textContent = "";

    if (settings.direction === "english") {
      var greek = make("p", "answer-main greek", word.lemma);
      greek.lang = "grc";
      el.answer.appendChild(greek);
    } else {
      if (word.gloss) el.answer.appendChild(make("p", "answer-main", word.gloss));
      var cases = sortedCases(word);
      if (cases.length) {
        var dl = make("dl", "cases");
        cases.forEach(function (c) {
          dl.appendChild(make("dt", null, "+ " + c));
          dl.appendChild(make("dd", null, word.cases[c]));
        });
        el.answer.appendChild(dl);
      }
    }

    var details = make("p", "details");
    if (word.root) {
      var root = make("span", null, "root ");
      var rootValue = make("span", "greek", word.root);
      rootValue.lang = "grc";
      root.appendChild(rootValue);
      details.appendChild(root);
    }
    if (word.frequency) details.appendChild(make("span", null, "occurs " + word.frequency + "×"));
    if (details.childNodes.length) el.answer.appendChild(details);

    if (word.principal_parts && word.principal_parts.length) {
      var parts = make("p", "parts", word.principal_parts.join(", "));
      parts.lang = "grc";
      parts.title = "Principal parts";
      el.answer.appendChild(parts);
    }

    var s = stats[word.id];
    if (s && (s.right || s.wrong)) {
      el.answer.appendChild(make("p", "record",
        "Your record: " + s.right + " right, " + s.wrong + " wrong"));
    }

    el.answer.hidden = false;
    el.btnRight.disabled = false;
    el.btnWrong.disabled = false;
  }

  function record(id, key) {
    var s = stats[id] || (stats[id] = { right: 0, wrong: 0 });
    s[key] += 1;
    save(STATS_KEY, stats);
  }

  function markRight() {
    var word = currentWord();
    if (!word || !round.revealed) return;
    record(word.id, "right");
    round.right += 1;
    round.done += 1;
    round.queue.shift();
    advance("flash-right");
  }

  function markWrong() {
    var word = currentWord();
    if (!word || !round.revealed) return;
    record(word.id, "wrong");
    round.wrong += 1;
    if (round.missed.indexOf(word.id) === -1) round.missed.push(word.id);
    round.queue.shift();
    if (settings.repeat) {
      // Bring the card back a few cards later so it gets another try this round.
      var gap = Math.min(round.queue.length, 3 + Math.floor(Math.random() * 3));
      round.queue.splice(gap, 0, word.id);
    } else {
      round.done += 1;
    }
    advance("flash-wrong");
  }

  function skip() {
    var word = currentWord();
    if (!word) return;
    round.skip += 1;
    round.queue.push(round.queue.shift());
    advance();
  }

  function advance(flashClass) {
    if (flashClass) {
      el.card.classList.add(flashClass);
      setTimeout(showCard, 180);
    } else {
      showCard();
    }
  }

  function updateProgress() {
    if (!round) return;
    var pct = round.total ? (round.done / round.total) * 100 : 0;
    el.progressFill.style.width = pct + "%";
    el.countRemaining.textContent = round.queue.length + " left";
    el.countRight.textContent = round.right;
    el.countWrong.textContent = round.wrong;
    el.countSkip.textContent = round.skip;
  }

  function finishRound() {
    el.study.hidden = true;
    el.summary.hidden = false;

    var firstTry = round.total - round.missed.length;
    el.summaryText.textContent =
      "You went through " + round.total + (round.total === 1 ? " word" : " words") + ". " +
      firstTry + " right on the first try, " + round.missed.length + " missed at least once" +
      (round.skip ? ", " + round.skip + " skips." : ".");

    el.missedList.textContent = "";
    round.missed.forEach(function (id) {
      var word = byId[id];
      var li = make("li");
      var greek = make("span", "greek", word.lemma);
      greek.lang = "grc";
      li.appendChild(greek);
      li.appendChild(make("span", "gloss", meaning(word)));
      el.missedList.appendChild(li);
    });
    el.practiceMissed.hidden = round.missed.length === 0;
    el.practiceMissed.focus();
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = !message;
  }

  // ---------- events ----------

  function bindEvents() {
    el.settingsToggle.addEventListener("click", function () { toggleSettings(); });
    $("chapters-all").addEventListener("click", function () { setAllChapters(true); });
    $("chapters-none").addEventListener("click", function () { setAllChapters(false); });
    document.querySelectorAll('input[name="direction"]').forEach(function (input) {
      input.addEventListener("change", function () {
        settings.direction = input.value;
        save(SETTINGS_KEY, settings);
        if (round && !el.study.hidden) showCard();
      });
    });
    el.shuffle.addEventListener("change", function () {
      settings.shuffle = el.shuffle.checked;
      save(SETTINGS_KEY, settings);
    });
    el.repeat.addEventListener("change", function () {
      settings.repeat = el.repeat.checked;
      save(SETTINGS_KEY, settings);
    });
    $("start").addEventListener("click", function () { startRound(); });
    $("reset-stats").addEventListener("click", function () {
      if (!confirm("Clear your saved right/wrong history for every word?")) return;
      stats = {};
      save(STATS_KEY, stats);
    });
    $("restart").addEventListener("click", function () { startRound(); });
    el.practiceMissed.addEventListener("click", function () { startRound(round.missed); });

    el.card.addEventListener("click", reveal);
    el.btnRight.addEventListener("click", markRight);
    el.btnWrong.addEventListener("click", markWrong);
    el.btnSkip.addEventListener("click", skip);

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el.study.hidden) return;
      var tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Let Space/Enter activate a focused button natively.
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          reveal();
          break;
        case "1":
        case "ArrowLeft":
          markWrong();
          break;
        case "2":
        case "ArrowDown":
        case "s":
          e.preventDefault();
          skip();
          break;
        case "3":
        case "ArrowRight":
          markRight();
          break;
      }
    });
  }

  // ---------- init ----------

  function init(data) {
    chapters = data.chapters;
    chapters.forEach(function (ch) {
      ch.words.forEach(function (w) {
        words.push(w);
        byId[w.id] = w;
      });
    });
    el.source.textContent = data.source + " · " + words.length + " words";

    var savedSettings = load(SETTINGS_KEY);
    if (savedSettings) {
      for (var key in settings) {
        if (Object.prototype.hasOwnProperty.call(savedSettings, key)) settings[key] = savedSettings[key];
      }
    }
    var known = chapters.map(function (ch) { return ch.chapter; });
    if (!Array.isArray(settings.chapters)) settings.chapters = known.slice();
    settings.chapters = settings.chapters.filter(function (c) { return known.indexOf(c) !== -1; });
    stats = load(STATS_KEY) || {};

    applySettingsToForm();
    bindEvents();
    startRound();
  }

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(init)
    .catch(function (err) {
      el.study.hidden = true;
      showError("Could not load " + DATA_URL + " (" + err.message + "). " +
        "If you opened this file directly from disk, serve the folder over HTTP instead, " +
        "for example with: python3 -m http.server");
    });
})();
