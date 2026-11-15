(function () {
  "use strict";

  var DATA_URL = "greek_vocab.json";
  var EXAMPLES_URL = "examples.json";
  var TOPICS_URL = "topics.json";
  var PHRASES_URL = "phrases.json";
  var CHART_ROWS = 15;        // long lists (nouns, verbs) start collapsed to this many
  var CHART_COLLAPSE_OVER = 30;

  // An example word and a color for each part of speech's tile.
  var PART_LOOK = {
    noun: ["λόγος", "t-review"], verb: ["λύω", "t-learn"], adjective: ["ἀγαθός", "t-practice"],
    pronoun: ["αὐτός", "t-match"], article: ["ὁ", "t-parse"], preposition: ["ἐν", "t-review"],
    adverb: ["νῦν", "t-learn"], conjunction: ["καί", "t-practice"], particle: ["οὐ", "t-match"],
    numeral: ["εἷς", "t-parse"]
  };
  // Parts of speech that inflect, so they have forms to parse.
  var PARSABLE = ["noun", "verb", "adjective", "pronoun", "article", "numeral"];
  var PRONOUN_KINDS = ["personal", "reflexive", "reciprocal", "demonstrative", "relative", "interrogative", "indefinite"];
  var MATCH_SIZE = 5;
  var MATCH_GAME_SIZE = 15;

  // What each lesson on the home page studies, and how it is described during the lesson.
  var LESSONS = {
    review: { title: "Today's review", empty: "Nothing is due right now. " },
    learn: { title: "Learn new words", empty: "There are no new words left in your chapters and parts of speech. " },
    practice: { title: "Practice", empty: "" },
    match: { title: "Matching game", empty: "" }
  };
  var EXERCISE_LABELS = {
    auto: "Multiple choice, then typing once you know a word",
    flip: "Flip cards: reveal, then mark yourself right or wrong",
    choice: "Multiple choice",
    type: "Type the meaning",
    match: "Match words with their meanings"
  };
  var SETTINGS_KEY = "greekFlashcards.settings";
  var STATS_KEY = "greekFlashcards.stats";
  var CASE_ORDER = ["nominative", "genitive", "dative", "accusative", "vocative"];
  var CASE_ABBR = { nominative: "nom.", genitive: "gen.", dative: "dat.", accusative: "acc.", vocative: "voc." };

  // Filter chips in this order; any other part of speech in the data is added after these.
  var PARTS = [
    ["noun", "Nouns"], ["verb", "Verbs"], ["adjective", "Adjectives"], ["pronoun", "Pronouns"],
    ["article", "Article"], ["preposition", "Prepositions"], ["adverb", "Adverbs"],
    ["conjunction", "Conjunctions"], ["particle", "Particles"], ["numeral", "Numbers"]
  ];

  // Track Two in the textbook takes chapters 15-18 and 21 before 10-14.
  var TRACK_TWO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 18, 21, 10, 11, 12, 13, 14, 19, 20];

  // Leitner boxes: days until the next review, indexed by box. Box 0 means new.
  var INTERVALS = [0, 1, 3, 7, 14, 30];
  var MAX_BOX = INTERVALS.length - 1;
  var DAY_MS = 24 * 60 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    settings: $("settings"),
    settingsToggle: $("settings-toggle"),
    chapterList: $("chapter-list"),
    partList: $("part-list"),
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
    caseTag: $("case-tag"),
    hint: $("hint"),
    choices: $("choices"),
    typeForm: $("type-form"),
    typeInput: $("type-input"),
    feedback: $("feedback"),
    match: $("match"),
    matchGreek: $("match-greek"),
    matchEnglish: $("match-english"),
    flipControls: $("flip-controls"),
    answerControls: $("answer-controls"),
    btnSkip2: $("btn-skip2"),
    btnContinue: $("btn-continue"),
    btnOverride: $("btn-override"),
    vocabView: $("vocab-view"),
    parseView: $("parse-view"),
    homeView: $("home-view"),
    lessonTitle: $("lesson-title"),
    lessonSub: $("lesson-sub"),
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
  var cards = [];
  var cardById = {};
  var chapters = [];
  var parts = [];
  var settings = {
    chapters: null, parts: null, newPerRound: 20, track: "one", exercise: "auto",
    direction: "greek", shuffle: true, repeat: true
  };
  var stats = {};
  var examples = {};
  var topics = { pronoun_kinds: {}, counts: {}, extras: {} };
  var phrases = {};          // card id -> New Testament phrases using the word
  var topic = null;        // part of speech being studied on its own page, or null
  var chartExpanded = false;
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

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function sortedCases(word) {
    if (!word.cases) return [];
    return Object.keys(word.cases).sort(function (a, b) {
      return CASE_ORDER.indexOf(a) - CASE_ORDER.indexOf(b);
    });
  }

  // ---------- cards ----------

  // One card per meaning. A preposition gets a card for each case it takes, and a
  // word like ἕως ("until"; + gen. "as far as") gets one for each use.
  function buildCards() {
    words.forEach(function (word) {
      if (word.gloss) {
        addCard({ id: String(word.id), word: word, pos: word.part_of_speech, kase: null, meaning: word.gloss });
      }
      sortedCases(word).forEach(function (c) {
        addCard({ id: word.id + ":" + c, word: word, pos: "preposition", kase: c, meaning: word.cases[c] });
      });
    });
  }

  function addCard(card) {
    card.order = cards.length;
    cards.push(card);
    cardById[card.id] = card;
  }

  function siblings(card) {
    return cards.filter(function (c) { return c.word === card.word && c !== card; });
  }

  function caseLabel(card) { return card.kase ? "+ " + card.kase : ""; }

  // Progress saved before prepositions were split was stored under the word's id;
  // give each of the word's new cards a copy so nothing is lost.
  function migrateStats() {
    var changed = false;
    words.forEach(function (word) {
      var key = String(word.id);
      if (!stats[key] || cardById[key]) return;
      cards.forEach(function (card) {
        if (card.word === word && !stats[card.id]) stats[card.id] = JSON.parse(JSON.stringify(stats[key]));
      });
      delete stats[key];
      changed = true;
    });
    if (changed) save(STATS_KEY, stats);
  }

  function chapterRank(chapter) {
    if (settings.track !== "two") return chapter;
    var i = TRACK_TWO.indexOf(chapter);
    // Chapters after the list keep book order, ranked after everything in it.
    return i === -1 ? TRACK_TWO.length + chapter : i;
  }

  function inChapters(card) { return settings.chapters.indexOf(card.word.chapter) !== -1; }
  function inParts(card) {
    return topic ? card.pos === topic : settings.parts.indexOf(card.pos) !== -1;
  }

  function selectedIds() {
    return cards
      .filter(function (card) { return inChapters(card) && inParts(card); })
      .map(function (card) { return card.id; });
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

  // Only the first answer to a card in a round moves it between boxes.
  // Practicing a card that isn't due yet never pushes it further out,
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

  function countSelected(test) {
    return selectedIds().filter(test).length;
  }

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
    if (tomorrow) return plural(tomorrow, "card") + " will be due for review tomorrow.";
    var upcoming = selectedIds()
      .filter(function (id) { return !isNew(id); })
      .map(function (id) { return stats[id].due; });
    if (!upcoming.length) return "";
    var days = Math.min.apply(null, upcoming) - today();
    return "Your next review is in " + plural(days, "day") + ".";
  }

  // ---------- settings UI ----------

  function renderChips(container, items, selected, onChange) {
    container.textContent = "";
    items.forEach(function (item) {
      var label = make("label", "chip" + (item.count === 0 ? " empty" : ""));
      var input = make("input");
      input.type = "checkbox";
      input.value = item.value;
      input.checked = selected.indexOf(item.value) !== -1;
      input.addEventListener("change", onChange);
      label.appendChild(input);
      var span = make("span", null, item.label);
      if (item.count !== undefined) span.appendChild(make("span", "count", String(item.count)));
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function checkedValues(container) {
    return Array.prototype.map.call(container.querySelectorAll("input:checked"), function (input) {
      return input.value;
    });
  }

  function renderChapterChips() {
    renderChips(el.chapterList, chapters.map(function (ch) {
      return { value: ch.chapter, label: "Ch. " + ch.chapter };
    }), settings.chapters, readChapterChips);
  }

  // Part-of-speech chips show how many cards each has in the selected chapters.
  function renderPartChips() {
    renderChips(el.partList, parts.map(function (part) {
      var count = cards.filter(function (card) { return card.pos === part[0] && inChapters(card); }).length;
      return { value: part[0], label: part[1], count: count };
    }), settings.parts, readPartChips);
  }

  function readChapterChips() {
    settings.chapters = checkedValues(el.chapterList).map(Number);
    save(SETTINGS_KEY, settings);
    renderPartChips();
    renderSrsStatus();
    refreshPage();
  }

  function readPartChips() {
    settings.parts = checkedValues(el.partList);
    save(SETTINGS_KEY, settings);
    renderSrsStatus();
    refreshPage();
  }

  function setAll(container, checked, read) {
    container.querySelectorAll("input").forEach(function (input) { input.checked = checked; });
    read();
  }

  function setRadio(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
      input.checked = input.value === value;
    });
  }

  function applySettingsToForm() {
    setRadio("direction", settings.direction);
    setRadio("track", settings.track);
    setRadio("exercise", settings.exercise);
    el.newPerRound.value = settings.newPerRound;
    el.shuffle.checked = settings.shuffle;
    el.repeat.checked = settings.repeat;
    renderChapterChips();
    renderPartChips();
  }

  function toggleSettings(open) {
    if (open === undefined) open = el.settings.hidden;
    el.settings.hidden = !open;
    if (open) renderSrsStatus();
    el.settingsToggle.setAttribute("aria-expanded", String(open));
    el.settingsToggle.classList.toggle("active", open);
    if (open) window.scrollTo(0, 0);
    else if (words.length) refreshPage();
  }

  // ---------- round ----------

  function newIdsInOrder() {
    return selectedIds().filter(isNew).sort(function (a, b) {
      var ca = cardById[a], cb = cardById[b];
      return chapterRank(ca.word.chapter) - chapterRank(cb.word.chapter) || ca.order - cb.order;
    });
  }

  function lessonDeck(lesson) {
    var ids;
    if (lesson === "review") {
      ids = selectedIds().filter(function (id) { return isDue(id); });
    } else if (lesson === "learn") {
      ids = newIdsInOrder().slice(0, settings.newPerRound || 20);
    } else {
      ids = selectedIds();
    }
    if (settings.shuffle || lesson === "match") shuffle(ids);
    return lesson === "match" ? ids.slice(0, MATCH_GAME_SIZE) : ids;
  }

  function hidePanels() {
    el.study.hidden = true;
    el.summary.hidden = true;
    el.caughtUp.hidden = true;
  }

  function showView(name) {
    el.homeView.hidden = name !== "home";
    el.vocabView.hidden = name !== "vocab";
    el.parseView.hidden = name !== "parse";
    $("topic-view").hidden = name !== "topic";
    $("parts-view").hidden = name !== "parts";
    showError("");
    window.scrollTo(0, 0);
  }

  function exerciseMode() {
    return round && round.lesson === "match" ? "match" : settings.exercise;
  }

  function updateLessonBar() {
    if (!round) return;
    el.lessonTitle.textContent = (round.topic ? partLabel(round.topic) + " · " : "") + LESSONS[round.lesson].title;
    el.lessonSub.textContent = EXERCISE_LABELS[exerciseMode()];
  }

  function startLesson(lesson) {
    startRound(null, lesson);
  }

  // With no ids, builds the lesson's deck. Otherwise studies exactly those cards.
  function startRound(ids, lesson) {
    lesson = lesson || (round && round.lesson) || "practice";
    toggleSettings(false);
    showView("vocab");
    hidePanels();
    if (!ids && !selectedIds().length) {
      showView("home");
      toggleSettings(true);
      showError(settings.chapters.length && settings.parts.length
        ? "None of the selected chapters have cards for the selected parts of speech."
        : "Select at least one chapter and one part of speech to study.");
      return;
    }
    if (ids) {
      ids = ids.slice();
      if (settings.shuffle) shuffle(ids);
    } else {
      ids = lessonDeck(lesson);
    }
    round = { lesson: lesson, topic: topic };
    updateLessonBar();
    $("vocab-home").textContent = "← " + (topic ? partLabel(topic) : "Home");
    if (!ids.length) {
      el.caughtUpText.textContent = LESSONS[lesson].empty + nextReviewText();
      el.caughtUp.hidden = false;
      $("caught-up-home").focus({ preventScroll: true });
      return;
    }

    round = {
      lesson: lesson,
      topic: topic,
      graded: {},
      queue: ids,
      total: ids.length,
      done: 0,
      right: 0,
      wrong: 0,
      skip: 0,
      missed: [],
      group: [],
      groupErrors: {},
      revealed: false
    };
    el.study.hidden = false;
    showCard();
  }

  function currentCard() {
    return round && round.queue.length ? cardById[round.queue[0]] : null;
  }

  // ---------- exercises ----------

  function exerciseFor(card) {
    var mode = exerciseMode();
    if (mode === "flip") return "flip";
    var english = settings.direction === "english";
    if (mode === "type") return english ? "choice" : "type";
    if (mode === "choice") return "choice";
    // Mixed: multiple choice while a card is new, typing once it reaches box 3.
    if (!english && boxOf(card.id) >= 3 && card.meaning.length <= 60) return "type";
    return "choice";
  }

  function optionText(card) {
    return settings.direction === "english" ? card.word.lemma : card.meaning;
  }

  // Wrong options: other words, preferably the same part of speech, never with the
  // same meaning (οἰκία and οἶκος are both "house, home").
  function distractors(card, n) {
    var pool = cards.filter(function (c) {
      return c.word !== card.word && c.meaning !== card.meaning && c.word.lemma !== card.word.lemma;
    });
    var ordered = shuffle(pool.filter(function (c) { return c.pos === card.pos; }))
      .concat(shuffle(pool.filter(function (c) { return c.pos !== card.pos; })));
    var picked = [];
    ordered.forEach(function (c) {
      var duplicate = picked.some(function (p) { return optionText(p) === optionText(c); });
      if (picked.length < n && !duplicate) picked.push(c);
    });
    return picked;
  }

  function renderChoices(card) {
    var english = settings.direction === "english";
    el.choices.textContent = "";
    shuffle(distractors(card, 3).concat([card])).forEach(function (option, i) {
      var button = make("button", "choice");
      button.type = "button";
      button.appendChild(make("kbd", null, String(i + 1)));
      var label = make("span", english ? "greek" : null, optionText(option));
      if (english) label.lang = "grc";
      button.appendChild(label);
      button.addEventListener("click", function () { choose(option, button); });
      button.dataset.correct = String(option === card);
      el.choices.appendChild(button);
    });
  }

  function choose(option, button) {
    var card = currentCard();
    if (!card || round.answered || round.busy) return;
    var correct = option === card;
    Array.prototype.forEach.call(el.choices.children, function (b) {
      b.disabled = true;
      if (b.dataset.correct === "true") b.classList.add("right");
    });
    if (!correct) button.classList.add("wrong");
    answered(card, correct);
  }

  // English answers are matched loosely: any listed meaning counts, ignoring case,
  // punctuation, "I"/"to"/articles, and a typo or two in longer words.
  function simplify(text) {
    return text.toLowerCase()
      .replace(/[’'"“”.?!]/g, "")
      .replace(/[^a-z0-9/ ]+/g, " ")
      .replace(/\s+/g, " ").trim()
      .replace(/^(i|to|a|an|the) /, "")
      .replace(/^(a|an|the) /, "");
  }

  function acceptedAnswers(meaning) {
    var out = [];
    meaning.split(";").forEach(function (part) {
      part = part.replace(/^\s*[a-z ]+:\s*/i, "");  // "adverb: now" -> "now"
      part.split(",").forEach(function (piece) {
        [piece.replace(/\([^)]*\)/g, ""), piece.replace(/[()]/g, "")].forEach(function (variant) {
          // "he/she/it said" -> "he said", "she said", "it said"
          var options = [""];
          variant.trim().split(/\s+/).forEach(function (w) {
            var next = [];
            w.split("/").forEach(function (alt) {
              options.forEach(function (o) { if (next.length < 24) next.push((o + " " + alt).trim()); });
            });
            options = next;
          });
          options.concat([variant]).forEach(function (o) {
            var simple = simplify(o);
            if (simple && out.indexOf(simple) === -1) out.push(simple);
          });
        });
      });
    });
    return out;
  }

  // Typos: insertions, deletions, substitutions and swapped neighbors each count as one.
  function editDistance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  function typedMatches(value, meaning) {
    var accepted = acceptedAnswers(meaning);
    return value.split(/[;,]/).some(function (piece) {
      var typed = simplify(piece);
      if (!typed) return false;
      return accepted.some(function (answer) {
        var allowed = answer.length >= 9 ? 2 : answer.length >= 5 ? 1 : 0;
        return editDistance(typed, answer) <= allowed;
      });
    });
  }

  function checkTyped() {
    var card = currentCard();
    if (!card || round.answered || round.busy) return;
    var value = el.typeInput.value;
    if (!value.trim()) return;
    var correct = typedMatches(value, card.meaning);
    el.typeInput.readOnly = true;
    el.typeForm.classList.add(correct ? "right" : "wrong");
    el.feedback.textContent = correct ? "Correct!" : "Not quite. The answer is on the card.";
    el.feedback.className = "feedback " + (correct ? "right" : "wrong");
    el.feedback.hidden = false;
    el.btnOverride.hidden = correct;
    answered(card, correct);
  }

  // Multiple choice and typing: show the answer, then wait for Continue.
  function answered(card, correct) {
    round.answered = true;
    round.result = correct;
    renderAnswer(card);
    el.card.classList.add("revealed");
    el.btnSkip2.hidden = true;
    el.btnContinue.hidden = false;
    if (round.exercise === "choice") el.btnContinue.focus({ preventScroll: true });
  }

  function continueCard() {
    if (!round || !round.answered || round.busy) return;
    finish(round.result);
  }

  function showCard() {
    updateProgress();
    if (exerciseMode() === "match") {
      showMatch();
      return;
    }
    el.match.hidden = true;
    var card = currentCard();
    if (!card) {
      finishRound();
      return;
    }
    var word = card.word;
    var exercise = exerciseFor(card);
    round.exercise = exercise;
    round.revealed = false;
    round.answered = false;
    round.result = null;
    el.card.hidden = false;
    el.card.classList.remove("revealed", "flash-right", "flash-wrong");
    el.card.classList.toggle("flip", exercise === "flip");
    el.hint.hidden = exercise !== "flip";
    el.answer.hidden = true;
    el.answer.textContent = "";
    el.btnRight.disabled = true;
    el.btnWrong.disabled = true;

    el.cardChapter.textContent = "Chapter " + word.chapter;
    el.cardPos.textContent = card.pos;

    var english = settings.direction === "english";
    el.prompt.className = english ? "prompt english" : "prompt greek";
    el.prompt.lang = english ? "en" : "grc";
    // Lessons from a part-of-speech page show the Greek word inside a real
    // phrase; the question is still just the word's meaning.
    round.phrase = english ? null : phraseFor(card);
    if (round.phrase) {
      el.prompt.textContent = "";
      el.prompt.appendChild(phraseNode(round.phrase));
      el.prompt.classList.add("in-phrase");
      el.caseTag.hidden = true;
    } else {
      el.prompt.textContent = english ? card.meaning : word.lemma;
      el.caseTag.textContent = caseLabel(card);
      el.caseTag.hidden = !card.kase;
    }

    el.flipControls.hidden = exercise !== "flip";
    el.answerControls.hidden = exercise === "flip";
    el.btnSkip2.hidden = false;
    el.btnContinue.hidden = true;
    el.btnOverride.hidden = true;
    el.feedback.hidden = true;
    el.choices.hidden = exercise !== "choice";
    el.typeForm.hidden = exercise !== "type";
    if (exercise === "choice") renderChoices(card);
    if (exercise === "type") {
      el.typeInput.value = "";
      el.typeInput.readOnly = false;
      el.typeForm.classList.remove("right", "wrong");
      if (el.settings.hidden) el.typeInput.focus({ preventScroll: true });
    } else if (el.settings.hidden) {
      // Keep focus on the card so keys go to the card rather than re-pressing a button.
      el.card.focus({ preventScroll: true });
    }
  }

  function reveal() {
    var card = currentCard();
    if (!card || round.exercise !== "flip" || round.revealed) return;
    round.revealed = true;
    el.card.classList.add("revealed");
    renderAnswer(card);
    el.btnRight.disabled = false;
    el.btnWrong.disabled = false;
  }

  function renderExample(card) {
    var ex = examples[card.id];
    if (!ex) return;
    var p = make("p", "example");
    p.lang = "grc";
    ex.text.forEach(function (token, i) {
      if (i) p.appendChild(document.createTextNode(" "));
      if (ex.hl.indexOf(i) === -1) {
        p.appendChild(document.createTextNode(token));
        return;
      }
      // Highlight the word itself, not the punctuation attached to it.
      var m = /^(\P{L}*)(.*?)(\P{L}*)$/u.exec(token);
      p.appendChild(document.createTextNode(m[1]));
      p.appendChild(make("mark", null, m[2]));
      p.appendChild(document.createTextNode(m[3]));
    });
    var ref = make("cite", null, ex.ref);
    ref.lang = "en";
    p.appendChild(ref);
    el.answer.appendChild(p);
  }

  function renderAnswer(card) {
    var word = card.word;
    el.answer.textContent = "";

    if (settings.direction === "english") {
      var greek = make("p", "answer-main greek", word.lemma);
      greek.lang = "grc";
      el.answer.appendChild(greek);
    } else {
      el.answer.appendChild(make("p", "answer-main", card.meaning));
    }

    // The word's other meanings, so each card is seen in context.
    var others = siblings(card).map(function (other) {
      return (other.kase ? "+ " + CASE_ABBR[other.kase] + " " : "") + other.meaning;
    });
    if (others.length) el.answer.appendChild(make("p", "also", "Also: " + others.join("; ")));

    if (round.phrase) renderPhrase(card, round.phrase);
    else renderExample(card);

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
      var pp = make("p", "parts", word.principal_parts.join(", "));
      pp.lang = "grc";
      pp.title = "Principal parts";
      el.answer.appendChild(pp);
    }

    var s = stats[card.id];
    var history = isNew(card.id) ? "New card" : "Box " + boxOf(card.id) + " of " + MAX_BOX;
    if (s && (s.right || s.wrong)) history += " · " + s.right + " right, " + s.wrong + " wrong";
    el.answer.appendChild(make("p", "record", history));
    el.answer.hidden = false;
  }

  // ---------- phrases ----------

  // A random New Testament phrase for the card, in lessons started from a
  // part-of-speech page; null elsewhere or when the card has none.
  function phraseFor(card) {
    var list = round && round.topic && phrases[card.id];
    return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  function phraseNode(phrase) {
    var node = make("span", "phrase-text");
    phrase.t.forEach(function (token, i) {
      if (i) node.appendChild(document.createTextNode(" "));
      node.appendChild(phrase.h.indexOf(i) === -1 ? document.createTextNode(token) : make("mark", null, token));
    });
    return node;
  }

  function renderPhrase(card, phrase) {
    var p = make("p", "example");
    var greek = phraseNode(phrase);
    greek.lang = "grc";
    p.appendChild(greek);
    var ref = make("cite", null, phrase.ref + (card.kase ? " · " + card.word.lemma.split(/[,(]/)[0].trim() + " + " + card.kase : ""));
    ref.lang = "en";
    p.appendChild(ref);
    el.answer.appendChild(p);
  }

  // ---------- matching ----------

  function showMatch() {
    el.card.hidden = true;
    el.choices.hidden = true;
    el.typeForm.hidden = true;
    el.feedback.hidden = true;
    el.flipControls.hidden = true;
    el.answerControls.hidden = true;
    if (!round.group || !round.group.length) {
      round.group = round.queue.splice(0, MATCH_SIZE);
      round.groupErrors = {};
    }
    updateProgress();
    if (!round.group.length) {
      el.match.hidden = true;
      finishRound();
      return;
    }
    round.selected = null;
    el.match.hidden = false;
    el.matchGreek.textContent = "";
    el.matchEnglish.textContent = "";
    shuffle(round.group.slice()).forEach(function (id) {
      var card = cardById[id];
      var phrase = phraseFor(card);
      var label = phrase ? phraseNode(phrase) :
        card.word.lemma.split(",")[0] + (card.kase ? " + " + CASE_ABBR[card.kase] : "");
      addTile(el.matchGreek, "greek", id, label);
    });
    shuffle(round.group.slice()).forEach(function (id) {
      addTile(el.matchEnglish, "english", id, cardById[id].meaning);
    });
  }

  function addTile(column, side, id, label) {
    var tile = make("button", "tile" + (side === "greek" ? " greek" : ""), typeof label === "string" ? label : null);
    if (typeof label !== "string") tile.appendChild(label);
    tile.type = "button";
    if (side === "greek") tile.lang = "grc";
    tile.addEventListener("click", function () { pickTile(tile, side, id); });
    column.appendChild(tile);
  }

  function pickTile(tile, side, id) {
    if (tile.disabled || round.busy) return;
    var sel = round.selected;
    if (!sel || sel.side === side) {
      if (sel) sel.tile.classList.remove("selected");
      round.selected = { tile: tile, side: side, id: id };
      tile.classList.add("selected");
      return;
    }
    sel.tile.classList.remove("selected");
    round.selected = null;
    var greekId = side === "greek" ? id : sel.id;
    var englishId = side === "english" ? id : sel.id;
    var pair = [tile, sel.tile];
    // Compare meanings, not ids: two words can share a meaning.
    if (cardById[greekId].meaning === cardById[englishId].meaning) {
      pair.forEach(function (t) { t.disabled = true; t.classList.add("matched"); });
      round.group.splice(round.group.indexOf(greekId), 1);
      settle(greekId, !round.groupErrors[greekId]);
      updateProgress();
      if (!round.group.length) {
        round.busy = true;
        setTimeout(function () {
          round.busy = false;
          showCard();
        }, 450);
      }
    } else {
      round.groupErrors[greekId] = true;
      pair.forEach(function (t) { t.classList.add("mismatch"); });
      setTimeout(function () {
        pair.forEach(function (t) { t.classList.remove("mismatch"); });
      }, 450);
    }
  }

  // Put an unfinished matching group back at the front of the queue.
  function returnGroup() {
    if (round && round.group && round.group.length) {
      round.queue = round.group.concat(round.queue);
      round.group = [];
    }
  }

  function record(id, correct) {
    // Start from what is saved, so answers from another open tab or the installed app survive.
    stats = load(STATS_KEY) || stats;
    var s = stats[id] || (stats[id] = { right: 0, wrong: 0 });
    s[correct ? "right" : "wrong"] += 1;
    schedule(id, correct);
    save(STATS_KEY, stats);
  }

  // Record an answer for a card that is already off the front of the queue.
  function settle(id, correct) {
    record(id, correct);
    if (correct) {
      round.right += 1;
      round.done += 1;
      return;
    }
    round.wrong += 1;
    if (round.missed.indexOf(id) === -1) round.missed.push(id);
    if (settings.repeat) {
      // Bring the card back a few cards later so it gets another try this round.
      var gap = Math.min(round.queue.length, 3 + Math.floor(Math.random() * 3));
      round.queue.splice(gap, 0, id);
    } else {
      round.done += 1;
    }
  }

  function finish(correct) {
    settle(round.queue.shift(), correct);
    advance(correct ? "flash-right" : "flash-wrong");
  }

  function markRight() {
    if (!currentCard() || round.exercise !== "flip" || !round.revealed) return;
    finish(true);
  }

  function markWrong() {
    if (!currentCard() || round.exercise !== "flip" || !round.revealed) return;
    finish(false);
  }

  function skip() {
    var card = currentCard();
    if (!card || round.busy || round.answered || exerciseMode() === "match") return;
    round.skip += 1;
    round.queue.push(round.queue.shift());
    advance();
  }

  // The queue has already moved on, so lock the controls until the next card is
  // shown; otherwise a double press would grade a card the user never saw.
  function advance(flashClass) {
    round.revealed = false;
    round.answered = false;
    el.btnRight.disabled = true;
    el.btnWrong.disabled = true;
    if (flashClass) {
      round.busy = true;
      el.card.classList.add(flashClass);
      setTimeout(function () {
        round.busy = false;
        showCard();
      }, 180);
    } else {
      showCard();
    }
  }

  function updateProgress() {
    if (!round) return;
    var pct = round.total ? (round.done / round.total) * 100 : 0;
    el.progressFill.style.width = pct + "%";
    el.countRemaining.textContent = (round.queue.length + (round.group ? round.group.length : 0)) + " left";
    el.countRight.textContent = round.right;
    el.countWrong.textContent = round.wrong;
    el.countSkip.textContent = round.skip;
  }

  function finishRound() {
    el.study.hidden = true;
    el.summary.hidden = false;

    var firstTry = round.total - round.missed.length;
    el.summaryText.textContent =
      "You went through " + plural(round.total, "card") + ". " +
      firstTry + " right on the first try, " + round.missed.length + " missed at least once" +
      (round.skip ? ", " + plural(round.skip, "skip") + "." : ".");
    el.summaryNext.textContent = nextReviewText();

    el.missedList.textContent = "";
    round.missed.forEach(function (id) {
      var card = cardById[id];
      var li = make("li");
      var greek = make("span", "greek", card.word.lemma + (card.kase ? " " + caseLabel(card) : ""));
      greek.lang = "grc";
      li.appendChild(greek);
      li.appendChild(make("span", "gloss", card.meaning));
      el.missedList.appendChild(li);
    });
    el.practiceMissed.hidden = round.missed.length === 0;
    (round.missed.length ? el.practiceMissed : $("restart")).focus();
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = !message;
  }

  // ---------- events ----------

  function onRadio(name, apply) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
      input.addEventListener("change", function () {
        apply(input.value);
        save(SETTINGS_KEY, settings);
      });
    });
  }

  function bindEvents() {
    el.settingsToggle.addEventListener("click", function () { toggleSettings(); });
    $("chapters-all").addEventListener("click", function () { setAll(el.chapterList, true, readChapterChips); });
    $("chapters-none").addEventListener("click", function () { setAll(el.chapterList, false, readChapterChips); });
    $("parts-all").addEventListener("click", function () { setAll(el.partList, true, readPartChips); });
    $("parts-none").addEventListener("click", function () { setAll(el.partList, false, readPartChips); });
    onRadio("direction", function (value) {
      settings.direction = value;
      if (round && !el.study.hidden) showCard();
    });
    onRadio("track", function (value) { settings.track = value; });
    onRadio("exercise", function (value) {
      settings.exercise = value;
      updateLessonBar();
      if (round && !el.study.hidden && !round.busy) {
        returnGroup();
        showCard();
      }
    });
    ["review", "learn", "practice", "match"].forEach(function (lesson) {
      $("lesson-" + lesson).addEventListener("click", function () { startLesson(lesson); });
    });
    $("lesson-parse").addEventListener("click", function () { topic = null; openParsing(); });
    ["review", "learn", "practice", "match"].forEach(function (lesson) {
      $("topic-lesson-" + lesson).addEventListener("click", function () { startLesson(lesson); });
    });
    $("topic-lesson-parse").addEventListener("click", openParsing);
    $("topic-home").addEventListener("click", showParts);
    $("chart-more").addEventListener("click", function () {
      chartExpanded = !chartExpanded;
      renderChart();
    });
    ["home-link", "parts-home"].forEach(function (id) { $(id).addEventListener("click", showHome); });
    $("open-parts").addEventListener("click", showParts);
    // Inside a lesson, "back" returns to the part-of-speech page it was started from.
    ["vocab-home", "parse-home", "summary-home", "caught-up-home"].forEach(function (id) {
      $(id).addEventListener("click", goBack);
    });
    $("settings-done").addEventListener("click", function () {
      toggleSettings(false);
    });
    el.typeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (round && round.answered) continueCard();
      else checkTyped();
    });
    el.btnContinue.addEventListener("click", continueCard);
    el.btnSkip2.addEventListener("click", skip);
    el.btnOverride.addEventListener("click", function () {
      if (!round || !round.answered) return;
      round.result = true;
      continueCard();
    });
    el.newPerRound.addEventListener("change", function () {
      var raw = el.newPerRound.value.trim();
      var n = Math.round(Number(raw));
      // Number("") is 0, so an emptied field would otherwise switch new cards off.
      if (raw !== "" && isFinite(n)) settings.newPerRound = Math.max(1, Math.min(200, n));
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
    $("reset-stats").addEventListener("click", function () {
      if (!confirm("Clear your saved history and review schedule for every card?")) return;
      stats = {};
      save(STATS_KEY, stats);
      renderSrsStatus();
    });
    $("restart").addEventListener("click", function () { startLesson(round.lesson); });
    el.practiceMissed.addEventListener("click", function () { startRound(round.missed, round.lesson); });

    // Another tab or the installed app saved progress: pick it up.
    window.addEventListener("storage", function (e) {
      if (e.key !== STATS_KEY) return;
      stats = load(STATS_KEY) || {};
      if (!el.settings.hidden) renderSrsStatus();
    });

    el.card.addEventListener("click", reveal);
    el.btnRight.addEventListener("click", markRight);
    el.btnWrong.addEventListener("click", markWrong);
    el.btnSkip.addEventListener("click", skip);

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el.vocabView.hidden || el.study.hidden || !round || exerciseMode() === "match") return;
      var tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Let Space/Enter activate a focused button natively.
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      if (round.exercise === "choice" || round.exercise === "type") {
        if ((e.key === "Enter" || e.key === " ") && round.answered) {
          e.preventDefault();
          continueCard();
        } else if (round.exercise === "choice" && !round.answered && /^[1-4]$/.test(e.key)) {
          var option = el.choices.children[Number(e.key) - 1];
          if (option) option.click();
        } else if (e.key === "s" && !round.answered) {
          skip();
        }
        return;
      }
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

  // ---------- home ----------

  function setBadge(id, text, disabled) {
    $("meta-" + id).textContent = text;
    $("lesson-" + id).disabled = !!disabled;
  }

  function renderHome() {
    var ids = selectedIds();
    var due = ids.filter(function (id) { return isDue(id); }).length;
    var fresh = ids.filter(isNew).length;

    var batch = Math.min(fresh, settings.newPerRound || 20);
    setBadge("review", due ? String(due) : "✓", !due);
    setBadge("learn", fresh ? String(batch) : "✓", !fresh);
    setBadge("practice", String(ids.length), !ids.length);
    setBadge("match", String(Math.min(ids.length, MATCH_GAME_SIZE)), ids.length < 2);
    // Highlight the one lesson to do next: reviews first, then new words.
    var next = due ? "review" : fresh ? "learn" : null;
    ["review", "learn"].forEach(function (lesson) {
      $("lesson-" + lesson).classList.toggle("recommended", lesson === next);
    });
  }

  function renderPosGrid() {
    var list = $("pos-grid");
    list.textContent = "";
    parts.forEach(function (part) {
      var pos = part[0];
      var ids = cards.filter(function (c) { return c.pos === pos && inChapters(c); }).map(function (c) { return c.id; });
      var started = ids.filter(function (id) { return !isNew(id); }).length;
      var look = PART_LOOK[pos] || ["·", "t-review"];
      var b = make("button", "menu-row");
      b.type = "button";
      var icon = make("span", "mi pos-icon " + look[1], look[0]);
      icon.lang = "grc";
      icon.setAttribute("aria-hidden", "true");
      b.appendChild(icon);
      var text = make("span", "mt");
      text.appendChild(make("b", null, part[1]));
      var bar = make("span", "pos-bar");
      var fill = make("span", "pos-fill");
      fill.style.width = (ids.length ? started / ids.length * 100 : 0) + "%";
      bar.appendChild(fill);
      text.appendChild(bar);
      b.appendChild(text);
      b.appendChild(make("span", "mb", String(ids.length)));
      b.appendChild(make("span", "chev", "›"));
      b.disabled = !ids.length;
      b.setAttribute("aria-label", part[1] + ": " + ids.length + " cards, " + started + " started");
      b.addEventListener("click", function () { showTopic(pos); });
      list.appendChild(b);
    });
  }

  function showParts() {
    if (round) returnGroup();
    topic = null;
    toggleSettings(false);
    showView("parts");
    renderPosGrid();
  }

  function partLabel(pos) {
    var part = parts.filter(function (p) { return p[0] === pos; })[0];
    return part ? part[1] : pos;
  }

  function refreshPage() {
    if (!el.homeView.hidden) renderHome();
    if (!$("parts-view").hidden) renderPosGrid();
    if (!$("topic-view").hidden) renderTopic();
  }

  function showHome() {
    if (round) returnGroup();
    topic = null;
    toggleSettings(false);
    showView("home");
    renderHome();
  }

  function goBack() {
    if (round) returnGroup();
    var from = el.parseView.hidden ? round && round.topic : parseTopic;
    if (from) showTopic(from);
    else showHome();
  }

  var parseTopic = null;

  function openParsing() {
    toggleSettings(false);
    parseTopic = topic;
    $("parse-home").textContent = "← " + (topic ? partLabel(topic) : "Home");
    showView("parse");
    if (window.ParseDrill) {
      window.ParseDrill.open({ words: words, chapterRank: chapterRank, showError: showError },
        topic ? { pos: topic, label: partLabel(topic) } : null);
    }
  }

  // ---------- part-of-speech pages ----------

  function showTopic(pos) {
    if (round) returnGroup();
    topic = pos;
    chartExpanded = false;
    toggleSettings(false);
    showView("topic");
    renderTopic();
  }

  function renderTopic() {
    var ids = selectedIds();
    var due = ids.filter(function (id) { return isDue(id); }).length;
    var fresh = ids.filter(isNew).length;
    var wordCount = words.filter(function (w) {
      return cards.some(function (c) { return c.word === w && c.pos === topic && inChapters(c); });
    }).length;
    $("topic-title").textContent = partLabel(topic);
    $("topic-sub").textContent = plural(wordCount, "word") + " · " + plural(ids.length, "card") +
      (settings.chapters.length === chapters.length ? "" : " in your chapters");
    var badge = function (lesson, text, off) {
      $("topic-meta-" + lesson).textContent = text;
      $("topic-lesson-" + lesson).disabled = !!off;
    };
    badge("review", due ? String(due) : "✓", !due);
    badge("learn", fresh ? String(Math.min(fresh, settings.newPerRound || 20)) : "✓", !fresh);
    badge("practice", String(ids.length), !ids.length);
    badge("match", String(Math.min(ids.length, MATCH_GAME_SIZE)), ids.length < 2);
    $("topic-lesson-parse").hidden = PARSABLE.indexOf(topic) === -1;
    renderChart();
  }

  // How well a word is known, from its cards: new, learning, or known well (box 4+).
  function wordStatus(word) {
    var own = cards.filter(function (c) { return c.word === word && c.pos === topic; });
    if (own.every(function (c) { return isNew(c.id); })) return "new";
    return own.every(function (c) { return boxOf(c.id) >= 4; }) ? "known" : "learning";
  }

  function chartRows() {
    var rows = [];
    words.forEach(function (word) {
      var own = cards.filter(function (c) { return c.word === word && c.pos === topic; });
      if (!own.length || settings.chapters.indexOf(word.chapter) === -1) return;
      rows.push({
        lemma: word.lemma.split(/[,(]/)[0].trim(),
        count: word.frequency || topics.counts[word.id] || 0,
        status: wordStatus(word),
        cases: own.filter(function (c) { return c.kase; }).map(function (c) { return c.kase; }),
        meaning: own.map(function (c) { return (c.kase ? "+ " + CASE_ABBR[c.kase] + " " : "") + c.meaning; }).join("; "),
        detail: plural(own.length, "card") + " · chapter " + word.chapter,
        kind: topics.pronoun_kinds[word.id] || "other"
      });
    });
    (topics.extras[topic] || []).forEach(function (extra) {
      rows.push({ lemma: extra.lemma, count: extra.count, status: "extra", cases: [],
        meaning: extra.gloss, detail: "Not in your list", kind: extra.kind || "other" });
    });
    rows.sort(function (a, b) { return b.count - a.count; });
    return rows;
  }

  function renderChart() {
    var chart = $("topic-chart");
    var rows = chartRows();
    var max = Math.max.apply(null, rows.map(function (r) { return r.count; }).concat([1]));
    chart.textContent = "";
    var groups;
    if (topic === "pronoun") {
      // Pronouns are grouped by kind, as in reference grammars.
      groups = PRONOUN_KINDS.concat(["other"]).map(function (kind) {
        return { title: kind, rows: rows.filter(function (r) { return r.kind === kind; }) };
      }).filter(function (g) { return g.rows.length; });
    } else {
      var collapsible = rows.length > CHART_COLLAPSE_OVER;
      var shown = chartExpanded || !collapsible ? rows : rows.slice(0, CHART_ROWS);
      groups = [{ title: null, rows: shown }];
      $("chart-more").hidden = !collapsible;
      $("chart-more").textContent = chartExpanded ? "Show fewer" : "Show all " + rows.length;
    }
    if (topic === "pronoun") $("chart-more").hidden = true;
    groups.forEach(function (group) {
      if (group.title) chart.appendChild(make("h3", "chart-group", group.title));
      group.rows.forEach(function (row) { chart.appendChild(chartRow(row, max)); });
    });
  }

  function chartRow(row, max) {
    var item = make("div", "chart-item");
    var b = make("button", "bar-row status-" + row.status);
    b.type = "button";
    b.setAttribute("aria-expanded", "false");
    var label = make("span", "bar-label");
    var greek = make("span", "greek", row.lemma);
    greek.lang = "grc";
    label.appendChild(greek);
    row.cases.forEach(function (c) { label.appendChild(make("span", "case-dot case-" + c, CASE_ABBR[c].charAt(0).toUpperCase())); });
    b.appendChild(label);
    var track = make("span", "bar-track");
    var fill = make("span", "bar-fill");
    fill.style.width = Math.max(1.5, row.count / max * 100) + "%";
    track.appendChild(fill);
    track.appendChild(make("span", "bar-count", row.count ? String(row.count) : "–"));
    b.appendChild(track);
    var info = make("div", "bar-info");
    info.hidden = true;
    info.appendChild(make("span", null, row.meaning));
    info.appendChild(make("span", "bar-detail", row.detail));
    b.addEventListener("click", function () {
      info.hidden = !info.hidden;
      b.setAttribute("aria-expanded", String(!info.hidden));
    });
    item.appendChild(b);
    item.appendChild(info);
    return item;
  }

  // ---------- init ----------

  function init(data) {
    chapters = data.chapters;
    chapters.forEach(function (ch) {
      ch.words.forEach(function (w) { words.push(w); });
    });
    buildCards();
    el.source.textContent = data.source + " · " + words.length + " words, " + cards.length + " cards";

    parts = PARTS.filter(function (part) {
      return cards.some(function (card) { return card.pos === part[0]; });
    });
    cards.forEach(function (card) {
      var known = parts.some(function (part) { return part[0] === card.pos; });
      if (!known) parts.push([card.pos, card.pos.charAt(0).toUpperCase() + card.pos.slice(1)]);
    });

    var savedSettings = load(SETTINGS_KEY);
    if (savedSettings) {
      for (var key in settings) {
        if (Object.prototype.hasOwnProperty.call(savedSettings, key)) settings[key] = savedSettings[key];
      }
    }
    var knownChapters = chapters.map(function (ch) { return ch.chapter; });
    if (!Array.isArray(settings.chapters)) settings.chapters = knownChapters.slice();
    settings.chapters = settings.chapters.filter(function (c) { return knownChapters.indexOf(c) !== -1; });
    var knownParts = parts.map(function (part) { return part[0]; });
    if (!Array.isArray(settings.parts)) settings.parts = knownParts.slice();
    settings.parts = settings.parts.filter(function (p) { return knownParts.indexOf(p) !== -1; });

    stats = load(STATS_KEY) || {};
    migrateStats();

    applySettingsToForm();
    bindEvents();
    showHome();
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

  // Part-of-speech chart extras are optional too.
  // Phrases are optional: without them, cards show the word alone.
  fetch(PHRASES_URL)
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) { if (data && data.cards) phrases = data.cards; })
    .catch(function () { /* no phrases */ });

  fetch(TOPICS_URL)
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data) return;
      topics = data;
      if (words.length && !$("topic-view").hidden) renderTopic();
    })
    .catch(function () { /* charts show only your words */ });

  // Example verses are optional: cards work without them.
  fetch(EXAMPLES_URL)
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) { if (data && data.examples) examples = data.examples; })
    .catch(function () { /* no examples */ });

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      try {
        init(data);
      } catch (err) {
        hidePanels();
        showError("Something went wrong while starting the flashcards: " + err.message);
        console.error(err);
      }
    }, function (err) {
      el.study.hidden = true;
      showError("Could not load " + DATA_URL + " (" + err.message + "). " +
        "If you opened this file directly from disk, serve the folder over HTTP instead, " +
        "for example with: python3 -m http.server");
    });
})();
