$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json
$releaseDir = Join-Path $projectRoot 'releases'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$archivePath = Join-Path $releaseDir "SiteKeep-v$($manifest.version)-chromium.zip"
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $runtimeFiles = @((Get-Item (Join-Path $projectRoot 'manifest.json'))) + @(Get-ChildItem (Join-Path $projectRoot 'src') -Recurse -File) + @(Get-ChildItem (Join-Path $projectRoot 'icons') -Recurse -File)
    foreach ($file in ($runtimeFiles | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = [DateTimeOffset]::new(2026, 9, 17, 0, 0, 0, [TimeSpan]::Zero)
        $entryStream = $entry.Open()
        try { $bytes = [System.IO.File]::ReadAllBytes($file.FullName); $entryStream.Write($bytes, 0, $bytes.Length) } finally { $entryStream.Dispose() }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output "Chromium ZIP: $archivePath"

# Verify the completed distribution against the runtime source, including bytes.
$checkArchive = [System.IO.Compression.ZipArchive]::new([System.IO.File]::OpenRead($archivePath), [System.IO.Compression.ZipArchiveMode]::Read)
try {
    $expectedNames = @($runtimeFiles | ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') } | Sort-Object)
    $actualNames = @($checkArchive.Entries.FullName | Sort-Object)
    if (Compare-Object $expectedNames $actualNames) { throw 'Unexpected archive contents' }
    foreach ($entry in $checkArchive.Entries) {
        $entryStream = $entry.Open()
        $memory = [System.IO.MemoryStream]::new()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $entryStream.CopyTo($memory)
            $sourceBytes = [System.IO.File]::ReadAllBytes((Join-Path $projectRoot $entry.FullName))
            if ([Convert]::ToBase64String($sha.ComputeHash($memory.ToArray())) -ne [Convert]::ToBase64String($sha.ComputeHash($sourceBytes))) { throw "Archive hash mismatch: $($entry.FullName)" }
        } finally { $sha.Dispose(); $entryStream.Dispose(); $memory.Dispose() }
    }
    $reader = [System.IO.StreamReader]::new($checkArchive.GetEntry('manifest.json').Open())
    try {
        $packedManifest = $reader.ReadToEnd() | ConvertFrom-Json
        if ($packedManifest.version -ne $manifest.version) { throw 'Archive manifest version mismatch' }
    } finally { $reader.Dispose() }
    Write-Output "Verified $($actualNames.Count) runtime files; manifest.json at root, version $($packedManifest.version), all SHA-256 hashes match."
} finally { $checkArchive.Dispose() }
