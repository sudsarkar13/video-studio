# Video Studio

A Claude Code plugin that makes videos with open-source tools on your own machine: software demos recorded live from your web app, blog or article to video, shorts/reels, feature launches, tutorials and image slideshows. It works in desktop 16:9 or full-screen iPhone 9:16, with an open-source voiceover, royalty-free generated music and captions.

**Full documentation:** [plugins/video-studio/README.md](plugins/video-studio/README.md). It covers what it makes, requirements, privacy, and everything it runs, sends and fetches.

## Install

As a Claude Code plugin:

```
/plugin marketplace add sudsarkar13/video-studio
/plugin install video-studio@video-studio
```

Or download the zip from https://sudeeptasarkar.in, unzip it into `~/.claude/skills/`, and run `node ~/.claude/skills/video-studio/install/install.mjs` (the same installer on macOS, Linux and Windows).

## Platform status

Tested on **macOS**. **Linux and Windows are written for but not yet tested.** Please help: open a [Platform test report](https://github.com/sudsarkar13/video-studio/issues/new?template=platform-test.yml) or a [Bug report](https://github.com/sudsarkar13/video-studio/issues/new?template=bug-report.yml). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

- `plugins/video-studio/`: the plugin itself (manifest, icon, README, licence, the `video-studio` skill and its scripts). This is what gets installed and submitted.
- `.claude-plugin/marketplace.json`: makes this repo a plugin marketplace.
- `docs/`, `tools/`, `.github/`: maintainer notes, the zip builder and icon source, and the issue forms. These are not part of the plugin.

MIT licensed (see [LICENSE](LICENSE)).
