/* ============================================================
   Arcade Atlas — site core: profile system, chrome, catalog,
   achievements, community board. Plain script, no build step.
   ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "arcadeAtlas.profile.v1";
  var LS_BOARD = "arcadeAtlas.board.v1";

  /* ---------- tiny helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + (s < 10 ? "0" : "") + s + "s";
    return s + "s";
  }
  function fmtDate(ts) {
    if (!ts) return "just now";
    var d = Date.now() - ts;
    if (d < 60000) return "just now";
    if (d < 3600000) return Math.floor(d / 60000) + " min ago";
    if (d < 86400000) return Math.floor(d / 3600000) + " h ago";
    return new Date(ts).toLocaleDateString();
  }

  /* ---------- profile ---------- */
  var profile = null;
  var storageBroken = false;

  function defaultProfile() {
    return {
      v: 1,
      name: "",            // empty = guest
      avatar: "fox",
      createdAt: Date.now(),
      settings: { muted: false, quality: "auto", reducedFx: false, showFps: false },
      games: {},           // per-game save blobs, keyed by game id
      achievements: {},    // id -> timestamp
      visited: {},         // page key -> timestamp
      stats: { playSeconds: 0, sessions: 0, lastSeen: 0 }
    };
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(profile));
    } catch (e) {
      showStorageError();
    }
  }
  function showStorageError() {
    if (storageBroken) return;
    storageBroken = true;
    toast("Saving is unavailable", "Private browsing or a full storage quota may block progress. Export a backup from the Profile page.", true);
  }
  function loadProfile() {
    profile = defaultProfile();
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        profile = Object.assign(defaultProfile(), data);
        profile.settings = Object.assign(defaultProfile().settings, profile.settings || {});
        profile.stats = Object.assign(defaultProfile().stats, profile.stats || {});
        profile.games = profile.games || {};
        profile.achievements = profile.achievements || {};
        profile.visited = profile.visited || {};
      }
    } catch (e) {
      profile = defaultProfile();
    }
    profile.stats.sessions++;
    profile.stats.lastSeen = Date.now();
    persist();
  }

  /* ---------- avatars (original inline SVG art) ---------- */
  var AVATAR_KINDS = ["fox", "owl", "cat", "frog", "robot", "dragon", "turtle", "penguin", "star", "moth"];
  var AVATAR_PALETTE = {
    fox:     { bg: "#3a2b1c", a: "#f2a35e", b: "#e8894a" },
    owl:     { bg: "#243043", a: "#b7a3e0", b: "#8a6fc9" },
    cat:     { bg: "#1f2a3a", a: "#aab6c9", b: "#76839a" },
    frog:    { bg: "#16301f", a: "#67c97a", b: "#449e56" },
    robot:   { bg: "#1b2233", a: "#a9c1e8", b: "#6f88b4" },
    dragon:  { bg: "#20103a", a: "#b18cff", b: "#7a52d4" },
    turtle:  { bg: "#12282a", a: "#66c3b0", b: "#3f9484" },
    penguin: { bg: "#16202e", a: "#e9edfa", b: "#39465e" },
    star:    { bg: "#2a2410", a: "#ffcf6b", b: "#e2a02c" },
    moth:    { bg: "#221a2e", a: "#cdb9ec", b: "#9d7bff" }
  };
  function avatarSvg(kind) {
    var p = AVATAR_PALETTE[kind] || AVATAR_PALETTE.fox;
    var s = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect width="64" height="64" rx="32" fill="' + p.bg + '"/>';
    if (kind === "dragon") s += '<polygon points="12,22 19,7 27,18" fill="' + p.b + '"/><polygon points="52,22 45,7 37,18" fill="' + p.b + '"/>';
    if (kind === "moth") s += '<ellipse cx="19" cy="32" rx="9" ry="13" fill="' + p.b + '" opacity="0.85"/><ellipse cx="45" cy="32" rx="9" ry="13" fill="' + p.b + '" opacity="0.85"/>';
    if (kind === "star") s += '<polygon points="32,11 37,24 51,24 40,33 44,47 32,39 20,47 24,33 13,24 27,24" fill="' + p.b + '"/>';
    s += '<circle cx="32" cy="36" r="18" fill="' + p.a + '"/>';
    if (kind === "robot") s += '<rect x="27" y="12" width="10" height="7" rx="3" fill="' + p.b + '"/><circle cx="32" cy="11" r="3.5" fill="' + p.b + '"/>';
    if (kind === "owl") {
      s += '<circle cx="24" cy="30" r="7.5" fill="#fff"/><circle cx="40" cy="30" r="7.5" fill="#fff"/>';
      s += '<circle cx="24" cy="30" r="3" fill="#14100b"/><circle cx="40" cy="30" r="3" fill="#14100b"/>';
    } else {
      s += '<circle cx="25" cy="32" r="3" fill="#14100b"/><circle cx="39" cy="32" r="3" fill="#14100b"/>';
    }
    if (kind === "penguin") s += '<ellipse cx="32" cy="45" rx="8" ry="9" fill="#fff"/>';
    var mouth = {
      cat: '<path d="M27 43 q2.5 3 5 0 q2.5 3 5 0" stroke="#14100b" stroke-width="2" fill="none"/>',
      frog: '<path d="M25 41 q7 5 14 0" stroke="#14301c" stroke-width="2" fill="none"/>',
      robot: '<rect x="27" y="41" width="10" height="4" rx="2" fill="#14100b"/>',
      dragon: '<path d="M27 42 q5 5 10 0" stroke="#221" stroke-width="2" fill="none"/>',
      moth: '<path d="M27 42 q5 4 10 0" stroke="#14100b" stroke-width="2" fill="none"/>',
      owl: '<polygon points="28,41 32,45 36,41" fill="#e8a13d"/>',
      penguin: '<polygon points="28,40 32,46 36,40" fill="#e8a13d"/>',
      turtle: '<path d="M26 43 q6 4 12 0" stroke="#143" stroke-width="2" fill="none"/>',
      star: '<path d="M28 42 q4 4 8 0" stroke="#14100b" stroke-width="2" fill="none"/>',
      fox: '<ellipse cx="32" cy="44" rx="5" ry="2.5" fill="#14100b"/>'
    }[kind] || '<ellipse cx="32" cy="43" rx="5" ry="2.5" fill="#14100b"/>';
    s += mouth + "</svg>";
    return s;
  }

  /* ---------- achievements ---------- */
  var ACHIEVEMENTS = [
    { id: "first-play",       icon: "🕹️", name: "First Steps",        desc: "Play your first game on Arcade Atlas." },
    { id: "missions-5",       icon: "🧭", name: "Getting Somewhere",  desc: "Complete 5 campaign missions." },
    { id: "missions-15",      icon: "🗺️", name: "Pathfinder",         desc: "Complete 15 campaign missions." },
    { id: "missions-30",      icon: "🏔️", name: "Seasoned Traveler",  desc: "Complete 30 campaign missions." },
    { id: "stars-30",         icon: "⭐", name: "Star Collector",     desc: "Earn 30 mission stars." },
    { id: "all-games",        icon: "🎪", name: "Atlas Regular",      desc: "Play every Arcade Atlas game at least once." },
    { id: "explorer",         icon: "🧳", name: "Tourist",            desc: "Visit every section of the site." },
    { id: "banana-25-combo",  icon: "🍌", name: "Banana Wizard",      desc: "Reach a 25 banana combo in Banana Catchers." },
    { id: "thornward-perfect",icon: "🌺", name: "Flawless Garden",    desc: "Finish a Thornward mission without losing a single petal." },
    { id: "emberhollow-boss", icon: "🏮", name: "Lightbearer",        desc: "Defeat your first boss in Emberhollow." },
    { id: "driftpost-rank2",  icon: "✈️", name: "Skyward Courier",    desc: "Reach Courier rank in Driftpost." },
    { id: "arcade-hour",      icon: "⏳", name: "Clocking In",        desc: "Log one hour of play time." },
    { id: "arcade-halfday",   icon: "🌅", name: "Dedicated Explorer", desc: "Log four hours of play time." }
  ];
  function toast(title, sub, isWarn) {
    var zone = document.querySelector(".toast-zone");
    if (!zone) {
      zone = document.createElement("div");
      zone.className = "toast-zone";
      document.body.appendChild(zone);
    }
    var t = document.createElement("div");
    t.className = "toast" + (isWarn ? " warn" : "");
    t.innerHTML = "<div>" + esc(title) + "</div>" + (sub ? "<small>" + esc(sub) + "</small>" : "");
    zone.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .4s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 420);
    }, 3800);
  }
  function award(id) {
    var def = null;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) if (ACHIEVEMENTS[i].id === id) def = ACHIEVEMENTS[i];
    if (!def || profile.achievements[id]) return false;
    profile.achievements[id] = Date.now();
    persist();
    toast("🏆 Achievement unlocked — " + def.name, def.desc);
    return true;
  }

  /* ---------- game catalog ---------- */
  var GAMES = [
    {
      id: "driftpost",
      title: "Driftpost",
      chips: ["3D", "WebGL", "Campaign"],
      tagline: "Pilot a drift-kite across the floating Gale Isles as the sky's newest courier.",
      path: "games/driftpost.html",
      missions: 24,
      playtime: "2.5–3.5 h",
      accent: "#ffb63d",
      blurb: "A real-time 3D flight game: 24 delivery, race, beacon and storm missions across 5 island regions, with upgrades, cosmetics, 45 skyshards and a courier rank to climb.",
      cover: "driftpost"
    },
    {
      id: "emberhollow",
      title: "Emberhollow",
      chips: ["2D", "Action RPG", "Campaign"],
      tagline: "Carry the Last Lantern into the Gloam and relight the valley.",
      path: "games/emberhollow.html",
      missions: 20,
      playtime: "2.5–4 h",
      accent: "#ff9d5c",
      blurb: "A top-down action RPG with dynamic lantern lighting: 5 chapters, 20 quests, 4 bosses, charms and lantern upgrades across village, fields, forest, marsh and keep.",
      cover: "emberhollow"
    },
    {
      id: "thornward",
      title: "Thornward",
      chips: ["2D", "Strategy", "Campaign"],
      tagline: "Command living thorn-tenders to shield the last Heartbloom from the Blight.",
      path: "games/thornward.html",
      missions: 25,
      playtime: "2.5–3.5 h",
      accent: "#57d98a",
      blurb: "A tower-defense campaign: 25 missions over 5 groves, 8 towers with upgrades, flying and armored blights, bosses, star ratings and a star-shop of permanent perks.",
      cover: "thornward"
    },
    {
      id: "banana-catchers",
      title: "Banana Catchers",
      chips: ["2D", "Arcade"],
      tagline: "The classic Arcade Atlas picker: catch bananas, chain combos, dodge the wilds.",
      path: "games/banana-catchers.html",
      missions: 0,
      playtime: "Quick play",
      accent: "#ffd257",
      blurb: "An arcade catcher with 12 level goals, combo chains, hazard fruit and an endless chase mode. The site's beloved opener, rebuilt and polished.",
      cover: "banana"
    },
    {
      id: "atlas8",
      title: "Atlas-8 Emulator",
      chips: ["Console", "Homebrew"],
      tagline: "A tiny fictional 8-bit console in your browser, with original homebrew cartridges.",
      path: "emulator.html",
      missions: 0,
      playtime: "Quick play",
      accent: "#3ddad7",
      blurb: "Power on the Atlas-8, load original homebrew carts (PipFall, Coil Rush, Hopstead), or insert your own JSON cartridges.",
      cover: "atlas8"
    }
  ];

  /* ---------- chrome (header/footer) ---------- */
  function pageKey() {
    var p = location.pathname.split("/").pop() || "index.html";
    p = p.replace(".html", "");
    return p || "home";
  }
  function logoSvg() {
    return '<svg class="logo-svg" width="30" height="30" viewBox="0 0 40 40" aria-hidden="true">' +
      '<rect x="6" y="4" width="28" height="32" rx="6" fill="#131a2e" stroke="#ffb63d" stroke-width="2.4"/>' +
      '<rect x="11" y="9" width="18" height="12" rx="2" fill="#0b1020" stroke="#3ddad7" stroke-width="1.6"/>' +
      '<circle cx="20" cy="27" r="3.4" fill="#ffb63d"/>' +
      '<rect x="12.6" y="26.2" width="7" height="2" rx="1" fill="#ffb63d" opacity=".8"/>' +
      '<rect x="20.6" y="26.2" width="7" height="2" rx="1" fill="#ffb63d" opacity=".8"/>' +
      "</svg>";
  }
  function mountChrome() {
    var root = document.body.getAttribute("data-root") || "./";
    var header = document.querySelector("[data-nav]");
    var key = pageKey();
    var links = [
      ["Home", "index.html", "home"],
      ["Games", "games.html", "games"],
      ["Emulator", "emulator.html", "emulator"],
      ["Community", "community.html", "community"],
      ["Profile", "profile.html", "profile"]
    ];
    if (header) {
      var html =
        '<div class="nav">' +
        '<a class="brand" href="' + root + 'index.html">' + logoSvg() + "<span>Arcade&nbsp;Atlas</span></a>" +
        '<nav class="nav-links" aria-label="Main">' +
        links.map(function (l) {
          var active = key === l[2] ? ' aria-current="page"' : "";
          return '<a href="' + root + l[1] + '"' + active + ">" + l[0] + "</a>";
        }).join("") +
        "</nav>" +
        '<div class="nav-right">' +
        '<button class="icon-btn" id="navMute" title="Toggle sound" aria-label="Toggle sound">' +
        (profile.settings.muted ? "🔇" : "🔊") + "</button>" +
        '<a class="profile-chip" href="' + root + 'profile.html">' +
        '<span class="avatar">' + avatarSvg(profile.avatar) + "</span>" +
        "<span>" + esc(profile.name || "Guest") + "</span></a>" +
        "</div></div>";
      header.innerHTML = html;
      var mb = document.getElementById("navMute");
      mb.addEventListener("click", function () {
        profile.settings.muted = !profile.settings.muted;
        persist();
        mb.textContent = profile.settings.muted ? "🔇" : "🔊";
        toast(profile.settings.muted ? "Sound muted" : "Sound on");
      });
    }
    var footer = document.querySelector("[data-footer]");
    if (footer) {
      footer.innerHTML =
        '<div class="wrap">' +
        "<span>Arcade Atlas — original games, hand-built in code.</span>" +
        '<span>Progress saves in this browser · <a href="' + root + 'profile.html">Profile &amp; settings</a></span>' +
        "</div>";
    }
  }
  function trackVisit() {
    profile.visited[pageKey()] = Date.now();
    persist();
    var wanted = ["home", "games", "emulator", "community", "profile"];
    var n = 0;
    for (var i = 0; i < wanted.length; i++) if (profile.visited[wanted[i]]) n++;
    if (n >= 5) award("explorer");
  }

  /* ---------- community board (local device, seeded staff posts) ---------- */
  function seedBoard() {
    var now = Date.now();
    return {
      v: 1,
      posts: [
        { id: "s1", author: "Arcade Atlas Team", staff: true, ts: now - 86400000 * 3,
          body: "Welcome to the new Arcade Atlas! Three brand-new campaign worlds just went live — Driftpost for the pilots, Emberhollow for the lantern-bearers, Thornward for the tacticians. Banana Catchers still catches, of course. Tell us which mission is kicking your tail!",
          reactions: { "🚀": 4, "🎮": 2 } },
        { id: "s2", author: "Arcade Atlas Team", staff: true, ts: now - 86400000 * 2,
          body: "Pilot tip: in Driftpost you don't need to chase the compass marker — line up the objective beam and you'll spot the landing pad early. Time bonuses stack, and every star you keep is progress toward your courier rank.",
          reactions: { "✈️": 3 } },
        { id: "s3", author: "Arcade Atlas Team", staff: true, ts: now - 86400000,
          body: "Warden tip: in Emberhollow your lantern is your lifeline. Grey grass means Gloam nearby — light the braziers before you push deep, and save Ember Throws for the pale ones. The marsh ferry puzzle rewards patient eyes.",
          reactions: { "🏮": 3, "🧪": 1 } },
        { id: "s4", author: "Arcade Atlas Team", staff: true, ts: now - 36000000,
          body: "Gardener tip: Thornward's Sporewings ignore ground thorns — a Falconer Nest or two before Grove 3 will save your Heartbloom. Calling the next wave early pays bonus leaves if you're feeling confident.",
          reactions: { "🌿": 2 } }
      ]
    };
  }
  function loadBoard() {
    try {
      var raw = localStorage.getItem(LS_BOARD);
      if (raw) {
        var b = JSON.parse(raw);
        if (b && b.posts) return b;
      }
    } catch (e) {}
    var seeded = seedBoard();
    try { localStorage.setItem(LS_BOARD, JSON.stringify(seeded)); } catch (e) {}
    return seeded;
  }
  function boardApi() {
    var board = loadBoard();
    return {
      list: function () {
        return board.posts.slice().sort(function (a, b) { return b.ts - a.ts; });
      },
      post: function (body) {
        body = String(body || "").trim().slice(0, 600);
        if (!body) return null;
        var p = {
          id: uid(),
          author: profile.name || "Guest",
          staff: false,
          ts: Date.now(),
          body: body,
          reactions: {}
        };
        board.posts.push(p);
        try { localStorage.setItem(LS_BOARD, JSON.stringify(board)); } catch (e) { showStorageError(); }
        return p;
      },
      react: function (id, emoji) {
        var p = null;
        for (var i = 0; i < board.posts.length; i++) if (board.posts[i].id === id) p = board.posts[i];
        if (!p) return;
        p.reactions = p.reactions || {};
        p.reactions[emoji] = (p.reactions[emoji] || 0) + 1;
        try { localStorage.setItem(LS_BOARD, JSON.stringify(board)); } catch (e) {}
      },
      remove: function (id) {
        board.posts = board.posts.filter(function (x) { return x.id !== id || x.staff; });
        try { localStorage.setItem(LS_BOARD, JSON.stringify(board)); } catch (e) {}
      }
    };
  }

  /* ---------- playtime tracking ---------- */
  setInterval(function () {
    if (document.hidden) return;
    profile.stats.playSeconds += 15;
    if (profile.stats.playSeconds >= 3600) award("arcade-hour");
    if (profile.stats.playSeconds >= 14400) award("arcade-halfday");
    if (profile.stats.playSeconds % 60 === 0) persist();
  }, 15000);

  /* ---------- procedural cover art (no remote assets) ---------- */
  function paintCover(canvas, kind) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = canvas.clientWidth || 320;
    var ch = canvas.clientHeight || 180;
    canvas.width = Math.max(2, Math.round(cw * dpr));
    canvas.height = Math.max(2, Math.round(ch * dpr));
    var x = canvas.getContext("2d");
    x.scale(canvas.width / 640, canvas.height / 360); // author in 640x360 space
    var g, i, t;
    if (kind === "driftpost") {
      g = x.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#2c1e4e"); g.addColorStop(0.55, "#b45a7d");
      g.addColorStop(0.8, "#ff9d5c"); g.addColorStop(1, "#ffd98a");
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      x.fillStyle = "rgba(255,225,160,0.95)";
      x.beginPath(); x.arc(490, 250, 42, 0, 7); x.fill();
      x.fillStyle = "#1d1533";
      for (i = 0; i < 5; i++) {
        var ix = 60 + i * 130, iy = 150 + (i % 2) * 55, iw = 88 - (i % 3) * 16;
        x.beginPath(); x.ellipse(ix, iy, iw, 20, 0, 0, 7); x.fill();
        x.beginPath(); x.moveTo(ix - iw, iy); x.quadraticCurveTo(ix, iy + 95, ix + iw, iy); x.fill();
      }
      x.fillStyle = "#241a3a";
      x.beginPath(); x.moveTo(250, 160); x.lineTo(282, 128); x.lineTo(332, 143); x.lineTo(302, 176); x.closePath(); x.fill();
      x.fillStyle = "#fff";
      x.beginPath(); x.moveTo(266, 150); x.lineTo(298, 141); x.lineTo(312, 151); x.lineTo(286, 158); x.closePath(); x.fill();
      x.fillStyle = "rgba(255,255,255,0.35)";
      for (i = 0; i < 40; i++) x.fillRect((i * 61) % 640, (i * 37) % 360, 2, 2);
    } else if (kind === "emberhollow") {
      g = x.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#0a0d1c"); g.addColorStop(1, "#16203a");
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      var lg = x.createRadialGradient(320, 180, 10, 320, 180, 190);
      lg.addColorStop(0, "rgba(255,180,80,0.9)");
      lg.addColorStop(0.4, "rgba(255,140,60,0.35)");
      lg.addColorStop(1, "rgba(255,120,40,0)");
      x.fillStyle = lg; x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#ffb63d";
      x.beginPath();
      for (i = 0; i < 8; i++) {
        var ang = (i / 8) * Math.PI * 2;
        x.lineTo(320 + Math.cos(ang) * 14, 180 + Math.sin(ang) * 14);
      }
      x.closePath(); x.fill();
      x.fillStyle = "#0d1120";
      for (t = 0; t < 7; t++) {
        var tx = 40 + t * 95 + (t % 2) * 20;
        x.beginPath();
        x.moveTo(tx - 26, 360); x.lineTo(tx, 150 + (t % 3) * 30); x.lineTo(tx + 26, 360);
        x.closePath(); x.fill();
      }
      x.fillStyle = "rgba(157,123,255,0.5)";
      for (i = 0; i < 26; i++) {
        x.beginPath();
        x.arc((i * 97) % 640, ((i * 53) % 300) + 30, 2.2, 0, 7);
        x.fill();
      }
    } else if (kind === "thornward") {
      g = x.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#12351f"); g.addColorStop(1, "#1d4a2a");
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#2b6a35";
      for (i = 0; i < 6; i++) {
        x.beginPath(); x.ellipse(320, 90 + i * 46, i * 58 + 30, 26, 0, 0, 7); x.fill();
      }
      x.fillStyle = "#ffb63d";
      x.beginPath(); x.arc(320, 80, 26, 0, 7); x.fill();
      x.fillStyle = "#e8517c";
      for (i = 0; i < 6; i++) {
        var px = 320 + Math.cos((i / 6) * Math.PI * 2) * 40;
        var py = 100 + Math.sin((i / 6) * Math.PI * 2) * 30;
        x.beginPath(); x.arc(px, py, 10, 0, 7); x.fill();
      }
      x.fillStyle = "rgba(40,20,60,0.55)";
      x.beginPath(); x.ellipse(560, 320, 120, 60, 0, 0, 7); x.fill();
      x.beginPath(); x.ellipse(60, 340, 100, 50, 0, 0, 7); x.fill();
    } else if (kind === "banana") {
      g = x.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#7ec9e8"); g.addColorStop(1, "#c8ecb0");
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#63b45c";
      for (i = 0; i < 4; i++) {
        x.beginPath(); x.ellipse(100 + i * 150, 330, 90, 34, 0, 0, 7); x.fill();
      }
      x.strokeStyle = "#ffd257"; x.lineWidth = 26; x.lineCap = "round";
      x.beginPath(); x.arc(430, 120, 46, 0.4, 2.6); x.stroke();
      x.fillStyle = "#8a5a2b";
      x.beginPath(); x.arc(310, 250, 26, 0, 7); x.fill();
      x.fillStyle = "#4a3018";
      x.beginPath(); x.arc(310, 250, 14, 0, 7); x.fill();
      x.fillStyle = "#fff";
      x.beginPath(); x.arc(304, 244, 4, 0, 7); x.fill();
      x.beginPath(); x.arc(316, 244, 4, 0, 7); x.fill();
    } else { // atlas8
      g = x.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#101626"); g.addColorStop(1, "#1a2440");
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#182238"; x.fillRect(160, 40, 320, 280);
      x.strokeStyle = "#3ddad7"; x.lineWidth = 4;
      x.strokeRect(160, 40, 320, 280);
      x.fillStyle = "#3ddad7";
      for (var py = 0; py < 12; py++) {
        for (var pxx = 0; pxx < 16; pxx++) {
          if ((pxx * py + py) % 3 === 0) x.fillRect(190 + pxx * 15, 80 + py * 12, 10, 8);
        }
      }
      x.fillStyle = "#ffb63d";
      x.font = "bold 22px 'Trebuchet MS', sans-serif";
      x.fillText("ATLAS-8", 268, 64);
    }
  }

  /* ---------- aggregate stats ---------- */
  function globalStats() {
    var missions = 0, stars = 0;
    Object.keys(profile.games).forEach(function (k) {
      var g = profile.games[k] || {};
      missions += g.missionsDone || 0;
      stars += g.starsTotal || 0;
    });
    return {
      games: 5,
      missions: missions,
      stars: stars,
      hours: fmtTime(profile.stats.playSeconds),
      achieves: Object.keys(profile.achievements).length,
      achieveTotal: ACHIEVEMENTS.length
    };
  }

  /* ---------- public API ---------- */
  var Atlas = {
    GAMES: GAMES,
    ACHIEVEMENTS: ACHIEVEMENTS,
    AVATAR_KINDS: AVATAR_KINDS,
    avatarSvg: avatarSvg,
    esc: esc,
    fmtTime: fmtTime,
    fmtDate: fmtDate,
    clamp: clamp,
    uid: uid,
    toast: toast,
    award: award,
    paintCover: paintCover,
    globalStats: globalStats,
    board: boardApi,
    persist: persist,
    showStorageError: showStorageError,
    profile: {
      get: function () { return profile; },
      setName: function (n) { profile.name = String(n || "").trim().slice(0, 20); persist(); },
      setAvatar: function (k) { profile.avatar = k; persist(); },
      setSetting: function (k, v) { profile.settings[k] = v; persist(); },
      game: function (id) {
        if (!profile.games[id]) profile.games[id] = {};
        return profile.games[id];
      },
      saveGame: function (id, data) {
        profile.games[id] = data;
        persist();
      },
      wipeGame: function (id) { delete profile.games[id]; persist(); },
      wipeAll: function () {
        var sessions = profile.stats.sessions;
        profile = defaultProfile();
        profile.stats.sessions = sessions;
        persist();
      },
      export: function () {
        var blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "arcade-atlas-save-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
      import: function (file, cb) {
        var r = new FileReader();
        r.onload = function () {
          try {
            var data = JSON.parse(r.result);
            if (!data || typeof data !== "object" || !data.stats || !data.settings) throw new Error("Not an Arcade Atlas save file");
            profile = Object.assign(defaultProfile(), data);
            persist();
            cb(null);
          } catch (e) { cb(e); }
        };
        r.onerror = function () { cb(new Error("Could not read file")); };
        r.readAsText(file);
      }
    },
    mountChrome: mountChrome,
    trackVisit: trackVisit
  };
  window.Atlas = Atlas;

  /* ---------- boot ---------- */
  function boot() {
    mountChrome();
    trackVisit();
    if (profile.stats.sessions === 1) {
      setTimeout(function () {
        toast("Welcome to Arcade Atlas!", "Create a profile on the Profile page so your campaign progress is saved under your name.");
      }, 900);
    }
  }
  // Profile must exist before page-level inline scripts run, so load it
  // synchronously now; chrome mounting waits for the DOM.
  loadProfile();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
