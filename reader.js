// Reader: the Gospel of John, sentence by sentence, with word lookup, an optional
// interlinear gloss, sentence structure (clauses and phrases) and a place to write
// your own translation. Data: john/NN.json, built by tools/build_john.py.
(function () {
  "use strict";

  var STATE_KEY = "greekFlashcards.reader";
  var TRANSLATIONS_KEY = "greekFlashcards.translations";
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

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    title: $("read-title"),
    chapter: $("read-chapter"),
    prev: $("read-prev"),
    next: $("read-next"),
    structure: $("t-structure"),
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
  var state = { chapter: 1, structure: true, gloss: false };
  var translations = {};
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
    current = data;
    el.text.textContent = "";
    el.text.classList.toggle("structured", state.structure);
    el.text.classList.toggle("interlinear", state.gloss);
    el.legend.hidden = !state.structure;
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
    var head = make("div", "sentence-head");
    head.appendChild(make("span", "sentence-ref", verseRange(sentence)));
    var translateBtn = make("button", "link translate-toggle", hasTranslation(si) ? "Your translation ✓" : "Translate");
    translateBtn.type = "button";
    head.appendChild(translateBtn);
    block.appendChild(head);

    var greek = make("div", "greek-text");
    greek.lang = "grc";
    if (state.structure) renderStructure(greek, sentence, si);
    else sentence.words.forEach(function (word, wi) { appendWord(greek, word, si, wi); });
    block.appendChild(greek);

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

  // Structure: each clause on its own line, indented under the clause it belongs
  // to, with the phrases inside it marked by role. Conjunctions start the line
  // they introduce.
  function renderStructure(container, sentence, si) {
    var words = sentence.words;
    var line = null, phrase = null, lineClause = null, phraseKey = null;
    var seenClause = {};
    var pendingConj = [];

    function newLine(clause) {
      var info = clause >= 0 ? sentence.clauses[clause] : { d: 0, r: "" };
      line = make("div", "line");
      line.style.setProperty("--depth", info.d);
      if (clause >= 0 && !seenClause[clause]) {
        seenClause[clause] = true;
        var first = words.filter(function (w) { return w.c === clause; })[0];
        var label = CLAUSE_LABELS[info.r] ||
          (info.d > 0 && first && RELATIVES.indexOf(first.l) !== -1 ? "relative clause" : "");
        if (label) line.appendChild(make("span", "clause-tag", label));
      }
      container.appendChild(line);
      lineClause = clause;
      phrase = null;
      phraseKey = null;
    }

    words.forEach(function (word, wi) {
      var next = words[wi + 1];
      if (word.r === "conj" && next && next.c !== word.c) {
        pendingConj.push(wi);
        return;
      }
      if (line === null || word.c !== lineClause) newLine(word.c);
      pendingConj.forEach(function (ci) {
        var conj = make("span", "phrase r-conj");
        appendWord(conj, words[ci], si, ci);
        line.appendChild(conj);
        line.appendChild(document.createTextNode(" "));
      });
      if (pendingConj.length) phrase = null;
      pendingConj = [];
      var key = word.k !== undefined ? "k" + word.k : "r" + (word.r || "");
      if (!phrase || key !== phraseKey) {
        phrase = make("span", "phrase r-" + (word.r || "none"));
        var label = ROLE_LABELS[word.r];
        if (label) phrase.dataset.label = label;
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
    // A conjunction at the very end has no following line to join.
    pendingConj.forEach(function (ci) {
      if (!line) newLine(words[ci].c);
      var conj = make("span", "phrase r-conj");
      appendWord(conj, words[ci], si, ci);
      line.appendChild(conj);
    });
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
      button.textContent = area.value.trim() ? "Your translation ✓" : "Translate";
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

  function bind() {
    for (var c = 1; c <= CHAPTERS; c++) {
      var option = make("option", null, "Ch. " + c);
      option.value = c;
      el.chapter.appendChild(option);
    }
    el.chapter.addEventListener("change", function () { show(Number(el.chapter.value)); });
    el.prev.addEventListener("click", function () { show(state.chapter - 1); });
    el.next.addEventListener("click", function () { show(state.chapter + 1); });
    el.structure.addEventListener("click", function () {
      state.structure = !state.structure;
      setToggle(el.structure, state.structure);
      save(STATE_KEY, state);
      if (current) render(current);
    });
    el.gloss.addEventListener("click", function () {
      state.gloss = !state.gloss;
      setToggle(el.gloss, state.gloss);
      save(STATE_KEY, state);
      if (current) render(current);
    });
    el.text.addEventListener("click", function (e) {
      var node = e.target.closest(".word");
      if (node) openPop(node);
    });
    el.text.addEventListener("keydown", function (e) {
      var node = e.target.closest && e.target.closest(".word");
      if (node && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openPop(node);
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
        translations = load(TRANSLATIONS_KEY) || {};
        bind();
        setToggle(el.structure, state.structure);
        setToggle(el.gloss, state.gloss);
      }
      show(state.chapter);
    },
    close: closePop
  };
})();
