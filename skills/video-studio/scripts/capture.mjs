// Records storyboard scenes from the real app in a visible Chromium window.
//
//   node capture.mjs login   [--profile DIR] [--base URL]
//       Opens the recorder's own browser profile so the owner signs in to the admin account by hand.
//       Close the window when signed in. The session stays in the profile (outside the repo).
//
//   node capture.mjs record  --storyboard FILE --out DIR [--narration DIR] [--scene ID[,ID]] [--profile DIR] [--base URL]
//       For each scene writes DIR/<scene>/frames/*.jpg, frames.json (frame times), events.json
//       (clicks, cursor path, markers, mic cues, agent playback), and agent/*.mp3 (the voice agent's
//       own replies, taken from the response named in storyboard.agentAudio).
//
// Video: Chrome DevTools screencast (JPEG frames at the device scale), not Playwright's recordVideo,
// which is a fixed low-bitrate VP8 too soft for zooms. Audio: see audio-hooks.js.
import { chromium } from "playwright-core";
import { PROFILE, browser } from "./lib/paths.mjs";
const BROWSER = browser();
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE = PROFILE;

const args = Object.fromEntries(
	process.argv.slice(3).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true)]] : acc), []),
);
const mode = process.argv[2];
const profile = args.profile || DEFAULT_PROFILE;
const board = args.storyboard ? JSON.parse(fs.readFileSync(args.storyboard, "utf8")) : {};
const base = args.base || board.baseUrl;
if (!base) {
	console.error("set baseUrl in the storyboard (or pass --base URL)");
	process.exit(2);
}
const vp = board.viewport || { width: 1600, height: 900, scale: 2 };

const NO_DISPLAY = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const HEADLESS = process.env.VIDEO_STUDIO_HEADLESS === "1" || args.headless === true || NO_DISPLAY;
if (mode === "login" && NO_DISPLAY) {
	console.error("Signing in needs a screen. Run login on a machine with a display (or forward X11), then copy the data folder's browser-profile over.");
	process.exit(2);
}
const MOBILE = !!(board.device && board.device.mobile);
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const launch = () =>
	chromium.launchPersistentContext(profile, {
		...BROWSER.launch, // Google Chrome, else Microsoft Edge, else the bundled Chromium (lib/paths.mjs)
		// A visible window by default (the person signs in there). Headless when there is no display
		// (Linux servers, WSL, CI) or VIDEO_STUDIO_HEADLESS=1; sign-in still needs a display.
		headless: HEADLESS && mode !== "login",
		viewport: { width: vp.width, height: vp.height },
		deviceScaleFactor: vp.scale,
		permissions: ["microphone"],
		args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--hide-scrollbars", `--window-size=${Math.max(vp.width, 500)},${vp.height + 120}`],
		// storyboard.device: { mobile: true, userAgent } records the app as a phone (its mobile layout,
		// touch input). Use a phone-sized viewport with it, e.g. 412 x 732 at scale 2.625 (= 1080 x 1920).
		...(MOBILE ? { isMobile: true, hasTouch: true, userAgent: board.device.userAgent || ANDROID_UA } : {}),
	});

if (mode === "login") {
	fs.mkdirSync(profile, { recursive: true });
	const ctx = await launch();
	const page = ctx.pages()[0] || (await ctx.newPage());
	// storyboard.login: { start: page to open, successPath: path that proves you are signed in }.
	const login = board.login || {};
	const successPath = login.successPath || "/dashboard";
	await page.goto(new URL(login.start || successPath, base).toString());
	console.log("Sign in in the window that just opened. I will say when it has worked; then close the window.");
	// Success only after the signed-in page has stayed open for 3 s, so a page that flashes before a
	// signed-out redirect does not count.
	let ok = false;
	let seen = 0;
	const timer = setInterval(async () => {
		try {
			const on = ctx.pages().some((pg) => new URL(pg.url()).pathname.startsWith(successPath));
			seen = on ? seen + 1 : 0;
			if (seen >= 3 && !ok) {
				ok = true;
				console.log(`Signed in: ${successPath} is open. You can close the window now.`);
			}
		} catch {}
	}, 1000);
	await new Promise((r) => ctx.on("close", r));
	clearInterval(timer);
	console.log(ok ? "Saved. The recorder will use this session." : `Not signed in: ${successPath} never opened. Run login again.`);
	process.exit(ok ? 0 : 1);
}

if (mode !== "record" || !args.storyboard || !args.out) {
	console.error("usage: node capture.mjs login | record --storyboard FILE --out DIR [--scene ID]");
	process.exit(2);
}

const wanted = args.scene && args.scene !== true ? new Set(String(args.scene).split(",")) : null;
const scenes = board.scenes.filter((s) => !wanted || wanted.has(s.id));
const storyDir = path.dirname(path.resolve(args.storyboard));
const narration = args.narration ? JSON.parse(fs.readFileSync(path.join(args.narration, "timings.json"), "utf8")).scenes : {};

