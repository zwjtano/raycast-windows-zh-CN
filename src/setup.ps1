param([ValidateSet('install','uninstall','status')][string]$Action='install',[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$product='Raycast-zh-CN-Windows'
$installRoot=Join-Path $env:LOCALAPPDATA 'Raycast-zh-CN'
$markerPath=Join-Path $installRoot 'installation.json'
$nativeRoot=Join-Path $env:LOCALAPPDATA 'Packages/Raycast.Raycast_qypenmj9wpt2a/LocalState/Raycast-zh-CN'
$uninstallKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/Raycast-zh-CN'
$desktop=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Raycast（简体中文）.lnk'
$startMenu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Raycast（简体中文）.lnk'
function Write-Utf8($File,$Text) { [IO.File]::WriteAllText($File,$Text,(New-Object Text.UTF8Encoding($false))) }
function Read-Marker {
    if (-not (Test-Path -LiteralPath $markerPath)) { return $null }
    $marker=Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($marker.product -ne $product) {throw '安装标记不匹配，未执行任何删除。'}
    return $marker
}
function Safe-Child($Relative) {
    $full=[IO.Path]::GetFullPath((Join-Path $installRoot $Relative))
    if(-not $full.StartsWith($installRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {throw '非法安装路径。'}
    return $full
}
try {
    $marker=Read-Marker
    if($Action -eq 'status') {
        if(-not $marker) {Write-Host '尚未安装汉化。';exit 0}
        Write-Host ('已安装：'+$marker.version)
        $statusPath=Join-Path $installRoot 'runtime/status.json'
        if(Test-Path -LiteralPath $statusPath) {
            $s=Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8|ConvertFrom-Json
            $worker=Get-Process -Id $s.pid -ErrorAction SilentlyContinue
            if($worker -and $s.state -eq 'active'){Write-Host ('界面汉化：运行中；已加载中文资源 '+$s.intercepted+' 次。')}
            else {Write-Host '界面汉化：未运行。请使用中文快捷方式启动。'}
        }
        $nativeStatusPath=Join-Path $nativeRoot 'native-status.json'
        if(Test-Path -LiteralPath $nativeStatusPath) {
            $s=Get-Content -LiteralPath $nativeStatusPath -Raw -Encoding UTF8|ConvertFrom-Json
            Write-Host ('托盘菜单：最近一次启动已翻译 '+$s.translated+' 处文字。')
        }
        $pluginStatusPath=Join-Path $installRoot 'plugin-status.json'
        if(Test-Path -LiteralPath $pluginStatusPath) {
            $s=Get-Content -LiteralPath $pluginStatusPath -Raw -Encoding UTF8|ConvertFrom-Json
            foreach($entry in $s.extensions.PSObject.Properties){Write-Host ('插件 '+$entry.Name+'：已替换 '+$entry.Value+' 处显示文字。')}
            if($s.skipped.Count -gt 0){Write-Host ('有 '+$s.skipped.Count+' 个插件文件被跳过，详见 plugin-status.json。')}
        }
        exit 0
    }
    if($Action -eq 'uninstall') {
        if(-not $marker) {Write-Host '尚未安装，无需卸载。';exit 0}
        # End the app gracefully to remove all patched resources and the local debug endpoint.
        $agent=Safe-Child 'bundle/agent.mjs';$node=Safe-Child 'bundle/node.exe';$config=Safe-Child 'runtime/config.json'
        if((Test-Path -LiteralPath $agent) -and (Test-Path -LiteralPath $node) -and (Test-Path -LiteralPath $config)) {
            $quitRequested=(& $node $agent --quit $config 2>$null) -eq 'requested'
        }
        foreach($p in @(Get-Process Raycast -ErrorAction SilentlyContinue)) {
            if($quitRequested) {if(-not $p.WaitForExit(30000)){throw 'Raycast 正在退出，请稍后重试。'};continue}
            if(-not $p.WaitForExit(3000)) {
                if(-not $p.CloseMainWindow() -or -not $p.WaitForExit(20000)) {throw '请先保存内容并从托盘退出 Raycast，然后重试卸载。'}
            }
        }
        $patcher=Safe-Child 'bundle/plugin-patcher.cjs'
        if(Test-Path -LiteralPath $patcher){
            $restored=& $node $patcher restore $installRoot
            if($LASTEXITCODE -ne 0){throw '插件文件在汉化后被手动修改，未覆盖这些文件。已保留插件备份，请先处理冲突再卸载。'}
        }
        $runtime=Safe-Child 'runtime'
        if(Test-Path -LiteralPath $runtime) {Set-Content -LiteralPath (Join-Path $runtime 'stop') -Value 'stop' -Encoding ASCII;Start-Sleep -Milliseconds 1500}
        foreach($link in @($desktop,$startMenu)) {
            if(Test-Path -LiteralPath $link) {
                $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
                if($shortcut.Arguments.Contains($installRoot)) {Remove-Item -LiteralPath $link}
            }
        }
        if(Test-Path -LiteralPath $uninstallKey) {Remove-Item -LiteralPath $uninstallKey}
        if($marker.nativeHook -and (Test-Path -LiteralPath (Join-Path $nativeRoot 'owner.txt')) -and ([IO.File]::ReadAllText((Join-Path $nativeRoot 'owner.txt')).Trim() -eq $product)) {
            foreach($name in @('NativeMenuHook.dll','native-status.json','owner.txt','plugin-loader.cjs','plugin-transform.cjs','plugin-dictionary.json','acorn.cjs','plugin-status.json','extensions.json')) {
                $file=Join-Path $nativeRoot $name;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file}
            }
            if(-not (Get-ChildItem -LiteralPath $nativeRoot -Force)){Remove-Item -LiteralPath $nativeRoot}
        }
        # Remove only our tracked files; preserve any user-added files.
        foreach($relative in $marker.files) { $file=Safe-Child $relative; if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file} }
        foreach($name in @('config.json','status.json','native-status.json','error.log','stop')) { $file=Safe-Child ('runtime/'+$name);if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file} }
        Remove-Item -LiteralPath $markerPath
        foreach($dir in @((Safe-Child 'bundle'),$runtime,$installRoot)) {if((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force)){Remove-Item -LiteralPath $dir}}
        if(-not $NoLaunch) { $pkg=Get-AppxPackage Raycast.Raycast;if($pkg){Start-Process -FilePath (Join-Path $pkg.InstallLocation 'Raycast/Raycast.exe')} }
        Write-Host '汉化已卸载，官方 Raycast 文件始终保持原样。' -ForegroundColor Green
        exit 0
    }
    if($marker) {Write-Host '汉化已经安装。更新前请先卸载旧版。';exit 0}
    if(Test-Path -LiteralPath $installRoot) {throw '目标目录已经存在但没有有效安装标记，请检查目录后再安装。'}
    foreach($link in @($desktop,$startMenu)){if(Test-Path -LiteralPath $link){throw ('存在同名快捷方式，请先处理：'+$link)}}
    $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pkg=@(Get-AppxPackage Raycast.Raycast | Where-Object {$_.Version -eq $manifest.appVersion -and $_.Architecture -eq 'X64'})
    if($pkg.Count -ne 1){throw '此包仅适配 Microsoft Store 版 Raycast 2.4.0.0 x64。'}
    $root=Join-Path $pkg[0].InstallLocation 'Raycast'
    if((Get-FileHash -LiteralPath (Join-Path $root 'Raycast.dll')).Hash.ToLowerInvariant() -ne $manifest.hostSha256){throw '主程序指纹不匹配。'}
    if((Get-FileHash -LiteralPath (Join-Path $root 'backend/node.exe')).Hash.ToLowerInvariant() -ne $manifest.nodeSha256){throw '运行时指纹不匹配。'}
    foreach($property in $manifest.files.PSObject.Properties){
        if((Get-FileHash -LiteralPath (Join-Path $root ('frontend/'+$property.Name))).Hash.ToLowerInvariant() -ne $property.Value.sha256){throw ('资源指纹不匹配：'+$property.Name)}
    }
    $bundle=Join-Path $installRoot 'bundle'
    New-Item -ItemType Directory -Path $bundle -Force | Out-Null
    $files=@('manifest.json','inject.js','agent.mjs','launch.ps1','setup.ps1','NativeMenuHook.dll','plugin-patcher.cjs','plugin-transform.cjs','plugin-scopes.cjs','plugin-dictionary.json','acorn.cjs','Acorn-LICENSE.txt','extensions.json','使用说明.md','THIRD-PARTY-NOTICES.md')
    $record=@{product=$product;version=$manifest.patchVersion;nativeHook=$true;files=@($files|ForEach-Object{'bundle/'+$_})+@('bundle/node.exe')}
    Write-Utf8 $markerPath ($record|ConvertTo-Json -Depth 5)
    try {
        foreach($file in $files){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $bundle $file)}
        # MSIX does not allow external processes to execute its private Node.
        # Copy the user's existing runtime locally; it is not shipped in the ZIP.
        Copy-Item -LiteralPath (Join-Path $root 'backend/node.exe') -Destination (Join-Path $bundle 'node.exe')
        if(Test-Path -LiteralPath $nativeRoot) {
            $owner=Join-Path $nativeRoot 'owner.txt'
            if(-not (Test-Path -LiteralPath $owner) -or [IO.File]::ReadAllText($owner).Trim() -ne $product){throw '原生菜单模块目录已存在且不属于本安装器。'}
        } else {New-Item -ItemType Directory -Path $nativeRoot|Out-Null}
        Write-Utf8 (Join-Path $nativeRoot 'owner.txt') $product
        Copy-Item -LiteralPath (Join-Path $bundle 'NativeMenuHook.dll') -Destination (Join-Path $nativeRoot 'NativeMenuHook.dll')
        $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        foreach($link in @($desktop,$startMenu)) {
            $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
            $shortcut.TargetPath=$powershell
            $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $bundle 'launch.ps1')+'"'
            $shortcut.WorkingDirectory=$bundle;$shortcut.IconLocation=(Join-Path $root 'Raycast.exe')+',0';$shortcut.Save()
        }
        New-Item -Path $uninstallKey -Force | Out-Null
        $values=@{DisplayName='Raycast 简体中文组件（预览版）';DisplayVersion=$manifest.patchVersion;Publisher='zwjtano';InstallLocation=$installRoot;
            UninstallString='"'+$powershell+'" -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $bundle 'setup.ps1')+'" -Action uninstall'}
        foreach($key in $values.Keys){New-ItemProperty -LiteralPath $uninstallKey -Name $key -Value $values[$key] -PropertyType String -Force|Out-Null}
    } catch {
        # The marker records partial installs too, so the same uninstaller can recover.
        throw ('安装未完成，可运行卸载工具清理。原因：'+$_.Exception.Message)
    }
    Write-Host '安装完成。桌面已创建“Raycast（简体中文）”。' -ForegroundColor Green
    if(-not $NoLaunch){ $global:LASTEXITCODE=0; & (Join-Path $bundle 'launch.ps1') -NoPause; if($LASTEXITCODE -ne 0){exit 1} }
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
