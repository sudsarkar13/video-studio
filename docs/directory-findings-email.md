To: directory@anthropic.com
Subject: video-studio plugin: verified-organization rule, validation findings, and category permission

Hello,

I submitted the plugin bundle sudsarkar13/video-studio (MIT, https://github.com/sudsarkar13/video-studio) to the Anthropic Directory from my individual paid account. Validation blocked it, and I'd like to understand the path forward. I couldn't find the rules below in the public docs (plugin submission guide, pre-submission checklist, directory policy), so I'm asking directly.

1. Verified-organization rule (blocking)
   The validator says: "the directory restricts scripts, programs, and other non-standard files to Verified organizations only. Unverified organizations are limited to Markdown, text, JSON, YAML, and specific image formats." It flagged skills/video-studio/install/install.ps1 and the "dependencies" field in skills/video-studio/package.json.
   - Where is this rule documented, and how does an organization (or an individual developer on a paid plan) become verified?
   - Once verified, are readable source scripts (.mjs, .py, .sh, .ps1) and a pinned package.json dependency (playwright-core 1.60.0) acceptable?

2. Holds I believe are false positives
   - "Uses a credential from the user's machine": the flagged item is a command-line option, --narration DIR (a folder of audio files the tool generated). No credential or environment variable is read or sent. The URL mentioned is the disclosed, checksum-verified download of an open-source voice model at install time.
   - "Image or font file that the plugin's code could run": the icon .claude-plugin/icon.png is only referenced by name in a Markdown doc. No code loads it. I'm happy to move docs out of the bundle if that clears it.

3. Warning: "download-and-run" in install.sh / install.ps1
   The installers create a Python environment, install pinned packages (npm, PyPI), and download two model data files that are verified against fixed SHA-256 checksums before use. Nothing downloaded is executed except the installed packages, and everything is disclosed in the README. Are install scripts like this in scope for directory plugins? If not, what pattern do you recommend?

4. Restricted category: AI generation of video and audio
   The plugin makes product demo, tutorial and short videos from the user's own web app, article or images. It narrates with an open-source text-to-speech model running locally and composes music from code. There is no face or voice cloning, no likeness of real people, no uploads and no telemetry. I'm asking for the written permission the policy requires, or guidance if it falls outside the category.

I'll make whatever changes are needed. Thank you.

Sudeepta Sarkar
https://sudeeptasarkar.in