const ctx = await launch();
await ctx.addInitScript({ path: path.join(HERE, "audio-hooks.js") });
await ctx.addInitScript({ content: `window.__demoHide = ${JSON.stringify({ labels: board.hideNav || board.hideForAdmin || [], texts: board.hideText || [], selectors: board.hideSelectors || [] })};` });
await ctx.addInitScript({ path: path.join(HERE, "hide.js") });

let events = [];
let T0 = 0;
const now = () => Date.now() - T0;
await ctx.exposeBinding("__demoEvent", (_src, json) => {
	try {
		events.push({ t: now(), ...JSON.parse(json) });
	} catch (_) {}
});

const page = ctx.pages()[0] || (await ctx.newPage());

// A voice agent's replies arrive as base64 audio in a network response (storyboard.agentAudio).
let sceneDir = "";
let agentN = 0;
page.on("response", async (res) => {
	// storyboard.agentAudio: { urlIncludes, bodyMatch, audioField, languageField } says which response holds
	// a voice agent's spoken reply (base64 audio). Without it, no agent audio is captured.
	const aa = board.agentAudio;
	if (!aa || !res.url().includes(aa.urlIncludes) || res.request().method() !== "POST") return;
	let body = null;
	try {
		body = res.request().postDataJSON();
	} catch (_) {}
	if (aa.bodyMatch && (!body || Object.entries(aa.bodyMatch).some(([k, v]) => body[k] !== v))) return;
	const t = now();
	try {
		const data = await res.json();
		const audio = data[aa.audioField || "audio"];
		const lang = (body && body[aa.languageField || "language"]) || "xx";
		if (!audio) return events.push({ t, type: "tts-failed", status: res.status() });
		const file = `agent/${String(++agentN).padStart(2, "0")}-${lang}.${aa.extension || "mp3"}`;
		fs.mkdirSync(path.join(sceneDir, "agent"), { recursive: true });
		fs.writeFileSync(path.join(sceneDir, file), Buffer.from(audio, "base64"));
		events.push({ t, type: "tts", file, language: lang });
	} catch (e) {
		events.push({ t, type: "tts-failed", error: String(e) });
	}
});

// Cursor: the real pointer is invisible in screencast frames, so every move is logged and the
// compositor draws a smooth cursor from this path.
let cursor = { x: vp.width / 2, y: vp.height / 2 };
const moveTo = async (x, y, ms = 700) => {
	const steps = Math.max(8, Math.round(ms / 16));
	const from = { ...cursor };
	for (let i = 1; i <= steps; i++) {
		const k = i / steps;
		const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
		cursor = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
		await page.mouse.move(cursor.x, cursor.y);
		events.push({ t: now(), type: "cursor", x: Math.round(cursor.x), y: Math.round(cursor.y) });
		await page.waitForTimeout(ms / steps);
	}
};

const locate = (to) => {
	if (typeof to === "string") return page.getByText(to, { exact: true }).first();
	if (to.role) return page.getByRole(to.role, to.name ? { name: to.name, exact: !!to.exact } : {}).first();
	if (to.text) return page.getByText(to.text, { exact: !!to.exact }).first();
	if (to.selector) return page.locator(to.selector).first();
	throw new Error(`cannot locate ${JSON.stringify(to)}`);
};
const centre = async (to) => {
	const loc = locate(to);
	await loc.scrollIntoViewIfNeeded();
	const b = await loc.boundingBox();
	if (!b) throw new Error(`not visible: ${JSON.stringify(to)}`);
	return { loc, x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};

// Admin view -> what a regular user sees: hide.js (injected, below) keeps admin-only nav entries and
// floating widgets hidden; the guard refuses to film if anything labelled Alpha is still on screen
// (release-stage rule in AGENTS.md).
const hideAdminOnly = () => page.evaluate(() => window.__demoHideApply && window.__demoHideApply()).catch(() => {});
// storyboard.guardText: words that must never be on screen (default: "Alpha"), matched case-insensitively.
const GUARD = (board.guardText || ["Alpha"]).map(String);
const alphaOnScreen = () =>
	page.evaluate((guard) => {
		const words = guard.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
		const hits = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const n = walker.currentNode;
			if (!words.some((w) => w.test(n.textContent || ""))) continue;
			const r = n.parentElement?.getBoundingClientRect();
			const style = n.parentElement && getComputedStyle(n.parentElement);
			if (r && r.width && r.height && r.bottom > 0 && r.top < innerHeight && style.visibility !== "hidden" && style.display !== "none") hits.push(n.textContent.trim().slice(0, 60));
		}
		return hits;
	}, GUARD);
