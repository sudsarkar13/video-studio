// Video Studio doctor: checks that everything the skill needs is present, and says how to fix what
// is not. Exit code 0 when the core is ready.   node doctor.mjs [--json]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG, HOME_DIR, INSTALL_CMD as INSTALL, MODELS, NODE_DIR, PY, browser, loadPlaywright } from "./lib/paths.mjs";

const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", timeout: 20000 });
const checks = [];
const add = (name, ok, detail, fix, optional = false) => checks.push({ name, ok, detail, fix: ok ? "" : fix, optional });

// Node
const nodeMajor = Number(process.versions.node.split(".")[0]);
add("Node.js 18+", nodeMajor >= 18, `v${process.versions.node}`, "Install Node.js 18 or newer from https://nodejs.org");

// playwright-core
let pw = null;
try {
	pw = loadPlaywright();
	const inData = fs.existsSync(path.join(NODE_DIR, "node_modules", "playwright-core", "package.json"));
	add("playwright-core", inData, inData ? `installed in ${NODE_DIR}` : "found outside the data folder (development copy)", `Run the installer: ${INSTALL}`);
} catch {
	add("playwright-core", false, "not installed", `Run the installer: ${INSTALL}`);
}

// Browser
const b = browser();
if (b.name === "bundled Chromium") {
	let ok = false;
	try {
		ok = !!pw && fs.existsSync(pw.chromium.executablePath());
	} catch {}
	add("Browser", ok, ok ? "Playwright's bundled Chromium" : "no Google Chrome, Microsoft Edge or bundled Chromium", `Install Google Chrome, or run: node "${path.join(NODE_DIR, "node_modules", "playwright-core", "cli.js")}" install chromium`);
} else add("Browser", true, b.name, "");

// ffmpeg and the pieces of it the skill uses
const ffv = run(FFMPEG, ["-hide_banner", "-version"]);
const ffFix = { macos: "brew install ffmpeg", linux: "sudo apt install ffmpeg   (or dnf / pacman)", windows: "winget install Gyan.FFmpeg" }[OS];
if (ffv.status !== 0) add("ffmpeg", false, "not found on the PATH", ffFix);
else {
	const enc = run(FFMPEG, ["-hide_banner", "-encoders"]).stdout || "";
	const flt = run(FFMPEG, ["-hide_banner", "-filters"]).stdout || "";
	const missing = [["libx264", enc], ["aac", enc], ["loudnorm", flt], ["sidechaincompress", flt], ["amix", flt]].filter(([n, list]) => !new RegExp(`\\b${n}\\b`).test(list)).map(([n]) => n);
	add("ffmpeg", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : (ffv.stdout.split("\n")[0] || "").replace("ffmpeg version ", "version "), `Install a full ffmpeg build: ${ffFix}`);
}

// Python environment
const py = fs.existsSync(PY) ? run(PY, ["-I", "-c", "import kokoro_onnx, soundfile, numpy, sys; print(sys.version.split()[0])"]) : null;
add("Python voice/music engine", !!py && py.status === 0, py && py.status === 0 ? `Python ${py.stdout.trim()} at ${PY}` : `not ready (${PY})`, `Run the installer: ${INSTALL}`);

// Voice model
const want = { "kokoro-v1.0.onnx": 325532387, "voices-v1.0.bin": 28214398 };
const bad = Object.entries(want).filter(([f, size]) => {
	try {
		return fs.statSync(path.join(MODELS, f)).size !== size;
	} catch {
		return true;
	}
});
add("Voice model (Kokoro-82M)", bad.length === 0, bad.length ? `missing or incomplete: ${bad.map(([f]) => f).join(", ")}` : MODELS, `Run the installer: ${INSTALL}`);

// Display (Linux): recording falls back to headless without one; signing in needs one.
if (OS === "linux") {
	const disp = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
	add("Display", true, disp ? "available" : "none: recording runs headless; sign in on a machine with a display", "", true);
}

// Disk space
try {
	fs.mkdirSync(HOME_DIR, { recursive: true });
	const s = fs.statfsSync(HOME_DIR);
	const gb = (s.bavail * s.bsize) / 1e9;
	add("Free disk space", gb >= 5, `${gb.toFixed(1)} GB free (recordings take ~25 MB per second of footage)`, "Free at least 5 GB before recording.");
} catch {}

// Optional: GPU for the talking-avatar and voice-cloning features (Phase 2/3)
const nv = run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"]);
const gpu = nv.status === 0 && nv.stdout.trim() ? nv.stdout.trim().split("\n")[0] : "";
const apple = OS === "macos" && /arm64/.test(process.arch);
add(
	"GPU for avatar / voice cloning (optional)",
	!!gpu,
	gpu ? `NVIDIA ${gpu}` : apple ? "Apple Silicon only (voice cloning OK on CPU/MPS; avatar will be slow)" : "no NVIDIA GPU found",
	"Optional. Without an NVIDIA GPU the avatar step can run slowly on the CPU, or on a rented cloud GPU if you choose.",
	true,
);

const core = checks.filter((c) => !c.optional);
const ready = core.every((c) => c.ok);
if (process.argv.includes("--json")) console.log(JSON.stringify({ ready, os: OS, dataDir: HOME_DIR, checks }, null, 2));
else {
	console.log(`Video Studio doctor (${OS}, data folder: ${HOME_DIR})\n`);
	for (const c of checks) {
		console.log(`${c.ok ? "  ok " : c.optional ? "  -- " : "  !! "} ${c.name}: ${c.detail}`);
		if (c.fix) console.log(`       fix: ${c.fix}`);
	}
	console.log(ready ? "\nReady: the core is installed." : "\nNot ready yet: fix the items marked !! above.");
}
process.exit(ready ? 0 : 1);
