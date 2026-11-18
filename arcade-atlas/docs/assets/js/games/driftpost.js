/* ============================================================
   Driftpost — engine part 1: WebGL renderer, matrix lib,
   procedural isles, flight physics.
   (Part 2: missions, HUD, screens, boot.)
   QA hooks (?qa=1): Q completes the current objective,
   W adds 50 coins, T adds 3 stars.
   ============================================================ */
(function () {
  "use strict";
  var U = GK.util;
  var D = window.DPD;

  var api = null, S = null, save = null;
  var qa = /qa=1/.test(location.search);

  /* ================= tiny matrix lib ================= */
  var m4 = {
    ident: function () { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
    mul: function (a, b) {
      var o = new Array(16);
      for (var c = 0; c < 4; c++) {
        for (var r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    persp: function (fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    },
    lookAt: function (eye, ctr, up) {
      var z = norm3(sub3(eye, ctr));
      var x = norm3(cross3(up, z));
      var y = cross3(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
        -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
        -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]), 1];
    },
    model: function (x, y, z, ry, s) {
      var c = Math.cos(ry), si = Math.sin(ry);
      return [c*s,0,-si*s,0, 0,s,0,0, si*s,0,c*s,0, x,y,z,1];
    }
  };
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm3(a) {
    var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  /* ================= WebGL setup ================= */
  var gl = null, progMesh = null, progWater = null, progPart = null, progSky = null;
  var loc = {};
  var skyVAO = null;

  function initGL(canvas) {
    gl = canvas.getContext("webgl", { antialias: true, alpha: false }) ||
         canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
    if (!gl) return false;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader error:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    function prog(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("Link error:", gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    }

    var VS_MESH =
      "attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;" +
      "uniform mat4 uVP; uniform mat4 uM;" +
      "varying vec3 vC; varying vec3 vN; varying float vD;" +
      "void main(){ vec4 wp = uM * vec4(aP,1.0); gl_Position = uVP * wp;" +
      " vC = aC; vN = mat3(uM[0].xyz,uM[1].xyz,uM[2].xyz) * aN; vD = gl_Position.w; }";
    var FS_MESH =
      "precision mediump float;" +
      "varying vec3 vC; varying vec3 vN; varying float vD;" +
      "uniform vec3 uLight; uniform vec3 uSunC; uniform vec3 uAmb;" +
      "uniform vec3 uFogC; uniform float uFogD; uniform float uEmis;" +
      "void main(){ vec3 n = normalize(vN);" +
      " float lam = max(dot(n, uLight), 0.0);" +
      " vec3 col = vC * (uAmb + uSunC * lam);" +
      " col = mix(col, vC, uEmis);" +
      " float fog = 1.0 - exp(-uFogD * vD);" +
      " gl_FragColor = vec4(mix(col, uFogC, clamp(fog,0.0,1.0)), 1.0); }";
    var VS_WATER =
      "attribute vec3 aP;" +
      "uniform mat4 uVP; uniform float uT;" +
      "varying vec3 vN; varying float vD; varying vec3 vW;" +
      "void main(){ vec3 p = aP;" +
      " float w1 = sin(p.x*0.055 + uT*1.2); float w2 = cos(p.z*0.045 + uT*0.9);" +
      " p.y += w1*1.6 + w2*1.2;" +
      " float dx = cos(p.x*0.055 + uT*1.2)*0.055*1.6; float dz = -sin(p.z*0.045 + uT*0.9)*0.045*1.2;" +
      " vN = normalize(vec3(-dx, 1.0, -dz)); vW = p;" +
      " gl_Position = uVP * vec4(p, 1.0); vD = gl_Position.w; }";
    var FS_WATER =
      "precision mediump float;" +
      "varying vec3 vN; varying float vD; varying vec3 vW;" +
      "uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSunC; uniform vec3 uLight;" +
      "uniform vec3 uFogC; uniform float uFogD;" +
      "void main(){ vec3 n = normalize(vN);" +
      " float fres = pow(1.0 - max(n.y, 0.0), 2.0);" +
      " vec3 col = mix(uDeep, uShallow, fres*0.7 + 0.15);" +
      " float glint = pow(max(dot(n, normalize(uLight)), 0.0), 40.0);" +
      " col += uSunC * glint * 0.5;" +
      " float fog = 1.0 - exp(-uFogD * vD);" +
      " gl_FragColor = vec4(mix(col, uFogC, clamp(fog,0.0,1.0)), 1.0); }";
    var VS_PART =
      "attribute vec3 aP; attribute vec2 aSA; attribute vec3 aC;" +
      "uniform mat4 uVP;" +
      "varying vec3 vC; varying float vA;" +
      "void main(){ gl_Position = uVP * vec4(aP, 1.0);" +
      " gl_PointSize = aSA.x * (300.0 / max(gl_Position.w, 1.0));" +
      " vC = aC; vA = aSA.y; }";
    var FS_PART =
      "precision mediump float; varying vec3 vC; varying float vA;" +
      "void main(){ vec2 d = gl_PointCoord - 0.5;" +
      " float a = (1.0 - smoothstep(0.2, 0.5, length(d))) * vA;" +
      " if (a < 0.02) discard;" +
      " gl_FragColor = vec4(vC, a); }";
    var VS_SKY =
      "attribute vec2 aP; varying vec2 vP;" +
      "void main(){ vP = aP; gl_Position = vec4(aP, 0.999, 1.0); }";
    var FS_SKY =
      "precision mediump float; varying vec2 vP;" +
      "uniform vec3 uTop; uniform vec3 uBottom; uniform vec2 uSun;" +
      "void main(){ float t = clamp(vP.y*0.5+0.5, 0.0, 1.0);" +
      " vec3 col = mix(uBottom, uTop, pow(t, 0.8));" +
      " float d = distance(vP, uSun);" +
      " col += vec3(1.0,0.9,0.7) * smoothstep(0.16, 0.0, d) * 0.9;" +
      " col += vec3(1.0,0.8,0.5) * smoothstep(0.5, 0.0, d) * 0.25;" +
      " gl_FragColor = vec4(col, 1.0); }";

    progMesh = prog(VS_MESH, FS_MESH);
    progWater = prog(VS_WATER, FS_WATER);
    progPart = prog(VS_PART, FS_PART);
    progSky = prog(VS_SKY, FS_SKY);
    if (!progMesh || !progWater || !progPart || !progSky) return false;

    loc.mesh = {
      aP: gl.getAttribLocation(progMesh, "aP"),
      aN: gl.getAttribLocation(progMesh, "aN"),
      aC: gl.getAttribLocation(progMesh, "aC"),
      uVP: gl.getUniformLocation(progMesh, "uVP"),
      uM: gl.getUniformLocation(progMesh, "uM"),
      uLight: gl.getUniformLocation(progMesh, "uLight"),
      uSunC: gl.getUniformLocation(progMesh, "uSunC"),
      uAmb: gl.getUniformLocation(progMesh, "uAmb"),
      uFogC: gl.getUniformLocation(progMesh, "uFogC"),
      uFogD: gl.getUniformLocation(progMesh, "uFogD"),
      uEmis: gl.getUniformLocation(progMesh, "uEmis")
    };
    loc.water = {
      aP: gl.getAttribLocation(progWater, "aP"),
      uVP: gl.getUniformLocation(progWater, "uVP"),
      uT: gl.getUniformLocation(progWater, "uT"),
      uDeep: gl.getUniformLocation(progWater, "uDeep"),
      uShallow: gl.getUniformLocation(progWater, "uShallow"),
      uSunC: gl.getUniformLocation(progWater, "uSunC"),
      uLight: gl.getUniformLocation(progWater, "uLight"),
      uFogC: gl.getUniformLocation(progWater, "uFogC"),
      uFogD: gl.getUniformLocation(progWater, "uFogD")
    };
    loc.part = {
      aP: gl.getAttribLocation(progPart, "aP"),
      aSA: gl.getAttribLocation(progPart, "aSA"),
      aC: gl.getAttribLocation(progPart, "aC"),
      uVP: gl.getUniformLocation(progPart, "uVP")
    };
    loc.sky = {
      aP: gl.getAttribLocation(progSky, "aP"),
      uTop: gl.getUniformLocation(progSky, "uTop"),
      uBottom: gl.getUniformLocation(progSky, "uBottom"),
      uSun: gl.getUniformLocation(progSky, "uSun")
    };

    // fullscreen quad for sky
    skyVAO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVAO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    return true;
  }

  /* ================= mesh building ================= */
  function MeshBuilder() {
    this.pos = []; this.nrm = []; this.col = [];
  }
  MeshBuilder.prototype.tri = function (a, b, c, col) {
    var n = norm3(cross3(sub3(b, a), sub3(c, a)));
    var push = function (v) {
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0], col[1], col[2]);
    }.bind(this);
    push(a); push(b); push(c);
  };
  MeshBuilder.prototype.quad = function (a, b, c, d, col) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  };
  MeshBuilder.prototype.upload = function (emissive) {
    var vbo = gl.createBuffer();
    var n = this.pos.length / 3;
    var data = new Float32Array(n * 9);
    for (var i = 0; i < n; i++) {
      data[i * 9] = this.pos[i * 3];
      data[i * 9 + 1] = this.pos[i * 3 + 1];
      data[i * 9 + 2] = this.pos[i * 3 + 2];
      data[i * 9 + 3] = this.nrm[i * 3];
      data[i * 9 + 4] = this.nrm[i * 3 + 1];
      data[i * 9 + 5] = this.nrm[i * 3 + 2];
      data[i * 9 + 6] = this.col[i * 3];
      data[i * 9 + 7] = this.col[i * 3 + 1];
      data[i * 9 + 8] = this.col[i * 3 + 2];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { vbo: vbo, n: n, emissive: !!emissive };
  };

  function buildIsleMesh(rng, size, colors, opts) {
    var mb = new MeshBuilder();
    var me = new MeshBuilder(); // emissive parts
    var R = size;
    var SEG = 12;
    var grass = colors.grass, rock = [0.42, 0.36, 0.3], rockD = [0.3, 0.26, 0.22];
    var topY = 0;
    // gentle top noise
    var bump = [];
    for (var i = 0; i < SEG; i++) bump.push((rng() - 0.5) * R * 0.08);
    // top cap (slightly domed)
    var rim = [];
    for (var s = 0; s < SEG; s++) {
      var a = s / SEG * Math.PI * 2;
      var rr = R * (0.92 + rng() * 0.16);
      rim.push([Math.cos(a) * rr, topY + bump[s], Math.sin(a) * rr]);
    }
    var cen = [0, topY + R * 0.06 + (rng() - 0.5) * 2, 0];
    for (var t2 = 0; t2 < SEG; t2++) {
      var c1 = [grass[0] * (0.85 + rng() * 0.3), grass[1] * (0.85 + rng() * 0.3), grass[2] * (0.85 + rng() * 0.3)];
      mb.tri(cen, rim[t2], rim[(t2 + 1) % SEG], c1);
    }
    // skirt down to apex
    var apex = [0, -R * 1.1 - rng() * R * 0.4, 0];
    for (var q = 0; q < SEG; q++) {
      var a1 = rim[q], a2 = rim[(q + 1) % SEG];
      var mid1 = [a1[0] * 0.75, (a1[1] - R * 0.5), a1[2] * 0.75];
      var mid2 = [a2[0] * 0.75, (a2[1] - R * 0.5), a2[2] * 0.75];
      mb.quad(a1, a2, mid2, mid1, q % 2 ? rock : rockD);
      mb.quad(mid1, mid2, apex2(mid2), apex2(mid1), rockD);
      function apex2(v) { return [v[0] * 0.4, v[1] - R * 0.45, v[2] * 0.4]; }
    }
    // decorations
    if (opts.trees) {
      for (var tr = 0; tr < opts.trees; tr++) {
        var ta = rng() * Math.PI * 2, trr = R * (0.25 + rng() * 0.45);
        var tx = Math.cos(ta) * trr, tz = Math.sin(ta) * trr;
        var th = 3 + rng() * 4;
        cone(mb, [tx, topY, tz], th * 0.35, th, [0.16, 0.4, 0.2]);
        mb.quad(
          [tx - 0.5, topY, tz - 0.5], [tx + 0.5, topY, tz - 0.5],
          [tx + 0.5, topY, tz + 0.5], [tx - 0.5, topY, tz + 0.5], [0.3, 0.22, 0.14]);
      }
    }
    if (opts.houses) {
      for (var hq = 0; hq < opts.houses; hq++) {
        var ha = rng() * Math.PI * 2, hr = R * (0.2 + rng() * 0.3);
        var hx = Math.cos(ha) * hr, hz = Math.sin(ha) * hr;
        box(mb, [hx, topY, hz], 5, 4.5, 5, [0.82, 0.74, 0.6]);
        prism(mb, [hx, topY + 4.5, hz], 6, 3.4, 6, [0.6, 0.26, 0.2]);
        me.quad( // warm window
          [hx - 1.2, topY + 1.4, hz + 2.51], [hx + 1.2, topY + 1.4, hz + 2.51],
          [hx + 1.2, topY + 3.2, hz + 2.51], [hx - 1.2, topY + 3.2, hz + 2.51],
          [1.0, 0.85, 0.45]);
      }
    }
    if (opts.beacon) {
      cyl(mb, [0, topY, 0], 1.2, 8, 8, [0.25, 0.28, 0.34]);
      sphere(me, [0, topY + 9.5, 0], 2.2, [1.0, 0.9, 0.4], 6);
    }
    if (opts.pad) {
      cyl(mb, [0, topY + 0.15, 0], R * 0.45, R * 0.45, 0.8, [0.5, 0.5, 0.55]);
      ringGeo(me, [0, topY + 1.0, 0], R * 0.45, 0.8, [0.3, 1.0, 0.9]);
    }
    if (opts.rocks) {
      for (var rk = 0; rk < opts.rocks; rk++) {
        var ra = rng() * Math.PI * 2, rrk = R * (0.55 + rng() * 0.3);
        sphere(mb, [Math.cos(ra) * rrk, topY + 1, Math.sin(ra) * rrk], 1.5 + rng() * 2, rock, 5);
      }
    }
    return { lit: mb.upload(false), emis: me.upload(true), R: R, topY: topY };
  }
  function cone(mb, base, r, h, col) {
    var n = 7, tip = [base[0], base[1] + h, base[2]];
    for (var i = 0; i < n; i++) {
      var a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
      mb.tri(
        [base[0] + Math.cos(a1) * r, base[1], base[2] + Math.sin(a1) * r],
        [base[0] + Math.cos(a2) * r, base[1], base[2] + Math.sin(a2) * r],
        tip, col);
    }
    return mb;
  }
  function cyl(mb, base, rTop, rBot, h, col) {
    var n = 8;
    for (var i = 0; i < n; i++) {
      var a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
      var p1 = [base[0] + Math.cos(a1) * rBot, base[1], base[2] + Math.sin(a1) * rBot];
      var p2 = [base[0] + Math.cos(a2) * rBot, base[1], base[2] + Math.sin(a2) * rBot];
      var p3 = [base[0] + Math.cos(a2) * rTop, base[1] + h, base[2] + Math.sin(a2) * rTop];
      var p4 = [base[0] + Math.cos(a1) * rTop, base[1] + h, base[2] + Math.sin(a1) * rTop];
      mb.quad(p1, p2, p3, p4, col);
    }
    return mb;
  }
  function box(mb, c, w, h, d, col) {
    var x0 = c[0] - w / 2, x1 = c[0] + w / 2, y0 = c[1], y1 = c[1] + h, z0 = c[2] - d / 2, z1 = c[2] + d / 2;
    mb.quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0], col);
    mb.quad([x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1], col);
    mb.quad([x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1], col);
    mb.quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0], col);
    mb.quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1], col);
    return mb;
  }
  function prism(mb, c, w, h, d, col) {
    mb.tri([c[0]-w/2,c[1],c[2]-d/2],[c[0]+w/2,c[1],c[2]-d/2],[c[0],c[1]+h,c[2]], col);
    mb.tri([c[0]+w/2,c[1],c[2]+d/2],[c[0]-w/2,c[1],c[2]+d/2],[c[0],c[1]+h,c[2]], col);
    mb.quad([c[0]-w/2,c[1],c[2]-d/2],[c[0],c[1]+h,c[2]],[c[0],c[1]+h,c[2]],[c[0]-w/2,c[1],c[2]+d/2], col);
    return mb;
  }
  function sphere(mb, c, r, col, n) {
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var th1 = i / n * Math.PI, th2 = (i + 1) / n * Math.PI;
        var ph1 = j / n * Math.PI * 2, ph2 = (j + 1) / n * Math.PI * 2;
        var p = function (th, ph) {
          return [c[0] + Math.sin(th) * Math.cos(ph) * r, c[1] + Math.cos(th) * r, c[2] + Math.sin(th) * Math.sin(ph) * r];
        };
        mb.tri(p(th1, ph1), p(th2, ph1), p(th2, ph2), col);
        mb.tri(p(th1, ph1), p(th2, ph2), p(th1, ph2), col);
      }
    }
    return mb;
  }
  function ringGeo(mb, c, r, tube, col) {
    var n = 18;
    for (var i = 0; i < n; i++) {
      var a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
      var p1 = [c[0] + Math.cos(a1) * r, c[1], c[2] + Math.sin(a1) * r];
      var p2 = [c[0] + Math.cos(a2) * r, c[1], c[2] + Math.sin(a2) * r];
      var q1 = [p1[0], p1[1] + tube, p1[2]];
      var q2 = [p2[0], p2[1] + tube, p2[2]];
      mb.quad(p1, p2, q2, q1, col);
    }
    return mb;
  }
  function octa(mb, c, r, col) {
    var t = [c[0], c[1] + r, c[2]], b = [c[0], c[1] - r, c[2]];
    var ring = [];
    for (var i = 0; i < 4; i++) {
      var a = i / 4 * Math.PI * 2 + Math.PI / 4;
      ring.push([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]);
    }
    for (var k = 0; k < 4; k++) {
      mb.tri(t, ring[k], ring[(k + 1) % 4], col);
      mb.tri(b, ring[(k + 1) % 4], ring[k], col);
    }
    return mb;
  }

  /* ================= world generation ================= */
  function buildRegion(regionIdx) {
    var R = D.REGIONS[regionIdx];
    var rng = U.rng(R.seed);
    S.isles = [];
    S.clouds = [];
    for (var i = 0; i < R.isles; i++) {
      var ang = i / R.isles * Math.PI * 2 + rng() * 0.8;
      var dist = R.spread * (0.35 + rng() * 0.65);
      var size = 45 + rng() * 45;
      var opts = {
        trees: Math.floor(rng() * 5),
        houses: rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0,
        beacon: rng() < 0.35,
        pad: i === 0 || rng() < 0.4,
        rocks: 2 + Math.floor(rng() * 3)
      };
      var mesh = buildIsleMesh(rng, size, R, opts);
      S.isles.push({
        x: Math.cos(ang) * dist, y: 60 + rng() * 90, z: Math.sin(ang) * dist,
        mesh: mesh, hasPad: opts.pad, updraft: rng() < 0.4
      });
    }
    for (var cl = 0; cl < R.clouds * S.cloudMul; cl++) {
      S.clouds.push({
        x: (rng() - 0.5) * R.spread * 2.4, y: 30 + rng() * 160, z: (rng() - 0.5) * R.spread * 2.4,
        s: 14 + rng() * 26, drift: 2 + rng() * 4
      });
    }
    // water plane geometry (grid)
    var GRID = 24, EXT = 2600;
    var verts = [];
    for (var gz = 0; gz < GRID; gz++) {
      for (var gx = 0; gx < GRID; gx++) {
        var x0 = (gx / GRID - 0.5) * 2 * EXT, x1 = ((gx + 1) / GRID - 0.5) * 2 * EXT;
        var z0 = (gz / GRID - 0.5) * 2 * EXT, z1 = ((gz + 1) / GRID - 0.5) * 2 * EXT;
        verts.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
        verts.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
      }
    }
    S.waterVBO = S.waterVBO || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, S.waterVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    S.waterN = verts.length / 3;
    // shared dynamic geoms
    S.ringMesh = S.ringMesh || ringGeo(new MeshBuilder(), [0, 0, 0], 1, 0.16, [1, 1, 1]).upload(true);
    S.padMesh = S.padMesh || cyl(new MeshBuilder(), [0, -0.5, 0], 10, 10, 1, [0.4, 0.4, 0.45]).upload(false);
    S.balloonMesh = S.balloonMesh || sphere(new MeshBuilder(), [0, 0, 0], 1, [1, 1, 1], 6).upload(false);
    S.shardMesh = S.shardMesh || octa(new MeshBuilder(), [0, 0, 0], 1, [1, 1, 1]).upload(true);
    S.stormMesh = S.stormMesh || sphere(new MeshBuilder(), [0, 0, 0], 1, [0.16, 0.16, 0.2], 7).upload(false);
    S.craftMesh = buildCraft(save.paint);
    // skyshards for the region (persistent collectibles)
    S.shards = [];
    var rng2 = U.rng(R.seed * 7 + 13);
    for (var sh = 0; sh < 9; sh++) {
      var sa = rng2() * Math.PI * 2, sd = R.spread * (0.3 + rng2() * 0.8);
      var id = regionIdx + ":" + sh;
      if (!save.shards[id]) {
        S.shards.push({ id: id, x: Math.cos(sa) * sd, y: 70 + rng2() * 120, z: Math.sin(sa) * sd });
      }
    }
  }

  var PAINT_COLORS = {
    parchment: [0.9, 0.85, 0.7], ember: [0.9, 0.4, 0.25], tide: [0.25, 0.55, 0.8],
    orchid: [0.75, 0.45, 0.85], moss: [0.4, 0.65, 0.4], dusk: [0.45, 0.35, 0.6],
    gilded: [0.95, 0.8, 0.35], aurora: [0.4, 0.9, 0.75]
  };
  function buildCraft(paint) {
    var col = PAINT_COLORS[paint] || PAINT_COLORS.parchment;
    var mb = new MeshBuilder();
    // fuselage
    mb.quad([-1.2, 0, 4.5], [1.2, 0, 4.5], [0.9, 0, -3], [-0.9, 0, -3], col);
    mb.quad([-1.2, 0.4, 4.5], [-0.9, 0.4, -3], [0.9, 0.4, -3], [1.2, 0.4, 4.5], col);
    mb.quad([-1.2, 0, 4.5], [-0.9, 0.4, -3], [-0.9, 0.4, -3], [-1.2, 0.4, 4.5], col); // skip degenerate
    // wings
    mb.quad([-1.2, 0.2, 1.5], [-8, 0.6, -1.5], [-8, 0.7, -2.8], [-1.2, 0.3, 0.2], col);
    mb.quad([1.2, 0.3, 0.2], [8, 0.7, -2.8], [8, 0.6, -1.5], [1.2, 0.2, 1.5], col);
    // tail
    mb.quad([-0.9, 0.2, -2.5], [-3.4, 0.5, -3.8], [-3.4, 0.55, -4.4], [-0.9, 0.25, -2.9], col);
    mb.quad([0.9, 0.25, -2.9], [3.4, 0.55, -4.4], [3.4, 0.5, -3.8], [0.9, 0.2, -2.5], col);
    mb.quad([-0.4, 0.2, -3], [0.4, 0.2, -3], [0.4, 2.4, -3.9], [-0.4, 2.4, -3.9], col);
    // lantern glow tip
    var tip = new MeshBuilder();
    sphere(tip, [0, 1.4, 2.2], 0.5, [1, 0.9, 0.5], 4);
    return { lit: mb.upload(false), emis: tip.upload(true) };
  }

  /* ================= flight physics ================= */
  function resetCraft(x, y, z, yaw) {
    S.craft = {
      x: x, y: y, z: z, yaw: yaw || 0, pitch: 0, roll: 0,
      speed: 30, boost: 100, hull: 100, vy: 0,
      trailT: 0, camMode: 0, camPos: null
    };
  }
  function craftForward() {
    var cp = Math.cos(S.craft.pitch), sp = Math.sin(S.craft.pitch);
    var cy = Math.cos(S.craft.yaw), sy = Math.sin(S.craft.yaw);
    return [sy * cp, sp, -cy * cp];
  }
  function maxSpeed() { return 42 * (1 + save.upg.engine * 0.12); }
  function turnRate() { return 1.5 * (1 + save.upg.wings * 0.15); }
  function maxHull() { return [100, 140, 180][save.upg.hull] || 100; }

  function updateFlight(dt) {
    var c = S.craft;
    var inp = api.input;
    var stick = inp.computeStick();
    var pitchIn = -stick.y;
    var rollIn = stick.x;
    if (inp.key("ArrowUp")) pitchIn = 1;
    if (inp.key("ArrowDown")) pitchIn = -1;
    if (inp.key("ArrowLeft")) rollIn = -1;
    if (inp.key("ArrowRight")) rollIn = 1;
    if (S.invertY) pitchIn = -pitchIn;
    pitchIn *= S.sens; rollIn *= S.sens;

    var boosting = (inp.key("ShiftLeft") || inp.key("ShiftRight") || inp.btn("boost")) && c.boost > 5;
    var braking = inp.key("Space") || inp.btn("brake");

    c.roll += (rollIn * 0.8 - c.roll) * Math.min(1, dt * 6);
    c.pitch += (pitchIn * 0.9 - c.pitch) * Math.min(1, dt * 5);
    c.pitch = U.clamp(c.pitch, -1.1, 1.1);
    c.yaw += -c.roll * turnRate() * dt;

    var target = maxSpeed() * (boosting ? 1.8 : 1) * (braking ? 0.45 : 1);
    c.speed += (target - c.speed) * Math.min(1, dt * (boosting ? 1.4 : 0.8));
    c.boost = U.clamp(c.boost + (boosting ? -26 : 14) * dt, 0, 100);

    var fwd = craftForward();
    // stall: nose drops at low speed
    var stall = Math.max(0, 20 - c.speed) * 1.6;
    c.vy += (-stall + (boosting ? 6 : 0)) * dt;
    // wind
    if (S.windV) {
      c.x += S.windV[0] * dt; c.y += S.windV[1] * dt; c.z += S.windV[2] * dt;
    }
    // updrafts
    S.isles.forEach(function (is) {
      if (is.updraft) {
        var d = Math.sqrt((c.x - is.x) * (c.x - is.x) + (c.z - is.z) * (c.z - is.z));
        if (d < is.mesh.R * 1.1 && c.y > is.y - 20 && c.y < is.y + 140) {
          c.vy += 26 * dt;
          if (Math.random() < dt * 8) addPart(c.x + U.rand(-6, 6), c.y - 8, c.z + U.rand(-6, 6), [1, 1, 1], 4, 0.7, [0.8, 0.9, 1]);
        }
      }
    });
    c.vy = U.clamp(c.vy, -40, 40);
    c.vy *= (1 - dt * 0.6);
    c.x += fwd[0] * c.speed * dt;
    c.y += (fwd[1] * c.speed + c.vy) * dt;
    c.z += fwd[2] * c.speed * dt;
    if (c.y < 3) c.y = 3; // skimming water floor guard (crash handled below)

    // trail particles
    c.trailT -= dt;
    if (c.trailT <= 0 && S.fx > 0) {
      c.trailT = boosting ? 0.016 : 0.05;
      var col = trailColor();
      addPart(c.x - fwd[0] * 5, c.y - fwd[1] * 5, c.z - fwd[2] * 5, [1.5, 1.5, 1.5], 0.7, 0.6, col);
    }
    // storm damage
    S.storms.forEach(function (st) {
      var d = Math.sqrt((c.x - st.x) * (c.x - st.x) + (c.y - st.y) * (c.y - st.y) + (c.z - st.z) * (c.z - st.z));
      if (d < st.r) {
        c.hull -= 9 * dt;
        c.x += U.rand(-14, 14) * dt * 6; c.y += U.rand(-14, 14) * dt * 6;
        S.stormFlash = 0.2;
        if (Math.random() < dt * 10) addPart(c.x, c.y, c.z, [3, 3, 3], 1.6, 0.25, [1, 0.9, 0.4]);
      }
    });
    // isle collisions
    for (var i = 0; i < S.isles.length; i++) {
      var is = S.isles[i];
      var dx = c.x - is.x, dz = c.z - is.z;
      var hd = Math.sqrt(dx * dx + dz * dz);
      var R = is.mesh.R + 3;
      if (hd < R && c.y < is.y + 2) {
        if (c.y > is.y - 8) {
          // surface contact
          c.y = is.y + 2;
          c.vy = Math.max(0, c.vy);
          if (c.speed > 34) {
            damageCraft(12, "You clipped the clifftop!");
          }
        } else {
          crash("You flew into the cliffs of an isle.");
          return;
        }
      }
    }
    // water
    if (c.y <= 3.5) {
      crash("You skimmed too low — the sea took the kite.");
      return;
    }
    if (c.hull <= 0) {
      crash("The hull gave out.");
      return;
    }
  }
  function damageCraft(n, msg) {
    S.craft.hull -= n;
    S.hurtFlash = 0.3;
    S.shake = Math.min(1, S.fx);
    api.audio.sfx("hit");
    if (msg) api.hud.toast("💥 " + msg, "error", 1400);
  }
  function crash(msg) {
    api.audio.sfx("boom");
    for (var i = 0; i < 30; i++) {
      addPart(S.craft.x, S.craft.y, S.craft.z, [U.rand(3, 6), U.rand(3, 6), U.rand(3, 6)], U.rand(0.4, 0.9), 1, [1, 0.7, 0.3]);
    }
    S.craft.hull -= 35;
    if (S.craft.hull <= 0) { missionFail("Your kite was wrecked."); return; }
    api.hud.toast("🪶 " + msg + " — back to the last checkpoint", "error", 2000);
    var cp = S.checkpoint || { x: S.startPos.x, y: S.startPos.y, z: S.startPos.z, yaw: S.startPos.yaw };
    resetCraft(cp.x, cp.y, cp.z, cp.yaw);
  }
  function trailColor() {
    var t = save.trail;
    if (t === "sparks") return [1, 0.8, 0.3];
    if (t === "stars") return [0.9, 0.9, 1];
    if (t === "petals") return [1, 0.6, 0.75];
    if (t === "bubbles") return [0.9, 0.95, 1];
    return [0.95, 0.85, 0.55];
  }

  /* ================= particles ================= */
  var MAX_PARTS = 400;
  function addPart(x, y, z, size, alpha, life, col) {
    if (!S.parts) S.parts = [];
    if (S.parts.length >= MAX_PARTS * S.fx) S.parts.shift();
    S.parts.push({ x: x, y: y, z: z, size: size, alpha: alpha, life: life, t: 0, col: col });
  }
  function updateParts(dt) {
    for (var i = (S.parts || []).length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.t += dt;
      if (p.t > p.life) S.parts.splice(i, 1);
    }
  }
  var partVBO = null, partData = null;

  /* ================= missions ================= */
  function missionUnlocked(i) {
    if (i === 0) return true;
    var prev = save.done[i - 1];
    var regionIdx = D.MISSIONS[i].region;
    if (totalStars() < D.REGION_STARS[regionIdx]) return false;
    if (D.MISSIONS[i - 1].region === regionIdx) return !!prev;
    return true; // first mission of an unlocked region
  }
  function totalStars() {
    var s = 0;
    Object.keys(save.done).forEach(function (k) { s += save.done[k].stars; });
    return s;
  }
  function rankName() {
    var r = D.RANKS[0];
    D.RANKS.forEach(function (rk) { if (totalStars() >= rk.stars) r = rk; });
    return r.name;
  }

  function startMission(mi) {
    var def = D.MISSIONS[mi];
    var region = D.REGIONS[def.region];
    S.mission = mi;
    S.def = def;
    S.region = def.region;
    S.windMul = region.wind;
    S.cloudMul = S.fx > 0.5 ? 1 : 0.4;
    S.t = 0;
    S.parts = [];
    S.stormFlash = 0; S.hurtFlash = 0; S.shake = 0;
    S.night = !!region.night || def.type === "night";
    buildRegion(def.region);
    // wind vector
    var wr = U.rng(region.seed + 5);
    S.windV = [ (wr() - 0.5) * 24 * S.windMul, 0, (wr() - 0.5) * 24 * S.windMul ];

    // mission layout from seed
    var rng = U.rng(region.seed * 31 + mi * 101);
    S.objectives = [];
    S.pickups = [];
    S.beacons = [];
    S.rings = [];
    S.storms = [];
    S.parcelTargets = [];
    S.stopIndex = 0;
    S.checkpoint = null;

    var isles = S.isles;
    function islePos(idx) { return isles[idx % isles.length]; }

    if (def.type === "tutorial") {
      S.tutStage = 0;
      S.tutDone = [false, false, false];
      var a = islePos(1), b = islePos(4);
      S.objectives = [{ kind: "pickup", x: a.x, y: a.y + 12, z: a.z }, { kind: "deliver", x: b.x, y: b.y + 2, z: b.z }];
      S.startPos = { x: isles[0].x, y: isles[0].y + 40, z: isles[0].z, yaw: Math.atan2(isles[0].x - a.x, isles[0].z - a.z) + Math.PI };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, S.startPos.yaw);
    } else if (def.type === "delivery" || def.type === "night") {
      var a2 = islePos(1 + Math.floor(rng() * 2)), b2 = islePos(3 + Math.floor(rng() * 3));
      S.objectives = [{ kind: "pickup", x: a2.x, y: a2.y + 14, z: a2.z }, { kind: "deliver", x: b2.x, y: b2.y + 2, z: b2.z }];
      S.startPos = { x: isles[0].x, y: isles[0].y + 40, z: isles[0].z, yaw: 0 };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, 0);
    } else if (def.type === "beacon") {
      for (var bi = 0; bi < def.count; bi++) {
        var bi_isle = islePos(bi + 1);
        S.beacons.push({ x: bi_isle.x + (rng() - 0.5) * 60, y: bi_isle.y + 25 + rng() * 30, z: bi_isle.z + (rng() - 0.5) * 60, lit: false });
      }
      S.startPos = { x: isles[0].x, y: isles[0].y + 40, z: isles[0].z, yaw: 0 };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, 0);
    } else if (def.type === "race") {
      var prev = null;
      for (var ri = 0; ri < def.count; ri++) {
        var r_isle = islePos(ri % isles.length);
        var rx = r_isle.x + Math.cos(ri * 1.7) * 90 * (0.4 + rng() * 0.6);
        var ry = Math.max(25, r_isle.y + 30 + Math.sin(ri * 2.1) * 40 + rng() * 30);
        var rz = r_isle.z + Math.sin(ri * 1.7) * 90 * (0.4 + rng() * 0.6);
        S.rings.push({ x: rx, y: ry, z: rz, passed: false });
      }
      S.startPos = { x: S.rings[0].x, y: S.rings[0].y, z: S.rings[0].z + 60, yaw: Math.PI };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, Math.PI);
    } else if (def.type === "hunt") {
      for (var hi = 0; hi < def.count; hi++) {
        var h_isle = islePos(Math.floor(rng() * isles.length));
        S.parcelTargets.push({
          x: h_isle.x + (rng() - 0.5) * 220, y: Math.max(20, h_isle.y + rng() * 120 - 20), z: h_isle.z + (rng() - 0.5) * 220,
          got: false
        });
      }
      S.startPos = { x: isles[0].x, y: isles[0].y + 45, z: isles[0].z, yaw: 0 };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, 0);
    } else { // storm / longhaul / finale
      var stops = def.stops || 2;
      for (var st = 0; st < stops; st++) {
        var s_isle = islePos(st * 2 + 1);
        if (st % 2 === 0) S.objectives.push({ kind: "pickup", x: s_isle.x, y: s_isle.y + 14, z: s_isle.z });
        else S.objectives.push({ kind: "deliver", x: s_isle.x, y: s_isle.y + 2, z: s_isle.z });
      }
      if (def.type === "finale") {
        var f_isle = islePos(isles.length - 1);
        S.objectives.push({ kind: "deliver", x: f_isle.x, y: f_isle.y + 2, z: f_isle.z });
      }
      if (def.type === "storm" || def.type === "finale") {
        for (var sc = 0; sc < (def.type === "finale" ? 4 : 3); sc++) {
          var mid = islePos(sc + 1);
          S.storms.push({ x: (mid.x + isles[0].x) / 2 + (rng() - 0.5) * 120, y: mid.y * 0.6 + 30, z: (mid.z + isles[0].z) / 2 + (rng() - 0.5) * 120, r: 55 + rng() * 30 });
        }
      }
      S.startPos = { x: isles[0].x, y: isles[0].y + 40, z: isles[0].z, yaw: 0 };
      resetCraft(S.startPos.x, S.startPos.y, S.startPos.z, 0);
    }

    S.timeLeft = def.par + 45;
    S.elapsed = 0;
    S.stage = 0; // progress pointer into objectives/beacons/rings
    S.collected = 0;
    S.hullMax = maxHull();
    S.craft.hull = S.hullMax;
    api.screens.close();
    api.setRunning(true);
    api.audio.ambience(def.region === 2 ? "storm" : "wind");
    api.hud.toast("✉ " + def.name, null, 2200);
    updateHud();
  }

  function currentTarget() {
    var def = S.def;
    if (def.type === "beacon") {
      for (var i = 0; i < S.beacons.length; i++) if (!S.beacons[i].lit) return S.beacons[i];
      return null;
    }
    if (def.type === "race") {
      for (var j = 0; j < S.rings.length; j++) if (!S.rings[j].passed) return S.rings[j];
      return null;
    }
    if (def.type === "hunt") return null; // free-for-all, nearest computed in HUD
    if (S.objectives.length) {
      var o = S.objectives[Math.min(S.stage, S.objectives.length - 1)];
      return o;
    }
    return null;
  }

  function updateMission(dt) {
    var c = S.craft;
    var def = S.def;
    S.elapsed += dt;
    S.timeLeft -= dt;
    if (S.timeLeft <= 0) { missionFail("Time ran out — the post waits for no courier."); return; }

    // tutorial prompts
    if (def.type === "tutorial") {
      var inp = api.input;
      if (S.tutStage === 0 && (inp.key("ArrowUp") || inp.key("ArrowDown") || inp.key("KeyW") || inp.key("KeyS") || Math.abs(inp.stick.y) > 0.4)) {
        S.tutDone[0] = true; S.tutStage = 1; api.hud.toast("Great — now bank left and right (A/D or ←/→)", null, 2600);
      } else if (S.tutStage === 1 && (Math.abs(inp.stick.x) > 0.4 || inp.key("ArrowLeft") || inp.key("ArrowRight"))) {
        S.tutDone[1] = true; S.tutStage = 2; api.hud.toast("Perfect. Now boost (Shift / BOOST button) to overtake the wind", null, 2600);
      } else if (S.tutStage === 2 && (inp.key("ShiftLeft") || inp.key("ShiftRight") || inp.btn("boost"))) {
        S.tutDone[2] = true; S.tutStage = 3; api.hud.toast("You're a courier now. Fly through the parcel ring ahead!", null, 2600);
      }
    }

    // objective progression
    if (def.type === "beacon") {
      var nb = S.beacons.find(function (b) { return !b.lit; });
      if (nb) {
        var dnb = dist3(c, nb);
        if (dnb < 16) {
          nb.lit = true;
          api.audio.sfx("chime");
          api.hud.toast("🔆 Beacon " + S.beacons.filter(function (b) { return b.lit; }).length + "/" + S.beacons.length + " lit", null, 1400);
          S.checkpoint = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
          for (var pi = 0; pi < 16; pi++) addPart(nb.x, nb.y, nb.z, 3, 1, 0.8, [1, 0.9, 0.4]);
        }
      } else missionComplete();
    } else if (def.type === "race") {
      var nr = S.rings.find(function (r) { return !r.passed; });
      if (nr) {
        var dnr = dist3(c, nr);
        if (dnr < 15) {
          nr.passed = true;
          api.audio.sfx("blip");
          S.checkpoint = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
        }
      } else missionComplete();
    } else if (def.type === "hunt") {
      S.parcelTargets.forEach(function (p) {
        if (!p.got && dist3(c, p) < 14) {
          p.got = true;
          S.collected++;
          api.audio.sfx("pickup");
          api.hud.toast("📦 Parcel recovered (" + S.collected + "/" + def.count + ")", null, 1300);
        }
      });
      if (S.collected >= def.count) missionComplete();
    } else {
      // objectives sequence (pickup/deliver)
      var o = S.objectives[S.stage];
      if (o) {
        var d = dist3(c, o);
        if (o.kind === "pickup" && d < 15) {
          S.stage++;
          api.audio.sfx("chime");
          api.hud.toast("📦 Parcel collected!", null, 1500);
          S.checkpoint = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
        } else if (o.kind === "deliver") {
          var nearPad = d < 26 && c.speed < 30 && Math.abs(c.y - o.y) < 12;
          if (d < 15) { // fly-through delivery also counts (generous)
            S.stage++;
            api.audio.sfx("win");
            api.hud.toast("🏠 Delivered!", null, 1500);
            if (S.stage >= S.objectives.length) missionComplete();
          } else if (nearPad && c.speed < 16) {
            S.stage++;
            api.audio.sfx("land");
            api.hud.toast("🛬 Smooth docking!", null, 1500);
            if (S.stage >= S.objectives.length) missionComplete();
          }
        }
      }
    }

    // skyshards
    for (var si = (S.shards || []).length - 1; si >= 0; si--) {
      var sh = S.shards[si];
      if (dist3(c, sh) < 14) {
        save.shards[sh.id] = true;
        S.shards.splice(si, 1);
        api.audio.sfx("chime");
        api.hud.toast("✦ Skyshard collected!", null, 1500);
        api.save.save();
        var total = Object.keys(save.shards).length;
        if (total === 45) api.hud.toast("✦ All 45 skyshards found!", null, 3000);
      }
    }
  }
  function dist3(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function starsFor() {
    var def = S.def;
    var s = 1;
    if (S.elapsed <= def.par) s = 2;
    if (S.elapsed <= def.par && S.craft.hull >= S.hullMax * 0.6) s = 3;
    return s;
  }
  function missionComplete() {
    api.setRunning(false);
    var stars = starsFor();
    var coins = Math.round(S.def.coins * (0.6 + stars * 0.2));
    var rec = save.done[S.mission] || (save.done[S.mission] = { stars: 0, best: 0 });
    rec.stars = Math.max(rec.stars, stars);
    rec.best = rec.best ? Math.min(rec.best, S.elapsed) : S.elapsed;
    save.coins += coins;
    api.save.save();
    syncAggregates();
    api.audio.sfx("win");
    if (totalStars() >= 16) Atlas.award("driftpost-rank2");
    var hasNext = S.mission + 1 < D.MISSIONS.length;
    api.screens.open({
      title: "✉ Delivery complete!",
      subtitle: S.def.name,
      label: "Mission complete",
      bodyHTML:
        '<div class="stat-line"><span>Time</span><b>' + U.fmtTime(S.elapsed) + " (par " + U.fmtTime(S.def.par) + ")</b></div>" +
        '<div class="stat-line"><span>Hull intact</span><b>' + Math.max(0, Math.round(S.craft.hull / S.hullMax * 100)) + "%</b></div>" +
        '<div class="stat-line"><span>Coins earned</span><b>' + coins + " ⚭</b></div>" +
        '<div class="stat-line"><span>Total stars</span><b>' + totalStars() + "</b></div>" +
        '<div class="stars" style="font-size:1.7rem;margin-top:10px">' + starStr(stars) + "</div>" +
        '<p class="tips">' + rankName() + " · " + Object.keys(save.shards).length + "/45 skyshards</p>",
      buttons: [
        hasNext && missionUnlocked(S.mission + 1)
          ? { label: "Next mission ▶", cls: "", onClick: function () { startMission(S.mission + 1); }, focus: true }
          : { label: "Mission board", cls: "", onClick: showBoard, focus: true },
        { label: "Replay for stars", onClick: function () { startMission(S.mission); } },
        { label: "Post office (shop)", onClick: showShop, small: true },
        { label: "Title screen", onClick: showTitle, small: true }
      ]
    });
  }
  function missionFail(reason) {
    api.setRunning(false);
    api.audio.sfx("fail");
    api.screens.open({
      title: "Mission failed",
      subtitle: reason,
      label: "Mission failed",
      bodyHTML: '<p class="tips">The Gale Post is patient. Refit at the post office, check the wind, and fly it again.</p>',
      buttons: [
        { label: "Retry mission", cls: "", onClick: function () { startMission(S.mission); }, focus: true },
        { label: "Mission board", onClick: showBoard, small: true },
        { label: "Title screen", onClick: showTitle, small: true }
      ]
    });
  }
  function starStr(n) {
    var s = "";
    for (var i = 1; i <= 3; i++) s += i <= n ? "★" : '<span class="off">★</span>';
    return s;
  }
  function syncAggregates() {
    var done = Object.keys(save.done).length;
    var blob = Atlas.profile.game("driftpost");
    blob.missionsTotal = D.MISSIONS.length;
    blob.missionsDone = done;
    blob.starsTotal = totalStars();
    Atlas.persist();
  }

  /* ================= HUD ================= */
  function buildHud() {
    api.hud.init();
    api.hud.el.innerHTML =
      '<div class="hud-tl"><div class="hud-panel" id="dpObj"></div><div class="hud-panel" style="margin-top:4px" id="dpTime"></div></div>' +
      '<div class="hud-tr"><div class="hud-panel" id="dpSpeed"></div>' +
      '<div class="hud-panel" style="margin-top:4px" id="dpStatus"></div></div>' +
      '<div class="hud-bl"><div class="hud-panel" id="dpMeters">' +
      '<div class="hud-meter"><span class="m-label">Hull</span><div class="m-bar"><i id="dpHull" style="background:#57d98a"></i></div></div>' +
      '<div class="hud-meter"><span class="m-label">Boost</span><div class="m-bar"><i id="dpBoost" style="background:#3ddad7"></i></div></div>' +
      "</div></div>" +
      '<div class="hud-br"><div class="hud-panel" id="dpCoins"></div></div>' +
      '<div id="dpMarker" style="position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);color:#ffd257;font-weight:700;font-size:15px;text-shadow:0 1px 3px rgba(0,0,0,0.8);display:none">▲<div id="dpDist" style="font-size:11px;text-align:center"></div></div>';
    api.input.addTouchButtons([{ id: "boost", label: "Boost" }, { id: "brake", label: "Brake" }]);
  }
  function updateHud() {
    var el = function (id) { return document.getElementById(id); };
    if (!el("dpObj")) return;
    var def = S.def;
    var obj = el("dpObj");
    if (def.type === "tutorial") {
      obj.textContent = S.tutStage < 3
        ? ["Tutorial: pitch up/down (W/S or stick)", "Tutorial: bank left/right (A/D)", "Tutorial: boost (Shift)"][S.tutStage]
        : "Now: fly the parcel route!";
    } else if (def.type === "beacon") {
      obj.textContent = "🔆 Beacons " + S.beacons.filter(function (b) { return b.lit; }).length + "/" + S.beacons.length;
    } else if (def.type === "race") {
      obj.textContent = "🏁 Rings " + S.rings.filter(function (r) { return r.passed; }).length + "/" + S.rings.length;
    } else if (def.type === "hunt") {
      obj.textContent = "📦 Parcels " + S.collected + "/" + def.count;
    } else {
      var o = S.objectives[S.stage];
      obj.textContent = o ? (o.kind === "pickup" ? "📦 Collect the parcel" : "🏠 Deliver & dock") : "Done!";
    }
    el("dpTime").textContent = "⏱ " + U.fmtTime(Math.max(0, S.timeLeft));
    el("dpSpeed").textContent = Math.round(S.craft.speed * 6) + " knots";
    el("dpStatus").textContent = (S.night ? "🌙 night · " : "") + D.REGIONS[S.region].name;
    el("dpCoins").textContent = "⚭ " + save.coins + " · ✦ " + Object.keys(save.shards).length + "/45";
    el("dpHull").style.width = Math.max(0, S.craft.hull / S.hullMax * 100) + "%";
    el("dpBoost").style.width = S.craft.boost + "%";
    // marker
    var t = currentTarget();
    var mk = el("dpMarker");
    if (t && def.type !== "hunt") {
      mk.style.display = "block";
      el("dpDist").textContent = Math.round(dist3(S.craft, t)) + "m";
      positionMarker(t);
    } else {
      mk.style.display = "none";
    }
  }
  function positionMarker(t) {
    // project target into screen space
    var vp = S.viewProj;
    if (!vp) return;
    var x = t.x, y = t.y, z = t.z;
    var w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    var cx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
    var cy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
    var el = document.getElementById("dpMarker");
    if (!el) return;
    var canvas = api.canvas;
    var half = 0.12;
    if (w > 0 && Math.abs(cx) < 1 - half && Math.abs(cy) < 1 - half) {
      el.style.left = ((cx * 0.5 + 0.5) * 100) + "%";
      el.style.top = ((-cy * 0.5 + 0.5) * 100) + "%";
      el.textContent = "◆";
    } else {
      // clamp to screen edges
      var ang = Math.atan2(cy, cx);
      var px = U.clamp(cx, -0.92, 0.92), py = U.clamp(cy, -0.85, 0.85);
      if (w < 0) { px = -px; py = -py; }
      el.style.left = ((px * 0.5 + 0.5) * 100) + "%";
      el.style.top = ((-py * 0.5 + 0.5) * 100) + "%";
      el.textContent = "➤";
    }
  }

  /* ================= screens ================= */
  function showTitle() {
    api.setRunning(false);
    api.screens.open({
      title: "✈ Driftpost",
      subtitle: "The Gale Post is hiring. The sky is the route map.",
      label: "Driftpost title screen",
      bodyHTML:
        '<div class="stat-line"><span>Courier rank</span><b>' + rankName() + "</b></div>" +
        '<div class="stat-line"><span>Missions flown</span><b>' + Object.keys(save.done).length + " / " + D.MISSIONS.length + "</b></div>" +
        '<div class="stat-line"><span>Coins / shards</span><b>' + save.coins + " ⚭ · " + Object.keys(save.shards).length + "/45 ✦</b></div>" +
        '<p class="tips">Deliver post across five island regions: race ring courses, light beacon chains, thread storm cells and run night lantern routes. Stars unlock regions, ranks and the Century Flight.</p>',
      buttons: [
        { label: Object.keys(save.done).length ? "Continue ▶" : "Start your courier career ▶", cls: "", onClick: showBoard, focus: true },
        { label: "Post office (upgrades)", onClick: showShop },
        { label: "How to fly", onClick: showHelp, small: true },
        { label: "Settings", onClick: function () { showSettings(showTitle); }, small: true }
      ]
    });
  }
  function showBoard() {
    api.setRunning(false);
    var html = "";
    D.REGIONS.forEach(function (rg, gi) {
      var unlocked = totalStars() >= D.REGION_STARS[gi];
      html += '<div class="small" style="margin:10px 0 4px;font-weight:700;color:' + (unlocked ? "var(--amber)" : "var(--faint)") + '">' +
        (unlocked ? "☀" : "🔒") + " Region " + (gi + 1) + " · " + rg.name +
        (unlocked ? "" : " — needs " + D.REGION_STARS[gi] + " stars") + "</div>";
      D.MISSIONS.forEach(function (m, mi) {
        if (m.region !== gi) return;
        var rec = save.done[mi];
        var unlockedM = missionUnlocked(mi);
        html += '<div class="mission-item' + (unlockedM ? "" : " locked") + '" data-mi="' + mi + '" role="button" tabindex="0">' +
          '<div class="mi-icon">' + (unlockedM ? "✉" : "🔒") + "</div>" +
          '<div class="mi-body"><b>Mission ' + (mi + 1) + " · " + m.name + "</b><span>" + m.brief + "</span></div>" +
          '<div class="mi-stars">' + (unlockedM ? (rec ? starStr(rec.stars) : '<span class="off">★★★</span>') : "") + "</div></div>";
      });
    });
    api.screens.open({
      title: "Mission board",
      subtitle: rankName() + " · " + totalStars() + " ★ · " + save.coins + " ⚭",
      label: "Mission board",
      bodyHTML: '<div class="mission-list">' + html + "</div>",
      buttons: [
        { label: "◀ Title", onClick: showTitle, small: true },
        { label: "Post office", onClick: showShop, small: true }
      ]
    });
    var body = api.screens.layer.querySelector(".screen-card .sc-body");
    body.addEventListener("click", function (e) {
      var it = e.target.closest("[data-mi]");
      if (!it || it.classList.contains("locked")) {
        if (it) api.audio.sfx("hurt");
        return;
      }
      startMission(parseInt(it.getAttribute("data-mi"), 10));
    });
  }
  function showShop() {
    api.setRunning(false);
    var buttons = [];
    Object.keys(D.UPGRADES).forEach(function (k) {
      var u = D.UPGRADES[k];
      var next = u.tiers[save.upg[k] + 1];
      if (next) {
        buttons.push({ label: u.icon + " " + u.name + " → " + next.desc + " (" + next.cost + " ⚭)",
          cls: save.coins >= next.cost ? "" : "ghost", small: true, onClick: function () {
            if (save.coins < next.cost) { api.audio.sfx("hurt"); api.hud.toast("Not enough coins", "error", 1000); return; }
            save.coins -= next.cost;
            save.upg[k]++;
            api.save.save();
            api.audio.sfx("win");
            showShop();
          } });
      } else {
        buttons.push({ label: u.icon + " " + u.name + " — fully upgraded ✔", cls: "ghost", small: true, onClick: function () {} });
      }
    });
    D.PAINTS.forEach(function (p) {
      var owned = save.paints.indexOf(p.id) >= 0;
      buttons.push({ label: "🎨 " + p.name + (owned ? (save.paint === p.id ? " ✔ active" : " — use") : " (" + p.cost + " ⚭)"),
        cls: owned || save.coins >= p.cost ? "ghost" : "ghost", small: true, onClick: function () {
          if (!owned) {
            if (save.coins < p.cost) { api.audio.sfx("hurt"); return; }
            save.coins -= p.cost;
            save.paints.push(p.id);
          }
          save.paint = p.id;
          S.craftMesh = buildCraft(save.paint);
          api.save.save();
          api.audio.sfx("blip");
          showShop();
        } });
    });
    D.TRAILS.forEach(function (t) {
      var owned = save.trails.indexOf(t.id) >= 0;
      buttons.push({ label: "💨 " + t.name + (owned ? (save.trail === t.id ? " ✔ active" : " — use") : " (" + t.cost + " ⚭)"),
        cls: "ghost", small: true, onClick: function () {
          if (!owned) {
            if (save.coins < t.cost) { api.audio.sfx("hurt"); return; }
            save.coins -= t.cost;
            save.trails.push(t.id);
          }
          save.trail = t.id;
          api.save.save();
          api.audio.sfx("blip");
          showShop();
        } });
    });
    buttons.push({ label: "◀ Back", cls: "danger", small: true, onClick: showTitle });
    api.screens.open({
      title: "Gale Post Office",
      subtitle: "You carry " + save.coins + " ⚭ coins",
      label: "Shop",
      bodyHTML: "<p class='tips'>Upgrades change how your kite flies. Paints and trails are pure style — the wind doesn't judge.</p>",
      buttons: buttons
    });
  }
  function showHelp() {
    api.screens.open({
      title: "How to fly",
      subtitle: "Gale Post flight manual",
      label: "How to fly",
      bodyHTML:
        '<div class="stat-line"><span>Pitch</span><b>W/S or ↑/↓ (stick: up/down)</b></div>' +
        '<div class="stat-line"><span>Bank &amp; turn</span><b>A/D or ←/→</b></div>' +
        '<div class="stat-line"><span>Boost</span><b>Shift / BOOST button</b></div>' +
        '<div class="stat-line"><span>Brake</span><b>Space / BRAKE button</b></div>' +
        '<div class="stat-line"><span>Camera</span><b>C — near/far/action</b></div>' +
        '<div class="stat-line"><span>Pause</span><b>Esc</b></div>' +
        '<p class="tips">Bank to turn — the kite carves through the sky. Slow down before docking (under 16 knots). Storm cells (dark rolling clouds) chew hull — thread them or fly around. Updraft columns under some isles give free lift. Checkpoints save your position mid-mission.</p>',
      buttons: [{ label: "Got it", cls: "", onClick: showTitle, focus: true }]
    });
  }
  function showSettings(back) {
    api.screens.open({
      title: "Settings",
      label: "Settings",
      dismissible: true,
      onEscape: back || showTitle,
      bodyHTML: api.screens.settingsRows() +
        '<div class="set-row"><div class="set-lbl">Invert pitch<small>For flight-sim veterans</small></div>' +
        '<div class="switch"><input type="checkbox" id="dpInvert"' + (save.invertY ? " checked" : "") + '><i></i></div></div>' +
        '<div class="set-row"><div class="set-lbl">Control sensitivity<small>How sharp the kite answers</small></div>' +
        '<input type="range" id="dpSens" min="0.5" max="1.5" step="0.05" value="' + save.sens + '"></div>',
      buttons: [{ label: "Done", cls: "", onClick: back || showTitle, focus: true }]
    });
    api.screens.bindSettings();
    var inv = document.getElementById("dpInvert");
    if (inv) inv.addEventListener("change", function () { save.invertY = inv.checked; api.save.save(); });
    var sens = document.getElementById("dpSens");
    if (sens) sens.addEventListener("change", function () { save.sens = parseFloat(sens.value); api.save.save(); });
  }
  function openPause() {
    if (!api.isRunning()) return;
    api.setRunning(false);
    api.save.save();
    api.screens.open({
      title: "Paused",
      subtitle: S.def.name,
      label: "Pause menu",
      bodyHTML:
        '<div class="stat-line"><span>Time left</span><b>' + U.fmtTime(Math.max(0, S.timeLeft)) + "</b></div>" +
        '<div class="stat-line"><span>Hull</span><b>' + Math.max(0, Math.round(S.craft.hull / S.hullMax * 100)) + "%</b></div>" +
        '<div class="stat-line"><span>Progress</span><b>' + missionProgressText() + "</b></div>",
      buttons: [
        { label: "Resume", cls: "", onClick: resume, focus: true },
        { label: "Restart mission", onClick: function () { startMission(S.mission); } },
        { label: "How to fly", onClick: showHelp, small: true },
        { label: "Settings", onClick: function () { showSettings(openPause); }, small: true },
        { label: "Abandon to title", cls: "danger", small: true, onClick: showTitle }
      ]
    });
  }
  function missionProgressText() {
    var def = S.def;
    if (def.type === "beacon") return S.beacons.filter(function (b) { return b.lit; }).length + "/" + S.beacons.length + " beacons";
    if (def.type === "race") return S.rings.filter(function (r) { return r.passed; }).length + "/" + S.rings.length + " rings";
    if (def.type === "hunt") return S.collected + "/" + def.count + " parcels";
    if (S.objectives.length) return Math.min(S.stage, S.objectives.length) + "/" + S.objectives.length + " stops";
    return "—";
  }
  function resume() {
    api.screens.close();
    api.setRunning(true);
  }

  /* ================= QA hooks ================= */
  function qaKeys() {
    if (!qa) return;
    if (api.input.consume("KeyQ")) {
      var def = S.def;
      if (def.type === "beacon") S.beacons.forEach(function (b) { b.lit = true; });
      else if (def.type === "race") S.rings.forEach(function (r) { r.passed = true; });
      else if (def.type === "hunt") { S.parcelTargets.forEach(function (p) { p.got = true; }); S.collected = def.count; }
      else if (S.objectives.length) S.stage = S.objectives.length;
      missionComplete();
      api.hud.toast("QA: mission completed", "error", 800);
    }
    if (api.input.consume("KeyW")) { save.coins += 50; api.save.save(); api.hud.toast("QA: +50 coins", "error", 800); }
    if (api.input.consume("KeyT")) {
      var rec = save.done[S.mission] || (save.done[S.mission] = { stars: 0 });
      rec.stars = 3;
      api.save.save(); syncAggregates();
      api.hud.toast("QA: +3 stars", "error", 800);
    }
  }

  /* ================= rendering ================= */
  function render(a, dt) {
    if (!gl) return;
    var w = a.w, h = a.h;
    var R = D.REGIONS[S.region];
    var c = S.craft;
    S.t += dt;

    // camera
    var fwd = craftForward();
    var camDist = c.camMode === 0 ? 17 : c.camMode === 1 ? 26 : 12;
    var camH = c.camMode === 2 ? 3 : 6.5;
    var eye = [c.x - fwd[0] * camDist, c.y + camH - fwd[1] * camDist * 0.4, c.z - fwd[2] * camDist];
    if (c.camMode === 2) eye = [c.x - fwd[0] * 8 + Math.sin(S.t * 0.7) * 6, c.y + 2.5, c.z - fwd[2] * 8 + Math.cos(S.t * 0.7) * 6];
    if (!c.camPos) c.camPos = eye.slice();
    for (var ci = 0; ci < 3; ci++) c.camPos[ci] += (eye[ci] - c.camPos[ci]) * Math.min(1, dt * 5);
    var ctr = [c.x + fwd[0] * 14, c.y + fwd[1] * 14 + 2, c.z + fwd[2] * 14];
    var aspect = w / h;
    var fov = 1.0 + (api.input.key("ShiftLeft") ? 0.08 : 0);
    var proj = m4.persp(fov, aspect, 0.5, 2400);
    var view = m4.lookAt(c.camPos, ctr, [0, 1, 0]);
    S.viewProj = m4.mul(proj, view);
    var vp = S.viewProj;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* sky */
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progSky);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVAO);
    gl.enableVertexAttribArray(loc.sky.aP);
    gl.vertexAttribPointer(loc.sky.aP, 2, gl.FLOAT, false, 0, 0);
    // sun screen position: project sun direction point far away
    var sunDir = norm3([0.55, 0.5, 0.62]);
    var sunPoint = [c.camPos[0] + sunDir[0] * 900, c.camPos[1] + sunDir[1] * 900, c.camPos[2] + sunDir[2] * 900];
    var sw = vp[3] * sunPoint[0] + vp[7] * sunPoint[1] + vp[11] * sunPoint[2] + vp[15];
    var sx2 = (vp[0] * sunPoint[0] + vp[4] * sunPoint[1] + vp[8] * sunPoint[2] + vp[12]) / sw;
    var sy2 = (vp[1] * sunPoint[0] + vp[5] * sunPoint[1] + vp[9] * sunPoint[2] + vp[13]) / sw;
    gl.uniform3fv(loc.sky.uTop, S.night ? [0.02, 0.03, 0.1] : hexToGl(R.sky[0]));
    gl.uniform3fv(loc.sky.uBottom, S.night ? [0.06, 0.09, 0.2] : hexToGl(R.sky[1]));
    gl.uniform2f(loc.sky.uSun, sx2, sy2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.DEPTH_TEST);

    /* water */
    gl.useProgram(progWater);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.waterVBO);
    gl.enableVertexAttribArray(loc.water.aP);
    gl.vertexAttribPointer(loc.water.aP, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(loc.water.uVP, false, new Float32Array(vp));
    gl.uniform1f(loc.water.uT, S.t);
    var deep = S.night ? [0.02, 0.04, 0.09] : R.water;
    gl.uniform3fv(loc.water.uDeep, deep);
    gl.uniform3fv(loc.water.uShallow, [deep[0] * 2.2, deep[1] * 2.2, deep[2] * 2.2]);
    gl.uniform3fv(loc.water.uSunC, S.night ? [0.2, 0.25, 0.4] : R.sun);
    gl.uniform3fv(loc.water.uLight, sunDir);
    gl.uniform3fv(loc.water.uFogC, fogColor());
    gl.uniform1f(loc.water.uFogD, R.fog * (S.quality === "low" ? 1.6 : 1));
    gl.drawArrays(gl.TRIANGLES, 0, S.waterN);

    /* meshes */
    gl.useProgram(progMesh);
    gl.uniformMatrix4fv(loc.mesh.uVP, false, new Float32Array(vp));
    gl.uniform3fv(loc.mesh.uLight, sunDir);
    gl.uniform3fv(loc.mesh.uSunC, S.night ? [0.3, 0.35, 0.5] : R.sun);
    gl.uniform3fv(loc.mesh.uAmb, S.night ? [0.24, 0.28, 0.4] : [0.42, 0.42, 0.46]);
    gl.uniform3fv(loc.mesh.uFogC, fogColor());
    gl.uniform1f(loc.mesh.uFogD, R.fog * (S.quality === "low" ? 1.6 : 1));

    function drawMesh(mesh, model, emissive) {
      gl.uniformMatrix4fv(loc.mesh.uM, false, new Float32Array(model));
      gl.uniform1f(loc.mesh.uEmis, emissive ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(loc.mesh.aP);
      gl.vertexAttribPointer(loc.mesh.aP, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(loc.mesh.aN);
      gl.vertexAttribPointer(loc.mesh.aN, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(loc.mesh.aC);
      gl.vertexAttribPointer(loc.mesh.aC, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
    }

    // isles
    S.isles.forEach(function (is) {
      var m = m4.model(is.x, is.y, is.z, 0, 1);
      drawMesh(is.mesh.lit, m, false);
      if (is.mesh.emis.n) drawMesh(is.mesh.emis, m, true);
    });
    // clouds
    if (S.fx > 0.3) {
      S.clouds.forEach(function (cl) {
        cl.x += cl.drift * dt;
        drawMesh(S.cloudMesh || (S.cloudMesh = sphere(new MeshBuilder(), [0, 0, 0], 1, [0.93, 0.93, 0.96], 5).upload(false)),
          m4.model(cl.x, cl.y, cl.z, 0, cl.s), false);
      });
    }
    // craft
    var craftM = m4.mul(m4.model(c.x, c.y, c.z, c.yaw, 1), tiltMatrix(c));
    drawMesh(S.craftMesh.lit, craftM, false);
    drawMesh(S.craftMesh.emis, craftM, true);
    // lantern halo at night
    if (S.night) {
      drawMesh(S.haloMesh || (S.haloMesh = sphere(new MeshBuilder(), [0, 0, 0], 1, [1.0, 0.9, 0.55], 6).upload(true)),
        m4.model(c.x, c.y + 1.5, c.z, 0, 4.5), true);
    }
    // rings
    S.rings.forEach(function (r) {
      drawMesh(S.ringMesh, m4.model(r.x, r.y, r.z, S.t * 0.6, 8), true);
    });
    // beacons
    S.beacons.forEach(function (b) {
      drawMesh(S.buoyMesh || (S.buoyMesh = cyl(new MeshBuilder(), [0, -6, 0], 1.4, 1.8, 10, [0.3, 0.32, 0.4]).upload(false)),
        m4.model(b.x, b.y - 5, b.z, 0, 1), false);
      if (!b.lit) drawMesh(S.haloMesh, m4.model(b.x, b.y + 4, b.z, 0, 1.6), true);
    });
    // parcels
    S.parcelTargets.forEach(function (p) {
      if (p.got) return;
      drawMesh(S.balloonMesh, m4.model(p.x, p.y + 3 + Math.sin(S.t * 2 + p.x) * 1.5, p.z, 0, 3), false);
      drawMesh(S.haloMesh, m4.model(p.x, p.y + 6.5, p.z, 0, 0.9), true);
    });
    // storms
    S.storms.forEach(function (st) {
      drawMesh(S.stormMesh, m4.model(st.x, st.y, st.z, S.t * 0.2, st.r * 0.8), false);
    });
    // shards
    (S.shards || []).forEach(function (sh) {
      drawMesh(S.shardMesh, m4.model(sh.x, sh.y + Math.sin(S.t * 2.4 + sh.x) * 2, sh.z, S.t * 1.4, 1.8), true);
    });
    // objectives markers (pickup rings / pads)
    if (S.objectives.length) {
      var o = S.objectives[Math.min(S.stage, S.objectives.length - 1)];
      if (o && S.stage < S.objectives.length) {
        if (o.kind === "pickup") {
          drawMesh(S.ringMesh, m4.model(o.x, o.y, o.z, S.t * 0.8, 10), true);
        } else {
          drawMesh(S.padMesh, m4.model(o.x, o.y, o.z, 0, 1), false);
          drawMesh(S.ringMesh, m4.model(o.x, o.y + 1, o.z, S.t * 0.8, 10), true);
        }
      }
    }

    /* particles */
    var parts = S.parts || [];
    if (parts.length) {
      if (!partVBO) { partVBO = gl.createBuffer(); partData = new Float32Array(MAX_PARTS * 8); }
      var n = Math.min(parts.length, MAX_PARTS);
      for (var i = 0; i < n; i++) {
        var p = parts[i];
        var k = i * 8;
        partData[k] = p.x; partData[k + 1] = p.y; partData[k + 2] = p.z;
        partData[k + 3] = p.size; partData[k + 4] = p.alpha * (1 - p.t / p.life);
        partData[k + 5] = p.col[0]; partData[k + 6] = p.col[1]; partData[k + 7] = p.col[2];
      }
      gl.useProgram(progPart);
      gl.uniformMatrix4fv(loc.part.uVP, false, new Float32Array(vp));
      gl.bindBuffer(gl.ARRAY_BUFFER, partVBO);
      gl.bufferData(gl.ARRAY_BUFFER, partData.subarray(0, n * 8), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc.part.aP);
      gl.vertexAttribPointer(loc.part.aP, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(loc.part.aSA);
      gl.vertexAttribPointer(loc.part.aSA, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(loc.part.aC);
      gl.vertexAttribPointer(loc.part.aC, 3, gl.FLOAT, false, 32, 20);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // storm flash overlay via HUD
    if (S.stormFlash > 0) {
      S.stormFlash -= dt;
      var fEl = document.getElementById("dpFlash");
      if (!fEl) {
        fEl = document.createElement("div");
        fEl.id = "dpFlash";
        fEl.style.cssText = "position:absolute;inset:0;background:rgba(255,240,200,0.0);pointer-events:none;z-index:4";
        api.canvas.parentElement.appendChild(fEl);
      }
      fEl.style.background = "rgba(255,240,200," + (S.stormFlash * 1.2) + ")";
    }
    if (S.hurtFlash > 0) {
      S.hurtFlash -= dt;
      var hEl = document.getElementById("dpHurt");
      if (!hEl) {
        hEl = document.createElement("div");
        hEl.id = "dpHurt";
        hEl.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:4;box-shadow:inset 0 0 80px rgba(255,60,80,0);transition:box-shadow 0.1s";
        api.canvas.parentElement.appendChild(hEl);
      }
      hEl.style.boxShadow = "inset 0 0 80px rgba(255,60,80," + Math.min(0.8, S.hurtFlash * 2) + ")";
    }
    updateHud();
  }
  function tiltMatrix(c) {
    // pitch/roll visual: build small rotation matrix
    var cp = Math.cos(c.pitch * 0.5), sp = Math.sin(c.pitch * 0.5);
    var cr = Math.cos(c.roll * 0.7), sr = Math.sin(c.roll * 0.7);
    // R = Ry(yaw already in model) * Rx(pitch) * Rz(roll)
    return [1,0,0,0, 0,cp,sr,0, 0,-sp,cp,0, 0,0,0,1].map(function (v, i) {
      // combine roll around forward axis (z) after pitch: approximate
      return v;
    });
  }
  function fogColor() {
    var R = D.REGIONS[S.region];
    var b = hexToGl(R.sky[1]);
    var t = hexToGl(R.sky[0]);
    return [b[0] * 0.7 + t[0] * 0.3, b[1] * 0.7 + t[1] * 0.3, b[2] * 0.7 + t[2] * 0.3];
  }
  function hexToGl(hex) {
    return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  }

  /* ================= boot ================= */
  GK.boot({
    canvas: "#game",
    gameId: "driftpost",
    saveId: "driftpost",
    defaults: {
      done: {}, coins: 60, upg: { engine: 0, wings: 0, hull: 0, lantern: 0, compass: 0 },
      paints: ["parchment"], paint: "parchment", trails: ["none"], trail: "none",
      shards: {}, invertY: false, sens: 1
    },
    webgl: true,
    on: {
      init: function (a) {
        api = a;
        save = a.save.load();
        if (!save.upg) save.upg = { engine: 0, wings: 0, hull: 0, lantern: 0, compass: 0 };
        if (!gl) {
          var ok = initGL(a.canvas);
          if (!ok) {
            showWebglError();
            return;
          }
        }
        S = a.state = {
          t: 0, mission: 0, def: D.MISSIONS[0], region: 0,
          isles: [], clouds: [], storms: [], parts: [], shards: [],
          rings: [], beacons: [], parcelTargets: [], objectives: [],
          craft: null, fx: Math.max(0.3, a.quality.fxMul()),
          quality: a.quality.level, invertY: false, sens: 1
        };
        S.cloudMul = 1;
        buildHud();
        a.input.setTouchVisible(true);
        // keyboard: C toggles camera
        window.addEventListener("keydown", function (e) {
          if (e.code === "KeyC" && S.craft && api.isRunning()) {
            S.craft.camMode = (S.craft.camMode + 1) % 3;
            api.audio.sfx("click");
          }
          if (e.code === "KeyM") {
            var pr = Atlas.profile.get();
            Atlas.profile.setSetting("muted", !pr.settings.muted);
            Atlas.persist();
          }
        });
      },
      title: function () {
        if (!gl) return;
        // idle background scene
        if (!S.craft) {
          S.mission = 0; S.def = D.MISSIONS[0]; S.region = 0;
          buildRegion(0);
          resetCraft(S.isles[0].x, S.isles[0].y + 45, S.isles[0].z, 0);
          S.windV = [0, 0, 0];
          S.waterVBO = null;
          buildRegion(0);
        }
        showTitle();
      },
      update: function (a, dt) {
        if (!gl || !S.craft) return;
        if (a.input.consumeBtn("pause")) openPause();
        qaKeys();
        var turbo = parseFloat((location.search.match(/[?&]turbo=([\d.]+)/) || [0, 0])[1]) || 1;
        var d = Math.min(dt, 0.05) * turbo;
        updateFlight(d);
        if (api.isRunning()) updateMission(d);
        updateParts(d);
      },
      render: function (a, dt) {
        if (!gl || !S.craft) return;
        render(a, dt);
      },
      requestPause: function () { openPause(); },
      onAutoPause: function () { openPause(); }
    }
  });

  function showWebglError() {
    api.screens.open({
      title: "3D unavailable",
      subtitle: "WebGL could not start on this device",
      label: "WebGL error",
      bodyHTML: '<p class="tips">Driftpost needs WebGL (hardware or software rendering). Try updating your browser or enabling hardware acceleration. The other Arcade Atlas games all work without it!</p>',
      buttons: [{ label: "Back to Games", cls: "", onClick: function () { location.href = "../games.html"; }, focus: true }]
    });
  }

  window.__DP = { get state() { return S; }, get save() { return save; }, get gl() { return !!gl; }, qa: qa };
})();