let currentScene = null;
const guard = async (where) => {
	// scene.expectPath: the take fails if the app left this page, e.g. bounced to the home page after the
	// session expired. Without it a signed-out take looks fine to every other check.
	const expect = currentScene && currentScene.expectPath;
	if (expect) {
		const p = new URL(page.url()).pathname;
		if (!p.startsWith(expect)) throw new Error(`left ${expect} (now on ${p}) ${where}; signed out? run: node capture.mjs login --storyboard <file>`);
	}
	await hideAdminOnly();
	const hits = await alphaOnScreen();
	if (hits.length) throw new Error(`guarded text (${GUARD.join(", ")}) on screen ${where}: ${hits.join(" | ")}`);
};

const smoothScroll = (to, ms) =>
	page.evaluate(
		([to, ms]) =>
			new Promise((done) => {
				const el = document.scrollingElement;
				const from = el.scrollTop;
				const target = to === "bottom" ? el.scrollHeight - innerHeight : to === "top" ? 0 : Number(to);
				const t0 = performance.now();
				const step = (t) => {
					const k = Math.min(1, (t - t0) / ms);
					el.scrollTop = from + (target - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
					k < 1 ? requestAnimationFrame(step) : done();
				};
				requestAnimationFrame(step);
			}),
		[to, ms],
	);

const waitAgent = async (timeout = 60000) => {
	const start = events.length;
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const play = events.slice(start).find((e) => e.type === "play" && e.secs);
		if (play) return page.waitForTimeout(play.secs * 1000 + 600);
		if (events.slice(start).some((e) => e.type === "browser-voice-fallback")) throw new Error("agent fell back to the browser voice; this take has no capturable agent audio");
		await page.waitForTimeout(200);
	}
	throw new Error("agent did not speak within the timeout");
};

const run = async (scene, a) => {
	switch (a.do) {
		case "goto":
			await page.goto(new URL(a.url, base).toString(), { waitUntil: "domcontentloaded" });
			return;
		case "wait":
			return page.waitForTimeout(a.ms);
		case "waitFor":
			return (a.selector ? page.locator(a.selector).first() : locate(a.text ? { text: a.text } : a.to)).waitFor({ state: "visible", timeout: a.timeout || 15000 });
		case "move": {
			if (MOBILE) return; // no pointer on a phone
			const { x, y } = await centre(a.to);
			return moveTo(x, y, a.ms);
		}
		case "click": {
			const { loc, x, y } = await centre(a.to);
			if (!MOBILE) await moveTo(x, y, a.ms);
			events.push({ t: now(), type: "click", x: Math.round(x), y: Math.round(y) });
			return MOBILE ? loc.tap() : loc.click();
		}
		case "type": {
			const { loc, x, y } = await centre(a.to);
			if (!MOBILE) await moveTo(x, y);
			events.push({ t: now(), type: "click", x: Math.round(x), y: Math.round(y) });
			await (MOBILE ? loc.tap() : loc.click());
			return page.keyboard.type(a.text, { delay: a.delay ?? 45 });
		}
		case "watchFor": {
			// Non-blocking, inside the page: a MutationObserver reports the instant this text appears (polling
			// from Playwright lagged ~300 ms, longer than some screens stay up). A mark named "end" makes
			// compose cut the scene just before that moment.
			const text = a.text || a.to?.text;
			if (!text) throw new Error("watchFor needs text");
			await page.evaluate(([text, name]) => {
				const seen = () => document.body && document.body.innerText.includes(text);
				if (seen()) return window.__demoEvent && window.__demoEvent(JSON.stringify({ type: "mark", name }));
				let queued = false;
				const obs = new MutationObserver(() => {
					if (queued) return;
					queued = true;
					requestAnimationFrame(() => {
						queued = false;
						if (!seen()) return;
						obs.disconnect();
						window.__demoEvent && window.__demoEvent(JSON.stringify({ type: "mark", name }));
					});
				});
				obs.observe(document.body, { childList: true, subtree: true, characterData: true });
			}, [text, a.mark || "end"]);
			return;
		}
		case "focus": {
			// Camera push-in on an element without clicking it (score ring, a draft section).
			// ms: "narration" holds the shot for as long as the scene's narration (realtime scenes).
			const ms = a.ms === "narration" ? ((narration[scene.id] || 0) + 0.7) * 1000 : a.ms || 2500;
			const { x, y } = await centre(a.to);
			events.push({ t: now(), type: "focus", x: Math.round(x), y: Math.round(y), zoom: a.zoom || 1.5, hold: ms / 1000 });
			return page.waitForTimeout(ms);
		}
		case "waitGone": {
			// Wait until something disappears (a "thinking…" indicator, a spinner).
			const loc = a.selector ? page.locator(a.selector).first() : locate(a.text ? { text: a.text } : a.to);
			await loc.waitFor({ state: "visible", timeout: a.appear ?? 15000 }).catch(() => {});
			return loc.waitFor({ state: "hidden", timeout: a.timeout || 120000 });
		}
		case "waitEnabled": {
			// A button that unlocks when background work finishes (search, drafting).
			const loc = locate(a.to);
			await loc.waitFor({ state: "visible", timeout: a.timeout || 180000 });
			const deadline = Date.now() + (a.timeout || 180000);
			while (!(await loc.isEnabled())) {
				if (Date.now() > deadline) throw new Error(`still disabled: ${JSON.stringify(a.to)}`);
				await page.waitForTimeout(500);
			}
			return;
		}
		case "scrollBy":
			return page.evaluate(([px, ms]) => new Promise((done) => {
				const el = [...document.querySelectorAll("main, [data-feed], *")].find((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)) || document.scrollingElement;
				const from = el.scrollTop, t0 = performance.now();
				const step = (t) => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = from + px * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); k < 1 ? requestAnimationFrame(step) : done(); };
				requestAnimationFrame(step);
			}), [a.px, a.ms || 2000]);
		case "scroll":
			return smoothScroll(a.to, a.ms || 2500);
		case "say": {
			const clip = (scene.mic || []).find((m) => m.id === a.clip);
			if (!clip) throw new Error(`no mic clip ${a.clip} in scene ${scene.id}`);
			const b64 = fs.readFileSync(path.resolve(storyDir, clip.file)).toString("base64");
			events.push({ t: now(), type: "mic-cue", clip: clip.id, file: clip.file, subtitle: clip.subtitle || "" });
			const secs = await page.evaluate((b) => window.__demoMic.sayB64(b), b64);
			return page.waitForTimeout(secs * 1000 + (a.after ?? 1200));
		}
		case "waitAgent":
			return waitAgent(a.timeout);
		case "waitNarration": {
			// Realtime scenes: hold still while the narrator speaks, so the agent does not talk over it.
			const secs = narration[scene.id];
			if (!secs) throw new Error(`no narration timing for ${scene.id}; pass --narration DIR (run tts.py narrate first)`);
			return page.waitForTimeout((secs + 0.7) * 1000);
		}
		case "mark":
			events.push({ t: now(), type: "mark", name: a.name });
			return;
		default:
			throw new Error(`unknown action ${a.do}`);
	}
};

