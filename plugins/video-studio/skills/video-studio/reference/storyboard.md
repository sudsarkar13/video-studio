# Storyboard reference

A storyboard is one JSON file. Paths inside it (logo, images, voice clips) are relative to the storyboard file.

## Top level

| Field | Meaning |
|---|---|
| `title` | Free text, for you. |
| `voice`, `speed` | Kokoro voice id (e.g. `bm_fable`, `af_heart`) and speed (0.9–1.1). |
| `baseUrl` | Where relative `goto` URLs point. |
| `layout` | `horizontal` (default, 16:9), `iphone` (9:16 full-screen iPhone), `vertical` (9:16 reframed from a desktop recording), `phone` (9:16 with a phone body and titles). |
| `viewport` | Recording size in CSS px and `scale`. Desktop `{1600, 900, 2}`; iPhone `{393, 600, 2.748}` (= 1080 × 1649). |
| `device` | `{ mobile: true, userAgent }` to record as a phone (touch, mobile layout). Use an iPhone Safari user agent for `iphone`. |
| `iphone` | `{ url, time }` shown in Safari's bar and the status bar (default: the site's host, 9:41). |
| `output` | `{ width, height, fps }` for horizontal (default 1920 × 1080 at 30). 9:16 layouts are always 1080 × 1920. |
| `pacing` | `{ lead, tail, rampSpeed, endCard, minScene }`. Defaults 0.5 s, 0.8 s, 6×, 3 s, 3 s. Instant cuts: `{0.35, 0.5, 15, 2.5, 2.5}`. |
| `brand` | `{ name, logo, colors: { bg, bg2, accent } }`: card and end-card colours, logo plate. |
| `music` | `{ mood: "light" or "warm", bpm, seed, level }`, `"generate"`, a licensed file path, or `null`. |
| `sfx` | `{ click, transition, volume }` or `false`. |
| `captions` | `{ style: "bold" or "subtle", position: "bottom" or "center", maxWords }` burns captions in. Leave it out for `.srt` only. |
| `hideNav` | Nav labels to hide (optionally followed by a badge/count): admin or internal menu items. |
| `hideText` | Exact texts whose floating box is hidden (help widgets, promo bars). |
| `hideSelectors` | CSS selectors to hide (chat bubbles, toasts such as `[data-sonner-toast]`). |
| `guardText` | Words that must never be on screen; a take fails if one appears (e.g. `["Alpha", "Internal"]`). |
| `agentAudio` | For voice agents: `{ urlIncludes, bodyMatch, audioField, languageField, extension }` names the network response that carries the agent's spoken reply (base64). |
| `login` | `{ start, successPath }` for `capture.mjs login` (default `/dashboard`). |

## Scene types

Every scene has `id`, `narration`, and optionally `title` and `minDuration` (the length when it has no narration).

- **App scene** (default): recorded live. Fields:
  - `setup`: steps off camera. `actions`: steps on camera.
  - `expectPath`: the take fails if the app leaves this page, e.g. because the session expired.
  - `camera`: `push-in`, `tilt-scroll`, `tilt-in`, `auto-zoom` or `static` (ignored in `iphone`).
  - `fit`: `narration` (footage fitted to the narration) or `realtime` (1×, silent gaps fast-forwarded).
  - `trim` `[from, to]`: use only that slice of the recording, in seconds.
  - `source`: reuse another scene's recording.
  - `voices: false`: drop recorded voices (agent replies, user clips).
  - `mic`: user-voice clips for voice agents.
  - `label`: the chapter title at the top in the `vertical`/`phone` layouts.
  - `caption`: an on-screen caption in horizontal.
- **Card** (`"type": "card"`): `card: { kind, kicker, headline, body, bullets, logo }`.
  - `kind`: `title`, `bullets` (revealed one by one), `quote` or `stat` (a big number).
  - `logo: true` shows the brand logo.
- **Image** (`"type": "image"`): `image: { src, fit: "cover" or "contain", from: {scale, x, y}, to: {scale, x, y} }`. A slow pan and zoom; `x` and `y` are in %.
- Any scene can end with `endCard: { headline, accent, sub }`, the logo end card. It is not shown in the `iphone` layout.

## Actions

`to` is `{ role, name, exact }`, `{ text, exact }` or `{ selector }`. Any action may be `"optional": true`.

| do | fields | effect |
|---|---|---|
| `goto` | `url` | navigate |
| `wait` | `ms` | pause |
| `waitFor` | `selector` / `text` / `to`, `timeout` | until visible |
| `waitGone` | `text` / `selector`, `timeout` | until it disappears (a "thinking…" indicator) |
| `waitEnabled` | `to`, `timeout` | until a button unlocks |
| `watchFor` | `text`, `mark` | non-blocking; an `end` mark cuts the scene just before the text appears (apps that move on by themselves) |
| `move` | `to`, `ms` | glide the cursor (desktop) |
| `click` | `to`, `ms` | click, or tap on a phone (logged for the tick, ripple and auto-zoom) |
| `type` | `to`, `text`, `delay` | click a field and type like a person |
| `scroll` / `scrollBy` | `to` / `px`, `ms` | eased scroll of the page / of the first inner scrolling panel |
| `focus` | `to`, `zoom`, `ms` or `"narration"` | camera push-in on an element (not in `iphone`) |
| `mark` | `name`: `ramp-start`, `ramp-end` | the stretch between plays at `rampSpeed` |
| `say` | `clip`, `after` | play a user-voice clip into the fake microphone |
| `waitAgent` | `timeout` | until a voice agent has replied and finished speaking |
| `waitNarration` | – | hold while the narrator speaks |

## Layouts

- **horizontal:** the app inside a browser card on a brand background, with camera moves (push-in, tilts, auto-zoom on clicks), a drawn cursor, click ripples and fades.
- **iphone:** the video *is* the iPhone screen. The iOS status bar (Dynamic Island, 9:41) and Safari's minimised bar are tinted to the page. No frame, background, titles, captions (unless `captions` is set), zooms or end card. Taps show as soft touch circles.
- **vertical:** reframes a desktop recording to 9:16 by panning to follow the action, with chapter labels and burned-in narration captions. Not a mobile view.
- **phone:** a mobile recording inside a phone body, with chapter titles and captions. Only when asked.

## Sound

- **Voices:** the narrator, user clips and agent replies are each levelled to −18 LUFS.
- **Music:** generated to the exact video length; soft pads and sparse bells, 140 Hz–2.8 kHz, so never deep. Levelled to `level` (−30) and ducked under voices. A different `seed` gives a different melody.
- **Effects:** a soft tick on clicks and a whoosh into each scene; they never duck the music.
- `compose.mjs … --mix-only` redoes only the sound, using the kept `.video.mp4`.

## Short (instant) cuts

Write a second storyboard with the same scene ids, so it reuses the recordings:
- one short line per scene (about 120–140 words for 60 s);
- instant `pacing`;
- `trim` long takes to their best seconds;
- `voices: false` where recorded speech would take too long.

Narrate it into its own folder. Keep footage under about 4× speed; `trim` is the cure.
