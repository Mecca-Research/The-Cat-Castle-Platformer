import { sparkle } from "./scene.ts";

type Kind = "puff" | "ring" | "streak" | "spark" | "heart" | "fibre";

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spin: number;
};

const TAU = Math.PI * 2;

/** Short-lived effects in world space: dust, wind, glints and hearts. */
export class Fx {
  private list: Particle[] = [];

  private add(p: Omit<Particle, "max">) {
    if (this.list.length > 400) this.list.shift();
    this.list.push({ ...p, max: p.life });
  }

  /** Soft dust kicked up from a cushion or the floor. */
  dust(x: number, y: number, n: number, spread: number, dir = 0, color = "#efe3cc") {
    for (let i = 0; i < n; i++) {
      const a = Math.random();
      this.add({
        kind: "puff",
        x: x + (Math.random() - 0.5) * spread * 0.3,
        y: y - 2,
        vx: (Math.random() - 0.5) * spread * 4 + dir * 60 * Math.random(),
        vy: -10 - Math.random() * 40,
        life: 0.35 + a * 0.35,
        size: 3 + Math.random() * 5,
        color,
        spin: 0,
      });
    }
  }

  /** A flat ring on the cushion, for a hard landing. */
  ring(x: number, y: number, size: number) {
    this.add({ kind: "ring", x, y, vx: 0, vy: 0, life: 0.32, size, color: "#fff2d8", spin: 0 });
  }

  /** A fleck of velvet or sisal shaken loose. */
  fibres(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: "fibre",
        x: x + (Math.random() - 0.5) * 30,
        y: y - 2,
        vx: (Math.random() - 0.5) * 120,
        vy: -60 - Math.random() * 80,
        life: 0.6 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 1.5,
        color,
        spin: Math.random() * TAU,
      });
    }
  }

  /** Air rushing past during a glide. */
  streak(x: number, y: number, vx: number, vy: number) {
    this.add({
      kind: "streak",
      x,
      y,
      vx: -vx * 18,
      vy: -vy * 14 - 10,
      life: 0.28 + Math.random() * 0.12,
      size: 14 + Math.random() * 18,
      color: "#fff7e4",
      spin: 0,
    });
  }

  sparkles(x: number, y: number, n: number, radius = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 180;
      this.add({
        kind: "spark",
        x: x + Math.cos(a) * radius * Math.random(),
        y: y + Math.sin(a) * radius * Math.random(),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0.6 + Math.random() * 0.7,
        size: 2.5 + Math.random() * 4,
        color: "#fff2c4",
        spin: 0,
      });
    }
  }

  hearts(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: "heart",
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: (Math.random() - 0.5) * 30,
        vy: -40 - Math.random() * 40,
        life: 1.4 + Math.random() * 0.8,
        size: 5 + Math.random() * 4,
        color: Math.random() < 0.5 ? "#ff7d95" : "#ffb3c1",
        spin: Math.random() * TAU,
      });
    }
  }

  clear() {
    this.list.length = 0;
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      switch (p.kind) {
        case "puff":
          p.vx *= 1 - dt * 4;
          p.vy *= 1 - dt * 3;
          p.vy -= 8 * dt;
          break;
        case "fibre":
          p.vy += 320 * dt;
          p.vx *= 1 - dt * 2;
          p.spin += dt * 9;
          break;
        case "spark":
          p.vx *= 1 - dt * 2.5;
          p.vy *= 1 - dt * 2.5;
          p.vy += 40 * dt;
          break;
        case "heart":
          p.vx += Math.sin(p.life * 5 + p.spin) * 30 * dt;
          break;
      }
    }
  }

  /** Dust, rings and wind go behind Olive. */
  drawBack(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const q = p.life / p.max;
      if (p.kind === "puff") {
        const r = p.size * (1.6 - q * 0.6);
        g.globalAlpha = q * 0.55;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, TAU);
        g.fill();
      } else if (p.kind === "ring") {
        const r = p.size * (1.15 - q);
        g.globalAlpha = q * 0.7;
        g.strokeStyle = p.color;
        g.lineWidth = 2.2 * q + 0.4;
        g.beginPath();
        g.ellipse(p.x, p.y, r * 2.6, r * 0.55, 0, 0, TAU);
        g.stroke();
      } else if (p.kind === "streak") {
        g.globalAlpha = q * 0.5;
        g.strokeStyle = p.color;
        g.lineWidth = 1.2;
        const l = Math.hypot(p.vx, p.vy) || 1;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - (p.vx / l) * p.size * q, p.y - (p.vy / l) * p.size * q);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /** Glints, fibres and hearts go in front. */
  drawFront(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const q = p.life / p.max;
      if (p.kind === "spark") {
        g.globalAlpha = Math.min(1, q * 1.6);
        sparkle(g, p.x, p.y, p.size * (0.4 + q * 0.6));
      } else if (p.kind === "fibre") {
        g.globalAlpha = Math.min(1, q * 2);
        g.strokeStyle = p.color;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p.x - Math.cos(p.spin) * p.size, p.y - Math.sin(p.spin) * p.size);
        g.lineTo(p.x + Math.cos(p.spin) * p.size, p.y + Math.sin(p.spin) * p.size);
        g.stroke();
      } else if (p.kind === "heart") {
        g.globalAlpha = Math.min(1, q * 2);
        heart(g, p.x, p.y, p.size, p.color);
      }
    }
    g.globalAlpha = 1;
  }
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.4, y, x - s * 0.8, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.8, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
  g.fill();
  g.fillStyle = "rgba(255, 255, 255, 0.5)";
  g.beginPath();
  g.ellipse(x - s * 0.45, y - s * 0.35, s * 0.2, s * 0.12, -0.6, 0, TAU);
  g.fill();
}
