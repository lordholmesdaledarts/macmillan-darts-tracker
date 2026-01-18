(() => {
  const $ = (id) => document.getElementById(id);

  const stateKey = "macmillan_darts_tracker_pwa_v4";
  const uiKey = "macmillan_ui_bigmode";
  const celebrateKey = "macmillan_target_completed";
  const now = () => Date.now();

  const defaultState = {
    target: 100000,
    hours: 12,
    total: 0,
    history: [],
    timer: { durationMs: 12 * 60 * 60 * 1000, running: false, startedAt: null, elapsedMs: 0 }
  };

  function load() {
    try {
      const raw = localStorage.getItem(stateKey);
      if (!raw) return structuredClone(defaultState);
      const s = JSON.parse(raw);
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
    return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-GB");
  }

  function clampInt(n, min = 0, max = Number.MAX_SAFE_INTEGER) {
    n = Math.floor(Number(n) || 0);
    if (!Number.isFinite(n)) n = min;
    return Math.min(max, Math.max(min, n));
  }

  // ----- Big screen toggle -----
  function getBigMode() {
    return localStorage.getItem(uiKey) === "1";
  }

  function setBigMode(on) {
    localStorage.setItem(uiKey, on ? "1" : "0");
    document.body.classList.toggle("big", on);
    const btn = $("bigModeBtn");
    if (btn) btn.textContent = on ? "Big screen: On" : "Big screen: Off";
  }

  // ----- Celebration overlay -----
  function showCelebrate() {
    const el = $("celebrateOverlay");
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    localStorage.setItem(celebrateKey, "1");
  }

  function hideCelebrate() {
    const el = $("celebrateOverlay");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  }

  function computeElapsedMs(t) {
    const base = t.elapsedMs || 0;
    if (t.running && t.startedAt) return base + (now() - t.startedAt);
    return base;
  }

  function renderTimer(s) {
    const t = s.timer;
    const elapsed = computeElapsedMs(t);
    const msLeft = Math.max(0, (t.durationMs || 0) - elapsed);

    const hh = Math.floor(msLeft / 3600000);
    const mm = Math.floor((msLeft % 3600000) / 60000);
    const ss = Math.floor((msLeft % 60000) / 1000);

    const timeLeftEl = $("timeLeft");
    if (timeLeftEl) {
      timeLeftEl.textContent =
        `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    const endsAtEl = $("endsAt");
    if (!endsAtEl) return;

    if (!t.running) {
      endsAtEl.textContent = (t.elapsedMs || 0) === 0 ? "Timer not started" : "Paused";
      return;
    }

    const ends = new Date(now() + msLeft).toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
    endsAtEl.textContent = `Ends: ${ends}`;
  }

  function render() {
    const s = load();

    $("targetInput") && ($("targetInput").value = s.target);
    $("hoursInput") && ($("hoursInput").value = s.hours);

    const remaining = Math.max(0, s.target - s.total);

    $("total") && ($("total").textContent = fmt(s.total));
    $("remaining") && ($("remaining").textContent = fmt(remaining));
    $("targetLabel") && ($("targetLabel").textContent = `Target: ${fmt(s.target)}`);

    const pct = s.target > 0 ? (s.total / s.target) * 100 : 0;
    $("pct") && ($("pct").textContent = `${Math.min(100, pct).toFixed(1)}%`);
    $("bar") && ($("bar").style.width = `${Math.min(100, Math.max(0, pct))}%`);

    const box = $("history");
    if (box) {
      const hist = s.history.slice().reverse();
      box.innerHTML = "";

      if (!hist.length) {
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
    }

    renderTimer(s);

    // Show celebration only once per completion
    if (remaining === 0 && localStorage.getItem(celebrateKey) !== "1") {
      showCelebrate();
    }

    // If score goes back above 0 (e.g., subtract/undo), allow celebration again later
    if (remaining > 0 && localStorage.getItem(celebrateKey) === "1") {
      localStorage.removeItem(celebrateKey);
      hideCelebrate();
    }
  }

  function applySettings() {
    const s = load();
    s.target = clampInt($("targetInput")?.value, 1);
    s.hours = clampInt($("hoursInput")?.value, 1, 72);
    if (!s.timer.running) s.timer.durationMs = (s.hours || 12) * 60 * 60 * 1000;
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
    if (s.history.length > 1200) s.history = s.history.slice(-1200);

    save(s);
    render();
  }

  function undo() {
    const s = load();
    if (!s.history.length) return;

    // Confirm to prevent accidental tap
    const ok = confirm("Undo the last entry?");
    if (!ok) return;

    s.history.pop();
    s.total = s.history.length ? s.history[s.history.length - 1].after : 0;
    save(s);
    render();
  }

  function resetScore() {
    const s = load();
    s.total = 0;
    s.history = [];
    localStorage.removeItem(celebrateKey);
    hideCelebrate();
    save(s);
    render();
  }

  function wipeAll() {
    localStorage.removeItem(stateKey);
    localStorage.removeItem(uiKey);
    localStorage.removeItem(celebrateKey);
    hideCelebrate();
    setBigMode(false);
    render();
  }

  function startTimer() {
    const s = load();
    if (s.timer.running) return;
    s.timer.durationMs = (s.hours || 12) * 60 * 60 * 1000;
    s.timer.startedAt = now();
    s.timer.running = true;
    save(s);
    render();
  }

  function stopTimer() {
    const s = load();
    if (!s.timer.running) return;
    const since = s.timer.startedAt ? (now() - s.timer.startedAt) : 0;
    s.timer.elapsedMs = (s.timer.elapsedMs || 0) + since;
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
    s.timer.durationMs = (s.hours || 12) * 60 * 60 * 1000;
    save(s);
    render();
  }

  function readScoreInput() {
    const input = $("scoreInput");
    if (!input) return 0;
    const raw = String(input.value ?? "").trim();
    const cleaned = raw.replace(/,/g, "");
    return clampInt(cleaned, 0, 1000000);
  }

  function clearAndCloseKeyboard() {
    const input = $("scoreInput");
    if (!input) return;
    input.value = "";
    input.blur();
  }

  // Events
  $("bigModeBtn")?.addEventListener("click", () => setBigMode(!getBigMode()));

  $("addBtn")?.addEventListener("click", () => {
    applySettings();
    const v = readScoreInput();
    if (!v) return;
    addDelta(v);
    clearAndCloseKeyboard();
  });

  $("subBtn")?.addEventListener("click", () => {
    applySettings();
    const v = readScoreInput();
    if (!v) return;
    addDelta(-v);
    clearAndCloseKeyboard();
  });

  $("undoBtn")?.addEventListener("click", undo);

  $("resetBtn")?.addEventListener("click", () => {
    if (confirm("Reset score back to zero?")) resetScore();
  });

  $("wipeBtn")?.addEventListener("click", () => {
    if (confirm("Wipe everything on this device?")) wipeAll();
  });

  $("targetInput")?.addEventListener("change", applySettings);
  $("hoursInput")?.addEventListener("change", applySettings);

  $("startBtn")?.addEventListener("click", startTimer);
  $("stopBtn")?.addEventListener("click", stopTimer);
  $("resetTimerBtn")?.addEventListener("click", () => {
    if (confirm("Reset the timer back to full length?")) resetTimer();
  });

  // Quick add buttons
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addDelta(clampInt(btn.getAttribute("data-add"), 0, 10000));
      $("scoreInput")?.blur();
    });
  });

  // Celebration overlay buttons
  $("closeCelebrate")?.addEventListener("click", hideCelebrate);

  $("resetCelebrate")?.addEventListener("click", () => {
    if (confirm("Reset score back to zero?")) {
      resetScore();
    }
  });

  // Apply big mode on load
  setBigMode(getBigMode());

  setInterval(() => renderTimer(load()), 250);
  render();
})();