---
name: video-studio
description: Make videos automatically with open-source tools — software demos and product walkthroughs recorded live from a web app, blog or article to video, shorts/reels/TikToks, feature launches, tutorials and image slideshows. Desktop 16:9 or full-screen iPhone 9:16, full-length or "instant" cuts, with an open-source voiceover (Kokoro), royalty-free generated music, soft sound effects, captions and a logo end card. Use whenever someone asks for any video about a product, website, app, article or set of images — making, re-recording, shortening, re-voicing, re-scoring, captioning or adding a scene — or asks what kinds of video this can make. Starts by showing the menu of video types and asking what they need.
---

# Video Studio

One storyboard (JSON) drives everything. Narration is generated first, because its length sets each scene's length. App scenes are recorded live by script, card and image scenes are generated, then everything is composed, scored and mixed.

```
intake ─► new.mjs (storyboard) ─► tts.py narrate ─► capture.mjs record ─► compose.mjs ─► video.mp4 + .srt
          (type + format)          (voice, timings)   (app scenes only)    (layout, camera, cards,
                                                                             captions, music, effects)
```

Everything is open source or generated: Kokoro-82M (Apache-2.0) voices, music and effects composed by code (no licence attached), Playwright driving Chrome/Edge (or a bundled Chromium), and ffmpeg. Works on macOS, Linux and Windows. Nothing is tied to one product: brand, pages, words and steps all live in the storyboard.

`S` below is this skill's `scripts` folder; `PY` is the Python the installer made (the doctor prints it).

## 1. Check the install

Run `node $S/doctor.mjs`. If it is not ready, run the installer, `node <skill folder>/install/install.mjs` (the same command on macOS, Linux and Windows; the doctor prints the exact path), then run the doctor again. The installer only writes to the data folder, never to the skill folder. Ask the person before installing anything system-wide (ffmpeg, a browser, Node, Python); the doctor prints the exact command for their OS.

## 2. Intake: what video do they want?

Show the menu (`node $S/new.mjs --list`, summarised in plain words) and ask, with the question tool, only what you cannot infer:

1. **Type:** software demo, blog/article to video, short/reel, feature launch, tutorial, slideshow. (AI presenter from a photo is coming in a later phase; say so if asked.)
2. **Format:** `desktop` (16:9, YouTube, websites, decks) or `iphone` (9:16, full-screen iPhone: Reels, Shorts, TikTok, mobile). Make both if they want both.
3. **Length:** `full` and/or `instant` (about 45–60 s). Shorts are 15–60 s.
4. **Source:** the app URL and which features, or the article URL/text, or the images.
5. **Brand:** name, logo file, accent colour, end-card URL.
6. **Voice:** play `$PY -I $S/tts.py samples --out <dir>` (12 voices) and let them pick. **Music mood:** `light` (default) or `warm`.
7. **Captions:** burned in (reels: bold, 3 words per line; tutorials: subtle) or only an `.srt` file (demos).

Then say back the brief in a few lines (type, format, length, source, voice, captions) before producing.

## 3. Make the storyboard

`node $S/new.mjs --type <type> --format <desktop|iphone|vertical> --length <full|instant> --url <url> --name <brand> --logo <file> --out <project>/.claude/video-studio`

This writes a skeleton with the right layout, pacing, captions and scene order. Fill it in:
- **Narration:** one or two plain sentences per scene, about 140 words per minute.
- **Cards:** `card {kind: title|bullets|quote|stat, kicker, headline, body, bullets}`.
- **Images:** `image {src, from, to}`.
- **App scenes:** rehearse each screen first, then write `setup` (off camera) and `actions` (on camera). See `reference/storyboard.md`.

## 4. Produce

1. `$PY -I $S/tts.py narrate --storyboard <B> --voice <v> --out <W>/narration`
2. If the app needs a sign-in: `node $S/capture.mjs login --storyboard <B>` (the person signs in; it confirms when saved).
3. `node $S/capture.mjs record --storyboard <B> --narration <W>/narration --out <W>/capture [--scene a,b]` (app scenes only). Re-take any scene that prints `FAILED`.
4. `node $S/compose.mjs --storyboard <B> --capture <W>/capture --narration <W>/narration --out <W>/out/<name>.mp4`
5. **Review** a contact sheet of frames before sending (no real data, nothing hidden, no wrong page, end card right), then deliver where the person wants it.

Short cuts reuse the same recordings: a second storyboard with the same scene ids, shorter narration, `trim`, `voices: false` and faster `pacing`. Sound-only changes: add `--mix-only` (seconds, no re-render).

## Recipes

- **Software demo:** live app scenes; desktop uses camera moves (push-in, tilt, auto-zoom on clicks); **iPhone is product only** (status bar, app, Safari bar: no frame, titles, captions, zooms or end card).
- **Blog/article:** title card → the article page scrolling (an app scene with `goto` + `scroll`) → key-points card → quote card → call-to-action card. Write the narration from the article; never invent claims it does not make.
- **Short/reel:** a hook card (stat or bold claim) in the first 2 s, 2–4 quick app or image beats, bold captions, and a call-to-action card. Instant pacing, 15–60 s.
- **Feature launch:** "Introducing…" card, each change shown in the app (or as bullets), "Available now" card.
- **Tutorial:** a title card, then a step card plus an app scene for each step, then a recap card. Subtle captions on.
- **Slideshow:** image scenes with slow pans, a title card, captions if it will be watched muted.

## Rules

1. **Never film real customer or personal data.** Use sample records only; hide or crop anything real.
2. **Show only what the audience can use.** Hide internal, admin-only and unreleased features (`hideNav`, `hideText`, `hideSelectors`); `guardText` fails a take if a forbidden word appears. Never weaken a guard to get a take through.
3. **Every narration claim must be visible on screen**, or come from the source article. Change the words, not the facts.
4. **Signing in is the person's job.** Never type a password.
5. **Synthetic voices are not real people.** A generated voice may demonstrate a feature, never pose as a real customer. Do not clone a voice or animate a face without the owner's consent.
6. **Music:** the generated tracks are free to use. A track the person supplies must be licensed for their use.

## Where things go

- `<project>/.claude/video-studio/`: storyboards, `NOTES.md` (app quirks, sample records), voice clips and images. Small; can be committed.
- A git-ignored work folder (e.g. `scratch/video-studio/`) for narration, recordings and renders. Recordings run to gigabytes.
- The data folder (voice model, Python environment, recorder browser profile): `~/.local/share/video-studio` or `%LOCALAPPDATA%\video-studio`. Override with `VIDEO_STUDIO_HOME`.

## Reference

- `reference/storyboard.md`: every storyboard field, scene type, action, layout and the sound settings.
- `reference/recording.md`: rehearsing apps, voice agents, phones, sign-in and recorder pitfalls.
- `scripts/new.mjs --list`: the video types and what each needs.
