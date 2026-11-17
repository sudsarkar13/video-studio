// Turns captured scenes + narration into the finished demo video.
//
//   node compose.mjs --storyboard FILE --capture DIR --narration DIR --out FILE.mp4 [--scene ID[,ID]] [--music FILE]
//
// Steps: (1) time map per scene (narration length sets the scene length; marked waits are sped up),
// (2) render every output frame in compositor.html with headless Chromium, piped into ffmpeg,
// (3) mix narration, the voice agent's own replies, the inventor's mic clips and optional music
// (ducked under speech), (4) write an .srt of the narration beside the video.
import { FFMPEG, PY as DEFAULT_PY, browser as pickBrowser, loadPlaywright } from "./lib/paths.mjs";
const { chromium } = loadPlaywright();
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true)]] : acc), []),
);
for (const k of ["storyboard", "capture", "narration", "out"]) if (!args[k]) throw new Error(`--${k} is required`);

const board = JSON.parse(fs.readFileSync(args.storyboard, "utf8"));
const storyDir = path.dirname(path.resolve(args.storyboard));
const timings = JSON.parse(fs.readFileSync(path.join(args.narration, "timings.json"), "utf8")).scenes;
// --layout vertical (or storyboard.layout) renders 9:16 for phones from the same 16:9 recordings.
// "phone": a 9:16 recording made with storyboard.device.mobile, shown in a phone body.
const LAYOUT = args.layout || board.layout || "horizontal";
const PHONE = LAYOUT === "phone";
const VERTICAL = LAYOUT === "vertical" || PHONE;
// "iphone": a mobile recording inside a static iPhone body with iOS status bar and Safari bar; no camera
// moves, zooms, labels or captions, so the app itself is the whole show.
const IPHONE = LAYOUT === "iphone";
const MOBILE_REC = !!(board.device && board.device.mobile);
const OUT = VERTICAL || IPHONE ? { width: 1080, height: 1920, fps: (board.output || {}).fps || 30 } : board.output || { width: 1920, height: 1080, fps: 30 };
const FPS = OUT.fps;
// The screenshot's size inside the compositor's app frame. Horizontal: it fills a 1680 px frame.
// Vertical: it fills a 1000 x 1084 frame by height and is wider than the frame, so the camera pans.
const VP = board.viewport || { width: 1600, height: 900 };
const SHOT_W = IPHONE ? 1080 : VERTICAL ? Math.round(((PHONE ? 1300 : 1084) * VP.width) / VP.height) : 1680;
const SHOT_H = IPHONE ? Math.round((1080 * VP.height) / VP.width) : PHONE ? 1300 : VERTICAL ? 1084 : 945;
const FRAME_W = PHONE || IPHONE ? SHOT_W : VERTICAL ? 1000 : 1680;
const VIEW_W = SHOT_W;
// storyboard.pacing tunes the rhythm; short cuts (60 s) use a smaller lead/tail and a faster ramp.
const PACE = { lead: 0.5, tail: 0.8, rampSpeed: 6, endCard: 3, minScene: 3, ...(board.pacing || {}) };
const RAMP = PACE.rampSpeed; // speed inside ramp-start .. ramp-end
const LEAD = PACE.lead; // seconds of picture before the narration starts
const TAIL = PACE.tail; // seconds of picture after it ends
const END_CARD = PACE.endCard;

