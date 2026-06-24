param(
  [string]$UserDataRoot = $(Join-Path $env:APPDATA "our-companion")
)

$ErrorActionPreference = "Stop"

$whisperRoot = Join-Path $UserDataRoot "whisper"
$binDir = Join-Path $whisperRoot "bin"
$modelDir = Join-Path $whisperRoot "models"
$binaryPath = Join-Path $binDir "whisper-cli.exe"
$modelPath = Join-Path $modelDir "ggml-tiny.en.bin"

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

$releaseVersion = "v1.7.4"
$releaseZip = Join-Path $env:TEMP "whisper-cpp-$releaseVersion.zip"
$releaseUrl = "https://github.com/ggerganov/whisper.cpp/releases/download/$releaseVersion/whisper-bin-x64.zip"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"

if (-not (Test-Path $binaryPath)) {
  Write-Host "Downloading whisper.cpp $releaseVersion..."
  Invoke-WebRequest -Uri $releaseUrl -OutFile $releaseZip
  $extractDir = Join-Path $env:TEMP "whisper-cpp-$releaseVersion"
  if (Test-Path $extractDir) {
    Remove-Item -Recurse -Force $extractDir
  }
  Expand-Archive -Path $releaseZip -DestinationPath $extractDir -Force

  $found = Get-ChildItem -Path $extractDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
  if (-not $found) {
    throw "whisper-cli.exe was not found in the downloaded archive."
  }
  Copy-Item -Path $found.FullName -Destination $binaryPath -Force
  Write-Host "Installed whisper-cli to $binaryPath"
} else {
  Write-Host "Whisper binary already present at $binaryPath"
}

if (-not (Test-Path $modelPath)) {
  Write-Host "Downloading ggml-tiny.en.bin..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
  Write-Host "Installed model to $modelPath"
} else {
  Write-Host "Whisper model already present at $modelPath"
}

Write-Host "Whisper setup complete."
