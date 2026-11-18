/* ============================================================
   Emberhollow — content data.
   Map legend: '#' rock/wall · 'T' tree · '~' water · 'r' rock
   'A' shrine · 's' stone floor · 'p' path · 'f' flowers ·
   'w' weeds · '.' ground.  Doors/pickups/NPCs are separate
   lists (tile coords). Borders are normalized by the engine.
   ============================================================ */
window.EHD = (function () {
  "use strict";

  var MAPS = {
    village: [
      "##############################",
      "#....f.......f.......f.......#",
      "#..f.....ww.........f....f...#",
      "#.....####........####.......#",
      "#.....#..#..f.f...#..#...w...#",
      "#..f..#..#........#..#.......#",
      "#.....####...ss...####...f...#",
      "#..w......fsssss.............#",
      "#.........sssssss....f...w...#",
      "#...f.....sssssssss..........#",
      "#.........sssssssss.........f#",
      "#..f......sssssss....w.......#",
      "#....f......sss......f...r...#",
      "#.........f....f.............#",
      "#..r.............f....w......#",
      "#....f...####........f.......#",
      "#........#..#...w........f...#",
      "#...f....####...............f#",
      "#....w......f......f....w....#",
      "##############################"
    ],
    fields: [
      "##############################",
      "#...w.....T..........T.......#",
      "#........T....p...... ...w...#",
      "#..T.........ppp...T.........#",
      "#......f....pp..pp........T..#",
      "#.T........pp....pp....f.....#",
      "#.....f...pp...f...pp........#",
      "#..w.....pp.........pp...T...#",
      "#.......pp....T......p.......#",
      "#..T...pp........f....ppp....#",
      "#.....pp......w.........pp...#",
      "#...pp.......T....T......p...#",
      "#..pp....f..........f....pp..#",
      "#.pp.........w.........f..p..#",
      "#.p....T..........T.......p..#",
      "#.p.........f......w......pp.#",
      "#..pp....T........T.......p..#",
      "#...ppp........f........pp...#",
      "#.....wppp..........ppp......#",
      "##############################"
    ],
    forest: [
      "##############################",
      "#.T.T..T...T..T....T...T..T..#",
      "#.T....T..TT...T..T..TT....T.#",
      "#....T.....T..T....T......T..#",
      "#.T..T..T.....TT...T..T......#",
      "#...T....T..T.....T....T..T..#",
      "#.T...T....T....T...T........#",
      "#....TT...T....T....TT...T...#",
      "#..T.....T...T....T......TT..#",
      "#....T...T....T..T...T.......#",
      "#.T..TT.....T.....T...T..T...#",
      "#...T....T....TT......T......#",
      "#.T....T....T.....T.T....T...#",
      "#...TT...T....T..T....TT.....#",
      "#.T......T..T.....T.......T..#",
      "#....T..T....T..T....T...T...#",
      "#.T....T...T.....T.T.....T...#",
      "#...T....T....T...T....T.....#",
      "#.T..T....T..T...T...T....T..#",
      "##############################"
    ],
    marsh: [
      "##############################",
      "#....~~~.....~~......~~~.....#",
      "#..~~~~~....~~~~....~~~~~....#",
      "#...~~~.....~~~~.....~~~.....#",
      "#....~~...p....p....~~.......#",
      "#........pp.....pp...........#",
      "#..~~~..pp.......pp...~~~....#",
      "#..~~~~pp.........pp~~~~~....#",
      "#...~~p............p~~~......#",
      "#....p.....~~~~......p.......#",
      "#...p.....~~~~~~......p......#",
      "#..p......~~~~~~.......p.....#",
      "#..p.......~~~~........p.....#",
      "#...p......~~..........p.....#",
      "#....p...............p.......#",
      "#.....ppp.....~~~....pp......#",
      "#........ppp..~~..ppp........#",
      "#..~~~......pppppp......~~~..#",
      "#..~~~......................f#",
      "##############################"
    ],
    keep: [
      "##############################",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssss####ssssssssss####ssssss#",
      "#ssss#..#ssssssssss#..#ssssss#",
      "#ssss#..#ssssssssss#..#ssssss#",
      "#ssss####ssssssssss####ssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssss####ssssssssssss####ssss#",
      "#ssss#..#ssssssssssss#..#ssss#",
      "#ssss#..#ssssssssssss#..#ssss#",
      "#ssss####ssssssssssss####ssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "#ssssssssssssssssssssssssssss#",
      "##############################"
    ],
    dawn: [
      "##############################",
      "#...........f................#",
      "#..ppppppppppppppppppppppp...#",
      "#..p.....................p...#",
      "#..p...T.........T.......p...#",
      "#..ppppppppppppppppppp...p...#",
      "#........f............p..p...#",
      "#..T..........T.......pp.p...#",
      "#..ppppppppppppppppppppp.p...#",
      "#..p....................pp...#",
      "#..p..T........T.........p...#",
      "#..pppppppppppppppppp....p...#",
      "#........f...........p...p...#",
      "#..............T.....p...p...#",
      "#..T................pp...p...#",
      "#..pppppppppppppppppp....p...#",
      "#..p.....................p...#",
      "#..p...T.........T.......p...#",
      "#..ppppppppppppppppppppppp...#",
      "##############################"
    ]
  };

  /* doors: walking onto the tile transitions (gate = chapter index
     that must be COMPLETE to pass, or 0 for always open) */
  var DOORS = [
    { map: "village", x: 28, y: 10, to: "fields", tx: 2,  ty: 10, gate: 0 },
    { map: "fields",  x: 1,  y: 10, to: "village", tx: 27, ty: 10, gate: 0 },
    { map: "fields",  x: 28, y: 10, to: "forest",  tx: 2,  ty: 10, gate: 1 },
    { map: "forest",  x: 1,  y: 10, to: "fields",  tx: 27, ty: 10, gate: 0 },
    { map: "forest",  x: 28, y: 10, to: "marsh",   tx: 2,  ty: 10, gate: 2 },
    { map: "marsh",   x: 1,  y: 10, to: "forest",  tx: 27, ty: 10, gate: 0 },
    { map: "marsh",   x: 28, y: 10, to: "keep",    tx: 2,  ty: 10, gate: 3 },
    { map: "keep",    x: 1,  y: 10, to: "marsh",   tx: 27, ty: 10, gate: 0 },
    { map: "keep",    x: 28, y: 10, to: "dawn",    tx: 2,  ty: 10, gate: 4 },
    { map: "dawn",    x: 1,  y: 10, to: "keep",    tx: 27, ty: 10, gate: 0 }
  ];

  var BRAZIERS = [
    { map: "village", x: 9,  y: 8 },  { map: "village", x: 21, y: 8 },
    { map: "village", x: 9,  y: 15 }, { map: "village", x: 21, y: 15 },
    { map: "fields",  x: 4,  y: 8 },  { map: "fields",  x: 24, y: 6 },
    { map: "forest",  x: 4,  y: 10 }, { map: "forest",  x: 14, y: 4 },
    { map: "marsh",   x: 5,  y: 12 }, { map: "marsh",   x: 22, y: 4 },
    { map: "keep",    x: 5,  y: 8 },  { map: "keep",    x: 24, y: 14 },
    { map: "dawn",    x: 5,  y: 10 }, { map: "dawn",    x: 20, y: 6 }
  ];

  var SHRINES = [
    { map: "forest", x: 8,  y: 9 }, { map: "forest", x: 15, y: 12 }, { map: "forest", x: 21, y: 7 }
  ];

  /* ferry puzzle: step on all plates to raise the stones */
  var PLATES = [
    { map: "marsh", x: 12, y: 4 }, { map: "marsh", x: 17, y: 5 },
    { map: "marsh", x: 9,  y: 14 }, { map: "marsh", x: 20, y: 15 }
  ];
  var STONES = { marsh: [[13, 9], [14, 10], [13, 11], [12, 12], [11, 13]] };

  var PICKUPS = [
    // moonpetals (ch2)
    { map: "forest", x: 5,  y: 3,  kind: "petal", id: "p1" },
    { map: "forest", x: 24, y: 4,  kind: "petal", id: "p2" },
    { map: "forest", x: 10, y: 15, kind: "petal", id: "p3" },
    { map: "forest", x: 20, y: 16, kind: "petal", id: "p4" },
    { map: "forest", x: 26, y: 12, kind: "petal", id: "p5" },
    { map: "forest", x: 15, y: 8,  kind: "petal", id: "p6" },
    // marsh wisps (ch3)
    { map: "marsh", x: 7,  y: 3,  kind: "wisp", id: "w1" },
    { map: "marsh", x: 24, y: 3,  kind: "wisp", id: "w2" },
    { map: "marsh", x: 12, y: 17, kind: "wisp", id: "w3" },
    { map: "marsh", x: 26, y: 16, kind: "wisp", id: "w4" },
    // keep keys (ch4)
    { map: "keep", x: 6,  y: 5,  kind: "key", id: "k1" },
    { map: "keep", x: 23, y: 5,  kind: "key", id: "k2" },
    { map: "keep", x: 6,  y: 13, kind: "key", id: "k3" },
    // glowcaps (side quest)
    { map: "forest", x: 3,  y: 6,  kind: "glowcap", id: "g1" },
    { map: "forest", x: 27, y: 15, kind: "glowcap", id: "g2" },
    { map: "forest", x: 12, y: 10, kind: "glowcap", id: "g3" },
    // marsh ledger pages (side quest)
    { map: "marsh", x: 4,  y: 2,  kind: "ledger", id: "l1" },
    { map: "marsh", x: 27, y: 5,  kind: "ledger", id: "l2" },
    { map: "marsh", x: 16, y: 11, kind: "ledger", id: "l3" },
    { map: "marsh", x: 24, y: 13, kind: "ledger", id: "l4" },
    // keep relics (side quest)
    { map: "keep", x: 24, y: 13, kind: "relic", id: "rl1" },
    { map: "keep", x: 23, y: 3,  kind: "relic", id: "rl2" },
    // fields locket (side quest)
    { map: "fields", x: 26, y: 17, kind: "locket", id: "lk1" },
    // emberlings (12, cosmetic)
    { map: "village", x: 2,  y: 17, kind: "emberling", id: "e1" },
    { map: "village", x: 27, y: 3,  kind: "emberling", id: "e2" },
    { map: "fields",  x: 2,  y: 3,  kind: "emberling", id: "e3" },
    { map: "fields",  x: 27, y: 13, kind: "emberling", id: "e4" },
    { map: "forest",  x: 2,  y: 17, kind: "emberling", id: "e5" },
    { map: "forest",  x: 27, y: 2,  kind: "emberling", id: "e6" },
    { map: "marsh",   x: 2,  y: 2,  kind: "emberling", id: "e7" },
    { map: "marsh",   x: 27, y: 17, kind: "emberling", id: "e8" },
    { map: "keep",    x: 2,  y: 2,  kind: "emberling", id: "e9" },
    { map: "keep",    x: 27, y: 17, kind: "emberling", id: "e10" },
    { map: "dawn",    x: 2,  y: 2,  kind: "emberling", id: "e11" },
    { map: "dawn",    x: 27, y: 17, kind: "emberling", id: "e12" },
    // lore pages (10)
    { map: "village", x: 6,  y: 12, kind: "lore", id: "lo1" },
    { map: "fields",  x: 13, y: 13, kind: "lore", id: "lo2" },
    { map: "forest",  x: 18, y: 6,  kind: "lore", id: "lo3" },
    { map: "forest",  x: 7,  y: 14, kind: "lore", id: "lo4" },
    { map: "marsh",   x: 21, y: 9,  kind: "lore", id: "lo5" },
    { map: "marsh",   x: 6,  y: 16, kind: "lore", id: "lo6" },
    { map: "keep",    x: 14, y: 5,  kind: "lore", id: "lo7" },
    { map: "keep",    x: 15, y: 15, kind: "lore", id: "lo8" },
    { map: "dawn",    x: 9,  y: 6,  kind: "lore", id: "lo9" },
    { map: "dawn",    x: 22, y: 13, kind: "lore", id: "lo10" }
  ];

  var LORE_TEXT = {
    lo1:  "Warden's note 1: 'The Gloam does not hate us. It simply cannot remember light. Pity it, and cut it down all the same.'",
    lo2:  "Scout's log: 'The mites fear the braziers. Keep them lit and the fields stay ours.'",
    lo3:  "Hermit's diary: 'The shrines sing to each other at dusk. I have heard three voices. There may be more.'",
    lo4:  "Torn page: '...the Thornmaw was a guardian once. The Gloam unmade it. Do not blame the beast; blame the dark.'",
    lo5:  "Ferryman's verse: 'Four whispers for the ferry stones. Step lightly, warden. The marsh remembers.'",
    lo6:  "Drowned ledger: 'We paid the marsh in lantern oil. It always wanted more.'",
    lo7:  "Keep inscription: 'THE PALE WARD STANDS UNTIL DAWN. DAWN IS A PROMISE, NOT A TIME.'",
    lo8:  "Knight's prayer: 'If you carry the Last Lantern, light our alcoves. We will hold the halls with you.'",
    lo9:  "Umbral warning: 'Do not climb at night. The King wears the dark like a crown.'",
    lo10: "Final page: 'The Gloam is not the end of the story. It is the page before sunrise.'"
  };

  var NPCS = [
    { map: "village", x: 12, y: 6,  id: "maren",   name: "Elder Maren" },
    { map: "village", x: 18, y: 5,  id: "bram",    name: "Merchant Bram" },
    { map: "fields",  x: 14, y: 6,  id: "pella",   name: "Scout Pella" },
    { map: "forest",  x: 14, y: 9,  id: "hermit",  name: "Hermit Oaklyn" },
    { map: "marsh",   x: 10, y: 13, id: "sul",     name: "Ferryman Sul" },
    { map: "keep",    x: 15, y: 10, id: "ghost",   name: "Warden's Echo" }
  ];

  var SPAWNS = [
    { map: "fields", x: 8,  y: 4,  w: 5, h: 4, enemy: "mite",   max: 4, respawn: 22 },
    { map: "fields", x: 18, y: 8,  w: 6, h: 4, enemy: "mite",   max: 4, respawn: 22 },
    { map: "fields", x: 10, y: 13, w: 5, h: 4, enemy: "stalker",max: 2, respawn: 30 },
    { map: "fields", x: 21, y: 12, w: 4, h: 4, enemy: "husk",   max: 2, respawn: 34 },
    { map: "forest", x: 6,  y: 6,  w: 5, h: 4, enemy: "mite",   max: 3, respawn: 26 },
    { map: "forest", x: 19, y: 5,  w: 5, h: 4, enemy: "stalker",max: 2, respawn: 28 },
    { map: "forest", x: 8,  y: 14, w: 5, h: 3, enemy: "spitter",max: 2, respawn: 28 },
    { map: "forest", x: 20, y: 13, w: 5, h: 3, enemy: "wisp",   max: 3, respawn: 26 },
    { map: "marsh",  x: 8,  y: 3,  w: 4, h: 3, enemy: "wisp",   max: 3, respawn: 24 },
    { map: "marsh",  x: 20, y: 8,  w: 4, h: 4, enemy: "spitter",max: 2, respawn: 26 },
    { map: "marsh",  x: 10, y: 15, w: 5, h: 3, enemy: "husk",   max: 2, respawn: 30 },
    { map: "marsh",  x: 22, y: 15, w: 4, h: 3, enemy: "stalker",max: 2, respawn: 28 },
    { map: "keep",   x: 8,  y: 8,  w: 4, h: 4, enemy: "shielder",max: 2, respawn: 30 },
    { map: "keep",   x: 18, y: 8,  w: 4, h: 4, enemy: "knight", max: 2, respawn: 34 },
    { map: "keep",   x: 8,  y: 15, w: 4, h: 3, enemy: "knight", max: 2, respawn: 34 },
    { map: "keep",   x: 20, y: 15, w: 4, h: 3, enemy: "spitter",max: 2, respawn: 28 },
    { map: "dawn",   x: 8,  y: 8,  w: 4, h: 4, enemy: "knight", max: 2, respawn: 30 },
    { map: "dawn",   x: 14, y: 12, w: 4, h: 4, enemy: "shielder",max: 2, respawn: 30 },
    { map: "dawn",   x: 18, y: 6,  w: 4, h: 4, enemy: "stalker",max: 2, respawn: 28 },
    { map: "dawn",   x: 22, y: 10, w: 4, h: 4, enemy: "husk",   max: 2, respawn: 32 }
  ];

  var EMBER_NODES = [
    { map: "fields", x: 6,  y: 10 }, { map: "fields", x: 17, y: 5 }, { map: "fields", x: 22, y: 16 },
    { map: "forest", x: 10, y: 4 },  { map: "forest", x: 23, y: 9 }, { map: "forest", x: 6,  y: 16 },
    { map: "marsh",  x: 14, y: 3 },  { map: "marsh", x: 24, y: 10 }, { map: "marsh", x: 8,  y: 12 },
    { map: "keep",   x: 12, y: 12 }, { map: "keep", x: 20, y: 4 },  { map: "keep", x: 26, y: 9 },
    { map: "dawn",   x: 10, y: 10 }, { map: "dawn", x: 20, y: 14 }, { map: "dawn", x: 25, y: 3 }
  ];

  var BOSSES = {
    husk:     { map: "fields", x: 25, y: 16, name: "Gloom Husk" },
    thornmaw: { map: "forest", x: 25, y: 4,  name: "Thornmaw" },
    tyrant:   { map: "marsh",  x: 25, y: 15, name: "Mire Tyrant" },
    paleward: { map: "keep",   x: 25, y: 4,  name: "The Pale Ward" },
    umbral:   { map: "dawn",   x: 25, y: 5,  name: "The Umbral King" }
  };

  var ENEMIES = {
    mite:     { hp: 18,  dmg: 8,  speed: 85,  aggro: 200, shard: 2, color: "#7a5fc0", r: 9 },
    husk:     { hp: 55,  dmg: 14, speed: 45,  aggro: 220, shard: 3, color: "#5a4a6a", r: 13 },
    stalker:  { hp: 30,  dmg: 12, speed: 70,  aggro: 240, shard: 2, color: "#a04a6a", r: 10, lunge: true },
    spitter:  { hp: 26,  dmg: 10, speed: 40,  aggro: 260, shard: 2, color: "#4a7a5a", r: 10, ranged: true },
    wisp:     { hp: 14,  dmg: 6,  speed: 55,  aggro: 240, shard: 1, color: "#9a8ae0", r: 8, flying: true },
    shielder: { hp: 60,  dmg: 12, speed: 42,  aggro: 220, shard: 3, color: "#4a6a8a", r: 12, shield: true },
    knight:   { hp: 90,  dmg: 16, speed: 60,  aggro: 240, shard: 4, color: "#b8c2d8", r: 12 },
    shade:    { hp: 40,  dmg: 12, speed: 75,  aggro: 260, shard: 2, color: "#3a3450", r: 10 }
  };

  var BOSS_STATS = {
    husk:     { hp: 380,  dmg: 16, speed: 40,  r: 20, color: "#5a4a6a", slam: true },
    thornmaw: { hp: 700,  dmg: 18, speed: 55,  r: 22, color: "#4a6a3a", charge: true, brood: 2 },
    tyrant:   { hp: 1100, dmg: 20, speed: 36,  r: 24, color: "#2a7a6a", slam: true, volley: true },
    paleward: { hp: 1500, dmg: 22, speed: 60,  r: 20, color: "#c8d2e8", teleport: true, summon: true },
    umbral:   { hp: 2400, dmg: 24, speed: 50,  r: 24, color: "#2a2440", slam: true, volley: true, summon: true, phase2: true }
  };

  /* ---------- chapters (main quests) ---------- */
  var CHAPTERS = [
    { id: 1, name: "Ember's Wake", zone: "village",
      intro: ["Elder Maren: 'So the Last Lantern chose you at last. Three dawns ago the Gloam swallowed our light. The braziers went cold — relight them, and the village will believe again.'",
              "Elder Maren: 'Mind the fields east of here. Gloom mites crawl where the light died. Clear what you can — and when the ground starts to breathe, run for a brazier.'"],
      objectives: [
        { type: "brazier", count: 4, desc: "Relight the village braziers" },
        { type: "kill", enemy: "mite", count: 10, desc: "Cull gloom mites in the fields" },
        { type: "boss", boss: "husk", desc: "Defeat the Gloom Husk" }
      ],
      outro: ["Elder Maren: 'The Husk is ash and the braziers breathe again. You are a Warden now, truly. The road east leads to the Gloomwood — its shrines still sing, if you have ears.'"],
      reward: 40 },
    { id: 2, name: "The Gloomwood", zone: "forest",
      intro: ["Hermit Oaklyn: 'A living Warden! The wood has been whispering about you for days. The Gloam drowned our moonpetals — gather six that still shine, and the shrines will remember their song.'",
              "Hermit Oaklyn: 'Light all three shrines. But beware the Thornmaw that walks the north clearing. It was a guardian once; now it is only hunger shaped like a hedge.'"],
      objectives: [
        { type: "collect", item: "petal", count: 6, desc: "Gather shining moonpetals" },
        { type: "shrine", count: 3, desc: "Light the three forest shrines" },
        { type: "boss", boss: "thornmaw", desc: "Defeat the Thornmaw" }
      ],
      outro: ["Hermit Oaklyn: 'The Thornmaw sleeps at last — released, not slain. South-east the marsh waits. Its ferry stones sank when the Choristers stopped singing. Ask Sul; he counts whispers.'"],
      reward: 45 },
    { id: 3, name: "Mirefen Depths", zone: "marsh",
      intro: ["Ferryman Sul: 'Four whispers, four plates, and the old stones will rise again. My ledger drowned — four pages of it float the fen. Find my whispers, and I'll ferry you anywhere the light allows.'",
              "Ferryman Sul: 'The Mire Tyrant rules the deep fen now. It was a river spirit. The Gloam does not kill — it recruits. Warden, be quick or be kind. Preferably both.'"],
      objectives: [
        { type: "collect", item: "wisp", count: 4, desc: "Catch the stray marsh wisps" },
        { type: "switch", count: 4, desc: "Press the four whisper plates to raise the stones" },
        { type: "boss", boss: "tyrant", desc: "Defeat the Mire Tyrant" }
      ],
      outro: ["Ferryman Sul: 'The river breathes free again! Cross my stones to Hollow Keep. The Pale Ward still stands its post — ten years dead, still standing. Release it, Warden.'"],
      reward: 50 },
    { id: 4, name: "Hollow Keep", zone: "keep",
      intro: ["Warden's Echo: 'A lantern... light... at last. The Pale Ward sealed the Dawn Gate and swallowed the keys, so that the Gloam could never climb to the sunrise. Three keys, three halls. Take them. End the vigil.'",
              "Warden's Echo: 'The pale knights are not your enemy — they are the keep's insomnia. Strike true, and some of them may rest.'"],
      objectives: [
        { type: "collect", item: "key", count: 3, desc: "Recover the three Dawn Gate keys" },
        { type: "kill", enemy: "knight", count: 6, desc: "Put six pale knights to rest" },
        { type: "boss", boss: "paleward", desc: "Defeat the Pale Ward" }
      ],
      outro: ["Warden's Echo: 'The Ward bows its head — freed, at last, from a promise it could never keep. The Dawn Gate opens onto Dawnrise. What wears the dark up there... it was our king once. It can be a king again, or a memory. Your lantern decides.'"],
      reward: 55 },
    { id: 5, name: "Dawnrise", zone: "dawn",
      intro: ["The Last Lantern: 'High on this ridge, the first dawn ever to touch the valley was kindled — and the Umbral King snuffed it out, wearing the dark like a crown. Climb the switchbacks. Hold your light. Finish the story.'"],
      objectives: [
        { type: "reach", x: 24, y: 5, map: "dawn", desc: "Climb to the Umbral throne" },
        { type: "boss", boss: "umbral", desc: "Defeat the Umbral King" }
      ],
      outro: [],
      reward: 60 }
  ];

  /* ---------- side quests ---------- */
  var SIDEQUESTS = [
    { id: "cull",    giver: "pella",  name: "Field Practice",     type: "kill",    enemy: "mite", count: 10, reward: 25,
      offer: ["Scout Pella: 'New Warden, eh? Prove the lantern works — cull ten mites anywhere and I'll owe you a pouch of shards.'"],
      done: ["Scout Pella: 'Ten mites, one pouch. The fields feel lighter already. Keep it up and the Gloam will need a map to find us!'"] },
    { id: "locket",  giver: "maren",  name: "The Lost Locket",    type: "fetch",   item: "locket", count: 1, reward: 20,
      offer: ["Elder Maren: 'I dropped my mother's locket somewhere in the fields — near the eastern fence, I think. The Gloam took enough from us. Not that, too. Please.'"],
      done: ["Elder Maren: 'Her locket... warm, even now. You have her hands, Warden — the kind that carry light. Thank you.'"] },
    { id: "emberlings", giver: "bram", name: "Twelve Lanterns",    type: "collect", item: "emberling", count: 12, reward: 40,
      offer: ["Merchant Bram: 'Emberlings! Tiny shy fire-spirits, scattered across the valley when the Gloam hit. Collect all twelve and I'll teach you every lantern hue I know — free cosmetics, warden's honor.'"],
      done: ["Merchant Bram: 'All twelve! Watch this — rose, violet, jade... Your lantern can wear any dawn it likes now. You've earned the whole palette.'"] },
    { id: "glowcaps", giver: "hermit", name: "Songs for the Hermit", type: "collect", item: "glowcap", count: 3, reward: 25,
      offer: ["Hermit Oaklyn: 'Glowcaps — three of them, deep in the wood. My knees are older than the Gloam. Bring them and I'll pay in shards and gossip.'"],
      done: ["Hermit Oaklyn: 'Glowcap stew! You're welcome to the recipe, but it's mostly biting. Here — shards, as promised.'"] },
    { id: "ledger",  giver: "sul",    name: "The Drowned Ledger", type: "collect", item: "ledger", count: 4, reward: 30,
      offer: ["Ferryman Sul: 'Four pages of my ferry ledger, floating the fen. Bring them back — a ferryman without his ledger is just a man standing in water.'"],
      done: ["Ferryman Sul: 'My ledger! Every debt and every crossing, dry as a good oar. The fen and I are square again.'"] },
    { id: "armory",  giver: "ghost",  name: "Salvage the Armory", type: "collect", item: "relic", count: 2, reward: 35,
      offer: ["Warden's Echo: 'Two ceremonial blades sleep in the keep's armory alcoves. Carry them out into the light, and the keep can finally close its long shift.'"],
      done: ["Warden's Echo: 'The old blades, home in the sun. The keep sighs like a soldier standing down. Split the reward with me — you did the walking.'"] }
  ];

  /* ---------- shop ---------- */
  var SHOP = {
    blade: [
      { tier: 2, cost: 25,  name: "Honed Edge",     desc: "Blade damage 14 → 20" },
      { tier: 3, cost: 60,  name: "Warden's Edge",  desc: "Blade damage 20 → 28" },
      { tier: 4, cost: 120, name: "Dawnfang",       desc: "Blade damage 28 → 40, wider arc" }
    ],
    lantern: [
      { tier: 2, cost: 20,  name: "Bright Glass",   desc: "Light radius +, ember throw 22 dmg" },
      { tier: 3, cost: 50,  name: "Ember Lens",     desc: "Light radius ++, ember throw 26 dmg" },
      { tier: 4, cost: 100, name: "Dawnheart Lens", desc: "Light radius +++, ember throw 32 dmg" }
    ],
    cloak: [
      { tier: 2, cost: 30,  name: "Ashweave Cloak", desc: "Move speed +12%" },
      { tier: 3, cost: 70,  name: "Galeweave Cloak", desc: "Move speed +25%, cheaper rolls" }
    ],
    charms: [
      { id: "emberheart", cost: 45, name: "Emberheart",   desc: "+25 max health" },
      { id: "windstep",   cost: 40, name: "Windstep",     desc: "+10% move speed" },
      { id: "thornward",  cost: 50, name: "Thornward",    desc: "Take 15% less damage" },
      { id: "glowlarge",  cost: 45, name: "Glowkeeper",   desc: "+40% lantern oil capacity" },
      { id: "scavenger",  cost: 40, name: "Scavenger",    desc: "+25% shards from kills" },
      { id: "quickhand",  cost: 55, name: "Quickhand",    desc: "Attack 20% faster" },
      { id: "emberchain", cost: 50, name: "Emberchain",   desc: "Ember throw pierces enemies" },
      { id: "secondwind", cost: 45, name: "Second Wind",  desc: "Stamina regenerates 50% faster" }
    ]
  };

  var DIALOGS = {
    maren_idle:  ["Elder Maren: 'The braziers hold, thanks to you. Rest at any brazier — the light remembers you.'"],
    bram_idle:   ["Merchant Bram: 'Blades, glass, cloaks, charms — everything a Warden needs and a few things you'll want. Have a look!'"],
    pella_done:  ["Scout Pella: 'Fields are quieter every day. The Gloam is a story we're editing, chapter by chapter.'"],
    hermit_idle: ["Hermit Oaklyn: 'The wood dreams of the shrines' song. Walk softly.'"],
    sul_idle:    ["Ferryman Sul: 'Stones hold. River hums. Good day for a crossing, Warden.'"],
    ghost_idle:  ["Warden's Echo: 'The halls rest easier. Dawn is close — I can almost remember its color.'"]
  };

  return {
    MAPS: MAPS, DOORS: DOORS, BRAZIERS: BRAZIERS, SHRINES: SHRINES,
    PLATES: PLATES, STONES: STONES, PICKUPS: PICKUPS, LORE_TEXT: LORE_TEXT,
    NPCS: NPCS, SPAWNS: SPAWNS, EMBER_NODES: EMBER_NODES, BOSSES: BOSSES,
    ENEMIES: ENEMIES, BOSS_STATS: BOSS_STATS, CHAPTERS: CHAPTERS,
    SIDEQUESTS: SIDEQUESTS, SHOP: SHOP, DIALOGS: DIALOGS
  };
})();
