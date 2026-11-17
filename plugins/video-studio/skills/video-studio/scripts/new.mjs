// Video types and storyboard skeletons.
//   node new.mjs --list [--json]                          the catalogue (what each type is and needs)
//   node new.mjs --type <id> --out <dir> [options]        write <dir>/storyboard.json for that type
// Options: --format desktop|iphone|vertical   --length full|instant   --url <site or article>
//          --name <brand>  --logo <path>  --accent <#hex>  --title <headline>  --voice <kokoro voice>
import fs from "node:fs";
import path from "node:path";

const TYPES = {
	"software-demo": {
		name: "Software demo / product walkthrough",
		for: "Show a web app working, end to end, recorded live from the real product.",
		needs: ["App URL (live or localhost)", "A sign-in the owner completes once (if the app needs one)", "Sample data to show (never real customers)", "The features to cover, in order"],
		formats: ["desktop (16:9)", "iphone (9:16, full-screen iPhone)"],
		lengths: { full: "1:30-3:00", instant: "45-60 s" },
	},
	"blog-to-video": {
		name: "Blog or article to video",
		for: "Turn a blog post, article or doc page into a narrated video: title, the page scrolling, key points, a quote, call to action.",
		needs: ["Article URL or the text/markdown", "Optional cover image", "Brand name, logo and colours"],
		formats: ["desktop (16:9)", "vertical (9:16)"],
		lengths: { full: "1:00-2:30", instant: "30-60 s" },
	},
	"short-reel": {
		name: "Short / Reel / TikTok",
		for: "A punchy 15-60 s vertical clip: a hook in the first 2 seconds, 2-4 quick beats, big bold captions (most people watch muted), a call to action.",
		needs: ["The one message or feature to sell", "Footage source: app URL, screenshots or images", "Brand name and logo"],
		formats: ["iphone (9:16, app footage)", "vertical (9:16, cards and images)"],
		lengths: { full: "30-60 s", instant: "15-30 s" },
	},
	"feature-launch": {
		name: "Feature launch / release notes",
		for: "Announce what is new: an 'Introducing…' title, each change shown in the app or as a card, a closing call to action.",
		needs: ["The list of changes", "App URL for live footage (optional)", "Brand name, logo and colours"],
		formats: ["desktop (16:9)", "iphone (9:16)", "vertical (9:16)"],
		lengths: { full: "1:00-2:00", instant: "30-45 s" },
	},
	tutorial: {
		name: "Tutorial / how-to",
		for: "Teach one task step by step, with a chapter card per step and subtitles burned in so viewers can follow along.",
		needs: ["The task and its steps", "App URL and sample data", "Brand name and logo"],
		formats: ["desktop (16:9)", "iphone (9:16)"],
		lengths: { full: "2:00-5:00", instant: "60-90 s" },
	},
	slideshow: {
		name: "Image slideshow / photo story",
		for: "Narrated images with slow pans and captions: product photos, event recap, portfolio, a story told in pictures.",
		needs: ["The images (in order)", "What to say about each", "Brand name and logo (optional)"],
		formats: ["desktop (16:9)", "vertical (9:16)"],
		lengths: { full: "1:00-3:00", instant: "20-45 s" },
	},
	"avatar-presenter": {
		name: "AI presenter (talking photo) over the screen  [coming in a later phase]",
		for: "A presenter in the corner, animated from ONE photo, lip-synced to the script in the person's own cloned voice, explaining what happens on screen. No camera needed.",
		needs: ["A clear front-facing photo of the presenter", "A 10-30 s voice sample for cloning", "The presenter's consent (it must be their own face and voice, or documented permission)", "Where to run it: own NVIDIA GPU, CPU (slow), or a rented cloud GPU (costs money, uploads the photo and voice)"],
		formats: ["desktop (16:9)", "vertical (9:16)"],
		lengths: { full: "any", instant: "any" },
		comingSoon: true,
	},
};

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true)]] : acc), []));

