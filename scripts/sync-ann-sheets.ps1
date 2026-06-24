$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourceDir = Join-Path $root "assets\characters\ann\animations"
$targetDir = Join-Path $root "apps\desktop\renderer\public\assets\characters\ann\animations"

if (-not (Test-Path $sourceDir)) {
  throw "Source directory not found: $sourceDir"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$sheets = Get-ChildItem -Path $sourceDir -Filter "*.png" | Sort-Object Name

if ($sheets.Count -eq 0) {
  Write-Warning "No PNG sheets found in $sourceDir"
  exit 0
}

foreach ($sheet in $sheets) {
  Copy-Item -Force $sheet.FullName (Join-Path $targetDir $sheet.Name)
  Write-Output "Synced $($sheet.Name)"
}

Write-Output "Copied $($sheets.Count) sprite sheet(s) to renderer public assets."
