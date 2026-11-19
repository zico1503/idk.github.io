# Arcade Atlas

Arcade Atlas is a free-to-use static gaming hub built with plain HTML, CSS, and JavaScript. It is published on GitHub Pages from the repository root; there is no build step.

## Original games

- **Mothlight Courier** — a side-view platform campaign with 90 seeded chapters, letter gathering, checkpoints, and touch controls.
- **Tideglass Cartographer** — a growing series of 90 generated cave mazes with prism hunting and echo-eel hazards.
- **Buttonwood Signal** — a 90-room push-puzzle story with growing multi-stone puzzles and undo.
- **Pixel Garden** — a cozy garden sim with an optional interactive tutorial, planting, watering, harvesting, market requests, and unlockable seeds.
- **Banana Catchers** and **Starboard Sprint** — quick-play arcade games.

Campaign progress and garden progress are saved locally in each browser. They do not sync between devices and are stored separately from Arcade Atlas username profiles and emulator saves. The campaign maps are generated locally from deterministic chapter seeds; no game art or game engine is fetched from a remote server.

## Community

`community.html` uses the existing Supabase project for shared servers, channels, profiles, invites, roles, and messages. The Channels / Servers / Settings views and background color are per-browser interface preferences. Chat backgrounds are local only; they do not upload images or affect another member's view. The casual `1122` gate is public client-side code, not secure authentication. Do not post sensitive information.

No Supabase schema, server, invitation, role, message, or profile data is reset by this update. No new SQL is required for the tabs, categories, or local background setting. Shared chat still depends on the existing Supabase configuration and access policies.

## Run locally

Use a local static server so browser storage, canvas, and emulator features work as expected. From this folder, run `python -m http.server 8000` and open `http://localhost:8000` in a modern browser. For the games, open the catalog and select a title. Mothlight uses arrow keys / A-D and Space to jump; Tideglass uses arrow keys / W-A-S-D; Buttonwood uses the same movement plus Z / Backspace to undo and R to restart a room. P or Escape pauses each campaign. Touch controls appear on narrow screens.

## Publish to GitHub Pages

Commit and push the changed project files and the `games/` folder to the same repository and branch already used by Arcade Atlas. Keep the site entry point `index.html` at the repository root. GitHub Pages will deploy using the existing workflow. See [DEPLOY.md](DEPLOY.md) for the current publishing steps.

The included EmulatorJS runtime, µCity homebrew, personal-file picker, username profile features, and the existing Supabase Community backend remain in the project. Personal game files stay in the visitor's browser and are not uploaded.

Arcade Atlas does not bundle commercial ROMs or BIOS files and does not provide remote computers, streaming bandwidth, or paid services. See [third-party notices](THIRD_PARTY_NOTICES.md) for included software licenses and game attribution.
