(() => {
  const $ = (id) => document.getElementById(id);
  const stateKey = "macmillan_darts_tracker_pwa_v2";
  const now = () => Date.now();

  const defaultState = {
    target: 100000,
    hours: 12,
    total: 0,
    history: [], // {t, delta, after}
    timer: {
      durationMs: 12 * 60 * 60 * 1000,
      running: false,
      startedAt: null,   // timestamp when last started/resumed
      elapsedMs: 0       // accumulated elapsed time while paused
    }
  };

  function load() {
    try {
      const raw = localStorage.getItem(stateKey);
      if (!raw) return structuredClone(defaultState);
      const s = JSON.parse(raw);

      // Merge with defaults so upgrades don’t break old stored state
      return {
        ...structuredClone(defaultState),
        ...s,
        timer: { ...structuredClone(defaultState.timer), ...(s.timer || {}) }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function save(s) {
    localStorage.setItem(stateKey, JSON.stringify(s));
  }

  function fmt(n) {
    const x = Math.max(0, Math.floor(Number(n) || 0));
    return x.toLocaleString("en-GB");
  }

  function clampInt(n, min = 0, max = Number.MAX_SAFE_INTEGER) {
    n = Math.floor(Number(n) || 0);
    if (!Number.isFinite(n)) n = min;
    return Math.min(max, Math.max(min, n));
  }

  function setStatus(text, kind = "") {
    const el = $("statusPill");
    el.textContent = text;
    el.style.color = "var(--muted)";
    if (kind === "ok") el.style.color = "var(--good)";
    if (kind === "done") el.style.color = "var(--warn)";
  }

  function computeElapsedMs(t) {
    const base = t.elapsedMs || 0;
    if (t.running && t.startedAt) return base + (now() - t.startedAt);
    return base;
  }

  function renderTimer(s) {
    const t = s.timer;

    const elapsed = computeElapsedMs(t);
    const duration = t.durationMs || 0;
    const msLeft = Math.max(0, duration - elapsed);

    const hh = Math.floor(msLeft / 3600000);
    const mm = Math.floor((msLeft % 3600000) / 60000);
    const ss = Math.floor((msLeft % 60000) / 1000);

    $("timeLeft").textContent =
      `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

    if (!t.running) {
      if ((t.elapsedMs || 0) === 0) $("endsAt").textContent = "Timer not started";
      else $("endsAt").textContent = "Paused";
      return;
    }

    const ends = new Date(now() + msLeft).toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
    $("endsAt").textContent = `Ends: ${ends}`;
  }

  function render() {
    const s = load();

    $("targetInput").value = s.target;
    $("hoursInput").value = s.hours;

    $("total").textContent = fmt(s.total);

    const remaining = Math.max(0, s.target - s.total);
    $("remaining").textContent = fmt(remaining);
    $("targetLabel").textContent = `Target: ${fmt(s.target)}`;

    const pct = s.target > 0 ? (s.total / s.target) * 100 : 0;
    $("pct").textContent = `${Math.min(100, pct).toFixed(1)}%`;
    $("bar").style.width = `${Math.min(100, Math.max(0, pct))}%`;

    if (s.total >= s.target) setStatus("Target smashed ✅", "done");
    else setStatus("Tracking…", "ok");

    // Recent entries
    const hist = s.history.slice().reverse();
    const box = $("history");
    box.innerHTML = "";

    if (hist.length === 0) {
      box.innerHTML = `<div class="histItem"><div class="sub">No entries yet.</div></div>`;
    } else {
      for (const item of hist.slice(0, 20)) {
        const d = item.delta;
        const sign = d >= 0 ? "+" : "−";
        const abs = Math.abs(d);
        const time = new Date(item.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        const div = document.createElement("div");
        div.className = "histItem";
        div.innerHTML = `
          <div>
            <div class="mono"><b>${sign}${fmt(abs)}</b> <span class="sub">(${time})</span></div>
            <div class="sub">Total after: ${fmt(item.after)}</div>
          </div>
        `;
        box.appendChild(div);
      }
    }

    renderTimer(s);
  }

  function applySettings() {
    const s = load();
    s.target = clampInt($("targetInput").value, 1);
    s.hours = clampInt($("hoursInput").value, 1, 72);

    // Only update duration when NOT running, so you can’t accidentally change it mid-session
    if (!s.timer.running) {
      s.timer.durationMs = s.hours * 60 * 60 * 1000;
      // If timer hasn’t started (elapsedMs=0), reflect new duration immediately
      if ((s.timer.elapsedMs || 0) === 0) {
        // nothing else needed
      }
    }

    save(s);
    render();
  }

  function addDelta(delta) {
    const s = load();
    delta = Math.floor(Number(delta) || 0);
    if (!delta) return;

    const before = s.total;
    const after = Math.max(0, before + delta);
    const actualDelta = after - before;

    s.total = after;
    s.history.push({ t: now(), delta: actualDelta, after });

    // keep history bounded
    if (s.history.length > 1200) s.history = s.history.slice(-1200);

    save(s);
    render();
  }

  function undo() {
    const s = load();
    if (!s.history.length) return;
    s.history.pop();
    s.total = s.history.length ? s.history[s.history.length - 1].after : 0;
    save(s);
    render();
  }

  function resetScore() {
    const s = load();
    s.total = 0;
    s.history = [];
    save(s);
    render();
  }

  function wipeAll() {
    localStorage.removeItem(stateKey);
    render();
  }

  function startTimer() {
    const s = load();
    if (s.timer.running) return;

    // Ensure duration matches hours (safe if user changed it)
    s.timer.durationMs = (s.hours || 12) * 60 * 60 * 1000;

    s.timer.startedAt = now();
    s.timer.running = true;

    save(s);
    render();
  }

  function stopTimer() {
    const s = load();
    if (!s.timer.running) return;

    const sinceStart = s.timer.startedAt ? (now() - s.timer.startedAt) : 0;
    s.timer.elapsedMs = (s.timer.elapsedMs || 0) + sinceStart;

    s.timer.startedAt = null;
    s.timer.running = false;

    save(s);
    render();
  }

  function resetTimer() {
    const s = load();
    s.timer.startedAt = null;
    s.timer.running = false;
    s.timer.elapsedMs = 0;
    // Keep duration consistent with Hours
    s.timer.durationMs = (s.hours || 12) * 60 * 60 * 1000;

    save(s);
    render();
  }

  // Wire up UI events
  $("addBtn").addEventListener("click", () => {
    applySettings();
    const v = clampInt($("scoreInput").value, 0, 1000);
    if (!v) return;
    addDelta(v);
    $("scoreInput").value = "";
  });

  $("subBtn").addEventListener("click", () => {
    applySettings();
    const v = clampInt($("scoreInput").value, 0, 1000);
    if (!v) return;
    addDelta(-v);
    $("scoreInput").value = "";
  });

  $("undoBtn").addEventListener("click", undo);

  $("resetBtn").addEventListener("click", () => {
    if (confirm("Reset total points & history back to zero?")) resetScore();
  });

  $("wipeBtn").addEventListener("click", () => {
    if (confirm("Wipe everything (score, timer, settings) on this device?")) wipeAll();
  });

  $("targetInput").addEventListener("change", applySettings);
  $("hoursInput").addEventListener("change", applySettings);

  $("startBtn").addEventListener("click", startTimer);
  $("stopBtn").addEventListener("click", stopTimer);

  $("resetTimerBtn").addEventListener("click", () => {
    if (confirm("Reset the timer back to full length?")) resetTimer();
  });

  // Quick add buttons
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => addDelta(clampInt(btn.getAttribute("data-add"), 0, 1000)));
  });

  // Update timer display frequently
  setInterval(() => renderTimer(load()), 250);

  render();
})();