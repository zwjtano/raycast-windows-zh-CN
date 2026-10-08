$ErrorActionPreference = 'Stop'
try {
    Write-Host '[1/2] 安装插件文件…'
    if (-not (Get-AppxPackage Raycast.Raycast)) { throw '请先安装 Microsoft Store 版 Raycast。' }
    $source = Join-Path $PSScriptRoot 'bundle'
    $manifest = Get-Content (Join-Path $source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.name -ne 'bilibili-search') { throw '安装包不匹配。' }
    $target = Join-Path $env:USERPROFILE '.config\raycast\extensions\bilibili-search'
    if (Test-Path (Join-Path $target 'package.json')) {
        $existing = Get-Content (Join-Path $target 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing.name -ne $manifest.name -or $existing.author -ne $manifest.author) { throw '目标目录已有其他插件，已停止安装。' }
        $backup = Join-Path $env:USERPROFILE ('.raycast-windows-plugins\backups\bilibili-search-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        Get-ChildItem -LiteralPath $target | Copy-Item -Destination $backup -Recurse -Force
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Get-ChildItem -LiteralPath $source | Copy-Item -Destination $target -Recurse -Force
    Write-Host '[2/2] 注册到 Raycast…'
    $cwdEncoded = [Uri]::EscapeDataString($target)
    # Same public protocol notifications used by the Raycast CLI.
    foreach ($eventName in @('start', 'build-success', 'stop')) {
        Start-Process -FilePath "raycast://cli/bilibili-search/$($eventName)?cwd=$cwdEncoded&info=" -WindowStyle Hidden
        Start-Sleep -Milliseconds 1200
    }
    Write-Host '安装请求已发送。请在 Raycast 搜索“哔哩哔哩”。' -ForegroundColor Green
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
