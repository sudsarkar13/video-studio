# Manual setup

The usual way to set up is the installer, `node <skill folder>/install/install.mjs`. This page does the same steps as plain commands, for people who want to see and approve each one, or when the installer fails. Run the doctor first (`node $S/doctor.mjs`), and do only the steps it reports as not ready.

The pinned values below must match `scripts/lib/paths.mjs`; `tools/build_zip.py` checks that before every release.

## Rules

- Before the first command, tell the person in a few lines what will be installed and where:
  - playwright-core (browser automation, from npm);
  - three Python packages (from PyPI);
  - the Kokoro voice model, about 350 MB (from GitHub).

  Everything goes into the data folder.
- Everything goes into the **data folder** (`DATA` below), never the skill folder. The doctor prints it on its first line. The default is `~/.local/share/video-studio`, or `%LOCALAPPDATA%\video-studio` on Windows; `VIDEO_STUDIO_HOME` overrides it.
- Use the exact versions, URLs and checksums below. Never change a pinned version or skip a checksum.
- Never install system software (Node, Python, ffmpeg, a browser) or use `sudo` without asking first. The doctor prints the command for their OS.
- On Windows, use PowerShell, and type `curl.exe`, not `curl`.

## Pinned versions

| What | Version | From |
|---|---|---|
| playwright-core | `1.60.0` | npm |
| kokoro-onnx | `0.6.1` | PyPI |
| soundfile | `0.14.0` | PyPI |
| numpy | `>=1.26,<3` | PyPI |
| Python | 3.10 to 3.13 (3.12 preferred) | already on the system, or via `uv` |

| Voice model file | SHA-256 |
|---|---|
| `kokoro-v1.0.onnx` | `7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5` |
| `voices-v1.0.bin` | `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` |

Model URL: `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/<file>`

## Step 1: browser automation library

Same command on every OS (quote `DATA`):

```
npm install --prefix "DATA/node" --no-audit --no-fund --save-exact playwright-core@1.60.0
```

## Step 2: Python environment

With `uv`, if `uv --version` works:

```
uv venv --python 3.12 "DATA/.venv"
uv pip install --python "DATA/.venv/bin/python" kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3"
```

On Windows the interpreter is `DATA\.venv\Scripts\python.exe`.

Without `uv`:

- macOS / Linux: use the first of `python3.12`, `python3.11`, `python3.13`, `python3.10` that exists.

  ```
  python3.12 -m venv "DATA/.venv"
  "DATA/.venv/bin/python" -m pip install kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3"
  ```

- Windows (PowerShell):

  ```
  py -3.12 -m venv "DATA\.venv"
  & "DATA\.venv\Scripts\python.exe" -m pip install kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3"
  ```

## Step 3: voice model (download, verify, then keep)

For each of the two files: download to a `.part` file, check its SHA-256 against the table, and rename it only if the checksum matches. If it does not match, delete the `.part` file, stop, and tell the person.

macOS / Linux (on Linux use `sha256sum` instead of `shasum -a 256`):

```
mkdir -p "DATA/models"
curl -L --fail -o "DATA/models/kokoro-v1.0.onnx.part" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
shasum -a 256 "DATA/models/kokoro-v1.0.onnx.part"
mv "DATA/models/kokoro-v1.0.onnx.part" "DATA/models/kokoro-v1.0.onnx"
```

Windows (PowerShell):

```
New-Item -ItemType Directory -Force "DATA\models"
curl.exe -L --fail -o "DATA\models\kokoro-v1.0.onnx.part" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
(Get-FileHash -Algorithm SHA256 "DATA\models\kokoro-v1.0.onnx.part").Hash
Move-Item "DATA\models\kokoro-v1.0.onnx.part" "DATA\models\kokoro-v1.0.onnx"
```

Then do the same for `voices-v1.0.bin`. On Windows, `Get-FileHash` prints the hash in upper case; compare it ignoring case. The doctor checks both checksums again.

## Step 4: browser (only if the doctor finds no Chrome or Edge)

Ask first. Installing Google Chrome is the better choice; if the person prefers not to, download Playwright's Chromium. It goes into Playwright's own cache folder (`ms-playwright` in the user's cache directory), not the data folder, so mention that:

```
node "DATA/node/node_modules/playwright-core/cli.js" install chromium
```

## Step 5: check

Run `node $S/doctor.mjs` again. When it says "Ready", continue with the intake.
