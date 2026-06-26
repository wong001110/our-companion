param(
  [string]$UserDataRoot = $(Join-Path $env:APPDATA "@our-companion\desktop")
)

$ErrorActionPreference = "Stop"

$whisperRoot = Join-Path $UserDataRoot "whisper"
$modelDir = Join-Path $whisperRoot "models"
$modelPath = Join-Path $modelDir "ggml-small.bin"
$legacyModelPath = Join-Path (Join-Path $env:APPDATA "our-companion\whisper\models") "ggml-small.bin"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"

New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

function Test-ValidModelFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $false }
  return (Get-Item $Path).Length -gt 1MB
}

Write-Host "Data dir : $UserDataRoot"

if (Test-ValidModelFile $modelPath) {
  Write-Host "Whisper model already present at $modelPath"
} elseif (Test-ValidModelFile $legacyModelPath) {
  Copy-Item -Path $legacyModelPath -Destination $modelPath -Force
  Write-Host "Migrated model from legacy location: $legacyModelPath"
} else {
  Write-Host "Downloading ggml-small.bin..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
  Write-Host "Installed model to $modelPath"
}

Write-Host "Whisper setup complete."
