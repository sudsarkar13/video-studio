// Where Video Studio keeps its data and which tools it uses, on macOS, Linux and Windows.
// Everything can be overridden with environment variables:
//   VIDEO_STUDIO_HOME     data folder (voice model, Python environment, recorder browser profile)
//   VIDEO_STUDIO_PY       Python interpreter with kokoro-onnx, soundfile and numpy installed
//   VIDEO_STUDIO_BROWSER  chrome | msedge | bundled | an absolute path to a Chromium-based browser
//   VIDEO_STUDIO_FFMPEG   ffmpeg executable (default: "ffmpeg" on the PATH)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";

export const HOME_DIR =
	process.env.VIDEO_STUDIO_HOME ||
	(WIN ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "video-studio") : path.join(os.homedir(), ".local", "share", "video-studio"));

export const PY = process.env.VIDEO_STUDIO_PY || (WIN ? path.join(HOME_DIR, ".venv", "Scripts", "python.exe") : path.join(HOME_DIR, ".venv", "bin", "python"));
export const PROFILE = path.join(HOME_DIR, "browser-profile");
export const MODELS = path.join(HOME_DIR, "models");
export const FFMPEG = process.env.VIDEO_STUDIO_FFMPEG || "ffmpeg";

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
	return { name: "bundled Chromium", launch: {} }; // needs: node node_modules/playwright-core/cli.js install chromium (the installer does this)
};

export const browserCandidates = CANDIDATES;
