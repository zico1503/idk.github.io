/* ============================================================
   Arcade Atlas — gamekit: shared engine for all games.
   Loop + HiDPI canvas, input (keyboard/touch/pointer), WebAudio
   synth, overlay screens, profile-tied saves, quality manager.
   Games get an `api` object and implement update/render hooks.
   ============================================================ */
(function () {
  "use strict";

  var instances = [];

  /* ---------------- utilities ---------------- */
  var util = {
    lerp: function (a, b, t) { return a + (b - a) * t; },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    dist: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
    angleLerp: function (a, b, t) {
      var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return a + d * t;
    },
    ease: {
      outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
      inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
    },
    // Deterministic RNG for reproducible content placement
    rng: function (seed) {
      var s = seed >>> 0 || 1;
      return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return (s >>> 0) / 4294967296;
      };
    },
    fmtTime: function (sec) {
      sec = Math.max(0, sec);
      var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ":" + (s < 10 ? "0" : "") + s;
    },
    roundRect: function (x, ctx, x0, y0, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w, y0, r);
      ctx.closePath();
    },
    escHtml: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
  };

  /* ---------------- audio ---------------- */
  function makeAudio(profileGet, frameEl) {
    var ctx = null, master = null, ambGain = null, ambNodes = [], ambType = null, ambTimer = null;
    var unlocked = false;

    function ensure() {
      if (ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        ambGain = ctx.createGain();
        ambGain.gain.value = 0;
        ambGain.connect(master);
      } catch (e) { ctx = null; return false; }
      return true;
    }
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      if (ensure() && ctx.state === "suspended") ctx.resume();
    }
    function muted() { return !!(profileGet() && profileGet().settings.muted); }

    function env(node, t0, a, peak, dur, rel) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
      g.gain.setValueAtTime(Math.max(0.0001, peak), t0 + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
      node.connect(g);
      g.connect(master);
      return g;
    }
    function osc(type, f0, f1, t0, dur) {
      var o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      o.start(t0);
      o.stop(t0 + dur + 0.3);
      return o;
    }
    function noise(t0, dur) {
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.start(t0);
      src.stop(t0 + dur + 0.3);
      return src;
    }
    function filter(type, freq, q) {
      var f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      return f;
    }

    var recipes = {
      click:   function (t) { var o = osc("square", 700, 500, t, 0.05); env(o, t, 0.004, 0.12, 0.05, 0.05); },
      blip:    function (t) { var o = osc("square", 880, 1320, t, 0.07); env(o, t, 0.004, 0.14, 0.07, 0.06); },
      pickup:  function (t) { var o = osc("sine", 520, 1040, t, 0.12); env(o, t, 0.005, 0.2, 0.12, 0.1); },
      pop:     function (t) { var o = osc("sine", 300, 90, t, 0.09); env(o, t, 0.003, 0.22, 0.09, 0.06); },
      shoot:   function (t) { var o = osc("sawtooth", 760, 220, t, 0.09); env(o, t, 0.003, 0.12, 0.09, 0.05); },
      hit:     function (t) { var n = noise(t, 0.06); var f = filter("lowpass", 900); n.connect(f); env(f, t, 0.002, 0.24, 0.06, 0.05); },
      hurt:    function (t) { var o = osc("square", 300, 120, t, 0.16); env(o, t, 0.004, 0.22, 0.16, 0.1); },
      boom:    function (t) { var n = noise(t, 0.3); var f = filter("lowpass", 500); n.connect(f); env(f, t, 0.005, 0.3, 0.3, 0.2); var o = osc("sine", 130, 40, t, 0.3); env(o, t, 0.005, 0.25, 0.3, 0.15); },
      chime:   function (t) { [660, 880, 1320].forEach(function (f, i) { var o = osc("sine", f, f, t + i * 0.07, 0.3); env(o, t + i * 0.07, 0.005, 0.12, 0.3, 0.25); }); },
      quest:   function (t) { [[523, 0], [659, 0.09], [784, 0.18]].forEach(function (p) { var o = osc("triangle", p[0], p[0], t + p[1], 0.22); env(o, t + p[1], 0.008, 0.16, 0.22, 0.2); }); },
      win:     function (t) { [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.32]].forEach(function (p) { var o = osc("triangle", p[0], p[0], t + p[1], 0.3); env(o, t + p[1], 0.008, 0.16, 0.3, 0.3); }); },
      fail:    function (t) { [[392, 0], [330, 0.14], [262, 0.28]].forEach(function (p) { var o = osc("square", p[0], p[0] * 0.9, t + p[1], 0.22); env(o, t + p[1], 0.006, 0.14, 0.22, 0.2); }); },
      boost:   function (t) { var n = noise(t, 0.35); var f = filter("bandpass", 400, 2); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.3); n.connect(f); env(f, t, 0.03, 0.1, 0.35, 0.15); },
      land:    function (t) { var o = osc("sine", 180, 60, t, 0.12); env(o, t, 0.004, 0.2, 0.12, 0.08); },
      tick:    function (t) { var o = osc("square", 1200, 1200, t, 0.03); env(o, t, 0.002, 0.06, 0.03, 0.03); }
    };

    function sfx(name, opts) {
      opts = opts || {};
      if (!unlocked || !ensure() || muted()) return;
      if (ctx.state === "suspended") ctx.resume();
      var r = recipes[name];
      if (!r) return;
      try { r(ctx.currentTime + (opts.delay || 0)); } catch (e) {}
    }

    /* ambience: gentle looping beds, all synthesized */
    function stopAmbience() {
      if (ambTimer) { clearInterval(ambTimer); ambTimer = null; }
      ambNodes.forEach(function (n) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
      ambNodes = [];
      ambType = null;
    }
    function ambience(type) {
      if (!ensure()) return;
      if (ambType === type) return;
      stopAmbience();
      ambType = type;
      if (!type || type === "none") return;
      var t = ctx.currentTime;
      if (type === "wind" || type === "storm") {
        var n = noise(0, 1e6);
        var f = filter("lowpass", type === "storm" ? 600 : 320);
        n.connect(f);
        f.connect(ambGain);
        ambNodes = [n, f];
        if (type === "storm") {
          var lfo = osc("sine", 0.13, 0.13, t, 1e6);
          var lg = ctx.createGain(); lg.gain.value = 180;
          lfo.connect(lg); lg.connect(f.frequency); ambNodes.push(lfo, lg);
        }
      } else if (type === "drone") {
        [110, 165].forEach(function (f0) {
          var o = osc("sine", f0, f0, t, 1e6);
          var g = ctx.createGain(); g.gain.value = 0.5;
          o.connect(g); g.connect(ambGain);
          ambNodes.push(o, g);
        });
      } else if (type === "garden") {
        var notes = [392, 440, 523, 587, 659];
        var step = 0;
        ambTimer = setInterval(function () {
          if (muted() || document.hidden) return;
          var t0 = ctx.currentTime;
          var f0 = notes[step % notes.length] * (step % 8 < 4 ? 1 : 1.5);
          var o = osc("triangle", f0, f0, t0, 0.5);
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.06);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
          o.connect(g); g.connect(ambGain);
          ambNodes.push(o);
          step++;
        }, 900);
      } else if (type === "cave") {
        var o2 = osc("sine", 70, 70, t, 1e6);
        var g2 = ctx.createGain(); g2.gain.value = 0.6;
        o2.connect(g2); g2.connect(ambGain);
        ambNodes.push(o2, g2);
      }
    }
    function syncAmbience() {
      if (!ctx || !ambGain) return;
      var target = (!muted() && ambType && !document.hidden) ? 0.06 : 0;
      ambGain.gain.value += (target - ambGain.gain.value) * 0.05;
    }

    if (frameEl) {
      frameEl.addEventListener("pointerdown", unlock);
      frameEl.addEventListener("keydown", unlock);
    }
    window.addEventListener("keydown", unlock, { once: false });

    return { sfx: sfx, ambience: ambience, syncAmbience: syncAmbience, unlock: unlock };
  }

  /* ---------------- input ---------------- */
  function makeInput(canvas, frameEl, screens) {
    var input = {
      keys: {},          // code -> bool
      pressed: {},       // code -> edge this frame
      stick: { x: 0, y: 0 },
      pointer: { x: 0, y: 0, down: false, justDown: false, active: false },
      touch: false,
      buttons: {},       // id -> bool
      btnPressed: {},    // id -> edge
      _touchBtns: []
    };
    var STICK_KEYS = {
      ArrowUp: [0, -1], KeyW: [0, -1],
      ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0],
      ArrowRight: [1, 0], KeyD: [1, 0]
    };
    var PREVENT = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

    window.addEventListener("keydown", function (e) {
      if (e.repeat) { return; }
      input.keys[e.code] = true;
      input.pressed[e.code] = true;
      if (STICK_KEYS[e.code]) input.touch = false;
      // Stop page scrolling while piloting, unless a modal is open or an input is focused
      var modalOpen = screens && screens.isOpen();
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      var typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (!modalOpen && !typing && PREVENT.indexOf(e.code) >= 0) e.preventDefault();
      if (e.code === "Escape" || e.code === "KeyP") {
        if (modalOpen) screens.onEscape();
        else screens.requestPause();
      }
    });
    window.addEventListener("keyup", function (e) {
      input.keys[e.code] = false;
    });
    window.addEventListener("blur", function () {
      input.keys = {};
      input.buttons = {};
    });

    /* pointer (maps to canvas CSS pixels) */
    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    canvas.addEventListener("pointermove", function (e) {
      var p = toLocal(e);
      input.pointer.x = p.x; input.pointer.y = p.y;
      input.pointer.active = true;
    });
    canvas.addEventListener("pointerdown", function (e) {
      var p = toLocal(e);
      input.pointer.x = p.x; input.pointer.y = p.y;
      input.pointer.down = true;
      input.pointer.justDown = true;
      input.pointer.active = true;
      if (e.pointerType !== "mouse") input.touch = true;
    });
    window.addEventListener("pointerup", function () {
      input.pointer.down = false;
    });
    frameEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    /* virtual stick + touch buttons layer */
    var stickZone, stickNub, stickId = null, stickOrigin = null;
    var btnZone;
    function buildTouchLayer() {
      var layer = document.createElement("div");
      layer.className = "touch-layer";
      stickZone = document.createElement("div");
      stickZone.className = "stick-zone";
      stickNub = document.createElement("div");
      stickNub.className = "stick-nub";
      stickZone.appendChild(stickNub);
      btnZone = document.createElement("div");
      btnZone.className = "btn-zone";
      layer.appendChild(stickZone);
      layer.appendChild(btnZone);
      frameEl.appendChild(layer);
      return layer;
    }
    var touchLayer = buildTouchLayer();

    function showTouchUI() {
      touchLayer.style.display = input.touch ? "block" : "none";
    }
    showTouchUI();
    if (window.matchMedia && matchMedia("(pointer: coarse)").matches) {
      input.touch = true;
      showTouchUI();
    }

    stickZone.addEventListener("pointerdown", function (e) {
      stickId = e.pointerId;
      stickZone.setPointerCapture(stickId);
      var r = stickZone.getBoundingClientRect();
      stickOrigin = { x: e.clientX - r.left, y: e.clientY - r.top };
      stickNub.style.left = (stickOrigin.x - 27) + "px";
      stickNub.style.top = (stickOrigin.y - 27) + "px";
      stickZone.classList.add("active");
      input.touch = true;
      showTouchUI();
    });
    stickZone.addEventListener("pointermove", function (e) {
      if (e.pointerId !== stickId || !stickOrigin) return;
      var r = stickZone.getBoundingClientRect();
      var dx = (e.clientX - r.left) - stickOrigin.x;
      var dy = (e.clientY - r.top) - stickOrigin.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var max = 46;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      stickNub.style.left = (stickOrigin.x + dx - 27) + "px";
      stickNub.style.top = (stickOrigin.y + dy - 27) + "px";
      var dz = 8;
      input.stick.x = Math.abs(dx) < dz ? 0 : util.clamp(dx / max, -1, 1);
      input.stick.y = Math.abs(dy) < dz ? 0 : util.clamp(dy / max, -1, 1);
    });
    function stickEnd(e) {
      if (e.pointerId !== stickId) return;
      stickId = null;
      input.stick.x = 0; input.stick.y = 0;
      stickZone.classList.remove("active");
    }
    stickZone.addEventListener("pointerup", stickEnd);
    stickZone.addEventListener("pointercancel", stickEnd);

    input.addTouchButtons = function (defs) {
      btnZone.innerHTML = "";
      input._touchBtns = [];
      defs.forEach(function (d) {
        var b = document.createElement("button");
        b.className = "touch-btn";
        b.textContent = d.label;
        b.setAttribute("aria-label", d.label);
        b.style.pointerEvents = "auto";
        b.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          input.buttons[d.id] = true;
          input.btnPressed[d.id] = true;
          input.touch = true;
          showTouchUI();
        });
        var up = function () { input.buttons[d.id] = false; };
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("pointerleave", up);
        btnZone.appendChild(b);
        input._touchBtns.push(d);
      });
    };

    /* keyboard-driven stick when touch idle */
    input.computeStick = function () {
      if (stickId !== null) return input.stick;
      var x = 0, y = 0;
      if (input.keys.ArrowLeft || input.keys.KeyA) x -= 1;
      if (input.keys.ArrowRight || input.keys.KeyD) x += 1;
      if (input.keys.ArrowUp || input.keys.KeyW) y -= 1;
      if (input.keys.ArrowDown || input.keys.KeyS) y += 1;
      var len = Math.sqrt(x * x + y * y);
      if (len > 1) { x /= len; y /= len; }
      input.stick.x = x; input.stick.y = y;
      return input.stick;
    };
    input.key = function (code) { return !!input.keys[code]; };
    input.consume = function (code) {
      if (input.pressed[code]) { input.pressed[code] = false; return true; }
      return false;
    };
    input.consumeBtn = function (id) {
      if (input.btnPressed[id]) { input.btnPressed[id] = false; return true; }
      return false;
    };
    input.endFrame = function () {
      input.pressed = {};
      input.btnPressed = {};
      input.pointer.justDown = false;
    };
    input.setTouchVisible = function (v) {
      input.touch = v || input.touch;
      showTouchUI();
    };
    return input;
  }

  /* ---------------- screens (overlay UI) ---------------- */
  function makeScreens(frameEl, api) {
    var layer = document.createElement("div");
    layer.className = "screen-layer";
    layer.innerHTML = '<div class="scrim"></div>';
    frameEl.appendChild(layer);
    var current = null;       // {el, dismissible, onEscape}
    var sfx = api.audio.sfx;

    function isOpen() { return !!current; }

    function open(opts) {
      close();
      sfx("click");
      var card = document.createElement("div");
      card.className = "screen-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      if (opts.label) card.setAttribute("aria-label", opts.label || opts.title);
      var h = "";
      if (opts.title) h += "<h2>" + opts.title + "</h2>";
      if (opts.subtitle) h += '<p class="subtitle">' + opts.subtitle + "</p>";
      if (opts.bodyHTML) h += '<div class="sc-body">' + opts.bodyHTML + "</div>";
      card.innerHTML = h;
      var stack = document.createElement("div");
      stack.className = "stack";
      (opts.buttons || []).forEach(function (b) {
        var el = document.createElement("button");
        el.className = "btn " + (b.cls || "ghost") + (b.small ? " small" : "");
        el.innerHTML = b.label;
        el.addEventListener("click", function () { b.onClick && b.onClick(); });
        stack.appendChild(el);
        if (b.focus) setTimeout(function () { el.focus(); }, 30);
      });
      card.appendChild(stack);
      layer.appendChild(card);
      layer.classList.add("open");
      current = { el: card, dismissible: !!opts.dismissible, onEscape: opts.onEscape };
      return current;
    }
    function close() {
      if (!current) return;
      layer.classList.remove("open");
      var c = current;
      current = null;
      if (c.el) c.el.remove(); // remove the card so screens never stack
      if (c.onClose) c.onClose();
    }
    function onEscape() {
      if (!current) return;
      if (current.onEscape) { current.onEscape(); return; }
      if (current.dismissible) close();
    }
    function requestPause() {
      if (isOpen() || !api.hooks.onRequestPause) return;
      api.hooks.onRequestPause();
    }

    /* --- shared builders --- */
    function settingsRows(extra) {
      var p = api.profileGet();
      var fx = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      var rows = [
        '<div class="set-row"><div class="set-lbl">Sound<small>Effects and ambience</small></div>' +
        '<div class="switch"><input type="checkbox" id="setMute"' + (p.settings.muted ? " checked" : "") + ' aria-label="Sound"><i></i></div></div>',
        '<div class="set-row"><div class="set-lbl">Quality<small>' + (p.settings.quality === "auto" ? "Auto-detected: " : "") + api.quality.level() + '</small></div>' +
        '<select id="setQuality" aria-label="Quality"><option value="auto"' + (p.settings.quality === "auto" ? " selected" : "") + '>Auto</option>' +
        '<option value="high"' + (p.settings.quality === "high" ? " selected" : "") + '>High</option>' +
        '<option value="medium"' + (p.settings.quality === "medium" ? " selected" : "") + '>Medium</option>' +
        '<option value="low"' + (p.settings.quality === "low" ? " selected" : "") + '>Low</option></select></div>',
        '<div class="set-row"><div class="set-lbl">Reduced effects<small>' + (fx ? "System prefers reduced motion" : "Fewer particles, no shake") + '</small></div>' +
        '<div class="switch"><input type="checkbox" id="setFx"' + (p.settings.reducedFx ? " checked" : "") + ' aria-label="Reduced effects"><i></i></div></div>'
      ];
      if (extra) rows = rows.concat(extra(p));
      return rows.join("");
    }
    function bindSettings(extra) {
      var mute = layer.querySelector("#setMute");
      var qual = layer.querySelector("#setQuality");
      var fx = layer.querySelector("#setFx");
      if (mute) mute.addEventListener("change", function () {
        api.profileSet("muted", mute.checked);
        api.audio.sfx("blip");
      });
      if (qual) qual.addEventListener("change", function () {
        api.profileSet("quality", qual.value);
        api.quality.refresh();
      });
      if (fx) fx.addEventListener("change", function () {
        api.profileSet("reducedFx", fx.checked);
        api.quality.refresh();
      });
      if (extra) extra();
    }

    function loading(msg, tip) {
      open({
        title: msg || "Loading…",
        bodyHTML: '<div class="loading-box"><div class="spinner"></div><p class="muted small">' + (tip ? "Tip: " + tip : "") + "</p></div>",
        buttons: []
      });
    }
    function confirmBox(title, text, yesLabel, onYes, danger) {
      open({
        title: title,
        subtitle: text,
        buttons: [
          { label: yesLabel || "Yes", cls: danger ? "danger" : "", onClick: onYes, focus: true },
          { label: "Cancel", onClick: close }
        ]
      });
    }
    return {
      open: open, close: close, isOpen: isOpen, onEscape: onEscape, requestPause: requestPause,
      settingsRows: settingsRows, bindSettings: bindSettings,
      loading: loading, confirm: confirmBox, layer: layer
    };
  }

  /* ---------------- quality manager ---------------- */
  function makeQuality(frameEl, profileGet, onScaleChange) {
    var q = {
      level: "medium",
      auto: true,
      fps: 60,
      _samples: [],
      _lowTime: 0
    };
    function detect() {
      var c = navigator.hardwareConcurrency || 4;
      var m = navigator.deviceMemory || 8;
      if (c <= 2 || m <= 2) return "low";
      if (c <= 4 || m <= 4) return "medium";
      return "high";
    }
    function refresh() {
      var p = profileGet();
      q.auto = p.settings.quality === "auto";
      q.level = q.auto ? detect() : p.settings.quality;
      q.reducedFx = !!(p.settings.reducedFx ||
        (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches));
      onScaleChange && onScaleChange();
    }
    /* called by the loop every frame */
    function sample(dt) {
      if (dt <= 0 || dt > 0.5) return;
      q._samples.push(1 / dt);
      if (q._samples.length > 90) q._samples.shift();
      if (q._samples.length === 90) {
        var avg = q._samples.reduce(function (a, b) { return a + b; }, 0) / 90;
        q.fps = Math.round(avg);
        if (q.auto && avg < 40) {
          q._lowTime += dt * 90 / 60;
          if (q._lowTime > 3) {
            q._lowTime = 0;
            q.level = q.level === "high" ? "medium" : "low";
            onScaleChange && onScaleChange();
          }
        } else {
          q._lowTime = Math.max(0, q._lowTime - dt);
        }
      }
    }
    function scale() {
      var dpr = window.devicePixelRatio || 1;
      var base = q.level === "low" ? 0.62 : q.level === "medium" ? 0.85 : 1;
      return Math.min(dpr, 2) * base;
    }
    function fxMul() {
      if (q.reducedFx) return 0;
      return q.level === "low" ? 0.35 : q.level === "medium" ? 0.7 : 1;
    }
    refresh();
    return { refresh: refresh, sample: sample, scale: scale, fxMul: fxMul,
      get level() { return q.level; }, get fps() { return q.fps; } };
  }

  /* ---------------- boot ---------------- */
  function boot(opts) {
    var canvas = typeof opts.canvas === "string" ? document.querySelector(opts.canvas) : opts.canvas;
    var frameEl = canvas.parentElement;
    var state = opts.state || {};

    var api = { state: state, canvas: canvas, ctx: null, w: 0, h: 0 };
    if (!opts.webgl) api.ctx = canvas.getContext("2d"); // WebGL games manage their own context
    api.profileGet = function () { return window.Atlas.profile.get(); };
    api.profileSet = function (k, v) {
      window.Atlas.profile.setSetting(k, v);
      window.Atlas.persist();
    };
    api.util = util;
    api.audio = makeAudio(api.profileGet, frameEl);
    api.hooks = {};
    api.screens = makeScreens(frameEl, api);
    api.input = makeInput(canvas, frameEl, api.screens);

    var quality = makeQuality(frameEl, api.profileGet, resize);
    api.quality = quality;

    /* --- resize / HiDPI --- */
    function resize() {
      var r = frameEl.getBoundingClientRect();
      // `quality` may still be initializing when makeQuality triggers resize
      var s = (typeof quality !== "undefined" && quality) ? quality.scale() : 1;
      var w = Math.max(2, Math.round(r.width * s));
      var h = Math.max(2, Math.round(r.height * s));
      // cap backing pixels for slow devices
      var cap = 2.1e6;
      if (w * h > cap) { var k = Math.sqrt(cap / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
      canvas.width = w;
      canvas.height = h;
      api.w = w; api.h = h;
      opts.on && opts.on.resize && opts.on.resize(api);
    }
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(frameEl);
    }
    window.addEventListener("resize", resize);
    resize();

    /* --- saves (profile-tied) --- */
    api.save = {
      id: opts.saveId || "game-" + (instances.length + 1),
      data: null,
      load: function () {
        var blob = window.Atlas.profile.game(api.save.id);
        var def = opts.defaults || {};
        var merged = {};
        Object.keys(def).forEach(function (k) {
          merged[k] = (blob[k] !== undefined && blob[k] !== null) ? blob[k] : def[k];
        });
        api.save.data = merged;
        return merged;
      },
      save: function () {
        if (!api.save.data) return;
        window.Atlas.profile.saveGame(api.save.id, api.save.data);
      },
      reset: function () {
        window.Atlas.profile.wipeGame(api.save.id);
        api.save.load();
      }
    };

    /* --- HUD helpers --- */
    api.hud = {
      el: null,
      init: function () {
        var hud = document.createElement("div");
        hud.className = "hud-layer";
        hud.setAttribute("aria-hidden", "true");
        frameEl.appendChild(hud);
        api.hud.el = hud;
        return hud;
      },
      toast: function (text, cls, ms) {
        var t = document.createElement("div");
        t.className = "hud-toast" + (cls ? " " + cls : "");
        t.textContent = text;
        api.hud.el.appendChild(t);
        setTimeout(function () {
          t.style.transition = "opacity .3s";
          t.style.opacity = "0";
          setTimeout(function () { t.remove(); }, 320);
        }, ms || 2200);
      }
    };

    /* --- main loop --- */
    var running = false;   // true when gameplay (no modal) is active
    var started = false;
    var last = performance.now();
    var acc = 0;
    var raf = null;

    function setRunning(v) {
      if (running === v) return;
      running = v;
      if (v) { opts.on && opts.on.resume && opts.on.resume(api); }
      else { opts.on && opts.on.pause && opts.on.pause(api); }
    }
    api.setRunning = setRunning;
    api.isRunning = function () { return running && started; };

    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      quality.sample(dt);
      api.audio.syncAmbience();

      if (opts.on && opts.on.frame) opts.on.frame(api, dt);

      if (started && running) {
        api.input.computeStick();
        if (opts.fixedStep) {
          acc += dt;
          var step = opts.fixedStep;
          var n = 0;
          while (acc >= step && n < 4) {
            opts.on.update(api, step);
            acc -= step;
            n++;
          }
          if (n === 4) acc = 0;
        } else {
          opts.on.update(api, dt);
        }
      }
      if (opts.on && opts.on.render) opts.on.render(api, dt);
      api.input.endFrame();
    }

    /* --- auto-pause when tab hidden or window blurred --- */
    function autoPause(reason) {
      if (!started || !running) return;
      api.screens.requestPause && api.hooks.onAutoPause && api.hooks.onAutoPause(reason);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) autoPause("hidden");
    });
    window.addEventListener("blur", function () { autoPause("blur"); });

    /* --- boot sequence --- */
    api.start = function () {
      if (started) return;
      started = true;
      window.Atlas.award("first-play");
      markPlayed(opts.gameId);
      opts.on && opts.on.init && opts.on.init(api);
      opts.on && opts.on.title && opts.on.title(api);
    };
    api.destroy = function () {
      if (raf) cancelAnimationFrame(raf);
      started = false;
      running = false;
    };

    api.hooks.onRequestPause = opts.on && opts.on.requestPause;
    markPlayed(opts.gameId);

    raf = requestAnimationFrame(frame);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", api.start);
    } else {
      api.start();
    }
    instances.push(api);
    return api;
  }

  function markPlayed(gameId) {
    try {
      var ids = ["driftpost", "emberhollow", "thornward", "banana-catchers", "atlas8"];
      if (ids.indexOf(gameId) >= 0) {
        window.Atlas.profile.game(gameId).played = true;
        window.Atlas.persist();
        var all = ids.every(function (id) { return window.Atlas.profile.game(id).played; });
        if (all) window.Atlas.award("all-games");
      }
    } catch (e) {}
  }

  window.GK = {
    boot: boot,
    util: util,
    instances: instances
  };
})();
