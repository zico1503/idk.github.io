/* ============================================================
   Thornward — content data: maps, towers, enemies, missions.
   Grid legend: '#' path · '.' grass (buildable) · '~' water ·
   'T' tree · 'R' rock · 'S' spawn · 'E' exit (Heartbloom).
   ============================================================ */
window.TWD = (function () {
  "use strict";

  var MAPS = {
    sunfield: [
      "................",
      ".S#####.........",
      "......#......~..",
      "......#..T......",
      "......#.........",
      "......#......T..",
      "......#####.....",
      "..........#.....",
      "..........#####E"
    ],
    brook: [
      "................",
      ".S..........T...",
      ".#.....######...",
      ".#.....#T...#...",
      ".#######....#...",
      ".......#....#...",
      ".......#....#...",
      ".......#....###E",
      "....~~~~........"
    ],
    hollow: [
      "................",
      ".........#####S.",
      ".........#....R.",
      "...#######......",
      "...#.......R....",
      "...#.......T....",
      "...###########..",
      ".............#..",
      ".............##E"
    ],
    mire: [
      "................",
      "....~....~......",
      "....~...........",
      "....#######~....",
      "....#.....#.....",
      "....#..T..#.....",
      "....#.....#.....",
      ".S####....#####E",
      "~~~...~~~......."
    ],
    hedge: [
      ".......S........",
      ".......#......T.",
      ".......######...",
      "....T.......#...",
      "...##########...",
      "...#............",
      "...#....T.......",
      "...############E",
      "..T..........T.."
    ]
  };

  var TOWERS = {
    sprout: {
      name: "Sprout Turret", icon: "🌱", cost: 60, hits: "ground+air",
      desc: "Quick dart shots. Reliable all-rounder.",
      tiers: [
        { dmg: 12, range: 105, rate: 1.1 },
        { dmg: 20, range: 118, rate: 1.0, cost: 55 },
        { dmg: 32, range: 132, rate: 0.9, cost: 110, note: "darts pierce" }
      ]
    },
    bramble: {
      name: "Bramble Wall", icon: "🧵", cost: 50, hits: "ground",
      desc: "Slows every ground blight nearby. No damage.",
      tiers: [
        { dmg: 0, range: 80, rate: 0, slow: 0.4 },
        { dmg: 0, range: 95, rate: 0, slow: 0.55, cost: 45 },
        { dmg: 6, range: 110, rate: 0.8, slow: 0.65, cost: 95, note: "thorn pricks" }
      ]
    },
    nettle: {
      name: "Nettle Spitter", icon: "🫧", cost: 110, hits: "ground",
      desc: "Splashes acid on clusters. Ground only.",
      tiers: [
        { dmg: 18, range: 115, rate: 0.8, splash: 36 },
        { dmg: 26, range: 128, rate: 0.8, splash: 42, cost: 90 },
        { dmg: 38, range: 140, rate: 0.75, splash: 50, cost: 160 }
      ]
    },
    sapling: {
      name: "Sap Bombard", icon: "💥", cost: 140, hits: "ground",
      desc: "Lobbed sap bombs: area burst + burning.",
      tiers: [
        { dmg: 40, range: 130, rate: 0.45, splash: 52, burn: 10 },
        { dmg: 58, range: 142, rate: 0.45, splash: 58, burn: 16, cost: 120 },
        { dmg: 80, range: 155, rate: 0.4, splash: 66, burn: 24, cost: 210 }
      ]
    },
    sunflower: {
      name: "Sunflower Bank", icon: "🌻", cost: 90, hits: "none",
      desc: "No defense — prints leaves every few seconds.",
      tiers: [
        { income: 8, every: 6, range: 0 },
        { income: 13, every: 6, cost: 80 },
        { income: 20, every: 5.5, cost: 150 }
      ]
    },
    falconer: {
      name: "Falconer Nest", icon: "🦅", cost: 130, hits: "air",
      desc: "The only answer to Sporewings. Air only.",
      tiers: [
        { dmg: 16, range: 150, rate: 0.5 },
        { dmg: 26, range: 165, rate: 0.45, cost: 110 },
        { dmg: 42, range: 180, rate: 0.4, cost: 190, note: "twin falcons" }
      ]
    },
    sentinel: {
      name: "Stone Sentinel", icon: "🗿", cost: 170, hits: "ground",
      desc: "Slow, heavy single hits with a chance to stun.",
      tiers: [
        { dmg: 60, range: 100, rate: 0.6, stun: 0.15 },
        { dmg: 95, range: 110, rate: 0.55, stun: 0.2, cost: 140 },
        { dmg: 150, range: 120, rate: 0.5, stun: 0.25, splash: 30, cost: 240 }
      ]
    },
    wisplight: {
      name: "Wisplight Lantern", icon: "🏮", cost: 200, hits: "ground+air",
      desc: "Pulsing gloam-light: chips everything, sheds armor.",
      tiers: [
        { dmg: 8, range: 95, rate: 2, shred: 0 },
        { dmg: 14, range: 108, rate: 1.8, cost: 150 },
        { dmg: 22, range: 120, rate: 1.6, shred: 1, cost: 260, note: "sheds armor" }
      ]
    }
  };
  var TOWER_ORDER = ["sprout", "bramble", "nettle", "sapling", "sunflower", "falconer", "sentinel", "wisplight"];

  var ENEMIES = {
    mite:     { name: "Gloom Mite",     hp: 22,   speed: 55, reward: 6,   dmg: 1,  color: "#8a5fc0" },
    runner:   { name: "Thicket Runner", hp: 16,   speed: 96, reward: 6,   dmg: 1,  color: "#d86a9c" },
    shellback:{ name: "Shellback",      hp: 60,   speed: 42, reward: 12,  dmg: 2,  color: "#5c8a5f", armor: 3 },
    sporewing:{ name: "Sporewing",      hp: 30,   speed: 72, reward: 10,  dmg: 1,  color: "#c9a0e8", flying: true },
    bulwark:  { name: "Bulwark",        hp: 140,  speed: 30, reward: 20,  dmg: 3,  color: "#4a6a8a" },
    chorister:{ name: "Mire Chorister", hp: 70,   speed: 45, reward: 16,  dmg: 2,  color: "#6ad0c0", heal: 12 },
    shade:    { name: "Gloom Shade",    hp: 48,   speed: 62, reward: 14,  dmg: 2,  color: "#3a3450", resist: true },
    warden:   { name: "Blight Warden",  hp: 320,  speed: 36, reward: 60,  dmg: 5,  color: "#7a3a8a", boss: true, brood: 6 },
    blightmaw:{ name: "Blightmaw",      hp: 950,  speed: 30, reward: 120, dmg: 8,  color: "#9a2a6a", boss: true },
    tyrant:   { name: "Mire Tyrant",    hp: 1700, speed: 26, reward: 160, dmg: 10, color: "#2a7a6a", boss: true },
    heart:    { name: "Heart of Blight",hp: 3400, speed: 24, reward: 300, dmg: 20, color: "#c0185a", boss: true, final: true }
  };

  /* ---------- 25 missions: [map, leaves, petals, waves] ----------
     Wave groups: [type, count, gapSeconds, delaySeconds]            */
  function w() { return Array.prototype.slice.call(arguments); }
  var MISSIONS = [
    // ---- Grove 1 · Sunfield ----
    { grove: 0, map: "sunfield", leaves: 240, petals: 10, name: "First Sprouts",
      tip: "Place Sprout Turrets on the corners — they cover the most path.",
      waves: [
        w(["mite", 6, 1.2, 0]),
        w(["mite", 9, 1.0, 0]),
        w(["mite", 8, 0.9, 0], ["mite", 4, 0.9, 5]),
        w(["runner", 3, 1.6, 0], ["mite", 8, 0.8, 4]),
        w(["mite", 14, 0.7, 0], ["runner", 3, 1.5, 6])
      ] },
    { grove: 0, map: "sunfield", leaves: 250, petals: 10, name: "Slow the Creep",
      tip: "A Bramble Wall behind a Sprout doubles your kill window.",
      waves: [
        w(["mite", 10, 0.9, 0]),
        w(["mite", 8, 0.8, 0], ["runner", 4, 1.3, 5]),
        w(["shellback", 2, 3.0, 0], ["mite", 8, 0.8, 3]),
        w(["mite", 12, 0.7, 0], ["shellback", 2, 3.0, 6]),
        w(["runner", 6, 1.1, 0], ["mite", 10, 0.7, 5]),
        w(["mite", 16, 0.6, 0], ["shellback", 3, 2.6, 5])
      ] },
    { grove: 0, map: "sunfield", leaves: 260, petals: 10, name: "Shellbacks Arrive",
      tip: "Nettle Spitter splash melts Shellback formations.",
      waves: [
        w(["shellback", 3, 2.6, 0]),
        w(["mite", 14, 0.65, 0], ["runner", 4, 1.2, 5]),
        w(["shellback", 4, 2.4, 0], ["mite", 10, 0.7, 4]),
        w(["runner", 8, 1.0, 0], ["shellback", 3, 2.4, 6]),
        w(["mite", 18, 0.55, 0], ["shellback", 4, 2.2, 5]),
        w(["shellback", 6, 2.0, 0], ["runner", 6, 1.0, 6])
      ] },
    { grove: 0, map: "sunfield", leaves: 280, petals: 10, name: "Warden's Vanguard",
      tip: "Save 200 leaves for the Warden — a Sentinel stuns it nicely.",
      waves: [
        w(["mite", 16, 0.6, 0]),
        w(["shellback", 4, 2.2, 0], ["runner", 6, 1.0, 5]),
        w(["runner", 10, 0.9, 0], ["mite", 12, 0.6, 4]),
        w(["shellback", 6, 2.0, 0], ["chorister", 1, 0, 4]),
        w(["mite", 20, 0.5, 0], ["runner", 6, 1.0, 6]),
        w(["warden", 1, 0, 0], ["mite", 10, 0.8, 4])
      ] },
    { grove: 0, map: "sunfield", leaves: 300, petals: 10, name: "Sunfield Holder",
      tip: "A Sunflower Bank early pays for itself by wave 3.",
      waves: [
        w(["mite", 18, 0.55, 0]),
        w(["shellback", 5, 2.0, 0], ["runner", 6, 1.0, 4]),
        w(["chorister", 2, 3.0, 0], ["mite", 14, 0.6, 3]),
        w(["runner", 12, 0.8, 0], ["shellback", 4, 2.0, 5]),
        w(["shellback", 8, 1.8, 0], ["mite", 14, 0.5, 4]),
        w(["warden", 1, 0, 0], ["runner", 8, 0.9, 4], ["mite", 12, 0.6, 8])
      ] },

    // ---- Grove 2 · Mossy Brook ----
    { grove: 1, map: "brook", leaves: 300, petals: 10, name: "Brook Watch",
      tip: "The brook path bends twice — corners are gold.",
      waves: [
        w(["mite", 16, 0.6, 0]),
        w(["mite", 12, 0.6, 0], ["runner", 6, 1.0, 5]),
        w(["shellback", 5, 2.0, 0], ["mite", 12, 0.6, 4]),
        w(["sporewing", 4, 1.6, 0], ["mite", 10, 0.7, 4]),
        w(["runner", 12, 0.8, 0], ["shellback", 4, 2.0, 5]),
        w(["sporewing", 6, 1.4, 0], ["mite", 14, 0.55, 5])
      ] },
    { grove: 1, map: "brook", leaves: 310, petals: 10, name: "Sporewing Season",
      tip: "Two Falconer Nests cover the whole bend.",
      waves: [
        w(["sporewing", 6, 1.4, 0]),
        w(["mite", 16, 0.55, 0], ["sporewing", 4, 1.5, 5]),
        w(["shellback", 6, 1.8, 0], ["sporewing", 5, 1.4, 4]),
        w(["runner", 14, 0.7, 0], ["sporewing", 6, 1.3, 5]),
        w(["sporewing", 10, 1.1, 0], ["mite", 14, 0.5, 5]),
        w(["shellback", 8, 1.6, 0], ["sporewing", 8, 1.1, 4])
      ] },
    { grove: 1, map: "brook", leaves: 320, petals: 10, name: "Chorister's Choir",
      tip: "Kill the Choristers first — they heal everything around them.",
      waves: [
        w(["chorister", 2, 3.0, 0], ["mite", 12, 0.6, 3]),
        w(["shellback", 6, 1.7, 0], ["chorister", 2, 3.0, 4]),
        w(["sporewing", 8, 1.2, 0], ["chorister", 2, 3.0, 4]),
        w(["runner", 14, 0.7, 0], ["chorister", 3, 2.6, 5]),
        w(["shellback", 8, 1.5, 0], ["chorister", 3, 2.5, 4]),
        w(["chorister", 4, 2.2, 0], ["mite", 20, 0.5, 4])
      ] },
    { grove: 1, map: "brook", leaves: 340, petals: 10, name: "Shade Falls",
      tip: "Shades shrug off half damage — slow them with Bramble first.",
      waves: [
        w(["shade", 4, 2.0, 0], ["mite", 10, 0.7, 3]),
        w(["shade", 6, 1.8, 0], ["runner", 10, 0.8, 4]),
        w(["shellback", 6, 1.7, 0], ["shade", 5, 1.7, 4]),
        w(["sporewing", 8, 1.2, 0], ["shade", 6, 1.6, 4]),
        w(["shade", 9, 1.4, 0], ["chorister", 2, 3.0, 4]),
        w(["warden", 1, 0, 0], ["shade", 6, 1.5, 4])
      ] },
    { grove: 1, map: "brook", leaves: 360, petals: 10, name: "Brook Warden",
      tip: "Bulwarks tank everything — sap bombs burn through them.",
      waves: [
        w(["bulwark", 2, 4.0, 0], ["mite", 14, 0.55, 4]),
        w(["shade", 6, 1.6, 0], ["sporewing", 6, 1.3, 4]),
        w(["bulwark", 3, 3.6, 0], ["chorister", 2, 3.0, 4]),
        w(["runner", 16, 0.65, 0], ["shade", 6, 1.5, 5]),
        w(["bulwark", 4, 3.2, 0], ["sporewing", 8, 1.1, 4]),
        w(["warden", 1, 0, 0], ["bulwark", 2, 3.5, 4], ["shade", 8, 1.3, 8])
      ] },

    // ---- Grove 3 · Stonehollow ----
    { grove: 2, map: "hollow", leaves: 360, petals: 10, name: "Stone Gauntlet",
      tip: "The long switchback rewards a Sentinel at each turn.",
      waves: [
        w(["shellback", 8, 1.4, 0]),
        w(["runner", 16, 0.6, 0], ["shade", 5, 1.6, 5]),
        w(["bulwark", 4, 3.0, 0], ["mite", 16, 0.5, 4]),
        w(["sporewing", 10, 1.0, 0], ["shellback", 6, 1.5, 4]),
        w(["shade", 8, 1.3, 0], ["chorister", 3, 2.4, 4]),
        w(["bulwark", 6, 2.6, 0], ["runner", 12, 0.6, 4])
      ] },
    { grove: 2, map: "hollow", leaves: 370, petals: 10, name: "Echoing Halls",
      tip: "Wisplight Lanterns shed armor — perfect vs Shellback walls.",
      waves: [
        w(["shellback", 10, 1.3, 0]),
        w(["shade", 8, 1.3, 0], ["sporewing", 8, 1.1, 4]),
        w(["bulwark", 6, 2.4, 0], ["chorister", 3, 2.4, 4]),
        w(["runner", 18, 0.55, 0], ["shellback", 6, 1.4, 5]),
        w(["shellback", 10, 1.2, 0], ["shade", 8, 1.2, 4]),
        w(["sporewing", 14, 0.9, 0], ["chorister", 3, 2.4, 4])
      ] },
    { grove: 2, map: "hollow", leaves: 380, petals: 10, name: "Warden Pit",
      tip: "Two Wardens — stun them with Sentinels and focus fire.",
      waves: [
        w(["bulwark", 6, 2.2, 0]),
        w(["shade", 10, 1.2, 0], ["mite", 18, 0.45, 4]),
        w(["warden", 2, 8.0, 0], ["runner", 12, 0.6, 4]),
        w(["shellback", 10, 1.2, 0], ["chorister", 3, 2.4, 4]),
        w(["sporewing", 14, 0.9, 0], ["shade", 8, 1.2, 4]),
        w(["warden", 2, 8.0, 0], ["bulwark", 4, 2.6, 4])
      ] },
    { grove: 2, map: "hollow", leaves: 400, petals: 10, name: "Blightmaw's Maw",
      tip: "BOSS: Blightmaw. Sap-bomb burns and stuns chew through it.",
      waves: [
        w(["shellback", 10, 1.2, 0]),
        w(["shade", 10, 1.1, 0], ["runner", 14, 0.55, 4]),
        w(["bulwark", 8, 2.0, 0], ["chorister", 4, 2.2, 4]),
        w(["sporewing", 16, 0.85, 0], ["shade", 8, 1.1, 4]),
        w(["blightmaw", 1, 0, 0], ["mite", 16, 0.5, 6])
      ] },
    { grove: 2, map: "hollow", leaves: 420, petals: 10, name: "Hollow Sentinel",
      tip: "Everything at once. Sunflowers fund a big final wave defense.",
      waves: [
        w(["runner", 20, 0.5, 0]),
        w(["shellback", 12, 1.0, 0], ["sporewing", 10, 0.9, 4]),
        w(["shade", 12, 1.0, 0], ["chorister", 4, 2.2, 4]),
        w(["bulwark", 8, 1.8, 0], ["runner", 16, 0.5, 4]),
        w(["warden", 2, 7.0, 0], ["shade", 10, 1.0, 4]),
        w(["shellback", 12, 1.0, 0], ["sporewing", 12, 0.8, 4], ["chorister", 3, 2.5, 8])
      ] },

    // ---- Grove 4 · Mirefen ----
    { grove: 3, map: "mire", leaves: 420, petals: 10, name: "Into the Mire",
      tip: "Build on the dry pockets between the water.",
      waves: [
        w(["shade", 12, 1.0, 0]),
        w(["chorister", 4, 2.2, 0], ["bulwark", 6, 2.0, 4]),
        w(["sporewing", 14, 0.85, 0], ["shade", 8, 1.0, 4]),
        w(["runner", 22, 0.45, 0], ["shellback", 8, 1.2, 5]),
        w(["bulwark", 8, 1.8, 0], ["chorister", 4, 2.2, 4]),
        w(["shade", 14, 0.9, 0], ["sporewing", 10, 0.9, 4])
      ] },
    { grove: 3, map: "mire", leaves: 430, petals: 10, name: "Tyrant's Wake",
      tip: "BOSS: Mire Tyrant. It is slow — stack slows and burns.",
      waves: [
        w(["bulwark", 8, 1.8, 0]),
        w(["shade", 14, 0.9, 0], ["chorister", 4, 2.2, 4]),
        w(["sporewing", 16, 0.8, 0], ["runner", 16, 0.5, 4]),
        w(["shellback", 12, 1.0, 0], ["chorister", 4, 2.2, 4]),
        w(["tyrant", 1, 0, 0], ["shade", 10, 1.0, 5])
      ] },
    { grove: 3, map: "mire", leaves: 440, petals: 10, name: "Bog Broodlands",
      tip: "Warden broods burst into mites — keep splash coverage.",
      waves: [
        w(["warden", 2, 6.0, 0], ["mite", 20, 0.4, 4]),
        w(["sporewing", 18, 0.75, 0], ["chorister", 4, 2.2, 4]),
        w(["shade", 16, 0.85, 0], ["bulwark", 6, 1.9, 4]),
        w(["warden", 3, 6.0, 0], ["runner", 16, 0.45, 4]),
        w(["shellback", 14, 0.9, 0], ["chorister", 5, 2.0, 4]),
        w(["warden", 2, 6.0, 0], ["sporewing", 14, 0.75, 4])
      ] },
    { grove: 3, map: "mire", leaves: 460, petals: 10, name: "Mire Champions",
      tip: "Elites all: armor, healing and shades together.",
      waves: [
        w(["shellback", 14, 0.9, 0], ["chorister", 4, 2.2, 4]),
        w(["shade", 16, 0.8, 0], ["bulwark", 8, 1.7, 4]),
        w(["runner", 24, 0.4, 0], ["sporewing", 16, 0.75, 4]),
        w(["chorister", 6, 1.8, 0], ["shellback", 10, 1.0, 4]),
        w(["bulwark", 10, 1.5, 0], ["shade", 14, 0.8, 4]),
        w(["warden", 3, 5.5, 0], ["chorister", 5, 2.0, 4])
      ] },
    { grove: 3, map: "mire", leaves: 480, petals: 10, name: "Tyrant Twins",
      tip: "Two Tyrants, one path. Wisplight armor-shred is vital.",
      waves: [
        w(["sporewing", 18, 0.7, 0]),
        w(["shellback", 16, 0.8, 0], ["chorister", 5, 2.0, 4]),
        w(["shade", 18, 0.75, 0], ["bulwark", 8, 1.6, 4]),
        w(["runner", 26, 0.38, 0], ["warden", 2, 5.5, 4]),
        w(["tyrant", 2, 10.0, 0], ["chorister", 5, 2.0, 5])
      ] },

    // ---- Grove 5 · Nightmare Hedge ----
    { grove: 4, map: "hedge", leaves: 480, petals: 10, name: "Hedge Nightmare",
      tip: "The finale gauntlet begins. Everything you've learned.",
      waves: [
        w(["shade", 18, 0.7, 0]),
        w(["bulwark", 10, 1.5, 0], ["sporewing", 16, 0.75, 4]),
        w(["runner", 28, 0.35, 0], ["chorister", 6, 1.8, 4]),
        w(["shellback", 16, 0.8, 0], ["shade", 12, 0.8, 4]),
        w(["warden", 3, 5.0, 0], ["sporewing", 16, 0.7, 4]),
        w(["bulwark", 12, 1.4, 0], ["chorister", 6, 1.8, 4])
      ] },
    { grove: 4, map: "hedge", leaves: 500, petals: 10, name: "Whispering Thorns",
      tip: "Shade packs with Chorister support — burst them down.",
      waves: [
        w(["chorister", 6, 1.8, 0], ["shade", 16, 0.75, 4]),
        w(["sporewing", 20, 0.7, 0], ["shellback", 12, 0.9, 4]),
        w(["bulwark", 12, 1.3, 0], ["runner", 24, 0.35, 4]),
        w(["warden", 4, 5.0, 0], ["chorister", 6, 1.8, 4]),
        w(["shade", 20, 0.7, 0], ["bulwark", 10, 1.4, 4]),
        w(["shellback", 18, 0.7, 0], ["sporewing", 18, 0.65, 4])
      ] },
    { grove: 4, map: "hedge", leaves: 520, petals: 10, name: "Warden Convergence",
      tip: "Four Wardens. Stun chains or drown in broods.",
      waves: [
        w(["warden", 4, 4.5, 0]),
        w(["shellback", 18, 0.7, 0], ["chorister", 6, 1.8, 4]),
        w(["runner", 30, 0.3, 0], ["shade", 16, 0.7, 4]),
        w(["bulwark", 12, 1.3, 0], ["sporewing", 20, 0.65, 4]),
        w(["warden", 4, 4.5, 0], ["chorister", 8, 1.6, 4]),
        w(["shade", 22, 0.6, 0], ["runner", 24, 0.3, 4])
      ] },
    { grove: 4, map: "hedge", leaves: 560, petals: 10, name: "The Long Dark",
      tip: "Longest defense before the Heart. Bank leaves early.",
      waves: [
        w(["shellback", 20, 0.65, 0], ["chorister", 6, 1.8, 4]),
        w(["bulwark", 14, 1.2, 0], ["shade", 18, 0.65, 4]),
        w(["sporewing", 24, 0.6, 0], ["runner", 26, 0.3, 4]),
        w(["warden", 5, 4.5, 0], ["chorister", 8, 1.6, 4]),
        w(["shade", 24, 0.6, 0], ["bulwark", 12, 1.3, 4]),
        w(["shellback", 20, 0.6, 0], ["sporewing", 20, 0.6, 4], ["chorister", 6, 1.8, 8])
      ] },
    { grove: 4, map: "hedge", leaves: 600, petals: 12, name: "Heart of Blight",
      tip: "FINAL BOSS: the Heart of Blight and its endless court.",
      waves: [
        w(["shellback", 16, 0.7, 0]),
        w(["shade", 20, 0.6, 0], ["sporewing", 18, 0.65, 4]),
        w(["bulwark", 14, 1.2, 0], ["chorister", 8, 1.6, 4]),
        w(["runner", 30, 0.3, 0], ["warden", 4, 4.5, 4]),
        w(["heart", 1, 0, 0], ["shade", 12, 1.0, 8], ["sporewing", 12, 0.9, 14])
      ] }
  ];

  /* ---------- Requisition perks (bought with stars, permanent) ---------- */
  var PERKS = [
    { id: "cache",     name: "Leaf Cache",       cost: 3,  desc: "Start every mission with +40 leaves." },
    { id: "discount",  name: "Seed Bargains",    cost: 4,  desc: "All towers cost 10% less." },
    { id: "mend",      name: "Petal Ward",       cost: 5,  desc: "Heartbloom starts with 2 extra petals." },
    { id: "mastery",   name: "Thorn Mastery",    cost: 6,  desc: "All towers deal +10% damage." },
    { id: "bloom",     name: "Bloom Pockets",    cost: 5,  desc: "Sunflower Banks generate +25% leaves." },
    { id: "harvest",   name: "Bounty Harvest",   cost: 4,  desc: "Blight kills drop +15% leaves." }
  ];

  var GROVES = [
    { name: "Sunfield",      tint: "#57d98a", sky: "#16281c" },
    { name: "Mossy Brook",   tint: "#3ddad7", sky: "#13232a" },
    { name: "Stonehollow",   tint: "#9aa7c9", sky: "#1c2030" },
    { name: "Mirefen",       tint: "#6ad0c0", sky: "#142620" },
    { name: "Nightmare Hedge", tint: "#c86ad0", sky: "#201226" }
  ];

  return { MAPS: MAPS, TOWERS: TOWERS, TOWER_ORDER: TOWER_ORDER, ENEMIES: ENEMIES, MISSIONS: MISSIONS, PERKS: PERKS, GROVES: GROVES };
})();
