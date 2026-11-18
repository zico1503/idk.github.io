/* ============================================================
   Thornward — engine. Grid TD on a 16×9 map, BFS pathing,
   8 towers, status effects, waves, stars, requisition perks.
   QA hooks: ?autoplay=1 (greedy builder), ?turbo=N (fast sim).
   ============================================================ */
(function () {
  "use strict";
  var U = GK.util;
  var D = window.TWD;

  var api = null, S = null, save = null;
  var TILE = 0, OX = 0, OY = 0, COLS = 16, ROWS = 9;
  var mapCanvas = null;
  var ui = {};            // DOM refs for build bar / HUD
  var qa = {
    autoplay: /[?&]autoplay=1/.test(location.search),
    turbo: parseFloat((location.search.match(/[?&]turbo=([\d.]+)/) || [0, 0])[1]) || 1
  };

  /* ================= save ================= */
  function syncAggregates() {
    var done = 0, stars = 0;
    D.MISSIONS.forEach(function (m, i) {
      var r = save.done[i];
      if (r) { done++; stars += r.stars; }
    });
    var blob = Atlas.profile.game("thornward");
    blob.missionsTotal = D.MISSIONS.length;
    blob.missionsDone = done;
    blob.starsTotal = stars;
    Atlas.persist();
  }
  function starsOwned() {
    var s = 0;
    D.MISSIONS.forEach(function (m, i) { if (save.done[i]) s += save.done[i].stars; });
    return s;
  }
  function perk(id) { return !!(save.perks && save.perks[id]); }

  /* ================= mission setup ================= */
  function parseMap(mapKey) {
    var rows = D.MAPS[mapKey];
    var grid = [];
    var spawn = null, exit = null;
    rows.forEach(function (r, ri) {
      var line = [];
      for (var ci = 0; ci < COLS; ci++) {
        var ch = r[ci] || ".";
        if (ch === "S") { spawn = { c: ci, r: ri }; ch = "#"; }
        if (ch === "E") { exit = { c: ci, r: ri }; ch = "#"; }
        line.push(ch);
      }
      grid.push(line);
    });
    // BFS from spawn to exit through path tiles
    var path = [];
    if (spawn && exit) {
      var prev = {}, q = [spawn], seen = {};
      seen[spawn.c + "," + spawn.r] = true;
      while (q.length) {
        var cur = q.shift();
        if (cur.c === exit.c && cur.r === exit.r) break;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nc = cur.c + d[0], nr = cur.r + d[1];
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return;
          if (grid[nr][nc] !== "#" || seen[nc + "," + nr]) return;
          seen[nc + "," + nr] = true;
          prev[nc + "," + nr] = cur;
          q.push({ c: nc, r: nr });
        });
      }
      var node = exit;
      while (node) {
        path.unshift(node);
        if (node.c === spawn.c && node.r === spawn.r) break;
        node = prev[node.c + "," + node.r];
      }
    }
    return { grid: grid, path: path, spawn: spawn, exit: exit, rows: rows };
  }

  function tileCenter(c, r) {
    return { x: OX + (c + 0.5) * TILE, y: OY + (r + 0.5) * TILE };
  }
  function tileAt(px, py) {
    var c = Math.floor((px - OX) / TILE), r = Math.floor((py - OY) / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c: c, r: r };
  }

  function startMission(mi) {
    var def = D.MISSIONS[mi];
    var g = api.w / COLS, g2 = api.h / ROWS;
    TILE = Math.min(g, g2);
    OX = (api.w - TILE * COLS) / 2;
    OY = (api.h - TILE * ROWS) / 2;

    S.mission = mi;
    S.def = def;
    S.map = parseMap(def.map);
    S.waypoints = S.map.path.map(function (t) { return tileCenter(t.c, t.r); });
    S.exitPos = tileCenter(S.map.exit.c, S.map.exit.r);
    S.spawnPos = tileCenter(S.map.spawn.c, S.map.spawn.r);
    S.towers = [];
    S.enemies = [];
    S.shots = [];
    S.parts = [];
    S.floats = [];
    S.leaves = def.leaves + (perk("cache") ? 40 : 0);
    S.maxPetals = def.petals + (perk("mend") ? 2 : 0);
    S.petals = S.maxPetals;
    S.wave = 0;
    S.phase = "build";          // build | wave | done | failed
    S.interT = 14;
    S.queue = [];
    S.waveT = 0;
    S.speed = 1;
    S.boss = null;
    S.shake = 0;
    S.selectedTower = null;
    S.placing = null;
    S.autoplayT = 1;
    S.t = 0;
    prerenderMap();
    buildBuildBar();
    api.screens.close();
    api.setRunning(true);
    api.audio.ambience("garden");
    api.hud.toast("🌿 " + def.name, null, 2000);
  }

  function hpMul() { return 1 + S.mission * 0.085; }
  function rewardMul() { return (1 + S.mission * 0.02) * (perk("harvest") ? 1.15 : 1); }

  /* ================= prerendered map ================= */
  function prerenderMap() {
    mapCanvas = document.createElement("canvas");
    mapCanvas.width = api.w;
    mapCanvas.height = api.h;
    var x = mapCanvas.getContext("2d");
    var grove = D.GROVES[S.def.grove];
    var rnd = U.rng(1234 + S.mission * 77);
    x.fillStyle = grove.sky;
    x.fillRect(0, 0, api.w, api.h);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var ch = S.map.grid[r][c];
        var px = OX + c * TILE, py = OY + r * TILE;
        // base grass with soft noise shading
        var n = rnd();
        x.fillStyle = ch === "~" ? "#173038" : mixColor("#1e3d26", "#27503a", n);
        x.fillRect(px, py, TILE + 0.5, TILE + 0.5);
        if (ch === "." && n > 0.82) { // grass tufts
          x.strokeStyle = "rgba(120,190,120,0.25)";
          x.lineWidth = 1.5;
          x.beginPath();
          x.moveTo(px + TILE * 0.3, py + TILE * 0.8);
          x.lineTo(px + TILE * 0.38, py + TILE * 0.45);
          x.moveTo(px + TILE * 0.6, py + TILE * 0.7);
          x.lineTo(px + TILE * 0.66, py + TILE * 0.4);
          x.stroke();
        }
        if (ch === "#") { // path with soft border
          x.fillStyle = mixColor("#4a3f2e", "#5c5138", n * 0.6);
          x.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          x.fillStyle = "rgba(0,0,0,0.18)";
          var up = r > 0 && S.map.grid[r - 1][c] !== "#";
          var dn = r < ROWS - 1 && S.map.grid[r + 1][c] !== "#";
          if (up) x.fillRect(px, py, TILE, TILE * 0.16);
          if (dn) x.fillRect(px, py + TILE * 0.84, TILE, TILE * 0.16);
          if (n > 0.7) {
            x.fillStyle = "rgba(255,255,255,0.05)";
            x.beginPath();
            x.ellipse(px + TILE * 0.5, py + TILE * 0.5, TILE * 0.28, TILE * 0.12, 0, 0, 7);
            x.fill();
          }
        }
        if (ch === "~") { // water
          x.fillStyle = "rgba(90,200,190,0.22)";
          x.beginPath();
          x.ellipse(px + TILE * 0.5, py + TILE * 0.5, TILE * 0.42, TILE * 0.3, 0, 0, 7);
          x.fill();
          x.strokeStyle = "rgba(160,240,230,0.35)";
          x.lineWidth = 1.5;
          x.beginPath();
          x.moveTo(px + TILE * 0.2, py + TILE * 0.55);
          x.quadraticCurveTo(px + TILE * 0.5, py + TILE * 0.4, px + TILE * 0.8, py + TILE * 0.55);
          x.stroke();
        }
        if (ch === "T") { // tree with shadow
          x.fillStyle = "rgba(0,0,0,0.3)";
          x.beginPath();
          x.ellipse(px + TILE * 0.5, py + TILE * 0.78, TILE * 0.32, TILE * 0.1, 0, 0, 7);
          x.fill();
          x.fillStyle = "#5a4028";
          x.fillRect(px + TILE * 0.44, py + TILE * 0.42, TILE * 0.12, TILE * 0.34);
          var cg = x.createRadialGradient(px + TILE * 0.42, py + TILE * 0.28, 2, px + TILE * 0.5, py + TILE * 0.35, TILE * 0.42);
          cg.addColorStop(0, "#4a8a52"); cg.addColorStop(1, "#27523a");
          x.fillStyle = cg;
          x.beginPath();
          x.arc(px + TILE * 0.5, py + TILE * 0.32, TILE * 0.34, 0, 7);
          x.fill();
        }
        if (ch === "R") { // rock
          x.fillStyle = "rgba(0,0,0,0.3)";
          x.beginPath();
          x.ellipse(px + TILE * 0.5, py + TILE * 0.75, TILE * 0.3, TILE * 0.09, 0, 0, 7);
          x.fill();
          var rg = x.createLinearGradient(px, py + TILE * 0.3, px, py + TILE * 0.8);
          rg.addColorStop(0, "#8a94ab"); rg.addColorStop(1, "#525c72");
          x.fillStyle = rg;
          x.beginPath();
          x.moveTo(px + TILE * 0.22, py + TILE * 0.75);
          x.lineTo(px + TILE * 0.34, py + TILE * 0.42);
          x.lineTo(px + TILE * 0.62, py + TILE * 0.34);
          x.lineTo(px + TILE * 0.8, py + TILE * 0.72);
          x.closePath();
          x.fill();
        }
      }
    }
    // grid guides (faint) on buildable tiles
    x.strokeStyle = "rgba(255,255,255,0.045)";
    x.lineWidth = 1;
    for (var rr = 0; rr <= ROWS; rr++) {
      x.beginPath();
      x.moveTo(OX, OY + rr * TILE); x.lineTo(OX + COLS * TILE, OY + rr * TILE);
      x.stroke();
    }
    for (var cc = 0; cc <= COLS; cc++) {
      x.beginPath();
      x.moveTo(OX + cc * TILE, OY); x.lineTo(OX + cc * TILE, OY + ROWS * TILE);
      x.stroke();
    }
    // spawn portal
    var sp = tileCenter(S.map.spawn.c, S.map.spawn.r);
    var sg = x.createRadialGradient(sp.x, sp.y, 2, sp.x, sp.y, TILE * 0.7);
    sg.addColorStop(0, "rgba(160,60,200,0.6)"); sg.addColorStop(1, "rgba(160,60,200,0)");
    x.fillStyle = sg;
    x.beginPath(); x.arc(sp.x, sp.y, TILE * 0.7, 0, 7); x.fill();
  }
  function mixColor(a, b, t) {
    function hex(h) {
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    }
    var ca = hex(a), cb = hex(b);
    return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * t) + "," + Math.round(ca[1] + (cb[1] - ca[1]) * t) + "," + Math.round(ca[2] + (cb[2] - ca[2]) * t) + ")";
  }

  /* ================= build bar / HUD DOM ================= */
  function buildBuildBar() {
    var frame = api.canvas.parentElement;
    var bar = document.getElementById("twBar");
    if (bar) bar.remove();
    bar = document.createElement("div");
    bar.id = "twBar";
    bar.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:7;display:flex;gap:6px;justify-content:center;padding:6px;pointer-events:auto;flex-wrap:wrap";
    D.TOWER_ORDER.forEach(function (id, i) {
      var t = D.TOWERS[id];
      var b = document.createElement("button");
      b.className = "tw-card";
      b.id = "twCard-" + id;
      b.innerHTML = '<span class="tw-ico">' + t.icon + "</span><span class='tw-cost'>" + t.cost + "🍃</span><span class='tw-key'>" + (i + 1) + "</span>";
      b.title = t.name + " — " + t.desc + " (" + t.hits + ")";
      b.setAttribute("aria-label", "Select " + t.name + ", cost " + t.cost + " leaves");
      b.style.cssText = "pointer-events:auto;background:rgba(13,20,38,0.85);border:1px solid #3b4a72;color:#e9edfa;border-radius:8px;padding:4px 7px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px";
      b.addEventListener("click", function () { togglePlace(id); });
      bar.appendChild(b);
    });
    // speed + wave buttons live top-right via HUD panel
    frame.appendChild(bar);
    refreshBar();
  }
  function refreshBar() {
    D.TOWER_ORDER.forEach(function (id) {
      var el = document.getElementById("twCard-" + id);
      if (!el) return;
      var cost = towerCost(id, 0);
      el.style.opacity = S.leaves >= cost ? 1 : 0.45;
      el.style.borderColor = S.placing === id ? "#3ddad7" : "#3b4a72";
    });
  }
  function towerCost(id, tier) {
    var t = D.TOWERS[id];
    var base = tier === 0 ? t.cost : t.tiers[tier].cost;
    return Math.round(base * (perk("discount") ? 0.9 : 1));
  }

  function buildHud() {
    api.hud.init();
    api.hud.el.innerHTML =
      '<div class="hud-tl"><div class="hud-panel" id="twLeaves"></div><div class="hud-panel" style="margin-top:4px" id="twPetals"></div></div>' +
      '<div class="hud-tr"><div class="hud-panel" id="twWave"></div>' +
      '<div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end">' +
      '<button class="hud-panel" id="twPause" style="pointer-events:auto;cursor:pointer;font:inherit;color:inherit" aria-label="Pause">❚❚</button>' +
      '<button class="hud-panel" id="twSpeed" style="pointer-events:auto;cursor:pointer;font:inherit;color:inherit">▶ 1×</button>' +
      '<button class="hud-panel" id="twNext" style="pointer-events:auto;cursor:pointer;font:inherit;color:inherit">Send wave</button></div></div>' +
      '<div class="hud-bl"><div class="hud-panel small" id="twInfo"></div></div>';
    document.getElementById("twPause").addEventListener("click", function () { openPause(); });
    document.getElementById("twSpeed").addEventListener("click", function () {
      S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1;
      this.textContent = "▶ " + S.speed + "×";
      api.audio.sfx("click");
    });
    document.getElementById("twNext").addEventListener("click", function () {
      callWave();
    });
  }
  function updateHud() {
    if (!document.getElementById("twLeaves")) return;
    document.getElementById("twLeaves").textContent = "🍃 " + Math.floor(S.leaves);
    document.getElementById("twPetals").textContent = "🌺 " + Math.max(0, S.petals) + "/" + S.maxPetals;
    var wn = document.getElementById("twWave");
    if (S.phase === "build") {
      wn.textContent = "Wave " + (S.wave + 1) + "/" + S.def.waves.length + " in " + Math.ceil(S.interT) + "s";
      document.getElementById("twNext").textContent = "Send now +" + earlyBonus() + "🍃";
    } else if (S.phase === "wave") {
      wn.textContent = "Wave " + (S.wave + 1) + "/" + S.def.waves.length + " — " + (S.enemies.length + S.queue.length) + " left";
      document.getElementById("twNext").textContent = "Wave active";
    }
    var sel = S.selectedTower ? describeTower(S.selectedTower) : S.placing ? "Placing: " + D.TOWERS[S.placing].name + " — click a grass tile (Esc cancels)" : "";
    document.getElementById("twInfo").textContent = sel || S.def.tip;
  }
  function describeTower(tw) {
    var t = D.TOWERS[tw.id];
    var tier = t.tiers[tw.tier];
    var s = t.icon + " " + t.name + " T" + (tw.tier + 1);
    if (tier.dmg) s += " · dmg " + tier.dmg;
    if (tier.slow) s += " · slow " + Math.round(tier.slow * 100) + "%";
    if (tier.income) s += " · +" + tier.income + "🍃/" + tier.every + "s";
    if (tw.target) s += " · target: " + tw.target;
    return s;
  }

  /* ================= placement & selection ================= */
  function togglePlace(id) {
    if (S.placing === id) { S.placing = null; }
    else if (S.leaves >= towerCost(id, 0)) {
      S.placing = id;
      S.selectedTower = null;
      api.audio.sfx("click");
    } else {
      api.hud.toast("Not enough leaves", "error", 1000);
    }
    refreshBar();
  }
  function tryPlace(c, r) {
    var id = S.placing;
    var cost = towerCost(id, 0);
    if (!canBuildAt(c, r)) { api.audio.sfx("hurt"); return; }
    if (S.leaves < cost) { api.hud.toast("Not enough leaves", "error", 1000); return; }
    S.leaves -= cost;
    var pos = tileCenter(c, r);
    S.towers.push({
      id: id, c: c, r: r, x: pos.x, y: pos.y,
      tier: 0, cd: 0, incomeT: 0, target: "first", angle: 0, invested: cost
    });
    api.audio.sfx("land");
    burst(pos.x, pos.y, "#7dd97a", 10);
    S.placing = null;
    refreshBar();
  }
  function canBuildAt(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (S.map.grid[r][c] !== ".") return false;
    return !S.towers.some(function (t) { return t.c === c && t.r === r; });
  }
  function towerAt(c, r) {
    for (var i = 0; i < S.towers.length; i++) {
      if (S.towers[i].c === c && S.towers[i].r === r) return S.towers[i];
    }
    return null;
  }
  function upgradeTower(tw) {
    var t = D.TOWERS[tw.id];
    if (tw.tier >= 2) return;
    var cost = towerCost(tw.id, tw.tier + 1);
    if (S.leaves < cost) { api.hud.toast("Not enough leaves", "error", 1000); return; }
    S.leaves -= cost;
    tw.invested += cost;
    tw.tier++;
    api.audio.sfx("quest");
    burst(tw.x, tw.y, "#ffd257", 12);
  }
  function sellTower(tw) {
    var refund = Math.round(tw.invested * 0.7);
    S.leaves += refund;
    S.towers.splice(S.towers.indexOf(tw), 1);
    S.selectedTower = null;
    api.audio.sfx("pop");
    burst(tw.x, tw.y, "#9aa7c9", 10);
    floatText(tw.x, tw.y - 14, "+" + refund + "🍃", "#b8e8b0");
  }
  function cycleTarget(tw) {
    var order = ["first", "strong", "last"];
    tw.target = order[(order.indexOf(tw.target) + 1) % 3];
    api.audio.sfx("click");
  }

  /* ================= waves ================= */
  function earlyBonus() {
    return Math.ceil(Math.max(0, S.interT) * 2.5);
  }
  function callWave() {
    if (S.phase !== "build") return;
    var bonus = earlyBonus();
    if (bonus > 0) {
      S.leaves += bonus;
      floatText(S.exitPos.x, S.exitPos.y - TILE, "+" + bonus + "🍃 early!", "#ffe9ad");
    }
    beginWave();
  }
  function beginWave() {
    var waveDef = S.def.waves[S.wave];
    S.phase = "wave";
    S.queue = [];
    S.waveT = 0;
    waveDef.forEach(function (g) {
      for (var i = 0; i < g[1]; i++) {
        S.queue.push({ type: g[0], t: g[3] + i * g[2] });
      }
    });
    S.queue.sort(function (a, b) { return a.t - b.t; });
    var bossIncoming = S.def.waves[S.wave].some(function (g) { return D.ENEMIES[g[0]].boss; });
    api.hud.toast(bossIncoming ? "☠ BOSS WAVE" : "Wave " + (S.wave + 1), bossIncoming ? "error" : null, 1600);
    api.audio.sfx(bossIncoming ? "boom" : "quest");
  }
  function endWave() {
    S.wave++;
    var reward = 24 + S.wave * 5;
    S.leaves += reward;
    floatText(S.exitPos.x, S.exitPos.y - TILE, "+" + reward + "🍃", "#c8ecb0");
    api.audio.sfx("chime");
    if (S.wave >= S.def.waves.length) {
      finishMission(true);
    } else {
      S.phase = "build";
      S.interT = 18;
    }
  }

  /* ================= enemies ================= */
  function spawnEnemy(type) {
    var def = D.ENEMIES[type];
    var e = {
      type: type, def: def,
      hp: def.hp * hpMul(), maxHp: def.hp * hpMul(),
      x: S.spawnPos.x, y: S.spawnPos.y,
      wp: 1, slow: 0, slowT: 0, stunT: 0,
      burn: null, armor: def.armor || 0,
      flying: !!def.flying, boss: !!def.boss,
      wob: Math.random() * 7,
      dead: false
    };
    if (e.flying) { e.fx = S.spawnPos.x; e.fy = S.spawnPos.y; }
    S.enemies.push(e);
    if (e.boss) { S.boss = e; }
  }
  function leakDamage(e) {
    S.petals -= e.def.dmg;
    S.shake = Math.min(1, S.fx * 1.2);
    api.audio.sfx("hurt");
    api.hud.toast("💔 The Heartbloom is wounded! (−" + e.def.dmg + ")", "error", 1400);
    burst(S.exitPos.x, S.exitPos.y, "#ff5d73", 16);
    if (S.petals <= 0) {
      S.petals = 0;
      finishMission(false);
    }
  }
  function killEnemy(e, i) {
    e.dead = true;
    S.enemies.splice(i, 1);
    var reward = Math.round(e.def.reward * rewardMul());
    S.leaves += reward;
    floatText(e.x, e.y - 12, "+" + reward + "🍃", "#b8e8b0");
    burst(e.x, e.y, e.def.color, e.boss ? 40 : 12);
    api.audio.sfx(e.boss ? "boom" : "pop");
    if (e.def.brood) {
      for (var b = 0; b < e.def.brood; b++) {
        spawnAt("mite", e.x + U.rand(-20, 20), e.y + U.rand(-20, 20));
      }
    }
    if (S.boss === e) S.boss = S.enemies.find(function (en) { return en.boss; }) || null;
  }
  function spawnAt(type, x, y) {
    var def = D.ENEMIES[type];
    var e = {
      type: type, def: def,
      hp: def.hp * hpMul() * 0.8, maxHp: def.hp * hpMul() * 0.8,
      x: x, y: y, wp: nearestWp(x, y),
      slow: 0, slowT: 0, stunT: 0, burn: null,
      armor: def.armor || 0, flying: !!def.flying, boss: false,
      wob: Math.random() * 7, dead: false
    };
    S.enemies.push(e);
  }
  function nearestWp(x, y) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < S.waypoints.length; i++) {
      var d = U.dist(x, y, S.waypoints[i].x, S.waypoints[i].y);
      if (d < bd) { bd = d; best = i; }
    }
    return Math.max(1, best);
  }

  function updateEnemies(dt) {
    for (var i = S.enemies.length - 1; i >= 0; i--) {
      var e = S.enemies[i];
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.burn) {
        e.burn.t -= dt;
        e.hp -= e.burn.dps * dt;
        if (e.burn.t <= 0) e.burn = null;
        if (S.fx > 0.3 && Math.random() < dt * 8) burst(e.x + U.rand(-6, 6), e.y, "#ff9d5c", 1);
      }
      if (e.hp <= 0) { killEnemy(e, i); continue; }
      if (e.stunT > 0) { e.stunT -= dt; continue; }
      var sp = e.def.speed * (1 - e.slow) * (e.def.final && e.hp < e.maxHp / 2 ? 1.7 : 1);
      if (e.flying) {
        var dx = S.exitPos.x - e.x, dy = S.exitPos.y - e.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 6) { S.enemies.splice(i, 1); leakDamage(e); continue; }
        e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
        e.y += Math.sin((e.wob += dt * 5)) * 8 * dt;
      } else {
        var wp = S.waypoints[e.wp];
        if (!wp) { S.enemies.splice(i, 1); leakDamage(e); continue; }
        var ddx = wp.x - e.x, ddy = wp.y - e.y;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < 4) {
          e.wp++;
          if (e.wp >= S.waypoints.length) { S.enemies.splice(i, 1); leakDamage(e); continue; }
        } else {
          e.x += ddx / dd * sp * dt;
          e.y += ddy / dd * sp * dt;
        }
      }
      // Chorister heal aura
      if (e.def.heal) {
        S.enemies.forEach(function (o) {
          if (o !== e && U.dist(o.x, o.y, e.x, e.y) < 90) {
            o.hp = Math.min(o.maxHp, o.hp + e.def.heal * dt);
          }
        });
      }
    }
  }

  /* ================= towers & shots ================= */
  function updateTowers(dt) {
    S.towers.forEach(function (tw) {
      var t = D.TOWERS[tw.id];
      var tier = t.tiers[tw.tier];
      // sunflower income
      if (tier.income) {
        tw.incomeT += dt;
        if (tw.incomeT >= tier.every) {
          tw.incomeT = 0;
          var inc = Math.round(tier.income * (perk("bloom") ? 1.25 : 1));
          S.leaves += inc;
          floatText(tw.x, tw.y - 16, "+" + inc + "🍃", "#ffd257");
          if (S.fx > 0.2) burst(tw.x, tw.y - 14, "#ffd257", 4);
        }
        return;
      }
      if (!tier.dmg) return; // pure slow wall (tier 0-1 bramble): aura handled below
      tw.cd -= dt;
      // bramble tiers with damage also act as aura
      var target = pickTarget(tw, tier.range);
      if (target) {
        var ang = Math.atan2(target.y - tw.y, target.x - tw.x);
        tw.angle = U.angleLerp(tw.angle, ang, Math.min(1, dt * 10));
        if (tw.cd <= 0) {
          tw.cd = 1 / tier.rate;
          fire(tw, tier, target);
        }
      }
    });
    // bramble slow auras
    S.towers.forEach(function (tw) {
      var tier = D.TOWERS[tw.id].tiers[tw.tier];
      if (!tier.slow) return;
      S.enemies.forEach(function (e) {
        if (e.flying) return;
        if (U.dist(e.x, e.y, tw.x, tw.y) <= tier.range) {
          e.slow = Math.max(e.slow, tier.slow);
          e.slowT = 0.5;
        }
      });
    });
    // wisplight armor shred handled in fire()
  }
  function pickTarget(tw, range) {
    var best = null, score = -1;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      var airOk = D.TOWERS[tw.id].hits.indexOf("air") >= 0;
      var groundOk = D.TOWERS[tw.id].hits.indexOf("ground") >= 0;
      if (e.flying && !airOk) continue;
      if (!e.flying && !groundOk) continue;
      var d = U.dist(e.x, e.y, tw.x, tw.y);
      if (d > range) continue;
      var distToExit = U.dist(e.x, e.y, S.exitPos.x, S.exitPos.y);
      var s = tw.target === "strong" ? e.hp
        : tw.target === "last" ? distToExit
        : -distToExit; // 'first' = closest to the Heartbloom
      if (s > score) { score = s; best = e; }
    }
    return best;
  }
  function fire(tw, tier, target) {
    api.audio.sfx(tw.id === "sapling" ? "pop" : "shoot", { vol: 0.5 });
    if (tw.id === "sapling") {
      S.shots.push({
        kind: "lob", x: tw.x, y: tw.y, sx: tw.x, sy: tw.y,
        tx: target.x, ty: target.y, t: 0, dur: 0.55,
        dmg: tier.dmg, splash: tier.splash, burn: tier.burn,
        color: "#8a5a2b"
      });
      return;
    }
    if (tw.id === "wisplight") {
      // pulse hits everything in range
      S.enemies.forEach(function (e) {
        if (U.dist(e.x, e.y, tw.x, tw.y) <= tier.range) {
          damage(e, tier.dmg, tw, tier);
        }
      });
      burst(tw.x, tw.y, "#9d7bff", 8);
      return;
    }
    S.shots.push({
      kind: "dart", x: tw.x, y: tw.y,
      target: target, speed: 420,
      dmg: tier.dmg, stun: tier.stun || 0, splash: tier.splash || 0,
      pierce: tw.id === "sprout" && tw.tier === 2 ? 2 : 0,
      hitList: [], color: tw.id === "falconer" ? "#e8d24a" : "#7dd97a"
    });
  }
  function damage(e, dmg, tw, tier) {
    var d = dmg * (perk("mastery") ? 1.1 : 1);
    if (e.def.resist && e.slowT <= 0) d *= 0.5;
    if (e.armor > 0) {
      var shred = tw && tw.id === "wisplight" && tier && tier.shred ? tier.shred : 0;
      var arm = Math.max(0, e.armor - shred);
      d = Math.max(1, d - arm);
    }
    e.hp -= d;
    e.flash = 0.08;
    if (tier && tier.stun && Math.random() < tier.stun) e.stunT = 1.1;
    if (tier && tier.burn) e.burn = { dps: tier.burn, t: 2 };
    if (e.hp <= 0 && !e.dead) {
      var i = S.enemies.indexOf(e);
      if (i >= 0) killEnemy(e, i);
    }
  }
  function updateShots(dt) {
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var s = S.shots[i];
      if (s.kind === "lob") {
        s.t += dt / s.dur;
        if (s.t >= 1) {
          // land: AoE
          S.enemies.forEach(function (e) {
            if (!e.flying && U.dist(e.x, e.y, s.tx, s.ty) <= s.splash) {
              damage(e, s.dmg, null, { burn: s.burn });
            }
          });
          burst(s.tx, s.ty, "#c98a3d", 14);
          api.audio.sfx("hit");
          S.shots.splice(i, 1);
          continue;
        }
        s.x = U.lerp(s.sx, s.tx, s.t);
        s.y = U.lerp(s.sy, s.ty, s.t) - Math.sin(s.t * Math.PI) * 46;
        continue;
      }
      // homing dart
      var tgt = s.target;
      if (tgt && S.enemies.indexOf(tgt) < 0) tgt = null;
      if (tgt) {
        var dx = tgt.x - s.x, dy = tgt.y - s.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var step = s.speed * dt;
        if (d <= step + 6) {
          hitDart(s, tgt);
          if (s.pierce > 0) {
            s.pierce--;
            s.hitList.push(tgt);
            s.target = null;
          } else {
            S.shots.splice(i, 1);
          }
          continue;
        }
        s.x += dx / d * step; s.y += dy / d * step;
      } else {
        s.x += (s.vx || 200) * dt; s.y += (s.vy || 0) * dt;
        s.life = (s.life || 0.6) - dt;
        if (s.life <= 0) S.shots.splice(i, 1);
      }
    }
  }
  function hitDart(s, e) {
    if (s.splash) {
      S.enemies.forEach(function (o) {
        if (U.dist(o.x, o.y, e.x, e.y) <= s.splash) damage(o, s.dmg, null, null);
      });
      burst(e.x, e.y, s.color, 10);
    } else {
      damage(e, s.dmg, { id: s.srcId, pierce: 1 }, { stun: s.stun });
      burst(e.x, e.y, s.color, 4);
    }
    api.audio.sfx("hit", { vol: 0.3 });
  }

  /* ================= particles / floats ================= */
  function burst(x, y, color, n) {
    n = Math.round(n * (S ? S.fx : 1));
    for (var i = 0; i < n; i++) {
      S.parts.push({
        x: x, y: y, vx: U.rand(-90, 90), vy: U.rand(-160, -20),
        life: U.rand(0.3, 0.7), t: 0, color: color, size: U.rand(2, 4.5)
      });
    }
  }
  function floatText(x, y, text, color) {
    S.floats.push({ x: x, y: y, text: text, color: color, t: 0, life: 1 });
  }

  /* ================= mission end ================= */
  function finishMission(won) {
    api.setRunning(false);
    var stars = 0;
    if (won) {
      stars = 1;
      if (S.petals >= S.maxPetals) stars = 3;
      else if (S.petals >= S.maxPetals - 2) stars = 2;
    }
    var rec = save.done[S.mission] || (save.done[S.mission] = { stars: 0 });
    rec.stars = Math.max(rec.stars, stars);
    api.save.save();
    syncAggregates();
    api.audio.sfx(won ? "win" : "fail");
    var nextExists = S.mission + 1 < D.MISSIONS.length;
    var unlocked = nextExists && (save.done[S.mission + 1] || save.done[S.mission]);
    api.screens.open({
      title: won ? "🌺 The Heartbloom endures!" : "The Heartbloom has fallen…",
      subtitle: D.MISSIONS[S.mission].name,
      label: "Mission result",
      bodyHTML:
        '<div class="stat-line"><span>Waves held</span><b>' + (won ? S.def.waves.length : S.wave) + " / " + S.def.waves.length + "</b></div>" +
        '<div class="stat-line"><span>Petals remaining</span><b>' + S.petals + " / " + S.maxPetals + "</b></div>" +
        '<div class="stat-line"><span>Leaves banked</span><b>' + Math.floor(S.leaves) + "</b></div>" +
        '<div class="stars" style="font-size:1.7rem;margin-top:10px">' + starStr(stars) + "</div>" +
        (won ? '<p class="tips">Stars buy permanent perks in the Requisition tent.</p>' : '<p class="tips">Tip: ' + S.def.tip + "</p>"),
      buttons: [
        nextExists && won
          ? { label: "Next mission ▶", cls: "", onClick: function () { startMission(S.mission + 1); }, focus: true }
          : { label: "Mission map", cls: "", onClick: showMissionSelect, focus: true },
        { label: won ? "Replay for stars" : "Try again", onClick: function () { startMission(S.mission); } },
        { label: "Requisition", onClick: showRequisition, small: true },
        { label: "Title screen", onClick: showTitle, small: true }
      ]
    });
  }
  function starStr(n) {
    var s = "";
    for (var i = 1; i <= 3; i++) s += i <= n ? "★" : '<span class="off">★</span>';
    return s;
  }

  /* ================= screens ================= */
  function showTitle() {
    api.setRunning(false);
    api.audio.ambience("garden");
    var done = Object.keys(save.done).length;
    api.screens.open({
      title: "🌺 Thornward",
      subtitle: "The garden holds as long as you do",
      label: "Thornward title screen",
      bodyHTML:
        '<div class="stat-line"><span>Missions held</span><b>' + done + " / " + D.MISSIONS.length + "</b></div>" +
        '<div class="stat-line"><span>Stars earned</span><b>' + starsOwned() + "</b></div>" +
        '<p class="tips">The Blight sends waves along the old roads. Plant thorn-tenders, hold every wave, and spend stars on permanent Requisition perks between missions.</p>',
      buttons: [
        { label: done ? "Continue campaign ▶" : "Begin the defense ▶", cls: "", onClick: showMissionSelect, focus: true },
        { label: "Requisition (perks)", onClick: showRequisition },
        { label: "How to play", onClick: showHelp, small: true },
        { label: "Settings", onClick: function () { showSettings(showTitle); }, small: true }
      ]
    });
  }
  function showMissionSelect() {
    api.setRunning(false);
    var html = "";
    D.GROVES.forEach(function (g, gi) {
      html += '<div class="small" style="margin:10px 0 4px;font-weight:700;color:' + g.tint + '">Grove ' + (gi + 1) + " · " + g.name + "</div>";
      D.MISSIONS.forEach(function (m, mi) {
        if (m.grove !== gi) return;
        var rec = save.done[mi];
        var prevDone = mi === 0 || save.done[mi - 1];
        var locked = !prevDone && !(mi > 0 && save.done[mi - 1]);
        html += '<div class="mission-item' + (locked ? " locked" : "") + '" data-mi="' + mi + '" role="button" tabindex="0">' +
          '<div class="mi-icon">' + (locked ? "🔒" : rec ? "🌺" : "🌱") + "</div>" +
          '<div class="mi-body"><b>Mission ' + (mi + 1) + " · " + m.name + "</b><span>" +
          m.waves.length + " waves · " + D.MAPS[m.map].length + "×" + D.MAPS[m.map][0].length + " field</span></div>" +
          '<div class="mi-stars">' + (locked ? "" : rec ? starStr(rec.stars) : '<span class="off">★★★</span>') + "</div></div>";
      });
    });
    api.screens.open({
      title: "Campaign map",
      subtitle: "Finish a mission to open the next",
      label: "Mission select",
      bodyHTML: '<div class="mission-list">' + html + "</div>",
      buttons: [
        { label: "◀ Title", onClick: showTitle, small: true },
        { label: "Requisition", onClick: showRequisition, small: true }
      ]
    });
    var body = api.screens.layer.querySelector(".screen-card .sc-body");
    body.addEventListener("click", function (e) {
      var it = e.target.closest("[data-mi]");
      if (!it || it.classList.contains("locked")) {
        if (it) api.audio.sfx("hurt");
        return;
      }
      startMission(parseInt(it.getAttribute("data-mi"), 10));
    });
  }
  function showRequisition() {
    api.setRunning(false);
    var owned = starsOwned();
    var rows = D.PERKS.map(function (p) {
      var has = perk(p.id);
      var afford = owned >= p.cost;
      return '<div class="mission-item' + (has ? "" : afford ? "" : " locked") + '" data-perk="' + p.id + '" role="button" tabindex="0">' +
        '<div class="mi-icon">' + (has ? "✅" : "⭐") + "</div>" +
        '<div class="mi-body"><b>' + p.name + "</b><span>" + p.desc + "</span></div>" +
        '<div class="mi-stars">' + (has ? "owned" : p.cost + "★") + "</div></div>";
    }).join("");
    api.screens.open({
      title: "Requisition tent",
      subtitle: "You hold " + owned + " stars — spend them on permanent upgrades",
      label: "Requisition",
      bodyHTML: '<div class="mission-list">' + rows + "</div>",
      buttons: [{ label: "◀ Back", onClick: showTitle, small: true }]
    });
    var body = api.screens.layer.querySelector(".screen-card .sc-body");
    body.addEventListener("click", function (e) {
      var it = e.target.closest("[data-perk]");
      if (!it) return;
      var p = D.PERKS.find(function (x) { return x.id === it.getAttribute("data-perk"); });
      if (perk(p.id)) return;
      if (owned < p.cost) { api.audio.sfx("hurt"); api.hud.toast("Not enough stars yet", "error", 1200); return; }
      save.perks[p.id] = true;
      api.save.save();
      api.audio.sfx("win");
      api.hud.toast("Perk unlocked: " + p.name, null, 1600);
      showRequisition();
    });
  }
  function showHelp() {
    api.screens.open({
      title: "How to play",
      subtitle: "Field manual for the Thornward",
      label: "How to play",
      bodyHTML:
        '<div class="stat-line"><span>Plant towers</span><b>pick a card, click grass</b></div>' +
        '<div class="stat-line"><span>Upgrade / sell</span><b>click a placed tower</b></div>' +
        '<div class="stat-line"><span>Early waves</span><b>bonus leaves (Space)</b></div>' +
        '<div class="stat-line"><span>🌸 Sporewings</span><b>fly — use Falconer Nests</b></div>' +
        '<div class="stat-line"><span>🛡 Shellbacks</span><b>armor — Wisplight sheds it</b></div>' +
        '<div class="stat-line"><span>👻 Shades</span><b>slow them or they resist</b></div>' +
        '<div class="stat-line"><span>🎶 Choristers</span><b>heal nearby blights — kill first</b></div>' +
        '<p class="tips">Stars: 3★ flawless, 2★ ≤2 petals lost, 1★ survive. Sunflower Banks print leaves — economy wins long missions.</p>',
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
      subtitle: D.MISSIONS[S.mission].name,
      label: "Pause menu",
      bodyHTML:
        '<div class="stat-line"><span>Wave</span><b>' + (S.wave + 1) + " / " + S.def.waves.length + "</b></div>" +
        '<div class="stat-line"><span>Leaves</span><b>' + Math.floor(S.leaves) + "</b></div>" +
        '<div class="stat-line"><span>Petals</span><b>' + S.petals + " / " + S.maxPetals + "</b></div>",
      buttons: [
        { label: "Resume", cls: "", onClick: resume, focus: true },
        { label: "Restart mission", onClick: function () { startMission(S.mission); } },
        { label: "Settings", onClick: function () { showSettings(openPause); }, small: true },
        { label: "Quit to title", cls: "danger", onClick: function () {
            document.getElementById("twBar") && document.getElementById("twBar").remove();
            showTitle();
          }, small: true }
      ]
    });
  }
  function resume() {
    api.screens.close();
    api.setRunning(true);
  }

  /* ================= QA autoplay ================= */
  function qaTick(dt) {
    if (!qa.autoplay) return;
    S.autoplayT -= dt;
    if (S.autoplayT > 0) return;
    S.autoplayT = 1.2;
    // call waves early only once a few towers are actually defending
    if (S.phase === "build" && S.interT < 12 && S.towers.length >= 3) { callWave(); return; }
    // upgrade cheapest tower sometimes
    var up = S.towers.filter(function (t) { return t.tier < 2; })
      .sort(function (a, b) { return towerCost(a.id, a.tier + 1) - towerCost(b.id, b.tier + 1); })[0];
    if (up && S.leaves > towerCost(up.id, up.tier + 1) * 2.2) { upgradeTower(up); return; }
    // build: prefer falconer when flyers in remaining waves, else rotate towers
    var flyers = S.def.waves.slice(S.wave).some(function (wv) {
      return wv.some(function (g) { return D.ENEMIES[g[0]].flying; });
    });
    var falconers = S.towers.filter(function (t) { return t.id === "falconer"; }).length;
    var order = flyers && falconers < 2 ? ["falconer"] : ["sprout", "nettle", "bramble", "sapling", "sprout", "sentinel", "sunflower", "wisplight"];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (S.leaves >= towerCost(id, 0)) {
        var spot = bestSpot(id);
        if (spot) {
          S.placing = id;
          tryPlace(spot.c, spot.r);
          return;
        }
      }
    }
  }
  function bestSpot(id) {
    var range = D.TOWERS[id].tiers[0].range || 110;
    var best = null, bestScore = -1;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!canBuildAt(c, r)) continue;
        var p = tileCenter(c, r);
        var score = 0;
        S.waypoints.forEach(function (wp) {
          var d = U.dist(p.x, p.y, wp.x, wp.y);
          if (d < Math.min(range + TILE * 0.5, 150)) score += 1;
        });
        if (id === "sunflower") score = 1; // anywhere
        if (score > bestScore) { bestScore = score; best = { c: c, r: r }; }
      }
    }
    return best;
  }

  /* ================= update ================= */
  function update(a, rawDt) {
    S.t += rawDt;
    var dt = Math.min(rawDt, 0.05) * (qa.turbo > 1 ? qa.turbo : S.speed);
    if (S.phase === "build") {
      S.interT -= dt;
      if (S.interT <= 0) beginWave();
    }
    if (S.phase === "wave") {
      S.waveT += dt;
      while (S.queue.length && S.queue[0].t <= S.waveT) {
        spawnEnemy(S.queue.shift().type);
      }
      if (!S.queue.length && !S.enemies.length && S.phase === "wave") endWave();
    }
    updateEnemies(dt);
    updateTowers(dt);
    updateShots(dt);
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt;
      if (p.t > p.life) S.parts.splice(i, 1);
    }
    for (var j = S.floats.length - 1; j >= 0; j--) {
      var f = S.floats[j];
      f.t += dt; f.y -= dt * 26;
      if (f.t > f.life) S.floats.splice(j, 1);
    }
    S.shake = Math.max(0, S.shake - dt * 2);
    qaTick(dt);
    // keyboard shortcuts
    if (a.input.consume("Space")) callWave();
    for (var k = 1; k <= 8; k++) {
      if (a.input.consume("Digit" + k)) togglePlace(D.TOWER_ORDER[k - 1]);
    }
    updateHud();
    refreshBar();
  }

  /* ================= render ================= */
  function drawTower(x, tw) {
    var t = D.TOWERS[tw.id];
    var tier = t.tiers[tw.tier];
    var r = TILE * 0.36;
    x.save();
    x.translate(tw.x, tw.y);
    // base pad
    x.fillStyle = "rgba(0,0,0,0.28)";
    x.beginPath(); x.ellipse(0, r * 0.7, r * 0.9, r * 0.32, 0, 0, 7); x.fill();
    var pulse = 1 + Math.sin(S.t * 3 + tw.x) * 0.04;
    if (tw.id === "sprout") {
      x.strokeStyle = "#4a8a3a"; x.lineWidth = 4;
      x.beginPath(); x.moveTo(0, r * 0.6); x.lineTo(0, -r * 0.2); x.stroke();
      var g = x.createRadialGradient(-r * 0.2, -r * 0.5, 2, 0, -r * 0.4, r * 0.7);
      g.addColorStop(0, "#9fe87a"); g.addColorStop(1, "#4a9a3a");
      x.fillStyle = g;
      x.beginPath(); x.arc(0, -r * 0.4, r * 0.5 * pulse, 0, 7); x.fill();
      // barrel angle indicator
      x.strokeStyle = "#2e5a22"; x.lineWidth = 3.4;
      x.beginPath(); x.moveTo(0, -r * 0.4);
      x.lineTo(Math.cos(tw.angle) * r * 0.9, -r * 0.4 + Math.sin(tw.angle) * r * 0.9);
      x.stroke();
    } else if (tw.id === "bramble") {
      x.fillStyle = "#3a6a42";
      for (var i = 0; i < 5; i++) {
        var a = i / 5 * 7;
        x.beginPath();
        x.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        x.lineTo(Math.cos(a + 0.18) * r * 1.05, Math.sin(a + 0.18) * r * 1.05);
        x.lineTo(Math.cos(a - 0.18) * r * 1.05, Math.sin(a - 0.18) * r * 1.05);
        x.closePath(); x.fill();
      }
      x.fillStyle = "#6adf7a";
      x.beginPath(); x.arc(0, 0, r * 0.4 * pulse, 0, 7); x.fill();
    } else if (tw.id === "nettle") {
      var ng = x.createLinearGradient(0, -r, 0, r * 0.6);
      ng.addColorStop(0, "#b0e87a"); ng.addColorStop(1, "#4a7a3a");
      x.fillStyle = ng;
      x.beginPath();
      x.ellipse(Math.cos(tw.angle) * r * 0.3, Math.sin(tw.angle) * r * 0.3 - r * 0.2, r * 0.55, r * 0.8, tw.angle, 0, 7);
      x.fill();
      x.fillStyle = "#2e5a22";
      x.beginPath(); x.ellipse(0, r * 0.4, r * 0.6, r * 0.25, 0, 0, 7); x.fill();
    } else if (tw.id === "sapling") {
      x.fillStyle = "#5a3a1e";
      x.beginPath(); x.arc(0, r * 0.15, r * 0.62, 0, 7); x.fill();
      x.fillStyle = "#c98a3d";
      x.beginPath(); x.arc(0, -r * 0.35, r * 0.42 * pulse, 0, 7); x.fill();
      x.fillStyle = "#8a4a1e";
      x.beginPath(); x.arc(0, -r * 0.35, r * 0.22, 0, 7); x.fill();
    } else if (tw.id === "sunflower") {
      x.strokeStyle = "#4a8a3a"; x.lineWidth = 4;
      x.beginPath(); x.moveTo(0, r * 0.6); x.lineTo(0, -r * 0.1); x.stroke();
      x.fillStyle = "#e8a020";
      for (var pi = 0; pi < 8; pi++) {
        var pa = pi / 8 * Math.PI * 2 + S.t * 0.6;
        x.beginPath();
        x.ellipse(Math.cos(pa) * r * 0.5, -r * 0.3 + Math.sin(pa) * r * 0.5, r * 0.28, r * 0.16, pa, 0, 7);
        x.fill();
      }
      x.fillStyle = "#ffd257";
      x.beginPath(); x.arc(0, -r * 0.3, r * 0.3 * pulse, 0, 7); x.fill();
    } else if (tw.id === "falconer") {
      x.fillStyle = "#6a4a2a";
      x.beginPath(); x.ellipse(0, r * 0.3, r * 0.7, r * 0.4, 0, 0, 7); x.fill();
      var flap = Math.sin(S.t * 9) * 0.5;
      x.fillStyle = "#e8d24a";
      x.beginPath(); x.ellipse(-r * 0.2, -r * 0.35, r * 0.5, r * 0.3, flap, 0, 7); x.fill();
      x.beginPath(); x.ellipse(r * 0.35, -r * 0.35, r * 0.4, r * 0.25, -flap, 0, 7); x.fill();
      x.fillStyle = "#3a2a10";
      x.beginPath(); x.arc(0, -r * 0.5, r * 0.16, 0, 7); x.fill();
    } else if (tw.id === "sentinel") {
      var sg = x.createLinearGradient(0, -r, 0, r);
      sg.addColorStop(0, "#a9b4cc"); sg.addColorStop(1, "#525c72");
      x.fillStyle = sg;
      U.roundRect(x, x, -r * 0.55, -r * 0.85, r * 1.1, r * 1.5, 5);
      x.fill();
      x.fillStyle = "#ffd257";
      x.fillRect(-r * 0.32, -r * 0.5, r * 0.2, r * 0.14);
      x.fillRect(r * 0.12, -r * 0.5, r * 0.2, r * 0.14);
      x.fillStyle = "rgba(255,255,255,0.25)";
      x.fillRect(-r * 0.4, -r * 0.8, r * 0.8, r * 0.12);
    } else if (tw.id === "wisplight") {
      x.strokeStyle = "#5a4a7a"; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-r * 0.5, -r * 0.6); x.lineTo(r * 0.5, -r * 0.6); x.lineTo(0, r * 0.6); x.closePath(); x.stroke();
      var wg = x.createRadialGradient(0, 0, 2, 0, 0, r * 0.55 * pulse);
      wg.addColorStop(0, "rgba(200,180,255,0.95)");
      wg.addColorStop(1, "rgba(157,123,255,0)");
      x.fillStyle = wg;
      x.beginPath(); x.arc(0, 0, r * 0.55 * pulse, 0, 7); x.fill();
    }
    // tier pips
    for (var tp = 0; tp <= tw.tier; tp++) {
      x.fillStyle = "#ffd257";
      x.beginPath(); x.arc(-8 + tp * 8, r * 0.95, 2.6, 0, 7); x.fill();
    }
    x.restore();
    // selected ring
    if (S.selectedTower === tw) {
      x.strokeStyle = "#3ddad7";
      x.lineWidth = 2;
      x.setLineDash([5, 4]);
      x.beginPath(); x.arc(tw.x, tw.y, (tier.range || TILE), 0, 7); x.stroke();
      x.setLineDash([]);
    }
  }
  function drawEnemy(x, e) {
    var d = e.def;
    var r = e.boss ? TILE * 0.52 : TILE * 0.32;
    x.save();
    x.translate(e.x, e.y);
    if (e.flash > 0) { e.flash -= 0.016; }
    // shadow
    x.fillStyle = "rgba(0,0,0,0.3)";
    x.beginPath(); x.ellipse(0, r * 0.8, r * 0.8, r * 0.3, 0, 0, 7); x.fill();
    if (e.flying) x.translate(0, -6 + Math.sin(e.wob * 2) * 3);
    var bodyColor = e.flash > 0 ? "#ffffff" : d.color;
    if (e.type === "shade") x.globalAlpha = 0.75;
    // body
    var g = x.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, e.flash > 0 ? "#fff" : lighten(d.color));
    g.addColorStop(1, bodyColor);
    x.fillStyle = g;
    if (e.type === "sporewing") {
      var flap = Math.sin(e.wob * 14) * 0.6;
      x.fillStyle = "rgba(210,180,240,0.7)";
      x.beginPath(); x.ellipse(-r * 0.9, 0, r * 0.7, r * 0.4, flap, 0, 7); x.fill();
      x.beginPath(); x.ellipse(r * 0.9, 0, r * 0.7, r * 0.4, -flap, 0, 7); x.fill();
      x.fillStyle = g;
    }
    x.beginPath();
    if (e.boss) {
      // spiky boss blob
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        var rr = i % 2 ? r : r * 0.82;
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath();
    } else {
      x.arc(0, 0, r, 0, 7);
    }
    x.fill();
    x.globalAlpha = 1;
    // features
    x.fillStyle = "#140a20";
    x.beginPath(); x.arc(-r * 0.28, -r * 0.15, r * 0.14, 0, 7); x.fill();
    x.beginPath(); x.arc(r * 0.28, -r * 0.15, r * 0.14, 0, 7); x.fill();
    if (d.armor) {
      x.strokeStyle = "#c8d2e8"; x.lineWidth = 3;
      x.beginPath(); x.arc(0, 0, r * 0.72, -2.6, -0.5); x.stroke();
    }
    if (d.heal) {
      x.strokeStyle = "rgba(120,240,220,0.8)"; x.lineWidth = 2;
      x.beginPath(); x.arc(0, 0, r * 0.95 + Math.sin(S.t * 4) * 2, 0, 7); x.stroke();
    }
    if (d.resist) {
      x.fillStyle = "rgba(30,26,50,0.6)";
      x.beginPath(); x.arc(0, 0, r * 1.05, 0, 7); x.fill();
    }
    if (e.stunT > 0) {
      x.fillStyle = "#ffd257";
      x.font = "bold 10px sans-serif";
      x.fillText("✦", -r * 0.3, -r * 1.1);
    }
    if (e.slowT > 0) {
      x.strokeStyle = "rgba(120,200,255,0.7)";
      x.lineWidth = 2;
      x.beginPath(); x.arc(0, 0, r * 1.15, 0, 7); x.stroke();
    }
    // hp bar
    if (e.hp < e.maxHp) {
      var bw = r * 2;
      x.fillStyle = "rgba(10,14,25,0.75)";
      x.fillRect(-bw / 2, -r * 1.5, bw, 4.5);
      x.fillStyle = e.boss ? "#ff5d73" : "#7dd97a";
      x.fillRect(-bw / 2, -r * 1.5, bw * Math.max(0, e.hp / e.maxHp), 4.5);
    }
    x.restore();
  }
  function lighten(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgb(" + Math.min(255, r + 60) + "," + Math.min(255, g + 60) + "," + Math.min(255, b + 60) + ")";
  }
  function drawHeartbloom(x) {
    var p = S.exitPos;
    var pulse = 1 + Math.sin(S.t * 2.4) * 0.06;
    var petalsLeft = Math.max(0, S.petals);
    x.save();
    x.translate(p.x, p.y);
    x.fillStyle = "rgba(0,0,0,0.3)";
    x.beginPath(); x.ellipse(0, TILE * 0.34, TILE * 0.42, TILE * 0.14, 0, 0, 7); x.fill();
    // stem
    x.strokeStyle = "#3a7a3a"; x.lineWidth = 4;
    x.beginPath(); x.moveTo(0, TILE * 0.3); x.quadraticCurveTo(4, 0, 0, -TILE * 0.1); x.stroke();
    // petals = life
    for (var i = 0; i < S.maxPetals; i++) {
      var a = i / S.maxPetals * Math.PI * 2 + S.t * 0.3;
      var alive = i < petalsLeft;
      x.fillStyle = alive ? "#e8517c" : "rgba(120,60,80,0.3)";
      x.beginPath();
      x.ellipse(Math.cos(a) * TILE * 0.3, -TILE * 0.12 + Math.sin(a) * TILE * 0.3, TILE * 0.11, TILE * 0.06 * pulse, a, 0, 7);
      x.fill();
    }
    var cg = x.createRadialGradient(-2, -TILE * 0.12, 2, 0, -TILE * 0.12, TILE * 0.2);
    cg.addColorStop(0, "#ffe27a"); cg.addColorStop(1, "#e8a020");
    x.fillStyle = cg;
    x.beginPath(); x.arc(0, -TILE * 0.12, TILE * 0.17 * pulse, 0, 7); x.fill();
    x.restore();
  }

  function render(a) {
    var x = a.ctx;
    var w = a.w, h = a.h;
    x.save();
    if (S.shake > 0) x.translate(U.rand(-5, 5) * S.shake, U.rand(-5, 5) * S.shake);
    if (mapCanvas) x.drawImage(mapCanvas, 0, 0);

    // slow auras under everything
    S.towers.forEach(function (tw) {
      var tier = D.TOWERS[tw.id].tiers[tw.tier];
      if (!tier.slow) return;
      var g = x.createRadialGradient(tw.x, tw.y, 4, tw.x, tw.y, tier.range);
      g.addColorStop(0, "rgba(120,220,130,0.14)");
      g.addColorStop(1, "rgba(120,220,130,0)");
      x.fillStyle = g;
      x.beginPath(); x.arc(tw.x, tw.y, tier.range, 0, 7); x.fill();
    });

    // placement ghost
    if (S.placing && a.input.pointer.active) {
      var t = tileAt(a.input.pointer.x, a.input.pointer.y);
      if (t) {
        var ok = canBuildAt(t.c, t.r) && S.leaves >= towerCost(S.placing, 0);
        var p = tileCenter(t.c, t.r);
        var range = D.TOWERS[S.placing].tiers[0].range || TILE;
        x.fillStyle = ok ? "rgba(87,217,138,0.25)" : "rgba(255,93,115,0.25)";
        x.beginPath(); x.arc(p.x, p.y, TILE * 0.42, 0, 7); x.fill();
        x.strokeStyle = ok ? "#57d98a" : "#ff5d73";
        x.lineWidth = 1.6;
        x.setLineDash([6, 4]);
        x.beginPath(); x.arc(p.x, p.y, range, 0, 7); x.stroke();
        x.setLineDash([]);
      }
    }

    drawHeartbloom(x);
    S.towers.forEach(function (tw) { drawTower(x, tw); });
    // shots under enemies? draw darts above
    S.enemies.forEach(function (e) { drawEnemy(x, e); });
    S.shots.forEach(function (s) {
      x.fillStyle = s.color;
      if (s.kind === "lob") {
        x.beginPath(); x.arc(s.x, s.y, 5, 0, 7); x.fill();
      } else {
        x.save();
        x.translate(s.x, s.y);
        x.beginPath(); x.arc(0, 0, 3.4, 0, 7); x.fill();
        x.strokeStyle = "rgba(255,255,255,0.5)";
        x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(0, 0);
        var t2 = s.target;
        var ang = t2 ? Math.atan2(t2.y - s.y, t2.x - s.x) : 0;
        x.lineTo(-Math.cos(ang) * 8, -Math.sin(ang) * 8);
        x.stroke();
        x.restore();
      }
    });
    // particles
    S.parts.forEach(function (p) {
      x.globalAlpha = Math.max(0, 1 - p.t / p.life);
      x.fillStyle = p.color;
      x.beginPath(); x.arc(p.x, p.y, p.size, 0, 7); x.fill();
    });
    x.globalAlpha = 1;
    // floats
    x.font = "bold 13px 'Trebuchet MS', sans-serif";
    x.textAlign = "center";
    S.floats.forEach(function (f) {
      x.globalAlpha = Math.max(0, 1 - f.t / f.life);
      x.fillStyle = "rgba(8,12,20,0.7)";
      x.fillText(f.text, f.x + 1, f.y + 1);
      x.fillStyle = f.color;
      x.fillText(f.text, f.x, f.y);
    });
    x.globalAlpha = 1;
    x.textAlign = "left";
    // boss bar
    if (S.boss && S.boss.hp > 0) {
      var bw = w * 0.5, bx = (w - bw) / 2, by = 12;
      x.fillStyle = "rgba(10,14,25,0.8)";
      U.roundRect(x, x, bx, by, bw, 18, 8); x.fill();
      x.fillStyle = "#ff5d73";
      U.roundRect(x, x, bx + 2, by + 2, (bw - 4) * Math.max(0, S.boss.hp / S.boss.maxHp), 14, 6); x.fill();
      x.fillStyle = "#fff";
      x.font = "bold 11px 'Trebuchet MS', sans-serif";
      x.textAlign = "center";
      x.fillText(S.boss.def.name, bx + bw / 2, by + 13.5);
      x.textAlign = "left";
    }
    // vignette
    var vg = x.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, h * 1.05);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(4,8,18,0.4)");
    x.fillStyle = vg;
    x.fillRect(0, 0, w, h);
    x.restore();
  }

  /* ================= pointer interactions on canvas ================= */
  function onCanvasPointer(e) {
    if (!S || S.phase === "title") return;
    var p = { x: e.offsetX === undefined ? 0 : e.offsetX, y: e.offsetY };
    // offsetX is CSS px; convert to backing px
    var r = api.canvas.getBoundingClientRect();
    p.x = (e.clientX - r.left) * (api.canvas.width / r.width);
    p.y = (e.clientY - r.top) * (api.canvas.height / r.height);
    var t = tileAt(p.x, p.y);
    if (!t) return;
    if (S.placing) { tryPlace(t.c, t.r); return; }
    var tw = towerAt(t.c, t.r);
    if (tw) {
      S.selectedTower = tw;
      showTowerPanel(tw);
    } else {
      S.selectedTower = null;
      var panel = document.getElementById("twPanel");
      if (panel) panel.remove();
    }
  }
  function showTowerPanel(tw) {
    var old = document.getElementById("twPanel");
    if (old) old.remove();
    var t = D.TOWERS[tw.id];
    var tier = t.tiers[tw.tier];
    var panel = document.createElement("div");
    panel.id = "twPanel";
    panel.style.cssText = "position:absolute;top:44px;left:50%;transform:translateX(-50%);z-index:8;background:rgba(13,20,38,0.92);border:1px solid #3b4a72;border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:center;pointer-events:auto;color:#e9edfa;font-size:13px";
    var html = "<span>" + t.icon + " " + t.name + " T" + (tw.tier + 1) + "</span>";
    if (tw.tier < 2) {
      html += '<button class="btn small" id="twUp">Upgrade ' + towerCost(tw.id, tw.tier + 1) + "🍃</button>";
    }
    html += '<button class="btn small ghost" id="twTgt">Target: ' + tw.target + "</button>";
    html += '<button class="btn small danger" id="twSell">Sell +' + Math.round(tw.invested * 0.7) + "🍃</button>";
    html += '<button class="btn small ghost" id="twClose">✕</button>';
    panel.innerHTML = html;
    api.canvas.parentElement.appendChild(panel);
    var up = document.getElementById("twUp");
    if (up) up.addEventListener("click", function () { upgradeTower(tw); showTowerPanel(tw); });
    document.getElementById("twTgt").addEventListener("click", function () { cycleTarget(tw); showTowerPanel(tw); });
    document.getElementById("twSell").addEventListener("click", function () {
      sellTower(tw);
      var pn = document.getElementById("twPanel"); if (pn) pn.remove();
    });
    document.getElementById("twClose").addEventListener("click", function () {
      S.selectedTower = null;
      panel.remove();
    });
  }

  /* ================= boot ================= */
  GK.boot({
    canvas: "#game",
    gameId: "thornward",
    saveId: "thornward",
    defaults: { done: {}, perks: {} },
    on: {
      init: function (a) {
        api = a;
        save = a.save.load();
        if (!save.done) save.done = {};
        if (!save.perks) save.perks = {};
        S = a.state = { phase: "title", t: 0, fx: Math.max(0.3, a.quality.fxMul()), def: { waves: [1], name: "", tip: "" } };
        buildHud();
        a.input.setTouchVisible(false); // TD needs no joystick; keeps taps free for placement
        api.canvas.addEventListener("pointerdown", onCanvasPointer);
        api.canvas.addEventListener("pointermove", function () { /* ghost uses live pointer */ });
      },
      title: function () {
        showTitle();
      },
      update: function (a, dt) {
        if (!S.map) return; // title screen
        if (a.input.consumeBtn("pause")) openPause();
        if (a.input.consume("Escape") && S.placing) {
          S.placing = null;
          refreshBar();
        }
        update(a, dt);
      },
      render: function (a) {
        if (!S.map) {
          // animated title backdrop
          var x = a.ctx;
          var g = x.createLinearGradient(0, 0, 0, a.h);
          g.addColorStop(0, "#16281c"); g.addColorStop(1, "#0e1a12");
          x.fillStyle = g;
          x.fillRect(0, 0, a.w, a.h);
          return;
        }
        render(a);
      },
      requestPause: function () { openPause(); },
      onAutoPause: function () { openPause(); },
      resize: function () {
        if (S && S.map && mapCanvas) {
          TILE = Math.min(api.w / COLS, api.h / ROWS);
          OX = (api.w - TILE * COLS) / 2;
          OY = (api.h - TILE * ROWS) / 2;
          S.waypoints = S.map.path.map(function (t) { return tileCenter(t.c, t.r); });
          S.exitPos = tileCenter(S.map.exit.c, S.map.exit.r);
          S.spawnPos = tileCenter(S.map.spawn.c, S.map.spawn.r);
          prerenderMap();
          S.towers.forEach(function (tw) {
            var p = tileCenter(tw.c, tw.r);
            tw.x = p.x; tw.y = p.y;
          });
        }
      }
    }
  });

  window.__TW = { get state() { return S; }, get save() { return save; }, qa: qa };
})();
