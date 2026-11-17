# Helping Video Studio

## Test it on your system

Video Studio is tested on **macOS** so far. **Linux and Windows have not been tested yet**, and reports from them are the most valuable help you can give.

1. Install it (plugin or zip, see the README) and run the doctor: `node <skill folder>/scripts/doctor.mjs`.
2. Try a small card video first (no recording needed), then a recording of any public website.
3. Open a **[Platform test report](https://github.com/sudsarkar13/video-studio/issues/new?template=platform-test.yml)**, even if everything worked. "Works on Ubuntu 24.04" is useful too.

Found something broken? Open a **[Bug report](https://github.com/sudsarkar13/video-studio/issues/new?template=bug-report.yml)**.

Never paste passwords, tokens, client data or private URLs into an issue.

## How reports are handled

The maintainer reads every issue, reproduces it, and applies and verifies fixes by hand before release. Fixes are noted in the issue and released as a new version. Pull requests are welcome as suggestions, but they are reviewed and applied the same way, not merged blindly.

## Releases

- The version lives in `.claude-plugin/plugin.json`.
- Plugin users get updates with `/plugin update video-studio`.
- The zip is rebuilt with `python3 tools/build_zip.py` and published on https://sudeeptasarkar.in.
