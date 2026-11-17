# Recording apps: practice and pitfalls

## Rehearse before you record

Explore each screen first: open it, list its buttons and headings, take a screenshot. Then script it. Write what you learn in `<project>/.claude/video-studio/NOTES.md`:
- what moves on by itself;
- which labels are drawn by CSS;
- which records are samples;
- what pops up.

Real AI calls on the person's account cost money or credits, so rehearse the clicks first and record a full take once.

## Sign-in

- `capture.mjs login --storyboard <file>` opens the recorder's own browser profile. The person signs in; the terminal says "Signed in" once the signed-in page has stayed open for 3 s.
- Some apps sign out every session when you sign out anywhere. Ask the person not to sign out of that account while recording.
- **Sessions expire.** A signed-out app often bounces to its home page and still passes every other check. `expectPath` catches it; run `login` again.
- Close any other browser using the recorder profile before recording: the profile is locked, and refresh tokens can be invalidated.

## Phones (iPhone)

- Record a phone as a phone: `device: { mobile: true, userAgent: <iPhone Safari UA> }`, `viewport {393, 600, 2.748}`, `layout: "iphone"`.
- The app serves its mobile layout: menus behind ☰, bottom sheets, step pickers. **Re-script every scene**; desktop selectors rarely carry over.
- Taps replace clicks; `move` is skipped.
- Mobile flows may run several steps on one screen. Record them in one take and split them into scenes with `source` + `trim`.
- Find the split points from a contact sheet of the frames.
- The real iOS Simulator needs Xcode (macOS only, more than 10 GB) and cannot use the scripted microphone, so the emulated iPhone is the default.

## Voice agents

- **Screen recordings carry no sound.** The agent's spoken replies are saved from the network (`agentAudio`), and `audio-hooks.js` logs when each starts playing, so it lands at the right moment.
- **The fake microphone** stays silent until `{do: "say"}` plays one clip. A looping fake-audio file would trigger barge-in and cut the agent off.
- **Browser speech fallbacks cannot be captured**; the take is flagged for a re-shoot. Blank "unlock" utterances are ignored.
- Start a `realtime` scene with `waitNarration` (or `focus` with `ms: "narration"`), so the narrator and the agent never overlap.
- **User-voice clips:** a real person's recording sounds most natural. A synthetic one must not be presented as a real customer.

## Pitfalls

- Playwright's loose text match ignores case and matches substrings: "Your draft" also matches "Writing your draft", and "Open" matches "Open navigation". Use `exact: true`.
- Labels drawn by CSS (`::before`, uppercase badges) are not page text. Wait for a real control instead.
- Toasts, chat bubbles and promo bars sit on top of targets: hide them.
- Polling for text from outside the page lags about 300 ms. `watchFor` observes inside the page.
- Dashboards and editors often scroll an inner panel, not the page: use `scrollBy`.
- Apps that advance by themselves: `watchFor` the next screen's heading with `mark: "end"`.
- A frame that stalls while the machine is busy is retried automatically. Avoid running other heavy jobs during a render.
