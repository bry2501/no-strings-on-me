// Reader: the Gospel of John, sentence by sentence, with word lookup, an optional
// interlinear gloss, sentence structure (clauses and phrases) and a place to write
// your own translation. Data: john/NN.json, built by tools/build_john.py.
(function () {
  "use strict";

  var STATE_KEY = "greekFlashcards.reader";
  var TRANSLATIONS_KEY = "greekFlashcards.translations";
  var SCORES_KEY = "greekFlashcards.analysis";
  var CHAPTERS = 21;

  var ROLE_LABELS = {
    s: "Subject", "s-pp": "Subject", v: "Verb", vc: "Linking verb", aux: "Helper verb",
    o: "Object", o2: "2nd object", io: "Indirect object", p: "Complement", "p-pp": "Complement",
    adv: "Adverbial", "adv-pp": "Prep. phrase"
  };
  var CLAUSE_LABELS = {
    s: "subject clause", o: "object clause", o2: "object clause", io: "indirect-object clause",
    p: "complement clause", adv: "adverbial clause", v: "verbal clause"
  };
  var RELATIVES = ["ὅς", "ὅστις", "ὅσος", "οἷος"];

  // Roles you mark yourself in "Test me", and which tree roles count as each.
  var BRUSHES = [["s", "Subject"], ["v", "Verb"], ["o", "Object"], ["io", "Indirect object"],
    ["p", "Complement"], ["pp", "Prep. phrase"], ["adv", "Adverbial"]];
  var ROLE_GROUP = { s: "s", "s-pp": "s", v: "v", vc: "v", aux: "v", o: "o", o2: "o", io: "io",
    p: "p", "p-pp": "p", "adv-pp": "pp", adv: "adv" };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    title: $("read-title"),
    chapter: $("read-chapter"),
    prev: $("read-prev"),
    next: $("read-next"),
    modes: document.querySelectorAll("#read-modes button"),
    gloss: $("t-gloss"),
    legend: $("read-legend"),
    text: $("read-text"),
    pop: $("word-pop"),
    popWord: $("pop-word"),
    popLemma: $("pop-lemma"),
    popGloss: $("pop-gloss"),
    popParse: $("pop-parse"),
    popStatus: $("pop-status"),
    popClose: $("pop-close")
  };

  var api = null;
  var cache = {};
  var state = { chapter: 1, mode: "structure", gloss: false };
  var translations = {};
  var scores = {};
  var exercises = {};   // sentence index -> exercise in progress
  var current = null;   // the loaded chapter
  var selected = null;  // the tapped word element

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- loading ----------

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function show(chapter) {
    chapter = Math.max(1, Math.min(CHAPTERS, chapter));
    state.chapter = chapter;
    save(STATE_KEY, state);
    el.title.textContent = "John " + chapter;
    el.chapter.value = chapter;
    el.prev.disabled = chapter === 1;
    el.next.disabled = chapter === CHAPTERS;
    closePop();
    if (cache[chapter]) {
      render(cache[chapter]);
      return;
    }
    el.text.textContent = "";
    el.text.appendChild(make("p", "help", "Loading John " + chapter + "…"));
    fetch("john/" + pad(chapter) + ".json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        cache[chapter] = data;
        if (state.chapter === chapter) render(data);
      })
      .catch(function (err) {
        el.text.textContent = "";
        el.text.appendChild(make("p", "error", "Could not load John " + chapter + " (" + err.message +
          "). Chapters you have opened before work offline."));
      });
  }

  // ---------- rendering ----------

  function render(data) {
    if (current !== data) exercises = {};
    current = data;
    el.text.textContent = "";
    el.text.classList.toggle("interlinear", state.gloss);
    el.legend.hidden = state.mode !== "structure";
    data.sentences.forEach(function (sentence, index) {
      el.text.appendChild(renderSentence(sentence, index));
    });
    window.scrollTo(0, 0);
  }

  function verseRange(sentence) {
    var verses = sentence.words.filter(function (w) { return w.v; }).map(function (w) { return w.v; });
    if (!verses.length) return "";
    var first = verses[0], last = verses[verses.length - 1];
    return first === last ? first : first + "–" + last.split(":")[1];
  }

  function wordNode(word, si, wi) {
    var span = make("span", "word");
    span.dataset.s = si;
    span.dataset.w = wi;
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    var gk = make("span", "gk", word.w);
    gk.lang = "grc";
    span.appendChild(gk);
    if (state.gloss) span.appendChild(make("span", "gl", word.g === "-" ? "·" : word.g));
    return span;
  }

  function appendWord(container, word, si, wi) {
    if (word.v) {
      var verse = make("sup", "vnum", word.v.split(":")[1]);
      container.appendChild(verse);
    }
    container.appendChild(wordNode(word, si, wi));
    if (word.a) container.appendChild(make("span", "punct", word.a));
    container.appendChild(document.createTextNode(" "));
  }

  function renderSentence(sentence, si) {
    var block = make("article", "sentence");
    block.dataset.s = si;
    var head = make("div", "sentence-head");
    head.appendChild(make("span", "sentence-ref", verseRange(sentence)));
    var score = scores[translationKey(si)];
    if (score !== undefined) head.appendChild(make("span", "score-badge", "★ " + score + "%"));
    head.appendChild(make("span", "head-gap"));
    if (state.mode === "test") {
      var testBtn = make("button", "link analyze-toggle", exercises[si] ? "Stop" : "Analyze");
      testBtn.type = "button";
      testBtn.addEventListener("click", function () {
        if (exercises[si]) delete exercises[si];
        else exercises[si] = { stage: "clauses", marks: {}, paint: {}, brush: "s" };
        block.replaceWith(renderSentence(sentence, si));
      });
      head.appendChild(testBtn);
    }
    var translateBtn = make("button", "link translate-toggle", hasTranslation(si) ? "Translation ✓" : "Translate");
    translateBtn.type = "button";
    head.appendChild(translateBtn);
    block.appendChild(head);

    var greek = make("div", "greek-text");
    greek.lang = "grc";
    if (exercises[si]) {
      block.classList.add("exercising");
      renderExercise(block, greek, sentence, si);
    } else if (state.mode === "structure") {
      greek.classList.add("structured");
      renderStructure(greek, sentence, si, true);
    } else {
      sentence.words.forEach(function (word, wi) { appendWord(greek, word, si, wi); });
    }
    if (!block.contains(greek)) block.appendChild(greek);

    var panel = make("div", "translate-panel");
    panel.hidden = true;
    translateBtn.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !panel.firstChild) buildTranslatePanel(panel, sentence, si, translateBtn);
      if (!panel.hidden) panel.querySelector("textarea").focus();
    });
    block.appendChild(panel);
    return block;
  }

  // The sentence's lines: one per clause stretch, in order. A new line starts
  // whenever the clause changes (a new clause, or the main clause resuming
  // after an inserted one). Conjunctions join the line they introduce.
  function layoutLines(sentence) {
    var words = sentence.words, lines = [], line = null, pending = [];
    words.forEach(function (word, wi) {
      var next = words[wi + 1];
      if (word.r === "conj" && next && next.c !== word.c) {
        pending.push(wi);
        return;
      }
      if (!line || word.c !== line.c) {
        line = { c: word.c, items: [] };
        lines.push(line);
      }
      line.items = line.items.concat(pending, [wi]);
      pending = [];
    });
    if (pending.length) {
      if (!line) lines.push(line = { c: words[pending[0]].c, items: [] });
      line.items = line.items.concat(pending);
    }
    return lines;
  }

  // Structure: each clause on its own line, indented under the clause it belongs
  // to. With colors, the phrases inside are marked by role.
  function renderStructure(container, sentence, si, colors) {
    var words = sentence.words;
    var seenClause = {};
    layoutLines(sentence).forEach(function (spec) {
      var info = spec.c >= 0 ? sentence.clauses[spec.c] : { d: 0, r: "" };
      var line = make("div", "line");
      line.style.setProperty("--depth", info.d);
      if (spec.c >= 0 && !seenClause[spec.c]) {
        seenClause[spec.c] = true;
        var first = words.filter(function (w) { return w.c === spec.c; })[0];
        var tag = CLAUSE_LABELS[info.r] ||
          (info.d > 0 && first && RELATIVES.indexOf(first.l) !== -1 ? "relative clause" : "");
        if (tag && colors) line.appendChild(make("span", "clause-tag", tag));
      }
      var phrase = null, phraseKey = null;
      spec.items.forEach(function (wi) {
        var word = words[wi];
        var key = word.r === "conj" ? "conj" + wi : word.k !== undefined ? "k" + word.k : "r" + (word.r || "");
        if (!phrase || key !== phraseKey) {
          phrase = make("span", "phrase " + (colors ? "r-" + (word.r || "none") : "r-none"));
          var label = ROLE_LABELS[word.r];
          if (label && colors) phrase.dataset.label = label;
          // A space between phrases lets the line wrap there.
          if (line.lastChild && line.lastChild.nodeType === 1) line.appendChild(document.createTextNode(" "));
          line.appendChild(phrase);
          phraseKey = key;
        }
        appendWord(phrase, word, si, wi);
        // Keep short phrases (like "ὁ Λόγος") together; longer ones may wrap.
        var letters = Array.prototype.reduce.call(phrase.querySelectorAll(".gk"), function (n, g) { return n + g.textContent.length; }, 0);
        phrase.classList.toggle("short", letters <= 16);
      });
      container.appendChild(line);
    });
  }

  // ---------- Test me: analyze a sentence yourself ----------

  function clauseStarts(sentence) {
    return layoutLines(sentence).slice(1).map(function (line) { return line.items[0]; });
  }

  function renderExercise(block, greek, sentence, si) {
    var ex = exercises[si];
    var steps = make("p", "ex-step");
    var actions = make("div", "ex-actions");
    var feedback = make("p", "ex-feedback");
    feedback.hidden = !ex.feedback;
    feedback.textContent = ex.feedback || "";
    var button = function (label, cls, fn) {
      var b = make("button", cls, label);
      b.type = "button";
      b.addEventListener("click", function () { fn(); block.replaceWith(renderSentence(sentence, si)); });
      actions.appendChild(b);
    };

    if (ex.stage === "clauses" || ex.stage === "clauses-checked") {
      steps.textContent = "Step 1 of 2 · Tap the word that starts each new clause line: where a new clause begins, " +
        "or where the main clause picks up again after an inserted one.";
      block.appendChild(steps);
      greek.classList.add("ex-clauses");
      sentence.words.forEach(function (word, wi) { appendWord(greek, word, si, wi); });
      block.appendChild(greek);
      var correct = clauseStarts(sentence);
      Array.prototype.forEach.call(greek.querySelectorAll(".word"), function (node) {
        var wi = Number(node.dataset.w);
        if (ex.marks[wi]) node.classList.add("brk");
        if (ex.stage === "clauses-checked") {
          var right = correct.indexOf(wi) !== -1;
          if (ex.marks[wi]) node.classList.add(right ? "hit" : "extra");
          else if (right) node.classList.add("miss");
        }
      });
      if (ex.stage === "clauses") {
        button("Check", "primary", function () {
          var marked = Object.keys(ex.marks).filter(function (k) { return ex.marks[k]; }).map(Number);
          var hits = marked.filter(function (wi) { return correct.indexOf(wi) !== -1; }).length;
          var extra = marked.length - hits;
          ex.clauseScore = correct.length + extra ? Math.round(hits / (correct.length + extra) * 100) : 100;
          ex.feedback = (correct.length ? "You found " + hits + " of " + correct.length + " clause breaks" :
            "This sentence is a single clause") + (extra ? ", plus " + extra + " that aren't breaks." : ".") +
            (correct.length > hits ? " Missed ones are outlined in blue." : "");
          ex.stage = "clauses-checked";
        });
        button("Skip to phrases", "ghost", function () { ex.stage = "roles"; ex.feedback = ""; });
      } else {
        button("Next: mark the phrases", "primary", function () { ex.stage = "roles"; ex.feedback = ""; });
      }
    } else {
      steps.textContent = "Step 2 of 2 · Choose a part, then tap the words that belong to it. Tap again to clear. " +
        "Leave conjunctions unmarked.";
      block.appendChild(steps);
      if (ex.stage === "roles") {
        var palette = make("div", "palette");
        BRUSHES.forEach(function (b) {
          var chip = make("button", "brush pt-" + b[0], b[1]);
          chip.type = "button";
          chip.setAttribute("aria-pressed", String(ex.brush === b[0]));
          chip.addEventListener("click", function () {
            ex.brush = b[0];
            Array.prototype.forEach.call(palette.children, function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
          });
          palette.appendChild(chip);
        });
        block.appendChild(palette);
      }
      greek.classList.add("structured", "ex-roles");
      renderStructure(greek, sentence, si, false);
      block.appendChild(greek);
      paintWords(greek, sentence, ex);
      if (ex.stage === "roles") {
        button("Check", "primary", function () {
          var scored = 0, right = 0;
          sentence.words.forEach(function (word, wi) {
            var group = ROLE_GROUP[word.r];
            if (!group) return;
            scored += 1;
            if (ex.paint[wi] === group) right += 1;
          });
          ex.roleScore = scored ? Math.round(right / scored * 100) : 100;
          ex.feedback = right + " of " + scored + " words marked correctly (" + ex.roleScore + "%).";
          ex.stage = "roles-checked";
          var key = translationKey(si);
          var total = ex.clauseScore === undefined ? ex.roleScore : Math.round((ex.clauseScore + ex.roleScore) / 2);
          if (!(scores[key] >= total)) {
            scores[key] = total;
            save(SCORES_KEY, scores);
          }
        });
        button("Clear", "ghost", function () { ex.paint = {}; });
      } else {
        button("Show the answer", "primary", function () { ex.stage = "answer"; });
        button("Try again", "ghost", function () {
          exercises[si] = { stage: "clauses", marks: {}, paint: {}, brush: "s" };
        });
      }
      if (ex.stage === "answer") {
        var answer = make("div", "greek-text structured ex-answer");
        answer.lang = "grc";
        answer.appendChild(make("p", "ex-answer-title", "Answer"));
        renderStructure(answer, sentence, si, true);
        block.appendChild(answer);
      }
    }
    block.appendChild(feedback);
    block.appendChild(actions);
  }

  function paintWords(greek, sentence, ex) {
    Array.prototype.forEach.call(greek.querySelectorAll(".word"), function (node) {
      var wi = Number(node.dataset.w);
      var paint = ex.paint[wi];
      if (paint) node.classList.add("pt-" + paint);
      if (ex.stage !== "roles") {
        var group = ROLE_GROUP[sentence.words[wi].r];
        if (group) node.classList.add(paint === group ? "ok" : "bad");
      }
    });
  }

  function exerciseTap(block, si, wi) {
    var ex = exercises[si];
    var sentence = current.sentences[si];
    if (ex.stage === "clauses") {
      if (wi === 0) return;  // the first word always starts the sentence
      ex.marks[wi] = !ex.marks[wi];
    } else if (ex.stage === "roles") {
      ex.paint[wi] = ex.paint[wi] === ex.brush ? undefined : ex.brush;
    } else {
      return;
    }
    block.replaceWith(renderSentence(sentence, si));
  }

  // ---------- translation ----------

  function translationKey(si) { return "John " + state.chapter + "#" + si; }
  function hasTranslation(si) { return !!(translations[translationKey(si)] || "").trim(); }

  function buildTranslatePanel(panel, sentence, si, button) {
    var area = make("textarea");
    area.rows = 3;
    area.placeholder = "Write your translation of this sentence…";
    area.value = translations[translationKey(si)] || "";
    area.setAttribute("aria-label", "Your translation of " + verseRange(sentence));
    area.addEventListener("input", function () {
      translations[translationKey(si)] = area.value;
      save(TRANSLATIONS_KEY, translations);
      button.textContent = area.value.trim() ? "Translation ✓" : "Translate";
    });
    panel.appendChild(area);
    var help = make("button", "ghost word-by-word", "Show word-by-word glosses");
    help.type = "button";
    var glosses = make("p", "glosses");
    glosses.hidden = true;
    glosses.textContent = sentence.words.map(function (w) { return w.g; })
      .filter(function (g) { return g && g !== "-"; }).join(" ");
    help.addEventListener("click", function () {
      glosses.hidden = !glosses.hidden;
      help.textContent = glosses.hidden ? "Show word-by-word glosses" : "Hide word-by-word glosses";
    });
    panel.appendChild(help);
    panel.appendChild(glosses);
  }

  // ---------- word lookup ----------

  function openPop(node) {
    var word = current.sentences[Number(node.dataset.s)].words[Number(node.dataset.w)];
    if (selected) selected.classList.remove("selected");
    selected = node;
    node.classList.add("selected");
    el.popWord.textContent = word.w;
    el.popLemma.textContent = word.l;
    el.popGloss.textContent = word.g === "-" ? "(not translated)" : word.g;
    el.popParse.textContent = word.p;
    el.popStatus.textContent = word.id ? api.vocabStatus(word.id) : "Not in your vocabulary list";
    el.popStatus.className = "pop-status" + (word.id ? " in-list" : "");
    el.pop.hidden = false;
  }

  function closePop() {
    el.pop.hidden = true;
    if (selected) selected.classList.remove("selected");
    selected = null;
  }

  // ---------- setup ----------

  function setToggle(button, on) { button.setAttribute("aria-pressed", String(on)); }

  function showMode() {
    Array.prototype.forEach.call(el.modes, function (button) {
      setToggle(button, button.dataset.mode === state.mode);
    });
  }

  function bind() {
    for (var c = 1; c <= CHAPTERS; c++) {
      var option = make("option", null, "Ch. " + c);
      option.value = c;
      el.chapter.appendChild(option);
    }
    el.chapter.addEventListener("change", function () { show(Number(el.chapter.value)); });
    el.prev.addEventListener("click", function () { show(state.chapter - 1); });
    el.next.addEventListener("click", function () { show(state.chapter + 1); });
    Array.prototype.forEach.call(el.modes, function (button) {
      button.addEventListener("click", function () {
        state.mode = button.dataset.mode;
        showMode();
        save(STATE_KEY, state);
        if (current) render(current);
      });
    });
    el.gloss.addEventListener("click", function () {
      state.gloss = !state.gloss;
      setToggle(el.gloss, state.gloss);
      save(STATE_KEY, state);
      if (current) render(current);
    });
    // Tapping a word looks it up, except while analyzing a sentence, where it marks it.
    var tapWord = function (node) {
      var block = node.closest(".sentence");
      if (block && block.classList.contains("exercising")) {
        exerciseTap(block, Number(block.dataset.s), Number(node.dataset.w));
      } else {
        openPop(node);
      }
    };
    el.text.addEventListener("click", function (e) {
      var node = e.target.closest(".word");
      if (node) tapWord(node);
    });
    el.text.addEventListener("keydown", function (e) {
      var node = e.target.closest && e.target.closest(".word");
      if (node && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        tapWord(node);
      }
    });
    el.popClose.addEventListener("click", closePop);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !el.pop.hidden) closePop();
    });
  }

  window.Reader = {
    open: function (app) {
      if (!api) {
        api = app;
        var saved = load(STATE_KEY) || {};
        Object.keys(state).forEach(function (k) { if (k in saved) state[k] = saved[k]; });
        if (saved.structure === false && !saved.mode) state.mode = "plain";  // older saved setting
        translations = load(TRANSLATIONS_KEY) || {};
        scores = load(SCORES_KEY) || {};
        bind();
        showMode();
        setToggle(el.gloss, state.gloss);
      }
      show(state.chapter);
    },
    close: closePop
  };
})();
