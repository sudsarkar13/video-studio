// Video Studio installer: one script for macOS, Linux and Windows. Safe to run again; it only adds
// what is missing.
//   node install.mjs            set everything up
//   node install.mjs --check    only run the doctor
//
// Everything goes into the data folder (VIDEO_STUDIO_HOME, default ~/.local/share/video-studio or
// %LOCALAPPDATA%\video-studio), never into the plugin folder, so plugin updates do not wipe it:
//   node/      playwright-core (pinned), installed with npm
//   .venv/     Python environment with the voice engine (pinned packages)
//   models/    the Kokoro voice model, verified against fixed SHA-256 checksums
// System software (Node, Python, ffmpeg, a browser) is never installed for you; when something is
// missing, this prints the command for your OS.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { HOME_DIR, MODELS, NODE_DIR, PY, browser } from "../scripts/lib/paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(path.dirname(HERE), "scripts");
const WIN = process.platform === "win32";
const OS = WIN ? "windows" : process.platform === "darwin" ? "macos" : "linux";

const PLAYWRIGHT = "playwright-core@1.60.0";
const PY_PACKAGES = ["kokoro-onnx==0.6.1", "soundfile==0.14.0", "numpy>=1.26,<3"];
const MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
const MODEL_FILES = {
	"kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
	"voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
};

const say = (m) => console.log(`==> ${m}`);
const fail = (m) => {
	console.error(`x ${m}`);
	process.exit(1);
};
// On Windows, npm and other launchers are .cmd files, which need a shell to run.
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: WIN, ...opts });
const has = (cmd, args = ["--version"]) => spawnSync(cmd, args, { stdio: "ignore", shell: WIN }).status === 0;
const doctor = () => spawnSync(process.execPath, [path.join(SCRIPTS, "doctor.mjs")], { stdio: "inherit" }).status ?? 1;

if (process.argv.includes("--check")) process.exit(doctor());

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 18) fail(`Node.js ${process.versions.node} is too old; 18 or newer is needed.`);
fs.mkdirSync(MODELS, { recursive: true });
fs.mkdirSync(NODE_DIR, { recursive: true });

// 1. Browser automation library, pinned, in the data folder.
say(`Browser automation library (${PLAYWRIGHT}) in ${NODE_DIR}`);
if (!fs.existsSync(path.join(NODE_DIR, "package.json"))) fs.writeFileSync(path.join(NODE_DIR, "package.json"), JSON.stringify({ name: "video-studio-runtime", private: true }, null, 2) + "\n");
if (!has("npm")) fail("npm was not found. It comes with Node.js: https://nodejs.org");
if (run("npm", ["install", "--prefix", NODE_DIR, "--no-audit", "--no-fund", "--save-exact", PLAYWRIGHT]).status !== 0) fail("npm install failed.");

// 2. Python environment for the voice and music engines.
say(`Python environment: ${path.dirname(path.dirname(PY))}`);
const venv = path.join(HOME_DIR, ".venv");
const uv = has("uv");
if (!fs.existsSync(PY)) {
	let made = false;
	if (uv) made = run("uv", ["venv", "--python", "3.12", venv, "-q"]).status === 0;
	if (!made) {
		const tries = WIN
			? [["py", ["-3.12"]], ["py", ["-3.11"]], ["py", ["-3.13"]], ["py", ["-3.10"]], ["python", []]]
			: [["python3.12", []], ["python3.11", []], ["python3.13", []], ["python3.10", []], ["python3", []]];
		for (const [cmd, pre] of tries) {
			if (!has(cmd, [...pre, "--version"])) continue;
			if (run(cmd, [...pre, "-m", "venv", venv]).status === 0) {
				made = true;
				break;
			}
		}
	}
	if (!made) fail({ macos: "Python 3.10-3.13 is needed: brew install python@3.12 (or install uv)", linux: "Python 3.10-3.13 is needed: sudo apt install python3 python3-venv (or install uv)", windows: "Python 3.10-3.13 is needed: winget install Python.Python.3.12 (or install uv)" }[OS]);
}
const pipOk = uv ? run("uv", ["pip", "install", "--python", PY, "-q", ...PY_PACKAGES]).status === 0 : run(PY, ["-m", "pip", "install", "-q", ...PY_PACKAGES], { shell: false }).status === 0;
if (!pipOk) fail("Installing the Python packages failed.");

// 3. Voice model, verified before use.
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const [name, want] of Object.entries(MODEL_FILES)) {
	const file = path.join(MODELS, name);
	if (fs.existsSync(file) && sha256(file) === want) continue;
	say(`Downloading voice model file ${name}`);
	const res = await fetch(`${MODEL_URL}/${name}`);
	if (!res.ok || !res.body) fail(`Download of ${name} failed (HTTP ${res.status}).`);
	const part = `${file}.part`;
	const hash = createHash("sha256");
	const body = Readable.fromWeb(res.body);
	body.on("data", (chunk) => hash.update(chunk));
	await pipeline(body, fs.createWriteStream(part));
	if (hash.digest("hex") !== want) {
		fs.rmSync(part, { force: true });
		fail(`${name} failed its checksum; download refused.`);
	}
	fs.renameSync(part, file);
}

// 4. Browser: use Chrome or Edge if installed, otherwise Playwright's Chromium.
const b = browser();
if (b.name === "bundled Chromium") {
	say("No Google Chrome or Microsoft Edge found; downloading Playwright's Chromium");
	if (run(process.execPath, [path.join(NODE_DIR, "node_modules", "playwright-core", "cli.js"), "install", "chromium"], { shell: false }).status !== 0) fail("Chromium download failed.");
} else say(`Browser: ${b.name}`);

// 5. ffmpeg is a system tool: say how to get it if missing.
if (!has(process.env.VIDEO_STUDIO_FFMPEG || "ffmpeg", ["-version"])) {
	console.log(`\nffmpeg is missing. Install it, then run this again:\n   ${{ macos: "brew install ffmpeg", linux: "sudo apt install ffmpeg   (or dnf / pacman)", windows: "winget install Gyan.FFmpeg" }[OS]}`);
}

console.log("");
process.exit(doctor());
