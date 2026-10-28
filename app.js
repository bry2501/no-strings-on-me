(function () {
  "use strict";

  var DATA_URL = "greek_vocab.json";
  var SETTINGS_KEY = "greekFlashcards.settings";
  var STATS_KEY = "greekFlashcards.stats";
  var CASE_ORDER = ["nominative", "genitive", "dative", "accusative", "vocative"];
  // Card stripe classes from style.css; "" is the default combination (185).
  var COMBOS = ["", "combo-186", "combo-187", "combo-188"];
  var CASE_ABBR = { nominative: "nom.", genitive: "gen.", dative: "dat.", accusative: "acc.", vocative: "voc." };

  // Leitner boxes: days until the next review, indexed by box. Box 0 means new.
  var INTERVALS = [0, 1, 3, 7, 14, 30];
  var MAX_BOX = INTERVALS.length - 1;
  var DAY_MS = 24 * 60 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    settings: $("settings"),
    settingsToggle: $("settings-toggle"),
    chapterList: $("chapter-list"),
    shuffle: $("opt-shuffle"),
    repeat: $("opt-repeat"),
    newPerRound: $("opt-new"),
    srsStatus: $("srs-status"),
    study: $("study"),
    summary: $("summary"),
    summaryNext: $("summary-next"),
    caughtUp: $("caught-up"),
    caughtUpText: $("caught-up-text"),
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
  var settings = {
    chapters: null, mode: "review", newPerRound: 20, direction: "greek", shuffle: true, repeat: true
  };
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

  // ---------- spaced repetition ----------

  // Days since the epoch in local time, so "due tomorrow" flips at local midnight.
  function today() {
    var now = new Date();
    return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / DAY_MS);
  }

  function boxOf(id) {
    var s = stats[id];
    return s && s.box ? s.box : 0;
  }

  function isNew(id) { return boxOf(id) === 0; }

  function isDue(id, day) {
    return !isNew(id) && stats[id].due <= (day === undefined ? today() : day);
  }

  // Only the first answer to a word in a round moves it between boxes.
  // Practicing a word that isn't due yet never pushes it further out,
  // but missing it still brings it back tomorrow.
  function schedule(id, correct) {
    if (round.graded[id]) return;
    round.graded[id] = true;
    var s = stats[id];
    if (correct) {
      if (!isNew(id) && !isDue(id)) return;
      s.box = Math.min(boxOf(id) + 1, MAX_BOX);
    } else {
      s.box = 1;
    }
    s.due = today() + INTERVALS[s.box];
  }

  function selectedIds() {
    return words
      .filter(function (w) { return settings.chapters.indexOf(w.chapter) !== -1; })
      .map(function (w) { return w.id; });
  }

  function countSelected(test) {
    return selectedIds().filter(test).length;
  }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function renderSrsStatus() {
    var ids = selectedIds();
    var due = ids.filter(function (id) { return isDue(id); }).length;
    var fresh = ids.filter(isNew).length;
    var mastered = ids.filter(function (id) { return boxOf(id) === MAX_BOX; }).length;
    el.srsStatus.textContent = "";
    [["Due now", due], ["New", fresh], ["Learning", ids.length - fresh - mastered], ["In the last box", mastered]]
      .forEach(function (pair, i) {
        if (i) el.srsStatus.appendChild(document.createTextNode(" · "));
        el.srsStatus.appendChild(document.createTextNode(pair[0] + ": "));
        el.srsStatus.appendChild(make("b", null, String(pair[1])));
      });
  }

  function nextReviewText() {
    var tomorrow = countSelected(function (id) { return isDue(id, today() + 1); });
    if (tomorrow) return plural(tomorrow, "word") + " will be due for review tomorrow.";
    var upcoming = selectedIds()
      .filter(function (id) { return !isNew(id); })
      .map(function (id) { return stats[id].due; });
    if (!upcoming.length) return "";
    var days = Math.min.apply(null, upcoming) - today();
    return "Your next review is in " + plural(days, "day") + ".";
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
    renderSrsStatus();
  }

  function setAllChapters(checked) {
    el.chapterList.querySelectorAll("input").forEach(function (input) { input.checked = checked; });
    readChapterChips();
  }

  function applySettingsToForm() {
    document.querySelectorAll('input[name="direction"]').forEach(function (input) {
      input.checked = input.value === settings.direction;
    });
    document.querySelectorAll('input[name="mode"]').forEach(function (input) {
      input.checked = input.value === settings.mode;
    });
    el.newPerRound.value = settings.newPerRound;
    el.shuffle.checked = settings.shuffle;
    el.repeat.checked = settings.repeat;
    renderChapterChips();
  }

  function toggleSettings(open) {
    if (open === undefined) open = el.settings.hidden;
    el.settings.hidden = !open;
    if (open) renderSrsStatus();
    el.settingsToggle.setAttribute("aria-expanded", String(open));
    el.settingsToggle.textContent = open ? "Close settings" : "Settings";
  }

  // ---------- round ----------

  // Due words first, then up to newPerRound new words in chapter order.
  function reviewDeck() {
    var ids = selectedIds();
    var due = ids.filter(function (id) { return isDue(id); });
    var fresh = ids.filter(isNew).slice(0, settings.newPerRound);
    if (settings.shuffle) {
      shuffle(due);
      shuffle(fresh);
    }
    return due.concat(fresh);
  }

  function hidePanels() {
    el.study.hidden = true;
    el.summary.hidden = true;
    el.caughtUp.hidden = true;
  }

  // With no ids, builds the deck from the settings. Otherwise studies exactly those words.
  function startRound(ids) {
    hidePanels();
    if (!settings.chapters.length) {
      toggleSettings(true);
      showError("Select at least one chapter to study.");
      return;
    }
    showError("");
    if (ids) {
      ids = ids.slice();
      if (settings.shuffle) shuffle(ids);
    } else if (settings.mode === "review") {
      ids = reviewDeck();
    } else {
      ids = selectedIds();
      if (settings.shuffle) shuffle(ids);
    }
    if (!ids.length) {
      toggleSettings(false);
      var fresh = countSelected(isNew);
      el.caughtUpText.textContent = "Nothing is due in the selected chapters. " +
        (fresh ? plural(fresh, "new word") + (fresh === 1 ? " is" : " are") +
                 " waiting, but new words per round is set to 0. "
               : "You have started every word in them. ") +
        nextReviewText();
      el.caughtUp.hidden = false;
      return;
    }

    round = {
      graded: {},
      queue: ids,
      total: ids.length,
      done: 0,
      right: 0,
      wrong: 0,
      skip: 0,
      missed: [],
      revealed: false
    };
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
    el.card.classList.remove("revealed", "flash-right", "flash-wrong", "combo-186", "combo-187", "combo-188");
    var combo = COMBOS[word.id % COMBOS.length];
    if (combo) el.card.classList.add(combo);
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
    var history = isNew(word.id) ? "New word" : "Box " + boxOf(word.id) + " of " + MAX_BOX;
    if (s && (s.right || s.wrong)) history += " · " + s.right + " right, " + s.wrong + " wrong";
    el.answer.appendChild(make("p", "record", history));

    el.answer.hidden = false;
    el.btnRight.disabled = false;
    el.btnWrong.disabled = false;
  }

  function record(id, correct) {
    var s = stats[id] || (stats[id] = { right: 0, wrong: 0 });
    s[correct ? "right" : "wrong"] += 1;
    schedule(id, correct);
    save(STATS_KEY, stats);
  }

  function markRight() {
    var word = currentWord();
    if (!word || !round.revealed) return;
    record(word.id, true);
    round.right += 1;
    round.done += 1;
    round.queue.shift();
    advance("flash-right");
  }

  function markWrong() {
    var word = currentWord();
    if (!word || !round.revealed) return;
    record(word.id, false);
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
    el.summaryNext.textContent = nextReviewText();

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
    document.querySelectorAll('input[name="mode"]').forEach(function (input) {
      input.addEventListener("change", function () {
        settings.mode = input.value;
        save(SETTINGS_KEY, settings);
      });
    });
    el.newPerRound.addEventListener("change", function () {
      var n = Math.round(Number(el.newPerRound.value));
      settings.newPerRound = isFinite(n) ? Math.max(0, Math.min(200, n)) : 20;
      el.newPerRound.value = settings.newPerRound;
      save(SETTINGS_KEY, settings);
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
      if (!confirm("Clear your saved history and review schedule for every word?")) return;
      stats = {};
      save(STATS_KEY, stats);
      renderSrsStatus();
    });
    $("practice-all").addEventListener("click", function () { startRound(selectedIds()); });
    $("caught-up-settings").addEventListener("click", function () { toggleSettings(true); });
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

  // ---------- offline support and install ----------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline mode is optional */ });
    });
  }

  // Chrome, Edge and Android offer an install prompt we can trigger from a button.
  // Safari has no such event; there people use Share > Add to Home Screen.
  var installPrompt = null;
  var installButton = $("install");
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installPrompt = e;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener("appinstalled", function () { installButton.hidden = true; });

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
