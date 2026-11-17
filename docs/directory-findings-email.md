To: directory@anthropic.com
Subject: video-studio plugin: verified-organization rule and category permission

Hello,

I submitted the plugin bundle sudsarkar13/video-studio (MIT, https://github.com/sudsarkar13/video-studio) to the Anthropic Directory from my individual paid account. Validation blocked it, and I'd like to understand the path forward. I couldn't find the rules below in the public docs (plugin submission guide, pre-submission checklist, directory policy), so I'm asking directly.

1. Verified-organization rule (blocking)
   The validator says: "the directory restricts scripts, programs, and other non-standard files to Verified organizations only. Unverified organizations are limited to Markdown, text, JSON, YAML, and specific image formats." It flagged skills/video-studio/install/install.ps1 and the "dependencies" field in skills/video-studio/package.json.
   In version 0.1.2 I removed both and replaced them with one Node installer (install/install.mjs); the validator then flagged that file under the same rule.
   In version 0.1.3 there is no installer script at all. Setup is a list of plain, pinned commands in a Markdown file (skills/video-studio/reference/setup.md): npm install of playwright-core 1.60.0, a Python virtual environment with three pinned PyPI packages, and the voice model downloaded and checked against fixed SHA-256 checksums. Claude runs them one at a time with the user's approval, and the doctor script checks the checksums again. I made this change because the validator only ever flagged the installer, but I don't want to be getting past the scanner rather than meeting the rule.
   The skill cannot work without code. It drives a browser to record and runs ffmpeg and a local voice model, so the plugin still contains readable, unminified source: 7 Node files (.mjs/.js), 3 Python files and one HTML page. None of these download or install anything.
   - Where is this rule documented, and how does an organization (or an individual developer on a paid plan) become verified?
   - Is the 0.1.3 layout acceptable for an unverified publisher, or do the remaining source files also need verification?

2. Restricted category: AI generation of video and audio
   The plugin makes product demo, tutorial and short videos from the user's own web app, article or images. It narrates with an open-source text-to-speech model running locally and composes music from code. This version has no face or voice cloning, no likeness of real people, no uploads and no telemetry. The README roadmap lists voice cloning and a talking avatar as possible later features; I won't add them to the directory version without checking with you first. I'm asking for the written permission the policy requires, or guidance if it falls outside the category.

I'll make whatever changes are needed. Thank you.

Sudeepta Sarkar
https://sudeeptasarkar.in
