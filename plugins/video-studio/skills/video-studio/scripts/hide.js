// Injected into every page (after window.__demoHide is set). Keeps the admin view looking like a
// regular user's view for the whole take: a MutationObserver re-applies the rules whenever React
// re-renders, so a hidden item cannot come back mid-scene.
//   labels:    nav entries hidden when their text is the label, optionally followed by a badge/count
//   texts:     floating widgets hidden when an element's whole text matches (hides its fixed-position box)
//   selectors: CSS selectors hidden outright (e.g. the WhatsApp button)
(() => {
	const cfg = window.__demoHide || {};
	const labels = cfg.labels || [];
	const texts = cfg.texts || [];
	const selectors = cfg.selectors || [];
	const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
	const BADGE = /^\s*(alpha|beta|new|\d+)?\s*$/i;

	const hideBox = (el) => {
		let box = el;
		for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === "fixed") box = p;
		if (box.style.visibility !== "hidden") box.style.setProperty("visibility", "hidden", "important");
	};

	const apply = () => {
		for (const el of document.querySelectorAll("nav a, nav button, aside a, aside button, [data-sidebar] a, [data-sidebar] button, header a, header button")) {
			const t = norm(el.innerText || el.textContent);
			if (labels.some((l) => t.startsWith(l) && BADGE.test(t.slice(l.length)))) {
				const item = el.closest("li") || el;
				if (item.style.display !== "none") item.style.setProperty("display", "none", "important");
			}
		}
		if (texts.length)
			for (const el of document.body.getElementsByTagName("*")) {
				const own = norm(el.textContent);
				if (texts.includes(own)) hideBox(el);
			}
		for (const sel of selectors) for (const el of document.querySelectorAll(sel)) hideBox(el);
	};

	let queued = false;
	const schedule = () => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			apply();
		});
	};
	const start = () => {
		apply();
		new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
	else start();
	window.__demoHideApply = apply;
})();
