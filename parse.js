// Parsing drill: identify New Testament forms of the vocabulary words.
// Loaded alongside app.js; app.js calls ParseDrill.open() when the tab is shown.
(function () {
  "use strict";

  var FORMS_URL = "forms.json";
  var SETTINGS_KEY = "greekFlashcards.parse";
  var ROUND_SIZE = 20;

  // Each field reads one position of the MorphGNT parsing code
  // (person, tense, voice, mood, case, number, gender, degree).
  var FIELDS = {
    tense: { label: "Tense", at: 1, values: [["P", "Present"], ["I", "Imperfect"], ["F", "Future"], ["A", "Aorist"], ["X", "Perfect"], ["Y", "Pluperfect"]] },
    voice: { label: "Voice", at: 2, values: [["A", "Active"], ["M", "Middle"], ["P", "Passive"]] },
    mood: { label: "Mood", at: 3, values: [["I", "Indicative"], ["S", "Subjunctive"], ["D", "Imperative"], ["N", "Infinitive"], ["P", "Participle"], ["O", "Optative"]] },
    person: { label: "Person", at: 0, values: [["1", "1st"], ["2", "2nd"], ["3", "3rd"]] },
    kase: { label: "Case", at: 4, values: [["N", "Nominative"], ["G", "Genitive"], ["D", "Dative"], ["A", "Accusative"], ["V", "Vocative"]] },
    number: { label: "Number", at: 5, values: [["S", "Singular"], ["P", "Plural"]] },
    gender: { label: "Gender", at: 6, values: [["M", "Masculine"], ["F", "Feminine"], ["N", "Neuter"]] }
  };
  var VERB_FIELDS = ["tense", "voice", "mood", "person", "kase", "number", "gender"];
  var NOMINAL_FIELDS = ["kase", "number", "gender"];
  // Middle and passive forms are identical in these tenses, so either answer counts.
  var SHARED_MIDDLE_PASSIVE = "PIXY";

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    setup: $("parse-setup"),
    chapter: $("parse-chapter"),
    nominal: $("parse-nominal"),
    verbs: $("parse-verbs"),
    count: $("parse-count"),
    start: $("parse-start"),
    study: $("parse-study"),
    progress: $("parse-progress"),
    left: $("parse-left"),
    right: $("parse-right"),
    wrong: $("parse-wrong"),
    pos: $("parse-pos"),
    form: $("parse-form"),
    answer: $("parse-answer"),
    fields: $("parse-fields"),
    skip: $("parse-skip"),
    check: $("parse-check"),
    next: $("parse-next"),
    summary: $("parse-summary"),
    summaryText: $("parse-summary-text"),
    missed: $("parse-missed"),
    again: $("parse-again"),
    setupBtn: $("parse-setup-btn")
  };

  var api = null;        // words, chapterRank and showError from app.js
  var wordById = {};
  var forms = null;
  var loading = null;
  var settings = { chapter: null, nominal: true, verbs: true };
  var round = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  }

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function isVerb(item) { return item.p[0][3] !== "-"; }

  // ---------- setup ----------

  function rank(chapter) { return api.chapterRank(chapter); }

  function eligible() {
    var limit = rank(settings.chapter);
    return forms.filter(function (item) {
      var verb = isVerb(item);
      if (verb ? !settings.verbs : !settings.nominal) return false;
      return rank(wordById[item.w].chapter) <= limit && rank(item.g) <= limit;
    });
  }

  function renderSetup() {
    var chapters = [];
    api.words.forEach(function (w) { if (chapters.indexOf(w.chapter) === -1) chapters.push(w.chapter); });
    chapters.sort(function (a, b) { return rank(a) - rank(b); });
    if (chapters.indexOf(settings.chapter) === -1) settings.chapter = chapters[chapters.length - 1];
    el.chapter.textContent = "";
    chapters.forEach(function (c) {
      var option = make("option", null, String(c));
      option.value = c;
      option.selected = c === settings.chapter;
      el.chapter.appendChild(option);
    });
    el.nominal.checked = settings.nominal;
    el.verbs.checked = settings.verbs;
    updateCount();
  }

  function updateCount() {
    var n = eligible().length;
    el.count.textContent = n ? n + " forms to practice." :
      "No forms yet: nouns start in chapter 6 and verbs in chapter 16.";
    el.start.disabled = n === 0;
  }

  // ---------- round ----------

  // Pick forms at random, favoring common ones (weight = square root of frequency).
  function pick(pool, n) {
    var items = pool.slice(), chosen = [];
    while (chosen.length < n && items.length) {
      var total = items.reduce(function (sum, item) { return sum + Math.sqrt(item.n); }, 0);
      var r = Math.random() * total, i = 0;
      while ((r -= Math.sqrt(items[i].n)) > 0 && i < items.length - 1) i++;
      chosen.push(items.splice(i, 1)[0]);
    }
    return chosen;
  }

  function start(list) {
    var pool = list || pick(eligible(), ROUND_SIZE);
    if (!pool.length) return;
    // Offer only the options that occur in this round's forms.
    var seen = {};
    pool.forEach(function (item) {
      item.p.forEach(function (code) {
        Object.keys(FIELDS).forEach(function (f) {
          var v = code[FIELDS[f].at];
          if (v !== "-") (seen[f] = seen[f] || {})[v] = true;
        });
      });
    });
    round = { queue: pool.slice(), total: pool.length, right: 0, wrong: 0, missed: [], seen: seen };
    el.setup.hidden = true;
    el.summary.hidden = true;
    el.study.hidden = false;
    show();
  }

  function current() { return round && round.queue[0]; }

  function show() {
    var item = current();
    updateProgress();
    if (!item) {
      finish();
      return;
    }
    round.checked = false;
    round.choice = {};
    el.form.textContent = item.f;
    el.pos.textContent = wordById[item.w].part_of_speech;
    el.answer.hidden = true;
    el.answer.textContent = "";
    el.check.hidden = false;
    el.next.hidden = true;
    el.skip.hidden = false;
    renderFields(item);
  }

  function renderFields(item) {
    el.fields.textContent = "";
    var names = isVerb(item) ? VERB_FIELDS : NOMINAL_FIELDS;
    // Personal pronouns (ἐγώ, σύ) have no gender.
    var genderless = !isVerb(item) && item.p.every(function (code) { return code[6] === "-"; });
    names.forEach(function (name) {
      if (name === "gender" && genderless) return;
      var field = FIELDS[name];
      var values = field.values.filter(function (v) { return round.seen[name] && round.seen[name][v[0]]; });
      if (!values.length) return;
      var row = make("fieldset", "parse-row");
      row.dataset.field = name;
      row.appendChild(make("legend", null, field.label));
      values.forEach(function (v) {
        var b = make("button", "opt", v[1]);
        b.type = "button";
        b.dataset.value = v[0];
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () { select(name, v[0]); });
        row.appendChild(b);
      });
      el.fields.appendChild(row);
    });
    updateRows(item);
  }

  // Which fields a verb needs depends on its mood.
  function needed(item, choice) {
    if (!isVerb(item)) {
      return NOMINAL_FIELDS.filter(function (f) { return el.fields.querySelector('[data-field="' + f + '"]'); });
    }
    var mood = choice.mood;
    if (mood === "N") return ["tense", "voice", "mood"];
    if (mood === "P") return ["tense", "voice", "mood", "kase", "number", "gender"];
    return ["tense", "voice", "mood", "person", "number"];
  }

  function updateRows(item) {
    var fields = needed(item, round.choice);
    Array.prototype.forEach.call(el.fields.children, function (row) {
      row.hidden = fields.indexOf(row.dataset.field) === -1;
    });
  }

  function select(name, value) {
    if (round.checked) return;
    round.choice[name] = value;
    var row = el.fields.querySelector('[data-field="' + name + '"]');
    Array.prototype.forEach.call(row.querySelectorAll(".opt"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.value === value));
    });
    updateRows(current());
  }

  function fieldMatches(name, chosen, code) {
    var actual = code[FIELDS[name].at];
    if (name === "voice" && SHARED_MIDDLE_PASSIVE.indexOf(code[1]) !== -1 &&
        "MP".indexOf(actual) !== -1 && "MP".indexOf(chosen) !== -1) return true;
    if (name === "gender" && actual === "-") return true;
    return chosen === actual;
  }

  function check() {
    var item = current();
    if (!item || round.checked) return;
    var fields = needed(item, round.choice);
    var missing = fields.filter(function (f) { return !round.choice[f]; });
    if (missing.length) {
      api.showError("Choose the " + missing.map(function (f) { return FIELDS[f].label.toLowerCase(); }).join(", ") + ".");
      return;
    }
    api.showError("");
    // Compare with the closest of the form's possible parsings.
    var best = null;
    item.p.forEach(function (code) {
      var hits = fields.filter(function (f) { return fieldMatches(f, round.choice[f], code); }).length;
      if (!best || hits > best.hits) best = { code: code, hits: hits };
    });
    var correct = best.hits === fields.length;
    round.checked = true;
    fields.forEach(function (f) {
      var row = el.fields.querySelector('[data-field="' + f + '"]');
      var ok = fieldMatches(f, round.choice[f], best.code);
      Array.prototype.forEach.call(row.querySelectorAll(".opt"), function (b) {
        b.disabled = true;
        if (b.dataset.value === round.choice[f]) b.classList.add(ok ? "right" : "wrong");
        else if (!ok && b.dataset.value === best.code[FIELDS[f].at]) b.classList.add("right");
      });
    });
    Array.prototype.forEach.call(el.fields.querySelectorAll(".parse-row[hidden] .opt"), function (b) { b.disabled = true; });
    if (correct) round.right += 1;
    else {
      round.wrong += 1;
      round.missed.push(item);
    }
    showAnswer(item, correct);
    el.check.hidden = true;
    el.skip.hidden = true;
    el.next.hidden = false;
    el.next.focus({ preventScroll: true });
  }

  function describe(code) {
    var name = function (f) {
      var v = code[FIELDS[f].at];
      var pair = FIELDS[f].values.filter(function (x) { return x[0] === v; })[0];
      return pair ? pair[1].toLowerCase() : "";
    };
    var nominal = [name("kase"), name("number"), name("gender")].filter(Boolean).join(" ");
    if (code[3] === "-") return nominal;
    var voice = name("voice");
    if (SHARED_MIDDLE_PASSIVE.indexOf(code[1]) !== -1 && "MP".indexOf(code[2]) !== -1) voice = "middle/passive";
    var verb = [name("tense"), voice, name("mood")].join(" ");
    if (code[3] === "N") return verb;
    if (code[3] === "P") return verb + ", " + nominal;
    return verb + ", " + name("person") + " person " + name("number");
  }

  function showAnswer(item, correct) {
    var word = wordById[item.w];
    el.answer.textContent = "";
    el.answer.appendChild(make("p", "feedback " + (correct ? "right" : "wrong"), correct ? "Correct!" : "Not quite."));
    var parses = [];
    item.p.forEach(function (code) {
      var text = describe(code);
      if (parses.indexOf(text) === -1) parses.push(text);
    });
    el.answer.appendChild(make("p", "answer-main", parses.join("; or ")));
    var from = make("p", "also");
    from.appendChild(document.createTextNode("from "));
    var lemma = make("span", "greek", word.lemma);
    lemma.lang = "grc";
    from.appendChild(lemma);
    from.appendChild(document.createTextNode(" · " + (word.gloss || meaningOfCases(word))));
    el.answer.appendChild(from);
    el.answer.appendChild(make("p", "record", "occurs " + item.n + "× in the New Testament"));
    el.answer.hidden = false;
  }

  function meaningOfCases(word) {
    return Object.keys(word.cases || {}).map(function (c) { return word.cases[c]; }).join("; ");
  }

  function next() {
    if (!round || !round.checked) return;
    round.queue.shift();
    show();
  }

  function skip() {
    if (!round || round.checked || round.queue.length < 2) return;
    round.queue.push(round.queue.shift());
    show();
  }

  function updateProgress() {
    var done = round.right + round.wrong;
    el.progress.style.width = (round.total ? done / round.total * 100 : 0) + "%";
    el.left.textContent = round.queue.length + " left";
    el.right.textContent = round.right;
    el.wrong.textContent = round.wrong;
  }

  function finish() {
    el.study.hidden = true;
    el.summary.hidden = false;
    el.summaryText.textContent = round.right + " of " + round.total + " parsed correctly.";
    el.missed.textContent = "";
    round.missed.forEach(function (item) {
      var li = make("li");
      var form = make("span", "greek", item.f);
      form.lang = "grc";
      li.appendChild(form);
      li.appendChild(make("span", "gloss", describe(item.p[0])));
      el.missed.appendChild(li);
    });
    el.again.textContent = round.missed.length ? "Practice the ones I missed" : "Another 20";
    el.again.focus({ preventScroll: true });
  }

  // ---------- events ----------

  function bind() {
    el.chapter.addEventListener("change", function () {
      settings.chapter = Number(el.chapter.value);
      save();
      updateCount();
    });
    el.nominal.addEventListener("change", function () { settings.nominal = el.nominal.checked; save(); updateCount(); });
    el.verbs.addEventListener("change", function () { settings.verbs = el.verbs.checked; save(); updateCount(); });
    el.start.addEventListener("click", function () { start(); });
    el.check.addEventListener("click", check);
    el.next.addEventListener("click", next);
    el.skip.addEventListener("click", skip);
    el.again.addEventListener("click", function () {
      start(round && round.missed.length ? round.missed : null);
    });
    el.setupBtn.addEventListener("click", function () {
      el.summary.hidden = true;
      el.setup.hidden = false;
      updateCount();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || $("parse-view").hidden || el.study.hidden) return;
      if (e.target.tagName === "BUTTON" || e.target.tagName === "SELECT") return;
      e.preventDefault();
      if (round && round.checked) next(); else check();
    });
  }

  window.ParseDrill = {
    open: function (app) {
      if (!api) {
        api = app;
        app.words.forEach(function (w) { wordById[w.id] = w; });
        var saved = load();
        Object.keys(settings).forEach(function (k) { if (k in saved) settings[k] = saved[k]; });
        bind();
      }
      if (forms) {
        if (!el.setup.hidden) renderSetup();
        return;
      }
      if (loading) return;
      el.count.textContent = "Loading forms…";
      el.start.disabled = true;
      loading = fetch(FORMS_URL)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          forms = data.forms;
          renderSetup();
        })
        .catch(function (err) {
          loading = null;
          el.count.textContent = "Could not load the forms (" + err.message + "). Check your connection and open this tab again.";
        });
    }
  };
})();
