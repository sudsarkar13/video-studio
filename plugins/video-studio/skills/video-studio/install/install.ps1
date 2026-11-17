# Video Studio installer for Windows (PowerShell 5.1+). Safe to run again: it only adds what is missing.
#   powershell -ExecutionPolicy Bypass -File install.ps1           set everything up
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Check    only run the doctor
# Data goes to $env:VIDEO_STUDIO_HOME (default %LOCALAPPDATA%\video-studio). System packages (ffmpeg,
# a browser) are never installed for you.
param([switch]$Check)
$ErrorActionPreference = "Stop"

$SkillDir = Split-Path -Parent $PSScriptRoot
$Data = if ($env:VIDEO_STUDIO_HOME) { $env:VIDEO_STUDIO_HOME } else { Join-Path $env:LOCALAPPDATA "video-studio" }
$Venv = Join-Path $Data ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$Models = Join-Path $Data "models"
$BaseUrl = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
$Files = @{
	"kokoro-v1.0.onnx" = "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"
	"voices-v1.0.bin"  = "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"
}

function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "x $m" -ForegroundColor Red; exit 1 }

if ($Check) { node (Join-Path $SkillDir "scripts\doctor.mjs"); exit $LASTEXITCODE }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js 18 or newer is needed: winget install OpenJS.NodeJS.LTS" }
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { Fail "Node.js $nodeMajor is too old; 18 or newer is needed." }

New-Item -ItemType Directory -Force -Path $Data, $Models | Out-Null

Say "Browser automation library (playwright-core) in the skill folder"
Push-Location $SkillDir; npm install --no-audit --no-fund --silent; Pop-Location

Say "Python environment for the voice and music engines: $Venv"
if (-not (Test-Path $Py)) {
	if (Get-Command uv -ErrorAction SilentlyContinue) { uv venv --python 3.12 $Venv -q }
	elseif (Get-Command py -ErrorAction SilentlyContinue) {
		$made = $false
		foreach ($v in "3.12", "3.11", "3.13", "3.10") { py "-$v" -m venv $Venv 2>$null; if ($LASTEXITCODE -eq 0) { $made = $true; break } }
		if (-not $made) { Fail "No Python 3.10-3.13 found by the py launcher: winget install Python.Python.3.12 (or install uv)" }
	}
	elseif (Get-Command python -ErrorAction SilentlyContinue) { python -m venv $Venv }
	else { Fail "Python 3.10-3.12 is needed: winget install Python.Python.3.12 (or install uv)" }
}
if (Get-Command uv -ErrorAction SilentlyContinue) { uv pip install --python $Py -q kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3" }
else { & $Py -m pip install -q --upgrade pip; & $Py -m pip install -q kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3" }

foreach ($name in $Files.Keys) {
	$f = Join-Path $Models $name
	if ((Test-Path $f) -and ((Get-FileHash $f -Algorithm SHA256).Hash.ToLower() -eq $Files[$name])) { continue }
	Say "Downloading voice model file $name"
	Invoke-WebRequest -Uri "$BaseUrl/$name" -OutFile "$f.part" -UseBasicParsing
	if ((Get-FileHash "$f.part" -Algorithm SHA256).Hash.ToLower() -ne $Files[$name]) { Remove-Item "$f.part"; Fail "$name failed its checksum; download refused." }
	Move-Item -Force "$f.part" $f
}

Say "Browser"
Push-Location (Join-Path $SkillDir "scripts")
$browser = node -e "import('./lib/paths.mjs').then(m=>console.log(m.browser().name))"
Pop-Location
if ($browser -eq "bundled Chromium") {
	Say "No Google Chrome or Microsoft Edge found; downloading Playwright's Chromium"
	node (Join-Path $SkillDir "node_modules\playwright-core\cli.js") install chromium
} else { Write-Host "   using $browser" }

$ff = if ($env:VIDEO_STUDIO_FFMPEG) { $env:VIDEO_STUDIO_FFMPEG } else { "ffmpeg" }
if (-not (Get-Command $ff -ErrorAction SilentlyContinue)) {
	Write-Host ""
	Write-Host "ffmpeg is missing. Install it, then run this again:"
	Write-Host "   winget install Gyan.FFmpeg"
}

Write-Host ""
node (Join-Path $SkillDir "scripts\doctor.mjs")
