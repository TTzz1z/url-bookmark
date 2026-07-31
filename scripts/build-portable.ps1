param(
  [switch]$KeepBuildOutput
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packageJsonPath = Join-Path $projectRoot "package.json"
$packageJson = Get-Content -Raw -Encoding UTF8 -LiteralPath $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version
$packageName = "url-bookmark-v$version-win-x64"
$distName = ".next-portable"
$distPath = Join-Path $projectRoot $distName
$releaseRoot = Join-Path $projectRoot "release"
$packageDirectory = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.zip"
$checksumPath = "$archivePath.sha256"
$nextEnvPath = Join-Path $projectRoot "next-env.d.ts"
$tsConfigPath = Join-Path $projectRoot "tsconfig.json"
$tsBuildInfoPath = Join-Path $projectRoot "tsconfig.tsbuildinfo"
$canvasShimDirectory = Join-Path $projectRoot "vendor\canvas-shim"
$canvasShimPaths = @(
  (Join-Path $canvasShimDirectory "package.json"),
  (Join-Path $canvasShimDirectory "index.js"),
  (Join-Path $canvasShimDirectory "index.d.ts")
)

function Assert-ExactChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Child
  )

  $resolvedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd("\")
  $resolvedChild = [System.IO.Path]::GetFullPath($Child)
  if (-not $resolvedChild.StartsWith("$resolvedParent\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to process a path outside the expected parent: $resolvedChild"
  }
}

function Remove-ExactFileSystemEntry {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  if ((Get-Item -LiteralPath $Path -Force).PSIsContainer) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  } else {
    Remove-Item -LiteralPath $Path -Force
  }
}

if ((& node -p "process.platform").Trim() -ne "win32" -or
    (& node -p "process.arch").Trim() -ne "x64") {
  throw "The portable package can currently be built only on Windows x64."
}

$nodeExecutable = (& node -p "process.execPath").Trim()
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw "The current Node.js executable was not found."
}

Assert-ExactChildPath -Parent $projectRoot -Child $distPath
Assert-ExactChildPath -Parent $projectRoot -Child $releaseRoot
Assert-ExactChildPath -Parent $releaseRoot -Child $packageDirectory
Assert-ExactChildPath -Parent $releaseRoot -Child $archivePath
Assert-ExactChildPath -Parent $releaseRoot -Child $checksumPath

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Remove-ExactFileSystemEntry -Path $distPath
Remove-ExactFileSystemEntry -Path $packageDirectory
Remove-ExactFileSystemEntry -Path $archivePath
Remove-ExactFileSystemEntry -Path $checksumPath

$nextEnvBytes = if (Test-Path -LiteralPath $nextEnvPath) {
  [System.IO.File]::ReadAllBytes($nextEnvPath)
} else {
  $null
}
$tsConfigBytes = [System.IO.File]::ReadAllBytes($tsConfigPath)
$tsBuildInfoBytes = if (Test-Path -LiteralPath $tsBuildInfoPath) {
  [System.IO.File]::ReadAllBytes($tsBuildInfoPath)
} else {
  $null
}
$canvasShimBytes = @{}
foreach ($canvasShimPath in $canvasShimPaths) {
  if (-not (Test-Path -LiteralPath $canvasShimPath)) {
    throw "The local canvas shim is incomplete: $canvasShimPath"
  }
  $canvasShimBytes[$canvasShimPath] = [System.IO.File]::ReadAllBytes($canvasShimPath)
}
$previousDistName = $env:NEXT_DIST_DIR