const HOST = (() => {
	try {
		return new URL(board.baseUrl).host;
	} catch {
		return "";
	}
})();
const wanted = args.scene && args.scene !== true ? new Set(String(args.scene).split(",")) : null;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- 1. scenes and their time maps ----------
const scenes = [];
let cursorT = 0;
for (const sc of board.scenes) {
	if (wanted && !wanted.has(sc.id)) continue;
	// scene.source: use another scene's recording (with trim, one take can serve several scenes).
	const dir = path.resolve(args.capture, sc.source || sc.id);
	// Generated scenes (no recording): "card" (title / quote / bullets / stat) and "image" (Ken Burns).
	if (sc.type === "card" || sc.type === "image") {
		const narr = timings[sc.id] || 0;
		let D = Math.max(narr + LEAD + TAIL, sc.minDuration ?? PACE.minScene);
		if (sc.endCard) D += END_CARD;
		scenes.push({ sc, dir, fr: { viewport: VP, end: 0, frames: [] }, ev: [], D, start: cursorT, srcAt: () => 0, outAt: () => 0, narr, scale: 1 });
		cursorT += D;
		continue;
	}
	if (!fs.existsSync(path.join(dir, "frames.json"))) {
		console.warn(`skip ${sc.id}: not captured`);
		continue;
	}
	const fr = JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8"));
	const ev = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8"));
	if (ev.failed) console.warn(`WARNING ${sc.id} capture failed: ${ev.failed}`);
	// scene.trim [from, to] (seconds of the recording): use only that slice, e.g. for a short cut that
	// reuses a long take. The frame on screen at "from" becomes the first frame.
	if (Array.isArray(sc.trim)) {
		const [a, b] = sc.trim.map((v) => v * 1000);
		const before = [...fr.frames].reverse().find((f) => f.t <= a);
		const inside = fr.frames.filter((f) => f.t > a && f.t <= b);
		fr.frames = [...(before ? [{ ...before, t: 0 }] : []), ...inside.map((f) => ({ ...f, t: f.t - a }))];
		fr.end = Math.min(fr.end, b) - a;
		ev.events = ev.events.filter((e) => e.t >= a && e.t <= b).map((e) => ({ ...e, t: e.t - a }));
	}
	if (!fr.frames.length) {
		console.warn(`skip ${sc.id}: no frames`);
		continue;
	}
	const marks = ev.events.filter((e) => e.type === "mark");
	// A mark named "end" (from watchFor) cuts the scene 0.12 s before the app moved on by itself.
	const endMark = marks.find((e) => e.name === "end");
	const S = endMark ? Math.min(fr.end, endMark.t - 120) / 1000 : fr.end / 1000;
	const ramps = [];
	for (const m of marks.filter((m) => m.name === "ramp-start")) {
		const end = marks.find((e) => e.name === "ramp-end" && e.t > m.t);
		ramps.push([m.t / 1000, end ? end.t / 1000 : S]);
	}
	const narr = timings[sc.id] || 0;
	// Realtime scenes (voice agent): fast-forward the dead air between speech (the agent thinking,
	// transcription) automatically, keeping 0.6 s either side so turns still breathe.
	if (sc.fit === "realtime" && !ramps.length) {
		const speech = [[0, LEAD + narr]];
		for (const e of ev.events) if ((e.type === "mic-say" || e.type === "play") && e.secs) speech.push([e.t / 1000, e.t / 1000 + e.secs]);
		speech.sort((a, b) => a[0] - b[0]);
		let busyUntil = 0;
		for (const [a, b] of speech) {
			if (a - busyUntil > 2) ramps.push([busyUntil + 0.6, a - 0.6]);
			busyUntil = Math.max(busyUntil, b);
		}
		if (S - busyUntil > 2.5) ramps.push([busyUntil + 1.5, S]);
	}
	const rampSrc = ramps.reduce((n, [a, b]) => n + (b - a), 0);
	let u = 1;
	let D;
	if (sc.fit === "realtime") D = S - rampSrc + rampSrc / RAMP;
	else {
		D = Math.max(narr + LEAD + TAIL, sc.minDuration ?? PACE.minScene);
		const rest = D - rampSrc / RAMP;
		u = rest > 0 ? (S - rampSrc) / rest : 4;
		if (u > 4) console.warn(`${sc.id}: footage is ${u.toFixed(1)}x longer than the narration; trim it or add ramp marks`);
		if (u < 1) u = 1; // footage shorter than narration: play real time, then hold the last frame
	}
	// out -> src: walk the source segments
	const segs = [];
	let s = 0;
	for (const [a, b] of ramps.sort((x, y) => x[0] - y[0])) {
		if (a > s) segs.push({ s0: s, s1: a, speed: u });
		segs.push({ s0: a, s1: b, speed: RAMP });
		s = b;
	}
	if (s < S) segs.push({ s0: s, s1: S, speed: u });
	let o = 0;
	for (const g of segs) {
		g.o0 = o;
		o += (g.s1 - g.s0) / g.speed;
		g.o1 = o;
	}
	const srcAt = (t) => {
		for (const g of segs) if (t <= g.o1) return g.s0 + (t - g.o0) * g.speed;
		return S;
	};
	const outAt = (srcT) => {
		for (const g of segs) if (srcT <= g.s1) return g.o0 + (srcT - g.s0) / g.speed;
		return o;
	};
	if (sc.endCard) D += END_CARD;
	scenes.push({ sc, dir, fr, ev: ev.events, D, start: cursorT, srcAt, outAt, narr, scale: VIEW_W / fr.viewport.width });
	cursorT += D;
}
if (!scenes.length) throw new Error("nothing to compose");
const TOTAL = cursorT;
console.log(`timeline ${TOTAL.toFixed(1)}s: ${scenes.map((x) => `${x.sc.id} ${x.D.toFixed(1)}s`).join(", ")}`);

