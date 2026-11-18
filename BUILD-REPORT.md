# Arcade Atlas — Build Report
Date: 2026-11-18 · Repo: /home/z/my-project (branch `main`, all work committed)

## What happened to the "existing" site
The repository contained **no website files** — only `.env`, `.gitignore`,
`download/README.md` and `skills/` (agent tooling); git history was a single
"Initial commit". The Arcade Atlas site you described (Banana Catchers, the
emulator, profiles, community chat) was not present, so it was **rebuilt
faithfully from your description** as a static site under `docs/`, and the
three new campaign games were built on top of it with the same shared styles
and profile system. Nothing pre-existing was removed.

## Files created (all under `docs/` unless noted)
- `index.html` `games.html` `emulator.html` `community.html` `profile.html` — shell pages
- `games/banana-catchers.html` `games/driftpost.html` `games/emberhollow.html` `games/thornward.html` — game pages
- `assets/css/site.css` — shared visual identity (night-map navy + amber arcade glow)
- `assets/js/site.js` — profile system, chrome, catalog, achievements, community board
- `assets/js/gamekit.js` — shared engine: loop/HiDPI, keyboard+touch+pointer input,
  WebAudio synth, overlay screens, profile-tied saves, quality/FPS manager
- `assets/js/atlas8.js` — Atlas-8 fictional console: AV8 CPU, VDP, assembler, 3 homebrew carts
- `assets/js/games/banana.js` — Banana Catchers (12 harvest levels + endless)
- `assets/js/games/thornward-data.js` + `thornward.js` — Thornward TD (25 missions, 5 groves, 8 towers)
- `assets/js/games/emberhollow-data.js` + `emberhollow.js` — Emberhollow ARPG (5 chapters, 20 quests, 4 bosses)
- `assets/js/games/driftpost-data.js` + `driftpost.js` — Driftpost 3D WebGL flight-courier (24 missions, 5 regions)
- `docs/.nojekyll`
- `README.md` (repo root) — run + GitHub Pages publish instructions, QA hooks
- `scripts/test-atlas8.js` — Node harness (14 checks) for the console + carts

## The games
| Game | Type | Campaign | Est. length |
| --- | --- | --- | --- |
| Driftpost | Real-time 3D (raw WebGL, no libraries) | 24 missions / 5 regions: tutorial, deliveries, beacon chains, hunts, ring races, storm runs, night flights, long hauls, finale; 45 skyshards; upgrade shop; ranks | 2.5–3.5 h |
| Emberhollow | 2D ARPG, dynamic lantern lighting | 5 chapters, 20 quests (14 main + 6 side), 4 bosses, 6 maps, shop (blade/lantern/cloak + 8 charms), 12 emberlings, 10 lore pages, ferry-stone puzzle | 2.5–4 h |
| Thornward | 2D tower defense | 25 missions / 5 groves, 8 towers × 3 tiers, 8 enemy types (flying/armored/healing/shades), 3 bosses, stars, 6 permanent perks | 2.5–3.5 h |
| Banana Catchers | 2D arcade | 12 harvest levels + endless chase, combos, hazards | 20–30 min |
| Atlas-8 | Emulated fictional console | PipFall, Coil Rush, Hopstead (original homebrew, assembled in-page); JSON cart import | Quick play |

Playtime estimates are grounded in content counts (24/25/20 missions × minutes
each, plus retries and collectibles); each game's page and help screen state
them.

## Verified (actually performed)
- `node --check` passes for all 10 JS files.
- All HTML-referenced asset paths exist (relative paths only).
- Headless Chrome (agent-browser): **all 9 pages load with 0 console errors**.
- GitHub Pages subpath behavior: site served under `/mysite/` — root pages and
  nested game pages load clean, WebGL renders, nav links resolve relatively.
- Banana Catchers, full browser flow: title → level select → Level 1 → items
  spawn → keyboard moves basket → Esc pause → resume → completion screen with
  stars → save persisted (`missionsDone:1`, aggregates) → Level 2 unlocked.
- Thornward: title → campaign map → mission start → manual tower placement via
  card + canvas tap; BFS pathfinding verified for **all 5 maps** (3 maps had
  broken corridors — found and fixed); autoplay QA bot at 8× reaches live waves.
- Atlas-8: 14/14 Node harness checks pass (assemble, 600-frame runs, animated
  framebuffers, PipFall lives/catch logic, Hopstead jump physics, Coil Rush
  progression).
- Driftpost: WebGL init, title screen, mission board, flight running (0 errors).

## Bugs found & fixed during review
1. site.js: profile not loaded before inline page scripts (null crash).
2. gamekit.js: quality/resize init-order crash on every game page.
3. gamekit.js: overlay screens stacked (old cards never removed from DOM).
4. Driftpost: title-screen render used mission arrays before initialization.
5. Thornward: 3 of 5 ASCII maps had misaligned corridors (BFS could not reach
   the exit — enemies leaked instantly). Fixed and covered by a connectivity
   test.
6. Atlas-8: assembler `org` parsed hex as decimal; B/X and ALU memory-operand
   forms missing; several inverted branch conditions in cart ASM.
7. Thornward autoplay bot called waves before building defenses (QA-only fix).

## Open items (not finished — send a follow-up to continue)
- Thornward: a full autoplay bot run of a mission to the completion screen was
  interrupted by the session time limit (map/path bugs it exposed are fixed).
- Emberhollow & Driftpost: browser play-through of a full mission (start →
  objective → boss/complete → save) not yet performed end-to-end in the
  headless browser; QA hooks (`?qa=1`: Q/W/T) are in place for that.
- Review pass 3 (devices): phone/tablet viewport screenshots, focus-order audit,
  and long-session performance sampling still to run. Layouts are responsive by
  construction (flex/grid, clamp(), touch controls) but not yet screenshot-
  verified at 375 px.
- Achievement award checks (missions-5/15/30, stars-30) are wired to aggregate
  counters but their triggers were not exercised in browser yet.

## Publish (short version)
1. Push to GitHub → Settings → Pages → Deploy from branch → `main` / `/docs`.
2. Site appears at `https://<user>.github.io/<repo>/` — all paths are relative,
   so the subpath works with zero configuration. `docs/.nojekyll` is included.
3. Optional housekeeping: remove `.env` from the repo (site never references it).

Local preview: `python3 -m http.server 8000` from the repo root, then open
`http://localhost:8000/docs/`.