try {
  Write-Host "[1/5] Building the Next.js standalone application..."
  $env:NEXT_DIST_DIR = $distName
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "The Next.js production build failed with exit code $LASTEXITCODE."
  }
} finally {
  if ($null -eq $previousDistName) {
    Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
  } else {
    $env:NEXT_DIST_DIR = $previousDistName
  }
  if ($null -eq $nextEnvBytes) {
    Remove-ExactFileSystemEntry -Path $nextEnvPath
  } else {
    [System.IO.File]::WriteAllBytes($nextEnvPath, $nextEnvBytes)
  }
  [System.IO.File]::WriteAllBytes($tsConfigPath, $tsConfigBytes)
  if ($null -eq $tsBuildInfoBytes) {
    Remove-ExactFileSystemEntry -Path $tsBuildInfoPath
  } else {
    [System.IO.File]::WriteAllBytes($tsBuildInfoPath, $tsBuildInfoBytes)
  }
  New-Item -ItemType Directory -Force -Path $canvasShimDirectory | Out-Null
  foreach ($canvasShimPath in $canvasShimPaths) {
    [System.IO.File]::WriteAllBytes($canvasShimPath, $canvasShimBytes[$canvasShimPath])
  }
}

$standaloneDirectory = Join-Path $distPath "standalone"
$staticDirectory = Join-Path $distPath "static"
if (-not (Test-Path -LiteralPath (Join-Path $standaloneDirectory "server.js"))) {
  throw "The standalone output is incomplete: server.js was not found."
}
if (-not (Test-Path -LiteralPath $staticDirectory)) {
  throw "The standalone output is incomplete: static assets were not found."
}

Write-Host "[2/5] Assembling the portable directory..."
New-Item -ItemType Directory -Force -Path $packageDirectory | Out-Null
$standaloneEntries = @("server.js", "package.json", "node_modules", $distName)
foreach ($entryName in $standaloneEntries) {
  $entryPath = Join-Path $standaloneDirectory $entryName
  if (-not (Test-Path -LiteralPath $entryPath)) {
    throw "The standalone output is incomplete: $entryName was not found."
  }
  Copy-Item -LiteralPath $entryPath -Destination (Join-Path $packageDirectory $entryName) -Recurse -Force
}

# css-tree loads JSON data through dynamic CommonJS requires. Next.js file tracing
# sees the JavaScript entry points but can omit these data files, so copy both
# packages in full to keep jsdom's CSS parser functional in the standalone build.
$completeRuntimePackages = @("css-tree", "mdn-data")
foreach ($runtimePackage in $completeRuntimePackages) {
  $runtimePackageSource = Join-Path $projectRoot "node_modules\$runtimePackage"
  $runtimePackageTarget = Join-Path $packageDirectory "node_modules\$runtimePackage"
  if (-not (Test-Path -LiteralPath $runtimePackageSource)) {
    throw "Required runtime package was not found: $runtimePackage"
  }
  if (Test-Path -LiteralPath $runtimePackageTarget) {
    Remove-ExactFileSystemEntry -Path $runtimePackageTarget
  }
  New-Item -ItemType Directory -Force -Path $runtimePackageTarget | Out-Null
  Get-ChildItem -LiteralPath $runtimePackageSource -Force |
    Copy-Item -Destination $runtimePackageTarget -Recurse -Force
}

$cssTreePatch = Join-Path $packageDirectory "node_modules\css-tree\data\patch.json"
$mdnDataCss = Join-Path $packageDirectory "node_modules\mdn-data\css"
if (-not (Test-Path -LiteralPath $cssTreePatch)) {
  throw "Safety check failed: css-tree data/patch.json is missing from the package."
}
if (-not (Test-Path -LiteralPath $mdnDataCss)) {
  throw "Safety check failed: mdn-data/css is missing from the package."
}

$packagedStaticDirectory = Join-Path $packageDirectory "$distName\static"
New-Item -ItemType Directory -Force -Path $packagedStaticDirectory | Out-Null
Get-ChildItem -LiteralPath $staticDirectory -Force |
  Copy-Item -Destination $packagedStaticDirectory -Recurse -Force

$tracedDataDirectory = Join-Path $packageDirectory "data"
$tracedDataFiles = @(
  if (Test-Path -LiteralPath $tracedDataDirectory) {
    Get-ChildItem -LiteralPath $tracedDataDirectory -Recurse -File -Force
  }
)
if ($tracedDataFiles.Count -gt 0) {
  throw "Safety check failed: standalone tracing copied files from the source data directory."
}

