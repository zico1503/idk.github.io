/* ============================================================
   Emberhollow — engine part 1: core, maps, player, enemies.
   (Part 2: combat, interactions, quests, screens, rendering.)
   QA hooks (only active with ?qa=1): Q completes the current
   objective, W warps to the next zone, T adds 100 shards.
   ============================================================ */
(function () {
  "use strict";
  var U = GK.util;
  var D = window.EHD;

  var TILE = 40;
  var api = null, S = null, save = null;
  var mapCanvas = null, lightCanvas = null, lightCtx = null;
  var qa = /qa=1/.test(location.search);

  var SOLID = { "#": 1, "T": 1, "~": 1, "r": 1, "A": 1, "B": 1 };

  /* ================= save ================= */
  function syncAggregates() {
    var done = 0;
    // main objectives completed in earlier chapters
    for (var c = 0; c < save.ch - 1 && c < D.CHAPTERS.length; c++) done += D.CHAPTERS[c].objectives.length;
    done += save.objIdx;
    // side quests
    Object.keys(save.sideState).forEach(function (k) {
      if (save.sideState[k] === "done") done++;
    });
    var blob = Atlas.profile.game("emberhollow");
    blob.missionsTotal = 20;
    blob.missionsDone = Math.min(done, 20);
    blob.starsTotal = done * 3;
    blob.completed = !!save.completed;
    Atlas.persist();
  }

  /* ================= world helpers ================= */
  function tileAt(c, r) {
    var rows = D.MAPS[S.map];
    if (r < 0 || c < 0 || r >= rows.length) return "#";
    var row = rows[r];
    var ch = row[c] || "#";
    if (ch === "#" && r === 0 && c > 0 && c < 29) return "#";
    return ch;
  }
  function solidAt(px, py) {
    var ch = tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
    if (SOLID[ch]) return true;
    // risen ferry stones
    if (S.stonesRaised) {
      var stones = D.STONES[S.map] || [];
      for (var i = 0; i < stones.length; i++) {
        if (Math.floor(px / TILE) === stones[i][0] && Math.floor(py / TILE) === stones[i][1]) return true;
      }
    }
    return false;
  }
  function circleBlocked(x, y, r) {
    var pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r], [x - r * 0.7, y - r * 0.7], [x + r * 0.7, y - r * 0.7], [x - r * 0.7, y + r * 0.7], [x + r * 0.7, y + r * 0.7]];
    for (var i = 0; i < pts.length; i++) {
      if (solidAt(pts[i][0], pts[i][1])) return true;
    }
    return false;
  }
  function moveCircle(ent, dx, dy) {
    var r = ent.r || 11;
    var nx = ent.x + dx;
    if (!circleBlocked(nx, ent.y, r)) ent.x = nx;
    var ny = ent.y + dy;
    if (!circleBlocked(ent.x, ny, r)) ent.y = ny;
  }

  /* ================= map load ================= */
  function loadMap(mapId, tx, ty, keepBoss) {
    S.map = mapId;
    var rows = D.MAPS[mapId];
    S.mw = 30 * TILE;
    S.mh = rows.length * TILE;
    S.enemies = [];
    S.minions = [];
    S.globs = [];
    S.bolts = [];
    S.parts = [];
    S.floats = [];
    if (!keepBoss) S.boss = null;

    // player position
    S.px = (tx + 0.5) * TILE;
    S.py = (ty + 0.5) * TILE;

    // doors
    S.doors = D.DOORS.filter(function (d) { return d.map === mapId; });
    // braziers
    S.braziers = D.BRAZIERS.filter(function (b) { return b.map === mapId; });
    // shrines
    S.shrines = D.SHRINES.filter(function (b) { return b.map === mapId; });
    // plates
    S.plates = D.PLATES.filter(function (b) { return b.map === mapId; });
    // pickups not yet collected
    S.pickups = D.PICKUPS.filter(function (p) {
      return p.map === mapId && !save.collected[p.id];
    });
    // ember nodes (respawning resource)
    S.nodes = D.EMBER_NODES.filter(function (n) { return n.map === mapId; }).map(function (n) {
      return { x: n.x, y: n.y, t: 0 };
    });
    // npcs
    S.npcs = D.NPCS.filter(function (n) { return n.map === mapId; });
    // spawn zones
    S.zones = D.SPAWNS.filter(function (z) { return z.map === mapId; }).map(function (z) {
      return { def: z, alive: [], respawnT: 0 };
    });
    // boss
    var curCh = D.CHAPTERS[save.ch - 1];
    var bossObj = curCh && curCh.objectives[save.objIdx];
    if (bossObj && bossObj.type === "boss") {
      var bd = D.BOSSES[bossObj.boss];
      if (bd.map === mapId && !S.boss) spawnBoss(bossObj.boss);
    }
    prerenderMap();
    var amb = { village: 0.52, fields: 0.58, forest: 0.72, marsh: 0.76, keep: 0.84, dawn: 0.55 }[mapId] || 0.6;
    S.ambient = amb;
    api.audio.ambience(mapId === "keep" || mapId === "dawn" ? "drone" : mapId === "village" ? "garden" : "cave");
    api.hud.toast("📍 " + ({ village: "Emberhollow Village", fields: "Cinder Fields", forest: "The Gloomwood", marsh: "Mirefen", keep: "Hollow Keep", dawn: "Dawnrise" }[mapId] || mapId), null, 1800);
  }

  function spawnBoss(id) {
    var b = D.BOSSES[id];
    var st = D.BOSS_STATS[id];
    S.boss = {
      id: id, name: b.name, def: st,
      x: (b.x + 0.5) * TILE, y: (b.y + 0.5) * TILE,
      hp: st.hp, maxHp: st.hp,
      t: 0, atkT: 3, sumT: 8, flash: 0,
      phase2: false, telegraph: null
    };
    api.hud.toast("☠ " + b.name + " stirs…", "error", 2400);
    api.audio.ambience("drone");
    api.audio.sfx("boom");
  }

  /* ================= prerender map ================= */
  var TILE_COLORS = {
    ".": ["#233a24", "#2a4529"],
    p: ["#5c4a30", "#6a5638"],
    s: ["#3a4256", "#454e64"],
    f: ["#233a24", "#2a4529"],
    w: ["#1f3320", "#263e26"]
  };
  function prerenderMap() {
    mapCanvas = document.createElement("canvas");
    mapCanvas.width = S.mw;
    mapCanvas.height = S.mh;
    var x = mapCanvas.getContext("2d");
    var rows = D.MAPS[S.map];
    var rnd = U.rng(hashStr(S.map));
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < 30; c++) {
        var ch = tileAt(c, r);
        var px = c * TILE, py = r * TILE;
        var n = rnd();
        var base = TILE_COLORS[ch] || TILE_COLORS["."];
        x.fillStyle = mixc(base[0], base[1], n);
        x.fillRect(px, py, TILE, TILE);
        if (ch === "#") {
          // rock wall with top highlight
          var g = x.createLinearGradient(px, py, px, py + TILE);
          g.addColorStop(0, "#3a4358"); g.addColorStop(1, "#232b3d");
          x.fillStyle = g;
          x.fillRect(px, py, TILE, TILE);
          x.fillStyle = "rgba(255,255,255,0.08)";
          x.fillRect(px, py, TILE, 5);
          x.fillStyle = "rgba(0,0,0,0.28)";
          x.fillRect(px, py + TILE - 6, TILE, 6);
        } else if (ch === "~") {
          var wg = x.createLinearGradient(px, py, px, py + TILE);
          wg.addColorStop(0, "#173038"); wg.addColorStop(1, "#0f2229");
          x.fillStyle = wg;
          x.fillRect(px, py, TILE, TILE);
          x.strokeStyle = "rgba(120,220,220,0.18)";
          x.lineWidth = 2;
          x.beginPath();
          x.moveTo(px + 6, py + TILE * 0.55);
          x.quadraticCurveTo(px + TILE * 0.5, py + TILE * 0.35, px + TILE - 6, py + TILE * 0.55);
          x.stroke();
        } else if (ch === "T") {
          x.fillStyle = "rgba(0,0,0,0.3)";
          x.beginPath(); x.ellipse(px + TILE / 2, py + TILE * 0.8, TILE * 0.3, TILE * 0.12, 0, 0, 7); x.fill();
          x.fillStyle = "#4a3a26";
          x.fillRect(px + TILE * 0.42, py + TILE * 0.4, TILE * 0.16, TILE * 0.4);
          var tg = x.createRadialGradient(px + TILE * 0.38, py + TILE * 0.3, 3, px + TILE * 0.5, py + TILE * 0.35, TILE * 0.45);
          tg.addColorStop(0, "#3f7a46"); tg.addColorStop(1, "#1d4028");
          x.fillStyle = tg;
          x.beginPath(); x.arc(px + TILE * 0.5, py + TILE * 0.32, TILE * 0.38, 0, 7); x.fill();
        } else if (ch === "r") {
          var rg = x.createLinearGradient(px, py, px, py + TILE);
          rg.addColorStop(0, "#8a94ab"); rg.addColorStop(1, "#4a5468");
          x.fillStyle = rg;
          x.beginPath();
          x.moveTo(px + 6, py + TILE - 8);
          x.lineTo(px + TILE * 0.32, py + 8);
          x.lineTo(px + TILE * 0.68, py + 4);
          x.lineTo(px + TILE - 6, py + TILE - 8);
          x.closePath(); x.fill();
        } else if (ch === "s") {
          x.strokeStyle = "rgba(255,255,255,0.05)";
          x.lineWidth = 1;
          x.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (ch === "p") {
          x.fillStyle = "rgba(0,0,0,0.15)";
          if (n > 0.5) x.fillRect(px + TILE * 0.2, py + TILE * 0.6, TILE * 0.25, 3);
        } else if (ch === "f") {
          x.fillStyle = ["#e8a0b8", "#f2d060", "#b8e0f8"][Math.floor(n * 3)];
          x.beginPath(); x.arc(px + TILE * 0.3, py + TILE * 0.4, 3, 0, 7); x.fill();
          x.beginPath(); x.arc(px + TILE * 0.7, py + TILE * 0.65, 2.6, 0, 7); x.fill();
        } else if (ch === "w") {
          x.strokeStyle = "rgba(140,190,120,0.4)";
          x.lineWidth = 1.6;
          x.beginPath();
          x.moveTo(px + TILE * 0.4, py + TILE * 0.8);
          x.lineTo(px + TILE * 0.36, py + TILE * 0.4);
          x.moveTo(px + TILE * 0.6, py + TILE * 0.75);
          x.lineTo(px + TILE * 0.66, py + TILE * 0.45);
          x.stroke();
        }
      }
    }
  }
  function hashStr(s) {
    var h = 7;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function mixc(a, b, t) {
    function hex(h) {
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    }
    var ca = hex(a), cb = hex(b);
    return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * t) + "," + Math.round(ca[1] + (cb[1] - ca[1]) * t) + "," + Math.round(ca[2] + (cb[2] - ca[2]) * t) + ")";
  }

  /* ================= player ================= */
  function newPlayer() {
    return {
      x: 0, y: 0, r: 11,
      hp: 100, maxHp: 100,
      oil: 100, maxOil: 100,
      stam: 100, maxStam: 100,
      face: 0, // radians
      atkCd: 0, atkAnim: 0,
      rollT: 0, rollDx: 0, rollDy: 0,
      hurtT: 0, comboT: 0, combo: 0
    };
  }
  function bladeDmg() { return [0, 14, 20, 28, 40][save.bladeTier]; }
  function bladeArc() { return save.bladeTier >= 4 ? 1.9 : 1.55; }
  function moveSpeed() {
    var s = 130;
    if (save.cloakTier >= 2) s *= 1.12;
    if (save.cloakTier >= 3) s *= 1.12;
    if (hasCharm("windstep")) s *= 1.1;
    return s;
  }
  function rollCost() { return save.cloakTier >= 3 ? 20 : 25; }
  function lanternRadius() {
    var cap = hasCharm("glowlarge") ? 1.4 : 1;
    var r = (56 + (S.p.oil / S.p.maxOil) * 54) * (1 + save.lanternTier * 0.12) * cap;
    return r * (1 + Math.sin(S.t * 13) * 0.02 + Math.sin(S.t * 31) * 0.012);
  }
  function throwDmg() { return [0, 16, 22, 26, 32][save.lanternTier]; }
  function hasCharm(id) { return save.charms.indexOf(id) >= 0; }
  function dmgTaken(d) {
    if (hasCharm("thornward")) d *= 0.85;
    return d;
  }

  function hurtPlayer(d, srcx, srcy) {
    var p = S.p;
    if (p.rollT > 0 || p.hurtT > 0 || S.dead) return;
    p.hp -= dmgTaken(d);
    p.hurtT = 0.5;
    S.shake = Math.min(1, S.fx * 1.3);
    S.hurtFlash = 0.25;
    api.audio.sfx("hurt");
    burst(p.x, p.y, "#ff5d73", 10);
    if (srcx !== undefined) {
      var dx = p.x - srcx, dy = p.y - srcy;
      var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      moveCircle(p, dx / d * 14, dy / d * 14);
    }
    if (p.hp <= 0) playerDeath();
  }
  function playerDeath() {
    S.dead = true;
    api.setRunning(false);
    api.audio.sfx("fail");
    if (S.boss) S.boss = null; // bosses reset on death
    api.screens.open({
      title: "The Gloam takes you…",
      subtitle: "But braziers remember their Warden",
      label: "You fell",
      bodyHTML: '<p class="tips">You will rekindle at the last brazier you lit. Bosses reset — their hunger is patient, yours should be too.</p>',
      buttons: [
        { label: "Rise again", cls: "", onClick: function () {
            S.dead = false;
            var cp = save.checkpoint;
            S.p.hp = S.p.maxHp;
            S.p.oil = S.p.maxOil;
            S.p.stam = S.p.maxStam;
            loadMap(cp.map, cp.x, cp.y);
            api.screens.close();
            api.setRunning(true);
          }, focus: true },
        { label: "Title screen", onClick: showTitle }
      ]
    });
  }

  /* ================= enemies ================= */
  function spawnZoneEnemy(z) {
    var def = D.ENEMIES[z.def.enemy];
    var zx = (z.def.x + U.rand(0, z.def.w)) * TILE;
    var zy = (z.def.y + U.rand(0, z.def.h)) * TILE;
    if (circleBlocked(zx, zy, 10)) {
      zx = (z.def.x + z.def.w / 2) * TILE;
      zy = (z.def.y + z.def.h / 2) * TILE;
    }
    z.alive.push({
      def: def, type: z.def.enemy,
      x: zx, y: zy, r: def.r,
      hp: def.hp, maxHp: def.hp,
      wob: Math.random() * 7,
      atkCd: 0, windup: 0, flash: 0,
      lungeT: 0, lungeDx: 0, lungeDy: 0, lungeCd: U.rand(2, 4),
      homeX: zx, homeY: zy
    });
  }
  function updateEnemies(dt) {
    S.zones.forEach(function (z) {
      // clean dead
      z.alive = z.alive.filter(function (e) { return e.hp > 0; });
      if (z.alive.length < z.def.max) {
        z.respawnT -= dt;
        if (z.respawnT <= 0) {
          spawnZoneEnemy(z);
          z.respawnT = z.def.respawn;
        }
      }
    });
    var p = S.p;
    S.enemies = [];
    S.zones.forEach(function (z) {
      z.alive.forEach(function (e) { S.enemies.push(e); });
    });
    // boss-summoned minions persist in their own list
    S.minions = (S.minions || []).filter(function (e) { return e.hp > 0; });
    S.minions.forEach(function (e) { S.enemies.push(e); });
    for (var i = S.enemies.length - 1; i >= 0; i--) {
      var e = S.enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      e.atkCd = Math.max(0, e.atkCd - dt);
      var dist = U.dist(e.x, e.y, p.x, p.y);
      var aggro = dist < e.def.aggro && !S.dead;
      if (e.def.ranged) {
        // keep distance and shoot
        var want = aggro && dist > 130 ? 1 : dist < 90 ? -1 : 0;
        if (want !== 0 && e.windup <= 0) {
          var dx = (p.x - e.x) / Math.max(1, dist), dy = (p.y - e.y) / Math.max(1, dist);
          moveCircle(e, dx * e.def.speed * want * dt, dy * e.def.speed * want * dt);
        }
        if (aggro && e.windup <= 0 && dist < e.def.aggro) {
          e.windup = 0.55;
          e.shotDx = (p.x - e.x) / Math.max(1, dist);
          e.shotDy = (p.y - e.y) / Math.max(1, dist);
        }
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0 && aggro) {
            S.globs.push({ x: e.x, y: e.y, dx: e.shotDx, dy: e.shotDy, speed: 150, dmg: e.def.dmg, t: 2.4 });
            api.audio.sfx("shoot", { vol: 0.4 });
          }
        }
      } else if (e.def.lunge) {
        e.lungeCd -= dt;
        if (e.lungeT > 0) {
          e.lungeT -= dt;
          moveCircle(e, e.lungeDx * 190 * dt, e.lungeDy * 190 * dt);
        } else if (aggro && e.lungeCd <= 0 && dist < 150) {
          e.windup = 0.5;
          e.lungeCd = U.rand(2.4, 4);
        } else if (aggro && e.windup <= 0) {
          chase(e, p, dt);
        }
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) {
            e.lungeT = 0.34;
            e.lungeDx = (p.x - e.x) / Math.max(1, dist);
            e.lungeDy = (p.y - e.y) / Math.max(1, dist);
            api.audio.sfx("boost", { vol: 0.3 });
          }
        }
      } else if (aggro) {
        chase(e, p, dt);
      } else {
        // gentle wander around home
        e.wob += dt;
        moveCircle(e, Math.sin(e.wob * 0.7) * 18 * dt, Math.cos(e.wob * 0.55) * 18 * dt);
      }
      // contact damage
      if (dist < e.r + p.r + 2 && e.atkCd <= 0) {
        e.atkCd = 0.9;
        hurtPlayer(e.def.dmg, e.x, e.y);
      }
    }
  }
  function chase(e, p, dt) {
    var dx = p.x - e.x, dy = p.y - e.y;
    var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    moveCircle(e, dx / d * e.def.speed * dt, dy / d * e.def.speed * dt);
  }

  /* ================= bosses ================= */
  function updateBoss(dt) {
    var b = S.boss;
    if (!b || S.dead) return;
    var p = S.p;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    var dist = U.dist(b.x, b.y, p.x, p.y);
    var spd = b.def.speed * (b.phase2 ? 1.3 : 1);
    var rateMul = b.phase2 ? 0.7 : 1;

    if (!b.def.teleport) {
      if (dist > 40) {
        moveCircle(b, (p.x - b.x) / dist * spd * dt, (p.y - b.y) / dist * spd * dt);
      }
    } else {
      b.teleT = (b.teleT || 0) - dt;
      if (b.teleT <= 0 && dist > 80) {
        b.teleT = 6 * rateMul;
        var ang = Math.random() * 7;
        var nx = p.x + Math.cos(ang) * 90, ny = p.y + Math.sin(ang) * 90;
        if (!circleBlocked(nx, ny, b.def.r)) {
          burst(b.x, b.y, b.def.color, 16);
          b.x = nx; b.y = ny;
          burst(b.x, b.y, b.def.color, 16);
          api.audio.sfx("boost");
        }
      }
    }

    // slam attack
    if (b.def.slam) {
      b.atkT -= dt;
      if (b.atkT <= 0 && !b.telegraph) {
        b.atkT = 6 * rateMul;
        b.telegraph = { kind: "slam", x: p.x, y: p.y, t: 0.9 };
        api.audio.sfx("quest", { vol: 0.5 });
      }
    }
    // charge attack
    if (b.def.charge) {
      b.atkT -= dt;
      if (b.atkT <= 0 && !b.telegraph && dist < 260) {
        b.atkT = 7 * rateMul;
        b.telegraph = { kind: "charge", dx: (p.x - b.x) / Math.max(1, dist), dy: (p.y - b.y) / Math.max(1, dist), t: 0.8 };
        api.audio.sfx("quest", { vol: 0.5 });
      }
    }
    // volley
    if (b.def.volley) {
      b.volT = (b.volT || 8) - dt;
      if (b.volT <= 0) {
        b.volT = 8 * rateMul;
        for (var v = -1; v <= 1; v++) {
          var ang2 = Math.atan2(p.y - b.y, p.x - b.x) + v * 0.3;
          S.globs.push({ x: b.x, y: b.y, dx: Math.cos(ang2), dy: Math.sin(ang2), speed: 140, dmg: b.def.dmg * 0.6, t: 2.6, big: true });
        }
        api.audio.sfx("shoot");
      }
    }
    // summon minions
    if (b.def.summon) {
      b.sumT -= dt;
      if (b.sumT <= 0) {
        b.sumT = 15 * rateMul;
        var type = b.id === "paleward" ? "knight" : "shade";
        for (var s = 0; s < 2; s++) {
          var ang3 = Math.random() * 7;
          var sx = b.x + Math.cos(ang3) * 50, sy = b.y + Math.sin(ang3) * 50;
          if (!circleBlocked(sx, sy, 10)) {
            S.minions.push({
              def: D.ENEMIES[type], type: type,
              x: sx, y: sy, r: D.ENEMIES[type].r,
              hp: D.ENEMIES[type].hp, maxHp: D.ENEMIES[type].hp,
              wob: Math.random() * 7, atkCd: 0, windup: 0, flash: 0,
              lungeT: 0, lungeDx: 0, lungeDy: 0, lungeCd: 3,
              homeX: sx, homeY: sy
            });
          }
        }
        api.hud.toast("The " + b.name + " calls its kin!", "error", 1400);
      }
    }
    // brood
    if (b.def.brood) {
      b.broodT = (b.broodT || 10) - dt;
      if (b.broodT <= 0) {
        b.broodT = 12;
        for (var m = 0; m < b.def.brood; m++) {
          var mx2 = b.x + U.rand(-40, 40), my2 = b.y + U.rand(-40, 40);
          if (!circleBlocked(mx2, my2, 10)) {
            S.minions.push({
              def: D.ENEMIES.mite, type: "mite",
              x: mx2, y: my2, r: D.ENEMIES.mite.r,
              hp: D.ENEMIES.mite.hp, maxHp: D.ENEMIES.mite.hp,
              wob: Math.random() * 7, atkCd: 0, windup: 0, flash: 0,
              lungeT: 0, lungeDx: 0, lungeDy: 0, lungeCd: 3,
              homeX: mx2, homeY: my2
            });
          }
        }
      }
    }
    // telegraph resolution
    if (b.telegraph) {
      var tg = b.telegraph;
      tg.t -= dt;
      if (tg.kind === "charge" && tg.t > 0.25) {
        // windup drift toward player
      }
      if (tg.t <= 0) {
        if (tg.kind === "slam") {
          burst(tg.x, tg.y, "#c86ad0", 22);
          S.shake = Math.min(1, S.fx);
          api.audio.sfx("boom");
          if (U.dist(p.x, p.y, tg.x, tg.y) < 95) hurtPlayer(b.def.dmg * 1.2, tg.x, tg.y);
        } else if (tg.kind === "charge") {
          // dash along line
          b.chargeVx = tg.dx * 300; b.chargeVy = tg.dy * 300;
          b.chargeT = 0.5;
          api.audio.sfx("boost");
        }
        b.telegraph = null;
      }
    }
    if (b.chargeT > 0) {
      b.chargeT -= dt;
      moveCircle(b, b.chargeVx * dt, b.chargeVy * dt);
      if (U.dist(b.x, b.y, p.x, p.y) < b.def.r + p.r) hurtPlayer(b.def.dmg, b.x, b.y);
    }
    // contact
    if (dist < b.def.r + p.r + 2) hurtPlayer(b.def.dmg * 0.7, b.x, b.y);
    // phase 2
    if (b.def.phase2 && !b.phase2 && b.hp < b.maxHp * 0.55) {
      b.phase2 = true;
      api.hud.toast("The Umbral King sheds his crown of night!", "error", 2200);
      api.audio.sfx("boom");
      burst(b.x, b.y, "#c86ad0", 40);
    }
  }
  function hurtBoss(d) {
    var b = S.boss;
    if (!b) return;
    b.hp -= d;
    b.flash = 0.1;
    api.audio.sfx("hit");
    if (b.hp <= 0) {
      burst(b.x, b.y, b.def.color, 60);
      api.audio.sfx("win");
      S.shake = 1;
      var id = b.id;
      S.boss = null;
      completeObjective();
      Atlas.award("emberhollow-boss");
      // ch5 → ending
      var cur = D.CHAPTERS[save.ch - 1];
      if (cur && cur.objectives[save.objIdx] && save.objIdx >= cur.objectives.length) {
        // handled in completeObjective
      }
    }
  }

  /* ================= combat ================= */
  function playerAttack() {
    var p = S.p;
    if (p.atkCd > 0 || S.dead) return;
    var cd = 0.45 * (hasCharm("quickhand") ? 0.8 : 1);
    p.atkCd = cd;
    p.atkAnim = 0.18;
    api.audio.sfx("shoot", { vol: 0.5 });
    var reach = 58, arc = bladeArc();
    var hits = S.enemies.slice();
    if (S.boss) hits.push(S.boss);
    var hitAny = false;
    hits.forEach(function (e) {
      var dx = e.x - p.x, dy = e.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > reach + (e.def.r || e.r || 12)) return;
      var ang = Math.atan2(dy, dx);
      var diff = Math.abs(((ang - p.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > arc / 2) return;
      // shielders block frontal damage
      if (e.def && e.def.shield) {
        var facing = Math.abs(((Math.atan2(p.y - e.y, p.x - e.x) - (e.face || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (facing < 1.0) {
          floatText(e.x, e.y - 16, "BLOCKED", "#9ab");
          api.audio.sfx("click");
          return;
        }
      }
      hitAny = true;
      var dmg = bladeDmg();
      if (e.id) hurtBoss(dmg);
      else {
        e.hp -= dmg;
        e.flash = 0.1;
        moveCircle(e, dx / d * 10, dy / d * 10);
        burst(e.x, e.y, "#ffd257", 6);
        if (e.hp <= 0) killEnemy(e);
      }
    });
    if (hitAny) {
      p.combo++;
      p.comboT = 3;
      if (p.combo >= 5) api.audio.sfx("blip");
    }
  }
  function killEnemy(e) {
    e.hp = 0;
    burst(e.x, e.y, e.def.color, 14);
    var sh = Math.round(e.def.shard * (hasCharm("scavenger") ? 1.25 : 1));
    save.shards += sh;
    floatText(e.x, e.y - 14, "+" + sh + "◆", "#b8e0f8");
    api.audio.sfx("pop");
    S.kills[e.type] = (S.kills[e.type] || 0) + 1;
    S.objKills = S.objKills || 0;
    // kill objectives
    var cur = D.CHAPTERS[save.ch - 1];
    if (cur) {
      var obj = cur.objectives[save.objIdx];
      if (obj && obj.type === "kill" && obj.enemy === e.type) {
        S.objKills++;
        updateObjective();
      }
    }
    // side quest: cull
    if (save.sideState.cull === "offered" && e.type === "mite") {
      save.sideKills = (save.sideKills || 0) + 1;
      if (save.sideKills >= 10) completeSide("cull");
    }
    syncAggregates();
  }
  function playerThrow() {
    var p = S.p;
    if (p.atkCd > 0 || S.dead) return;
    if (p.oil < 8) { api.hud.toast("Not enough lantern oil", "error", 1000); return; }
    p.oil -= 8;
    p.atkCd = 0.5;
    p.atkAnim = 0.15;
    api.audio.sfx("blip");
    S.bolts.push({
      x: p.x + Math.cos(p.face) * 14, y: p.y + Math.sin(p.face) * 14,
      dx: Math.cos(p.face), dy: Math.sin(p.face),
      speed: 280, dmg: throwDmg(), t: 1.6,
      pierce: hasCharm("emberchain") ? 2 : 0, hitIds: []
    });
  }
  function playerRoll() {
    var p = S.p;
    if (p.rollT > 0 || S.dead) return;
    if (p.stam < rollCost()) { api.audio.sfx("click", { vol: 0.3 }); return; }
    p.stam -= rollCost();
    var stick = api.input.computeStick();
    var dx = stick.x, dy = stick.y;
    if (dx === 0 && dy === 0) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
    var d = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    p.rollT = 0.28;
    p.rollDx = dx / d; p.rollDy = dy / d;
    p.iFrames = 0.35;
    api.audio.sfx("boost", { vol: 0.25 });
    burst(p.x, p.y, "#9ab4d8", 5);
  }

  function updateProjectiles(dt) {
    var p = S.p;
    // enemy globs
    for (var i = S.globs.length - 1; i >= 0; i--) {
      var g = S.globs[i];
      g.t -= dt;
      g.x += g.dx * g.speed * dt;
      g.y += g.dy * g.speed * dt;
      if (g.t <= 0 || solidAt(g.x, g.y)) { burst(g.x, g.y, "#8a5fc0", 4); S.globs.splice(i, 1); continue; }
      if (U.dist(g.x, g.y, p.x, p.y) < p.r + 6) {
        hurtPlayer(g.dmg, g.x, g.y);
        S.globs.splice(i, 1);
      }
    }
    // player bolts
    for (var j = S.bolts.length - 1; j >= 0; j--) {
      var b = S.bolts[j];
      b.t -= dt;
      b.x += b.dx * b.speed * dt;
      b.y += b.dy * b.speed * dt;
      if (b.t <= 0 || solidAt(b.x, b.y)) { burst(b.x, b.y, "#ffb63d", 4); S.bolts.splice(j, 1); continue; }
      var targets = S.enemies.slice();
      if (S.boss) targets.push(S.boss);
      for (var k = 0; k < targets.length; k++) {
        var e = targets[k];
        if (b.hitIds.indexOf(e) >= 0) continue;
        if (U.dist(b.x, b.y, e.x, e.y) < (e.def ? e.def.r : e.r) + 8) {
          if (e.id) hurtBoss(b.dmg);
          else { e.hp -= b.dmg; e.flash = 0.1; burst(e.x, e.y, "#ffb63d", 5); if (e.hp <= 0) killEnemy(e); }
          b.hitIds.push(e);
          if (b.pierce > 0) b.pierce--;
          else { S.bolts.splice(j, 1); break; }
        }
      }
    }
  }

  /* ================= interactions ================= */
  function nearestInteract() {
    var p = S.p;
    var best = null, bd = 52;
    S.braziers.forEach(function (b) {
      var d = U.dist(p.x, p.y, (b.x + 0.5) * TILE, (b.y + 0.5) * TILE);
      if (d < bd && !save.braziersLit[b.map + ":" + b.x + ":" + b.y]) { best = { kind: "brazier", x: b.x, y: b.y }; bd = d; }
    });
    S.shrines.forEach(function (b) {
      var d = U.dist(p.x, p.y, (b.x + 0.5) * TILE, (b.y + 0.5) * TILE);
      if (d < bd + 10 && !save.shrinesLit[b.x + ":" + b.y]) { best = { kind: "shrine", x: b.x, y: b.y }; bd = d; }
    });
    S.npcs.forEach(function (n) {
      var d = U.dist(p.x, p.y, (n.x + 0.5) * TILE, (n.y + 0.5) * TILE);
      if (d < bd) { best = { kind: "npc", npc: n }; bd = d; }
    });
    return best;
  }
  function interact() {
    var it = nearestInteract();
    if (!it) return;
    if (it.kind === "brazier") {
      var key = S.map + ":" + it.x + ":" + it.y;
      save.braziersLit[key] = true;
      save.checkpoint = { map: S.map, x: it.x, y: it.y + 1 };
      S.p.hp = S.p.maxHp;
      S.p.oil = S.p.maxOil;
      S.p.stam = S.p.maxStam;
      api.audio.sfx("chime");
      burst((it.x + 0.5) * TILE, (it.y + 0.5) * TILE, "#ffb63d", 24);
      api.hud.toast("🔥 Brazier lit — health, oil and checkpoint restored", null, 2200);
      api.save.save();
      // objective
      var cur = D.CHAPTERS[save.ch - 1];
      if (cur) {
        var obj = cur.objectives[save.objIdx];
        if (obj && obj.type === "brazier") {
          S.objCount = (S.objCount || 0) + 1;
          updateObjective();
        }
      }
    } else if (it.kind === "shrine") {
      var sk = it.x + ":" + it.y;
      save.shrinesLit[sk] = true;
      api.audio.sfx("chime");
      burst((it.x + 0.5) * TILE, (it.y + 0.5) * TILE, "#9d7bff", 26);
      api.hud.toast("✦ The shrine remembers its song", null, 2000);
      var cur2 = D.CHAPTERS[save.ch - 1];
      if (cur2) {
        var obj2 = cur2.objectives[save.objIdx];
        if (obj2 && obj2.type === "shrine") {
          S.objCount = (S.objCount || 0) + 1;
          updateObjective();
        }
      }
    } else if (it.kind === "npc") {
      talkTo(it.npc);
    }
  }

  /* ================= quest logic ================= */
  function currentObjective() {
    var cur = D.CHAPTERS[save.ch - 1];
    if (!cur) return null;
    return cur.objectives[save.objIdx] || null;
  }
  function objectiveProgress() {
    var obj = currentObjective();
    if (!obj) return "";
    switch (obj.type) {
      case "brazier": return (S.objCount || 0) + "/" + obj.count;
      case "kill": return (S.objKills || 0) + "/" + obj.count;
      case "collect": {
        var n = 0;
        D.PICKUPS.forEach(function (p) {
          if (p.kind === obj.item && save.collected[p.id]) n++;
        });
        return n + "/" + obj.count;
      }
      case "shrine": return (S.objCount || 0) + "/" + obj.count;
      case "switch": return (S.platesPressed || 0) + "/" + obj.count;
      case "boss": return "hunt it down";
      case "reach": return "climb";
    }
    return "";
  }
  function updateObjective() {
    var obj = currentObjective();
    if (!obj) return;
    var done = false;
    if (obj.type === "brazier" || obj.type === "shrine") done = (S.objCount || 0) >= obj.count;
    else if (obj.type === "kill") done = (S.objKills || 0) >= obj.count;
    else if (obj.type === "switch") done = (S.platesPressed || 0) >= obj.count;
    if (done) completeObjective();
  }
  function completeObjective() {
    var cur = D.CHAPTERS[save.ch - 1];
    if (!cur) return;
    api.audio.sfx("quest");
    api.hud.toast("✔ " + (cur.objectives[save.objIdx] ? cur.objectives[save.objIdx].desc : "Objective complete"), null, 2400);
    save.objIdx++;
    S.objCount = 0;
    S.objKills = 0;
    api.save.save();
    syncAggregates();
    if (save.objIdx >= cur.objectives.length) chapterComplete();
    else {
      var next = cur.objectives[save.objIdx];
      api.hud.toast("New objective: " + next.desc, null, 2600);
      // spawn boss if next objective is the boss
      if (next.type === "boss" && D.BOSSES[next.boss].map === S.map && !S.boss) spawnBoss(next.boss);
    }
  }
  function chapterComplete() {
    var cur = D.CHAPTERS[save.ch - 1];
    save.shards += cur.reward;
    api.setRunning(false);
    var isLast = save.ch >= D.CHAPTERS.length;
    if (isLast) {
      save.completed = true;
      api.save.save();
      syncAggregates();
      api.screens.open({
        title: "🌅 Dawnrise",
        subtitle: "The Umbral King is unmade",
        label: "The valley awakens",
        bodyHTML:
          '<div class="stat-line"><span>Final blow</span><b>the Last Lantern, held high</b></div>' +
          '<div class="stat-line"><span>Shards gathered</span><b>' + save.shards + "</b></div>" +
          '<div class="stat-line"><span>Lore found</span><b>' + save.lore.length + " / 10</b></div>" +
          '<div class="stat-line"><span>Emberlings rescued</span><b>' + save.sideCounts.emberling + " / 12</b></div>" +
          '<p class="tips">The Gloam lifts like a held breath. Light pours down the switchbacks, and every brazier in Emberhollow answers it. Maren says the valley will name a holiday after you. Bram says he already made the lantern hues official. The wood hums; the marsh stones stand in daylight. Dawn is a promise — and you kept it.</p>' +
          '<p class="tips" style="color:var(--amber)">Campaign complete! Replays and side quests remain open.</p>',
        buttons: [
          { label: "Keep exploring", cls: "", onClick: function () {
              api.screens.close();
              api.setRunning(true);
            }, focus: true },
          { label: "Title screen", onClick: showTitle }
        ]
      });
      return;
    }
    // outro dialog then next chapter
    var lines = cur.outro.slice();
    lines.push("— Chapter " + save.ch + " complete · +" + cur.reward + " shards —");
    showDialog(lines, function () {
      save.ch++;
      save.objIdx = 0;
      save.seenIntro["ch" + save.ch] = false;
      api.save.save();
      syncAggregates();
      chapterIntro(save.ch);
    });
  }
  function chapterIntro(ch) {
    var cur = D.CHAPTERS[ch - 1];
    if (!cur || save.seenIntro["ch" + ch]) return;
    save.seenIntro["ch" + ch] = true;
    api.save.save();
    api.setRunning(false);
    api.screens.open({
      title: "Chapter " + ch + " · " + cur.name,
      subtitle: "The Last Lantern burns steady",
      label: "Chapter intro",
      bodyHTML:
        "<p class=\"tips\" style=\"font-size:0.95rem;line-height:1.6\">" + cur.intro.map(Atlas.esc).join("</p><p class=\"tips\" style=\"font-size:0.95rem;line-height:1.6\">") + "</p>" +
        '<div class="stat-line"><span>Objective</span><b>' + cur.objectives[0].desc + "</b></div>",
      buttons: [
        { label: "Begin chapter", cls: "", onClick: function () {
            api.screens.close();
            api.setRunning(true);
          }, focus: true }
      ]
    });
  }

  /* side quests */
  function offerSide(sq) {
    if (save.sideState[sq.id]) return false;
    save.sideState[sq.id] = "offered";
    api.save.save();
    return true;
  }
  function sideProgress(sq) {
    switch (sq.type) {
      case "kill": return (save.sideKills || 0) + "/" + sq.count;
      case "fetch": return save.collected[sq.item + ":done"] ? "1/1" : "0/1";
      case "collect": {
        var n = 0;
        D.PICKUPS.forEach(function (p) {
          if (p.kind === sq.item && save.collected[p.id]) n++;
        });
        return n + "/" + sq.count;
      }
    }
    return "";
  }
  function completeSide(id) {
    var sq = D.SIDEQUESTS.find(function (s) { return s.id === id; });
    if (!sq || save.sideState[id] === "done") return;
    save.sideState[id] = "done";
    save.shards += sq.reward;
    api.save.save();
    syncAggregates();
    api.audio.sfx("win");
    api.hud.toast("✅ Side quest complete: " + sq.name + " (+" + sq.reward + "◆)", null, 2600);
    if (id === "emberlings") {
      api.hud.toast("🌈 All lantern hues unlocked! Cycle them from the pause menu.", null, 3000);
    }
  }

  /* dialogs */
  var dialogQueue = null, dialogCb = null;
  function showDialog(lines, cb) {
    dialogQueue = lines.slice();
    dialogCb = cb || null;
    renderDialog();
  }
  function renderDialog() {
    var box = document.getElementById("ehDialog");
    if (!box) {
      box = document.createElement("div");
      box.id = "ehDialog";
      box.style.cssText = "position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:9;width:min(88%,620px);background:rgba(10,14,28,0.94);border:1px solid #4a5a8a;border-radius:12px;padding:14px 18px;color:#e9edfa;font-size:0.95rem;line-height:1.55;pointer-events:auto;cursor:pointer";
      box.setAttribute("role", "dialog");
      api.canvas.parentElement.appendChild(box);
      box.addEventListener("pointerdown", function () { advanceDialog(); });
    }
    if (!dialogQueue || !dialogQueue.length) {
      box.remove();
      var cb = dialogCb;
      dialogQueue = null; dialogCb = null;
      if (cb) cb();
      return;
    }
    box.innerHTML = dialogQueue[0] + '<div style="margin-top:8px;font-size:0.75rem;color:#8a97b8">▸ click or press E to continue</div>';
  }
  function advanceDialog() {
    if (!dialogQueue) return;
    dialogQueue.shift();
    renderDialog();
    api.audio.sfx("click", { vol: 0.4 });
  }
  function talkTo(npc) {
    var sq = D.SIDEQUESTS.find(function (s) { return s.giver === npc.id; });
    if (npc.id === "bram") { openShop(); return; }
    if (npc.id === "maren" && save.ch === 1 && save.objIdx === 0 && !save.seenIntro["ch1"]) {
      chapterIntro(1);
      return;
    }
    if (sq && !save.sideState[sq.id]) {
      showDialog(sq.offer.slice(), function () {
        offerSide(sq);
        api.hud.toast("📋 Side quest accepted: " + sq.name, null, 2200);
      });
      return;
    }
    if (sq && save.sideState[sq.id] === "offered") {
      // check completion
      if (sq.type === "kill" && (save.sideKills || 0) >= sq.count) { completeSide(sq.id); showDialog(sq.done.slice()); return; }
      if (sq.type === "fetch" && save.collected[sq.item]) {
        save.collected[sq.item + ":done"] = true;
        completeSide(sq.id);
        showDialog(sq.done.slice());
        return;
      }
      if (sq.type === "collect") {
        var n = 0;
        D.PICKUPS.forEach(function (p) { if (p.kind === sq.item && save.collected[p.id]) n++; });
        if (n >= sq.count) { completeSide(sq.id); showDialog(sq.done.slice()); return; }
      }
      showDialog(["" + npc.name + ": '" + sq.name + " — " + sideProgress(sq) + ". The valley is counting on you.'"]);
      return;
    }
    if (sq && save.sideState[sq.id] === "done") {
      showDialog(sq.done.slice());
      return;
    }
    showDialog((D.DIALOGS[npc.id + "_idle"] || ["..."]).slice());
  }

  /* shop */
  function openShop() {
    api.setRunning(false);
    var sh = D.SHOP;
    function row(label, sub, btn, canAfford, cb, owned) {
      return { label: owned ? "✔ " + label : btn + " · " + label + " (" + sub + ")", cls: canAfford && !owned ? "" : "ghost", onClick: cb, small: true };
    }
    var buttons = [];
    sh.blade.forEach(function (b) {
      if (b.tier === save.bladeTier + 1) buttons.push(row(b.name, b.cost + "◆", "Buy", save.shards >= b.cost, function () {
        save.shards -= b.cost; save.bladeTier = b.tier; api.save.save(); api.audio.sfx("win");
        api.hud.toast(b.name + " equipped!", null, 1600); openShop();
      }));
    });
    sh.lantern.forEach(function (b) {
      if (b.tier === save.lanternTier + 1) buttons.push(row(b.name, b.cost + "◆", "Buy", save.shards >= b.cost, function () {
        save.shards -= b.cost; save.lanternTier = b.tier; api.save.save(); api.audio.sfx("win");
        api.hud.toast(b.name + " fitted!", null, 1600); openShop();
      }));
    });
    sh.cloak.forEach(function (b) {
      if (b.tier === save.cloakTier + 1) buttons.push(row(b.name, b.cost + "◆", "Buy", save.shards >= b.cost, function () {
        save.shards -= b.cost; save.cloakTier = b.tier; api.save.save(); api.audio.sfx("win");
        api.hud.toast(b.name + " worn!", null, 1600); openShop();
      }));
    });
    sh.charms.forEach(function (c) {
      var owned = hasCharm(c.id);
      buttons.push(row(c.name, c.cost + "◆", owned ? "" : "Buy", save.shards >= c.cost, function () {
        save.shards -= c.cost; save.charms.push(c.id); api.save.save(); api.audio.sfx("win");
        api.hud.toast(c.name + " charm acquired!", null, 1600); openShop();
      }, owned));
    });
    buttons.push({ label: "Oil flask +40 (" + 5 + "◆)", cls: save.shards >= 5 ? "" : "ghost", small: true, onClick: function () {
      if (save.shards >= 5) { save.shards -= 5; S.p.oil = Math.min(S.p.maxOil, S.p.oil + 40); api.save.save(); api.audio.sfx("pickup"); openShop(); }
    } });
    buttons.push({ label: "◀ Leave shop", cls: "danger", small: true, onClick: function () { api.screens.close(); api.setRunning(true); } });
    api.screens.open({
      title: "Merchant Bram",
      subtitle: "You carry " + save.shards + " ◆ shards",
      label: "Shop",
      dismissible: false,
      bodyHTML: '<div class="mission-list" style="max-height:44vh">' +
        sh.blade.filter(function (b) { return b.tier === save.bladeTier + 1; }).map(function (b) { return "<div class='stat-line'><span>Blade · " + b.name + "</span><b>" + b.desc + "</b></div>"; }).join("") +
        sh.lantern.filter(function (b) { return b.tier === save.lanternTier + 1; }).map(function (b) { return "<div class='stat-line'><span>Lantern · " + b.name + "</span><b>" + b.desc + "</b></div>"; }).join("") +
        "</div><p class='tips'>Charms are permanent passives once bought. Everything saves instantly.</p>",
      buttons: buttons
    });
  }

  /* pickups */
  function updatePickups(dt) {
    var p = S.p;
    for (var i = S.pickups.length - 1; i >= 0; i--) {
      var pk = S.pickups[i];
      var px = (pk.x + 0.5) * TILE, py = (pk.y + 0.5) * TILE;
      if (U.dist(p.x, p.y, px, py) < 26) {
        save.collected[pk.id] = true;
        S.pickups.splice(i, 1);
        collectPickup(pk, px, py);
      }
    }
    // ember nodes
    S.nodes.forEach(function (n) {
      n.t = Math.max(0, n.t - dt);
      if (n.t <= 0 && U.dist(p.x, p.y, (n.x + 0.5) * TILE, (n.y + 0.5) * TILE) < 26) {
        n.t = 45;
        S.p.oil = Math.min(S.p.maxOil, S.p.oil + 30);
        var sh = 4;
        save.shards += sh;
        api.audio.sfx("pickup");
        burst((n.x + 0.5) * TILE, (n.y + 0.5) * TILE, "#ffb63d", 12);
        floatText((n.x + 0.5) * TILE, (n.y + 0.5) * TILE - 12, "+30 oil +4◆", "#ffcf6b");
        syncAggregates();
      }
    });
    // plates
    var cur = D.CHAPTERS[save.ch - 1];
    var obj = cur && cur.objectives[save.objIdx];
    S.plates.forEach(function (pl) {
      var key = pl.x + ":" + pl.y;
      if (save.platesPressed[key]) return;
      if (U.dist(p.x, p.y, (pl.x + 0.5) * TILE, (pl.y + 0.5) * TILE) < 24) {
        save.platesPressed[key] = true;
        S.platesPressed = (S.platesPressed || 0) + 1;
        api.audio.sfx("land");
        burst((pl.x + 0.5) * TILE, (pl.y + 0.5) * TILE, "#6ad0c0", 14);
        api.hud.toast("◉ A whisper plate sinks (" + S.platesPressed + "/4)", null, 1600);
        if (S.platesPressed >= 4 && !S.stonesRaised) {
          S.stonesRaised = true;
          api.audio.sfx("chime");
          api.hud.toast("🪨 The ferry stones rise from the water!", null, 2600);
          var obj2 = cur2obj();
          if (obj2 && obj2.type === "switch") updateObjective();
        }
        if (obj && obj.type === "switch") updateObjective();
      }
    });
    function cur2obj() { return cur && cur.objectives[save.objIdx]; }
    // doors
    S.doors.forEach(function (d) {
      if (U.dist(p.x, p.y, (d.x + 0.5) * TILE, (d.y + 0.5) * TILE) < 20) {
        if (d.gate > 0 && save.ch <= d.gate) {
          // gentle push back
          moveCircle(p, (p.x - (d.x + 0.5) * TILE), (p.y - (d.y + 0.5) * TILE));
          if (!S.doorToastT || S.doorToastT <= 0) {
            api.hud.toast("🔒 Sealed until Chapter " + d.gate + " is complete", "error", 1600);
            S.doorToastT = 2;
          }
        } else {
          api.audio.sfx("land");
          loadMap(d.to, d.tx, d.ty);
          var introCh = chapterForMap(d.to);
          if (introCh && save.ch >= introCh) chapterIntro(introCh);
        }
      }
    });
  }
  function chapterForMap(map) {
    // chapter that starts in this map (for auto-intro)
    var found = null;
    D.CHAPTERS.forEach(function (c) {
      if (c.zone === map && (c.zone !== "village" || c.id === 1)) found = found || c.id;
    });
    return found;
  }
  function collectPickup(pk, px, py) {
    api.audio.sfx("pickup");
    burst(px, py, "#ffd257", 12);
    switch (pk.kind) {
      case "petal":
        api.hud.toast("🌙 Moonpetal gathered", null, 1500);
        var cur = D.CHAPTERS[save.ch - 1];
        var obj = cur && cur.objectives[save.objIdx];
        if (obj && obj.type === "collect" && obj.item === "petal") {
          var n = 0;
          D.PICKUPS.forEach(function (p2) { if (p2.kind === "petal" && save.collected[p2.id]) n++; });
          api.hud.toast("🌙 Moonpetals: " + n + "/" + obj.count, null, 1800);
          if (n >= obj.count) updateObjective();
        }
        break;
      case "wisp":
        api.hud.toast("✨ Marsh wisp caught", null, 1500);
        var cur3 = D.CHAPTERS[save.ch - 1];
        var obj3 = cur3 && cur3.objectives[save.objIdx];
        if (obj3 && obj3.type === "collect" && obj3.item === "wisp") {
          var n3 = 0;
          D.PICKUPS.forEach(function (p3) { if (p3.kind === "wisp" && save.collected[p3.id]) n3++; });
          api.hud.toast("✨ Wisps: " + n3 + "/" + obj3.count, null, 1800);
          if (n3 >= obj3.count) updateObjective();
        }
        break;
      case "key":
        api.hud.toast("🗝 Dawn Gate key recovered", null, 1800);
        var cur4 = D.CHAPTERS[save.ch - 1];
        var obj4 = cur4 && cur4.objectives[save.objIdx];
        if (obj4 && obj4.type === "collect" && obj4.item === "key") {
          var n4 = 0;
          D.PICKUPS.forEach(function (p4) { if (p4.kind === "key" && save.collected[p4.id]) n4++; });
          api.hud.toast("🗝 Keys: " + n4 + "/" + obj4.count, null, 1800);
          if (n4 >= obj4.count) updateObjective();
        }
        break;
      case "emberling":
        save.sideCounts = save.sideCounts || {};
        save.sideCounts.emberling = (save.sideCounts.emberling || 0) + 1;
        api.hud.toast("🐝 Emberling rescued (" + save.sideCounts.emberling + "/12)", null, 1600);
        break;
      case "lore":
        save.lore.push(pk.id);
        api.hud.toast("📜 Lore page found — read it in the Journal", null, 2000);
        break;
      case "glowcap":
        api.hud.toast("🍄 Glowcap picked", null, 1400);
        break;
      case "ledger":
        api.hud.toast("📃 Ledger page recovered", null, 1400);
        break;
      case "relic":
        api.hud.toast("⚔ Relic blade salvaged", null, 1500);
        break;
      case "locket":
        save.collected["locket"] = true;
        api.hud.toast("💫 Maren's locket found!", null, 1800);
        break;
    }
    api.save.save();
    syncAggregates();
  }

  /* ================= objective arrow ================= */
  function objectiveTarget() {
    var cur = D.CHAPTERS[save.ch - 1];
    var obj = cur && cur.objectives[save.objIdx];
    if (!obj) return null;
    var p = S.p;
    function nearest(list, filter) {
      var best = null, bd = 1e9;
      list.forEach(function (t) {
        if (filter && !filter(t)) return;
        var d = U.dist(p.x, p.y, (t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
        if (d < bd) { bd = d; best = t; }
      });
      return best;
    }
    switch (obj.type) {
      case "brazier": {
        var b = nearest(S.braziers, function (t) { return !save.braziersLit[S.map + ":" + t.x + ":" + t.y]; });
        return b ? { x: b.x, y: b.y } : null;
      }
      case "kill": {
        var z = nearest(S.zones.map(function (z2) { return { x: z2.def.x + z2.def.w / 2, y: z2.def.y + z2.def.h / 2 }; }));
        return z;
      }
      case "collect": {
        var pk = nearest(S.pickups.filter(function (p2) { return p2.kind === obj.item; }));
        return pk || doorTo(objMapFor(obj.item));
      }
      case "shrine": {
        var s = nearest(S.shrines, function (t) { return !save.shrinesLit[t.x + ":" + t.y]; });
        return s || doorTo("forest");
      }
      case "switch": {
        var pl = nearest(S.plates, function (t) { return !save.platesPressed[t.x + ":" + t.y]; });
        return pl || doorTo("marsh");
      }
      case "boss": {
        var bd = D.BOSSES[obj.boss];
        if (S.boss) return { x: S.boss.x / TILE - 0.5, y: S.boss.y / TILE - 0.5 };
        if (bd.map === S.map) return { x: bd.x, y: bd.y };
        return doorTo(bd.map);
      }
      case "reach": return { x: obj.x, y: obj.y };
    }
    return null;
  }
  function objMapFor(item) {
    var pk = D.PICKUPS.find(function (p) { return p.kind === item && !save.collected[p.id]; });
    return pk ? pk.map : null;
  }
  function doorTo(map) {
    var d = D.DOORS.find(function (dd) { return dd.map === S.map && dd.to === map; });
    return d ? { x: d.x, y: d.y } : null;
  }

  /* ================= QA hooks ================= */
  function qaKeys() {
    if (!qa) return;
    if (api.input.consume("KeyQ")) {
      var obj = currentObjective();
      if (!obj) return;
      if (obj.type === "brazier" || obj.type === "shrine") { S.objCount = obj.count; updateObjective(); }
      else if (obj.type === "kill") { S.objKills = obj.count; updateObjective(); }
      else if (obj.type === "collect") {
        D.PICKUPS.forEach(function (p) { if (p.kind === obj.item) save.collected[p.id] = true; });
        updateObjective();
      }
      else if (obj.type === "switch") { D.PLATES.forEach(function (p) { save.platesPressed[p.x + ":" + p.y] = true; }); S.platesPressed = 4; S.stonesRaised = true; updateObjective(); }
      else if (obj.type === "boss" && S.boss) { hurtBoss(S.boss.hp); }
      else if (obj.type === "reach") { completeObjective(); }
      api.hud.toast("QA: objective completed", "error", 800);
    }
    if (api.input.consume("KeyW")) {
      var ch = Math.min(5, save.ch + 1);
      save.ch = ch; save.objIdx = 0; save.seenIntro["ch" + ch] = false;
      var zone = D.CHAPTERS[ch - 1].zone;
      api.save.save();
      loadMap(zone === "village" ? "village" : zone, 14, 10);
      api.hud.toast("QA: warped to chapter " + ch, "error", 800);
    }
    if (api.input.consume("KeyT")) {
      save.shards += 100;
      api.save.save();
      api.hud.toast("QA: +100 shards", "error", 800);
    }
  }

  /* ================= main update ================= */
  function update(a, dt) {
    S.t += dt;
    var p = S.p;
    S.fx = Math.max(0.3, a.quality.fxMul());
    if (dialogQueue) {
      if (a.input.consume("KeyE") || a.input.consume("Space") || a.input.consume("Enter")) advanceDialog();
      return;
    }
    qaKeys();
    // timers
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.atkAnim = Math.max(0, p.atkAnim - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.iFrames = Math.max(0, (p.iFrames || 0) - dt);
    p.rollT = Math.max(0, p.rollT - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    if (p.comboT <= 0) p.combo = 0;
    if (S.doorToastT) S.doorToastT -= dt;
    S.hurtFlash = Math.max(0, (S.hurtFlash || 0) - dt);
    S.shake = Math.max(0, (S.shake || 0) - dt * 2);
    // oil drain
    p.oil = Math.max(0, p.oil - dt * 0.9);
    // stamina
    var regen = 18 * (hasCharm("secondwind") ? 1.5 : 1);
    p.stam = Math.min(p.maxStam, p.stam + regen * dt);

    // movement
    var stick = a.input.computeStick();
    var mx = stick.x, my = stick.y;
    if (p.rollT > 0) {
      moveCircle(p, p.rollDx * 260 * dt, p.rollDy * 260 * dt);
    } else {
      var spd = moveSpeed() * (a.input.key("ShiftLeft") || a.input.key("ShiftRight") ? 1.35 : 1);
      if (spd > 130 && (mx || my)) p.stam = Math.max(0, p.stam - 10 * dt);
      moveCircle(p, mx * spd * dt, my * spd * dt);
      if (mx || my) p.face = Math.atan2(my, mx);
    }

    // actions
    if (a.input.consume("Space") || a.input.consumeBtn("atk")) playerAttack();
    if (a.input.consume("KeyF") || a.input.consumeBtn("throw")) playerThrow();
    if (a.input.consume("ShiftLeft") || a.input.consume("KeyL") || a.input.consumeBtn("roll")) playerRoll();
    if (a.input.consume("KeyE") || a.input.consumeBtn("act")) interact();
    if (a.input.pointer.justDown && a.input.pointer.active) {
      // tap to attack toward pointer (touch users)
      var ang = Math.atan2(a.input.pointer.y + S.camY - p.y, a.input.pointer.x + S.camX - p.x);
      p.face = ang;
      playerAttack();
    }

    // world updates
    updateEnemies(dt);
    updateBoss(dt);
    updateProjectiles(dt);
    updatePickups(dt);

    // "reach" objectives (Dawnrise climb)
    var curC = D.CHAPTERS[save.ch - 1];
    var objR = curC && curC.objectives[save.objIdx];
    if (objR && objR.type === "reach" && S.map === objR.map &&
        U.dist(p.x, p.y, (objR.x + 0.5) * TILE, (objR.y + 0.5) * TILE) < 70) {
      completeObjective();
    }

    // particles/floats
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var pt = S.parts[i];
      pt.t += dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vy += 220 * dt;
      if (pt.t > pt.life) S.parts.splice(i, 1);
    }
    for (var j = S.floats.length - 1; j >= 0; j--) {
      var f = S.floats[j];
      f.t += dt; f.y -= dt * 30;
      if (f.t > f.life) S.floats.splice(j, 1);
    }
    // ambient embers
    if (S.fx > 0.2 && Math.random() < dt * 6) {
      S.parts.push({
        x: S.camX + Math.random() * a.w, y: S.camY + Math.random() * a.h,
        vx: U.rand(-8, 8), vy: U.rand(-24, -10),
        life: U.rand(1.5, 2.6), t: 0, color: "rgba(255,182,61,0.5)", size: 1.6, g: -8
      });
    }
    updateHudText();
  }

  /* ================= HUD ================= */
  function buildHud() {
    api.hud.init();
    api.hud.el.innerHTML =
      '<div class="hud-tl"><div class="hud-panel" id="ehBars">' +
      '<div class="hud-meter"><span class="m-label">HP</span><div class="m-bar"><i id="ehHp" style="background:#ff5d73"></i></div></div>' +
      '<div class="hud-meter"><span class="m-label">Oil</span><div class="m-bar"><i id="ehOil" style="background:#ffb63d"></i></div></div>' +
      '<div class="hud-meter"><span class="m-label">Stam</span><div class="m-bar"><i id="ehStam" style="background:#57d98a"></i></div></div>' +
      "</div></div>" +
      '<div class="hud-tr"><div class="hud-panel" id="ehShards"></div><div class="hud-panel" style="margin-top:4px" id="ehQuest"></div></div>';
    api.input.addTouchButtons([
      { id: "atk", label: "Attack" },
      { id: "throw", label: "Throw" },
      { id: "roll", label: "Roll" },
      { id: "act", label: "Use" }
    ]);
  }
  function updateHudText() {
    var hpEl = document.getElementById("ehHp");
    if (!hpEl) return;
    var p = S.p;
    hpEl.style.width = Math.max(0, p.hp / p.maxHp * 100) + "%";
    document.getElementById("ehOil").style.width = Math.max(0, p.oil / p.maxOil * 100) + "%";
    document.getElementById("ehStam").style.width = Math.max(0, p.stam / p.maxStam * 100) + "%";
    document.getElementById("ehShards").textContent = "◆ " + save.shards + "  ·  Ch." + save.ch;
    var cur = D.CHAPTERS[save.ch - 1];
    var obj = cur && cur.objectives[save.objIdx];
    document.getElementById("ehQuest").textContent = obj ? "🧭 " + obj.desc + " (" + objectiveProgress() + ")" : "🧭 Chapter complete — explore!";
  }

  /* ================= rendering ================= */
  function render(a) {
    var x = a.ctx;
    var w = a.w, h = a.h;
    var p = S.p;
    // camera
    var tw = Math.min(w, 1000), th = Math.min(h, 640);
    var camW = Math.min(w, S.mw), camH = Math.min(h, S.mh);
    S.camX = U.clamp(p.x - camW / 2, 0, Math.max(0, S.mw - camW));
    S.camY = U.clamp(p.y - camH / 2, 0, Math.max(0, S.mh - camH));
    x.save();
    if (S.shake > 0) x.translate(U.rand(-5, 5) * S.shake, U.rand(-5, 5) * S.shake);
    x.translate(-S.camX, -S.camY);
    if (mapCanvas) x.drawImage(mapCanvas, 0, 0);

    // risen stones
    if (S.stonesRaised && D.STONES[S.map]) {
      D.STONES[S.map].forEach(function (st) {
        var px = st[0] * TILE, py = st[1] * TILE;
        var g = x.createLinearGradient(px, py, px, py + TILE);
        g.addColorStop(0, "#7a86a0"); g.addColorStop(1, "#454e64");
        x.fillStyle = g;
        x.fillRect(px, py, TILE, TILE);
        x.fillStyle = "rgba(255,255,255,0.14)";
        x.fillRect(px, py, TILE, 6);
      });
    }

    // doors (archways)
    S.doors.forEach(function (d) {
      var px = (d.x + 0.5) * TILE, py = (d.y + 0.5) * TILE;
      var locked = d.gate > 0 && save.ch <= d.gate;
      x.fillStyle = locked ? "rgba(255,93,115,0.5)" : "rgba(255,182,61,0.75)";
      U.roundRect(x, x, px - 14, py - 22, 28, 40, 10);
      x.fill();
      x.fillStyle = "#1a2138";
      U.roundRect(x, x, px - 9, py - 17, 18, 32, 7);
      x.fill();
      x.fillStyle = locked ? "#ff5d73" : "#ffd257";
      x.font = "bold 12px sans-serif";
      x.textAlign = "center";
      x.fillText(locked ? "🔒" : "➤", px, py + 2);
      x.textAlign = "left";
    });

    // braziers
    S.braziers.forEach(function (b) {
      var px = (b.x + 0.5) * TILE, py = (b.y + 0.5) * TILE;
      var lit = save.braziersLit[b.map + ":" + b.x + ":" + b.y];
      x.fillStyle = "#4a3a2a";
      U.roundRect(x, x, px - 10, py - 4, 20, 16, 4); x.fill();
      if (lit) {
        var fg = x.createRadialGradient(px, py - 12, 2, px, py - 12, 20 + Math.sin(S.t * 9 + b.x) * 3);
        fg.addColorStop(0, "rgba(255,220,120,0.95)");
        fg.addColorStop(0.5, "rgba(255,150,50,0.55)");
        fg.addColorStop(1, "rgba(255,120,30,0)");
        x.fillStyle = fg;
        x.beginPath(); x.arc(px, py - 12, 22, 0, 7); x.fill();
        if (S.fx > 0.2 && Math.random() < 0.2) {
          S.parts.push({ x: px + U.rand(-4, 4), y: py - 12, vx: U.rand(-6, 6), vy: U.rand(-40, -20), life: 0.8, t: 0, color: "#ffb63d", size: 2, g: -10 });
        }
      } else {
        x.fillStyle = "#2a2420";
        x.beginPath(); x.arc(px, py - 8, 6, 0, 7); x.fill();
      }
    });

    // shrines
    S.shrines.forEach(function (sh) {
      var px = (sh.x + 0.5) * TILE, py = (sh.y + 0.5) * TILE;
      var lit = save.shrinesLit[sh.x + ":" + sh.y];
      x.fillStyle = lit ? "#6a5ac0" : "#3a3a5a";
      U.roundRect(x, x, px - 12, py - 20, 24, 30, 5); x.fill();
      if (lit) {
        var sg = x.createRadialGradient(px, py - 22, 2, px, py - 22, 24);
        sg.addColorStop(0, "rgba(200,180,255,0.9)");
        sg.addColorStop(1, "rgba(157,123,255,0)");
        x.fillStyle = sg;
        x.beginPath(); x.arc(px, py - 22, 24, 0, 7); x.fill();
      }
    });

    // plates
    S.plates.forEach(function (pl) {
      var px = (pl.x + 0.5) * TILE, py = (pl.y + 0.5) * TILE;
      var on = save.platesPressed[pl.x + ":" + pl.y];
      x.fillStyle = on ? "rgba(106,208,192,0.7)" : "rgba(106,208,192,0.28)";
      x.beginPath(); x.arc(px, py, 13, 0, 7); x.fill();
      x.strokeStyle = "rgba(255,255,255,0.4)";
      x.lineWidth = 1.6;
      x.beginPath(); x.arc(px, py, 13, 0, 7); x.stroke();
    });

    // ember nodes
    S.nodes.forEach(function (n) {
      if (n.t > 0) return;
      var px = (n.x + 0.5) * TILE, py = (n.y + 0.5) * TILE;
      var ng = x.createRadialGradient(px, py, 2, px, py, 16 + Math.sin(S.t * 4 + n.x) * 3);
      ng.addColorStop(0, "rgba(255,200,90,0.85)");
      ng.addColorStop(1, "rgba(255,150,40,0)");
      x.fillStyle = ng;
      x.beginPath(); x.arc(px, py, 18, 0, 7); x.fill();
    });

    // pickups
    S.pickups.forEach(function (pk) {
      var px = (pk.x + 0.5) * TILE, py = (pk.y + 0.5) * TILE + Math.sin(S.t * 3 + pk.x) * 3;
      var colors = {
        petal: "#b8e0f8", wisp: "#9a8ae0", key: "#ffd257", emberling: "#ffcf6b",
        lore: "#d8c8a0", glowcap: "#6adf7a", ledger: "#c8b088", relic: "#b8c2d8", locket: "#f8d8e8"
      };
      var col = colors[pk.kind] || "#fff";
      var pg = x.createRadialGradient(px, py, 1, px, py, 12);
      pg.addColorStop(0, col);
      pg.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = pg;
      x.beginPath(); x.arc(px, py, 12, 0, 7); x.fill();
      x.fillStyle = col;
      x.beginPath(); x.arc(px, py, 3.4, 0, 7); x.fill();
    });

    // NPCs
    S.npcs.forEach(function (n) {
      var px = (n.x + 0.5) * TILE, py = (n.y + 0.5) * TILE;
      drawPerson(x, px, py, "#5a7a9a", "#c8d8e8", Math.sin(S.t * 2 + n.x) * 0.04);
      x.fillStyle = "rgba(233,237,250,0.9)";
      x.font = "10px sans-serif";
      x.textAlign = "center";
      x.fillText(n.name.split(" ")[0], px, py - 22);
      x.textAlign = "left";
    });

    // enemies (y-sorted with player)
    var ents = S.enemies.slice();
    ents.push({ isPlayer: true, x: p.x, y: p.y, r: p.r });
    ents.sort(function (a2, b2) { return a2.y - b2.y; });
    ents.forEach(function (e) {
      if (e.isPlayer) drawPlayer(x, p);
      else drawEnemy(x, e);
    });
    if (S.boss) drawBoss(x, S.boss);

    // projectiles
    S.globs.forEach(function (g) {
      x.fillStyle = g.big ? "#c86ad0" : "#8a5fc0";
      x.beginPath(); x.arc(g.x, g.y, g.big ? 8 : 5.5, 0, 7); x.fill();
      x.fillStyle = "rgba(255,255,255,0.4)";
      x.beginPath(); x.arc(g.x - g.dx * 2, g.y - g.dy * 2, 2.4, 0, 7); x.fill();
    });
    S.bolts.forEach(function (b) {
      x.save();
      x.translate(b.x, b.y);
      x.rotate(Math.atan2(b.dy, b.dx));
      var bg = x.createLinearGradient(-10, 0, 8, 0);
      bg.addColorStop(0, "rgba(255,182,61,0)");
      bg.addColorStop(1, "#ffd257");
      x.fillStyle = bg;
      U.roundRect(x, x, -10, -3, 18, 6, 3); x.fill();
      x.restore();
    });

    // particles
    S.parts.forEach(function (pt) {
      x.globalAlpha = Math.max(0, 1 - pt.t / pt.life);
      x.fillStyle = pt.color;
      x.beginPath(); x.arc(pt.x, pt.y, pt.size, 0, 7); x.fill();
    });
    x.globalAlpha = 1;

    // floats
    x.font = "bold 13px 'Trebuchet MS', sans-serif";
    x.textAlign = "center";
    S.floats.forEach(function (f) {
      x.globalAlpha = Math.max(0, 1 - f.t / f.life);
      x.fillStyle = "rgba(8,10,20,0.7)";
      x.fillText(f.text, f.x + 1, f.y + 1);
      x.fillStyle = f.color;
      x.fillText(f.text, f.x, f.y);
    });
    x.globalAlpha = 1;
    x.textAlign = "left";

    // interact prompt
    var it = nearestInteract();
    if (it && !dialogQueue) {
      var ix = it.kind === "npc" ? (it.npc.x + 0.5) * TILE : (it.x + 0.5) * TILE;
      var iy = it.kind === "npc" ? (it.npc.y + 0.5) * TILE : (it.y + 0.5) * TILE;
      x.fillStyle = "rgba(10,14,28,0.8)";
      U.roundRect(x, x, ix - 16, iy - 44, 32, 20, 6); x.fill();
      x.fillStyle = "#ffd257";
      x.font = "bold 11px sans-serif";
      x.textAlign = "center";
      x.fillText("E", ix, iy - 30);
      x.textAlign = "left";
    }

    x.restore();

    /* lighting overlay */
    if (!lightCanvas || lightCanvas.width !== w || lightCanvas.height !== h) {
      lightCanvas = document.createElement("canvas");
      lightCanvas.width = w;
      lightCanvas.height = h;
      lightCtx = lightCanvas.getContext("2d");
    }
    var lx = lightCtx;
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, w, h);
    lx.fillStyle = "rgba(7,10,24," + S.ambient + ")";
    lx.fillRect(0, 0, w, h);
    lx.globalCompositeOperation = "destination-out";
    function hole(px, py, r) {
      var g = lx.createRadialGradient(px, py, r * 0.15, px, py, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.55, "rgba(0,0,0,0.72)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = g;
      lx.beginPath(); lx.arc(px, py, r, 0, 7); lx.fill();
    }
    hole(p.x - S.camX, p.y - S.camY, lanternRadius());
    S.braziers.forEach(function (b) {
      if (save.braziersLit[b.map + ":" + b.x + ":" + b.y]) {
        hole((b.x + 0.5) * TILE - S.camX, (b.y + 0.5) * TILE - S.camY, 110);
      }
    });
    S.shrines.forEach(function (sh) {
      if (save.shrinesLit[sh.x + ":" + sh.y]) hole((sh.x + 0.5) * TILE - S.camX, (sh.y + 0.5) * TILE - S.camY, 90);
    });
    S.nodes.forEach(function (n) {
      if (n.t <= 0) hole((n.x + 0.5) * TILE - S.camX, (n.y + 0.5) * TILE - S.camY, 34);
    });
    S.pickups.forEach(function (pk) {
      if (pk.kind === "emberling" || pk.kind === "petal" || pk.kind === "wisp") {
        hole((pk.x + 0.5) * TILE - S.camX, (pk.y + 0.5) * TILE - S.camY, 40);
      }
    });
    if (S.boss) hole(S.boss.x - S.camX, S.boss.y - S.camY, 70);
    x.drawImage(lightCanvas, 0, 0);

    // hurt flash + objective arrow + boss bar (screen space)
    if (S.hurtFlash > 0) {
      x.fillStyle = "rgba(255,60,80," + (S.hurtFlash * 0.9) + ")";
      x.fillRect(0, 0, w, h);
    }
    var tgt = objectiveTarget();
    if (tgt && !dialogQueue) {
      var sx = (tgt.x + 0.5) * TILE - S.camX, sy = (tgt.y + 0.5) * TILE - S.camY;
      var inView = sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20;
      if (!inView) {
        var ang = Math.atan2(sy - h / 2, sx - w / 2);
        var ax = w / 2 + Math.cos(ang) * (Math.min(w, h) * 0.36);
        var ay = h / 2 + Math.sin(ang) * (Math.min(w, h) * 0.36);
        x.save();
        x.translate(ax, ay);
        x.rotate(ang);
        x.fillStyle = "rgba(255,209,87,0.9)";
        x.beginPath();
        x.moveTo(12, 0); x.lineTo(-8, -8); x.lineTo(-8, 8);
        x.closePath(); x.fill();
        x.restore();
      }
    }
    if (S.boss) {
      var bw = Math.min(w * 0.55, 420), bx = (w - bw) / 2, by = 12;
      x.fillStyle = "rgba(10,14,25,0.85)";
      U.roundRect(x, x, bx, by, bw, 20, 9); x.fill();
      x.fillStyle = "#ff5d73";
      U.roundRect(x, x, bx + 2, by + 2, (bw - 4) * Math.max(0, S.boss.hp / S.boss.maxHp), 16, 7); x.fill();
      x.fillStyle = "#fff";
      x.font = "bold 12px 'Trebuchet MS', sans-serif";
      x.textAlign = "center";
      x.fillText(S.boss.name, bx + bw / 2, by + 14);
      x.textAlign = "left";
    }
  }

  /* entity painters */
  function drawPerson(x, px, py, cloak, skin, sway) {
    x.save();
    x.translate(px, py);
    x.fillStyle = "rgba(0,0,0,0.3)";
    x.beginPath(); x.ellipse(0, 8, 12, 4.5, 0, 0, 7); x.fill();
    var g = x.createLinearGradient(0, -16, 0, 10);
    g.addColorStop(0, cloak); g.addColorStop(1, "#2a3248");
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(-9, 10);
    x.quadraticCurveTo(-11 + sway * 30, -6, 0, -14);
    x.quadraticCurveTo(11 + sway * 30, -6, 9, 10);
    x.closePath(); x.fill();
    x.fillStyle = skin;
    x.beginPath(); x.arc(0, -16, 6, 0, 7); x.fill();
    x.restore();
  }
  function drawPlayer(x, p) {
    var ember = (save.sideCounts.emberling || 0);
    var unlocked = Math.min(3, Math.floor(ember / 3));
    var hi = (save.hue && save.hue <= unlocked) ? save.hue : 0;
    var hue = ["#ffb63d", "#ff8ab0", "#b18cff", "#6adf9a"][hi];
    x.save();
    x.translate(p.x, p.y);
    if (p.iFrames > 0) x.globalAlpha = 0.55;
    x.fillStyle = "rgba(0,0,0,0.32)";
    x.beginPath(); x.ellipse(0, 9, 12, 4.5, 0, 0, 7); x.fill();
    // cloak
    var g = x.createLinearGradient(0, -18, 0, 12);
    g.addColorStop(0, "#4a6a9a"); g.addColorStop(1, "#2a3248");
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(-10, 10);
    x.quadraticCurveTo(-13, -6, 0, -15);
    x.quadraticCurveTo(13, -6, 10, 10);
    x.closePath(); x.fill();
    // hood
    x.fillStyle = "#3a5a8a";
    x.beginPath(); x.arc(0, -16, 7, 0, 7); x.fill();
    x.fillStyle = "#0e1428";
    x.beginPath(); x.arc(Math.cos(p.face) * 2.4, -16 + Math.sin(p.face) * 2, 4, 0, 7); x.fill();
    // lantern (side of facing)
    var lx2 = Math.cos(p.face + 1.2) * 12, ly2 = Math.sin(p.face + 1.2) * 12 - 4;
    var lg = x.createRadialGradient(lx2, ly2, 1, lx2, ly2, 12);
    lg.addColorStop(0, hue);
    lg.addColorStop(1, "rgba(255,182,61,0)");
    x.fillStyle = lg;
    x.beginPath(); x.arc(lx2, ly2, 12, 0, 7); x.fill();
    x.fillStyle = hue;
    x.beginPath(); x.arc(lx2, ly2, 3, 0, 7); x.fill();
    // blade swing
    if (p.atkAnim > 0) {
      var sw = 1 - p.atkAnim / 0.18;
      x.strokeStyle = "rgba(220,235,255,0.9)";
      x.lineWidth = 3.4;
      x.beginPath();
      x.arc(0, -4, 30, p.face - bladeArc() / 2 + sw * bladeArc(), p.face - bladeArc() / 2 + sw * bladeArc() + 0.5);
      x.stroke();
    }
    x.globalAlpha = 1;
    x.restore();
  }
  function drawEnemy(x, e) {
    x.save();
    x.translate(e.x, e.y);
    var r = e.def.r;
    x.fillStyle = "rgba(0,0,0,0.3)";
    x.beginPath(); x.ellipse(0, r * 0.8, r * 0.8, r * 0.3, 0, 0, 7); x.fill();
    if (e.def.flying) x.translate(0, Math.sin(e.wob * 3) * 3 - 4);
    var col = e.flash > 0 ? "#fff" : e.def.color;
    if (e.windup > 0) col = "#ff8a9a";
    var g = x.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, lighten(col, 60));
    g.addColorStop(1, col);
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
    // eyes
    x.fillStyle = "#ffd257";
    x.beginPath(); x.arc(-r * 0.28, -r * 0.2, r * 0.13, 0, 7); x.fill();
    x.beginPath(); x.arc(r * 0.28, -r * 0.2, r * 0.13, 0, 7); x.fill();
    if (e.def.shield) {
      x.strokeStyle = "#b8c2d8";
      x.lineWidth = 3.4;
      x.beginPath(); x.arc(0, 0, r * 0.95, (e.face || 0) - 1, (e.face || 0) + 1); x.stroke();
    }
    if (e.def.flying) {
      x.strokeStyle = "rgba(200,180,255,0.6)";
      x.lineWidth = 1.6;
      x.beginPath(); x.arc(0, 0, r * 1.3 + Math.sin(e.wob * 5) * 2, 0, 7); x.stroke();
    }
    if (e.hp < e.maxHp) {
      x.fillStyle = "rgba(10,14,25,0.75)";
      x.fillRect(-r, -r * 1.6, r * 2, 4);
      x.fillStyle = "#ff5d73";
      x.fillRect(-r, -r * 1.6, r * 2 * Math.max(0, e.hp / e.maxHp), 4);
    }
    x.restore();
  }
  function drawBoss(x, b) {
    x.save();
    x.translate(b.x, b.y);
    var r = b.def.r;
    x.fillStyle = "rgba(0,0,0,0.35)";
    x.beginPath(); x.ellipse(0, r * 0.85, r * 0.95, r * 0.32, 0, 0, 7); x.fill();
    var col = b.flash > 0 ? "#fff" : b.def.color;
    var g = x.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.25, 0, 0, r);
    g.addColorStop(0, lighten(col, 70));
    g.addColorStop(1, col);
    x.fillStyle = g;
    x.beginPath();
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI * 2 + b.t * 0.4;
      var rr = i % 2 ? r : r * 0.85;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath(); x.fill();
    // crown / eyes
    x.fillStyle = "#ffd257";
    x.beginPath(); x.arc(-r * 0.3, -r * 0.25, r * 0.14, 0, 7); x.fill();
    x.beginPath(); x.arc(r * 0.3, -r * 0.25, r * 0.14, 0, 7); x.fill();
    if (b.phase2) {
      x.strokeStyle = "rgba(200,106,208,0.8)";
      x.lineWidth = 3;
      x.beginPath(); x.arc(0, 0, r * 1.25 + Math.sin(b.t * 6) * 3, 0, 7); x.stroke();
    }
    x.restore();
    // telegraph
    if (b.telegraph) {
      var tg = b.telegraph;
      x.save();
      if (tg.kind === "slam") {
        var t = 1 - tg.t / 0.9;
        x.strokeStyle = "rgba(255,93,115," + (0.4 + t * 0.5) + ")";
        x.lineWidth = 3;
        x.beginPath(); x.arc(tg.x, tg.y, 95, 0, 7); x.stroke();
        x.fillStyle = "rgba(255,93,115," + (t * 0.2) + ")";
        x.beginPath(); x.arc(tg.x, tg.y, 95 * t, 0, 7); x.fill();
      } else if (tg.kind === "charge") {
        x.strokeStyle = "rgba(255,147,115,0.7)";
        x.lineWidth = r * 1.4;
        x.globalAlpha = 0.3 + (1 - tg.t / 0.8) * 0.4;
        x.beginPath();
        x.moveTo(b.x, b.y);
        x.lineTo(b.x + tg.dx * 320, b.y + tg.dy * 320);
        x.stroke();
        x.globalAlpha = 1;
      }
      x.restore();
    }
  }
  function lighten(hex, amt) {
    if (hex[0] !== "#") return hex;
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgb(" + Math.min(255, r + amt) + "," + Math.min(255, g + amt) + "," + Math.min(255, b + amt) + ")";
  }
  function burst(px, py, color, n) {
    n = Math.round(n * (S ? S.fx : 1));
    for (var i = 0; i < n; i++) {
      S.parts.push({ x: px, y: py, vx: U.rand(-110, 110), vy: U.rand(-180, -30), life: U.rand(0.35, 0.8), t: 0, color: color, size: U.rand(2, 4.4) });
    }
  }
  function floatText(px, py, text, color) {
    S.floats.push({ x: px, y: py, text: text, color: color, t: 0, life: 1 });
  }

  /* ================= screens ================= */
  function showTitle() {
    api.setRunning(false);
    var pct = Math.min(100, Math.round((save.ch - 1) / 5 * 100));
    api.screens.open({
      title: "🏮 Emberhollow",
      subtitle: "The Gloam swallowed the sun. You carry the Last Lantern.",
      label: "Emberhollow title screen",
      bodyHTML:
        '<div class="stat-line"><span>Chapter</span><b>' + Math.min(save.ch, 5) + " / 5 · " + (D.CHAPTERS[Math.min(save.ch, 5) - 1].name) + "</b></div>" +
        '<div class="stat-line"><span>Shards</span><b>' + save.shards + " ◆</b></div>" +
        '<div class="stat-line"><span>Lore pages</span><b>' + save.lore.length + " / 10</b></div>" +
        '<p class="tips">Light braziers to save your progress and restore health and oil. Cut through the Gloam, one chapter at a time.</p>',
      buttons: [
        { label: (save.ch > 1 || save.objIdx > 0) ? "Continue — Chapter " + save.ch + " ▶" : "Begin the journey ▶", cls: "", onClick: function () {
            var cp = save.checkpoint;
            loadMap(cp.map, cp.x, cp.y);
            api.screens.close();
            api.setRunning(true);
            chapterIntro(save.ch);
          }, focus: true },
        { label: "New game", onClick: function () {
            api.screens.confirm("Start over?", "This erases your Emberhollow progress on this device.", "Erase & restart", function () {
              api.save.reset();
              save = api.save.data;
              S.p = newPlayer();
              loadMap("village", 14, 10);
              api.screens.close();
              api.setRunning(true);
              chapterIntro(1);
            }, true);
          } },
        { label: "How to play", onClick: showHelp, small: true },
        { label: "Settings", onClick: function () { showSettings(showTitle); }, small: true }
      ]
    });
  }
  function showHelp() {
    api.screens.open({
      title: "How to play",
      subtitle: "Warden's field guide",
      label: "How to play",
      bodyHTML:
        '<div class="stat-line"><span>Move / sprint</span><b>WASD · hold Shift</b></div>' +
        '<div class="stat-line"><span>Attack</span><b>Space (or tap)</b></div>' +
        '<div class="stat-line"><span>Ember throw</span><b>F (costs 8 oil)</b></div>' +
        '<div class="stat-line"><span>Dodge roll</span><b>Shift tap / L (i-frames)</b></div>' +
        '<div class="stat-line"><span>Interact</span><b>E — braziers, shrines, folk</b></div>' +
        '<div class="stat-line"><span>Pause / Journal</span><b>Esc</b></div>' +
        '<p class="tips">Your lantern dims as oil burns — it never goes out, but dark corners hide enemies. Shielded knights block frontal strikes: roll past or strike from behind. Braziers are checkpoints.</p>',
      buttons: [{ label: "Got it", cls: "", onClick: showTitle, focus: true }]
    });
  }
  function showSettings(back) {
    api.screens.open({
      title: "Settings",
      label: "Settings",
      dismissible: true,
      onEscape: back || showTitle,
      bodyHTML: api.screens.settingsRows() +
        '<div class="set-row"><div class="set-lbl">Lantern hue<small>' + ((save.sideCounts.emberling || 0) >= 12 ? "All hues unlocked" : "Emberlings " + (save.sideCounts.emberling || 0) + "/12 unlock hues") + '</small></div>' +
        '<select id="setHue"><option value="0">Amber</option><option value="1"' + (save.hue === 1 ? " selected" : "") + '>Rose</option><option value="2"' + (save.hue === 2 ? " selected" : "") + '>Violet</option><option value="3"' + (save.hue === 3 ? " selected" : "") + '>Jade</option></select></div>',
      buttons: [{ label: "Done", cls: "", onClick: back || showTitle, focus: true }]
    });
    api.screens.bindSettings();
    var hue = document.getElementById("setHue");
    if (hue) hue.addEventListener("change", function () {
      save.hue = parseInt(hue.value, 10);
      api.save.save();
      var allowed = Math.min(3, Math.floor((save.sideCounts.emberling || 0) / 3));
      if (save.hue > allowed) {
        save.hue = 0;
        api.save.save();
        api.hud.toast("That hue is still shy — rescue more emberlings!", "error", 1600);
      }
    });
  }
  function openPause() {
    if (!api.isRunning()) return;
    api.setRunning(false);
    api.save.save();
    syncAggregates();
    api.screens.open({
      title: "Paused",
      subtitle: D.CHAPTERS[Math.min(save.ch, 5) - 1].name,
      label: "Pause menu",
      bodyHTML:
        '<div class="stat-line"><span>HP / Oil</span><b>' + Math.round(S.p.hp) + " / " + Math.round(S.p.oil) + "</b></div>" +
        '<div class="stat-line"><span>Objective</span><b>' + (currentObjective() ? currentObjective().desc : "Chapter complete") + "</b></div>" +
        '<div class="stat-line"><span>Shards</span><b>' + save.shards + " ◆</b></div>",
      buttons: [
        { label: "Resume", cls: "", onClick: resume, focus: true },
        { label: "Journal 📜", onClick: openJournal },
        { label: "How to play", onClick: showHelp, small: true },
        { label: "Settings", onClick: function () { showSettings(openPause); }, small: true },
        { label: "Save & quit to title", cls: "danger", small: true, onClick: function () {
            api.save.save();
            showTitle();
          } }
      ]
    });
  }
  function openJournal() {
    var cur = D.CHAPTERS[save.ch - 1];
    var obj = currentObjective();
    var html = "<div class='stat-line'><span>Main quest · Chapter " + save.ch + " " + (cur ? cur.name : "") + "</span><b>" +
      (obj ? obj.desc + " (" + objectiveProgress() + ")" : "complete!") + "</b></div>";
    D.SIDEQUESTS.forEach(function (sq) {
      var st = save.sideState[sq.id];
      html += "<div class='stat-line'><span>" + (st === "done" ? "✅" : st === "offered" ? "📋" : "🔒") + " " + sq.name + "</span><b>" +
        (st === "done" ? "done" : st === "offered" ? sideProgress(sq) : "find " + sq.giver) + "</b></div>";
    });
    html += "<div class='stat-line'><span>📜 Lore pages</span><b>" + save.lore.length + " / 10</b></div>";
    save.lore.forEach(function (id) {
      html += "<p class='tips'>" + (D.LORE_TEXT[id] || "") + "</p>";
    });
    api.screens.open({
      title: "Journal",
      subtitle: "What the valley remembers",
      label: "Journal",
      bodyHTML: '<div style="text-align:left;max-height:44vh;overflow:auto">' + html + "</div>",
      buttons: [{ label: "◀ Back", cls: "", onClick: openPause, focus: true }]
    });
  }
  function resume() {
    api.screens.close();
    api.setRunning(true);
  }

  /* ================= boot ================= */
  GK.boot({
    canvas: "#game",
    gameId: "emberhollow",
    saveId: "emberhollow",
    defaults: {
      ch: 1, objIdx: 0, seenIntro: {}, shards: 0,
      bladeTier: 1, lanternTier: 1, cloakTier: 1, charms: [], hue: 0,
      collected: {}, braziersLit: {}, shrinesLit: {}, platesPressed: {},
      sideState: {}, sideKills: 0, sideCounts: {}, lore: [],
      checkpoint: { map: "village", x: 14, y: 10 }, completed: false
    },
    on: {
      init: function (a) {
        api = a;
        save = a.save.load();
        S = a.state = {
          t: 0, map: null, px: 0, py: 0, p: newPlayer(),
          enemies: [], zones: [], boss: null, globs: [], bolts: [],
          parts: [], floats: [], kills: {}, objCount: 0, objKills: 0,
          platesPressed: 0, stonesRaised: false, camX: 0, camY: 0,
          ambient: 0.6, fx: 1, shake: 0, dead: false
        };
        S.fx = Math.max(0.3, a.quality.fxMul());
        buildHud();
        a.input.setTouchVisible(true);
        // restore risen stones state
        var pressedAll = D.PLATES.every(function (pl) { return save.platesPressed[pl.x + ":" + pl.y]; });
        S.stonesRaised = pressedAll;
        S.platesPressed = D.PLATES.filter(function (pl) { return save.platesPressed[pl.x + ":" + pl.y]; }).length;
      },
      title: function () {
        showTitle();
      },
      update: function (a, dt) {
        if (!S.map) return;
        if (a.input.consumeBtn("pause")) openPause();
        update(a, dt);
      },
      render: function (a) {
        if (!S.map) {
          var x = a.ctx;
          var g = x.createLinearGradient(0, 0, 0, a.h);
          g.addColorStop(0, "#0c1020"); g.addColorStop(1, "#1a1428");
          x.fillStyle = g;
          x.fillRect(0, 0, a.w, a.h);
          return;
        }
        render(a);
      },
      requestPause: function () { openPause(); },
      onAutoPause: function () { openPause(); }
    }
  });

  window.__EH = { get state() { return S; }, get save() { return save; }, qa: qa };
})();
