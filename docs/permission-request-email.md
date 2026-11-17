To: directory@anthropic.com
Subject: Permission request: "Video Studio" plugin (AI-generated video and audio)

Hello,

I'd like to submit a Claude Code plugin, Video Studio (https://github.com/sudsarkar13/video-studio, MIT), to the Anthropic Directory. Your Software Directory Policy lists AI generation of video, audio or non-design images as a restricted category that needs written permission. I'm asking for that permission, or for guidance if the plugin falls outside the category.

What it does:
- It makes product demo, tutorial, feature-launch and short-form videos from a user's own web app, article or images.
- It records the user's web app with Playwright, narrates it with an open-source text-to-speech model (Kokoro-82M, Apache-2.0) running locally, composes background music from code (no samples), and renders an MP4 with ffmpeg.

Safeguards built in:
- Everything runs locally. No data is uploaded and there is no telemetry; the only network use is installing pinned dependencies and the voice model (SHA-256 verified).
- No face or voice cloning, and no likeness of real people. Its synthetic narrator voices are generic, and the skill's rules forbid presenting a synthetic voice as a real person.
- It uses sample data only, refuses to film content flagged by the user (for example admin-only screens), and requires every narrated claim to be visible on screen, so videos don't misrepresent the product.
- The user signs in to their own app themselves; the plugin never handles passwords.

Planned features (voice cloning, an animated presenter from a photo) will only be added with consent checks and AI-generated labelling, and I'll ask again before shipping them.

Can I submit it to the directory? Thank you.

Sudeepta Sarkar
https://sudeeptasarkar.in