if (args.list) {
	if (args.json) console.log(JSON.stringify(TYPES, null, 2));
	else
		for (const [id, t] of Object.entries(TYPES)) {
			console.log(`\n${id}: ${t.name}\n  ${t.for}\n  needs: ${t.needs.join("; ")}\n  formats: ${t.formats.join(", ")}\n  length: full ${t.lengths.full}, instant ${t.lengths.instant}`);
		}
	process.exit(0);
}

const type = args.type;
if (!TYPES[type] || !args.out) {
	console.error(`usage: node new.mjs --type <${Object.keys(TYPES).join("|")}> --out <dir> [--format desktop|iphone|vertical] [--length full|instant]`);
	process.exit(2);
}
if (TYPES[type].comingSoon) {
	console.error(`${type} is not available yet (later phase).`);
	process.exit(2);
}

const format = args.format || (type === "short-reel" ? "iphone" : "desktop");
const instant = args.length === "instant";
const url = args.url && args.url !== true ? args.url : "https://example.com";
const name = args.name && args.name !== true ? args.name : "Your Product";
const title = args.title && args.title !== true ? args.title : name;
const host = (() => {
	try {
		return new URL(url).host;
	} catch {
		return "";
	}
})();

const base = {
	title: `${title} (${type}, ${format}, ${instant ? "instant" : "full"})`,
	voice: args.voice && args.voice !== true ? args.voice : "bm_fable",
	speed: 1,
	baseUrl: url,
	brand: { name, ...(args.logo && args.logo !== true ? { logo: args.logo } : {}), colors: { bg: "#0b1f3f", bg2: "#13315f", accent: args.accent && args.accent !== true ? args.accent : "#d4a63a" } },
	viewport: { width: 1600, height: 900, scale: 2 },
	output: { width: 1920, height: 1080, fps: 30 },
	music: { mood: type === "short-reel" ? "light" : "light", bpm: type === "short-reel" ? 104 : 84, seed: 7, level: -30 },
	sfx: { click: true, transition: true, volume: 0.35 },
	...(instant ? { pacing: { lead: 0.35, tail: 0.5, rampSpeed: 15, endCard: 2.5, minScene: 2.5 } } : {}),
	hideNav: [],
	hideText: [],
	hideSelectors: ["[data-sonner-toast]"],
	guardText: [],
	agentAudio: null,
};
if (format === "iphone") Object.assign(base, { viewport: { width: 393, height: 600, scale: 2.748 }, device: { mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" }, layout: "iphone", iphone: { url: host, time: "9:41" } });
if (format === "vertical") base.layout = "vertical";
if (type === "short-reel") base.captions = { style: "bold", maxWords: 3 };
if (type === "tutorial" || (type === "slideshow" && format !== "desktop")) base.captions = { style: "subtle", maxWords: 9 };

const TODO = "TODO: rehearse this screen, then write its setup (off camera) and actions (on camera)";
const appScene = (id, label, narration) => ({ id, title: label, camera: format === "desktop" ? "auto-zoom" : "static", fit: "narration", label: { kicker: name, text: label }, narration, setup: [{ do: "goto", url: "/" }], actions: [{ do: "wait", ms: 2500 }], rehearse: TODO });
const card = (id, card, narration, extra = {}) => ({ id, type: "card", card, narration, ...extra });
const end = { headline: name, accent: "", sub: host };
const iphone = format === "iphone";
// The iPhone layout is product-only: no title cards or end card around the app.
const scenesFor = {
	"software-demo": () => [
		appScene("01-home", "Home page", `${name} in one sentence: what it does and for whom.`),
		appScene("02-feature-1", "First feature", "Show the first feature and what it gives the user."),
		appScene("03-feature-2", "Second feature", "Show the second feature."),
		{ ...appScene("04-feature-3", "Third feature", `Close on the strongest feature. ${name}: try it today.`), ...(iphone ? {} : { endCard: end }) },
	],
	"blog-to-video": () => [
		card("01-title", { kind: "title", kicker: name, headline: title, logo: true }, "One-line hook: why this article matters."),
		{ id: "02-article", title: "The article", camera: format === "desktop" ? "tilt-scroll" : "static", fit: "narration", narration: "Summarise the article's argument in two sentences.", setup: [{ do: "goto", url }], actions: [{ do: "wait", ms: 1500 }, { do: "scroll", to: 1800, ms: 6000 }], rehearse: "Check the article loads without a paywall or cookie wall; dismiss banners in setup." },
		card("03-points", { kind: "bullets", kicker: "Key points", headline: "What to take away", bullets: ["Point one", "Point two", "Point three"] }, "Read the three key points."),
		card("04-quote", { kind: "quote", headline: "The single best line from the article.", body: "Author name" }, "Introduce the quote."),
		card("05-cta", { kind: "title", kicker: "Read more", headline: `Full article on ${host || "our site"}`, logo: true }, "Call to action.", { endCard: end }),
	],
	"short-reel": () => [
		card("01-hook", { kind: "stat", headline: "3x", body: "The hook: a number or a bold claim" }, "Hook in under two seconds."),
		...(iphone || format === "vertical"
			? [appScene("02-beat-1", "Beat one", "First quick beat."), appScene("03-beat-2", "Beat two", "Second quick beat.")]
			: []),
		card("04-cta", { kind: "title", kicker: name, headline: "Try it free", logo: true }, "Call to action.", { endCard: end }),
	],
	"feature-launch": () => [
		card("01-intro", { kind: "title", kicker: "Introducing", headline: title, logo: true }, `Introducing ${title}.`),
		appScene("02-change-1", "What changed", "Show the first change in the app."),
		card("03-list", { kind: "bullets", kicker: "Also new", headline: "In this release", bullets: ["Change two", "Change three", "Change four"] }, "List the other changes."),
		card("04-cta", { kind: "title", kicker: name, headline: "Available now", logo: true }, "Where and how to get it.", { endCard: end }),
	],
	tutorial: () => [
		card("01-title", { kind: "title", kicker: "How to", headline: title, logo: true }, "What you will learn, in one sentence."),
		card("02-step-1-card", { kind: "title", kicker: "Step 1", headline: "First step" }, "Step one."),
		appScene("03-step-1", "Step 1", "Do step one in the app, narrating each click."),
		card("04-step-2-card", { kind: "title", kicker: "Step 2", headline: "Second step" }, "Step two."),
		appScene("05-step-2", "Step 2", "Do step two."),
		card("06-done", { kind: "bullets", kicker: "Recap", headline: "You can now", bullets: ["Result one", "Result two"] }, "Recap.", { endCard: end }),
	],
	slideshow: () => [
		card("01-title", { kind: "title", kicker: name, headline: title, logo: !!base.brand.logo }, "Opening line."),
		{ id: "02-image-1", type: "image", image: { src: "images/01.jpg" }, narration: "Say what the first picture shows." },
		{ id: "03-image-2", type: "image", image: { src: "images/02.jpg", from: { scale: 1.12, x: 2 }, to: { scale: 1, x: 0 } }, narration: "Second picture." },
		{ id: "04-image-3", type: "image", image: { src: "images/03.jpg" }, narration: "Third picture.", endCard: end },
	],
};

let scenes = scenesFor[type]();
// iPhone demos are product-only (no cards around the app); reels keep their hook and call to action.
if (iphone && type === "software-demo") scenes = scenes.filter((s) => s.type !== "card");
const board = { ...base, scenes };
fs.mkdirSync(args.out, { recursive: true });
const file = path.join(args.out, instant ? "storyboard-instant.json" : "storyboard.json");
if (fs.existsSync(file) && !args.force) {
	console.error(`${file} exists; pass --force to overwrite`);
	process.exit(1);
}
fs.writeFileSync(file, JSON.stringify(board, null, 2) + "\n");
console.log(`wrote ${file}: ${type}, ${format}, ${instant ? "instant" : "full"}, ${scenes.length} scenes. Fill in the narration and the TODO steps.`);
