(function () {
  const KIND = ["coin", "gap", "light", "pipe", "box"];
  const KIND_KEY = ["dailyCoin", "dailyGap", "dailyLight", "dailyPipe", "dailyBox"];
  const PIECE_SRC = [
    "./assets/coin.png?v=4",
    "./assets/piece-gap.png?v=1",
    "./assets/piece-light.png?v=1",
    "./assets/piece-pipe.png?v=1",
    "./assets/catbox.png?v=3",
  ];
  const ROWS = 6;
  const COLS = 5;
  const TIME_MS = 60000;
  const STORE = "catbox-daily-v1";
  const BJ = 8 * 3600;
  const MARK = { hit: "hit", near: "near", miss: "miss" };

  let state = null;
  let tick = 0;
  let revealing = false;

  function tt(key, vars) {
    if (typeof t === "function") return t(key, vars || {});
    return key;
  }

  function singaporeDay(now) {
    return Math.floor(((now || Date.now()) / 1000 + BJ) / 86400);
  }

  function dateLabel(day) {
    const d = new Date(day * 86400 * 1000);
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${m}-${dd}`;
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function solutionForDay(day) {
    let h = hash32("CATBOX.DAILY.V1:" + day);
    const tiles = [];
    for (let i = 0; i < COLS; i++) {
      tiles.push(h % KIND.length);
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    }
    if (tiles.every((x) => x === tiles[0])) {
      tiles[COLS - 1] = (tiles[0] + 2) % KIND.length;
    }
    return tiles;
  }

  function scoreGuess(guess, answer) {
    const marks = Array(COLS).fill(MARK.miss);
    const remain = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) marks[i] = MARK.hit;
      else remain[answer[i]] = (remain[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (marks[i] === MARK.hit) continue;
      const g = guess[i];
      if (remain[g] > 0) {
        marks[i] = MARK.near;
        remain[g]--;
      }
    }
    return marks;
  }

  function blankState(day, prev) {
    let streak = Number(prev?.streak) || 0;
    const lastWin = Number(prev?.lastWinDay) || 0;
    if (lastWin < day - 1) streak = 0;
    return {
      v: 1,
      day,
      guesses: [],
      draft: [],
      timed: false,
      startedAt: 0,
      elapsedMs: 0,
      won: false,
      over: false,
      timedOut: false,
      streak,
      lastWinDay: lastWin,
    };
  }

  function load() {
    const day = singaporeDay();
    let prev = null;
    try {
      prev = JSON.parse(localStorage.getItem(STORE) || "null");
    } catch (_) {
      prev = null;
    }
    if (!prev || prev.v !== 1) return blankState(day, null);
    if (prev.day !== day) return blankState(day, prev);
    prev.draft = Array.isArray(prev.draft) ? prev.draft.slice(0, COLS) : [];
    prev.guesses = Array.isArray(prev.guesses) ? prev.guesses : [];
    return prev;
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (_) {}
  }

  function icoHtml(kind) {
    const src = PIECE_SRC[kind];
    if (!src) return "";
    const extra = kind === 4 ? " dy-ico-box" : "";
    return `<img class="dy-ico${extra}" src="${src}" alt="">`;
  }

  function keyMarks() {
    const best = Array(KIND.length).fill("");
    const rank = { "": 0, miss: 1, near: 2, hit: 3 };
    const answer = solutionForDay(state.day);
    state.guesses.forEach((g) => {
      const marks = scoreGuess(g, answer);
      g.forEach((k, i) => {
        if (rank[marks[i]] > rank[best[k]]) best[k] = marks[i];
      });
    });
    return best;
  }

  function elapsedNow() {
    if (!state.timed || !state.startedAt) return state.elapsedMs || 0;
    if (state.over) return state.elapsedMs || 0;
    return Date.now() - state.startedAt;
  }

  function fmtClock(ms, remain) {
    const n = remain ? Math.max(0, TIME_MS - ms) : ms;
    const s = Math.floor(n / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function speedBadge() {
    if (!state.timed || !state.won) return false;
    const ms = state.elapsedMs || elapsedNow();
    return ms > 0 && ms <= TIME_MS;
  }

  function shareText() {
    const answer = solutionForDay(state.day);
    const lines = state.guesses.map((g) =>
      scoreGuess(g, answer)
        .map((m) => (m === MARK.hit ? "🟨" : m === MARK.near ? "⬜" : "⬛"))
        .join(""),
    );
    const n = state.won ? `${state.guesses.length}/${ROWS}` : "X/6";
    let head = `CATBOX DAILY · ${dateLabel(state.day)} · ${n}`;
    if (speedBadge()) head += ` · ⏱ ${fmtClock(state.elapsedMs, false)}`;
    return [head, "", ...lines].join("\n");
  }

  function toast(msg) {
    if (typeof showToast === "function") showToast(msg);
  }

  function paintShareCard() {
    const box = document.getElementById("dyShareBox");
    const grid = document.getElementById("dyCardGrid");
    const meta = document.getElementById("dyCardMeta");
    const foot = document.getElementById("dyCardFoot");
    if (!box || !grid) return;
    if (!state.over) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    const answer = solutionForDay(state.day);
    const n = state.won ? `${state.guesses.length}/${ROWS}` : "X/6";
    if (meta) meta.textContent = `${dateLabel(state.day)} · ${n}`;
    grid.innerHTML = state.guesses
      .map((g) => {
        const marks = scoreGuess(g, answer);
        return `<div class="daily-card-row">${marks
          .map((m) => `<i class="daily-sq ${m}"></i>`)
          .join("")}</div>`;
      })
      .join("");
    if (foot) {
      const bits = [];
      if (state.streak) bits.push(tt("dailyStreak", { n: state.streak }));
      if (speedBadge()) bits.push(`⏱ ${fmtClock(state.elapsedMs, false)}`);
      foot.textContent = bits.join(" · ");
    }
  }

  function paintBoard(revealRow) {
    const board = document.getElementById("dyBoard");
    if (!board) return;
    const answer = solutionForDay(state.day);
    let html = "";
    for (let r = 0; r < ROWS; r++) {
      const guess = state.guesses[r];
      const isCurrent = !state.over && r === state.guesses.length;
      if (state.over && !guess) continue;
      const draft = isCurrent ? state.draft : [];
      const marks = guess ? scoreGuess(guess, answer) : null;
      html += `<div class="dy-row" data-row="${r}">`;
      for (let c = 0; c < COLS; c++) {
        const kind = guess ? guess[c] : draft[c];
        const filled = kind !== undefined && kind !== null;
        const mark = marks ? marks[c] : "";
        const popping = revealRow === r ? " pop" : "";
        html += `<div class="dy-cell${filled ? " has" : ""}${mark ? " mark-" + mark : ""}${popping}" style="${popping ? `animation-delay:${c * 90}ms` : ""}">`;
        if (filled) html += icoHtml(kind);
        html += "</div>";
      }
      html += "</div>";
    }
    board.innerHTML = html;
  }

  function paintKeys() {
    const wrap = document.getElementById("dyKeys");
    if (!wrap) return;
    const marks = keyMarks();
    wrap.innerHTML = KIND.map(
      (name, i) =>
        `<button type="button" class="dy-key${marks[i] ? " mark-" + marks[i] : ""}" data-kind="${i}" aria-label="${tt(KIND_KEY[i])}">${icoHtml(i)}<span>${tt(KIND_KEY[i])}</span></button>`,
    ).join("");
  }

  function paintMeta() {
    const date = document.getElementById("dyDate");
    const streak = document.getElementById("dyStreak");
    const timer = document.getElementById("dyTimer");
    const status = document.getElementById("dyStatus");
    const enter = document.getElementById("dyEnter");
    const del = document.getElementById("dyDel");
    const freeBtn = document.getElementById("dyModeFree");
    const timedBtn = document.getElementById("dyModeTimed");
    const locked = state.over || state.guesses.length > 0 || state.draft.length > 0 || state.startedAt;
    if (date) date.textContent = dateLabel(state.day);
    if (streak) streak.textContent = tt("dailyStreak", { n: state.streak || 0 });
    if (freeBtn) {
      freeBtn.textContent = tt("dailyUntimed");
      freeBtn.classList.toggle("on", !state.timed);
      freeBtn.disabled = locked;
    }
    if (timedBtn) {
      timedBtn.textContent = tt("dailyTimed");
      timedBtn.classList.toggle("on", state.timed);
      timedBtn.disabled = locked;
    }
    if (enter) enter.textContent = tt("dailyEnter");
    if (del) del.textContent = tt("dailyDel");
    const share = document.getElementById("dyShare");
    if (share) share.textContent = tt("dailyShare");
    const root = document.getElementById("dyRoot");
    if (root) root.classList.toggle("is-over", Boolean(state.over));
    const next = document.getElementById("dyNext");
    const toTrack = document.getElementById("dyToTrack");
    if (next) {
      next.textContent = tt("dailyNext");
      next.classList.toggle("hidden", !state.over);
    }
    if (toTrack) {
      toTrack.textContent = tt("dailyToTrack");
      toTrack.classList.toggle("hidden", !state.over);
    }
    if (timer) {
      if (state.timed && (state.startedAt || state.over)) {
        timer.classList.remove("hidden");
        const ms = elapsedNow();
        timer.textContent = state.over ? fmtClock(state.elapsedMs || ms, false) : fmtClock(ms, true);
        timer.classList.toggle("out", !state.over && ms >= TIME_MS);
      } else {
        timer.classList.add("hidden");
      }
    }
    if (status) {
      if (state.over && state.won) status.textContent = tt("dailyWin", { n: state.guesses.length });
      else if (state.over) status.textContent = tt("dailyLose");
      else if (state.timed && state.timedOut && !state.over) status.textContent = tt("dailyTimeUp");
      else status.textContent = tt("dailyTries", { n: ROWS - state.guesses.length });
    }
  }

  function paint() {
    if (!state) return;
    paintBoard();
    paintKeys();
    paintMeta();
    paintShareCard();
  }

  function startClock() {
    if (!state.timed || state.startedAt || state.over) return;
    state.startedAt = Date.now();
    save();
  }

  function checkTimeout() {
    if (!state.timed || state.over || !state.startedAt) return;
    if (elapsedNow() >= TIME_MS && !state.timedOut) {
      state.timedOut = true;
      save();
      paintMeta();
    }
  }

  function finish(won) {
    state.over = true;
    state.won = !!won;
    state.elapsedMs = elapsedNow();
    if (won) {
      if (state.lastWinDay === state.day - 1) state.streak = (state.streak || 0) + 1;
      else state.streak = 1;
      state.lastWinDay = state.day;
    } else {
      state.streak = 0;
    }
    save();
  }

  function submit() {
    if (revealing || state.over) return;
    if (state.draft.length !== COLS) {
      const row = document.querySelector(`#dyBoard .dy-row[data-row="${state.guesses.length}"]`);
      if (row) {
        row.classList.remove("shake");
        void row.offsetWidth;
        row.classList.add("shake");
      }
      return;
    }
    startClock();
    const guess = state.draft.slice();
    state.draft = [];
    state.guesses.push(guess);
    revealing = true;
    save();
    paintBoard(state.guesses.length - 1);
    paintKeys();
    const won = scoreGuess(guess, solutionForDay(state.day)).every((m) => m === MARK.hit);
    window.setTimeout(() => {
      revealing = false;
      if (won) finish(true);
      else if (state.guesses.length >= ROWS) finish(false);
      else save();
      paint();
    }, COLS * 90 + 280);
  }

  function tapKind(i) {
    if (revealing || state.over) return;
    if (state.draft.length >= COLS) return;
    startClock();
    state.draft.push(i);
    save();
    paintBoard();
    paintMeta();
  }

  function del() {
    if (revealing || state.over) return;
    if (!state.draft.length) return;
    state.draft.pop();
    save();
    paintBoard();
  }

  async function share() {
    if (!state.over) return;
    const text = shareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(tt("dailyCopied"));
    } catch (_) {
      toast(text);
    }
  }

  function onClick(e) {
    const key = e.target.closest("[data-kind]");
    if (key && key.closest("#dyKeys")) {
      tapKind(Number(key.dataset.kind));
      return;
    }
    if (e.target.closest("#dyEnter")) {
      submit();
      return;
    }
    if (e.target.closest("#dyDel")) {
      del();
      return;
    }
    if (e.target.closest("#dyShare")) {
      share();
      return;
    }
    if (e.target.closest("#dyToTrack")) {
      document.getElementById("lanePaid")?.click();
      return;
    }
    if (e.target.closest("#dyModeFree") && !state.over && !state.guesses.length && !state.draft.length) {
      state.timed = false;
      state.startedAt = 0;
      state.timedOut = false;
      save();
      paintMeta();
      return;
    }
    if (e.target.closest("#dyModeTimed") && !state.over && !state.guesses.length && !state.draft.length) {
      state.timed = true;
      save();
      paintMeta();
    }
  }

  function onKey(e) {
    const root = document.getElementById("dyRoot");
    if (!root || root.classList.contains("hidden")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      del();
    } else if (/^[1-5]$/.test(e.key)) {
      tapKind(Number(e.key) - 1);
    }
  }

  function bind() {
    const root = document.getElementById("dyRoot");
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";
    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
  }

  function refreshDaily() {
    state = load();
    bind();
    paint();
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      if (!state || !state.timed || state.over) return;
      checkTimeout();
      paintMeta();
    }, 250);
  }

  function refreshDailyCopy() {
    if (!state) return;
    paintKeys();
    paintMeta();
    paintShareCard();
  }

  window.refreshDaily = refreshDaily;
  window.refreshDailyCopy = refreshDailyCopy;
})();
