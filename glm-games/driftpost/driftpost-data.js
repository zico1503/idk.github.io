/* ============================================================
   Driftpost — content data: regions, 24 missions, upgrades,
   cosmetics, ranks. Layouts are seeded per mission (see engine).
   ============================================================ */
window.DPD = (function () {
  "use strict";

  var REGIONS = [
    { id: "dawnreach", name: "Dawnreach Isles", seed: 1101, isles: 7, spread: 700,
      sky: ["#3a2a5e", "#e8956a"], sun: [1.0, 0.85, 0.6], water: [0.15, 0.2, 0.38], grass: [0.45, 0.75, 0.4],
      fog: 0.0011, clouds: 14, wind: 0 },
    { id: "cloudreef", name: "Cloudreef", seed: 2202, isles: 8, spread: 800,
      sky: ["#2a6ac0", "#a8d8f0"], sun: [1.0, 0.98, 0.85], water: [0.1, 0.3, 0.45], grass: [0.4, 0.8, 0.45],
      fog: 0.0009, clouds: 22, wind: 0.3 },
    { id: "stormveil", name: "Stormveil", seed: 3303, isles: 8, spread: 850,
      sky: ["#2a3040", "#6a7a8a"], sun: [0.6, 0.65, 0.75], water: [0.12, 0.18, 0.28], grass: [0.4, 0.6, 0.45],
      fog: 0.0013, clouds: 30, wind: 0.7 },
    { id: "nightfall", name: "Nightfall Reach", seed: 4404, isles: 8, spread: 850,
      sky: ["#0a0e26", "#1a2a4a"], sun: [0.35, 0.4, 0.6], water: [0.05, 0.1, 0.2], grass: [0.25, 0.45, 0.4],
      fog: 0.0012, clouds: 10, wind: 0.4, night: true },
    { id: "crownspire", name: "Crownspire", seed: 5505, isles: 9, spread: 900,
      sky: ["#1a1030", "#c05a3a"], sun: [0.95, 0.6, 0.45], water: [0.18, 0.12, 0.22], grass: [0.55, 0.5, 0.35],
      fog: 0.001, clouds: 16, wind: 0.6 }
  ];

  /* 24 missions. Types: tutorial, delivery, beacon, race, hunt, storm,
     night, longhaul, finale. Layouts are seeded per mission. */
  var MISSIONS = [
    // ---- Dawnreach ----
    { region: 0, type: "tutorial", name: "Wings of Your Own", brief: "Ground school: pitch, bank and boost, then fly your first parcel across the strait.", par: 150, coins: 40 },
    { region: 0, type: "delivery", name: "First Round Morning", brief: "Collect the parcel ring over the western isle and dock at the pad before the coffee goes cold.", par: 100, coins: 35 },
    { region: 0, type: "beacon", name: "Light the Chain", brief: "Three beacon buoys have drifted. Thread them in order to re-light the strait's morning lane.", count: 4, par: 110, coins: 35 },
    { region: 0, type: "hunt", name: "Scattered Post", brief: "A mail satchel burst over the shallows. Round up 8 drifting parcel-balloons.", count: 8, par: 130, coins: 35 },
    { region: 0, type: "race", name: "Dawn Gate Trials", brief: "Prove your wings on the Dawn Gate ring course. Beat par to earn full marks.", count: 10, par: 95, coins: 40 },
    // ---- Cloudreef ----
    { region: 1, type: "delivery", name: "Reef Run", brief: "Standard delivery across the reef — but watch the crosswind between spires.", par: 110, coins: 40 },
    { region: 1, type: "beacon", name: "Reefmark Relay", brief: "Five reefmarks need re-lighting before the tide of cloud swallows them.", count: 5, par: 125, coins: 40 },
    { region: 1, type: "hunt", name: "Balloon Roundup", brief: "Ten parcel-balloons escaped the sorting loft. Bring them home.", count: 10, par: 145, coins: 40 },
    { region: 1, type: "storm", name: "Weather Window", brief: "A squall cell parked over the delivery lane. Thread it — hull first, pride later.", par: 125, coins: 45 },
    { region: 1, type: "race", name: "Cloudreef Circuit", brief: "The reef circuit: 12 rings, one line, no excuses.", count: 12, par: 120, coins: 45 },
    // ---- Stormveil ----
    { region: 2, type: "storm", name: "Into the Veil", brief: "Deliver medical post through three storm cells. The Gale Post pays hazard rates.", par: 135, coins: 50 },
    { region: 2, type: "race", name: "Veil Sprint", brief: "Short, vicious sprint through the veiled spires.", count: 10, par: 100, coins: 50 },
    { region: 2, type: "beacon", name: "Stormwardens' Duty", brief: "Six stormwarden buoys keep the safe lane lit. Relight them all, in order.", count: 6, par: 145, coins: 50 },
    { region: 2, type: "longhaul", name: "Two-Isle Haul", brief: "A two-stop delivery run: collect at the mill isle, drop at the quarry, return for payment.", stops: 3, par: 180, coins: 55 },
    { region: 2, type: "hunt", name: "Lost in the Veil", brief: "Twelve parcels scattered by the last squall. The veil hides them well.", count: 12, par: 160, coins: 50 },
    // ---- Nightfall ----
    { region: 3, type: "night", name: "Lantern Post", brief: "Night delivery. Your lantern is your only marker — upgrade it if you're straining.", par: 130, coins: 55 },
    { region: 3, type: "night", name: "Night Choir", brief: "Five night-buoys chime in the dark. Light them in their singing order.", count: 5, par: 140, coins: 55 },
    { region: 3, type: "storm", name: "Thunder Mail", brief: "The night squall is worse. The post must fly anyway.", par: 140, coins: 60 },
    { region: 3, type: "race", name: "Moonline Race", brief: "Race the moonline rings before the clouds take them.", count: 12, par: 125, coins: 55 },
    { region: 3, type: "longhaul", name: "The Night Round", brief: "Three stops under starlight. The whole night route, end to end.", stops: 4, par: 200, coins: 60 },
    // ---- Crownspire ----
    { region: 4, type: "delivery", name: "Spire Ascent", brief: "The crown spires pierce the sunset. Deliver the parcel at the top of the world.", par: 130, coins: 60 },
    { region: 4, type: "race", name: "Crown Circuit", brief: "The hardest ring course in the isles. Legends are made here.", count: 14, par: 130, coins: 60 },
    { region: 4, type: "storm", name: "Tempest Delivery", brief: "A tempest guards the crown. Thread it and deliver the century parcel.", par: 150, coins: 65 },
    { region: 4, type: "finale", name: "The Century Flight", brief: "The longest haul ever flown: five stops, storm cells, night leg and a sunset sprint. Finish it and the Gale Post has its next legend.", stops: 5, par: 260, coins: 100 }
  ];

  /* rank ladder by total stars */
  var RANKS = [
    { stars: 0,  name: "Trainee" },
    { stars: 8,  name: "Junior Courier" },
    { stars: 16, name: "Courier" },
    { stars: 26, name: "Skyward Courier" },
    { stars: 36, name: "Gale Captain" },
    { stars: 46, name: "Postmaster of the Isles" }
  ];

  var UPGRADES = {
    engine:  { name: "Engine",   icon: "⚙️", tiers: [
      { cost: 0,   desc: "Standard drift-kite engine" },
      { cost: 120, desc: "+12% thrust & top speed" },
      { cost: 260, desc: "+24% thrust & top speed" },
      { cost: 440, desc: "+38% thrust & top speed" }] },
    wings:   { name: "Wings",    icon: "🪽", tiers: [
      { cost: 0,   desc: "Standard wing membrane" },
      { cost: 100, desc: "+15% turn rate" },
      { cost: 230, desc: "+30% turn rate, tighter glide" }] },
    hull:    { name: "Hull",     icon: "🛡️", tiers: [
      { cost: 0,   desc: "Paper-and-wax hull (100)" },
      { cost: 110, desc: "Reinforced spars (140)" },
      { cost: 250, desc: "Storm-tough shell (180)" }] },
    lantern: { name: "Lantern",  icon: "🏮", tiers: [
      { cost: 0,   desc: "Candle glow" },
      { cost: 90,  desc: "Wide night glow" },
      { cost: 200, desc: "Dawn-bright lantern" }] },
    compass: { name: "Compass",  icon: "🧭", tiers: [
      { cost: 0,   desc: "Basic heading needle" },
      { cost: 80,  desc: "Objective beam marker" }] }
  };

  var PAINTS = [
    { id: "parchment", name: "Parchment", cost: 0 },
    { id: "ember",     name: "Ember",     cost: 90 },
    { id: "tide",      name: "Tide",      cost: 90 },
    { id: "orchid",    name: "Orchid",    cost: 120 },
    { id: "moss",      name: "Moss",      cost: 120 },
    { id: "dusk",      name: "Dusk",      cost: 150 },
    { id: "gilded",    name: "Gilded",    cost: 200 },
    { id: "aurora",    name: "Aurora",    cost: 260 }
  ];
  var TRAILS = [
    { id: "none",    name: "None",        cost: 0 },
    { id: "ribbon",  name: "Ribbon",      cost: 60 },
    { id: "sparks",  name: "Sparks",      cost: 80 },
    { id: "bubbles", name: "Cloudpuffs",  cost: 80 },
    { id: "stars",   name: "Starlight",   cost: 150 },
    { id: "petals",  name: "Petal-fall",  cost: 150 }
  ];

  /* mission unlock: mission i unlocks when mission i-1 done (per region chain);
     region r unlocks when total stars >= threshold */
  var REGION_STARS = [0, 6, 14, 22, 32];

  return { REGIONS: REGIONS, MISSIONS: MISSIONS, RANKS: RANKS, UPGRADES: UPGRADES, PAINTS: PAINTS, TRAILS: TRAILS, REGION_STARS: REGION_STARS };
})();
