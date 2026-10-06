import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as PawPrint } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CTcIlUI6.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var WORLD_W = 1460;
var WORLD_H = 2400;
var FLOOR_Y = 2160;
var MARGIN = 110;
var PERCH_W = 500;
var LEFT_X = MARGIN;
var RIGHT_X = 830;
var RISE = 165;
var COUNT = 9;
var PW = 42;
var PH = 34;
var MAX_RUN = 500;
var JUMP_V = -920;
var GRAV_UP = 2300;
var GRAV_APEX = 1100;
var GRAV_FALL = 4800;
var APEX = 150;
var CUT = .42;
var COYOTE = .072;
var BUFFER = .1;
var STEP = 1 / 60;
var LEFT_STAND = .058;
var RIGHT_STAND = .069;
function buildPlatforms() {
	const list = [{
		x: 0,
		y: FLOOR_Y,
		w: WORLD_W,
		solid: true,
		kind: "floor",
		side: "left"
	}];
	for (let i = 0; i < COUNT; i++) {
		const side = i % 2 === 0 ? "left" : "right";
		list.push({
			x: side === "left" ? LEFT_X : RIGHT_X,
			y: 2008 - i * RISE,
			w: PERCH_W,
			solid: false,
			kind: "tree",
			side
		});
	}
	return list;
}
var PLATFORMS = buildPlatforms();
var SUMMIT = PLATFORMS[PLATFORMS.length - 1];
function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(/* @__PURE__ */ new Error(`failed to load ${src}`));
		img.src = src;
	});
}
function makePlayer() {
	return {
		x: 182,
		y: 1974,
		w: PW,
		h: PH,
		vx: 0,
		vy: 0,
		facing: 1,
		grounded: true,
		onSolid: true,
		coyote: COYOTE,
		jumpBuffer: 0,
		drop: 0,
		airLo: -48,
		airHi: 48,
		anim: "idle",
		frame: 0,
		frameT: 0,
		jumpT: 1,
		squash: 0
	};
}
async function startAtrium(canvas, onPhase) {
	const [idle, run, jump, perchL, perchR, sushiImg, bgLower, bgMid, bgUpper] = await Promise.all([
		Promise.all([
			1,
			2,
			3,
			4
		].map((n) => loadImage(`/game/olive-idle-${n}.png`))),
		Promise.all([
			1,
			2,
			3,
			4,
			5,
			6
		].map((n) => loadImage(`/game/olive-run-${n}.png`))),
		Promise.all([
			1,
			2,
			3,
			4
		].map((n) => loadImage(`/game/olive-jump-${n}.png`))),
		loadImage("/game/perch-left.png"),
		loadImage("/game/perch-right.png"),
		loadImage("/game/sushi.png"),
		loadImage("/game/bg-lower.jpg"),
		loadImage("/game/bg-mid.jpg"),
		loadImage("/game/bg-upper.jpg")
	]);
	const sheets = {
		idle,
		run,
		jump
	};
	const real = /* @__PURE__ */ new Set();
	const injected = /* @__PURE__ */ new Set();
	let phase = "title";
	let player = makePlayer();
	let camX = 0;
	let camY = 0;
	let acc = 0;
	let last = performance.now();
	let raf = 0;
	let wasJump = false;
	let wasDown = false;
	let time = 0;
	let shake = 0;
	const puffs = [];
	let audio = null;
	const mineX = () => player.x;
	const held = (code) => real.has(code) || injected.has(code);
	function setPhase(next) {
		phase = next;
		onPhase(next);
	}
	function tone(freq, dur, type, gain = .05) {
		if (!audio) return;
		const o = audio.createOscillator();
		const g = audio.createGain();
		o.type = type;
		o.frequency.value = freq;
		g.gain.value = gain;
		g.gain.exponentialRampToValueAtTime(1e-4, audio.currentTime + dur);
		o.connect(g);
		g.connect(audio.destination);
		o.start();
		o.stop(audio.currentTime + dur);
	}
	function unlock() {
		if (!audio) audio = new AudioContext();
		if (audio.state === "suspended") audio.resume();
	}
	function burst(x, y, n, gold = false) {
		for (let i = 0; i < n; i++) puffs.push({
			x,
			y,
			life: .4 + Math.random() * .28,
			vx: (Math.random() - .5) * 180,
			vy: -30 - Math.random() * 140,
			r: 2.5 + Math.random() * 3.5,
			gold
		});
	}
	function reset() {
		player = makePlayer();
		puffs.length = 0;
		wasJump = false;
		wasDown = false;
		shake = 0;
		setPhase("play");
	}
	function begin() {
		unlock();
		if (phase === "title") setPhase("play");
	}
	function step(dt) {
		time += dt;
		const playing = phase === "play";
		const left = playing && (held("ArrowLeft") || held("KeyA"));
		const right = playing && (held("ArrowRight") || held("KeyD"));
		const jumpNow = playing && (held("Space") || held("KeyW") || held("ArrowUp") || held("KeyZ"));
		const downNow = playing && (held("KeyS") || held("ArrowDown"));
		if (!playing) {
			player.vx = 0;
			player.vy = 0;
			player.grounded = true;
		} else {
			let dir = 0;
			if (left) dir -= 1;
			if (right) dir += 1;
			if (player.grounded) {
				if (dir !== 0) {
					const accel = Math.abs(player.vx) < MAX_RUN * .4 ? 1600 : 620;
					player.vx += dir * accel * dt;
					player.facing = dir;
				} else {
					const fr = 2800 * dt;
					if (Math.abs(player.vx) <= fr) player.vx = 0;
					else player.vx -= Math.sign(player.vx) * fr;
				}
				player.vx = Math.max(-500, Math.min(MAX_RUN, player.vx));
			} else {
				if (dir !== 0) {
					player.vx += dir * 520 * dt;
					player.facing = dir;
				}
				player.vx = Math.max(player.airLo, Math.min(player.airHi, player.vx));
			}
			player.x += player.vx * dt;
			if (player.x < 8) {
				player.x = 8;
				player.vx = 0;
			}
			if (player.x + player.w > 1452) {
				player.x = 1452 - player.w;
				player.vx = 0;
			}
			if (jumpNow && !wasJump) player.jumpBuffer = BUFFER;
			else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
			if (!jumpNow && wasJump && player.vy < 0) player.vy *= CUT;
			const canJump = player.grounded || player.coyote > 0;
			if (player.jumpBuffer > 0 && canJump && player.drop <= 0) {
				const spd = player.vx;
				const extra = 40;
				const brake = 120;
				player.vy = JUMP_V;
				player.airLo = spd >= 0 ? spd - brake : spd - extra;
				player.airHi = spd >= 0 ? spd + extra : spd + brake;
				if (Math.abs(spd) < 90) {
					player.airLo = Math.min(player.airLo, -56);
					player.airHi = Math.max(player.airHi, 56);
				}
				player.grounded = false;
				player.coyote = 0;
				player.jumpBuffer = 0;
				player.jumpT = 0;
				player.squash = .16;
				tone(540, .07, "triangle", .035);
			}
			if (downNow && !wasDown && player.grounded && !player.onSolid) {
				player.drop = .16;
				player.y += 8;
				player.vy = 40;
				player.grounded = false;
				player.coyote = 0;
			}
			const grav = player.vy < -150 ? GRAV_UP : Math.abs(player.vy) < APEX ? GRAV_APEX : GRAV_FALL;
			player.vy = Math.min(1280, player.vy + grav * dt);
			const prevBottom = player.y + player.h;
			player.y += player.vy * dt;
			let landed = null;
			if (player.drop > 0) player.drop -= dt;
			else if (player.vy >= 0) for (const p of PLATFORMS) {
				if (!(player.x + player.w > p.x + 8 && player.x < p.x + p.w - 8)) continue;
				if (prevBottom <= p.y + 5 && player.y + player.h >= p.y && player.y + player.h <= p.y + 28) {
					if (!landed || p.y < landed.y) landed = p;
				}
			}
			if (landed) {
				const impact = player.vy;
				player.y = landed.y - player.h;
				player.vy = 0;
				if (!player.grounded && impact > 420) {
					player.squash = -.14;
					shake = Math.min(5, impact / 340);
					burst(player.x + player.w / 2, landed.y, 4, true);
					tone(160, .04, "sine", .025);
				}
				player.grounded = true;
				player.onSolid = landed.solid;
				player.coyote = COYOTE;
			} else {
				player.grounded = false;
				player.onSolid = false;
				player.coyote -= dt;
			}
			if (player.y > 2440) {
				player.x = 182;
				player.y = 1974;
				player.vx = 0;
				player.vy = 0;
			}
			const sx = SUMMIT.x + SUMMIT.w * .72;
			const sy = SUMMIT.y - 54;
			const dx = sx - (player.x + player.w / 2);
			const dy = sy - (player.y + player.h * .35);
			if (dx * dx + dy * dy < 3364) {
				setPhase("won");
				burst(sx, sy, 18, true);
				tone(620, .1, "triangle", .045);
				tone(830, .16, "sine", .035);
			}
		}
		player.jumpT += dt;
		if (!player.grounded && playing) {
			player.anim = "jump";
			if (player.jumpT < .06) player.frame = 0;
			else if (player.vy < -300) player.frame = 1;
			else if (player.vy < 160) player.frame = 2;
			else player.frame = 3;
		} else if (Math.abs(player.vx) > 36) {
			if (player.anim !== "run") {
				player.anim = "run";
				player.frameT = 0;
			}
			player.frameT += dt;
			const rate = .055 + (1 - Math.min(1, Math.abs(player.vx) / MAX_RUN)) * .04;
			if (player.frameT > rate) {
				player.frameT = 0;
				player.frame = (player.frame + 1) % run.length;
			}
		} else {
			if (player.anim !== "idle") {
				player.anim = "idle";
				player.frame = 0;
				player.frameT = 0;
			}
			player.frameT += dt;
			if (player.frameT > .2) {
				player.frameT = 0;
				player.frame = (player.frame + 1) % idle.length;
			}
		}
		player.squash += (0 - player.squash) * Math.min(1, dt * 12);
		for (let i = puffs.length - 1; i >= 0; i--) {
			const puff = puffs[i];
			puff.life -= dt;
			puff.x += puff.vx * dt;
			puff.y += puff.vy * dt;
			puff.vy += 280 * dt;
			if (puff.life <= 0) puffs.splice(i, 1);
		}
		if (shake > 0) shake = Math.max(0, shake - dt * 16);
		wasJump = jumpNow;
		wasDown = downNow;
		const focusX = player.x + player.w / 2 + player.facing * 170;
		const focusY = player.y - 30;
		const { viewW, viewH } = viewSize();
		const destX = Math.max(0, Math.min(WORLD_W - viewW, focusX - viewW * .4));
		const destY = Math.max(0, Math.min(WORLD_H - viewH, focusY - viewH * .58));
		const k = 1 - Math.exp(-dt * 6.5);
		camX += (destX - camX) * k;
		camY += (destY - camY) * k;
	}
	function viewSize() {
		const cssW = Math.max(1, canvas.clientWidth);
		const cssH = Math.max(1, canvas.clientHeight);
		const viewW = Math.min(WORLD_W, Math.max(800, cssW * .8));
		return {
			viewW,
			viewH: cssH * (viewW / cssW),
			cssW,
			cssH
		};
	}
	function drawBand(ctx, img, destY, destH, focus) {
		let srcH = destH / (WORLD_W / img.width);
		if (srcH > img.height) srcH = img.height;
		const maxY = img.height - srcH;
		const srcY = Math.max(0, Math.min(maxY, maxY * focus));
		ctx.drawImage(img, 0, srcY, img.width, srcH, 0, destY, WORLD_W, destH);
	}
	function drawPosts(ctx, side) {
		const perches = PLATFORMS.filter((p) => p.kind === "tree" && p.side === side);
		const top = Math.min(...perches.map((p) => p.y)) - 28;
		const x0 = side === "left" ? LEFT_X : RIGHT_X;
		const honey = side === "left";
		for (const t of [
			.2,
			.5,
			.8
		]) {
			const w = t === .5 ? 28 : 18;
			const x = x0 + PERCH_W * t - w / 2;
			const y = top;
			const h = FLOOR_Y - top + 8;
			const grad = ctx.createLinearGradient(x, y, x + w, y);
			if (honey) {
				grad.addColorStop(0, "#f3d7a2");
				grad.addColorStop(.45, "#d3924a");
				grad.addColorStop(1, "#8d5524");
			} else {
				grad.addColorStop(0, "#a86448");
				grad.addColorStop(.5, "#6a3828");
				grad.addColorStop(1, "#3c2018");
			}
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, 8);
			ctx.fill();
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y, w, h);
			ctx.clip();
			ctx.strokeStyle = honey ? "rgba(120, 72, 28, 0.28)" : "rgba(255, 196, 140, 0.16)";
			ctx.lineWidth = 1.4;
			for (let yy = y + 8; yy < y + h; yy += 16) {
				ctx.beginPath();
				ctx.moveTo(x - 2, yy);
				ctx.lineTo(x + w + 2, yy + 9);
				ctx.stroke();
			}
			ctx.restore();
			ctx.fillStyle = honey ? "rgba(255, 236, 200, 0.35)" : "rgba(255, 210, 170, 0.18)";
			ctx.fillRect(x + 3, y + 6, 3, h - 14);
		}
		const baseW = PERCH_W * .72;
		const bx = x0 + 70;
		const g = ctx.createLinearGradient(bx, 2142, bx, 2182);
		g.addColorStop(0, honey ? "#e7c48a" : "#7a4634");
		g.addColorStop(1, honey ? "#8a5428" : "#3a2018");
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.roundRect(bx, 2144, baseW, 36, 10);
		ctx.fill();
	}
	function draw() {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const { viewW, viewH, cssW, cssH } = viewSize();
		const bw = Math.round(cssW * dpr);
		const bh = Math.round(cssH * dpr);
		if (canvas.width !== bw || canvas.height !== bh) {
			canvas.width = bw;
			canvas.height = bh;
		}
		ctx.setTransform(bw / viewW, 0, 0, bh / viewH, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		const jx = (Math.random() - .5) * shake;
		const jy = (Math.random() - .5) * shake;
		const ox = Math.round(camX + jx);
		const oy = Math.round(camY + jy);
		ctx.save();
		ctx.translate(-ox, -oy);
		const band = FLOOR_Y / 3;
		drawBand(ctx, bgUpper, 0, 722, .2);
		drawBand(ctx, bgMid, band, 722, .45);
		drawBand(ctx, bgLower, band * 2, 722, .28);
		const sky = ctx.createLinearGradient(WORLD_W * .5, 0, WORLD_W * .5, FLOOR_Y);
		sky.addColorStop(0, "rgba(255, 196, 120, 0.05)");
		sky.addColorStop(.5, "rgba(16, 48, 36, 0)");
		sky.addColorStop(1, "rgba(12, 28, 22, 0.12)");
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, WORLD_W, FLOOR_Y);
		drawPosts(ctx, "left");
		drawPosts(ctx, "right");
		const marble = ctx.createLinearGradient(0, FLOOR_Y, 0, WORLD_H);
		marble.addColorStop(0, "#f4e6c8");
		marble.addColorStop(.35, "#e7d3aa");
		marble.addColorStop(1, "#b88958");
		ctx.fillStyle = marble;
		ctx.fillRect(0, FLOOR_Y, WORLD_W, 240);
		ctx.strokeStyle = "rgba(90, 140, 110, 0.25)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 2206);
		ctx.bezierCurveTo(280, 2180, 640, 2240, WORLD_W, 2196);
		ctx.stroke();
		ctx.fillStyle = "#e2b15a";
		ctx.fillRect(0, FLOOR_Y, WORLD_W, 8);
		ctx.fillStyle = "#8d3148";
		ctx.fillRect(0, 2168, WORLD_W, 3);
		for (const p of PLATFORMS) {
			if (p.kind !== "tree") continue;
			const img = p.side === "left" ? perchL : perchR;
			const stand = p.side === "left" ? LEFT_STAND : RIGHT_STAND;
			const dw = p.w * 1.04;
			const dh = p.side === "left" ? 118 : 108;
			const dx = p.x + p.w / 2 - dw / 2;
			const dy = p.y - dh * stand;
			ctx.drawImage(img, dx, dy, dw, dh);
		}
		const sx = SUMMIT.x + SUMMIT.w * .72;
		const sy = SUMMIT.y - 56 + Math.sin(time * 2.4) * 6;
		ctx.save();
		ctx.translate(sx, sy);
		ctx.rotate(Math.sin(time * 1.6) * .05);
		const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 54);
		glow.addColorStop(0, "rgba(255, 186, 96, 0.55)");
		glow.addColorStop(1, "rgba(255, 186, 96, 0)");
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(0, 0, 54, 0, Math.PI * 2);
		ctx.fill();
		const sw = 78;
		ctx.drawImage(sushiImg, -39, -32.76, sw, sw * .84);
		ctx.restore();
		for (const puff of puffs) {
			ctx.globalAlpha = Math.max(0, puff.life * 2.1);
			ctx.fillStyle = puff.gold ? "#f0c36a" : "#f7edd9";
			ctx.beginPath();
			ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
		}
		const frame = sheets[player.anim][player.frame % sheets[player.anim].length];
		const dw = 150;
		const dh = 150;
		const feetX = player.x + player.w / 2;
		const feetY = player.y + player.h;
		const syScale = 1 + player.squash;
		ctx.save();
		ctx.translate(feetX, feetY);
		ctx.scale(player.facing * (2 - syScale), syScale);
		if (player.grounded) {
			ctx.fillStyle = "rgba(28, 24, 16, 0.22)";
			ctx.beginPath();
			ctx.ellipse(0, 3, 26, 7, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.drawImage(frame, -75, -145, dw, dh);
		ctx.restore();
		ctx.restore();
		const sun = ctx.createRadialGradient(viewW * .5, viewH * .02, 10, viewW * .5, viewH * .22, viewH * .75);
		sun.addColorStop(0, "rgba(255, 214, 150, 0.2)");
		sun.addColorStop(.45, "rgba(255, 196, 120, 0.05)");
		sun.addColorStop(1, "rgba(255, 196, 120, 0)");
		ctx.fillStyle = sun;
		ctx.fillRect(0, 0, viewW, viewH);
	}
	function frameLoop(now) {
		const delta = Math.min(.05, (now - last) / 1e3);
		last = now;
		acc += delta;
		let guard = 0;
		while (acc >= STEP && guard < 5) {
			step(STEP);
			acc -= STEP;
			guard++;
		}
		draw();
		window.__controlsTest = probe;
		raf = requestAnimationFrame(frameLoop);
	}
	const onKeyDown = (e) => {
		if ([
			"Space",
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight"
		].includes(e.code)) e.preventDefault();
		real.add(e.code);
		if (phase === "title" && !e.repeat) begin();
	};
	const onKeyUp = (e) => {
		real.delete(e.code);
	};
	const onBlur = () => {
		real.clear();
	};
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("blur", onBlur);
	const probe = {
		getX: mineX,
		getY: () => player.y,
		getBottom: () => player.y + player.h,
		getGrounded: () => player.grounded,
		getYaw: () => player.facing,
		getSpeed: () => Math.abs(player.vx),
		setKeys: (codes) => {
			injected.clear();
			for (const c of codes) injected.add(c);
			if (phase === "title" && codes.length) begin();
		},
		getPhase: () => phase
	};
	window.__controlsTest = probe;
	const { viewW, viewH } = viewSize();
	camX = Math.max(0, Math.min(WORLD_W - viewW, player.x - viewW * .28));
	camY = Math.max(0, Math.min(WORLD_H - viewH, player.y - viewH * .62));
	onPhase("title");
	raf = requestAnimationFrame(frameLoop);
	return {
		destroy() {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
			if (window.__controlsTest === probe) delete window.__controlsTest;
		},
		setKey(code, down) {
			if (down) {
				real.add(code);
				if (phase === "title") begin();
			} else real.delete(code);
		},
		start: begin,
		reset
	};
}
var HOLD = [
	{
		label: "Left",
		code: "ArrowLeft"
	},
	{
		label: "Right",
		code: "ArrowRight"
	},
	{
		label: "Drop",
		code: "ArrowDown"
	},
	{
		label: "Jump",
		code: "Space"
	}
];
function AtriumGame() {
	const canvasRef = (0, import_react.useRef)(null);
	const engineRef = (0, import_react.useRef)(null);
	const [phase, setPhase] = (0, import_react.useState)("title");
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let dead = false;
		startAtrium(canvas, (next) => {
			if (!dead) setPhase(next);
		}).then((engine) => {
			if (dead) {
				engine.destroy();
				return;
			}
			engineRef.current = engine;
			setReady(true);
		});
		return () => {
			dead = true;
			engineRef.current?.destroy();
			engineRef.current = null;
		};
	}, []);
	const press = (code, down) => {
		engineRef.current?.setKey(code, down);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative h-dvh w-full overflow-hidden bg-bg text-surface",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
				ref: canvasRef,
				className: "absolute inset-0 h-full w-full touch-none"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl bg-ink/80 px-4 py-2.5 shadow-lg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-lg leading-none font-bold tracking-tight text-surface sm:text-2xl",
						children: "The Cat Castle"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-surface/75",
						children: "Atrium · two climbing trees"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-full bg-ink/80 px-3 py-1.5 text-sm font-bold text-surface",
					children: "Run to the lip"
				})]
			}),
			phase !== "play" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-full max-w-md rounded-2xl bg-surface px-6 py-5 text-ink shadow-lg",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3 flex items-center gap-2 text-velvet",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PawPrint, {
								className: "size-5",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-extrabold tracking-wide uppercase",
								children: phase === "won" ? "Treat found" : "The crossing"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "font-display text-3xl leading-tight font-bold",
							children: phase === "won" ? "Olive has the salmon." : "Leap from tree to tree."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-base leading-relaxed text-muted",
							children: phase === "won" ? "The crown perch was a real jump, not a hop. The rest of the castle is still above this room." : "Get a full run along the cushion, then jump at the inner lip. Leave early, or from a standstill, and the gap between the trees takes you."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "mt-5 w-full rounded-xl bg-copper px-4 py-3 text-base font-extrabold text-surface",
							onClick: () => phase === "won" ? engineRef.current?.reset() : engineRef.current?.start(),
							disabled: !ready,
							children: phase === "won" ? "Climb again" : ready ? "Begin the climb" : "Waking the atrium…"
						})
					]
				})
			}),
			phase === "play" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex gap-2",
					children: HOLD.slice(0, 3).map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "h-14 min-w-14 rounded-2xl bg-surface/95 px-3 text-sm font-extrabold text-ink",
						onPointerDown: (e) => {
							e.preventDefault();
							press(b.code, true);
						},
						onPointerUp: () => press(b.code, false),
						onPointerCancel: () => press(b.code, false),
						onPointerLeave: () => press(b.code, false),
						children: b.label
					}, b.code))
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "h-16 min-w-20 rounded-2xl bg-copper px-4 text-base font-extrabold text-surface",
					onPointerDown: (e) => {
						e.preventDefault();
						press("Space", true);
					},
					onPointerUp: () => press("Space", false),
					onPointerCancel: () => press("Space", false),
					onPointerLeave: () => press("Space", false),
					children: "Jump"
				})]
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "h-dvh w-full overflow-hidden bg-bg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AtriumGame, {})
	});
}
//#endregion
export { Home as component };