$publicDirectory = Join-Path $projectRoot "public"
if (Test-Path -LiteralPath $publicDirectory) {
  Copy-Item -LiteralPath $publicDirectory -Destination (Join-Path $packageDirectory "public") -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot "drizzle") -Destination (Join-Path $packageDirectory "drizzle") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\portable-launcher.mjs") -Destination (Join-Path $packageDirectory "portable-launcher.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\start.bat") -Destination (Join-Path $packageDirectory "start.bat") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\backup.bat") -Destination (Join-Path $packageDirectory "backup.bat") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\restore.bat") -Destination (Join-Path $packageDirectory "restore.bat") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\PORTABLE-README.txt") -Destination (Join-Path $packageDirectory "README.txt") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination (Join-Path $packageDirectory "LICENSE.txt") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "CHANGELOG.md") -Destination (Join-Path $packageDirectory "CHANGELOG.md") -Force

$runtimeDirectory = Join-Path $packageDirectory "runtime"
$dataAssetsDirectory = Join-Path $packageDirectory "data\assets"
New-Item -ItemType Directory -Force -Path $runtimeDirectory, $dataAssetsDirectory | Out-Null
Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $runtimeDirectory "node.exe") -Force
Set-Content -LiteralPath (Join-Path $dataAssetsDirectory ".keep") -Value "" -Encoding ASCII

$manifest = [ordered]@{
  application = "url-bookmark"
  version = $version
  package = $packageName
  platform = "win32"
  architecture = "x64"
  node = (& node -p "process.version").Trim()
  builtAtUtc = [DateTime]::UtcNow.ToString("o")
  includesUserData = $false
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $packageDirectory "package-manifest.json") -Encoding UTF8

$unexpectedDatabases = @(Get-ChildItem -LiteralPath $packageDirectory -Recurse -File -Force |
  Where-Object { $_.Name -match '\.db(?:-wal|-shm|-journal)?$' })
if ($unexpectedDatabases.Count -gt 0) {
  throw "Safety check failed: a database file was found in the portable package."
}
$packagedDataFiles = @(Get-ChildItem -LiteralPath (Join-Path $packageDirectory "data") -Recurse -File -Force)
if ($packagedDataFiles.Count -ne 1 -or $packagedDataFiles[0].Name -ne ".keep") {
  throw "Safety check failed: the portable data directory is not empty."
}

Write-Host "[3/5] Validating the portable directory..."
& (Join-Path $runtimeDirectory "node.exe") --check (Join-Path $packageDirectory "portable-launcher.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "The portable launcher syntax check failed."
}

Write-Host "[4/5] Creating the ZIP archive..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $packageDirectory,
  $archivePath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $true
)

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
  $requiredEntries = @(
    "$packageName/server.js",
    "$packageName/start.bat",
    "$packageName/runtime/node.exe",
    "$packageName/portable-launcher.mjs",
    "$packageName/drizzle/0000_initial.sql",
    "$packageName/$distName/static/"
  )
  foreach ($requiredEntry in $requiredEntries) {
    if (-not ($entryNames | Where-Object { $_.StartsWith($requiredEntry, [System.StringComparison]::OrdinalIgnoreCase) })) {
      throw "ZIP validation failed; missing entry: $requiredEntry"
    }
  }
} finally {
  $archive.Dispose()
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$hash  $([System.IO.Path]::GetFileName($archivePath))" -Encoding ASCII

Write-Host "[5/5] Complete"
$fileCount = @(Get-ChildItem -LiteralPath $packageDirectory -Recurse -File -Force).Count
$archiveSize = [Math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 2)
Write-Host "Directory: $packageDirectory"
Write-Host "Archive: $archivePath ($archiveSize MB)"
Write-Host "Files: $fileCount"
Write-Host "SHA256: $hash"

if (-not $KeepBuildOutput) {
  Remove-ExactFileSystemEntry -Path $distPath
}
