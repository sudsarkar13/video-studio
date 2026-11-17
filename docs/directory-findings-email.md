To: directory@anthropic.com
Subject: video-studio plugin: verified-organization rule and category permission

Hello,

I submitted the plugin bundle sudsarkar13/video-studio (version 0.1.4, MIT, https://github.com/sudsarkar13/video-studio) to the Anthropic Directory from my individual paid account. Validation blocked it, and I'd like to understand the path forward. I couldn't find the rules below in the public docs (plugin submission guide, pre-submission checklist, directory policy), so I am asking directly.

1. Verified-organization rule (blocking)
   The validator says unverified organizations may include only Markdown, text, JSON, YAML and certain image formats, and that scripts and programs need a Verified organization. It reports one file per run, and I've now seen it in three versions:
   - 0.1.1 flagged install/install.ps1 and the "dependencies" field in package.json;
   - 0.1.2, with those removed and one Node installer instead, flagged install/install.mjs;
   - 0.1.3, with no installer at all (setup is pinned commands in a Markdown file that Claude runs with the user's approval), flags scripts/audio-hooks.js.
   So the rule covers all code, and I've stopped rearranging files; 0.1.4 brings the installer back for convenience. The skill can't work without code: it drives a browser to record a web app, runs a local voice model and ffmpeg. The plugin contains readable, unminified source only (7 Node files, 3 Python files, one HTML page), MIT-licensed and public on GitHub, with no telemetry or uploads.
   - How does an individual developer on a paid plan become a Verified organization, or is there another route for open-source plugins like this one?
   - Where is the rule documented, so I can point contributors to it?

2. Restricted category: AI generation of video and audio
   The plugin makes product demo, tutorial and short videos from the user's own web app, article or images. It narrates with an open-source text-to-speech model running locally and composes music from code. This version has no face or voice cloning, no likeness of real people, no uploads and no telemetry. The README roadmap lists voice cloning and a talking avatar as possible later features; I won't add them to the directory version without checking with you first. I'm asking for the written permission the policy requires, or guidance if it falls outside the category.

I'll make whatever changes are needed. Thank you.

Sudeepta Sarkar
https://sudeeptasarkar.in
