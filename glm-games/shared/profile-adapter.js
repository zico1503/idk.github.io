/* Bridges the imported games' save API to Arcade Atlas's local username.
   This is client-side progress only; the games do not upload profile data. */
(function () {
  'use strict';
  var activeKey = 'arcade-atlas-active-profile';
  var userId = 'guest';
  try { userId = localStorage.getItem(activeKey) || 'guest'; } catch (_) {}
  var storageKey = 'arcadeAtlas.glmGames.v1:' + userId;
  var state = {
    games: {},
    settings: { muted: false, quality: 'auto', reducedFx: false },
    achievements: []
  };
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') state = Object.assign(state, saved);
  } catch (_) {}
  state.games = state.games && typeof state.games === 'object' ? state.games : {};
  state.settings = Object.assign(
    { muted: false, quality: 'auto', reducedFx: false },
    state.settings && typeof state.settings === 'object' ? state.settings : {}
  );
  state.achievements = Array.isArray(state.achievements) ? state.achievements : [];
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
  }
  function game(id) {
    if (!state.games[id] || typeof state.games[id] !== 'object') state.games[id] = {};
    return state.games[id];
  }
  window.Atlas = {
    esc: function (value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    persist: persist,
    award: function (id) {
      if (state.achievements.indexOf(id) < 0) state.achievements.push(id);
      persist();
    },
    profile: {
      get: function () { return Object.assign({ settings: state.settings }, state.settings); },
      setSetting: function (key, value) { state.settings[key] = value; persist(); },
      game: game,
      saveGame: function (id, data) { state.games[id] = data; persist(); },
      wipeGame: function (id) { delete state.games[id]; persist(); }
    }
  };
})();
