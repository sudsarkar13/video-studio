# Video Studio

A Claude Code skill that makes videos for you, using open-source tools on your own machine. Tell Claude what you need ("make a 60-second reel of our new feature", "turn this blog post into a video", "a demo of our app for the website"). It shows you the menu, asks a few questions, writes the script, records your app, voices it, adds music and renders the MP4.

## What it can make

| Video type | What you get | You provide | Formats | Length |
|---|---|---|---|---|
| **Software demo** | Your web app recorded live, with scripted clicks and typing and camera moves (desktop), or as a full-screen iPhone recording (mobile) | App URL, a sign-in (done by you), sample data, the features to show | 16:9 desktop, 9:16 iPhone | Full 1:30–3:00, instant 45–60 s |
| **Blog / article to video** | Title, the article scrolling, key points, a quote, a call to action | Article URL or text, brand | 16:9, 9:16 | 1:00–2:30 / 30–60 s |
| **Short / Reel / TikTok** | Hook in 2 seconds, quick beats, bold captions, call to action | The message, app URL or images, brand | 9:16 | 15–60 s |
| **Feature launch** | "Introducing…", each change shown, "Available now" | The changes, app URL (optional), brand | 16:9, 9:16 | 1:00–2:00 / 30–45 s |
| **Tutorial / how-to** | A step card plus a live step for each step, with subtitles | The task and its steps, app URL | 16:9, 9:16 | 2:00–5:00 / 60–90 s |
| **Slideshow** | Narrated images with slow pans and captions | Images, what to say | 16:9, 9:16 | 1:00–3:00 / 20–45 s |
| **AI presenter** *(coming)* | A presenter animated from one photo, lip-synced in your own cloned voice, explaining the screen | One photo, a 10–30 s voice sample, your consent, a GPU choice | 16:9, 9:16 | any |

Every video includes:
- a natural voiceover (12 open-source voices, American, British and Hindi-trained, male and female);
- royalty-free background music composed for that video, kept soft under the voice;
- subtle sound effects;
- captions (burned in, or a `.srt` file);
- your logo and colours.

Short "instant" cuts reuse the same recordings.

## Platform status

| System | Status |
|---|---|
| macOS (Apple Silicon) | **Tested.** Every video type, desktop and iPhone layouts, and the installer and doctor. |
| Linux | **Not tested yet.** Written for it (installer, paths, headless recording without a display), but never run. |
| Windows | **Not tested yet.** Written for it (PowerShell installer, Chrome/Edge detection, paths), but never run. |

**Please help test.** If you try it on Linux or Windows, open a [Platform test report](https://github.com/sudsarkar13/video-studio/issues/new?template=platform-test.yml), even if everything worked. Bugs go in a [Bug report](https://github.com/sudsarkar13/video-studio/issues/new?template=bug-report.yml). Every report is reproduced and fixed by hand; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Install

**Requirements:**
- macOS (tested), Linux or Windows (not yet tested; see Platform status);
- Node.js 18 or newer;
- Python 3.10–3.12, or [uv](https://docs.astral.sh/uv/);
- ffmpeg;
- Google Chrome or Microsoft Edge (otherwise a Chromium download is offered);
- about 1 GB of disk for the voice model, plus room for recordings (about 25 MB per second of footage).

### As a Claude Code plugin

```
/plugin marketplace add sudsarkar13/video-studio
/plugin install video-studio@video-studio
```

Then ask Claude for a video. The first time, it runs the installer, which sets up the voice model and checks everything.

### From the zip (sudeeptasarkar.in)

1. Download `video-studio-<version>.zip` and unzip it into your Claude skills folder:
   - macOS / Linux: `~/.claude/skills/`
   - Windows: `%USERPROFILE%\.claude\skills\`

   You should end up with `.claude/skills/video-studio/SKILL.md`.
2. Run the installer once:
   - macOS / Linux: `bash ~/.claude/skills/video-studio/install/install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\video-studio\install\install.ps1"`
3. Check it: `node ~/.claude/skills/video-studio/scripts/doctor.mjs`

The installer changes only the skill folder and a data folder (`~/.local/share/video-studio`, or `%LOCALAPPDATA%\video-studio` on Windows). It never installs system software for you; if ffmpeg or a browser is missing, the doctor prints the command for your OS.

## Example prompts

- "Make a 2-minute demo video of our app at https://app.example.com showing sign-up, the dashboard and reports."
- "Turn this blog post into a 60-second vertical video with captions: https://example.com/blog/launch"
- "Make a 30-second reel announcing our new export feature."
- "Make an instant iPhone version of the demo."
- "Re-voice the demo with a British female voice and quieter music."

## What it runs, sends and fetches

**Runs on your machine:**
- Node and Python scripts in this plugin.
- A Chromium-based browser (Chrome, Edge or Playwright's Chromium) driven by playwright-core, with its own profile in the data folder, separate from your normal browser.
- ffmpeg.
- The installers (`install/install.sh`, `install/install.ps1`). They create a Python environment in the data folder and run `npm install` in the plugin folder.

**Fetches over the network:**
- **At install:** npm and PyPI packages pinned in the installer; the Kokoro voice model (two files) from the kokoro-onnx GitHub release, checked against fixed SHA-256 checksums.
- **Only if needed:** Playwright's Chromium, if neither Chrome nor Edge is installed.
- **During recording:** only the URLs written in your storyboard.

**Sends:** nothing. There is no telemetry, analytics or upload. The narration, music and video are made on your machine, and the files stay in the folders you choose.

**Injects into recorded pages** (the recorder's own browser only):
- a helper that hides the elements you list;
- a microphone stand-in that plays only your own audio clips, for voice-agent demos;
- a logger for audio playback, so recorded voice replies line up.

**Data folder:** `~/.local/share/video-studio`, or `%LOCALAPPDATA%\video-studio` on Windows. It holds the Python environment, the voice model and the recorder's browser profile. Delete it to remove everything.

## Privacy and responsible use

- **Everything runs on your machine.** The voice, music and rendering are all local. The only downloads are the voice model and the libraries, both checksum-verified or from official package registries.
- **Recording uses its own browser profile.** You sign in yourself; passwords are never typed by the AI.
- **Use sample data, never real customers.** The skill can hide admin-only or unreleased features and refuse a take if a forbidden word appears.
- **Synthetic voices are not real people.** The coming AI-presenter feature will only animate a face and voice you own or have documented permission to use, and will label the video as AI-presented.

## Roadmap

1. **Phase 1 (this release):** video-type menu; desktop and iPhone demos; blog-to-video, reels, launches, tutorials and slideshows; cards, images and captions; cross-platform installer and doctor.
2. **Phase 2:** voice cloning from a short sample, with a commercially usable open-source model and consent recorded.
3. **Phase 3:** AI presenter from a photo, lip-synced, placed over the screen. You choose where it runs: your own NVIDIA GPU, your CPU (slow), or a rented cloud GPU (paid, and it uploads the photo and voice).

## Licence

MIT (see `LICENSE`). Third-party components keep their own licences: see `THIRD_PARTY.md`.
