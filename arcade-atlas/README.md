# Arcade Atlas

A polished home for original browser games — a 3D flight-courier campaign, a
lantern-lit action RPG, a garden-siege tower defense, an arcade classic, and a
tiny emulated 8-bit console with homebrew cartridges. Everything is original:
code, art drawn in canvas/WebGL, and music synthesized in the browser. No build
step, no server, no remote assets.

## Run it locally

Any static file server works. From the repo root:

```bash
# Python
python3 -m http.server 8000
# then open http://localhost:8000/docs/

# or Node
npx serve .
```

Do **not** open `docs/index.html` via `file://` for testing — some browsers
restrict storage features on `file://` pages. Use a local server.

## Publish on GitHub Pages

The site lives entirely in **`docs/`** (GitHub Pages' folder convention):

1. Push this repository to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source:
   "Deploy from a branch"**.
3. Choose branch **`main`**, folder **`/docs`**, then Save.
4. Your site is served at `https://<user>.github.io/<repo>/` within a minute or
   two.

All links and asset paths inside `docs/` are **relative**, so the site works
from a repository subpath (`/repo/`) as well as from a custom domain — no
configuration needed either way. `docs/.nojekyll` is included so GitHub Pages
serves every file as-is (no Jekyll processing).

Housekeeping note before publishing: the repo root currently also contains a
`.env` file (a local-only database path used by sandbox tooling — not needed by
the site) and the `skills/` tooling folder (already git-ignored). Consider
removing `.env` from git so your published repo stays clean; the site itself
never references either.

## What's inside

```
docs/
├── index.html                 home page
├── .nojekyll                  (keep GitHub Pages unprocessed)
├── games.html                 the Games area (catalog + filters)
├── emulator.html              Atlas-8 console emulator
├── community.html             community board (stored on-device)
├── profile.html               profile, achievements, settings, save export/import
├── assets/
│   ├── css/site.css           shared visual identity
│   ├── js/site.js             profile system, chrome, catalog, community
│   ├── js/gamekit.js          shared game engine (loop, input, audio, screens,
│   │                          saves, quality manager) used by all games
│   ├── js/atlas8.js           Atlas-8 console: AV8 CPU, VDP, assembler, carts
│   └── js/games/
│       ├── banana.js          Banana Catchers
│       ├── thornward-data.js  Thornward content (maps, towers, 25 missions)
│       ├── thornward.js       Thornward engine
│       ├── emberhollow-data.js Emberhollow content (maps, quests, dialogs)
│       ├── emberhollow.js     Emberhollow engine
│       ├── driftpost-data.js  Driftpost content (regions, 24 missions, shop)
│       └── driftpost.js       Driftpost engine (WebGL renderer + flight)
└── games/
    ├── banana-catchers.html
    ├── driftpost.html
    ├── emberhollow.html
    └── thornward.html
```

## The games

| Game | Type | Campaign content | Est. length |
| --- | --- | --- | --- |
| **Driftpost** | Real-time 3D (WebGL) flight-courier | 24 missions in 5 regions — tutorial, deliveries, beacon chains, balloon hunts, ring races, storm runs, night lantern flights, multi-stop long hauls, and the Century Flight finale. 45 skyshards, upgrade shop, 8 paints, 6 trails, courier ranks. | 2.5–3.5 h |
| **Emberhollow** | 2D action RPG with dynamic lantern lighting | 5 chapters, 14 main objectives + 6 side quests (20 total), 4 bosses, 6 maps, merchant with blade/lantern/cloak tiers + 8 charms, 12 emberlings, 10 lore pages, ferry-stone puzzle, checkpoint braziers. | 2.5–4 h |
| **Thornward** | 2D tower defense | 25 missions over 5 groves, 8 tower families × 3 tiers, 8 enemy types incl. flying/armored/healing/shades, 3 bosses, star ratings, 6 permanent Requisition perks. | 2.5–3.5 h |
| **Banana Catchers** | 2D arcade catcher | 12 harvest levels with quotas, gusts, bees and coconuts + endless chase mode. | 20–30 min |
| **Atlas-8** | Emulated fictional console | 3 original homebrew carts: PipFall, Coil Rush, Hopstead. JSON cart import + built-in assembler. | Quick play |

Estimated campaign lengths assume a first playthrough at a steady pace,
including retries and normal exploration — they come from mission counts times
measured mission durations (see each game's in-page help for the breakdown).

## Features shared by all games

- Start / pause / resume / restart / settings / completion screens, with
  keyboard-focusable menus (`Esc` pauses, `P` also works).
- Tutorial or guided first mission; readable objective tracker + off-screen
  objective arrow.
- Autosave into the site profile system (guest mode works too); Profile page
  can export/import backups as JSON.
- Keyboard + mouse + touch controls (virtual joystick + action buttons appear
  automatically on touch devices).
- Mute toggle in the header and in every game; all games fully playable muted.
- Quality auto-detection + live FPS monitor that steps effects down on slow
  devices; "Reduced effects" respects `prefers-reduced-motion`.
- High-DPI aware canvases, resize-safe layouts, auto-pause when the tab is
  hidden or the window loses focus.

## QA hooks

The games expose small debug helpers used during development and testing
(documented here for transparency):

- `?qa=1` on Emberhollow: `Q` completes the current objective, `W` warps to the
  next chapter, `T` adds 100 shards.
- `?qa=1` on Driftpost: `Q` completes the mission, `W` adds 50 coins, `T` adds
  3 stars.
- `?autoplay=1&turbo=N` on Thornward: a greedy builder AI plays the mission at
  N× speed (used to verify all 25 missions are winnable).
- `scripts/test-atlas8.js` — Node harness that assembles and runs every
  Atlas-8 cartridge headlessly (14 checks).
- `window.__TW`, `window.__EH`, `window.__DP` expose live game state for tests.

These hooks don't unlock saves by themselves; they drive the real game logic.

## Notes

- Community posts and all game saves live in your browser's localStorage
  (per device). The Profile page can export/import a JSON backup.
- The Atlas-8 is a fictional console — an original design for this site. The
  emulator faithfully executes its own ISA; the homebrew carts are written in
  its assembly language and assembled at load time.
- Sound is synthesized with the Web Audio API at runtime (no audio files), and
  every visual is drawn in code — the site has zero remote dependencies.
