/* ============================================================
   Atlas-8 — a tiny fictional 8-bit console, fully emulated
   in the browser: AV8 CPU, 160x120 16-color VDP with tile
   sprites, keypad, square-wave beeper. Includes a two-pass
   assembler and three original homebrew carts (as source).
   Memory map: ROM $0000-$7FFF · RAM $8000-$9FFF ·
   framebuffer $A000-$AFAF · MMIO $EC00-$ECFF.
   ============================================================ */
(function () {
  "use strict";

  var PALETTE = [
    "#0a0c14", "#1c2340", "#2e3d68", "#41589e",
    "#57d98a", "#2e8a56", "#ffb63d", "#c97a1e",
    "#ff5d73", "#a82a3e", "#3ddad7", "#238a8a",
    "#e9edfa", "#9aa7c9", "#9d7bff", "#5a3a9e"
  ];
  var W = 160, H = 120;

  /* ---------------- AV8 CPU ---------------- */
  function CPU() {
    this.a = 0; this.b = 0; this.x = 0;
    this.pc = 0x0200;
    this.z = false; this.c = false;
    this.mem = new Uint8Array(0xEC00); // ROM+RAM+FB; MMIO handled separately
    this.sp = 0x9FFF;
    this.waited = false;
    this.halted = false;
    this.error = null;
    this.beepFreq = 0; this.beepFrames = 0;
    this.rand = 1;
  }
  CPU.prototype.rd = function (addr) {
    addr = addr & 0xFFFF;
    if (addr >= 0xEC00) {
      if (addr === 0xEC00) return this.keypad | 0;
      if (addr === 0xEC20) {
        // xorshift random
        var r = this.rand;
        r ^= r << 1; r &= 0xFF; r ^= r >> 2; r ^= r << 3; r &= 0xFF;
        this.rand = r || 0x2F;
        return this.rand;
      }
      return 0;
    }
    return this.mem[addr];
  };
  CPU.prototype.wr = function (addr, v) {
    addr = addr & 0xFFFF;
    v = v & 0xFF;
    if (addr >= 0xEC00) {
      var fb = 0xA000;
      switch (addr) {
        case 0xEC30: this.mem.fill(0, fb, fb + W * H); break;                 // clear screen
        case 0xEC31: this.fg = v & 15; break;                                  // set draw color
        case 0xEC32: this.plot(this.b & 0xFF, this.x & 0xFF, this.fg); break;  // plot pixel (B=x, X=y)
        case 0xEC33: this.tile(this.b & 0xFF, this.x & 0xFF, this.a & 0xFF, this.fg); break; // 8x8 tile
        case 0xEC40: this.beepFreq = (v & 0xFF) * 10; break;                   // freq (10 Hz units)
        case 0xEC41: this.beepFrames = v & 0xFF; break;                        // duration in frames
      }
      return;
    }
    if (addr >= 0xA000 && addr < 0xEC00) { this.mem[addr] = v & 15; return; } // framebuffer is 4bpp-nibbles-as-bytes
    this.mem[addr] = v;
  };
  CPU.prototype.plot = function (x, y, c) {
    if (x >= W || y >= H) return;
    this.mem[0xA000 + y * W + x] = c & 15;
  };
  CPU.prototype.tile = function (x, y, id, fg) {
    var base = 0x7F00 + id * 8;
    for (var r = 0; r < 8; r++) {
      var bits = this.mem[(base + r) & 0xFFFF];
      for (var cIdx = 0; cIdx < 8; cIdx++) {
        if (bits & (0x80 >> cIdx)) this.plot(x + cIdx, y + r, fg);
      }
    }
  };
  CPU.prototype.step = function () {
    if (this.halted || this.error) return;
    var op = this.rd(this.pc);
    var imm, addr, t;
    this.pc = (this.pc + 1) & 0xFFFF;
    switch (op) {
      case 0x00: break; // nop
      case 0x01: this.a = this.rd(this.pc); this.pc++; this.z = this.a === 0; break;
      case 0x02: addr = this.rd16(this.pc); this.pc += 2; this.a = this.rd(addr); this.z = this.a === 0; break;
      case 0x04: addr = this.rd16(this.pc); this.pc += 2; this.wr(addr, this.a); break;
      case 0x05: this.b = this.rd(this.pc); this.pc++; break;
      case 0x06: addr = this.rd16(this.pc); this.pc += 2; this.wr(addr, this.b); break;
      case 0x07: t = this.a + this.rd(this.pc); this.pc++; this.c = t > 0xFF; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x08: t = this.a + this.rd(this.pc) + (this.c ? 1 : 0); this.pc++; this.c = t > 0xFF; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x09: t = this.a - this.rd(this.pc); this.pc++; this.c = t < 0; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x0A: this.a &= this.rd(this.pc); this.pc++; this.z = this.a === 0; break;
      case 0x0B: this.a |= this.rd(this.pc); this.pc++; this.z = this.a === 0; break;
      case 0x0C: this.a ^= this.rd(this.pc); this.pc++; this.z = this.a === 0; break;
      case 0x0D: this.a = (this.a + 1) & 0xFF; this.z = this.a === 0; break;
      case 0x0E: this.a = (this.a - 1) & 0xFF; this.z = this.a === 0; break;
      case 0x0F: t = (this.a - this.rd(this.pc)) & 0x1FF; this.pc++; this.c = t > 0xFF; this.z = (t & 0xFF) === 0; break;
      case 0x10: this.x = this.rd(this.pc); this.pc++; break;
      case 0x11: this.a = this.rd((this.x + this.rd(this.pc)) & 0xFFFF); this.pc++; this.z = this.a === 0; break;
      case 0x12: this.wr((this.x + this.rd(this.pc)) & 0xFFFF, this.a); this.pc++; break;
      case 0x13: this.x = (this.x + 1) & 0xFF; this.z = this.x === 0; break;
      case 0x14: this.x = (this.x - 1) & 0xFF; this.z = this.x === 0; break;
      case 0x15: this.pc = this.rd16(this.pc); break;
      case 0x16: addr = this.rd16(this.pc); if (this.z) this.pc = addr; else this.pc += 2; break;
      case 0x17: addr = this.rd16(this.pc); if (!this.z) this.pc = addr; else this.pc += 2; break;
      case 0x18: addr = this.rd16(this.pc); if (this.c) this.pc = addr; else this.pc += 2; break;
      case 0x19: addr = this.rd16(this.pc); if (!this.c) this.pc = addr; else this.pc += 2; break;
      case 0x20: // jsr
        addr = this.rd16(this.pc);
        this.pc += 2;
        this.mem[this.sp] = (this.pc >> 8) & 0xFF; this.sp--;
        this.mem[this.sp] = this.pc & 0xFF; this.sp--;
        this.pc = addr;
        break;
      case 0x21: // rts
        this.sp++; var lo = this.mem[this.sp];
        this.sp++; var hi = this.mem[this.sp];
        this.pc = (hi << 8) | lo;
        break;
      case 0x22: // lxm addr16 — X = memory
        addr = this.rd16(this.pc); this.pc += 2; this.x = this.rd(addr); this.z = this.x === 0; break;
      case 0x23: // lbm addr16 — B = memory
        addr = this.rd16(this.pc); this.pc += 2; this.b = this.rd(addr); break;
      case 0x24: // add mem — A += memory
        addr = this.rd16(this.pc); this.pc += 2; t = this.a + this.rd(addr); this.c = t > 0xFF; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x25: // sub mem — A -= memory
        addr = this.rd16(this.pc); this.pc += 2; t = this.a - this.rd(addr); this.c = t < 0; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x26: // cmp mem
        addr = this.rd16(this.pc); this.pc += 2; t = (this.a - this.rd(addr)) & 0x1FF; this.c = t > 0xFF; this.z = (t & 0xFF) === 0; break;
      case 0x27: // ora mem
        addr = this.rd16(this.pc); this.pc += 2; this.a |= this.rd(addr); this.z = this.a === 0; break;
      case 0x28: // xor mem
        addr = this.rd16(this.pc); this.pc += 2; this.a ^= this.rd(addr); this.z = this.a === 0; break;
      case 0x29: // and mem
        addr = this.rd16(this.pc); this.pc += 2; this.a &= this.rd(addr); this.z = this.a === 0; break;
      case 0x2A: // adc mem
        addr = this.rd16(this.pc); this.pc += 2; t = this.a + this.rd(addr) + (this.c ? 1 : 0); this.c = t > 0xFF; this.a = t & 0xFF; this.z = this.a === 0; break;
      case 0x40: this.waited = true; break; // wai — one frame
      case 0xFF: this.halted = true; break;
      default:
        this.error = "Bad opcode $" + op.toString(16).toUpperCase() + " at $" + ((this.pc - 1) & 0xFFFF).toString(16).toUpperCase();
        this.halted = true;
    }
  };
  CPU.prototype.rd16 = function (addr) {
    return (this.rd(addr + 1) << 8) | this.rd(addr);
  };
  CPU.prototype.frame = function (maxCycles) {
    this.waited = false;
    var n = 0;
    while (!this.waited && !this.halted && !this.error && n < (maxCycles || 60000)) {
      this.step();
      n++;
    }
    if (this.beepFrames > 0) this.beepFrames--;
  };

  /* ---------------- assembler ---------------- */
  // Syntax: "label:", "lda #$12 | lda #12 | lda $A000 | lda label",
  // "db 1,$2,'txt'", "org $0200", instructions lowercase, ";" comments.
  var OPS = {
    nop: [0x00, 0], lda: [0x01, 1], sta: [0x04, 2], ldb: [0x05, 1], stb: [0x06, 2],
    add: [0x07, 1], adc: [0x08, 1], sub: [0x09, 1], and: [0x0A, 1], ora: [0x0B, 1],
    xor: [0x0C, 1], inc: [0x0D, 0], dec: [0x0E, 0], cmp: [0x0F, 1],
    ldx: [0x10, 1], lax: [0x11, 1], stx: [0x12, 1], inx: [0x13, 0], dex: [0x14, 0],
    jmp: [0x15, 2], jz: [0x16, 2], jnz: [0x17, 2], jc: [0x18, 2], jnc: [0x19, 2],
    jsr: [0x20, 2], rts: [0x21, 0], wai: [0x40, 0], hlt: [0xFF, 0]
  };
  var IMM_ALT = {
    lda: [0x01, 0x02], ldb: [0x05, 0x23], ldx: [0x10, 0x22],
    add: [0x07, 0x24], adc: [0x08, 0x2A], sub: [0x09, 0x25],
    cmp: [0x0F, 0x26], and: [0x0A, 0x29], ora: [0x0B, 0x27], xor: [0x0C, 0x28]
  };
  // immAlt: [immediateOpcode, memoryLoadOpcode] — memory form takes addr16.
  function parseOperand(rest) {
    rest = (rest || "").trim();
    if (rest[0] === "#") return { imm: true, val: evalExpr(rest.slice(1), LABELS) };
    return { imm: false, val: evalExpr(rest, LABELS) };
  }
  var LABELS = {};
  function parseLine(item) {
    var s = item.text;
    var m;
    var ln = item.ln;
    if ((m = s.match(/^org\s+(\S+)$/))) {
      var tok = m[1];
      var v = tok[0] === "$" ? parseInt(tok.slice(1), 16) : parseInt(tok, 10);
      if (isNaN(v)) v = 0x0200;
      return { kind: "org", v: v };
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*:$/.test(s)) return { kind: "label", name: s.slice(0, -1) };
    var parts = s.split(/\s+/);
    var op = parts[0].toLowerCase();
    var rest = s.slice(parts[0].length).trim();
    if (op === "db") return { kind: "db", bytes: parseBytes(rest, LABELS) };
    if (!OPS[op]) return { kind: "bad", op: op };
    var isImmOp = IMM_ALT.hasOwnProperty(op);
    var oper = parseOperand(rest);
    if (isImmOp) {
      return { kind: "insn", op: op, opcode: oper.imm ? IMM_ALT[op][0] : IMM_ALT[op][1],
               size: oper.imm ? 2 : 3, oper: oper };
    }
    return { kind: "insn", op: op, opcode: OPS[op][0], size: 1 + OPS[op][1], oper: oper };
  }
  function assemble(srcText) {
    var lines = srcText.split("\n");
    var clean = [];
    var errors = [];
    lines.forEach(function (raw, ln) {
      var s = raw;
      var q = s.indexOf(";");
      if (q >= 0) s = s.slice(0, q);
      s = s.trim();
      if (s) clean.push({ text: s, ln: ln + 1 });
    });
    LABELS = {};
    var parsed = clean.map(parseLine);
    var addr = 0x0200;
    parsed.forEach(function (p) {
      if (p.kind === "org") { addr = p.v; p.addr = addr; return; }
      if (p.kind === "label") { LABELS[p.name] = addr; return; }
      if (p.kind === "db") { p.addr = addr; addr += p.bytes.val.length; return; }
      if (p.kind === "bad") { errors.push("line " + p.ln + ": unknown instruction '" + p.op + "'"); p.addr = addr; addr += 1; return; }
      p.addr = addr;
      addr += p.size;
    });
    // resolve labels after pass 1
    parsed = clean.map(parseLine);
    var addr2 = 0x0200;
    LABELS = {};
    parsed.forEach(function (p) {
      if (p.kind === "org") { addr2 = p.v; p.addr = addr2; return; }
      if (p.kind === "label") { LABELS[p.name] = addr2; return; }
      if (p.kind === "db") { p.addr = addr2; addr2 += p.bytes.val.length; return; }
      if (p.kind === "bad") { p.addr = addr2; addr2 += 1; return; }
      p.addr = addr2;
      addr2 += p.size;
    });
    var rom = new Uint8Array(0x8000);
    parsed.forEach(function (p) {
      if (p.kind === "org" || p.kind === "label") return;
      if (p.kind === "bad") { errors.push("line " + p.ln + ": unknown instruction '" + p.op + "'"); return; }
      if (p.kind === "db") {
        p.bytes.val.forEach(function (b, i) { if (p.addr + i < 0x8000) rom[p.addr + i] = b; });
        return;
      }
      var a = p.addr;
      if (a >= 0x8000) return;
      rom[a] = p.opcode;
      if (p.size === 2) rom[a + 1] = p.oper.val & 0xFF;
      else if (p.size === 3) {
        rom[a + 1] = p.oper.val & 0xFF;
        rom[a + 2] = (p.oper.val >> 8) & 0xFF;
      }
    });
    return { rom: rom, errors: errors };
  }
  function evalExpr(s, labels) {
    s = (s || "").trim();
    if (!s) return 0;
    if (/^\$[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(1), 16);
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    if (/^-?[0-9]+$/.test(s)) return parseInt(s, 10) & 0xFF;
    if (/^-\$[0-9a-fA-F]+$/.test(s)) return (256 - parseInt(s.slice(2), 16)) & 0xFF;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
      if (labels[s] === undefined) return 0;
      return labels[s];
    }
    return 0;
  }
  function parseBytes(rest, labels) {
    var out = [];
    var i = 0;
    rest = rest || "";
    while (i < rest.length) {
      var ch = rest[i];
      if (ch === ",") { i++; continue; }
      if (ch === "'") {
        var j = rest.indexOf("'", i + 1);
        if (j < 0) return { err: "unterminated string", val: out };
        for (var k = i + 1; k < j; k++) out.push(rest.charCodeAt(k) & 0xFF);
        i = j + 1;
        continue;
      }
      var m = rest.slice(i).match(/^\$[0-9a-fA-F]+|^-\$[0-9a-fA-F]+|^-?[0-9]+|^[A-Za-z_][A-Za-z0-9_]*/);
      if (!m) { i++; continue; }
      out.push(evalExpr(m[0], labels) & 0xFF);
      i += m[0].length;
    }
    return { val: out };
  }

  /* ---------------- homebrew carts ---------------- */
  var CARTS = {};

  CARTS.pipfall = {
    name: "PipFall",
    by: "Gale Post Softworks",
    desc: "Dodge the falling gloom, catch the embers. Three lives, endless night.",
    keys: "\u2190/\u2192 move \u00b7 Start restarts",
    src: [
      "; PipFall \u2014 dodge gloom, catch embers",
      "org $0200",
      "  lda #0",
      "  sta $8001        ; score",
      "  lda #3",
      "  sta $8009        ; lives",
      "  lda #78",
      "  sta $8000        ; player x",
      "  lda #0",
      "  sta $800a        ; objects spawned flag",
      "main:",
      "  lda $800a",
      "  jnz haveobjs",
      "  jsr spawn",
      "  lda #1",
      "  sta $800a",
      "haveobjs:",
      "  jsr controls",
      "  jsr updateobjs",
      "  jsr draw",
      "  wai",
      "  jmp main",
      "",
      "controls:",
      "  lda $EC00",
      "  and #1",
      "  jnz goleft",
      "  lda $EC00",
      "  and #2",
      "  jnz goright",
      "  rts",
      "goleft:",
      "  lda $8000",
      "  sub #2",
      "  cmp #8",
      "  jnc storex       ; >=8 keep",
      "  lda #8",
      "storex:",
      "  sta $8000",
      "  rts",
      "goright:",
      "  lda $8000",
      "  add #2",
      "  cmp #144",
      "  jc storex2       ; <144 keep",
      "  lda #144",
      "storex2:",
      "  sta $8000",
      "  rts",
      "",
      "spawn:",
      "  lda $EC20",
      "  and #127",
      "  add #8",
      "  sta $8002        ; gloom x",
      "  lda #8",
      "  sta $8003        ; gloom y",
      "  lda $EC20",
      "  and #127",
      "  add #8",
      "  sta $8004        ; ember x",
      "  lda #20",
      "  sta $8005        ; ember y",
      "  rts",
      "",
      "updateobjs:",
      "  lda $8003",
      "  add #2",
      "  sta $8003",
      "  cmp #112",
      "  jc gloomok       ; y<112 keep falling",
      "  jsr spawn        ; passed the bottom: new pair",
      "  rts",
      "gloomok:",
      "  lda $8003",
      "  cmp #100",
      "  jc nohit         ; above the strike zone",
      "  lda $8002",
      "  sub $8000",
      "  cmp #248",
      "  jnc nohit        ; wrapped: far to the left",
      "  cmp #8",
      "  jnc nohit        ; far to the right",
      "  jsr losehit",
      "nohit:",
      "  lda $8005",
      "  add #1",
      "  sta $8005",
      "  cmp #112",
      "  jc emberok",
      "  jsr spawn",
      "  rts",
      "emberok:",
      "  lda $8005",
      "  cmp #98",
      "  jc nocatch       ; still high up",
      "  lda $8004",
      "  sub $8000",
      "  cmp #248",
      "  jnc nocatch",
      "  cmp #8",
      "  jnc nocatch",
      "  lda $8001",
      "  add #1",
      "  sta $8001",
      "  jsr spawn",
      "nocatch:",
      "  rts",
      "",
      "losehit:",
      "  lda #240",
      "  sta $EC40",
      "  lda #10",
      "  sta $EC41",
      "  lda $8009",
      "  sub #1",
      "  sta $8009",
      "  jnz hitok",
      "  jsr gameover",
      "hitok:",
      "  jsr spawn",
      "  rts",
      "",
      "gameover:",
      "  lda $EC30",
      "  lda #12",
      "  sta $EC31",
      "  lda #0",
      "  ldb #56",
      "  ldx #46",
      "  sta $EC33        ; G",
      "  lda #1",
      "  ldb #64",
      "  sta $EC33        ; A",
      "  lda #2",
      "  ldb #72",
      "  sta $EC33        ; M",
      "  lda #3",
      "  ldb #80",
      "  sta $EC33        ; E",
      "  lda #13",
      "  ldb #56",
      "  ldx #62",
      "  sta $EC33        ; O",
      "  lda #14",
      "  ldb #64",
      "  sta $EC33        ; V",
      "  lda #3",
      "  ldb #72",
      "  sta $EC33        ; E",
      "  lda #15",
      "  ldb #80",
      "  sta $EC33        ; R",
      "waitgo:",
      "  wai",
      "  lda $EC00",
      "  and #64",
      "  jz waitgo",
      "  lda #0",
      "  sta $8001",
      "  lda #3",
      "  sta $8009",
      "  lda #0",
      "  sta $800a",
      "  rts",
      "",
      "draw:",
      "  lda $EC30",
      "  lda #2",
      "  sta $EC31",
      "  lda #16",
      "  ldb #0",
      "  ldx #106",
      "  sta $EC33        ; ground strip",
      "  jsr drawscore",
      "  jsr drawlives",
      "  lda #12",
      "  sta $EC31",
      "  ldb $8000",
      "  lda #96",
      "  sta $8015",
      "  ldx $8015",
      "  lda #4",
      "  sta $EC33        ; player",
      "  lda #15",
      "  sta $EC31",
      "  ldb $8002",
      "  lda $8003",
      "  sta $8016",
      "  ldx $8016",
      "  lda #5",
      "  sta $EC33        ; gloom",
      "  lda #6",
      "  sta $EC31",
      "  ldb $8004",
      "  lda $8005",
      "  sta $8017",
      "  ldx $8017",
      "  lda #6",
      "  sta $EC33        ; ember",
      "  rts",
      "",
      "drawlives:",
      "  lda #9",
      "  sta $EC31",
      "  lda $8009",
      "  cmp #1",
      "  jc dl1",
      "  lda #9",
      "  ldb #6",
      "  ldx #4",
      "  sta $EC33",
      "dl1:",
      "  lda $8009",
      "  cmp #2",
      "  jc dl2",
      "  lda #9",
      "  ldb #14",
      "  ldx #4",
      "  sta $EC33",
      "dl2:",
      "  lda $8009",
      "  cmp #3",
      "  jc dl3",
      "  lda #9",
      "  ldb #22",
      "  ldx #4",
      "  sta $EC33",
      "dl3:",
      "  rts",
      "",
      "drawscore:",
      "  lda $8001",
      "  sta $8012",
      "  lda #0",
      "  sta $8013",
      "tensp:",
      "  lda $8012",
      "  cmp #10",
      "  jc tenspd",
      "  lda $8012",
      "  sub #10",
      "  sta $8012",
      "  lda $8013",
      "  add #1",
      "  sta $8013",
      "  jmp tensp",
      "tenspd:",
      "  lda $8013",
      "  add #20",
      "  sta $8014",
      "  lda #12",
      "  sta $EC31",
      "  ldb #140",
      "  ldx #4",
      "  lda $8014",
      "  sta $EC33",
      "  lda $8012",
      "  add #20",
      "  sta $8014",
      "  ldb #148",
      "  lda $8014",
      "  sta $EC33",
      "  rts",
      "",
      "org $7F00",
      "; tiles 0-3: G A M E",
      "db $3c,$66,$c3,$c3,$c3,$ff,$66,$00",
      "db $18,$3c,$66,$66,$7e,$66,$66,$00",
      "db $c6,$ee,$fe,$d6,$c6,$c6,$c6,$00",
      "db $7e,$60,$60,$78,$60,$60,$7e,$00",
      "; tile 4: player bucket",
      "db $00,$00,$18,$3c,$7e,$ff,$ff,$00",
      "; tile 5: gloom spike",
      "db $18,$3c,$7e,$ff,$7e,$3c,$18,$00",
      "; tile 6: ember",
      "db $18,$3c,$7e,$7e,$3c,$18,$08,$00",
      "; tiles 7,8 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tile 9: heart",
      "db $66,$ff,$ff,$ff,$7e,$3c,$18,$00",
      "; tiles 10-12 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tile 13: O, tile 14: V",
      "db $7c,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "db $c6,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "; tile 15: R",
      "db $fc,$66,$66,$7c,$6c,$66,$e6,$00",
      "; tile 16: ground strip",
      "db $ff,$ff,$ff,$ff,$ff,$ff,$ff,$ff",
      "; tiles 17-19 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tiles 20-29: digits 0-9",
      "db $7c,$c6,$ce,$d6,$e6,$c6,$7c,$00",
      "db $18,$38,$18,$18,$18,$18,$7e,$00",
      "db $7c,$c6,$06,$1c,$70,$e0,$fe,$00",
      "db $fe,$0c,$18,$0c,$06,$c6,$7c,$00",
      "db $1c,$3c,$6c,$cc,$fe,$0c,$0e,$00",
      "db $fe,$c0,$fc,$06,$06,$c6,$7c,$00",
      "db $3c,$60,$c0,$fc,$c6,$c6,$7c,$00",
      "db $fe,$06,$0c,$18,$30,$30,$30,$00",
      "db $7c,$c6,$c6,$7c,$c6,$c6,$7c,$00",
      "db $7c,$c6,$c6,$7e,$06,$0c,$78,$00"
    ].join("\n")
  };

  CARTS.coilrush = {
    name: "Coil Rush",
    by: "Gale Post Softworks",
    desc: "A three-lane runner. Slip through the gap in every wall.",
    keys: "\u2190/\u2192 change lane \u00b7 Start restarts",
    src: [
      "; Coil Rush \u2014 3-lane wall runner",
      "org $0200",
      "  lda #1",
      "  sta $8000        ; lane 0..2",
      "  lda #0",
      "  sta $8001        ; score",
      "  lda #0",
      "  sta $8002        ; wall y",
      "  lda #255",
      "  sta $8003        ; wall active (255=off)",
      "  lda #0",
      "  sta $8004        ; frame counter",
      "  lda #0",
      "  sta $8005        ; gap lane",
      "  lda #0",
      "  sta $8006        ; wall lane",
      "loop:",
      "  jsr controls",
      "  jsr spawnwall",
      "  jsr movewall",
      "  jsr checkhit",
      "  jsr draw",
      "  wai",
      "  jmp loop",
      "",
      "controls:",
      "  lda $EC00",
      "  and #1",
      "  jnz laneL",
      "  lda $EC00",
      "  and #2",
      "  jnz laneR",
      "  rts",
      "laneL:",
      "  lda $8000",
      "  cmp #0",
      "  jz lanlok        ; already leftmost",
      "  lda $8000",
      "  sub #1",
      "  sta $8000",
      "lanlok:",
      "  rts",
      "laneR:",
      "  lda $8000",
      "  cmp #2",
      "  jnc lanrok       ; already rightmost",
      "  lda $8000",
      "  add #1",
      "  sta $8000",
      "lanrok:",
      "  rts",
      "",
      "spawnwall:",
      "  lda $8003",
      "  cmp #255",
      "  jnc spbusy       ; a wall is already on screen",
      "  lda $8004",
      "  and #31",
      "  jnz sptick       ; only every 32 frames",
      "  lda $EC20",
      "  and #3",
      "  cmp #3",
      "  jc gapok",
      "  lda #0",
      "gapok:",
      "  sta $8005        ; gap lane",
      "  lda $EC20",
      "  and #3",
      "  cmp #3",
      "  jc wallok",
      "  lda #0",
      "wallok:",
      "  cmp $8005",
      "  jnz walsel",
      "  add #1           ; wall lane must differ from gap",
      "  cmp #3",
      "  jc walsel",
      "  lda #0",
      "walsel:",
      "  sta $8006",
      "  lda #6",
      "  sta $8002        ; wall starts near the top",
      "  lda #0",
      "  sta $8003        ; active",
      "sptick:",
      "  lda $8004",
      "  add #1",
      "  sta $8004",
      "spbusy:",
      "  rts",
      "",
      "movewall:",
      "  lda $8003",
      "  cmp #255",
      "  jc mwdone",
      "  lda $8002",
      "  add #2",
      "  sta $8002",
      "  cmp #126",
      "  jc mwdone",
      "  lda #255",
      "  sta $8003        ; passed the bottom",
      "  lda $8001",
      "  add #1",
      "  sta $8001",
      "mwdone:",
      "  rts",
      "",
      "checkhit:",
      "  lda $8003",
      "  cmp #255",
      "  jz chdone       ; no wall on screen",
      "  lda $8002",
      "  cmp #88",
      "  jc chdone       ; wall still above the player",
      "  cmp #104",
      "  jnc chdone      ; wall already below the player",
      "  lda $8000",
      "  cmp $8005",
      "  jz chdone       ; player in the gap lane: safe",
      "  jmp crash",
      "chdone:",
      "  rts",
      "crash:",
      "  lda #180",
      "  sta $EC40",
      "  lda #12",
      "  sta $EC41",
      "  lda $EC30",
      "  lda #12",
      "  sta $EC31",
      "  lda #0",
      "  ldb #56",
      "  ldx #46",
      "  sta $EC33",
      "  lda #1",
      "  ldb #64",
      "  sta $EC33",
      "  lda #2",
      "  ldb #72",
      "  sta $EC33",
      "  lda #3",
      "  ldb #80",
      "  sta $EC33",
      "  lda #13",
      "  ldb #56",
      "  ldx #62",
      "  sta $EC33",
      "  lda #14",
      "  ldb #64",
      "  sta $EC33",
      "  lda #3",
      "  ldb #72",
      "  sta $EC33",
      "  lda #15",
      "  ldb #80",
      "  sta $EC33",
      "waitgo2:",
      "  wai",
      "  lda $EC00",
      "  and #64",
      "  jz waitgo2",
      "  lda #1",
      "  sta $8000",
      "  lda #0",
      "  sta $8001",
      "  lda #255",
      "  sta $8003",
      "  rts",
      "",
      "draw:",
      "  lda $EC30",
      "  jsr drawdivs",
      "  jsr drawscore",
      "  ; player",
      "  lda $8000",
      "  sta $8010",
      "  jsr lanex",
      "  lda #12",
      "  sta $EC31",
      "  lda #96",
      "  sta $8011",
      "  ldb $8012",
      "  ldx $8011",
      "  lda #4",
      "  sta $EC33",
      "  ; wall (all lanes except the gap)",
      "  lda $8003",
      "  cmp #255",
      "  jc drawdone",
      "  lda #0",
      "  sta $8015",
      "wloop:",
      "  lda $8015",
      "  cmp $8005",
      "  jz wskip",
      "  lda $8015",
      "  sta $8010",
      "  jsr lanex",
      "  lda #15",
      "  sta $EC31",
      "  lda $8002",
      "  sta $8013",
      "  ldb $8012",
      "  ldx $8013",
      "  lda #5",
      "  sta $EC33",
      "wskip:",
      "  lda $8015",
      "  add #1",
      "  sta $8015",
      "  cmp #3",
      "  jc wloop",
      "drawdone:",
      "  rts",
      "",
      "lanex:",
      "  ; in: A=lane \u00b7 out: $8012 = 8 + lane*48",
      "  sta $8014",
      "  lda #0",
      "  sta $8012",
      "lxloop:",
      "  lda $8012",
      "  add #48",
      "  sta $8012",
      "  lda $8014",
      "  sub #1",
      "  sta $8014",
      "  jnz lxloop",
      "  lda $8012",
      "  add #8",
      "  sta $8012",
      "  rts",
      "",
      "drawdivs:",
      "  lda #2",
      "  sta $EC31",
      "  lda #16",
      "  ldb #40",
      "  ldx #8",
      "  sta $EC33",
      "  ldx #48",
      "  lda #16",
      "  sta $EC33",
      "  ldx #88",
      "  sta $EC33",
      "  ldx #48",
      "  lda #16",
      "  sta $EC33",
      "  rts",
      "",
      "drawscore:",
      "  lda $8001",
      "  sta $8016",
      "  lda #0",
      "  sta $8017",
      "tensc:",
      "  lda $8016",
      "  cmp #10",
      "  jc tenscd",
      "  lda $8016",
      "  sub #10",
      "  sta $8016",
      "  lda $8017",
      "  add #1",
      "  sta $8017",
      "  jmp tensc",
      "tenscd:",
      "  lda #12",
      "  sta $EC31",
      "  lda $8017",
      "  add #20",
      "  sta $8018",
      "  ldb #140",
      "  ldx #4",
      "  lda $8018",
      "  sta $EC33",
      "  lda $8016",
      "  add #20",
      "  sta $8018",
      "  ldb #148",
      "  lda $8018",
      "  sta $EC33",
      "  rts",
      "",
      "org $7F00",
      "; tiles 0-3: G A M E",
      "db $3c,$66,$c3,$c3,$c3,$ff,$66,$00",
      "db $18,$3c,$66,$66,$7e,$66,$66,$00",
      "db $c6,$ee,$fe,$d6,$c6,$c6,$c6,$00",
      "db $7e,$60,$60,$78,$60,$60,$7e,$00",
      "; tile 4: runner",
      "db $18,$3c,$5a,$3c,$18,$3c,$00,$00",
      "; tile 5: wall block",
      "db $ff,$81,$bd,$81,$bd,$81,$ff,$00",
      "; tiles 6-12 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tile 13: O, 14: V",
      "db $7c,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "db $c6,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "; tile 15: R",
      "db $fc,$66,$66,$7c,$6c,$66,$e6,$00",
      "; tile 16: divider dash",
      "db $80,$80,$80,$80,$80,$80,$80,$80",
      "; tiles 17-19 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tiles 20-29: digits",
      "db $7c,$c6,$ce,$d6,$e6,$c6,$7c,$00",
      "db $18,$38,$18,$18,$18,$18,$7e,$00",
      "db $7c,$c6,$06,$1c,$70,$e0,$fe,$00",
      "db $fe,$0c,$18,$0c,$06,$c6,$7c,$00",
      "db $1c,$3c,$6c,$cc,$fe,$0c,$0e,$00",
      "db $fe,$c0,$fc,$06,$06,$c6,$7c,$00",
      "db $3c,$60,$c0,$fc,$c6,$c6,$7c,$00",
      "db $fe,$06,$0c,$18,$30,$30,$30,$00",
      "db $7c,$c6,$c6,$7c,$c6,$c6,$7c,$00",
      "db $7c,$c6,$c6,$7e,$06,$0c,$78,$00"
    ].join("\n")
  };

  CARTS.hopstead = {
    name: "Hopstead",
    by: "Gale Post Softworks",
    desc: "One button, endless hedge hurdles. Time your hops.",
    keys: "A / Space jump \u00b7 Start restarts",
    src: [
      "; Hopstead \u2014 one-button hop",
      "org $0200",
      "  lda #96",
      "  sta $8000        ; player y (96 = ground)",
      "  lda #0",
      "  sta $8001        ; vy",
      "  lda #0",
      "  sta $8002        ; score",
      "  lda #160",
      "  sta $8003        ; hurdle x",
      "loop:",
      "  jsr controls",
      "  jsr physics",
      "  jsr movehurdle",
      "  jsr checkhit",
      "  jsr draw",
      "  wai",
      "  jmp loop",
      "",
      "controls:",
      "  lda $EC00",
      "  and #16",
      "  jnz tryjump",
      "  lda $EC00",
      "  and #64",
      "  jnz tryjump",
      "  rts",
      "tryjump:",
      "  lda $8000",
      "  cmp #96",
      "  jc tjdone       ; airborne (y<96): no double jump",
      "  lda #214        ; -42 as unsigned byte",
      "  sta $8001",
      "  lda #120",
      "  sta $EC40",
      "  lda #6",
      "  sta $EC41",
      "tjdone:",
      "  rts",
      "",
      "physics:",
      "  lda $8001",
      "  add #3",
      "  sta $8001",
      "  lda $8000",
      "  add $8001",
      "  sta $8000",
      "  cmp #96",
      "  jc phydone      ; still above ground",
      "  lda #96",
      "  sta $8000",
      "  lda #0",
      "  sta $8001",
      "phydone:",
      "  rts",
      "",
      "movehurdle:",
      "  lda $8003",
      "  sub #2",
      "  sta $8003",
      "  cmp #250",
      "  jc mhdone       ; still on screen",
      "  lda #160",
      "  sta $8003       ; respawned: score the hop",
      "  lda $8002",
      "  add #1",
      "  sta $8002",
      "mhdone:",
      "  rts",
      "",
      "checkhit:",
      "  lda $8003",
      "  cmp #36",
      "  jnc chdone      ; hurdle right of the player",
      "  cmp #12",
      "  jc chdone       ; hurdle left of the player",
      "  lda $8000",
      "  cmp #84",
      "  jc chdone       ; player is safely high",
      "  lda #60",
      "  sta $EC40",
      "  lda #14",
      "  sta $EC41",
      "  lda $EC30",
      "  lda #12",
      "  sta $EC31",
      "  lda #0",
      "  ldb #56",
      "  ldx #46",
      "  sta $EC33",
      "  lda #1",
      "  ldb #64",
      "  sta $EC33",
      "  lda #2",
      "  ldb #72",
      "  sta $EC33",
      "  lda #3",
      "  ldb #80",
      "  sta $EC33",
      "  lda #13",
      "  ldb #56",
      "  ldx #62",
      "  sta $EC33",
      "  lda #14",
      "  ldb #64",
      "  sta $EC33",
      "  lda #3",
      "  ldb #72",
      "  sta $EC33",
      "  lda #15",
      "  ldb #80",
      "  sta $EC33",
      "waitgo3:",
      "  wai",
      "  lda $EC00",
      "  and #64",
      "  jz waitgo3",
      "  lda #0",
      "  sta $8002",
      "  lda #160",
      "  sta $8003",
      "chdone:",
      "  rts",
      "",
      "draw:",
      "  lda $EC30",
      "  lda #2",
      "  sta $EC31",
      "  lda #16",
      "  ldb #0",
      "  ldx #104",
      "  sta $EC33        ; ground",
      "  jsr drawscore",
      "  lda #12",
      "  sta $EC31",
      "  lda #20",
      "  sta $8010",
      "  ldb $8010",
      "  lda $8000",
      "  sta $8011",
      "  ldx $8011",
      "  lda #4",
      "  sta $EC33        ; player",
      "  lda #5",
      "  sta $EC31",
      "  lda #88",
      "  sta $8012",
      "  ldb $8003",
      "  ldx $8012",
      "  lda #5",
      "  sta $EC33        ; hurdle",
      "  rts",
      "",
      "drawscore:",
      "  lda $8002",
      "  sta $8013",
      "  lda #0",
      "  sta $8014",
      "tensh:",
      "  lda $8013",
      "  cmp #10",
      "  jc tenshd",
      "  lda $8013",
      "  sub #10",
      "  sta $8013",
      "  lda $8014",
      "  add #1",
      "  sta $8014",
      "  jmp tensh",
      "tenshd:",
      "  lda #12",
      "  sta $EC31",
      "  lda $8014",
      "  add #20",
      "  sta $8015",
      "  ldb #140",
      "  ldx #4",
      "  lda $8015",
      "  sta $EC33",
      "  lda $8013",
      "  add #20",
      "  sta $8015",
      "  ldb #148",
      "  lda $8015",
      "  sta $EC33",
      "  rts",
      "",
      "org $7F00",
      "; tiles 0-3: G A M E",
      "db $3c,$66,$c3,$c3,$c3,$ff,$66,$00",
      "db $18,$3c,$66,$66,$7e,$66,$66,$00",
      "db $c6,$ee,$fe,$d6,$c6,$c6,$c6,$00",
      "db $7e,$60,$60,$78,$60,$60,$7e,$00",
      "; tile 4: hopper",
      "db $18,$3c,$7e,$18,$18,$3c,$00,$00",
      "; tile 5: hurdle",
      "db $81,$bd,$81,$bd,$81,$bd,$81,$00",
      "; tiles 6-12 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tile 13: O, 14: V",
      "db $7c,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "db $c6,$c6,$c6,$c6,$c6,$c6,$7c,$00",
      "; tile 15: R",
      "db $fc,$66,$66,$7c,$6c,$66,$e6,$00",
      "; tile 16: ground strip",
      "db $ff,$ff,$ff,$ff,$ff,$ff,$ff,$ff",
      "; tiles 17-19 spare",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "db $00,$00,$00,$00,$00,$00,$00,$00",
      "; tiles 20-29: digits",
      "db $7c,$c6,$ce,$d6,$e6,$c6,$7c,$00",
      "db $18,$38,$18,$18,$18,$18,$7e,$00",
      "db $7c,$c6,$06,$1c,$70,$e0,$fe,$00",
      "db $fe,$0c,$18,$0c,$06,$c6,$7c,$00",
      "db $1c,$3c,$6c,$cc,$fe,$0c,$0e,$00",
      "db $fe,$c0,$fc,$06,$06,$c6,$7c,$00",
      "db $3c,$60,$c0,$fc,$c6,$c6,$7c,$00",
      "db $fe,$06,$0c,$18,$30,$30,$30,$00",
      "db $7c,$c6,$c6,$7c,$c6,$c6,$7c,$00",
      "db $7c,$c6,$c6,$7e,$06,$0c,$78,$00"
    ].join("\n")
  };

  /* ---------------- console driver ---------------- */
  function makeConsole(canvas, opts) {
    opts = opts || {};
    var cpu = null;
    var img = null;
    var ctx2d = canvas.getContext("2d");
    canvas.width = W;
    canvas.height = H;
    var running = false, raf = null, cart = null;
    var audioCtx = null;

    function ensureAudio() {
      if (audioCtx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    function beep(freq, frames) {
      if (!freq || !frames) return;
      if (opts.muted && opts.muted()) return;
      ensureAudio();
      if (!audioCtx) return;
      if (audioCtx.state === "suspended") audioCtx.resume();
      try {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = "square";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.06, audioCtx.currentTime);
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + frames / 60);
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + frames / 60 + 0.05);
      } catch (e) {}
    }

    function loadCart(c) {
      cart = c;
      var res = assemble(c.src);
      if (res.errors.length) {
        console.error("Cart assemble errors:", res.errors);
        if (opts.onError) opts.onError("Cart failed to assemble: " + res.errors[0]);
        return false;
      }
      cpu = new CPU();
      cpu.mem.set(res.rom.subarray(0, 0x8000), 0);
      cpu.fg = 13;
      img = ctx2d.createImageData(W, H);
      running = true;
      if (opts.onStart) opts.onStart(c);
      return true;
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }
    function reset() {
      if (cart) loadCart(cart);
    }
    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!cpu) return;
      var before = cpu.beepFrames;
      cpu.frame(60000);
      if (cpu.error) {
        running = false;
        if (opts.onError) opts.onError(cpu.error);
        return;
      }
      if (cpu.beepFrames > 0 && before === 0) beep(cpu.beepFreq, cpu.beepFrames);
      // blit
      var d = img.data;
      var fb = cpu.mem;
      for (var i = 0, n = W * H; i < n; i++) {
        var col = PALETTE[fb[0xA000 + i] & 15];
        d[i * 4] = parseInt(col.slice(1, 3), 16);
        d[i * 4 + 1] = parseInt(col.slice(3, 5), 16);
        d[i * 4 + 2] = parseInt(col.slice(5, 7), 16);
        d[i * 4 + 3] = 255;
      }
      ctx2d.putImageData(img, 0, 0);
      if (opts.onFrame) opts.onFrame(cpu);
    }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    return {
      load: function (c) { var ok = loadCart(c); if (ok) startLoop(); return ok; },
      reset: reset, stop: stop,
      keypad: function (bits) { if (cpu) cpu.keypad = bits; },
      isRunning: function () { return running; },
      cpu: function () { return cpu; }
    };
  }

  window.Atlas8 = {
    CARTS: CARTS,
    PALETTE: PALETTE,
    assemble: assemble,
    CPU: CPU,
    makeConsole: makeConsole
  };
})();