// ---------- 2. per-frame state ----------
const frameAt = (x, srcT) => {
	const f = x.fr.frames;
	if (!f.length) return "";
	let lo = 0;
	let hi = f.length - 1;
	const ms = srcT * 1000;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (f[mid].t <= ms) lo = mid;
		else hi = mid - 1;
	}
	return pathToFileURL(path.join(x.dir, f[lo].file)).href;
};
const cursorAt = (x, srcT) => {
	if (MOBILE_REC) return null; // a phone has no pointer; taps show as ripples
	const pts = x.ev.filter((e) => e.type === "cursor");
	if (!pts.length) return null;
	let p = pts[0];
	for (const e of pts) if (e.t / 1000 <= srcT) p = e;
	return { x: p.x * x.scale, y: p.y * x.scale };
};
const camera = (x, t) => {
	if (IPHONE) return { tx: 0, ty: 0, rx: 0, ry: 0, rz: 0, scale: 1 };
	const c = cameraWide(x, t);
	if (!VERTICAL) return c;
	// Vertical: the frame is already sized for the screen, so keep tilts subtle and scale near 1.
	return { tx: c.tx * 0.3, ty: c.ty * 0.5, rx: c.rx * 0.55, ry: c.ry * 0.45, rz: c.rz * 0.4, scale: Math.min(1, c.scale / 0.9) };
};
const cameraWide = (x, t) => {
	const k = t / x.D;
	switch (x.sc.camera) {
		case "push-in":
			return { tx: 0, ty: 0, rx: 0, ry: 0, rz: 0, scale: lerp(0.86, 0.93, ease(k)) };
		case "tilt-scroll":
			return { tx: lerp(-40, 40, k), ty: 20, rx: 24, ry: lerp(-20, -12, k), rz: 5, scale: 0.86 };
		case "tilt-in": {
			const e = ease(Math.min(1, t / 2.2));
			return { tx: 0, ty: 0, rx: lerp(22, 0, e), ry: lerp(-18, 0, e), rz: lerp(4, 0, e), scale: lerp(0.78, 0.9, e) };
		}
		default:
			return { tx: 0, ty: 0, rx: 0, ry: 0, rz: 0, scale: 0.9 };
	}
};
const zoom = (x, t) => {
	const none = { z: 1, fx: SHOT_W / 2, fy: SHOT_H / 2 };
	if (IPHONE) return none;
	if (x.sc.camera !== "auto-zoom" && !x.ev.some((e) => e.type === "focus")) return none;
	// Push in on each click: in over 0.5s before it, hold 1.6s, out over 0.7s.
	let best = none;
	// auto-zoom scenes push in on clicks and focus steps; other cameras only on explicit focus steps.
	for (const c of x.ev.filter((e) => e.type === "focus" || (e.type === "click" && x.sc.camera === "auto-zoom"))) {
		const tc = x.outAt(c.t / 1000);
		const hold = c.type === "focus" ? Math.max(0.8, x.outAt(c.t / 1000 + c.hold) - tc - 0.4) : 1.6;
		const w = t < tc - 0.5 ? 0 : t < tc ? ease((t - (tc - 0.5)) / 0.5) : t < tc + hold ? 1 : ease(1 - (t - tc - hold) / 0.7);
		const z = 1 + ((c.zoom || 1.6) - 1) * w * (PHONE ? 0.8 : VERTICAL ? 0.55 : 1); // vertical is already magnified
		if (z > best.z) best = { z, fx: c.x * x.scale, fy: c.y * x.scale, w };
	}
	return best;
};
const ripple = (x, srcT) => {
	for (const c of x.ev.filter((e) => e.type === "click")) {
		const k = (srcT - c.t / 1000) / 0.5;
		if (k >= 0 && k <= 1) return { x: c.x * x.scale, y: c.y * x.scale, k };
	}
	return null;
};
// Vertical extras: where the frame pans, the chapter label, and the burned-in caption.
const cursorTrack = new Map();
const panTarget = (x, srcT) => {
	// Average the cursor over the surrounding second, so the frame glides ahead of the action.
	if (!cursorTrack.has(x)) cursorTrack.set(x, x.ev.filter((e) => e.type === "cursor"));
	const pts = cursorTrack.get(x);
	if (!pts.length) return SHOT_W / 2;
	let sum = 0;
	let n = 0;
	for (let dt = -1; dt <= 1.001; dt += 0.1) {
		const tt = (srcT + dt) * 1000;
		let p = pts[0];
		for (const e of pts) {
			if (e.t > tt) break;
			p = e;
		}
		sum += p.x;
		n++;
	}
	return (sum / n) * x.scale;
};
const verticalExtras = (x, t, srcT, z, cap, T) => {
	const zoomW = z.w || 0;
	const target = panTarget(x, srcT) * (1 - zoomW) + (z.fx || SHOT_W / 2) * zoomW;
	const pan = Math.max(0, Math.min(SHOT_W - FRAME_W, target - FRAME_W / 2));
	const label = x.sc.label || (cap && cap.kicker && !cap.kicker.startsWith("Inventor") ? { kicker: cap.kicker, text: cap.text } : null);
	const cue = captionCues.find((c) => T >= c.start && T < c.end);
	let sub = cue ? { text: cue.text, o: Math.min(1, (T - cue.start) / 0.15, (cue.end - T) / 0.15) } : null;
	if (!sub && cap && cap.kicker && cap.kicker.startsWith("Inventor")) sub = { kicker: cap.kicker, text: cap.text, o: cap.o };
	return { pan, label: typeof label === "string" ? { kicker: "", text: label } : label, sub };
};
// iPhone status bar colour: the colour of the top edge of the screen under it, sampled twice a second.
const statusCache = new Map();
const statusAt = (x, srcT) => {
	const key = `${x.sc.id}:${Math.floor(srcT * 2)}`;
	if (statusCache.has(key)) return statusCache.get(key);
	const file = fileURLToPath(frameAt(x, Math.floor(srcT * 2) / 2));
	// Top edge for the status bar, bottom edge for Safari's minimised bar (as iOS tints them to the page).
	const edge = (crop) => {
		const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-vf", `${crop},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
		const [R, G, B] = r.status === 0 && r.stdout.length >= 3 ? [...r.stdout.subarray(0, 3)] : [255, 255, 255];
		return { bg: `rgb(${R},${G},${B})`, fg: 0.2126 * R + 0.7152 * G + 0.0722 * B > 150 ? "#000" : "#fff" };
	};
	const top = edge("crop=iw:10:0:0");
	const bottom = edge("crop=iw:10:0:ih-10");
	const v = { bg: top.bg, fg: top.fg, bottomBg: bottom.bg, bottomFg: bottom.fg };
	statusCache.set(key, v);
	return v;
};
// Card and image scenes: what the compositor draws instead of a recording.
const generatedScene = (x, t) => {
	const sc = x.sc;
	if (sc.type === "card") return { card: { kind: "title", ...(sc.card || {}), logo: !!(sc.card && sc.card.logo && board.brand && board.brand.logo), t, D: x.D } };
	const im = sc.image || {};
	const k = ease(Math.min(1, t / x.D));
	const from = { scale: 1.0, x: 0, y: 0, ...(im.from || {}) };
	const to = { scale: 1.12, x: -2, y: -1.5, ...(im.to || {}) };
	return { image: { src: pathToFileURL(path.resolve(storyDir, im.src || "")).href, fit: im.fit, scale: lerp(from.scale, to.scale, k), x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), t, D: x.D } };
};
const stateAt = (T) => {
	const x = scenes.find((s) => T < s.start + s.D) || scenes[scenes.length - 1];
	const t = T - x.start;
	const srcT = x.srcAt(Math.max(0, t));
	const endFrom = x.sc.endCard ? x.D - END_CARD : Infinity;
	let cap = x.sc.caption ? { ...x.sc.caption, o: Math.min(1, t / 0.4, (x.D - t) / 0.4) } : null;
	// While the inventor speaks, the caption shows the English subtitle of that line.
	const cues = x.ev.filter((e) => e.type === "mic-cue");
	for (const c of cues) {
		const said = x.ev.find((e) => e.type === "mic-say" && e.t >= c.t);
		const a = x.outAt(c.t / 1000);
		const b = a + (said?.secs || 4) + 0.6;
		const lang = (x.sc.mic || []).find((m) => m.id === c.clip)?.language || "";
		if (c.subtitle && t >= a && t <= b) cap = { kicker: `Inventor · ${lang}`, text: `“${c.subtitle}”`, o: Math.min(1, (t - a) / 0.3, (b - t) / 0.3) };
	}
	const z = zoom(x, t);
	const extra = VERTICAL && !CAPTIONS ? verticalExtras(x, t, srcT, z, cap, T) : VERTICAL ? { ...verticalExtras(x, t, srcT, z, cap, T), sub: null } : {};
	const generated = x.sc.type === "card" || x.sc.type === "image" ? generatedScene(x, t) : {};
	const cueNow = CAPTIONS ? captionCues.find((c) => T >= c.start && T < c.end) : null;
	const onEndCard = x.sc.endCard && T - x.start >= x.D - END_CARD;
	const burn = cueNow && !onEndCard ? { text: cueNow.text, o: Math.min(1, (T - cueNow.start) / 0.08, (cueNow.end - T) / 0.08), style: [CAPTIONS.style === "subtle" ? "subtle" : "", CAPTIONS.position === "center" ? "center" : ""].join(" ").trim() } : null;
	return {
		...extra,
		src: frameAt(x, srcT),
		cam: camera(x, t),
		zoom: z,
		cursor: cursorAt(x, srcT),
		ripple: ripple(x, srcT),
		caption: cap,
		end: t >= endFrom ? { ...x.sc.endCard, o: Math.min(1, (t - endFrom) / 0.6) } : null,
		fade: IPHONE ? 0 : Math.max(0, 1 - t / 0.3, 1 - (x.D - t) / 0.3) * (x === scenes[0] && t < 0.3 ? 1 : 0.85),
		...(IPHONE && x.fr.frames.length ? { screenFade: x === scenes[0] ? 0 : Math.max(0, 1 - t / 0.18) * 0.6, status: statusAt(x, srcT) } : {}),
		...generated,
		burn,
		url: HOST,
	};
};