for (const scene of scenes) {
	page.setDefaultTimeout(10000);
	if (!scene.actions?.length) {
		console.log(`skip ${scene.id}: no actions yet (rehearse it first)`);
		continue;
	}
	currentScene = scene;
	sceneDir = path.resolve(args.out, scene.id);
	fs.rmSync(sceneDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(sceneDir, "frames"), { recursive: true });
	events = [];
	agentN = 0;
	const frames = [];

	// Off camera: the scene's setup steps (open the page, dismiss banners), so filming opens on content.
	for (const a of scene.setup || []) {
		try {
			await run(scene, a);
		} catch (e) {
			if (!a.optional) throw e;
		}
	}
	await page.waitForLoadState("networkidle").catch(() => {});
	await guard("before the scene");

	const cdp = await ctx.newCDPSession(page);
	cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
		const file = `frames/${String(frames.length).padStart(6, "0")}.jpg`;
		fs.writeFileSync(path.join(sceneDir, file), Buffer.from(data, "base64"));
		frames.push({ file, t: Math.round(metadata.timestamp * 1000) - T0 });
		await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
	});
	T0 = Date.now();
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: Math.round(vp.width * vp.scale), maxHeight: Math.round(vp.height * vp.scale), everyNthFrame: 1 });
	events.push({ t: 0, type: "cursor", x: Math.round(cursor.x), y: Math.round(cursor.y) });

	let failed = null;
	try {
		for (const a of scene.actions) {
			await run(scene, a);
			if (a.do === "goto" || a.do === "click") await guard(`after ${a.do}`);
		}
		await page.waitForTimeout(400);
		await guard("at the end of the take");
	} catch (e) {
		failed = String(e.message || e);
	}
	const end = now();
	await cdp.send("Page.stopScreencast").catch(() => {});
	await cdp.detach().catch(() => {});
	const fallback = events.some((e) => e.type === "browser-voice-fallback");
	fs.writeFileSync(path.join(sceneDir, "frames.json"), JSON.stringify({ viewport: vp, end, frames }, null, 1));
	fs.writeFileSync(path.join(sceneDir, "events.json"), JSON.stringify({ failed, fallback, events }, null, 1));
	console.log(`${scene.id}: ${frames.length} frames, ${(end / 1000).toFixed(1)}s${failed ? `  FAILED: ${failed}` : ""}${fallback ? "  (browser-voice fallback: retake)" : ""}`);
}

await ctx.close();
