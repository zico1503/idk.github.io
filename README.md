# Arcade Atlas

Banana Catchers is an original, self-contained 2D fruit-catching game in [`banana-catchers/index.html`](banana-catchers/index.html). Its art and sound are generated locally by Canvas and Web Audio; it needs no downloads or external libraries. Move with ←/→ or A/D, or drag across the game. On touch screens use the on-screen arrows. Press P or Escape to pause.

Username profiles use browser IndexedDB to keep personal game files local to that browser. Emulator save data is scoped by username there too; profiles have no password and do not sync between devices.

A free-to-use, responsive gaming hub built as a small static website with plain HTML, CSS, and JavaScript. The game shelf and guides need no backend; the optional Community chat needs a separately configured free-tier Supabase project.

## Community chat

The site includes a multi-server Community page at `community.html`, with custom roles, profiles, live presence, replies, reactions, pins, search, member-only attachments, and a small set of bundled animated stickers. Shared chat requires Supabase; existing installations should run the additive [Community upgrade](community/upgrade.sql) after the original [setup](community/SETUP.md). The shared `1122` code is only a casual client-side gate. RLS limits each server to its members, but this is not high-security private messaging. Guest identities are tied to one browser and can be lost if its site data is cleared. Online GIF search and voice/video are not connected.

## Run it

From this folder, run `python -m http.server 8000`, then open `http://localhost:8000` in a modern browser. Browser emulation relies on WebAssembly and is not supported when the page is opened directly as a `file://` URL. The included Starboard Sprint game runs in the browser. Its best score is stored locally in the browser when storage is available.

## Put it online

The site includes a GitHub Pages deployment workflow for free public hosting and automatic HTTPS. Follow [DEPLOY.md](DEPLOY.md) to publish it at a `github.io` address or connect a custom domain you own. Custom domains usually have a registration cost.

## What is included

- Search, category chips, and platform / play-method filters.
- Atlas Passport: a three-stop local route that tracks a Starboard run, the first Banana Catchers milestone, and a first Community message on the current browser.
- A playable original canvas arcade game with keyboard and touch controls.
- A standalone Banana Catchers game with multiple jungle biomes, powerups, local high scores, sound controls, and cosmetic unlocks.
- A built-in EmulatorJS runtime, NES and Game Boy / Color cores, and the playable Game Boy Color homebrew µCity. These emulator files are bundled locally; starting the included game does not call an emulator CDN.
- An optional local-file picker for compatible NES and Game Boy / Color games. Personal files are read by the browser and are not uploaded to Arcade Atlas.
- Setup guides for personal emulation, community-hosted Eaglercraft worlds, and streaming from a computer the visitor owns.
- An optional HTTPS-only field for opening an authorized community instance in a separate tab. Arcade Atlas does not host, embed, proxy, or relay the address.
- Responsive layouts and keyboard-friendly dialogs.

## Scope

Arcade Atlas bundles a homebrew game released under GPLv3+ for code and CC BY-SA 4.0 for media. It does not bundle commercial games or BIOS files. Visitors must use only other game files they own or are authorized to use. The site does not provide remote computers or streaming bandwidth. Third-party terms and costs can vary.

See [third-party notices](THIRD_PARTY_NOTICES.md) for emulator licenses, game attribution, and source archives.

The font files are loaded from Google Fonts when a connection is available; the site remains usable with fallback system fonts when offline.
