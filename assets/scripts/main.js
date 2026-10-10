/* ==========================================================================
   brettwilsondev.com
   - background: firmware and embedded diagrams drawn in 3D (ring buffer, MCU,
     scheduler, buses, memory, boot, watchdog, OTA...), shuffled per visit and
     cycled every ~20 s,
     rendered on a plain 2D canvas with no libraries
   ========================================================================== */

(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------------
     Drawing helpers shared by every scene. `P` projects a world point to the
     screen; it is rebuilt each frame from the camera.
     ------------------------------------------------------------------------ */

  let ctx = null;
  let P = null;

  const orange = (a) => `rgba(255, 92, 43, ${a})`;
  const white = (a) => `rgba(255, 255, 255, ${a})`;
  const ember = (a) => `rgba(204, 51, 0, ${a})`;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = (cur, target, dt, speed = 5) => cur + (target - cur) * Math.min(1, dt * speed);

  function seg(a, b) {
    const p = P(a[0], a[1], a[2]);
    const q = P(b[0], b[1], b[2]);
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
  }

  function poly(points) {
    points.forEach((pt, k) => {
      const p = P(pt[0], pt[1], pt[2]);
      if (k) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
    });
    ctx.closePath();
  }

  function stroke(color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function fill(color) {
    ctx.fillStyle = color;
    ctx.fill();
  }

  // a wireframe box, optionally with a filled top face
  function box(x0, y0, z0, x1, y1, z1, line, top) {
    if (top) {
      ctx.beginPath();
      poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
      fill(top);
    }
    ctx.beginPath();
    poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) seg([x, y0, z], [x, y1, z]);
    stroke(line);
  }

  function text(str, x, y, z, color, size = 11, align = "center") {
    const p = P(x, y, z);
    ctx.font = `${size}px 'JetBrains Mono', Consolas, monospace`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, p[0], p[1]);
  }

  function arrow(from, to, color) {
    ctx.beginPath();
    seg(from, to);
    const p = P(to[0], to[1], to[2]);
    const q = P(from[0], from[1], from[2]);
    const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
    for (const s of [-1, 1]) {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] - Math.cos(ang + s * 0.5) * 8, p[1] - Math.sin(ang + s * 0.5) * 8);
    }
    stroke(color);
  }

  /* ------------------------------------------------------------------------
     Scene: ring buffer. A producer writes bytes in bursts at the head,
     a consumer drains them at a steady rate from the tail.
     ------------------------------------------------------------------------ */

  const ringScene = {
    caption: "ring buffer",
    pitch: -0.62,
    yaw: 0,
    SLOTS: 32,
    MESSAGE: "brettwilsondev.com\r\n",
    RADIUS: 2.6,
    DEPTH: 0.32,

    init() {
      this.slots = Array.from({ length: this.SLOTS }, () => ({ v: 0, full: false, h: 0.1, flash: 0 }));
      this.head = this.tail = this.count = this.msg = this.burst = 0;
      this.writeIn = 0.6;
      this.readIn = 1.2;
      this.spin = Math.random() * Math.PI * 2;
      for (let k = 0; k < 12; k++) this.write();
      for (let k = 0; k < 3; k++) this.read();
      for (const s of this.slots) {
        s.flash = 0;
        s.h = this.height(s);
      }
    },

    height(s) {
      return s.full ? 0.3 + (s.v / 255) * 0.9 : 0.1;
    },

    write() {
      if (this.count >= this.SLOTS - 1) return; // full: the producer has to wait
      const s = this.slots[this.head];
      s.v = this.MESSAGE.charCodeAt(this.msg);
      s.full = true;
      s.flash = 1;
      this.msg = (this.msg + 1) % this.MESSAGE.length;
      this.head = (this.head + 1) % this.SLOTS;
      this.count++;
    },

    read() {
      if (this.count === 0) return;
      const s = this.slots[this.tail];
      s.full = false;
      s.flash = 0.6;
      this.tail = (this.tail + 1) % this.SLOTS;
      this.count--;
    },

    step(dt) {
      this.spin += dt * 0.06;
      // producer: short bursts of bytes with pauses between them
      this.writeIn -= dt;
      if (this.writeIn <= 0) {
        if (this.burst <= 0) this.burst = 2 + Math.floor(Math.random() * 7);
        this.write();
        this.burst--;
        this.writeIn = this.burst > 0 ? 0.12 : rand(1, 3.2);
      }
      // consumer: steady drain
      this.readIn -= dt;
      if (this.readIn <= 0) {
        this.read();
        this.readIn = 0.55;
      }
      for (const s of this.slots) {
        s.h = ease(s.h, this.height(s), dt);
        s.flash = Math.max(0, s.flash - dt * 1.4);
      }
    },

    draw() {
      const R = this.RADIUS, D = this.DEPTH;
      const at = (a, rad, y) => [Math.cos(a) * rad, y - 0.4, Math.sin(a) * rad];
      const angle = (i) => this.spin + (i / this.SLOTS) * Math.PI * 2;
      const half = (Math.PI / this.SLOTS) * 0.78;

      // inner and outer guide circles
      ctx.beginPath();
      for (const rad of [R - D - 0.18, R + D + 0.18]) {
        const pts = [];
        for (let k = 0; k < 96; k++) pts.push(at(this.spin + (k / 96) * Math.PI * 2, rad, 0));
        poly(pts);
      }
      stroke(white(0.06));

      this.slots.forEach((s, i) => {
        const a = angle(i);
        const a0 = a - half, a1 = a + half;
        const corners = (y) => [at(a0, R - D, y), at(a1, R - D, y), at(a1, R + D, y), at(a0, R + D, y)];
        const bottom = corners(0), top = corners(s.h);
        const lit = s.full || s.flash > 0;
        if (lit) {
          ctx.beginPath();
          poly(top);
          fill(ember(0.08 + s.flash * 0.25));
        }
        ctx.beginPath();
        poly(bottom);
        poly(top);
        for (let k = 0; k < 4; k++) seg(bottom[k], top[k]);
        stroke(lit ? orange(Math.min(1, (s.full ? 0.45 : 0.1) + s.flash * 0.5)) : white(0.1));
        if (s.full) {
          const p = at(a, R, s.h + 0.22);
          text(s.v.toString(16).toUpperCase().padStart(2, "0"), p[0], p[1], p[2], white(0.22 + s.flash * 0.5), 10);
        }
      });

      // head and tail pointers, just outside the ring
      const pointer = (index, label, color) => {
        const a = angle(index);
        arrow(at(a, R + D + 0.95, 0), at(a, R + D + 0.3, 0), color);
        const t = at(a, R + D + 1.3, 0);
        text(label, t[0], t[1], t[2], color);
      };
      pointer(this.head, "head", "rgba(255, 140, 90, 0.6)");
      pointer(this.tail, "tail", white(0.4));

      const mid = at(0, 0, -0.05);
      text(`${this.count}/${this.SLOTS}`, mid[0], mid[1], mid[2], white(0.25));
    },
  };

  /* ------------------------------------------------------------------------
     Scene: RTOS scheduler. One shelf per priority; the highest-priority ready
     task runs on the CPU and is preempted when something more urgent wakes.
     ------------------------------------------------------------------------ */

  const schedScene = {
    caption: "rtos scheduler",
    pitch: -0.3,
    yaw: -0.35,
    CPU: [2.0, -0.05, 0],

    shelf(p) {
      return -1.55 + p * 0.78;
    },

    init() {
      const defs = [["idle", 0], ["logger", 1], ["sensor", 2], ["comms", 3], ["uart_isr", 4]];
      this.tasks = defs.map(([name, prio]) => ({
        name,
        prio,
        state: prio === 0 ? "ready" : "blocked",
        wait: rand(0.3, 3),
        burst: 0,
        pos: [prio === 0 ? -0.9 : -2.3, this.shelf(prio), 0],
        glow: 0,
      }));
      this.running = -1;
      this.switches = 0;
    },

    step(dt) {
      const ts = this.tasks;
      for (const t of ts) {
        if (t.state === "blocked") {
          t.wait -= dt;
          if (t.wait <= 0) t.state = "ready";
        }
      }
      if (this.running >= 0) {
        const t = ts[this.running];
        t.burst -= dt;
        if (t.burst <= 0 && t.prio > 0) {
          t.state = "blocked";
          t.wait = rand(1.5, 4.5) * (1 + (4 - t.prio) * 0.35);
          this.running = -1;
        }
      }
      // highest priority ready task wins the CPU
      let best = -1;
      ts.forEach((t, i) => {
        if ((t.state === "ready" || t.state === "running") && (best < 0 || t.prio > ts[best].prio)) best = i;
      });
      if (best !== this.running) {
        if (this.running >= 0) ts[this.running].state = "ready"; // preempted
        this.running = best;
        const t = ts[best];
        t.state = "running";
        if (t.burst <= 0) t.burst = rand(0.5, 1.3) * (t.prio === 4 ? 0.5 : 1);
        this.switches++;
      }
      for (const t of ts) {
        const y = this.shelf(t.prio);
        const target = t.state === "running" ? this.CPU : t.state === "ready" ? [-0.9, y, 0] : [-2.3, y, 0];
        t.pos = t.pos.map((v, k) => ease(v, target[k], dt, 6));
        t.glow = ease(t.glow, t.state === "running" ? 1 : 0, dt, 6);
      }
    },

    draw() {
      // priority shelves
      this.tasks.forEach((t) => {
        const y = this.shelf(t.prio) - 0.22;
        ctx.beginPath();
        poly([[-2.9, y, -0.5], [-0.3, y, -0.5], [-0.3, y, 0.5], [-2.9, y, 0.5]]);
        stroke(white(0.09));
        text(`P${t.prio}`, -3.15, y + 0.1, 0, white(0.3), 11, "right");
      });
      text("blocked", -2.3, -2.15, 0.5, white(0.22), 10);
      text("ready", -0.9, -2.15, 0.5, white(0.22), 10);

      // the CPU
      const [cx, cy, cz] = this.CPU;
      box(cx - 0.75, cy - 0.5, cz - 0.6, cx + 0.75, cy + 0.65, cz + 0.6, white(0.22));
      text("CPU", cx, cy + 0.9, cz, white(0.4), 12);

      for (const t of this.tasks) {
        const [x, y, z] = t.pos;
        const dim = t.state === "blocked";
        box(x - 0.42, y - 0.2, z - 0.28, x + 0.42, y + 0.2, z + 0.28,
          dim ? white(0.14) : orange(0.4 + t.glow * 0.5),
          t.glow > 0.05 ? ember(0.25 * t.glow) : null);
        text(t.name, x, y + 0.36, z, dim ? white(0.25) : white(0.45 + t.glow * 0.4), 10);
      }
      text(`context switches: ${this.switches}`, cx, cy - 0.95, cz, white(0.25), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: call stack. Frames push and pop as functions call and return;
     interrupts stack their handler on top whenever they fire.
     ------------------------------------------------------------------------ */

  const stackScene = {
    caption: "call stack",
    pitch: -0.22,
    yaw: -0.4,
    H: 0.34,
    BASE: -1.9,
    OPS: [
      ["call", "main", 64], ["call", "task_loop", 48],
      ["call", "read_sensor", 32], ["call", "i2c_read", 40], ["ret"], ["ret"],
      ["call", "process", 56], ["call", "filter", 72], ["ret"],
      ["call", "log_write", 32], ["call", "uart_send", 24], ["ret"], ["ret"], ["ret"],
      ["call", "sleep_ms", 16], ["ret"],
    ],
    LOOP: 2, // after the list, run again from read_sensor
    IRQS: [["SysTick_Handler", 32], ["USART1_IRQHandler", 40], ["EXTI0_IRQHandler", 32]],

    init() {
      this.frames = [];
      this.leaving = [];
      this.pc = 0;
      this.wait = 0.4;
      this.irqIn = rand(3, 6);
      this.irqHold = 0;
    },

    push(name, size, irq) {
      const below = this.frames[this.frames.length - 1];
      const addr = (below ? below.addr : 0x20008000) - size;
      const ty = this.BASE + this.frames.length * this.H * 1.12;
      this.frames.push({ name, addr, irq, y: ty + 0.9, ty, a: 0, flash: 1 });
    },

    pop() {
      const f = this.frames.pop();
      if (f) this.leaving.push(f);
    },

    step(dt) {
      if (this.irqHold > 0) {
        this.irqHold -= dt;
        if (this.irqHold <= 0) this.pop(); // return from interrupt
      } else {
        this.irqIn -= dt;
        if (this.irqIn <= 0 && this.frames.length) {
          const [name, size] = this.IRQS[Math.floor(Math.random() * this.IRQS.length)];
          this.push(name, size, true);
          this.irqHold = 0.9;
          this.irqIn = rand(4, 8);
        } else {
          this.wait -= dt;
          if (this.wait <= 0) {
            const op = this.OPS[this.pc];
            if (op[0] === "call") this.push(op[1], op[2], false);
            else this.pop();
            this.pc = this.pc + 1 >= this.OPS.length ? this.LOOP : this.pc + 1;
            this.wait = rand(0.6, 1.1);
          }
        }
      }
      for (const f of this.frames) {
        f.y = ease(f.y, f.ty, dt, 6);
        f.a = ease(f.a, 1, dt, 5);
        f.flash = Math.max(0, f.flash - dt * 1.5);
      }
      for (const f of this.leaving) {
        f.y += dt * 1.2;
        f.a -= dt * 2.5;
      }
      this.leaving = this.leaving.filter((f) => f.a > 0);
    },

    draw() {
      // the stack region outline
      box(-1.2, this.BASE, -0.65, 1.2, this.BASE + 9 * this.H * 1.12, 0.65, white(0.05));

      for (const f of [...this.frames, ...this.leaving]) {
        const a = Math.max(0, f.a);
        const line = f.irq ? orange(Math.min(1, 0.6 + f.flash * 0.4) * a) : orange((0.32 + f.flash * 0.4) * a);
        box(-1.1, f.y, -0.55, 1.1, f.y + this.H, 0.55, line, ember((f.irq ? 0.2 : 0.05 + f.flash * 0.15) * a));
        text(f.name, 0, f.y + this.H * 0.35, 0.55, white((f.irq ? 0.75 : 0.5) * a), 11);
        text("0x" + f.addr.toString(16).toUpperCase(), -1.3, f.y + this.H * 0.35, 0.55, white(0.25 * a), 10, "right");
      }

      // stack pointer at the top frame
      const top = this.frames[this.frames.length - 1];
      if (top) {
        const y = top.y + this.H * 0.5;
        arrow([2.1, y, 0.55], [1.25, y, 0.55], "rgba(255, 140, 90, 0.6)");
        text("SP", 2.3, y - 0.05, 0.55, "rgba(255, 140, 90, 0.6)", 11, "left");
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: state machine. A token travels along each transition and the
     current state lights up.
     ------------------------------------------------------------------------ */

  const fsmScene = {
    caption: "state machine",
    pitch: -0.7,
    yaw: 0,
    STATES: ["IDLE", "INIT", "CONNECT", "RUN", "SLEEP", "ERROR"],
    NEXT: {
      IDLE: [["INIT", 1]],
      INIT: [["CONNECT", 1]],
      CONNECT: [["RUN", 0.8], ["ERROR", 0.2]],
      RUN: [["SLEEP", 0.8], ["ERROR", 0.2]],
      SLEEP: [["RUN", 1]],
      ERROR: [["INIT", 1]],
    },

    init() {
      this.spin = Math.random() * Math.PI * 2;
      this.current = "IDLE";
      this.token = null;
      this.dwell = 1;
      this.glow = Object.fromEntries(this.STATES.map((s) => [s, s === "IDLE" ? 1 : 0]));
    },

    pos(name) {
      const i = this.STATES.indexOf(name);
      const a = this.spin + (i / this.STATES.length) * Math.PI * 2;
      return [Math.cos(a) * 2.4, -0.3, Math.sin(a) * 2.4];
    },

    // raised arc between two states
    curve(from, to, t) {
      const a = this.pos(from), b = this.pos(to);
      const m = [(a[0] + b[0]) * 0.35, 0.9, (a[2] + b[2]) * 0.35];
      const u = 1 - t;
      return [0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * m[k] + t * t * b[k]);
    },

    step(dt) {
      this.spin += dt * 0.05;
      if (this.token) {
        this.token.t += dt / 1.1;
        if (this.token.t >= 1) {
          this.current = this.token.to;
          this.token = null;
          this.dwell = rand(1.2, 2.8);
        }
      } else {
        this.dwell -= dt;
        if (this.dwell <= 0) {
          let r = Math.random();
          let to = this.NEXT[this.current][0][0];
          for (const [name, p] of this.NEXT[this.current]) {
            if ((r -= p) <= 0) {
              to = name;
              break;
            }
          }
          this.token = { from: this.current, to, t: 0 };
        }
      }
      for (const s of this.STATES) this.glow[s] = ease(this.glow[s], s === this.current && !this.token ? 1 : 0, dt, 4);
    },

    draw() {
      // transitions
      for (const [from, outs] of Object.entries(this.NEXT)) {
        for (const [to] of outs) {
          const active = this.token && this.token.from === from && this.token.to === to;
          ctx.beginPath();
          const pts = [];
          for (let k = 0; k <= 20; k++) pts.push(this.curve(from, to, 0.1 + (k / 20) * 0.8));
          pts.forEach((p, k) => (k ? seg(pts[k - 1], p) : null));
          stroke(active ? orange(0.6) : white(0.1));
          const end = pts[pts.length - 1];
          arrow(pts[pts.length - 3], end, active ? orange(0.6) : white(0.12));
        }
      }
      // states
      for (const s of this.STATES) {
        const [x, y, z] = this.pos(s);
        const g = this.glow[s];
        const err = s === "ERROR";
        box(x - 0.55, y - 0.15, z - 0.32, x + 0.55, y + 0.15, z + 0.32,
          g > 0.05 ? orange(0.35 + g * 0.5) : white(err ? 0.2 : 0.16), g > 0.05 ? ember(0.25 * g) : null);
        text(s, x, y + 0.42, z, white(0.35 + g * 0.5), 11);
      }
      // the token on its way
      if (this.token) {
        const [x, y, z] = this.curve(this.token.from, this.token.to, this.token.t);
        box(x - 0.09, y - 0.09, z - 0.09, x + 0.09, y + 0.09, z + 0.09, orange(0.9), ember(0.5));
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: heap allocator. malloc() takes the first run of free blocks that
     fits, free() hands blocks back, and fragmentation builds up over time.
     ------------------------------------------------------------------------ */

  const heapScene = {
    caption: "heap allocator",
    pitch: -0.8,
    yaw: 0.35,
    ROWS: 5,
    COLS: 12,
    W: 0.42,
    D: 0.62,
    BLOCK: 16, // bytes per cell

    init() {
      this.cells = Array.from({ length: this.ROWS }, () => new Array(this.COLS).fill(null));
      this.blocks = [];
      this.allocIn = 0.3;
      this.freeIn = 1.5;
      for (let k = 0; k < 14; k++) this.malloc(true);
    },

    cellX(c) {
      return (c - this.COLS / 2) * this.W;
    },

    rowZ(r) {
      return (r - (this.ROWS - 1) / 2) * this.D;
    },

    malloc(instant) {
      const len = 1 + Math.floor(Math.random() * 4);
      for (let r = 0; r < this.ROWS; r++) {
        let run = 0;
        for (let c = 0; c < this.COLS; c++) {
          run = this.cells[r][c] ? 0 : run + 1;
          if (run === len) {
            const b = { r, c: c - len + 1, len, h: instant ? 0.32 : 0, th: 0.32, a: 1, flash: instant ? 0 : 1, live: true };
            for (let k = b.c; k <= c; k++) this.cells[r][k] = b;
            this.blocks.push(b);
            return true;
          }
        }
      }
      return false;
    },

    free() {
      const live = this.blocks.filter((b) => b.live);
      if (!live.length) return;
      const b = live[Math.floor(Math.random() * live.length)];
      b.live = false;
      b.th = 0;
      for (let k = b.c; k < b.c + b.len; k++) this.cells[b.r][k] = null;
    },

    used() {
      let n = 0;
      for (const row of this.cells) for (const c of row) if (c) n++;
      return n / (this.ROWS * this.COLS);
    },

    step(dt) {
      this.allocIn -= dt;
      if (this.allocIn <= 0) {
        if (!this.malloc(false)) this.free(); // out of contiguous space
        this.allocIn = rand(0.6, 1.4);
      }
      this.freeIn -= dt;
      if (this.freeIn <= 0) {
        if (this.used() > 0.35) this.free();
        this.freeIn = rand(0.8, 1.6);
      }
      for (const b of this.blocks) {
        b.h = ease(b.h, b.th, dt, 6);
        b.flash = Math.max(0, b.flash - dt * 1.3);
        if (!b.live) b.a -= dt * 1.5;
      }
      this.blocks = this.blocks.filter((b) => b.a > 0);
    },

    draw() {
      const { W, D } = this;
      // the memory region, one cell per 16 bytes
      ctx.beginPath();
      for (let r = 0; r < this.ROWS; r++) {
        const z = this.rowZ(r);
        for (let c = 0; c < this.COLS; c++) {
          const x = this.cellX(c);
          poly([[x + 0.03, -0.6, z - D / 2 + 0.05], [x + W - 0.03, -0.6, z - D / 2 + 0.05], [x + W - 0.03, -0.6, z + D / 2 - 0.05], [x + 0.03, -0.6, z + D / 2 - 0.05]]);
        }
        text("0x" + (0x20000000 + r * this.COLS * this.BLOCK).toString(16).toUpperCase(), this.cellX(0) - 0.15, -0.6, z + 0.1, white(0.25), 10, "right");
      }
      stroke(white(0.07));

      for (const b of this.blocks) {
        const x0 = this.cellX(b.c) + 0.04, x1 = this.cellX(b.c + b.len) - 0.04;
        const z = this.rowZ(b.r);
        const a = Math.max(0, b.a);
        box(x0, -0.6, z - D / 2 + 0.07, x1, -0.6 + b.h, z + D / 2 - 0.07,
          orange((0.35 + b.flash * 0.5) * a), ember((0.06 + b.flash * 0.25) * a));
        if (b.h > 0.15) text(`${b.len * this.BLOCK}B`, (x0 + x1) / 2, -0.6 + b.h + 0.12, z, white((0.3 + b.flash * 0.5) * a), 10);
      }
      text(`used ${Math.round(this.used() * 100)}%`, 0, -0.6, this.rowZ(this.ROWS - 1) + 0.9, white(0.3), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: microcontroller. A die with the core, memories, DMA and
     peripherals; packets travel the bus between them.
     ------------------------------------------------------------------------ */

  const mcuScene = {
    caption: "microcontroller",
    pitch: -0.78,
    yaw: 0.3,
    Y: -0.5, // top surface of the die
    BLOCKS: {
      CPU: [-2.9, -1.5, -1.7, -0.5, 0.45],
      FLASH: [-2.9, -1.5, 0.5, 1.7, 0.35],
      SRAM: [-1.1, 0.1, 0.5, 1.7, 0.3],
      DMA: [-1.1, 0.1, -1.7, -0.6, 0.25],
      UART: [0.6, 1.5, -1.6, -0.6, 0.22],
      SPI: [1.8, 2.7, -1.6, -0.6, 0.22],
      I2C: [0.6, 1.5, 0.6, 1.6, 0.22],
      GPIO: [1.8, 2.7, 0.6, 1.6, 0.22],
    },
    // [from, to, weight, is DMA]
    ROUTES: [
      ["FLASH", "CPU", 6, false], ["CPU", "SRAM", 3, false], ["SRAM", "CPU", 3, false],
      ["CPU", "GPIO", 1, false], ["CPU", "SPI", 1, false], ["I2C", "CPU", 1, false],
      ["UART", "SRAM", 2, true], ["SRAM", "SPI", 1, true],
    ],

    init() {
      this.packets = [];
      this.spawnIn = 0;
      this.flash = Object.fromEntries(Object.keys(this.BLOCKS).map((k) => [k, 0]));
    },

    center(name) {
      const [x0, x1, z0, z1] = this.BLOCKS[name];
      return [(x0 + x1) / 2, this.Y + 0.06, (z0 + z1) / 2];
    },

    // every block hangs off one bus running along z = 0
    route(from, to) {
      const a = this.center(from), b = this.center(to);
      return [a, [a[0], a[1], 0], [b[0], b[1], 0], b];
    },

    step(dt) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        const total = this.ROUTES.reduce((s, r) => s + r[2], 0);
        let pick = Math.random() * total;
        const [from, to, , dma] = this.ROUTES.find((r) => (pick -= r[2]) <= 0);
        const pts = this.route(from, to);
        const lens = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[2] - pts[k][2]));
        this.packets.push({ pts, lens, total: lens.reduce((s, l) => s + l, 0), d: 0, to, dma });
        if (dma) this.flash.DMA = 1;
        this.spawnIn = rand(0.15, 0.35);
      }
      for (const p of this.packets) {
        p.d += dt * 2.6;
        if (p.d >= p.total) this.flash[p.to] = 1;
      }
      this.packets = this.packets.filter((p) => p.d < p.total);
      for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 2);
    },

    draw() {
      const Y = this.Y;
      // die and its pins
      box(-3.2, Y - 0.12, -2.0, 3.0, Y, 2.0, white(0.12));
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const x = -3.0 + k * 0.375;
        seg([x, Y - 0.06, -2.0], [x, Y - 0.06, -2.25]);
        seg([x, Y - 0.06, 2.0], [x, Y - 0.06, 2.25]);
      }
      for (let k = 0; k <= 10; k++) {
        const z = -1.8 + k * 0.36;
        seg([-3.2, Y - 0.06, z], [-3.45, Y - 0.06, z]);
        seg([3.0, Y - 0.06, z], [3.25, Y - 0.06, z]);
      }
      stroke(white(0.12));

      // bus, with a stub to each block
      ctx.beginPath();
      seg([-2.2, Y + 0.01, 0], [2.25, Y + 0.01, 0]);
      for (const name of Object.keys(this.BLOCKS)) {
        const [x0, x1, z0, z1] = this.BLOCKS[name];
        const cx = (x0 + x1) / 2;
        seg([cx, Y + 0.01, 0], [cx, Y + 0.01, z0 > 0 ? z0 : z1]);
      }
      stroke(white(0.22), 1.5);
      text("AHB", -0.5, Y + 0.05, -0.18, white(0.3), 10);
      text("APB", 1.65, Y + 0.05, -0.18, white(0.3), 10);

      for (const [name, [x0, x1, z0, z1, h]] of Object.entries(this.BLOCKS)) {
        const g = this.flash[name];
        box(x0, Y, z0, x1, Y + h, z1, orange(0.3 + g * 0.55), ember(0.05 + g * 0.25));
        text(name, (x0 + x1) / 2, Y + h + 0.12, (z0 + z1) / 2, white(0.45 + g * 0.4), 11);
      }

      for (const p of this.packets) {
        let d = p.d, k = 0;
        while (k < p.lens.length - 1 && d > p.lens[k]) d -= p.lens[k++];
        const a = p.pts[k], b = p.pts[k + 1], t = p.lens[k] ? Math.min(1, d / p.lens[k]) : 1;
        const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        const s = 0.07;
        box(x - s, Y + 0.02, z - s, x + s, Y + 0.02 + s * 2, z + s, p.dma ? white(0.8) : orange(0.9), p.dma ? white(0.3) : ember(0.5));
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: memory map. The address space as a tower of regions; inside RAM
     the heap grows up while the stack grows down.
     ------------------------------------------------------------------------ */

  const memmapScene = {
    caption: "memory map",
    pitch: -0.18,
    yaw: -0.5,

    init() {
      this.t = Math.random() * 10;
    },

    step(dt) {
      this.t += dt;
      this.yaw = -0.5 + Math.sin(this.t * 0.15) * 0.25;
    },

    draw() {
      const X = 1.2, Z = 0.6;
      const heap = 0.18 + 0.38 * (0.5 + 0.5 * Math.sin(this.t * 0.45));
      const stackH = 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 0.7 + 1));
      const regions = [
        { name: "Flash", addr: "0x08000000", y0: -2.1, parts: [[".isr_vector", 0.15], [".text", 0.7], [".rodata", 0.3], [".data (init)", 0.2]] },
        { name: "SRAM", addr: "0x20000000", y0: -0.5, size: 1.65, parts: [[".data", 0.18], [".bss", 0.22], ["heap", heap], ["free", null], ["stack", stackH]] },
        { name: "Peripherals", addr: "0x40000000", y0: 1.45, size: 0.4, parts: [] },
        { name: "System", addr: "0xE0000000", y0: 2.1, size: 0.3, parts: [] },
      ];

      for (const r of regions) {
        const size = r.size || r.parts.reduce((s, p) => s + p[1], 0);
        box(-X, r.y0, -Z, X, r.y0 + size, Z, white(0.2));
        text(r.addr, -X - 0.12, r.y0 + 0.05, Z, white(0.35), 10, "right");
        text(r.name, -X - 0.12, r.y0 + 0.2, Z, white(0.55), 11, "right");

        // sections stacked from the bottom; "free" takes whatever is left, the stack sits on top
        let y = r.y0;
        const fixed = r.parts.filter((p) => p[1] !== null).reduce((s, p) => s + p[1], 0);
        for (const [name, h0] of r.parts) {
          const h = h0 === null ? size - fixed : h0;
          if (name !== "free") {
            const live = name === "heap" || name === "stack";
            box(-X + 0.08, y + 0.02, -Z + 0.08, X - 0.08, y + h - 0.02, Z - 0.08, orange(live ? 0.6 : 0.3), ember(live ? 0.15 : 0.05));
            text(name, X + 0.15, y + h / 2 - 0.05, Z, white(live ? 0.6 : 0.4), 10, "left");
          } else {
            text("free", 0, y + h / 2 - 0.05, Z, white(0.25), 10);
          }
          if (name === "heap") arrow([0, y + h - 0.25, Z], [0, y + h + 0.05, Z], "rgba(255, 140, 90, 0.6)");
          if (name === "stack") arrow([0, y + 0.25, Z], [0, y - 0.05, Z], "rgba(255, 140, 90, 0.6)");
          y += h;
        }
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: boot sequence. From reset to the scheduler, one step at a time.
     ------------------------------------------------------------------------ */

  const bootScene = {
    caption: "boot sequence",
    pitch: -0.25,
    yaw: -0.12,
    STEPS: [
      ["RESET", "power on"], ["vector table", "load SP + PC"], ["Reset_Handler", ""],
      ["SystemInit", "clocks + PLL"], ["copy .data", "flash to RAM"], ["zero .bss", ""],
      ["main()", ""], ["scheduler", "tasks running"],
    ],

    init() {
      this.idx = 0;
      this.t = 0;
      this.moving = false;
      this.dwell = 1;
      this.glow = this.STEPS.map((_, i) => (i === 0 ? 1 : 0));
    },

    pos(i) {
      return [-3.3 + i * 0.95, -1.55 + i * 0.4, Math.sin(i * 0.9) * 0.6];
    },

    step(dt) {
      const last = this.STEPS.length - 1;
      if (this.moving) {
        this.t += dt / 0.45;
        if (this.t >= 1) {
          this.moving = false;
          this.idx++;
          this.dwell = this.idx === last ? 4 : 0.8;
        }
      } else {
        this.dwell -= dt;
        if (this.dwell <= 0) {
          if (this.idx === last) {
            this.idx = 0; // reset and boot again
            this.dwell = 1;
          } else {
            this.moving = true;
            this.t = 0;
          }
        }
      }
      this.glow = this.glow.map((g, i) => ease(g, i === this.idx && !this.moving ? 1 : i < this.idx ? 0.35 : 0, dt, 5));
    },

    draw() {
      for (let i = 0; i < this.STEPS.length - 1; i++) {
        const a = this.pos(i), b = this.pos(i + 1);
        const active = this.moving && i === this.idx;
        arrow([a[0] + 0.35, a[1], a[2]], [b[0] - 0.35, b[1], b[2]], active ? orange(0.7) : white(0.18));
      }
      this.STEPS.forEach(([name, sub], i) => {
        const [x, y, z] = this.pos(i);
        const g = this.glow[i];
        box(x - 0.33, y - 0.11, z - 0.22, x + 0.33, y + 0.11, z + 0.22, g > 0.05 ? orange(0.3 + g * 0.6) : white(0.16), g > 0.05 ? ember(0.25 * g) : null);
        text(name, x, y + 0.3, z, white(0.35 + g * 0.55), 11);
        if (sub) text(sub, x, y - 0.38, z, white(0.2 + g * 0.35), 10);
      });
      if (this.moving) {
        const a = this.pos(this.idx), b = this.pos(this.idx + 1);
        const p = a.map((v, k) => v + (b[k] - v) * this.t);
        box(p[0] - 0.07, p[1] + 0.14, p[2] - 0.07, p[0] + 0.07, p[1] + 0.28, p[2] + 0.07, orange(0.9), ember(0.5));
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: PWM timer. The counter ramps to ARR, the output is high while the
     counter is below the compare value, and the duty sets the LED brightness.
     ------------------------------------------------------------------------ */

  const pwmScene = {
    caption: "pwm timer",
    pitch: -0.42,
    yaw: -0.35,
    X0: -3.0,
    X1: 1.9,
    PER: 0.5, // x length of one PWM period

    init() {
      this.t = Math.random() * 20;
    },

    step(dt) {
      this.t += dt * 1.1; // PWM periods per second, slowed right down
    },

    duty(k) {
      return 0.5 + 0.42 * Math.sin(Math.floor(k) * 0.3);
    },

    draw() {
      const { X0, X1, PER } = this;
      const LO = -1.2, HI = 0.3;
      const tau = (x) => this.t - (X1 - x) / PER; // time in periods at x
      const cnt = [], ccr = [], out = [];
      for (let k = 0; k <= 360; k++) {
        const x = X0 + ((X1 - X0) * k) / 360;
        const t = tau(x);
        const c = t - Math.floor(t);
        const d = this.duty(t);
        cnt.push([x, LO + c * (HI - LO), -0.9]);
        ccr.push([x, LO + d * (HI - LO), -0.9]);
        out.push([x, c < d ? -0.5 : LO, 0.9]);
      }
      const line = (pts, color, width) => {
        ctx.beginPath();
        pts.forEach((p, k) => (k ? seg(pts[k - 1], p) : null));
        stroke(color, width);
      };
      // baselines
      ctx.beginPath();
      seg([X0, LO, -0.9], [X1, LO, -0.9]);
      seg([X0, LO, 0.9], [X1, LO, 0.9]);
      seg([X0, HI, -0.9], [X1, HI, -0.9]);
      stroke(white(0.08));

      line(ccr, white(0.35), 1);
      line(cnt, orange(0.45), 1.2);
      line(out, orange(0.85), 1.5);

      text("CNT", X0 - 0.15, LO + 0.3, -0.9, white(0.4), 10, "right");
      text("ARR", X0 - 0.15, HI - 0.05, -0.9, white(0.3), 10, "right");
      text("OUT", X0 - 0.15, LO + 0.3, 0.9, white(0.4), 10, "right");

      // the LED the output is driving
      const d = this.duty(this.t);
      const [lx, ly, lz] = [2.75, LO, 0.9];
      const ringPts = (r, y) => Array.from({ length: 10 }, (_, k) => {
        const a = (k / 10) * Math.PI * 2;
        return [lx + Math.cos(a) * r, y, lz + Math.sin(a) * r];
      });
      ctx.beginPath();
      poly(ringPts(0.28, ly + 0.45));
      fill(ember(0.15 + d * 0.6));
      ctx.beginPath();
      const base = ringPts(0.28, ly), top = ringPts(0.28, ly + 0.45);
      poly(base);
      poly(top);
      base.forEach((p, k) => seg(p, top[k]));
      top.forEach((p) => seg(p, [lx, ly + 0.75, lz]));
      stroke(orange(0.3 + d * 0.6));
      text(`duty ${Math.round(d * 100)}%`, lx, ly - 0.35, lz, white(0.5), 11);
      arrow([X1 + 0.1, -0.85, 0.9], [lx - 0.4, -0.85, 0.9], white(0.2));
    },
  };

  /* ------------------------------------------------------------------------
     Scene: SPI transfer. Master and slave shift registers form one loop;
     every clock moves each bit one place, so after 8 clocks the bytes swap.
     ------------------------------------------------------------------------ */

  const spiScene = {
    caption: "spi transfer",
    pitch: -0.45,
    yaw: -0.25,
    PAIRS: [[0x9f, 0xef], [0x03, 0x40], [0x05, 0x18], [0xa5, 0x3c]],
    CELL: 0.38,

    init() {
      this.pair = Math.floor(Math.random() * this.PAIRS.length);
      this.load();
    },

    load() {
      const [m, s] = this.PAIRS[this.pair];
      const bits = (v) => Array.from({ length: 8 }, (_, i) => (v >> (7 - i)) & 1);
      this.bits = [...bits(m), ...bits(s)]; // one 16-bit ring: master cells 0-7, slave cells 8-15
      this.clock = 0;
      this.phase = 0;
      this.pause = 1.2;
    },

    // x position of ring cell i (gap between master and slave)
    cellX(i) {
      return -3.2 + i * this.CELL + (i >= 8 ? 0.7 : 0);
    },

    byte(from) {
      return this.bits.slice(from, from + 8).reduce((v, b) => (v << 1) | b, 0);
    },

    step(dt) {
      if (this.pause > 0) {
        this.pause -= dt;
        return;
      }
      this.phase += dt / 0.4;
      if (this.phase >= 1) {
        this.phase = 0;
        this.bits = [this.bits[15], ...this.bits.slice(0, 15)];
        this.clock++;
        if (this.clock === 8) {
          this.pause = 2.2; // bytes have swapped; hold, then the next transfer
          this.clock = 9;
        } else if (this.clock > 9) {
          this.pair = (this.pair + 1) % this.PAIRS.length;
          this.load();
        }
      }
    },

    draw() {
      const C = this.CELL, Y = -0.4;
      if (this.clock === 9 && this.pause <= 0) {
        this.pair = (this.pair + 1) % this.PAIRS.length;
        this.load();
      }
      const moving = this.pause <= 0 && this.clock < 8;
      const p = moving ? this.phase : 0;

      // registers
      for (let i = 0; i < 16; i++) {
        const x = this.cellX(i);
        box(x, Y, -0.22, x + C - 0.04, Y + 0.32, 0.22, white(0.16));
      }
      text("MASTER", this.cellX(0) + 4 * C, Y + 0.75, 0, white(0.45), 11);
      text("SLAVE", this.cellX(8) + 4 * C, Y + 0.75, 0, white(0.45), 11);
      text("0x" + this.byte(0).toString(16).toUpperCase().padStart(2, "0"), this.cellX(0) + 4 * C, Y - 0.35, 0.22, white(0.4), 11);
      text("0x" + this.byte(8).toString(16).toUpperCase().padStart(2, "0"), this.cellX(8) + 4 * C, Y - 0.35, 0.22, white(0.4), 11);

      // wires: MOSI across the gap, MISO looping back behind
      const right = this.cellX(15) + C, left = this.cellX(0);
      ctx.beginPath();
      seg([this.cellX(7) + C, Y + 0.16, 0], [this.cellX(8), Y + 0.16, 0]);
      seg([right, Y + 0.16, 0], [right + 0.3, Y + 0.16, 0]);
      seg([right + 0.3, Y + 0.16, 0], [right + 0.3, Y + 0.16, -1.0]);
      seg([right + 0.3, Y + 0.16, -1.0], [left - 0.3, Y + 0.16, -1.0]);
      seg([left - 0.3, Y + 0.16, -1.0], [left - 0.3, Y + 0.16, 0]);
      seg([left - 0.3, Y + 0.16, 0], [left, Y + 0.16, 0]);
      stroke(white(0.22));
      text("MOSI", (this.cellX(7) + C + this.cellX(8)) / 2, Y + 0.35, 0, white(0.4), 10);
      text("MISO", 0, Y + 0.3, -1.0, white(0.4), 10);

      // clock line with one pulse per bit
      ctx.beginPath();
      const ck = (k) => [this.cellX(0) + k * 0.4, Y + 1.35, -0.5];
      for (let k = 0; k < 16; k++) {
        const hi = k % 2 === 1 && Math.floor(k / 2) < this.clock + (moving && p > 0.5 ? 1 : 0);
        const a = ck(k), b = ck(k + 1);
        const y = hi ? Y + 1.55 : Y + 1.35;
        seg([a[0], y, a[2]], [b[0], y, b[2]]);
        if (k) seg([a[0], Y + 1.35, a[2]], [a[0], Y + 1.55, a[2]]);
      }
      stroke(orange(0.45));
      text("SCK", this.cellX(0) - 0.25, Y + 1.38, -0.5, white(0.4), 10, "right");

      // the bits themselves, sliding one place per clock
      for (let i = 0; i < 16; i++) {
        const b = this.bits[i];
        let x = this.cellX(i) + C / 2 - 0.02, z = 0;
        if (moving) {
          if (i === 15) {
            // wrapping bit travels the MISO loop
            const t = p;
            if (t < 0.15) x = this.cellX(15) + C / 2 + (t / 0.15) * 0.5;
            else if (t < 0.85) {
              z = -1.0;
              x = right + 0.3 - ((t - 0.15) / 0.7) * (right - left + 0.6);
            } else x = left - 0.3 + ((t - 0.85) / 0.15) * (C / 2 + 0.28);
          } else {
            x += (this.cellX(i + 1) - this.cellX(i)) * p;
          }
        }
        const s = 0.11;
        box(x - s, Y + 0.08, z - s, x + s, Y + 0.08 + s * 2, z + s, b ? orange(0.85) : white(0.3), b ? ember(0.35) : null);
        text(String(b), x, Y + 0.5, z, white(b ? 0.7 : 0.35), 10);
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: I2C bus. Everything shares two wires; the master sends an address,
     the matching device answers with an ACK, then the data byte follows.
     ------------------------------------------------------------------------ */

  const i2cScene = {
    caption: "i2c bus",
    pitch: -0.4,
    yaw: -0.2,
    DEVICES: [
      { name: "MCU", sub: "master", x: -2.9 },
      { name: "TEMP", sub: "0x48", x: -0.9, addr: 0x48 },
      { name: "RTC", sub: "0x68", x: 0.9, addr: 0x68 },
      { name: "OLED", sub: "0x3C", x: 2.7, addr: 0x3c },
    ],
    SDA: 0.7,
    SCL: 0.35,

    init() {
      this.glow = this.DEVICES.map(() => 0);
      this.next();
    },

    next() {
      this.target = 1 + Math.floor(Math.random() * 3);
      this.frames = [
        { kind: "addr", label: "0x" + this.DEVICES[this.target].sub.slice(2) + " W", dir: 1, dur: 1.6 },
        { kind: "ack", label: "ACK", dir: -1, dur: 0.7 },
        { kind: "data", label: "0x" + Math.floor(rand(0, 255)).toString(16).toUpperCase().padStart(2, "0"), dir: 1, dur: 1.6 },
        { kind: "ack", label: "ACK", dir: -1, dur: 0.7 },
        { kind: "idle", label: "", dir: 0, dur: 1.4 },
      ];
      this.f = 0;
      this.t = 0;
      this.log = ["START"];
    },

    step(dt) {
      const fr = this.frames[this.f];
      this.t += dt / fr.dur;
      if (this.t >= 1) {
        if (fr.label) this.log.push(fr.label);
        this.f++;
        this.t = 0;
        if (this.f === this.frames.length - 1) this.log.push("STOP");
        if (this.f >= this.frames.length) this.next();
      }
      const cur = this.frames[this.f];
      const busy = cur && cur.kind !== "idle";
      this.glow = this.glow.map((g, i) => ease(g, busy && (i === 0 || (i === this.target && this.f > 0)) ? 1 : 0, dt, 4));
    },

    draw() {
      const X0 = -3.4, X1 = 3.4;
      // the two shared lines, pulled up to VCC on the left
      ctx.beginPath();
      seg([X0, this.SDA, 0], [X1, this.SDA, 0]);
      seg([X0, this.SCL, 0], [X1, this.SCL, 0]);
      stroke(white(0.3), 1.5);
      ctx.beginPath();
      for (const [k, y] of [[0, this.SDA], [1, this.SCL]]) {
        const x = X0 + 0.15 + k * 0.3;
        const zig = [[x, y, 0], [x, y + 0.2, 0]];
        for (let n = 0; n < 4; n++) zig.push([x + (n % 2 ? -0.07 : 0.07), y + 0.27 + n * 0.08, 0]);
        zig.push([x, y + 0.6, 0], [x, 1.55, 0]);
        zig.forEach((pt, n) => (n ? seg(zig[n - 1], pt) : null));
      }
      seg([X0, 1.55, 0], [X0 + 0.7, 1.55, 0]);
      stroke(white(0.2));
      text("VCC", X0 + 0.35, 1.7, 0, white(0.3), 10);
      text("SDA", X1 + 0.15, this.SDA - 0.04, 0, white(0.4), 10, "left");
      text("SCL", X1 + 0.15, this.SCL - 0.04, 0, white(0.4), 10, "left");

      // devices hanging off the bus
      this.DEVICES.forEach((d, i) => {
        const g = this.glow[i];
        ctx.beginPath();
        seg([d.x - 0.12, -0.55, 0], [d.x - 0.12, this.SDA, 0]);
        seg([d.x + 0.12, -0.55, 0], [d.x + 0.12, this.SCL, 0]);
        stroke(white(0.18));
        box(d.x - 0.5, -1.25, -0.35, d.x + 0.5, -0.55, 0.35, g > 0.05 ? orange(0.35 + g * 0.55) : white(0.18), g > 0.05 ? ember(0.25 * g) : null);
        text(d.name, d.x, -0.95, 0.35, white(0.5 + g * 0.4), 11);
        text(d.sub, d.x, -1.15, 0.35, white(0.3 + g * 0.3), 10);
      });

      // the frame on the wire
      const fr = this.frames[this.f];
      if (fr && fr.dir) {
        const tx = this.DEVICES[this.target].x;
        const from = fr.dir > 0 ? this.DEVICES[0].x : tx;
        const to = fr.dir > 0 ? X1 - 0.2 : this.DEVICES[0].x;
        const x = from + (to - from) * this.t;
        const s = 0.1;
        box(x - s * 2.4, this.SDA - s, -s, x + s * 2.4, this.SDA + s, s, orange(0.9), ember(0.4));
        text(fr.label, x, this.SDA + 0.3, 0, white(0.75), 11);
      }
      text(this.log.join("  "), 0, -1.75, 0.35, white(0.35), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: watchdog. The main loop kicks the watchdog to refill it; when the
     loop hangs, nothing kicks it, it runs out and resets the chip.
     ------------------------------------------------------------------------ */

  const wdtScene = {
    caption: "watchdog timer",
    pitch: -0.55,
    yaw: 0,
    SEG: 24,

    init() {
      this.level = 1;
      this.kickIn = 1.2;
      this.kicks = 0;
      this.hung = false;
      this.reset = 0;
      this.flash = 0;
      this.spin = 0;
    },

    step(dt) {
      this.spin += dt * 0.08;
      if (this.reset > 0) {
        this.reset -= dt;
        if (this.reset <= 0) this.init(); // reboot
        return;
      }
      this.level -= dt / 4.5; // ~4.5 s timeout
      this.flash = Math.max(0, this.flash - dt * 2);
      if (!this.hung) {
        this.kickIn -= dt;
        if (this.kickIn <= 0) {
          this.level = 1;
          this.flash = 1;
          this.kicks++;
          this.kickIn = rand(1, 1.8);
          if (this.kicks > 4 && Math.random() < 0.3) this.hung = true; // stuck in a loop somewhere
        }
      }
      if (this.level <= 0) {
        this.level = 0;
        this.reset = 2;
      }
    },

    draw() {
      const R = 1.7, half = (Math.PI / this.SEG) * 0.75;
      const lit = Math.ceil(this.level * this.SEG);
      for (let i = 0; i < this.SEG; i++) {
        const a = -Math.PI / 2 - (i / this.SEG) * Math.PI * 2 + this.spin;
        const on = i < lit;
        const c = (ang, r) => [Math.cos(ang) * r, -0.3, Math.sin(ang) * r];
        const pts = [c(a - half, R - 0.25), c(a + half, R - 0.25), c(a + half, R + 0.25), c(a - half, R + 0.25)];
        const h = on ? 0.18 + this.flash * 0.15 : 0.04;
        const top = pts.map(([x, y, z]) => [x, y + h, z]);
        ctx.beginPath();
        poly(top);
        if (on) fill(ember(0.12 + this.flash * 0.3 + (this.level < 0.25 ? 0.15 : 0)));
        ctx.beginPath();
        poly(pts);
        poly(top);
        pts.forEach((p, k) => seg(p, top[k]));
        stroke(on ? orange(0.4 + this.flash * 0.5) : white(0.1));
      }
      const count = Math.round(this.level * 4095);
      if (this.reset > 0) {
        text("WDT RESET", 0, -0.2, 0, orange(Math.min(1, this.reset)), 16);
      } else {
        text(count.toString(), 0, -0.15, 0, white(0.6), 14);
        text("counter", 0, -0.45, 0, white(0.3), 10);
      }

      // the main loop that is supposed to kick it
      const ok = !this.hung;
      box(2.6, -0.5, -0.4, 3.6, 0.1, 0.4, ok ? orange(0.4 + this.flash * 0.5) : white(0.2), ok ? ember(0.08 + this.flash * 0.2) : null);
      text("main loop", 3.1, 0.35, 0, white(0.5), 11);
      text(this.reset > 0 ? "rebooting" : ok ? "running" : "hung", 3.1, -0.85, 0.4, ok ? white(0.4) : orange(0.7), 10);
      if (this.flash > 0.05) {
        arrow([2.5, -0.2, 0], [R + 0.4, -0.2, 0], orange(this.flash));
        text("kick", 2.2, 0.05, 0, orange(this.flash), 10);
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: mutex. Two tasks share one UART; whoever holds the lock writes,
     the other blocks until it's given back.
     ------------------------------------------------------------------------ */

  const mutexScene = {
    caption: "mutex",
    pitch: -0.5,
    yaw: 0,
    RES: [0, 0.6, -0.6],
    TASKS: [{ name: "task A", x: -2.4 }, { name: "task B", x: 2.4 }],

    init() {
      this.holder = -1;
      this.token = [...this.RES];
      this.state = this.TASKS.map(() => ({ want: rand(0.3, 1.5), hold: 0, waiting: false, glow: 0 }));
    },

    step(dt) {
      this.state.forEach((s, i) => {
        if (this.holder === i) {
          s.hold -= dt;
          if (s.hold <= 0) {
            this.holder = -1; // give
            s.want = rand(1.2, 2.6);
          }
        } else {
          s.want -= dt;
          s.waiting = s.want <= 0;
        }
      });
      if (this.holder < 0) {
        // the task that has been waiting longest takes it
        let best = -1;
        this.state.forEach((s, i) => {
          if (s.waiting && (best < 0 || s.want < this.state[best].want)) best = i;
        });
        if (best >= 0) {
          this.holder = best;
          this.state[best].waiting = false;
          this.state[best].hold = rand(1.5, 2.5);
        }
      }
      const target = this.holder < 0 ? this.RES : [this.TASKS[this.holder].x, 0.75, 0];
      this.token = this.token.map((v, k) => ease(v, target[k], dt, 5));
      this.state.forEach((s, i) => (s.glow = ease(s.glow, this.holder === i ? 1 : 0, dt, 5)));
    },

    draw() {
      const [rx, ry, rz] = this.RES;
      box(rx - 0.8, ry - 0.9, rz - 0.45, rx + 0.8, ry - 0.2, rz + 0.45, white(0.25));
      text("UART", rx, ry - 0.62, rz + 0.45, white(0.55), 12);
      text("shared resource", rx, ry - 1.15, rz + 0.45, white(0.3), 10);

      this.TASKS.forEach((t, i) => {
        const s = this.state[i];
        const holds = this.holder === i;
        box(t.x - 0.65, -0.3, -0.4, t.x + 0.65, 0.3, 0.4, holds ? orange(0.4 + s.glow * 0.5) : white(s.waiting ? 0.3 : 0.18), holds ? ember(0.2 * s.glow) : null);
        text(t.name, t.x, 0.05, 0.4, white(0.55), 11);
        const status = holds ? "writing" : s.waiting ? "blocked: waiting for lock" : "doing other work";
        text(status, t.x, -0.65, 0.4, holds ? orange(0.75) : white(s.waiting ? 0.5 : 0.3), 10);
        if (holds && s.glow > 0.6) arrow([t.x + (i ? -0.6 : 0.6), 0.2, 0], [rx + (i ? 0.85 : -0.85), ry - 0.5, rz], orange(0.6));
        if (s.waiting) arrow([t.x + (i ? -0.6 : 0.6), 0, 0], [t.x + (i ? -1.1 : 1.1), 0, 0], white(0.3));
      });

      // the lock itself: a small padlock
      const [x, y, z] = this.token;
      box(x - 0.16, y - 0.13, z - 0.08, x + 0.16, y + 0.13, z + 0.08, orange(0.9), ember(0.45));
      ctx.beginPath();
      const arc = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI - (k / 8) * Math.PI;
        arc.push([x + Math.cos(a) * 0.1, y + 0.13 + Math.sin(a) * 0.14, z]);
      }
      arc.forEach((p, k) => (k ? seg(arc[k - 1], p) : null));
      stroke(orange(0.9));
      text(this.holder < 0 ? "lock: free" : `lock: ${this.TASKS[this.holder].name}`, x, y + 0.45, z, white(0.5), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: ADC sampling. A smooth analog signal sampled at a fixed rate and
     rounded to the nearest level, the way a 4-bit ADC would see it.
     ------------------------------------------------------------------------ */

  const adcScene = {
    caption: "adc sampling",
    pitch: -0.35,
    yaw: -0.4,
    LEVELS: 16,

    init() {
      this.t = Math.random() * 20;
    },

    step(dt) {
      this.t += dt * 0.6;
    },

    signal(t) {
      return 0.5 + 0.3 * Math.sin(t * 1.3) + 0.12 * Math.sin(t * 3.1 + 1) + 0.05 * Math.sin(t * 7.3);
    },

    draw() {
      const X0 = -3.2, X1 = 2.6, LO = -1.1, HI = 0.9, ZA = -0.5, ZD = 0.5;
      const span = 6; // signal time across the plane
      const tAt = (x) => this.t - ((X1 - x) / (X1 - X0)) * span;
      const yOf = (v) => LO + v * (HI - LO);

      // quantisation levels on the digital plane
      ctx.beginPath();
      for (let k = 0; k <= this.LEVELS; k += 2) seg([X0, yOf(k / this.LEVELS), ZD], [X1, yOf(k / this.LEVELS), ZD]);
      stroke(white(0.05));

      // analog curve
      ctx.beginPath();
      let prev = null;
      for (let k = 0; k <= 200; k++) {
        const x = X0 + ((X1 - X0) * k) / 200;
        const pt = [x, yOf(this.signal(tAt(x))), ZA];
        if (prev) seg(prev, pt);
        prev = pt;
      }
      stroke(white(0.4), 1.2);

      // samples: drop line, stair step, value
      const dtS = 0.25;
      const first = Math.ceil(tAt(X0) / dtS) * dtS;
      const steps = [];
      ctx.beginPath();
      for (let ts = first; ts <= this.t; ts += dtS) {
        const x = X1 - ((this.t - ts) / span) * (X1 - X0);
        const v = this.signal(ts);
        const q = Math.round(v * (this.LEVELS - 1)) / (this.LEVELS - 1);
        seg([x, yOf(v), ZA], [x, yOf(q), ZD]);
        steps.push([x, q]);
      }
      stroke(orange(0.25));
      ctx.beginPath();
      steps.forEach(([x, q], k) => {
        const y = yOf(q);
        if (k) {
          seg([steps[k - 1][0], yOf(steps[k - 1][1]), ZD], [x, yOf(steps[k - 1][1]), ZD]);
          seg([x, yOf(steps[k - 1][1]), ZD], [x, y, ZD]);
        }
      });
      stroke(orange(0.85), 1.5);
      steps.forEach(([x, q]) => {
        const p = [x, yOf(q), ZD];
        box(p[0] - 0.03, p[1] - 0.03, p[2] - 0.03, p[0] + 0.03, p[1] + 0.03, p[2] + 0.03, orange(0.9));
      });

      text("analog in", X0 - 0.15, yOf(0.5), ZA, white(0.4), 10, "right");
      text("4-bit ADC", X0 - 0.15, yOf(0.5), ZD, white(0.4), 10, "right");
      const last = steps[steps.length - 1];
      if (last) {
        const code = Math.round(last[1] * (this.LEVELS - 1));
        text(`0b${code.toString(2).padStart(4, "0")}  (${code})`, X1 + 0.2, yOf(last[1]), ZD, white(0.6), 11, "left");
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: CPU pipeline. Instructions move through fetch, decode and execute
     one clock at a time; a taken branch flushes what was fetched behind it.
     ------------------------------------------------------------------------ */

  const pipeScene = {
    caption: "cpu pipeline",
    pitch: -0.3,
    yaw: -0.3,
    STAGES: ["FETCH", "DECODE", "EXECUTE"],
    PROGRAM: ["LDR r0, [r1]", "ADD r0, r0, #1", "STR r0, [r1]", "CMP r0, #10", "BNE loop", "MOV r2, #0", "BX lr"],

    init() {
      this.pc = 0;
      this.slots = [null, null, null]; // instruction index in each stage
      this.leaving = [];
      this.flushed = [];
      this.t = 0;
      this.cycles = 0;
      this.loops = 0;
      this.pos = {};
    },

    stageX(s) {
      return -2.4 + s * 2.0;
    },

    step(dt) {
      this.t += dt / 0.9;
      if (this.t >= 1) {
        this.t = 0;
        this.cycles++;
        const done = this.slots[2];
        if (done !== null) this.leaving.push({ i: done, x: this.stageX(2), a: 1 });
        // a taken branch in execute throws away what is behind it
        if (done === 4 && this.loops < 2) {
          this.loops++;
          for (const s of [0, 1]) if (this.slots[s] !== null) this.flushed.push({ i: this.slots[s], x: this.stageX(s), a: 1 });
          this.slots = [0, null, null];
          this.pc = 1;
          this.flash = 1;
          return;
        }
        this.slots = [this.pc < this.PROGRAM.length ? this.pc : null, this.slots[0], this.slots[1]];
        if (this.pc < this.PROGRAM.length) this.pc++;
        if (this.slots.every((s) => s === null)) this.init();
      }
      for (const l of this.leaving) {
        l.x += dt * 1.6;
        l.a -= dt * 0.9;
      }
      for (const f of this.flushed) f.a -= dt * 1.2;
      this.leaving = this.leaving.filter((l) => l.a > 0);
      this.flushed = this.flushed.filter((f) => f.a > 0);
      this.flash = Math.max(0, (this.flash || 0) - dt * 1.5);
    },

    card(i, x, y, a, color) {
      box(x - 0.85, y - 0.16, -0.35, x + 0.85, y + 0.16, 0.35, color, ember(0.12 * a));
      text(this.PROGRAM[i], x, y - 0.04, 0.35, white(0.75 * a), 10);
    },

    draw() {
      const ease3 = (t) => t * t * (3 - 2 * t);
      const slide = ease3(Math.min(1, this.t * 2.5)); // cards settle early in each clock
      this.STAGES.forEach((name, s) => {
        const x = this.stageX(s);
        box(x - 0.95, -0.9, -0.5, x + 0.95, -0.55, 0.5, white(0.2));
        text(name, x, -1.25, 0.5, white(0.45), 11);
        if (s < 2) arrow([x + 1.0, -0.72, 0], [x + 1.0 + 0.0 + 0.95, -0.72, 0], white(0.2));
      });
      this.slots.forEach((i, s) => {
        if (i === null) return;
        const from = s === 0 ? this.stageX(0) - 2 : this.stageX(s - 1);
        const x = from + (this.stageX(s) - from) * slide;
        this.card(i, x, -0.3, 1, orange(0.6 + (s === 2 ? 0.3 : 0)));
      });
      for (const l of this.leaving) this.card(l.i, l.x, -0.3 + (1 - l.a) * 0.4, l.a, orange(0.4 * l.a));
      for (const f of this.flushed) this.card(f.i, f.x, -0.3 - (1 - f.a) * 0.6, f.a, white(0.4 * f.a));
      if (this.flash > 0) text("branch taken: pipeline flush", this.stageX(1), 0.6, 0, orange(this.flash), 11);
      text(`clock ${this.cycles}`, this.stageX(2) + 1.4, 0.35, 0, white(0.3), 10, "left");
      text("flash", this.stageX(0) - 2, -0.75, 0, white(0.3), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: OTA update. The new image streams into the spare flash bank,
     gets checked, then the banks swap and the device reboots onto it.
     ------------------------------------------------------------------------ */

  const otaScene = {
    caption: "ota update",
    pitch: -0.5,
    yaw: -0.2,
    CHUNKS: 16,

    init() {
      this.active = 0;
      this.versions = ["v1.4.0", "empty"];
      this.newVersion = [1, 5, 0];
      this.start();
    },

    start() {
      this.phase = "download";
      this.got = 0;
      this.t = 0;
      this.flash = 0;
      this.versions[1 - this.active] = "empty";
    },

    bankX(b) {
      return b === 0 ? -1.6 : 1.6;
    },

    step(dt) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt * 1.2);
      if (this.phase === "download") {
        if (this.t > 0.32) {
          this.t = 0;
          this.got++;
          if (this.got === this.CHUNKS) this.phase = "verify";
        }
      } else if (this.phase === "verify" && this.t > 2) {
        this.phase = "swap";
        this.t = 0;
        this.versions[1 - this.active] = "v" + this.newVersion.join(".");
        this.active = 1 - this.active;
        this.flash = 1;
      } else if (this.phase === "swap" && this.t > 3) {
        this.newVersion[1]++;
        this.start();
      }
    },

    draw() {
      const spare = this.phase === "swap" ? -1 : 1 - this.active;
      // the two flash banks, 4x4 chunks each
      for (const b of [0, 1]) {
        const bx = this.bankX(b);
        const isActive = b === this.active;
        box(bx - 1.15, -0.95, -1.0, bx + 1.15, -0.85, 1.0, isActive ? orange(0.5) : white(0.2));
        text(`bank ${b ? "B" : "A"}`, bx, -0.9, -1.45, white(0.5), 11);
        text(this.versions[b] + (isActive ? "  (running)" : ""), bx, -0.9, -1.8, isActive ? orange(0.7) : white(0.35), 10);
        for (let c = 0; c < this.CHUNKS; c++) {
          const cx = bx - 0.9 + (c % 4) * 0.6, cz = -0.75 + Math.floor(c / 4) * 0.5;
          const filled = b === spare ? c < this.got : this.versions[b] !== "empty";
          const scan = this.phase === "verify" && b === spare && Math.floor(this.t * 8) % this.CHUNKS === c;
          const h = filled ? 0.18 : 0.03;
          box(cx - 0.22, -0.85, cz - 0.18, cx + 0.22, -0.85 + h, cz + 0.18,
            scan ? white(0.9) : filled ? orange(isActive ? 0.5 + this.flash * 0.4 : 0.6) : white(0.1),
            filled ? ember(scan ? 0.4 : 0.1 + (isActive ? this.flash * 0.3 : 0)) : null);
        }
      }
      // the incoming image
      box(-0.45, 1.1, -0.35, 0.45, 1.6, 0.35, white(0.3));
      text("server", 0, 1.85, 0, white(0.45), 11);
      if (this.phase === "download") {
        const b = this.bankX(spare);
        const k = this.t / 0.32;
        const p = [b * k, 1.1 - k * 1.9, 0];
        box(p[0] - 0.1, p[1] - 0.08, p[2] - 0.1, p[0] + 0.1, p[1] + 0.08, p[2] + 0.1, orange(0.9), ember(0.4));
        arrow([0, 1.0, 0], [b * 0.7, -0.4, 0], white(0.15));
      }
      const status = {
        download: `downloading v${this.newVersion.join(".")}: chunk ${this.got}/${this.CHUNKS}`,
        verify: "verifying CRC32...",
        swap: "CRC ok, swapped banks, rebooted",
      }[this.phase];
      text(status, 0, 0.55, 0, this.phase === "swap" ? orange(0.8) : white(0.5), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: 1-Wire. One data line with a pull-up; the master resets the bus,
     the sensors answer with a presence pulse, then commands go out in time
     slots (short low = 1, long low = 0) and the temperature comes back.
     ------------------------------------------------------------------------ */

  const oneWireScene = {
    caption: "1-wire bus",
    pitch: -0.4,
    yaw: -0.2,
    RATE: 12, // waveform time units per second
    SENSORS: [-0.6, 0.9, 2.4],

    init() {
      // build the whole conversation as [level, duration, driven by slave?] segments
      const segs = [];
      const spans = [];
      let t = 0;
      const put = (lvl, dur, slave = false) => {
        segs.push({ t, lvl, dur, slave });
        t += dur;
      };
      const span = (label, from) => spans.push({ label, from, to: t });
      const reset = () => {
        let s = t;
        put(0, 8);
        put(1, 1.5);
        span("RESET", s);
        s = t;
        put(0, 3, true);
        put(1, 3);
        span("PRESENCE", s);
      };
      const byte = (v, label, slave = false) => {
        const s = t;
        for (let b = 0; b < 8; b++) {
          const one = (v >> b) & 1; // LSB first
          put(0, one ? 0.3 : 1.6, slave && !one);
          put(1, one ? 1.7 : 0.4);
        }
        span(label, s);
      };
      reset();
      byte(0xcc, "SKIP ROM 0xCC");
      byte(0x44, "CONVERT 0x44");
      const s = t;
      put(1, 6);
      span("converting...", s);
      reset();
      byte(0xcc, "SKIP ROM 0xCC");
      byte(0xbe, "READ 0xBE");
      byte(0x78, "0x78", true);
      byte(0x01, "0x01", true);
      this.segs = segs;
      this.spans = spans;
      this.total = t;
      this.cursor = 0;
      this.hold = 0;
    },

    level(t) {
      for (const s of this.segs) if (t >= s.t && t < s.t + s.dur) return s;
      return { lvl: 1, slave: false };
    },

    step(dt) {
      if (this.cursor >= this.total) {
        this.hold += dt;
        if (this.hold > 3) this.init();
        return;
      }
      this.cursor = Math.min(this.total, this.cursor + dt * this.RATE);
    },

    draw() {
      const X0 = -3.3, X1 = 3.3, WIRE = -0.35;
      // a scope-style window over the last WIN time units
      const WIN = 48;
      const left = Math.max(0, this.cursor - WIN);
      const X = (t) => X0 + ((t - left) / WIN) * (X1 - X0);
      const now = this.level(Math.min(this.cursor, this.total - 0.01));
      const low = now.lvl === 0 && this.cursor < this.total;
      const slaveTalking = low && now.slave;

      // the single data wire, pulled up to VCC on the left
      ctx.beginPath();
      seg([X0, WIRE, 0], [X1, WIRE, 0]);
      stroke(low ? orange(0.75) : white(0.3), 1.5);
      ctx.beginPath();
      const rx = X0 + 0.2;
      const zig = [[rx, WIRE, 0], [rx, WIRE + 0.15, 0]];
      for (let n = 0; n < 4; n++) zig.push([rx + (n % 2 ? -0.07 : 0.07), WIRE + 0.22 + n * 0.08, 0]);
      zig.push([rx, WIRE + 0.55, 0], [rx, WIRE + 0.7, 0], [rx + 0.4, WIRE + 0.7, 0]);
      zig.forEach((p, n) => (n ? seg(zig[n - 1], p) : null));
      stroke(white(0.2));
      text("VCC", rx + 0.2, WIRE + 0.82, 0, white(0.3), 10);
      text("DQ", X1 + 0.15, WIRE - 0.04, 0, white(0.4), 10, "left");

      // master and three temperature sensors (TO-92 style: body and legs)
      const dev = (x, name, lit) => {
        ctx.beginPath();
        seg([x, WIRE, 0], [x, WIRE - 0.45, 0]);
        stroke(white(0.2));
        box(x - 0.28, WIRE - 0.95, -0.2, x + 0.28, WIRE - 0.45, 0.2, lit ? orange(0.85) : white(0.2), lit ? ember(0.3) : null);
        ctx.beginPath();
        for (const dx of [-0.15, 0, 0.15]) seg([x + dx, WIRE - 0.95, 0], [x + dx, WIRE - 1.25, 0]);
        stroke(white(0.15));
        text(name, x, WIRE - 1.45, 0.2, white(lit ? 0.75 : 0.4), 10);
      };
      dev(-2.4, "MCU", low && !now.slave);
      // every sensor answers the presence pulse; only sensor 1 sends the temperature
      const span = this.spans.find((sp) => this.cursor >= sp.from && this.cursor < sp.to);
      const presence = span && span.label === "PRESENCE";
      this.SENSORS.forEach((x, i) => dev(x, `sensor ${i + 1}`, slaveTalking && (presence || i === 0)));

      // the captured waveform above the bus
      const BASE = 0.75, HIGH = 1.25, Z = -0.6;
      ctx.beginPath();
      let prev = null;
      for (const s of this.segs) {
        if (s.t > this.cursor) break;
        if (s.t + s.dur < left) continue;
        const end = Math.min(this.cursor, s.t + s.dur);
        const y = s.lvl ? HIGH : BASE;
        const a = [X(Math.max(s.t, left)), y, Z], b = [X(end), y, Z];
        if (prev && prev[1] !== y) seg([a[0], prev[1], Z], a);
        seg(a, b);
        prev = b;
      }
      stroke(orange(0.8), 1.3);
      ctx.beginPath();
      seg([X0, BASE, Z], [X1, BASE, Z]);
      stroke(white(0.07));
      text("DQ capture", X0 - 0.15, BASE + 0.15, Z, white(0.35), 10, "right");

      // labels for each part of the conversation
      for (const sp of this.spans) {
        if (sp.from > this.cursor) break;
        if (sp.to < left) continue;
        const mid = (Math.max(sp.from, left) + Math.min(sp.to, this.cursor)) / 2;
        const done = this.cursor >= sp.to;
        text(sp.label, X(mid), HIGH + 0.25, Z, white(done ? 0.4 : 0.75), 10);
      }
      if (this.cursor >= this.total) {
        text("0x0178 = 23.5 °C", 1.6, WIRE + 0.3, 0, orange(0.85), 12);
      }
    },
  };

  function polyline(pts, color, width = 1) {
    ctx.beginPath();
    for (let k = 1; k < pts.length; k++) seg(pts[k - 1], pts[k]);
    stroke(color, width);
  }

  const hex2 = (v) => "0x" + v.toString(16).toUpperCase().padStart(2, "0");

  // standard CRC-8 (poly 0x07, init 0), MSB first
  function crc8(bytes) {
    let crc = 0;
    for (const b of bytes) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }

  /* ------------------------------------------------------------------------
     Scene: CAN bus. Two nodes start sending at once; a 0 (dominant) beats a
     1 on the wire, so the lower ID wins arbitration bit by bit.
     ------------------------------------------------------------------------ */

  const canScene = {
    caption: "can bus",
    pitch: -0.3,
    yaw: -0.2,
    NODES: [["ENGINE", -2.6], ["ABS", -0.9], ["TRACKER", 0.8], ["DASH", 2.5]],

    init() {
      const a = Math.floor(Math.random() * 4);
      let b = a;
      while (b === a) b = Math.floor(Math.random() * 4);
      const ia = Math.floor(rand(0x080, 0x7ff));
      let ib = ia;
      while (ib === ia) ib = Math.floor(rand(0x080, 0x7ff));
      this.tx = [{ n: a, id: ia, lost: -1 }, { n: b, id: ib, lost: -1 }];
      this.busBits = [];
      this.bit = 0;
      this.t = 0;
      this.done = 0;
    },

    bitOf(id, k) {
      return (id >> (10 - k)) & 1;
    },

    step(dt) {
      if (this.done > 0) {
        this.done -= dt;
        if (this.done <= 0) this.init();
        return;
      }
      this.t += dt;
      if (this.t > 0.4) {
        this.t = 0;
        const k = this.bit;
        const alive = this.tx.filter((x) => x.lost < 0);
        const bus = alive.some((x) => this.bitOf(x.id, k) === 0) ? 0 : 1; // wired-AND
        for (const x of alive) if (this.bitOf(x.id, k) !== bus) x.lost = k;
        this.busBits.push(bus);
        this.bit++;
        if (this.bit === 11) this.done = 3.5;
      }
    },

    draw() {
      const X0 = -3.3, X1 = 3.3;
      ctx.beginPath();
      seg([X0, -0.45, 0], [X1, -0.45, 0]);
      seg([X0, -0.6, 0], [X1, -0.6, 0]);
      stroke(white(0.3), 1.5);
      text("CAN_H", X1 + 0.15, -0.48, 0, white(0.35), 10, "left");
      text("CAN_L", X1 + 0.15, -0.66, 0, white(0.35), 10, "left");
      for (const x of [X0, X1]) {
        box(x - 0.08, -0.6, -0.05, x + 0.08, -0.45, 0.05, white(0.3));
        text("120Ω", x, -0.85, 0, white(0.25), 9);
      }

      const sending = this.tx.map((x) => x.n);
      this.NODES.forEach(([name, x], i) => {
        const tx = this.tx.find((t) => t.n === i);
        const active = tx && (tx.lost < 0 || this.done <= 0);
        const lit = tx && tx.lost < 0;
        ctx.beginPath();
        seg([x - 0.1, -0.45, 0], [x - 0.1, -1.1, 0]);
        seg([x + 0.1, -0.6, 0], [x + 0.1, -1.1, 0]);
        stroke(white(0.18));
        box(x - 0.55, -1.75, -0.35, x + 0.55, -1.1, 0.35, lit ? orange(0.75) : white(sending.includes(i) ? 0.3 : 0.18), lit ? ember(0.2) : null);
        text(name, x, -1.48, 0.35, white(active ? 0.7 : 0.4), 10);
      });

      // the two IDs being sent, and what the bus actually carries
      const W = 0.36, BX = -1.6;
      const rows = [
        ...this.tx.map((t) => ({ label: `${this.NODES[t.n][0]} ${hex2(t.id >> 8).slice(0, 2)}${t.id.toString(16).toUpperCase().padStart(3, "0")}`, bits: Array.from({ length: this.bit }, (_, k) => this.bitOf(t.id, k)), lost: t.lost })),
        { label: "bus", bits: this.busBits, lost: -1 },
      ];
      rows.forEach((row, r) => {
        const y = 0.2 + (2 - r) * 0.45;
        text(row.label, BX - 0.2, y + 0.05, 0, white(r === 2 ? 0.55 : 0.45), 10, "right");
        for (let k = 0; k < 11; k++) {
          const x = BX + k * W;
          const has = k < row.bits.length;
          const dead = row.lost >= 0 && k > row.lost;
          const dom = has && row.bits[k] === 0;
          box(x, y, -0.12, x + W - 0.05, y + 0.22, 0.12,
            !has ? white(0.08) : dead ? white(0.12) : k === row.lost ? white(0.6) : orange(dom ? 0.85 : 0.4),
            has && dom && !dead ? ember(0.35) : null);
          if (has && !dead) text(String(row.bits[k]), x + W / 2 - 0.02, y + 0.06, 0.12, white(0.7), 9);
        }
        if (row.lost >= 0) text(`lost arbitration at bit ${row.lost}`, BX + 11 * W + 0.15, y + 0.05, 0, white(0.45), 10, "left");
      });
      if (this.done > 0) {
        const win = this.tx.find((t) => t.lost < 0);
        text(`${this.NODES[win.n][0]} wins (lower ID), sends its frame`, 0, 1.75, 0, orange(0.85), 11);
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: UART frame. One byte at 8N1 plus even parity, drawn big.
     ------------------------------------------------------------------------ */

  const uartScene = {
    caption: "uart frame",
    pitch: -0.3,
    yaw: -0.3,
    TEXT: "BDW",

    init() {
      this.i = 0;
      this.t = -1;
    },

    frame() {
      const c = this.TEXT.charCodeAt(this.i);
      const bits = [0];
      let ones = 0;
      for (let k = 0; k < 8; k++) {
        const b = (c >> k) & 1;
        bits.push(b);
        ones += b;
      }
      bits.push(ones % 2);
      bits.push(1);
      return { c, bits };
    },

    step(dt) {
      this.t += dt * 2;
      if (this.t >= 15) {
        this.t = -1;
        this.i = (this.i + 1) % this.TEXT.length;
      }
    },

    draw() {
      const { c, bits } = this.frame();
      const W = 0.5, X0 = -2.75, LO = -0.6, HI = 0.4;
      const names = ["START", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "PAR", "STOP"];
      const cur = Math.floor(this.t);
      const pts = [[-3.4, HI, 0], [X0, HI, 0]];
      bits.forEach((b, k) => {
        const y = b ? HI : LO;
        pts.push([X0 + k * W, y, 0], [X0 + (k + 1) * W, y, 0]);
      });
      pts.push([X0 + 11 * W, HI, 0], [3.4, HI, 0]);
      polyline(pts, orange(0.75), 1.5);

      bits.forEach((b, k) => {
        const x = X0 + k * W;
        const on = k === cur;
        const done = k < cur || cur >= 11;
        if (on) box(x + 0.02, LO - 0.05, -0.3, x + W - 0.02, HI + 0.05, 0.3, orange(0.6), ember(0.18));
        ctx.beginPath();
        seg([x + W / 2, LO - 0.15, 0], [x + W / 2, HI + 0.15, 0]);
        stroke(white(on ? 0.4 : 0.07));
        text(names[k], x + W / 2, LO - 0.4, 0, white(on ? 0.85 : 0.35), 9);
        if (done || on) text(String(b), x + W / 2, HI + 0.3, 0, white(on ? 0.9 : 0.5), 11);
      });
      text("idle", -3.1, HI + 0.15, 0, white(0.3), 9);
      text("idle", 3.1, HI + 0.15, 0, white(0.3), 9);
      text(`'${String.fromCharCode(c)}' = ${hex2(c)}   LSB first, even parity`, 0, 1.35, 0, white(0.55), 11);
      text("115200 baud: 8.68 µs per bit", 0, -1.4, 0, white(0.3), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: USB enumeration. A device is plugged in, reset, given an address
     and asked to describe itself until a driver can be loaded.
     ------------------------------------------------------------------------ */

  const usbScene = {
    caption: "usb enumeration",
    pitch: -0.35,
    yaw: -0.15,
    MSGS: [
      ["device attached", 0], ["bus reset", 1], ["GET_DESCRIPTOR (device)", 1], ["device descriptor", -1],
      ["SET_ADDRESS 5", 1], ["ACK", -1], ["GET_DESCRIPTOR (config)", 1], ["config descriptor", -1],
      ["SET_CONFIGURATION 1", 1], ["driver loaded", 0],
    ],

    init() {
      this.i = 0;
      this.t = 0;
      this.hold = 0;
    },

    step(dt) {
      if (this.i >= this.MSGS.length) {
        this.hold += dt;
        if (this.hold > 3) this.init();
        return;
      }
      this.t += dt / 1.0;
      if (this.t >= 1) {
        this.t = 0;
        this.i++;
      }
    },

    draw() {
      const HX = -2.4, DX = 2.4, Y = 0.2;
      const msg = this.MSGS[this.i];
      box(HX - 0.7, Y - 0.45, -0.45, HX + 0.7, Y + 0.45, 0.45, white(0.3));
      text("HOST", HX, Y + 0.65, 0, white(0.55), 11);
      const configured = this.i >= this.MSGS.length - 1;
      box(DX - 0.5, Y - 0.3, -0.3, DX + 0.5, Y + 0.3, 0.3, configured ? orange(0.75) : white(this.i > 0 ? 0.35 : 0.2), configured ? ember(0.2) : null);
      text("DEVICE", DX, Y + 0.5, 0, white(0.55), 11);
      text(this.i >= 5 ? "addr 5" : "addr 0", DX, Y - 0.55, 0.3, white(0.35), 10);
      ctx.beginPath();
      seg([HX + 0.7, Y, 0], [DX - 0.5, Y, 0]);
      stroke(white(0.22), 1.5);

      if (msg && msg[1]) {
        const from = msg[1] > 0 ? HX + 0.8 : DX - 0.6;
        const to = msg[1] > 0 ? DX - 0.6 : HX + 0.8;
        const x = from + (to - from) * this.t;
        box(x - 0.1, Y - 0.08, -0.1, x + 0.1, Y + 0.08, 0.1, msg[1] > 0 ? orange(0.9) : white(0.85), ember(0.4));
        text(msg[0], x, Y + 0.3, 0, white(0.8), 10);
      }

      // the log, newest at the bottom
      const shown = this.MSGS.slice(0, Math.min(this.i + 1, this.MSGS.length)).slice(-6);
      shown.forEach(([label, dir], k) => {
        const arrowTxt = dir > 0 ? "host → dev" : dir < 0 ? "dev → host" : "";
        const last = k === shown.length - 1;
        text(`${arrowTxt.padEnd(11)} ${label}`, -1.9, -0.75 - k * 0.24, 0, last ? orange(0.8) : white(0.35), 10, "left");
      });
    },
  };

  /* ------------------------------------------------------------------------
     Scene: interrupt controller. Interrupts arrive at random; a higher
     priority one preempts whatever is running, lower ones wait as pending.
     ------------------------------------------------------------------------ */

  const nvicScene = {
    caption: "interrupts nvic",
    pitch: -0.3,
    yaw: -0.35,
    ROWS: ["thread", "TIM2   prio 3", "USART1 prio 2", "EXTI0  prio 1"],
    WIN: 9,

    init() {
      this.now = 0;
      this.stack = [{ row: 0, rem: Infinity }];
      this.pending = [];
      this.hist = [];
      this.seg = { row: 0, t0: 0 };
      this.next = 0.8;
      this.marks = [];
    },

    switchTo(row) {
      this.hist.push({ row: this.seg.row, t0: this.seg.t0, t1: this.now });
      this.seg = { row, t0: this.now };
    },

    step(dt) {
      this.now += dt;
      const top = this.stack[this.stack.length - 1];
      top.rem -= dt;
      if (top.rem <= 0) {
        this.stack.pop();
        // highest pending above the new top runs next
        const under = this.stack[this.stack.length - 1].row;
        const best = Math.max(-1, ...this.pending);
        if (best > under) {
          this.pending = this.pending.filter((p) => p !== best);
          this.stack.push({ row: best, rem: rand(0.5, 1) });
        }
        this.switchTo(this.stack[this.stack.length - 1].row);
      }
      this.next -= dt;
      if (this.next <= 0) {
        this.next = rand(0.5, 1.6);
        const row = 1 + Math.floor(Math.random() * 3);
        this.marks.push({ row, t: this.now });
        const cur = this.stack[this.stack.length - 1].row;
        if (row > cur) {
          this.stack.push({ row, rem: rand(0.5, 1) });
          this.switchTo(row);
        } else if (row !== cur && !this.pending.includes(row) && !this.stack.some((s) => s.row === row)) {
          this.pending.push(row);
        }
      }
      const keep = this.now - this.WIN;
      this.hist = this.hist.filter((h) => h.t1 > keep);
      this.marks = this.marks.filter((m) => m.t > keep);
    },

    draw() {
      const X0 = -2.4, X1 = 3.0;
      const X = (t) => X0 + ((t - (this.now - this.WIN)) / this.WIN) * (X1 - X0);
      const Y = (r) => -1.3 + r * 0.75;
      this.ROWS.forEach((name, r) => {
        ctx.beginPath();
        seg([X0, Y(r), 0], [X1, Y(r), 0]);
        stroke(white(0.06));
        text(name, X0 - 0.15, Y(r) + 0.02, 0, white(0.45), 10, "right");
      });
      const segs = [...this.hist, { ...this.seg, t1: this.now }];
      segs.forEach((s, k) => {
        const x0 = Math.max(X0, X(s.t0)), x1 = X(s.t1);
        if (x1 <= X0) return;
        box(x0, Y(s.row), -0.15, x1, Y(s.row) + 0.22, 0.15, s.row ? orange(0.75) : white(0.35), s.row ? ember(0.2) : null);
        const prev = segs[k - 1];
        if (prev && X(s.t0) > X0) {
          ctx.beginPath();
          seg([X(s.t0), Y(prev.row), 0], [X(s.t0), Y(s.row), 0]);
          stroke(white(0.25));
        }
      });
      for (const m of this.marks) {
        const x = X(m.t);
        arrow([x, Y(m.row) + 0.55, 0], [x, Y(m.row) + 0.27, 0], white(0.35));
      }
      this.pending.forEach((row) => text("pending", X1 + 0.15, Y(row) + 0.05, 0, orange(0.7), 10, "left"));
      const run = this.stack[this.stack.length - 1].row;
      text(run ? `running ${this.ROWS[run].split(" ")[0]} handler` : "running main thread", 0.3, 1.9, 0, white(0.55), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: circular DMA. The DMA fills a buffer on its own; at half and full
     it raises an interrupt and the CPU processes the half that just filled.
     ------------------------------------------------------------------------ */

  const dmaScene = {
    caption: "dma circular",
    pitch: -0.45,
    yaw: -0.2,
    N: 16,
    W: 0.36,

    init() {
      this.pos = 0;
      this.t = 0;
      this.cells = new Array(this.N).fill(0); // 0 empty, 1 filled, 2 being processed
      this.proc = -1;
      this.procT = 0;
      this.irq = "";
      this.irqT = 0;
    },

    step(dt) {
      this.t += dt;
      if (this.t > 0.3) {
        this.t = 0;
        this.cells[this.pos] = 1;
        this.pos = (this.pos + 1) % this.N;
        if (this.pos === this.N / 2 || this.pos === 0) {
          this.irq = this.pos ? "half transfer IRQ" : "transfer complete IRQ";
          this.irqT = 1.6;
          this.proc = this.pos ? 0 : this.N / 2;
          this.procT = 0;
        }
      }
      if (this.proc >= 0) {
        this.procT += dt;
        const k = Math.floor(this.procT / 0.2);
        for (let i = 0; i < this.N / 2; i++) {
          if (i < k) this.cells[this.proc + i] = 0;
          else if (i === k) this.cells[this.proc + i] = 2;
        }
        if (k >= this.N / 2) this.proc = -1;
      }
      this.irqT = Math.max(0, this.irqT - dt);
    },

    cellX(i) {
      return -2.6 + i * this.W + (i >= this.N / 2 ? 0.25 : 0);
    },

    draw() {
      const W = this.W;
      box(-4.0, -0.3, -0.35, -3.2, 0.3, 0.35, white(0.3));
      text("UART RX", -3.6, 0.5, 0, white(0.5), 10);
      arrow([-3.15, 0, 0], [this.cellX(0) - 0.1, 0, 0], white(0.2));
      this.cells.forEach((c, i) => {
        const x = this.cellX(i);
        const h = c ? 0.32 : 0.06;
        box(x, -0.15, -0.3, x + W - 0.05, -0.15 + h, 0.3, c === 2 ? white(0.9) : c ? orange(0.7) : white(0.15), c === 1 ? ember(0.15) : c === 2 ? white(0.25) : null);
      });
      text("first half", this.cellX(3) + W, -0.55, 0.3, white(0.35), 10);
      text("second half", this.cellX(11) + W, -0.55, 0.3, white(0.35), 10);
      const px = this.cellX(this.pos) + W / 2;
      arrow([px, 1.0, 0], [px, 0.3, 0], orange(0.8));
      text("DMA", px, 1.15, 0, orange(0.8), 11);
      if (this.proc >= 0) {
        const cx = this.cellX(this.proc + Math.min(this.N / 2 - 1, Math.floor(this.procT / 0.2))) + W / 2;
        arrow([cx, -1.25, 0.3], [cx, -0.75, 0.3], white(0.7));
        text("CPU processing", cx, -1.45, 0.3, white(0.6), 10);
      }
      if (this.irqT > 0) text(this.irq, 0.3, 1.6, 0, orange(Math.min(1, this.irqT)), 12);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: CPU cache. Reads go through a small cache; hits are instant,
     misses pull the line in from flash and evict the least recently used.
     ------------------------------------------------------------------------ */

  const cacheScene = {
    caption: "cpu cache",
    pitch: -0.35,
    yaw: -0.3,
    LINES: 12,

    init() {
      this.slots = [null, null, null, null];
      this.age = [0, 0, 0, 0];
      this.slotFlash = [0, 0, 0, 0];
      this.memFlash = new Array(this.LINES).fill(0);
      this.t = 0;
      this.hits = 0;
      this.misses = 0;
      this.addr = 3;
      this.flight = null;
      this.result = "";
    },

    step(dt) {
      this.slotFlash = this.slotFlash.map((f) => Math.max(0, f - dt * 2));
      this.memFlash = this.memFlash.map((f) => Math.max(0, f - dt * 2));
      if (this.flight) {
        this.flight.t += dt / 0.7;
        if (this.flight.t >= 1) {
          this.slots[this.flight.slot] = this.flight.line;
          this.slotFlash[this.flight.slot] = 1;
          this.flight = null;
        }
        return;
      }
      this.t += dt;
      if (this.t < 0.8) return;
      this.t = 0;
      // mostly nearby addresses (locality), sometimes a jump
      this.addr = Math.random() < 0.75
        ? Math.max(0, Math.min(this.LINES - 1, this.addr + Math.floor(rand(-1, 2))))
        : Math.floor(Math.random() * this.LINES);
      this.age = this.age.map((a) => a + 1);
      const hit = this.slots.indexOf(this.addr);
      if (hit >= 0) {
        this.hits++;
        this.age[hit] = 0;
        this.slotFlash[hit] = 1;
        this.result = "hit";
      } else {
        this.misses++;
        const free = this.slots.indexOf(null);
        const slot = free >= 0 ? free : this.age.indexOf(Math.max(...this.age));
        this.age[slot] = 0;
        this.slots[slot] = null;
        this.memFlash[this.addr] = 1;
        this.flight = { line: this.addr, slot, t: 0 };
        this.result = "miss";
      }
    },

    memY(i) {
      return 1.65 - i * 0.28;
    },

    slotY(s) {
      return 0.8 - s * 0.55;
    },

    draw() {
      const MX = -2.0, CX = 0.9;
      for (let i = 0; i < this.LINES; i++) {
        const y = this.memY(i), f = this.memFlash[i];
        box(MX - 0.6, y - 0.11, -0.25, MX + 0.6, y + 0.11, 0.25, f > 0.05 ? orange(0.5 + f * 0.4) : white(0.18), f > 0.05 ? ember(0.25 * f) : null);
        text((0x08000000 + i * 32).toString(16).toUpperCase().padStart(8, "0"), MX - 0.75, y - 0.04, 0, white(0.3), 9, "right");
      }
      text("flash", MX, 2.0, 0, white(0.5), 11);
      this.slots.forEach((line, s) => {
        const y = this.slotY(s), f = this.slotFlash[s];
        box(CX - 0.6, y - 0.18, -0.3, CX + 0.6, y + 0.18, 0.3, line === null ? white(0.15) : orange(0.45 + f * 0.5), line === null ? null : ember(0.08 + f * 0.3));
        if (line !== null) text("line " + line, CX, y - 0.05, 0.3, white(0.5 + f * 0.4), 10);
      });
      text("cache", CX, 1.25, 0, white(0.5), 11);
      box(2.6, -0.2, -0.4, 3.4, 0.4, 0.4, white(0.3));
      text("CPU", 3.0, 0.6, 0, white(0.5), 11);
      arrow([2.55, 0.1, 0], [CX + 0.7, 0.1, 0], white(0.2));
      if (this.flight) {
        const a = [MX + 0.6, this.memY(this.flight.line), 0], b = [CX - 0.6, this.slotY(this.flight.slot), 0];
        const p = a.map((v, k) => v + (b[k] - v) * this.flight.t);
        box(p[0] - 0.15, p[1] - 0.08, -0.12, p[0] + 0.15, p[1] + 0.08, 0.12, orange(0.9), ember(0.4));
      }
      text(`read line ${this.addr}: ${this.result}`, 0.9, -1.5, 0, this.result === "hit" ? orange(0.8) : white(0.6), 11);
      const total = this.hits + this.misses;
      text(`hit rate ${total ? Math.round((this.hits / total) * 100) : 0}%`, 0.9, -1.8, 0, white(0.35), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: low power. The MCU sleeps almost all the time and wakes briefly
     on an RTC alarm, so the average current stays tiny.
     ------------------------------------------------------------------------ */

  const powerScene = {
    caption: "low power",
    pitch: -0.3,
    yaw: -0.35,
    PERIOD: 2.5,
    AWAKE: 0.3,
    WIN: 10,

    init() {
      this.t = rand(0, 5);
    },

    step(dt) {
      this.t += dt;
    },

    awake(t) {
      return ((t % this.PERIOD) + this.PERIOD) % this.PERIOD < this.AWAKE;
    },

    draw() {
      const X0 = -3.0, X1 = 2.6, LO = -1.0, HI = 0.6, Z = 0;
      const X = (t) => X0 + ((t - (this.t - this.WIN)) / this.WIN) * (X1 - X0);
      const pts = [];
      for (let k = 0; k <= 500; k++) {
        const t = this.t - this.WIN + (k / 500) * this.WIN;
        pts.push([X(t), this.awake(t) ? HI : LO + 0.05, Z]);
      }
      polyline(pts, orange(0.8), 1.3);
      ctx.beginPath();
      seg([X0, LO, Z], [X1, LO, Z]);
      stroke(white(0.1));

      // state strip and wake markers
      const first = Math.ceil((this.t - this.WIN) / this.PERIOD) * this.PERIOD;
      for (let w = first; w <= this.t; w += this.PERIOD) {
        const x0 = X(w), x1 = X(Math.min(this.t, w + this.AWAKE));
        box(x0, LO - 0.45, -0.3, x1, LO - 0.25, 0.3, orange(0.7), ember(0.3));
        arrow([x0, HI + 0.55, Z], [x0, HI + 0.15, Z], white(0.3));
        text("RTC", x0, HI + 0.7, Z, white(0.3), 9);
      }
      ctx.beginPath();
      poly([[X0, LO - 0.45, -0.3], [X1, LO - 0.45, -0.3], [X1, LO - 0.45, 0.3], [X0, LO - 0.45, 0.3]]);
      stroke(white(0.12));

      text("12 mA", X0 - 0.15, HI - 0.03, Z, white(0.4), 10, "right");
      text("4 µA", X0 - 0.15, LO + 0.02, Z, white(0.4), 10, "right");
      text("RUN / STOP", X0 - 0.15, LO - 0.38, 0, white(0.35), 10, "right");
      const on = this.awake(this.t);
      text(on ? "awake: read sensor, send, back to sleep" : "STOP mode", X1 + 0.2, on ? HI : LO + 0.05, Z, on ? orange(0.85) : white(0.45), 10, "left");
      const avg = 12 * (this.AWAKE / this.PERIOD) + 0.004 * (1 - this.AWAKE / this.PERIOD);
      text(`average ${avg.toFixed(2)} mA`, 0, 1.75, 0, white(0.5), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: clock tree. The crystal is multiplied up by the PLL, then divided
     down for the buses and peripherals; faster clocks pulse faster.
     ------------------------------------------------------------------------ */

  const clockScene = {
    caption: "clock tree",
    pitch: -0.3,
    yaw: -0.25,
    NODES: {
      HSE: ["HSE 8 MHz", -3.0, 0.0, 8],
      PLL: ["PLL ×21", -1.7, 0.0, 168],
      SYS: ["SYSCLK 168 MHz", -0.3, 0.0, 168],
      CPU: ["CPU 168 MHz", 1.3, 1.1, 168],
      APB2: ["APB2 /2 84 MHz", 1.3, 0.0, 84],
      APB1: ["APB1 /4 42 MHz", 1.3, -1.1, 42],
      SPI: ["SPI1", 2.9, 0.35, 84],
      USART: ["USART1", 2.9, -0.35, 84],
      I2C: ["I2C1", 2.9, -0.8, 42],
      TIM: ["TIM2", 2.9, -1.4, 42],
    },
    EDGES: [["HSE", "PLL"], ["PLL", "SYS"], ["SYS", "CPU"], ["SYS", "APB2"], ["SYS", "APB1"], ["APB2", "SPI"], ["APB2", "USART"], ["APB1", "I2C"], ["APB1", "TIM"]],

    init() {
      this.t = 0;
    },

    step(dt) {
      this.t += dt;
    },

    draw() {
      for (const [a, b] of this.EDGES) {
        const [, ax, ay] = this.NODES[a], [, bx, by, f] = this.NODES[b];
        const from = [ax + 0.5, ay, 0], to = [bx - 0.5, by, 0];
        ctx.beginPath();
        seg(from, to);
        stroke(white(0.15));
        // pulses: more of them, moving faster, on faster clocks
        const src = this.NODES[a][3];
        const n = Math.max(1, Math.round(src / 21));
        for (let k = 0; k < n; k++) {
          const u = (this.t * (0.15 + src / 400) + k / n) % 1;
          const p = from.map((v, i) => v + (to[i] - v) * u);
          box(p[0] - 0.04, p[1] - 0.04, -0.04, p[0] + 0.04, p[1] + 0.04, 0.04, orange(0.85));
        }
        void f;
      }
      for (const [, [label, x, y, f]] of Object.entries(this.NODES)) {
        const leaf = label.length < 7;
        const w = leaf ? 0.4 : 0.5;
        box(x - w, y - 0.17, -0.2, x + w, y + 0.17, 0.2, orange(0.25 + (f / 168) * 0.5), ember(0.05 + (f / 168) * 0.15));
        text(label, x, y + 0.3, 0, white(0.55), 10);
      }
    },
  };

  /* ------------------------------------------------------------------------
     Scene: debouncing. A real button bounces for a few ms on every edge;
     the firmware only accepts a change once the input has been stable.
     ------------------------------------------------------------------------ */

  const debounceScene = {
    caption: "debouncing",
    pitch: -0.35,
    yaw: -0.35,

    init() {
      this.t = rand(0, 10);
    },

    step(dt) {
      this.t += dt * 0.8;
    },

    ideal(t) {
      return ((t % 4) + 4) % 4 < 1.6 ? 1 : 0;
    },

    raw(t) {
      const ph = ((t % 4) + 4) % 4;
      const since = ph < 1.6 ? ph : ph - 1.6;
      const id = this.ideal(t);
      if (since < 0.3) {
        const k = Math.floor(since / 0.025) + Math.floor((t - since) * 7);
        if (Math.sin(k * 12.9898) > 0.1) return 1 - id;
      }
      return id;
    },

    draw() {
      const X0 = -3.0, X1 = 2.8, SPAN = 6;
      const X = (t) => X0 + ((t - (this.t - SPAN)) / SPAN) * (X1 - X0);
      const lanes = [["button (raw)", -0.6, (t) => this.raw(t), white(0.6)], ["debounced", 0.6, (t) => this.ideal(t - 0.4), orange(0.85)]];
      for (const [label, z, fn, color] of lanes) {
        const pts = [];
        let prev = null;
        for (let k = 0; k <= 700; k++) {
          const t = this.t - SPAN + (k / 700) * SPAN;
          const y = fn(t) ? 0.4 : -0.6;
          if (prev !== null && prev !== y) pts.push([X(t), prev, z]);
          pts.push([X(t), y, z]);
          prev = y;
        }
        polyline(pts, color, 1.3);
        ctx.beginPath();
        seg([X0, -0.6, z], [X1, -0.6, z]);
        stroke(white(0.07));
        text(label, X0 - 0.15, -0.3, z, white(0.45), 10, "right");
      }
      text("bounce", X1 + 0.2, 0.4, -0.6, white(0.3), 9, "left");
      text("accept a change only after 20 ms stable", 0, 1.3, 0, white(0.45), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: GPS fix. Satellites lock on one by one; with four or more the
     receiver gets a position, and the error circle shrinks as more join.
     ------------------------------------------------------------------------ */

  const gpsScene = {
    caption: "gps fix",
    pitch: -0.4,
    yaw: 0,

    init() {
      this.sats = Array.from({ length: 9 }, () => ({ az: rand(0, Math.PI * 2), el: rand(0.35, 1.25), lockAt: rand(0.6, 9), locked: false, flash: 0 }));
      this.t = 0;
      this.spin = Math.random() * 6;
      this.hold = 0;
      this.r = 1.9;
    },

    step(dt) {
      this.t += dt;
      this.spin += dt * 0.05;
      for (const s of this.sats) {
        if (!s.locked && this.t >= s.lockAt) {
          s.locked = true;
          s.flash = 1;
        }
        s.flash = Math.max(0, s.flash - dt * 1.5);
      }
      const n = this.sats.filter((s) => s.locked).length;
      const target = n < 4 ? 1.9 : 0.15 + 5 / (n * n);
      this.r = ease(this.r, target, dt, 2);
      if (n === this.sats.length) {
        this.hold += dt;
        if (this.hold > 4) this.init();
      }
    },

    draw() {
      const G = -1.2, R = 3.0;
      const ring = (r, y) => Array.from({ length: 48 }, (_, k) => [Math.cos((k / 48) * Math.PI * 2) * r, y, Math.sin((k / 48) * Math.PI * 2) * r]);
      ctx.beginPath();
      poly(ring(R, G));
      stroke(white(0.08));
      box(-0.25, G, -0.18, 0.25, G + 0.2, 0.18, orange(0.7), ember(0.2));
      text("receiver", 0, G - 0.25, 0.18, white(0.45), 10);

      const n = this.sats.filter((s) => s.locked).length;
      ctx.beginPath();
      poly(ring(this.r, G));
      if (n >= 4) fill(ember(0.12));
      stroke(n >= 4 ? orange(0.6) : white(0.25));

      for (const s of this.sats) {
        const a = s.az + this.spin;
        const p = [Math.cos(s.el) * Math.cos(a) * R, G + Math.sin(s.el) * R * 0.9, Math.cos(s.el) * Math.sin(a) * R];
        if (s.locked) {
          ctx.beginPath();
          seg(p, [0, G + 0.2, 0]);
          stroke(orange(0.18 + s.flash * 0.5));
        }
        box(p[0] - 0.08, p[1] - 0.08, p[2] - 0.08, p[0] + 0.08, p[1] + 0.08, p[2] + 0.08, s.locked ? orange(0.8) : white(0.3), s.locked ? ember(0.3) : null);
        ctx.beginPath();
        seg([p[0] - 0.35, p[1], p[2]], [p[0] - 0.1, p[1], p[2]]);
        seg([p[0] + 0.1, p[1], p[2]], [p[0] + 0.35, p[1], p[2]]);
        stroke(s.locked ? orange(0.5) : white(0.2));
      }
      const status = n < 4 ? `searching: ${n} satellites` : `3D fix: ${n} satellites, HDOP ${(6 / n).toFixed(1)}`;
      text(status, 0, G - 0.6, 0, n < 4 ? white(0.55) : orange(0.85), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: cellular modem. AT commands bring it up step by step until it is
     attached to the network and can send data to the tower.
     ------------------------------------------------------------------------ */

  const modemScene = {
    caption: "modem attach",
    pitch: -0.3,
    yaw: -0.25,
    STEPS: [["AT", "OK"], ["AT+CPIN?", "+CPIN: READY"], ["AT+CSQ", "+CSQ: 21,99"], ["AT+CREG?", "+CREG: 0,1"], ["AT+CGATT=1", "OK"], ["AT+CIPSEND", "SEND OK"]],

    init() {
      this.i = 0;
      this.t = 0;
      this.hold = 0;
    },

    step(dt) {
      if (this.i >= this.STEPS.length) {
        this.hold += dt;
        if (this.hold > 3.5) this.init();
        return;
      }
      this.t += dt / 1.6;
      if (this.t >= 1) {
        this.t = 0;
        this.i++;
      }
      this.wave = (this.wave || 0) + dt;
    },

    draw() {
      const MX = -0.6, MY = -1.0, TX = 2.6, TY = -1.6;
      box(MX - 0.5, MY - 0.15, -0.35, MX + 0.5, MY + 0.15, 0.35, orange(0.55), ember(0.1));
      text("modem", MX, MY - 0.4, 0.35, white(0.5), 10);
      ctx.beginPath();
      seg([MX + 0.35, MY + 0.15, 0], [MX + 0.35, MY + 0.7, 0]);
      stroke(white(0.35));

      // signal bars
      const bars = this.i >= 3 ? 4 : this.i >= 2 ? 3 : this.i >= 1 ? 1 : 0;
      for (let b = 0; b < 4; b++) {
        const x = MX + 0.6 + b * 0.13;
        box(x, MY + 0.2, -0.04, x + 0.08, MY + 0.3 + b * 0.1, 0.04, b < bars ? orange(0.8) : white(0.15));
      }

      // the tower: a lattice mast
      const H = 2.6;
      ctx.beginPath();
      const leg = (sx, sz) => seg([TX + sx * 0.4, TY, sz * 0.4], [TX + sx * 0.06, TY + H, sz * 0.06]);
      leg(-1, -1);
      leg(1, -1);
      leg(1, 1);
      leg(-1, 1);
      for (let k = 1; k < 6; k++) {
        const f = k / 6, w = 0.4 - (0.34 * f), y = TY + H * f;
        poly([[TX - w, y, -w], [TX + w, y, -w], [TX + w, y, w], [TX - w, y, w]]);
      }
      stroke(white(0.25));
      const attached = this.i >= 5;
      if (attached) {
        for (let k = 0; k < 3; k++) {
          const r = ((this.wave * 0.8 + k / 3) % 1) * 0.9;
          const arc = Array.from({ length: 12 }, (_, j) => {
            const a = -0.9 + (j / 11) * 1.8;
            return [TX - Math.cos(a) * r, TY + H + Math.sin(a) * r, 0];
          });
          polyline(arc, orange(0.6 * (1 - r / 0.9)));
        }
      }
      if (this.i === 5) {
        const from = [MX + 0.35, MY + 0.7, 0], to = [TX, TY + H - 0.2, 0];
        const p = from.map((v, k) => v + (to[k] - v) * this.t);
        box(p[0] - 0.08, p[1] - 0.08, -0.08, p[0] + 0.08, p[1] + 0.08, 0.08, orange(0.9), ember(0.4));
      }

      // the AT log
      const lines = [];
      this.STEPS.slice(0, this.i + 1).forEach(([cmd, resp], k) => {
        lines.push([cmd, white(0.6)]);
        if (k < this.i || this.t > 0.55) lines.push([resp, orange(0.75)]);
      });
      lines.slice(-10).forEach(([s, color], k) => text(s, -3.4, 1.7 - k * 0.24, 0, color, 10, "left"));
    },
  };

  /* ------------------------------------------------------------------------
     Scene: geofence. A vehicle drives around; the tracker checks whether its
     position is inside the zone and raises an alert when it crosses over.
     ------------------------------------------------------------------------ */

  const fenceScene = {
    caption: "geofence",
    pitch: -0.75,
    yaw: 0.2,
    FENCE: [[-1.6, -1.1], [0.9, -1.4], [1.9, 0.1], [0.6, 1.3], [-1.5, 0.9]],
    G: -0.6,

    init() {
      this.t = rand(0, 20);
      this.trail = [];
      this.inside = null;
      this.alert = "";
      this.alertT = 0;
      this.drop = 0;
    },

    pos(t) {
      return [Math.sin(t * 0.31) * 3.0, Math.sin(t * 0.53 + 1) * 1.9];
    },

    inPoly(x, z) {
      let inside = false;
      const f = this.FENCE;
      for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
        const [xi, zi] = f[i], [xj, zj] = f[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    },

    step(dt) {
      this.t += dt * 0.9;
      this.drop += dt;
      const [x, z] = this.pos(this.t);
      if (this.drop > 0.12) {
        this.drop = 0;
        this.trail.push([x, z]);
        if (this.trail.length > 90) this.trail.shift();
      }
      const now = this.inPoly(x, z);
      if (this.inside !== null && now !== this.inside) {
        this.alert = now ? "ENTER zone" : "EXIT zone";
        this.alertT = 2.5;
      }
      this.inside = now;
      this.alertT = Math.max(0, this.alertT - dt);
    },

    draw() {
      const G = this.G;
      ctx.beginPath();
      for (let k = -3; k <= 3; k++) {
        seg([k, G, -2.2], [k, G, 2.2]);
        if (Math.abs(k) <= 2) seg([-3.3, G, k], [3.3, G, k]);
      }
      stroke(white(0.05));
      const low = this.FENCE.map(([x, z]) => [x, G, z]);
      const high = this.FENCE.map(([x, z]) => [x, G + 0.35, z]);
      ctx.beginPath();
      poly(low);
      if (this.inside) fill(ember(0.12));
      ctx.beginPath();
      poly(low);
      poly(high);
      low.forEach((p, k) => seg(p, high[k]));
      stroke(this.inside ? orange(0.6) : white(0.3));
      polyline(this.trail.map(([x, z]) => [x, G + 0.02, z]), orange(0.35));
      const [x, z] = this.pos(this.t);
      box(x - 0.12, G, z - 0.12, x + 0.12, G + 0.2, z + 0.12, orange(0.9), ember(0.4));
      if (this.alertT > 0) text(this.alert, x, G + 0.55, z, orange(Math.min(1, this.alertT)), 12);
      text(this.inside ? "inside geofence" : "outside geofence", 0, G, 2.7, white(0.5), 11);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: CRC-8. The message is shifted bit by bit through a register with
     feedback taps (x^8 + x^2 + x + 1); what is left is the checksum.
     ------------------------------------------------------------------------ */

  const crcScene = {
    caption: "crc-8",
    pitch: -0.35,
    yaw: -0.25,
    MSG: [0x42, 0x44, 0x57],
    W: 0.5,

    init() {
      this.bits = [];
      for (const b of this.MSG) for (let k = 7; k >= 0; k--) this.bits.push((b >> k) & 1);
      this.k = 0;
      this.crc = 0;
      this.t = 0;
      this.hold = 0;
      this.flash = 0;
      this.fb = 0;
    },

    step(dt) {
      this.flash = Math.max(0, this.flash - dt * 3);
      if (this.k >= this.bits.length) {
        this.hold += dt;
        if (this.hold > 3.5) this.init();
        return;
      }
      this.t += dt;
      if (this.t > 0.3) {
        this.t = 0;
        const bit = this.bits[this.k++];
        this.fb = ((this.crc >> 7) & 1) ^ bit;
        this.crc = (this.crc << 1) & 0xff;
        if (this.fb) this.crc ^= 0x07;
        this.flash = 1;
      }
    },

    cellX(i) {
      return -1.6 + i * this.W; // i = 0 is bit 7
    },

    xor(x, y, color) {
      const ringPts = Array.from({ length: 12 }, (_, k) => [x + Math.cos((k / 12) * Math.PI * 2) * 0.11, y + Math.sin((k / 12) * Math.PI * 2) * 0.11, 0]);
      ctx.beginPath();
      poly(ringPts);
      seg([x - 0.11, y, 0], [x + 0.11, y, 0]);
      seg([x, y - 0.11, 0], [x, y + 0.11, 0]);
      stroke(color);
    },

    draw() {
      const W = this.W, Y = -0.2;
      for (let i = 0; i < 8; i++) {
        const b = (this.crc >> (7 - i)) & 1;
        const x = this.cellX(i);
        box(x, Y - 0.2, -0.2, x + W - 0.08, Y + 0.2, 0.2, b ? orange(0.75 + this.flash * 0.2) : white(0.2), b ? ember(0.2) : null);
        text(String(b), x + (W - 0.08) / 2, Y - 0.04, 0.2, white(b ? 0.85 : 0.4), 11);
        text(`b${7 - i}`, x + (W - 0.08) / 2, Y - 0.45, 0.2, white(0.25), 9);
      }
      // feedback: out of b7, XOR with input, back in at the taps
      const fbY = Y + 0.75, inX = this.cellX(0) - 0.45, endX = this.cellX(7) + W + 0.2;
      const lit = this.flash > 0.1 && this.fb ? orange(0.8) : white(0.3);
      this.xor(inX, Y, lit);
      ctx.beginPath();
      seg([this.cellX(0), Y, 0], [inX + 0.11, Y, 0]);
      seg([inX, Y + 0.11, 0], [inX, fbY, 0]);
      seg([inX, fbY, 0], [endX, fbY, 0]);
      seg([endX, fbY, 0], [endX, Y, 0]);
      seg([endX, Y, 0], [this.cellX(7) + W - 0.08, Y, 0]);
      for (const tap of [5, 6]) {
        const tx = this.cellX(tap) + W - 0.04;
        seg([tx, fbY, 0], [tx, Y + 0.11, 0]);
      }
      stroke(lit);
      for (const tap of [5, 6]) this.xor(this.cellX(tap) + W - 0.04, Y, lit);

      // input stream
      const rest = this.bits.slice(this.k, this.k + 10);
      rest.forEach((b, j) => text(String(b), inX - 0.35 - j * 0.22, Y - 0.04, 0, white(j ? 0.3 : 0.8), 11, "center"));
      text("message 'BDW' in", inX - 1.2, Y - 0.45, 0, white(0.35), 10);
      text("x⁸ + x² + x + 1", 0.4, fbY + 0.3, 0, white(0.4), 10);
      const done = this.k >= this.bits.length;
      text(done ? `CRC-8('BDW') = ${hex2(this.crc)}` : `bit ${this.k}/${this.bits.length}`, 0.4, -1.3, 0, done ? orange(0.85) : white(0.45), 12);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: wear levelling. Flash blocks wear out after so many erases, so
     every write goes to the least worn free block and the wear stays even.
     ------------------------------------------------------------------------ */

  const wearScene = {
    caption: "wear levelling",
    pitch: -0.7,
    yaw: 0.35,
    ROWS: 4,
    COLS: 8,

    init() {
      this.erase = Array.from({ length: this.ROWS * this.COLS }, () => Math.floor(rand(0, 2)));
      this.flash = new Array(this.ROWS * this.COLS).fill(0);
      this.t = 0;
      this.writes = 0;
    },

    step(dt) {
      this.flash = this.flash.map((f) => Math.max(0, f - dt * 1.5));
      this.t += dt;
      if (this.t > 0.22) {
        this.t = 0;
        const min = Math.min(...this.erase);
        const cands = this.erase.map((e, i) => (e === min ? i : -1)).filter((i) => i >= 0);
        const i = cands[Math.floor(Math.random() * cands.length)];
        this.erase[i]++;
        this.flash[i] = 1;
        this.writes++;
        if (Math.max(...this.erase) >= 14) this.init();
      }
    },

    draw() {
      const S = 0.62;
      this.erase.forEach((e, i) => {
        const r = Math.floor(i / this.COLS), c = i % this.COLS;
        const x = -2.3 + c * S, z = -1.0 + r * S;
        const h = 0.06 + e * 0.1, f = this.flash[i];
        box(x, -0.9, z, x + S - 0.12, -0.9 + h, z + S - 0.12, orange(0.35 + f * 0.6), ember(0.05 + f * 0.3));
      });
      const min = Math.min(...this.erase), max = Math.max(...this.erase);
      text(`erase count  min ${min}  max ${max}`, 0, -0.9, 1.8, white(0.55), 11);
      text(`${this.writes} writes spread across 32 blocks`, 0, -0.9, 2.15, white(0.35), 10);
    },
  };

  /* ------------------------------------------------------------------------
     Scene: packet framing. A payload gets a sync byte and length in front
     and a CRC behind, then goes out over the radio.
     ------------------------------------------------------------------------ */

  const framingScene = {
    caption: "packet framing",
    pitch: -0.35,
    yaw: -0.25,
    W: 0.55,

    init() {
      const n = 3 + Math.floor(Math.random() * 3);
      this.payload = Array.from({ length: n }, () => Math.floor(rand(0, 255)));
      this.t = 0;
    },

    step(dt) {
      this.t += dt;
      if (this.t > 7) this.init();
    },

    draw() {
      const W = this.W, t = this.t;
      const bytes = [
        { v: 0xaa, kind: "sync", appear: 1.2, from: -2.5 },
        { v: this.payload.length, kind: "len", appear: 1.2, from: -2.5 },
        ...this.payload.map((v, k) => ({ v, kind: "payload", appear: k * 0.2, from: 0 })),
        { v: crc8(this.payload), kind: "crc", appear: 2.4, from: 2.5 },
      ];
      const x0 = -((bytes.length - 1) * W) / 2 - 0.5;
      bytes.forEach((b, k) => {
        const local = t - b.appear;
        if (local < 0) return;
        const settle = Math.min(1, local / 0.6);
        let x = x0 + k * W + b.from * (1 - settle * settle * (3 - 2 * settle));
        let y = -0.3, a = 1;
        const send = t - (3.6 + k * 0.25); // transmit one byte after another
        if (send > 0) {
          x += send * 3.5;
          y += send * 0.6;
          a = Math.max(0, 1 - send * 0.9);
        }
        if (a <= 0) return;
        const color = b.kind === "payload" ? orange(0.75 * a) : b.kind === "crc" ? white(0.8 * a) : white(0.5 * a);
        box(x, y, -0.22, x + W - 0.08, y + 0.32, 0.22, color, b.kind === "payload" ? ember(0.15 * a) : null);
        text(hex2(b.v).slice(2), x + (W - 0.08) / 2, y + 0.1, 0.22, white(0.8 * a), 10);
      });
      if (t < 3.6) {
        const n = bytes.length;
        const label = (from, to, s, show) => show && text(s, x0 + ((from + to + 1) / 2) * W - 0.04, -0.75, 0.22, white(0.4), 10);
        label(0, 1, "sync + len", t > 1.6);
        label(2, n - 2, "payload", true);
        label(n - 1, n - 1, "crc", t > 2.8);
      }
      // antenna
      const AX = 3.0;
      ctx.beginPath();
      seg([AX, -0.6, 0], [AX, 1.0, 0]);
      seg([AX, 1.0, 0], [AX - 0.25, 1.3, 0]);
      seg([AX, 1.0, 0], [AX + 0.25, 1.3, 0]);
      stroke(white(0.35));
      text("radio", AX, -0.85, 0, white(0.4), 10);
      const phase = t < 1.2 ? "payload ready" : t < 2.4 ? "add sync byte + length" : t < 3.6 ? "append CRC-8" : "transmitting";
      text(phase, 0, 1.45, 0, white(0.55), 11);
    },
  };

  const SCENES = [
    ringScene, mcuScene, schedScene, memmapScene, stackScene, bootScene, fsmScene, pwmScene, heapScene,
    spiScene, i2cScene, oneWireScene, wdtScene, mutexScene, adcScene, pipeScene, otaScene,
    canScene, uartScene, usbScene, nvicScene, dmaScene, cacheScene, powerScene, clockScene,
    debounceScene, gpsScene, modemScene, fenceScene, crcScene, wearScene, framingScene,
  ];

  // every visit gets its own order, so repeat visitors see different diagrams first
  for (let i = SCENES.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [SCENES[i], SCENES[j]] = [SCENES[j], SCENES[i]];
  }
  const SCENE_SECONDS = 22;
  const FADE_SECONDS = 0.9;

  /* ------------------------------------------------------------------------
     Renderer: camera, scene cycling and cross-fades
     ------------------------------------------------------------------------ */

  const renderer = {
    canvas: document.getElementById("canvas"),
    w: 0,
    h: 0,
    index: 0,
    time: 0,
    mouseX: 0,
    mouseY: 0,
    camX: 0,
    camY: 0,
  };

  function resize() {
    const r = renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.w = window.innerWidth;
    r.h = window.innerHeight;
    r.canvas.width = Math.floor(r.w * dpr);
    r.canvas.height = Math.floor(r.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureSlot();
  }

  // narrow home page: the free space between the hero text and the end of the
  // first screen, so the scene is not hidden behind the text or the next section
  function measureSlot() {
    const r = renderer;
    r.slot = null;
    const hero = document.querySelector(".hero");
    const copy = document.querySelector(".hero-copy");
    if (!hero || !copy) return;
    const top = copy.getBoundingClientRect().bottom + window.scrollY;
    const bottom = Math.min(hero.getBoundingClientRect().bottom + window.scrollY, r.h);
    if (bottom - top >= 140) r.slot = [top, bottom];
  }

  // jump to a scene (from the arrow buttons); it fades in and gets a full turn
  function goTo(i) {
    const r = renderer;
    r.index = (i + SCENES.length) % SCENES.length;
    SCENES[r.index].init();
    r.time = reducedMotion ? FADE_SECONDS : 0;
    if (reducedMotion) renderFrame(0);
  }

  // arrow buttons + name under the scene, home page only
  function buildSceneNav() {
    const r = renderer;
    const nav = document.createElement("div");
    nav.className = "scene-nav";
    nav.hidden = true;
    nav.innerHTML =
      '<button type="button" aria-label="Previous diagram">&#8249;</button>' +
      '<span class="scene-name"></span>' +
      '<button type="button" aria-label="Next diagram">&#8250;</button>';
    document.body.appendChild(nav);
    const [prev, next] = nav.querySelectorAll("button");
    prev.addEventListener("click", () => goTo(r.index - 1));
    next.addEventListener("click", () => goTo(r.index + 1));
    r.nav = nav;
    r.navName = nav.querySelector(".scene-name");
  }

  function renderFrame(dt) {
    const r = renderer;

    // move on to the next scene once this one has had its turn
    r.time += dt;
    if (r.time >= SCENE_SECONDS) {
      r.time = 0;
      r.index = (r.index + 1) % SCENES.length;
      SCENES[r.index].init();
    }
    const scene = SCENES[r.index];
    scene.step(dt);

    // ease the camera toward the mouse for a little parallax
    r.camX = ease(r.camX, r.mouseX, dt, 2);
    r.camY = ease(r.camY, r.mouseY, dt, 2);
    const yaw = scene.yaw + r.camX * 0.25;
    const pitch = scene.pitch - r.camY * 0.1;
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cP = Math.cos(pitch), sP = Math.sin(pitch);

    // on the home page the scene sits in the empty right half of the hero
    const wide = r.w > 1000 && r.home;
    const slot = !wide && r.home ? r.slot : null; // narrow home: below the hero text
    const cx = wide ? r.w * 0.73 : r.w * 0.5;
    const cy = slot ? (slot[0] + slot[1]) / 2 - 8 : r.h * (wide ? 0.52 : r.home ? 0.8 : 0.5);
    const f = slot
      ? Math.min(r.w * 0.8, (slot[1] - slot[0]) * 0.88)
      : Math.min(r.w * (wide ? 0.42 : 0.7), r.h * 1.05);

    // remember where the scene sits so the scroll fade and dot grid can follow it
    if (cx !== r.cx || cy !== r.cy || f !== r.f) {
      r.cx = cx;
      r.cy = cy;
      r.f = f;
      if (r.fade) r.fade();
    }

    P = (x, y, z) => {
      const x1 = x * cY - z * sY;
      const z1 = x * sY + z * cY;
      const y2 = y * cP - z1 * sP;
      const z2 = y * sP + z1 * cP + 9;
      return [cx + (x1 * f) / z2, cy - (y2 * f) / z2];
    };

    ctx.clearRect(0, 0, r.w, r.h);
    ctx.globalAlpha = Math.min(1, r.time / FADE_SECONDS, (SCENE_SECONDS - r.time) / FADE_SECONDS);
    scene.draw();

    ctx.globalAlpha = 1;

    // name under the scene: arrow controls on the wide home page, plain text elsewhere
    const navOn = r.nav && wide && r.shown > 0.5;
    if (r.nav) {
      r.nav.hidden = !navOn;
      if (navOn) {
        r.nav.style.left = cx + "px";
        r.nav.style.top = cy + f * 0.5 + "px";
        const label = scene.caption;
        if (r.navName.textContent !== label) r.navName.textContent = label;
      }
    }
    if (!navOn) {
      ctx.font = "12px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = white(0.3);
      ctx.fillText(scene.caption, cx, cy + f * 0.5);
    }
  }

  /* ------------------------------------------------------------------------
     Main loop
     ------------------------------------------------------------------------ */

  function startRenderer() {
    const r = renderer;
    if (!r.canvas) return;
    ctx = r.canvas.getContext("2d");
    r.home = !!document.querySelector(".hero");
    r.time = FADE_SECONDS; // first scene starts fully visible
    SCENES[r.index].init();
    r.dots = document.querySelector(".ambient-home");
    if (r.home) buildSceneNav();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("load", measureSlot); // text height settles once fonts are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureSlot);

    // keep the scene in the background: full strength behind the home hero,
    // fading out as you scroll into content (and dimmer on content pages)
    const base = r.home ? 1 : 0.55;
    const after = r.home ? document.querySelector(".hero").nextElementSibling : null;
    const fade = () => {
      if (!after || r.f === undefined) {
        const k = Math.min(1, window.scrollY / window.innerHeight);
        r.shown = 1 - 0.65 * k;
      } else {
        // home page: fade right out as the next section slides over the scene
        const edge = after.getBoundingClientRect().top;
        r.shown = Math.max(0, Math.min(1, (edge - (r.cy - r.f * 0.05)) / (r.f * 0.5)));
      }
      r.canvas.style.opacity = (base * r.shown).toFixed(3);
      // keep the dot grid clear of the scene, closing the gap as the scene fades
      if (r.dots && r.f !== undefined) {
        r.dots.style.setProperty("--scene-x", r.cx + "px");
        r.dots.style.setProperty("--scene-y", r.cy + "px");
        r.dots.style.setProperty("--scene-r0", r.f * 0.42 * r.shown + "px");
        r.dots.style.setProperty("--scene-r1", r.f * 0.8 * r.shown + "px");
      }
    };
    r.fade = fade;
    r.shown = 1;
    fade();
    window.addEventListener("scroll", fade, { passive: true });

    window.addEventListener("pointermove", (e) => {
      r.mouseX = e.clientX / window.innerWidth - 0.5;
      r.mouseY = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    if (reducedMotion) {
      renderFrame(0);
      return;
    }

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(100, now - last) / 1000;
      last = now;
      renderFrame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------------
     Page bits: nav, footer, reveal
     ------------------------------------------------------------------------ */

  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.getElementById("navMenu");
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", String(open));
      navMenu.classList.toggle("open", open);
    });
  }

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  startRenderer();
})();
