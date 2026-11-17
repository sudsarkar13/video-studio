// Where Video Studio keeps its data and which tools it uses, on macOS, Linux and Windows.
// Everything can be overridden with environment variables:
//   VIDEO_STUDIO_HOME     data folder (voice model, Python environment, browser library, recorder profile)
//   VIDEO_STUDIO_PY       Python interpreter with kokoro-onnx, soundfile and numpy installed
//   VIDEO_STUDIO_BROWSER  chrome | msedge | bundled | an absolute path to a Chromium-based browser
//   VIDEO_STUDIO_FFMPEG   ffmpeg executable (default: "ffmpeg" on the PATH)
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";

export const HOME_DIR =
	process.env.VIDEO_STUDIO_HOME ||
	(WIN ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "video-studio") : path.join(os.homedir(), ".local", "share", "video-studio"));

export const PY = process.env.VIDEO_STUDIO_PY || (WIN ? path.join(HOME_DIR, ".venv", "Scripts", "python.exe") : path.join(HOME_DIR, ".venv", "bin", "python"));
export const PROFILE = path.join(HOME_DIR, "browser-profile");
export const MODELS = path.join(HOME_DIR, "models");
export const FFMPEG = process.env.VIDEO_STUDIO_FFMPEG || "ffmpeg";
// playwright-core lives in the data folder (put there by install/install.mjs), not in the plugin.
export const NODE_DIR = path.join(HOME_DIR, "node");
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const INSTALL_CMD = `node "${path.join(SKILL_DIR, "install", "install.mjs")}"`;
export const SETUP_DOC = path.join(SKILL_DIR, "reference", "setup.md");

// Pinned dependencies: the one source of truth for install.mjs and doctor.mjs. reference/setup.md
// repeats them for manual setup; tools/build_zip.py refuses to build if it has drifted.
export const PLAYWRIGHT_PIN = "playwright-core@1.60.0";
export const PY_PACKAGES = ["kokoro-onnx==0.6.1", "soundfile==0.14.0", "numpy>=1.26,<3"];
export const MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
export const MODEL_FILES = {
	"kokoro-v1.0.onnx": { size: 325532387, sha256: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5" },
	"voices-v1.0.bin": { size: 28214398, sha256: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d" },
};

/** SHA-256 of a file, read in 4 MB chunks so large models never sit in memory. */
export const sha256File = (file) => {
	const h = createHash("sha256");
	const fd = fs.openSync(file, "r");
	const buf = Buffer.alloc(1 << 22);
	try {
		for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
	} finally {
		fs.closeSync(fd);
	}
	return h.digest("hex");
};

/** Load playwright-core from the data folder; fall back to normal resolution (for development). */
export const loadPlaywright = () => {
	for (const base of [path.join(NODE_DIR, "package.json"), import.meta.url]) {
		try {
			return createRequire(base)("playwright-core");
		} catch {}
	}
	throw new Error(`playwright-core is not installed. Run the installer: ${INSTALL_CMD}`);
};

const exists = (p) => {
	try {
		return !!p && fs.existsSync(p);
	} catch {
		return false;
	}
};

const pf = process.env.PROGRAMFILES || "C:\\Program Files";
const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

const CANDIDATES = {
	chrome: MAC
		? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
		: WIN
			? [path.join(pf, "Google/Chrome/Application/chrome.exe"), path.join(pf86, "Google/Chrome/Application/chrome.exe"), path.join(local, "Google/Chrome/Application/chrome.exe")]
			: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
	msedge: MAC
		? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
		: WIN
			? [path.join(pf86, "Microsoft/Edge/Application/msedge.exe"), path.join(pf, "Microsoft/Edge/Application/msedge.exe")]
			: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/opt/microsoft/msedge/msedge"],
};

/** Which browser to drive: { name, launch } where launch is spread into Playwright's launch options. */
export const browser = () => {
	const want = process.env.VIDEO_STUDIO_BROWSER;
	if (want && want !== "chrome" && want !== "msedge" && want !== "bundled") return { name: want, launch: { executablePath: want } };
	if (want === "bundled") return { name: "bundled Chromium", launch: {} };
	for (const ch of want ? [want] : ["chrome", "msedge"]) if (CANDIDATES[ch].some(exists)) return { name: ch === "chrome" ? "Google Chrome" : "Microsoft Edge", launch: { channel: ch } };
	return { name: "bundled Chromium", launch: {} }; // the installer downloads it when no Chrome or Edge is found
};

export const browserCandidates = CANDIDATES;
