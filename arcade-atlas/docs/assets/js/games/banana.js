/* ============================================================
   Banana Catchers — arcade catcher. Shared gamekit powers the
   loop, input, audio, screens and profile saves.
   ============================================================ */
(function () {
  "use strict";
  var U = GK.util;

  /* ---------- content: 12 harvest levels ---------- */
  var LEVELS = [
    { goal: 10, dur: 55, spawn: 1.05, speed: 150, coconut: 0,    bee: 0,    gust: 0,   palette: 0 },
    { goal: 12, dur: 55, spawn: 0.95, speed: 165, coconut: 0.05, bee: 0,    gust: 0,   palette: 0 },
    { goal: 14, dur: 55, spawn: 0.9,  speed: 175, coconut: 0.09, bee: 0,    gust: 0,   palette: 1 },
    { goal: 15, dur: 55, spawn: 0.85, speed: 190, coconut: 0.12, bee: 0.15, gust: 0,   palette: 1 },
    { goal: 16, dur: 55, spawn: 0.8,  speed: 205, coconut: 0.15, bee: 0.2,  gust: 0.2, palette: 2 },
    { goal: 18, dur: 55, spawn: 0.75, speed: 215, coconut: 0.16, bee: 0.22, gust: 0.3, palette: 2 },
    { goal: 18, dur: 55, spawn: 0.7,  speed: 235, coconut: 0.2,  bee: 0.25, gust: 0.35, palette: 3 },
    { goal: 20, dur: 55, spawn: 0.68, speed: 250, coconut: 0.22, bee: 0.28, gust: 0.4, palette: 3 },
    { goal: 20, dur: 55, spawn: 0.62, speed: 265, coconut: 0.24, bee: 0.3,  gust: 0.45, palette: 4 },
    { goal: 22, dur: 55, spawn: 0.58, speed: 285, coconut: 0.26, bee: 0.32, gust: 0.5, palette: 4 },
    { goal: 22, dur: 55, spawn: 0.54, speed: 300, coconut: 0.28, bee: 0.35, gust: 0.55, palette: 5 },
    { goal: 26, dur: 60, spawn: 0.5,  speed: 320, coconut: 0.3,  bee: 0.4,  gust: 0.6, palette: 5 }
  ];
  var PALETTES = [
    { sky0: "#7ec9e8", sky1: "#d8f0c0", canopy: "#2e7d46", canopy2: "#1d5c33", ground: "#63b45c", name: "Morning Grove" },
    { sky0: "#8fd4e8", sky1: "#f2ecb8", canopy: "#357f4e", canopy2: "#215f3a", ground: "#6cb95f", name: "Bright Vale" },
    { sky0: "#6fb9dd", sky1: "#f4d9a0", canopy: "#2c6f44", canopy2: "#1a5230", ground: "#5da854", name: "Sunfall Meadow" },
    { sky0: "#5a94c8", sky1: "#e8b87a", canopy: "#29603c", canopy2: "#174a2b", ground: "#559a4e", name: "Golden Hour" },
    { sky0: "#4a6ea8", sky1: "#c98a6a", canopy: "#235236", canopy2: "#143f27", ground: "#4c8a48", name: "Dusk Canopy" },
    { sky0: "#33518a", sky1: "#a06a88", canopy: "#1c4530", canopy2: "#10341f", ground: "#437a40", name: "Twilight Grove" }
  ];

  /* ---------- game state ---------- */
  var api = null;
  var S = null;          // mutable game state
  var hud = {};          // HUD element refs

  function freshState() {
    return {
      mode: "levels",
      level: 1,
      phase: "title",      // title | ready | playing | levelend | gameover | endless-over
      score: 0, combo: 0, bestCombo: 0,
      lives: 3, timeLeft: 0,
      caught: 0, missed: 0,
      goal: 0,
      basket: { x: 0.5, vx: 0, stun: 0, squash: 0, face: 0 },
      items: [], parts: [], floats: [], bees: [],
      spawnT: 0, beeT: 5, gustT: 10, gust: 0,
      shake: 0, banner: null, bannerT: 0,
      bgScroll: 0, t: 0,
      palette: PALETTES[0],
      fx: 1
    };
  }

  /* ---------- save ---------- */
  var save = null;
  function syncAggregates() {
    var done = 0, stars = 0;
    for (var i = 1; i <= LEVELS.length; i++) {
      var l = save.levels[i];
      if (l) { done++; stars += l.stars || 0; }
    }
    var blob = Atlas.profile.game("banana-catchers");
    blob.missionsTotal = LEVELS.length;
    blob.missionsDone = done;
    blob.starsTotal = stars;
    Atlas.persist();
  }

  /* ---------- HUD ---------- */
  function buildHud() {
    api.hud.init();
    api.hud.el.innerHTML =
      '<div class="hud-tl"><div class="hud-panel" id="bcScore">0</div></div>' +
      '<div class="hud-tr"><div class="hud-panel" id="bcLevel">Level 1</div>' +
      '<div class="hud-panel" style="margin-top:4px" id="bcTime">0:00</div></div>' +
      '<div class="hud-bl"><div class="hud-panel" id="bcLives">❤❤❤</div></div>' +
      '<div class="hud-br"><div class="hud-panel" id="bcCombo"></div></div>';
    hud.score = document.getElementById("bcScore");
    hud.level = document.getElementById("bcLevel");
    hud.time = document.getElementById("bcTime");
    hud.lives = document.getElementById("bcLives");
    hud.combo = document.getElementById("bcCombo");
  }
  function updateHud() {
    hud.score.textContent = S.score + (S.combo > 1 ? "  ×" + S.combo : "");
    hud.level.textContent = S.mode === "levels"
      ? "Level " + S.level + " — " + S.caught + "/" + S.goal
      : "Endless — " + S.caught + " caught";
    hud.time.textContent = U.fmtTime(S.timeLeft);
    hud.lives.textContent = S.lives > 0 ? new Array(S.lives + 1).join("❤") : "—";
    hud.combo.textContent = S.combo >= 3 ? "Combo " + S.combo : "";
    hud.combo.style.color = S.combo >= 10 ? "#ffd257" : "#eef1fb";
  }

  /* ---------- level flow ---------- */
  function startLevel(n, mode) {
    var def = LEVELS[Math.min(n, LEVELS.length) - 1];
    S.mode = mode || "levels";
    S.level = n;
    S.palette = PALETTES[def.palette];
    S.phase = "ready";
    S.score = 0; S.combo = 0; S.bestCombo = 0;
    S.lives = 3; S.timeLeft = def.dur;
    S.caught = 0; S.missed = 0;
    S.goal = def.goal;
    S.items = []; S.parts = []; S.floats = []; S.bees = [];
    S.spawnT = 0.6; S.beeT = def.dur * 0.4; S.gustT = def.dur * 0.55; S.gust = 0;
    S.shake = 0; S.banner = null;
    S.phase = "playing";
    api.screens.close();
    api.setRunning(true);
    S.banner = "Level " + n + " — catch " + S.goal + " bananas!";
    S.bannerT = 2.4;
    api.audio.sfx("quest");
    updateHud();
  }
  function startEndless() {
    S.mode = "endless";
    S.level = 0;
    S.phase = "playing";
    S.palette = PALETTES[3];
    S.score = 0; S.combo = 0; S.bestCombo = 0;
    S.lives = 3;
    S.timeLeft = 0; S.caught = 0; S.missed = 0; S.goal = 0;
    S.items = []; S.parts = []; S.floats = []; S.bees = [];
    S.spawnT = 0.5; S.beeT = 6; S.gustT = 8; S.gust = 0;
    S.shake = 0; S.banner = "Endless chase — how long can you last?";
    S.bannerT = 2.4;
    api.screens.close();
    api.setRunning(true);
    api.audio.sfx("quest");
    updateHud();
  }
  // Endless difficulty ramps like a rolling late level
  function endlessDef() {
    var k = Math.min(1, S.caught / 60);
    return {
      spawn: U.lerp(0.55, 0.34, k),
      speed: U.lerp(240, 360, k),
      coconut: U.lerp(0.18, 0.3, k),
      bee: U.lerp(0.25, 0.4, k),
      gust: U.lerp(0.35, 0.6, k)
    };
  }

  function finishLevel(won) {
    api.setRunning(false);
    var def = LEVELS[S.level - 1];
    var acc = (S.caught + S.missed) > 0 ? S.caught / (S.caught + S.missed) : 0;
    var stars = 0;
    if (won) {
      stars = 1;
      if (S.lives === 3 && acc >= 0.9) stars = 3;
      else if (acc >= 0.72) stars = 2;
    }
    if (S.mode === "levels") {
      var rec = save.levels[S.level] || (save.levels[S.level] = { stars: 0, best: 0 });
      rec.stars = Math.max(rec.stars, stars);
      rec.best = Math.max(rec.best, S.score);
      save.totalBananas += S.caught;
      api.save.save();
      syncAggregates();
    }
    if (won) {
      api.audio.sfx("win");
      var nextUnlocked = S.level < LEVELS.length;
      api.screens.open({
        title: "Level " + S.level + " complete!",
        subtitle: S.palette.name,
        label: "Level complete",
        bodyHTML:
          '<div class="stat-line"><span>Bananas caught</span><b>' + S.caught + "</b></div>" +
          '<div class="stat-line"><span>Best combo</span><b>×' + S.bestCombo + "</b></div>" +
          '<div class="stat-line"><span>Accuracy</span><b>' + Math.round(acc * 100) + "%</b></div>" +
          '<div class="stat-line"><span>Score</span><b>' + S.score + "</b></div>" +
          '<div class="stars" style="font-size:1.6rem;margin-top:10px">' + starsText(stars) + "</div>",
        buttons: [
          nextUnlocked
            ? { label: "Next level ▶", cls: "", onClick: function () { startLevel(S.level + 1); }, focus: true }
            : { label: "All 12 levels cleared! 🏆", cls: "", onClick: showTitle, focus: true },
          { label: "Replay level", onClick: function () { startLevel(S.level); } },
          { label: "Level select", onClick: showLevelSelect, small: true }
        ]
      });
    } else {
      api.audio.sfx("fail");
      api.screens.open({
        title: S.mode === "endless" ? "The chase ends…" : "Level failed",
        subtitle: S.mode === "endless" ? "The monkeys salute your effort." : "Time ran out — or the coconuts won.",
        label: "Game over",
        bodyHTML:
          '<div class="stat-line"><span>Score</span><b>' + S.score + "</b></div>" +
          '<div class="stat-line"><span>Bananas caught</span><b>' + S.caught + "</b></div>" +
          '<div class="stat-line"><span>Best combo</span><b>×' + S.bestCombo + "</b></div>" +
          (S.mode === "endless"
            ? '<div class="stat-line"><span>Personal best</span><b>' + Math.max(save.endlessBest, S.score) + "</b></div>"
            : '<div class="stat-line"><span>Quota</span><b>' + S.caught + " / " + S.goal + "</b></div>"),
        buttons: [
          { label: "Try again", cls: "", onClick: function () {
              if (S.mode === "endless") startEndless(); else startLevel(S.level);
            }, focus: true },
          { label: S.mode === "endless" ? "Title screen" : "Level select", onClick: showTitle, small: true }
        ]
      });
    }
    if (S.mode === "endless") {
      if (S.score > save.endlessBest) {
        save.endlessBest = S.score;
        api.save.save();
      }
      save.totalBananas += S.caught;
      api.save.save();
    }
  }

  function starsText(n) {
    var s = "";
    for (var i = 1; i <= 3; i++) s += i <= n ? "★" : '<span class="off">★</span>';
    return s;
  }

  /* ---------- menus ---------- */
  function showTitle() {
    api.setRunning(false);
    S.phase = "title";
    var levelsDone = Object.keys(save.levels).length;
    api.screens.open({
      title: "🍌 Banana Catchers",
      subtitle: "Suncrest Grove needs its harvest",
      label: "Banana Catchers title screen",
      bodyHTML:
        '<div class="stat-line"><span>Harvest levels</span><b>' + levelsDone + " / " + LEVELS.length + "</b></div>" +
        '<div class="stat-line"><span>Endless best</span><b>' + save.endlessBest + "</b></div>" +
        '<div class="stat-line"><span>Total bananas</span><b>' + save.totalBananas + "</b></div>" +
        '<p class="tips">Catch falling bananas in your basket. Chains of catches multiply points — but a missed banana breaks the chain, coconuts bruise, and bees sting!</p>',
      buttons: [
        { label: levelsDone ? "Continue harvest ▶" : "Start harvest ▶", cls: "", onClick: showLevelSelect, focus: true },
        { label: "Endless chase", onClick: startEndless },
        { label: "How to play", onClick: showHelp, small: true },
        { label: "Settings", onClick: showSettings, small: true }
      ]
    });
  }
  function showLevelSelect() {
    var rows = LEVELS.map(function (def, i) {
      var n = i + 1;
      var rec = save.levels[n];
      var locked = n > 1 && !save.levels[n - 1];
      var stars = rec ? starsText(rec.stars) : locked ? "🔒" : '<span class="off">★★★</span>';
      return '<div class="mission-item' + (locked ? " locked" : "") + '" data-level="' + n + '" role="button" tabindex="0">' +
        '<div class="mi-icon">' + (locked ? "🔒" : "🍌") + "</div>" +
        '<div class="mi-body"><b>Level ' + n + " · " + def.goal + " bananas</b>" +
        "<span>" + def.dur + "s · " + PALETTES[def.palette].name + "</span></div>" +
        '<div class="mi-stars">' + stars + "</div></div>";
    }).join("");
    api.screens.open({
      title: "Harvest levels",
      subtitle: "Finish a level to unlock the next",
      label: "Level select",
      bodyHTML: '<div class="mission-list">' + rows + "</div>",
      buttons: [{ label: "◀ Back", onClick: showTitle, small: true }]
    });
    api.screens.layer.querySelector(".screen-card .sc-body").addEventListener("click", function (e) {
      var it = e.target.closest("[data-level]");
      if (!it || it.classList.contains("locked")) {
        if (it) api.audio.sfx("hurt");
        return;
      }
      startLevel(parseInt(it.getAttribute("data-level"), 10));
    });
  }
  function showHelp() {
    api.screens.open({
      title: "How to play",
      subtitle: "Suncrest Grove field guide",
      label: "How to play",
      bodyHTML:
        '<div class="stat-line"><span>🍌 Banana / 🍌 bunch / ✨ golden</span><b>catch for 1 / 3 / 5 pts</b></div>' +
        '<div class="stat-line"><span>🥥 Coconut</span><b>lose a heart</b></div>' +
        '<div class="stat-line"><span>🐝 Bee</span><b>stings: combo lost</b></div>' +
        '<div class="stat-line"><span>💨 Gust</span><b>fruit drifts sideways</b></div>' +
        '<p class="tips">Move with <kbd>←</kbd> <kbd>→</kbd> (or <kbd>A</kbd>/<kbd>D</kbd>, or drag / touch stick). ' +
        "Missing a banana resets your combo. Golden bananas add +2 seconds in harvest levels. " +
        "Finish all 12 levels, then try Endless chase for a high score.</p>",
      buttons: [{ label: "Got it", cls: "", onClick: showTitle, focus: true }]
    });
  }
  function showSettings(back) {
    api.screens.open({
      title: "Settings",
      label: "Settings",
      dismissible: true,
      onEscape: back || showTitle,
      bodyHTML: api.screens.settingsRows(),
      buttons: [{ label: "Done", cls: "", onClick: back || showTitle, focus: true }]
    });
    api.screens.bindSettings();
  }
  function openPause() {
    if (!api.isRunning()) return;
    api.setRunning(false);
    api.save.save();
    api.screens.open({
      title: "Paused",
      subtitle: "The grove waits quietly…",
      label: "Pause menu",
      bodyHTML:
        '<div class="stat-line"><span>Score</span><b>' + S.score + "</b></div>" +
        '<div class="stat-line"><span>' + (S.mode === "levels" ? "Level " + S.level + " progress" : "Caught") + "</span><b>" +
        (S.mode === "levels" ? S.caught + "/" + S.goal : S.caught) + "</b></div>",
      buttons: [
        { label: "Resume", cls: "", onClick: resume, focus: true },
        { label: "Restart " + (S.mode === "levels" ? "level" : "chase"), onClick: function () {
            if (S.mode === "endless") startEndless(); else startLevel(S.level);
          } },
        { label: "Settings", onClick: function () { showSettings(openPause); }, small: true },
        { label: "How to play", onClick: showHelpFromPause, small: true },
        { label: "Quit to title", cls: "danger", onClick: showTitle, small: true }
      ]
    });
  }
  function showHelpFromPause() {
    showHelp();
  }
  function resume() {
    api.screens.close();
    api.setRunning(true);
  }

  /* ---------- gameplay ---------- */
  function spawnItem() {
    var def = S.mode === "endless" ? endlessDef() : LEVELS[S.level - 1];
    var r = Math.random();
    var kind = "banana";
    if (r < def.coconut) kind = "coconut";
    else if (r < def.coconut + 0.1) kind = "bunch";
    else if (r < def.coconut + 0.1 + 0.08) kind = "golden";
    S.items.push({
      kind: kind,
      x: U.rand(0.06, 0.94),
      y: -0.08,
      vy: (def.speed + U.rand(-20, 40)) / 900,
      vx: 0,
      rot: U.rand(0, Math.PI * 2),
      vr: U.rand(-2.2, 2.2),
      bob: U.rand(0, Math.PI * 2)
    });
  }
  function spawnBee() {
    var dir = Math.random() < 0.5 ? 1 : -1;
    S.bees.push({
      x: dir > 0 ? -0.1 : 1.1,
      y: U.rand(0.3, 0.72),
      vx: dir * U.rand(0.1, 0.16),
      wob: U.rand(0, Math.PI * 2)
    });
  }

  function catchItem(it, px, py) {
    var pts = 1, kind = it.kind;
    if (kind === "bunch") pts = 3;
    if (kind === "golden") pts = 5;
    S.combo++;
    S.bestCombo = Math.max(S.bestCombo, S.combo);
    var mult = 1 + Math.floor(S.combo / 5);
    S.score += pts * mult;
    S.caught++;
    if (kind === "golden" && S.mode === "levels") S.timeLeft = Math.min(LEVELS[S.level - 1].dur, S.timeLeft + 2);
    if (S.combo >= 25) Atlas.award("banana-25-combo");
    if (S.combo > 0 && S.combo % 10 === 0) {
      S.banner = "Combo ×" + S.combo + "!"; S.bannerT = 1.4;
      api.audio.sfx("chime");
    } else {
      api.audio.sfx(S.combo % 5 === 0 ? "pickup" : "blip");
    }
    burst(px, py, kind === "golden" ? "#ffe27a" : "#ffd257", 14);
    floatText(px, py - 20, "+" + pts * mult, "#fff3c4");
    S.basket.squash = 1;
  }

  function burst(x, y, color, n) {
    n = Math.round(n * S.fx);
    for (var i = 0; i < n; i++) {
      S.parts.push({
        x: x, y: y,
        vx: U.rand(-160, 160), vy: U.rand(-260, -60),
        life: U.rand(0.4, 0.8), t: 0,
        color: color, size: U.rand(2, 5), g: 500
      });
    }
  }
  function floatText(x, y, text, color) {
    S.floats.push({ x: x, y: y, text: text, color: color, t: 0, life: 0.9 });
  }

  function hurtBasket(reason, px, py) {
    if (S.basket.stun > 0) return;
    S.combo = 0;
    S.basket.stun = 0.7;
    S.shake = Math.min(1, S.fx);
    api.audio.sfx("hurt");
    burst(px, py, reason === "bee" ? "#e8d24a" : "#8a5a2b", 18);
    if (reason === "coconut") {
      S.lives--;
      floatText(px, py - 24, "OUCH!", "#ff9c9c");
      updateHud();
      if (S.lives <= 0) {
        S.phase = "over";
        finishLevel(false);
      }
    } else {
      floatText(px, py - 24, "buzz…", "#e8d24a");
    }
  }

  function update(apiRef, dt) {
    S = apiRef.state;
    S.t += dt;
    S.bgScroll += dt * 0.01;
    var def = S.mode === "endless" ? endlessDef() : LEVELS[S.level - 1];
    S.fx = apiRef.quality.fxMul() === 0 ? 0.25 : Math.max(0.25, apiRef.quality.fxMul());

    // basket movement
    var b = S.basket;
    if (b.stun > 0) b.stun -= dt;
    var stick = apiRef.input.stick;
    var move = stick.x;
    if (apiRef.input.key("ArrowLeft") || apiRef.input.key("KeyA")) move = -1;
    if (apiRef.input.key("ArrowRight") || apiRef.input.key("KeyD")) move = 1;
    if (apiRef.input.pointer.down && apiRef.input.pointer.active) {
      var target = apiRef.input.pointer.x / apiRef.w;
      b.x += U.clamp(target - b.x, -0.14, 0.14);
      move = 0;
    }
    if (b.stun <= 0) {
      b.vx += move * 3.4;
      b.vx = U.clamp(b.vx * 0.86, -1.5, 1.5);
      b.x += b.vx * dt * 0.45;
    }
    b.x = U.clamp(b.x, 0.04, 0.96);
    b.squash = Math.max(0, b.squash - dt * 4);
    b.face = U.clamp(b.vx * 0.3, -0.4, 0.4);

    // gusts
    if (S.phase === "playing") {
      if (def.gust > 0) {
        S.gustT -= dt;
        if (S.gustT <= 0 && S.gust === 0) {
          S.gust = (Math.random() < 0.5 ? 1 : -1) * U.rand(0.05, 0.12);
          S.gustT = U.rand(7, 12);
          if (S.fx > 0.3) apiRef.hud.toast("💨 Gust wind!", null, 1200);
          apiRef.audio.sfx("boost");
        }
      }
      if (S.gust !== 0) {
        S.gust *= (1 - dt * 0.6);
        if (Math.abs(S.gust) < 0.01) S.gust = 0;
      }

      // spawns
      S.spawnT -= dt;
      if (S.spawnT <= 0) {
        spawnItem();
        S.spawnT = def.spawn * U.rand(0.75, 1.25);
      }
      if (def.bee > 0) {
        S.beeT -= dt;
        if (S.beeT <= 0) {
          if (Math.random() < def.bee) spawnBee();
          S.beeT = U.rand(4, 8);
        }
      }

      // timer
      if (S.mode === "levels") {
        S.timeLeft -= dt;
        if (S.timeLeft <= 0) { S.timeLeft = 0; S.phase = "over"; finishLevel(S.caught >= S.goal); return; }
        if (S.caught >= S.goal) { S.phase = "over"; finishLevel(true); return; }
      }

      // items fall
      for (var i = S.items.length - 1; i >= 0; i--) {
        var it = S.items[i];
        it.y += it.vy * dt;
        it.x += (S.gust * 0.5) * dt;
        it.x = U.clamp(it.x + it.vx * dt, 0.02, 0.98);
        it.rot += it.vr * dt;
        it.bob += dt * 6;
        // catch check — basket rim zone
        var bx = b.x * apiRef.w, by = apiRef.h - 74;
        var ix = it.x * apiRef.w, iy = it.y * apiRef.h;
        var near = Math.abs(ix - bx) < apiRef.w * 0.075 && iy > by - 26 && iy < by + 40;
        if (near && it.kind !== "coconut" && b.stun <= 0) {
          catchItem(it, ix, iy);
          S.items.splice(i, 1);
          continue;
        }
        if (near && it.kind === "coconut") {
          hurtBasket("coconut", ix, iy);
          S.items.splice(i, 1);
          continue;
        }
        if (it.y > 1.12) {
          if (it.kind !== "coconut") {
            if (S.combo > 0) {
              S.combo = 0;
              floatText(ix, apiRef.h - 120, "combo lost", "#ffb0b0");
            }
            S.missed++;
            apiRef.audio.sfx("pop", { vol: 0.4 });
            burst(ix, apiRef.h - 40, "#5da854", 6);
            updateHud();
          }
          S.items.splice(i, 1);
        }
      }

      // bees cross horizontally
      for (var j = S.bees.length - 1; j >= 0; j--) {
        var bee = S.bees[j];
        bee.x += bee.vx * dt;
        bee.y += Math.sin(bee.wob += dt * 7) * 0.0012;
        var bxp = bee.x * apiRef.w, byp = bee.y * apiRef.h;
        if (Math.abs(bxp - b.x * apiRef.w) < apiRef.w * 0.07 && Math.abs(byp - (apiRef.h - 84)) < 34) {
          hurtBasket("bee", bxp, byp);
          S.bees.splice(j, 1);
          continue;
        }
        if (bee.x < -0.2 || bee.x > 1.2) S.bees.splice(j, 1);
      }
    }

    // particles + floats
    for (var p = S.parts.length - 1; p >= 0; p--) {
      var pt = S.parts[p];
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.g * dt;
      if (pt.t > pt.life) S.parts.splice(p, 1);
    }
    for (var f = S.floats.length - 1; f >= 0; f--) {
      var fl = S.floats[f];
      fl.t += dt;
      fl.y -= dt * 34;
      if (fl.t > fl.life) S.floats.splice(f, 1);
    }
    S.shake = Math.max(0, S.shake - dt * 2.4);
    if (S.bannerT > 0) S.bannerT -= dt;
    updateHud();
  }

  /* ---------- rendering ---------- */
  function drawBanana(x, ctx, cx, cy, r, rot, golden) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineCap = "round";
    ctx.lineWidth = r * 0.62;
    var grad = ctx.createLinearGradient(-r, -r, r, r);
    if (golden) {
      grad.addColorStop(0, "#fff3b0"); grad.addColorStop(0.5, "#ffd257"); grad.addColorStop(1, "#e2a02c");
      ctx.shadowColor = "rgba(255,210,87,0.9)"; ctx.shadowBlur = 14;
    } else {
      grad.addColorStop(0, "#ffe57a"); grad.addColorStop(0.55, "#f5c542"); grad.addColorStop(1, "#cf9420");
      ctx.shadowColor = "rgba(20,30,10,0.35)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    }
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0.45, 2.5);
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // highlight
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, 0.75, 1.5);
    ctx.stroke();
    // stem
    ctx.fillStyle = "#7a5a23";
    ctx.fillRect(r * 0.72, -r * 0.52, r * 0.24, r * 0.3);
    ctx.restore();
  }
  function drawCoconut(x, ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
    g.addColorStop(0, "#9a6a3d"); g.addColorStop(0.7, "#6d4a26"); g.addColorStop(1, "#4a3018");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a2610";
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.25, r * 0.13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.3, r * 0.1, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -2.4, -1.2); ctx.stroke();
    ctx.restore();
  }
  function drawBee(x, ctx, cx, cy, wob) {
    ctx.save();
    ctx.translate(cx, cy);
    var flap = Math.sin(wob * 9) * 0.5;
    ctx.fillStyle = "rgba(230,240,255,0.65)";
    ctx.beginPath(); ctx.ellipse(-3, -6, 7, 4, flap, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, -6, 7, 4, -flap, 0, 7); ctx.fill();
    var g = ctx.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, "#ffd24a"); g.addColorStop(1, "#d8a018");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a2a10";
    ctx.fillRect(-6, -7, 3.4, 14);
    ctx.fillRect(0, -7, 3.4, 14);
    ctx.beginPath(); ctx.arc(9, -1, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(10, -2.4, 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawMonkeyBasket(x, ctx, cx, cy, face, squash, stun) {
    var w = 62, h = 40;
    var sq = 1 + squash * 0.12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / sq, sq);
    // shadow
    ctx.fillStyle = "rgba(10,20,10,0.3)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.62, w * 0.6, 7, 0, 0, 7); ctx.fill();
    // basket body
    var g = ctx.createLinearGradient(0, -h, 0, h * 0.6);
    g.addColorStop(0, "#a9763e"); g.addColorStop(1, "#7a5227");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.5);
    ctx.quadraticCurveTo(0, h * 0.7, w / 2, -h * 0.5);
    ctx.closePath();
    ctx.fill();
    // weave lines
    ctx.strokeStyle = "rgba(60,38,15,0.4)";
    ctx.lineWidth = 2;
    for (var i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + i * 6, -h * 0.5 + i * 8);
      ctx.quadraticCurveTo(0, h * 0.7 - i * 9, w / 2 - i * 6, -h * 0.5 + i * 8);
      ctx.stroke();
    }
    // monkey face peeking
    var fy = -h * 0.62;
    ctx.fillStyle = stun > 0 ? "#c9b6a2" : "#e8b078";
    ctx.beginPath(); ctx.arc(0, fy, 20, 0, 7); ctx.fill();
    // ears
    ctx.beginPath(); ctx.arc(-19, fy - 2, 7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(19, fy - 2, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#c98d5a";
    ctx.beginPath(); ctx.arc(-19, fy - 2, 3.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(19, fy - 2, 3.6, 0, 7); ctx.fill();
    // eyes
    var blink = Math.sin(Date.now() / 700) > 0.97;
    ctx.fillStyle = "#2b1a10";
    if (stun > 0) {
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("x", -9, fy - 1);
      ctx.fillText("x", 4, fy - 1);
    } else if (!blink) {
      ctx.beginPath(); ctx.arc(-7 + face * 6, fy - 3, 3.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(7 + face * 6, fy - 3, 3.2, 0, 7); ctx.fill();
    } else {
      ctx.fillRect(-10 + face * 6, fy - 4, 6, 1.6);
      ctx.fillRect(4 + face * 6, fy - 4, 6, 1.6);
    }
    // muzzle
    ctx.fillStyle = "#f2d0a8";
    ctx.beginPath(); ctx.ellipse(face * 6, fy + 7, 8, 5.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a2c14";
    ctx.beginPath(); ctx.arc(face * 6, fy + 5, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(face * 6, fy + 10, 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawCanopy(x, ctx, w, h, pal, scroll) {
    // two parallax silhouette layers + vines
    ctx.fillStyle = pal.canopy2;
    for (var i = -1; i < 8; i++) {
      var lx = ((i * 180 + scroll * 30) % (w + 180)) - 90;
      ctx.beginPath();
      ctx.ellipse(lx, -20, 120, 90, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = pal.canopy;
    for (var j = -1; j < 7; j++) {
      var lx2 = ((j * 230 + scroll * 70) % (w + 230)) - 110;
      ctx.beginPath();
      ctx.ellipse(lx2, -34, 130, 100, 0, 0, 7);
      ctx.fill();
    }
    // hanging vines
    ctx.strokeStyle = "rgba(30,80,40,0.5)";
    ctx.lineWidth = 3;
    for (var v = 0; v < 6; v++) {
      var vx = ((v * 160 + scroll * 50) % (w + 160)) - 80;
      var sway = Math.sin(Date.now() / 900 + v) * 8;
      ctx.beginPath();
      ctx.moveTo(vx, 30);
      ctx.quadraticCurveTo(vx + sway, 90, vx + sway * 1.6, 150 + (v % 3) * 30);
      ctx.stroke();
    }
  }

  function render(apiRef) {
    S = apiRef.state;
    var x = apiRef.ctx;
    var w = apiRef.w, h = apiRef.h;
    var pal = S.palette;
    var t = S.t;

    x.save();
    if (S.shake > 0) {
      x.translate(U.rand(-6, 6) * S.shake, U.rand(-6, 6) * S.shake);
    }

    // sky
    var sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.sky0);
    sky.addColorStop(1, pal.sky1);
    x.fillStyle = sky;
    x.fillRect(-10, -10, w + 20, h + 20);

    // sun / clouds
    var sunX = w * 0.82, sunY = h * 0.2;
    var sunG = x.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
    sunG.addColorStop(0, "rgba(255,244,200,0.95)");
    sunG.addColorStop(0.5, "rgba(255,230,150,0.35)");
    sunG.addColorStop(1, "rgba(255,230,150,0)");
    x.fillStyle = sunG;
    x.beginPath(); x.arc(sunX, sunY, 70, 0, 7); x.fill();
    x.fillStyle = "rgba(255,255,255,0.5)";
    for (var c = 0; c < 3; c++) {
      var cx = ((c * 300 + t * 12 + S.bgScroll * 400) % (w + 240)) - 120;
      var cy = h * (0.14 + c * 0.09);
      x.beginPath();
      x.ellipse(cx, cy, 54, 14, 0, 0, 7);
      x.ellipse(cx + 30, cy - 8, 34, 11, 0, 0, 7);
      x.fill();
    }

    drawCanopy(x, x, w, h, pal, S.bgScroll);

    // ground
    var gg = x.createLinearGradient(0, h - 60, 0, h);
    gg.addColorStop(0, pal.ground);
    gg.addColorStop(1, "#3a7038");
    x.fillStyle = gg;
    x.fillRect(0, h - 34, w, 34);
    x.fillStyle = "rgba(255,255,255,0.12)";
    x.fillRect(0, h - 34, w, 2.5);
    // grass tufts
    x.strokeStyle = "rgba(40,90,40,0.8)";
    x.lineWidth = 2;
    for (var gt = 0; gt < w / 26; gt++) {
      var gx = gt * 26 + 8;
      x.beginPath();
      x.moveTo(gx, h - 33);
      x.lineTo(gx + Math.sin(t * 2 + gt) * 3, h - 44);
      x.stroke();
    }

    // falling items (y,x are 0..1 normalized)
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      var ix = it.x * w, iy = it.y * h;
      if (it.kind === "coconut") drawCoconut(x, x, ix, iy, 15);
      else drawBanana(x, x, ix, iy + Math.sin(it.bob) * 3, it.kind === "bunch" ? 13 : 16, it.rot + Math.sin(it.bob) * 0.2, it.kind === "golden");
    }
    // bees
    for (var j2 = 0; j2 < S.bees.length; j2++) {
      var bee = S.bees[j2];
      drawBee(x, x, bee.x * w, bee.y * h, bee.wob);
    }

    // basket monkey
    drawMonkeyBasket(x, x, S.basket.x * w, h - 74, S.basket.face, S.basket.squash, S.basket.stun);

    // particles
    for (var p = 0; p < S.parts.length; p++) {
      var pt = S.parts[p];
      var a = 1 - pt.t / pt.life;
      x.globalAlpha = Math.max(0, a);
      x.fillStyle = pt.color;
      x.beginPath();
      x.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;

    // floating texts
    x.font = "bold " + Math.max(14, w * 0.022) + "px 'Trebuchet MS', sans-serif";
    x.textAlign = "center";
    for (var f = 0; f < S.floats.length; f++) {
      var fl = S.floats[f];
      x.globalAlpha = Math.max(0, 1 - fl.t / fl.life);
      x.fillStyle = "rgba(10,20,10,0.6)";
      x.fillText(fl.text, fl.x + 1.5, fl.y + 1.5);
      x.fillStyle = fl.color;
      x.fillText(fl.text, fl.x, fl.y);
    }
    x.globalAlpha = 1;
    x.textAlign = "left";

    // gust indicator — leaves drifting sideways
    if (Math.abs(S.gust) > 0.02 && S.fx > 0.3) {
      x.fillStyle = "rgba(120,180,90,0.5)";
      for (var lf = 0; lf < 8; lf++) {
        var lyx = ((lf * 90 + Date.now() / 6 * Math.sign(S.gust)) % (w + 80)) - 40;
        var lyy = h * 0.2 + ((lf * 53) % (h * 0.5));
        x.save();
        x.translate(lyx, lyy);
        x.rotate(Date.now() / 300 + lf);
        x.fillRect(-4, -2, 8, 4);
        x.restore();
      }
    }

    // banner
    if (S.bannerT > 0 && S.banner) {
      var ba = Math.min(1, S.bannerT);
      x.globalAlpha = ba;
      x.font = "bold " + Math.max(18, w * 0.034) + "px 'Trebuchet MS', sans-serif";
      x.textAlign = "center";
      x.fillStyle = "rgba(8,14,10,0.55)";
      var bw = w * 0.62, bx = w / 2, by = h * 0.16;
      U.roundRect(x, x, bx - bw / 2, by - 26, bw, 52, 14);
      x.fill();
      x.fillStyle = "#ffe9ad";
      x.fillText(S.banner, bx, by + 8);
      x.globalAlpha = 1;
      x.textAlign = "left";
    }

    // subtle vignette for depth
    var vg = x.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(6,10,24,0.35)");
    x.fillStyle = vg;
    x.fillRect(0, 0, w, h);

    x.restore();
  }

  /* ---------- boot ---------- */
  GK.boot({
    canvas: "#game",
    gameId: "banana-catchers",
    saveId: "banana-catchers",
    defaults: { levels: {}, endlessBest: 0, totalBananas: 0 },
    on: {
      init: function (a) {
        api = a;
        S = a.state = freshState();
        save = a.save.load();
        if (!save.levels) save.levels = {};
        S.fx = Math.max(0.3, a.quality.fxMul());
        buildHud();
        a.input.addTouchButtons([{ id: "pause", label: "❚❚" }]);
        a.input.consumeBtn("pause");
        window.addEventListener("keydown", function (e) {
          if (e.code === "KeyM") {
            var p = Atlas.profile.get();
            Atlas.profile.setSetting("muted", !p.settings.muted);
            Atlas.persist();
            Atlas.toast(p.settings.muted ? "Sound muted" : "Sound on");
          }
        });
        // M key handled globally here; gamekit handles Esc/P
      },
      title: function () {
        showTitle();
      },
      update: function (a, dt) {
        if (a.input.consumeBtn("pause")) openPause();
        update(a, dt);
      },
      render: function (a) {
        render(a);
      },
      requestPause: function () {
        openPause();
      },
      onAutoPause: function () {
        openPause();
      }
    }
  });
})();