// Caption cues: the narration in short chunks (sentences, then commas, then at most 9 words), timed by
// length. Used for the .srt file and, in the vertical layout, burned into the picture.
// storyboard.captions: { style: "bold" | "subtle", position: "bottom" | "center", maxWords } burns
// captions into any layout (reels, shorts). Without it, captions go only to the .srt file.
const CAPTIONS = board.captions || null;
const CAP_WORDS = (CAPTIONS && CAPTIONS.maxWords) || 9;
const captionCues = [];
for (const x of scenes) {
	const text = (x.sc.narration || "").trim();
	if (!text || !x.narr) continue;
	const chunks = [];
	for (const sentence of text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]) {
		for (const part of sentence.split(/(?<=,)\s+/)) {
			const words = part.trim().split(/\s+/).filter(Boolean);
			if (!words.length) continue;
			const n = Math.ceil(words.length / CAP_WORDS);
			const per = Math.ceil(words.length / n);
			for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(" "));
		}
	}
	const total = chunks.reduce((n, c) => n + c.length, 0);
	let at = x.start + LEAD;
	for (const c of chunks) {
		const d = (x.narr * c.length) / total;
		captionCues.push({ start: at, end: at + d, text: c });
		at += d;
	}
}

// ---------- 3. render ----------
const outPath = path.resolve(args.out);
const silent = outPath.replace(/\.mp4$/, ".video.mp4");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
// --mix-only: keep the rendered picture (.video.mp4) and redo just the audio mix.
if (!(args["mix-only"] && fs.existsSync(silent))) {
	const ff = spawn(FFMPEG, ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
	const browser = await chromium.launch({ ...pickBrowser().launch, args: ["--allow-file-access-from-files"] });
	const page = await browser.newPage({ viewport: { width: OUT.width, height: OUT.height }, deviceScaleFactor: 1 });
	await page.goto(pathToFileURL(path.join(HERE, "compositor.html")).href);
	// Brand (any product): colours and an optional logo for the end card, from storyboard.brand.
	const brand = { ...(board.brand || {}) };
	if (!brand.accent) brand.accent = (board.scenes.find((sc) => sc.endCard) || {}).endCard?.accent || "";
	if (brand.logo) brand.logo = pathToFileURL(path.resolve(storyDir, brand.logo)).href;
	await page.evaluate((l) => window.setLayout(l), { mode: IPHONE ? "iphone" : PHONE ? "phone" : VERTICAL ? "vertical" : "horizontal", shotW: SHOT_W, shotH: SHOT_H, url: (board.iphone || {}).url || HOST, time: (board.iphone || {}).time || "9:41" });
	await page.evaluate((b) => window.setBrand(b), brand);
	const N = Math.ceil(TOTAL * FPS);
	for (let i = 0; i < N; i++) {
		// A frame can stall when the machine is busy; retry it rather than lose a long render.
		let buf;
		for (let attempt = 1; ; attempt++) {
			try {
				await page.evaluate((s) => window.renderFrame(s), stateAt(i / FPS));
				buf = await page.screenshot({ type: "jpeg", quality: 95, timeout: 60000 });
				break;
			} catch (e) {
				if (attempt >= 3) throw e;
				console.warn(`frame ${i}: ${String(e.message || e).split("\n")[0]}; retrying`);
				await page.waitForTimeout(2000);
			}
		}
		if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
		if (i % (FPS * 10) === 0) console.log(`frame ${i}/${N}`);
	}
	ff.stdin.end();
	await new Promise((r) => ff.on("close", r));
	await browser.close();
}

// ---------- 4. audio ----------
const clips = []; // { file, at (s), vol, kind }
for (const x of scenes) {
	const n = path.join(args.narration, `${x.sc.id}.wav`);
	if (fs.existsSync(n)) clips.push({ file: n, at: x.start + LEAD, vol: 1, kind: "voice" });
	// scene.voices: false leaves out the recorded voices (agent replies, user clips), e.g. in a short cut.
	if (x.sc.voices === false) continue;
	// Agent replies: each captured TTS reply starts at the next playback after it arrived.
	const plays = x.ev.filter((e) => e.type === "play");
	for (const tts of x.ev.filter((e) => e.type === "tts")) {
		const play = plays.find((p) => p.t >= tts.t);
		if (!play) {
			console.warn(`${x.sc.id}: agent reply ${tts.file} never played; left out`);
			continue;
		}
		clips.push({ file: path.join(x.dir, tts.file), at: x.start + x.outAt(play.t / 1000), vol: 1, kind: "voice" });
	}
	// User-voice clips: look the clip up by id in the current storyboard (files may have moved since the take).
	for (const m of x.ev.filter((e) => e.type === "mic-cue")) {
		const clip = (x.sc.mic || []).find((c) => c.id === m.clip);
		const file = path.resolve(storyDir, clip ? clip.file : m.file);
		if (!fs.existsSync(file)) {
			console.warn(`${x.sc.id}: voice clip ${m.clip} not found at ${file}; left out`);
			continue;
		}
		clips.push({ file, at: x.start + x.outAt(m.t / 1000), vol: 0.9, kind: "voice" });
	}
}
// Level every clip on its own first (narration, inventor and agent voices come from three different
// engines at very different loudness), into plain 48 kHz stereo WAVs the mix can trust.
const audioDir = path.join(path.dirname(path.resolve(args.out)), ".audio");
fs.rmSync(audioDir, { recursive: true, force: true });
fs.mkdirSync(audioDir, { recursive: true });
const level = (file, n, target) => {
	const out = path.join(audioDir, `${String(n).padStart(3, "0")}.wav`);
	const r = spawnSync(FFMPEG, ["-loglevel", "error", "-y", "-i", file, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11`, "-ar", "48000", "-ac", "2", out], { stdio: "inherit" });
	if (r.status !== 0) throw new Error(`could not level ${file}`);
	return out;
};
clips.forEach((c, i) => (c.file = level(c.file, i, -18)));
// Background music: storyboard.music is
//   "generate" (default) or { mood, bpm, seed, level } -> a royalty-free track composed by sound.py,
//     made exactly as long as the video;
//   a file path -> that track (its licence must allow commercial use); null -> no music.
// It is levelled far below the voices (default -30 LUFS against -18) and ducked further whenever
// anyone speaks, so it fills silences without competing with the demo.
const PY = DEFAULT_PY;
const SOUND = path.join(HERE, "sound.py");
const musicSpec = args.music ? args.music : board.music === undefined ? "generate" : board.music;
let music = null;
let musicLevel = -30;
if (musicSpec === "generate" || (musicSpec && typeof musicSpec === "object")) {
	const o = typeof musicSpec === "object" ? musicSpec : {};
	musicLevel = o.level ?? -30;
	const out = path.join(audioDir, "music.wav");
	const r = spawnSync(PY, ["-I", SOUND, "music", "--seconds", String(Math.ceil(TOTAL + 1)), "--out", out, "--mood", o.mood || "light", "--bpm", String(o.bpm || 84), "--seed", String(o.seed ?? 7)], { stdio: "inherit" });
	if (r.status !== 0) throw new Error("music generation failed (is the Python environment from SKILL.md set up?)");
	music = out;
} else if (typeof musicSpec === "string") music = path.resolve(storyDir, musicSpec);

// Sound effects: a soft tick on every click and a gentle whoosh into each scene after the first.
// storyboard.sfx: false turns them off; { click, transition, volume } tunes them.
const sfxSpec = board.sfx === false ? null : { click: true, transition: true, volume: 0.35, ...(board.sfx || {}) };
const sfx = [];
if (sfxSpec) {
	const dir = path.join(audioDir, "sfx");
	const r = spawnSync(PY, ["-I", SOUND, "sfx", "--out-dir", dir], { stdio: "inherit" });
	if (r.status !== 0) throw new Error("sound effects generation failed");
	for (const x of scenes) {
		if (sfxSpec.transition && x !== scenes[0]) sfx.push({ file: path.join(dir, "whoosh.wav"), at: Math.max(0, x.start - 0.35), vol: sfxSpec.volume * 0.8 });
		if (sfxSpec.click) for (const c of x.ev.filter((e) => e.type === "click")) sfx.push({ file: path.join(dir, "click.wav"), at: x.start + x.outAt(c.t / 1000), vol: sfxSpec.volume });
	}
}

const inputs = ["-i", silent];
const filters = [];
let n = 1;
const place = (list, tag) =>
	list.map((c) => {
		inputs.push("-i", c.file);
		const ms = Math.max(0, Math.round(c.at * 1000));
		const label = `${tag}${n}`;
		filters.push(`[${n++}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.vol},adelay=${ms}|${ms}[${label}]`);
		return `[${label}]`;
	});
const bus = (labels, name) => {
	if (!labels.length) return null;
	filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad=whole_dur=${TOTAL.toFixed(2)}[${name}]`);
	return name;
};
const voice = bus(place(clips, "v"), "voice");
const fx = bus(place(sfx, "s"), "fx");
let bed = null;
if (music && fs.existsSync(music)) {
	inputs.push("-stream_loop", "-1", "-i", level(music, 999, musicLevel));
	filters.push(`[${n++}:a]atrim=0:${TOTAL.toFixed(2)},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, TOTAL - 3).toFixed(2)}:d=3[m]`);
	bed = "m";
	if (voice) {
		// Only the voices duck the music; effects do not.
		filters.push("[voice]asplit[v1][key]", "[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=600[duck]");
		bed = "duck";
	}
}
const parts = [voice && (bed === "duck" ? "[v1]" : "[voice]"), bed && `[${bed}]`, fx && "[fx]"].filter(Boolean);
let last = "";
if (parts.length === 1) last = parts[0].slice(1, -1);
else if (parts.length > 1) {
	filters.push(`${parts.join("")}amix=inputs=${parts.length}:normalize=0,alimiter=limit=0.95[mix]`);
	last = "mix";
}
const muxArgs = ["-loglevel", "error", "-y", ...inputs];
if (last) muxArgs.push("-filter_complex", filters.join(";"), "-map", "0:v", "-map", `[${last}]`, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", outPath);
else muxArgs.push("-c", "copy", outPath);
const mux = spawnSync(FFMPEG, muxArgs.map((a) => (a === "error" ? "warning" : a)), { stdio: "inherit" });
if (mux.status !== 0) throw new Error(`audio mix failed (ffmpeg exit ${mux.status}); the picture is kept at ${silent}, re-run with --mix-only`);
// The picture-only render (.video.mp4) is kept so audio changes can be redone with --mix-only.

// ---------- 5. subtitles (narration, sentence by sentence, timed by length) ----------
const stamp = (v) => new Date(Math.max(0, v) * 1000).toISOString().slice(11, 23).replace(".", ",");
const srt = captionCues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`);
fs.writeFileSync(outPath.replace(/\.mp4$/, ".srt"), srt.join("\n"));
console.log(`done: ${outPath} (${TOTAL.toFixed(1)}s)`);
