param([ValidateSet('install','uninstall','status')][string]$Action='install',[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$product='Raycast-zh-CN-Windows'
$installRoot=Join-Path $env:USERPROFILE '.raycast-zh-CN'
# Packaged parent processes can redirect LocalAppData writes into their private
# LocalCache. Prefer the physical legacy directory so Explorer sees the same files.
$legacyRoots=@()
$packages=Join-Path $env:USERPROFILE 'AppData/Local/Packages'
foreach($package in @(Get-ChildItem -LiteralPath $packages -Directory -ErrorAction SilentlyContinue)){
    $candidate=Join-Path $package.FullName 'LocalCache/Local/Raycast-zh-CN'
    if(Test-Path -LiteralPath (Join-Path $candidate 'installation.json')){$legacyRoots+=$candidate}
}
$legacyRoots+=Join-Path $env:LOCALAPPDATA 'Raycast-zh-CN'
if(-not(Test-Path -LiteralPath (Join-Path $installRoot 'installation.json'))){
    foreach($candidate in $legacyRoots){
        $candidateMarker=Join-Path $candidate 'installation.json'
        if(Test-Path -LiteralPath $candidateMarker){
            $candidateRecord=Get-Content -LiteralPath $candidateMarker -Raw -Encoding UTF8|ConvertFrom-Json
            if($candidateRecord.product -eq $product){$installRoot=[IO.Path]::GetFullPath($candidate);break}
        }
    }
}
$markerPath=Join-Path $installRoot 'installation.json'
$nativeRoot=Join-Path $env:LOCALAPPDATA 'Packages/Raycast.Raycast_qypenmj9wpt2a/LocalState/Raycast-zh-CN'
$uninstallKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/Raycast-zh-CN'
$desktop=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Raycast（简体中文）.lnk'
$startMenu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Raycast（简体中文）.lnk'
$runKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Run'
function WebView-Admin($Mode,$Record) {
    $script=Join-Path $PSScriptRoot 'webview-admin.ps1'
    $process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$script+'"'),'-Action',$Mode,'-UserSid',$Record.userSid,'-Port',$Record.port) -Wait -PassThru
    if($process.ExitCode -ne 0){throw 'Raycast 加载配置未完成。请允许管理员授权；若已有或手动修改过 WebView2 配置，请先检查该配置。'}
}
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
            else {Write-Host '界面汉化：等待原版 Raycast 启动。'}
        }
        Write-Host '此版本从原版入口启动；托盘右键菜单保留英文。'
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
        if($marker.originalEntry){WebView-Admin 'uninstall' $marker}
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
        $runtime=Safe-Child 'runtime'
        if(Test-Path -LiteralPath $runtime){Set-Content -LiteralPath (Join-Path $runtime 'stop') -Value 'stop' -Encoding ASCII}
        $statusFile=Join-Path $runtime 'status.json'
        if(Test-Path -LiteralPath $statusFile){
            $lastStatus=Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8|ConvertFrom-Json
            $worker=Get-CimInstance Win32_Process -Filter "ProcessId=$($lastStatus.pid)" -ErrorAction SilentlyContinue
            $workerAgent=(Safe-Child 'bundle/agent.mjs')
            if(Test-Path -LiteralPath $config){$workerAgent=(Get-Content -LiteralPath $config -Raw -Encoding UTF8|ConvertFrom-Json).bundle+'\agent.mjs'}
            if($worker -and $worker.CommandLine -and $worker.CommandLine.Contains($workerAgent)){
                $workerProcess=Get-Process -Id $lastStatus.pid -ErrorAction SilentlyContinue
                if($workerProcess -and -not $workerProcess.WaitForExit(15000)){throw '汉化进程正在退出，请稍后重试。'}
            }
        }
        $runValue=(Get-ItemProperty -LiteralPath $runKey -Name 'Raycast-zh-CN' -ErrorAction SilentlyContinue).'Raycast-zh-CN'
        $watchPaths=@((Safe-Child 'bundle/watch.ps1'))
        if(Test-Path -LiteralPath $config){$watchPaths+=Join-Path ((Get-Content -LiteralPath $config -Raw -Encoding UTF8|ConvertFrom-Json).bundle) 'watch.ps1'}
        if($runValue -and @($watchPaths|Where-Object {$runValue.Contains($_)}).Count -gt 0){Remove-ItemProperty -LiteralPath $runKey -Name 'Raycast-zh-CN'}
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
        foreach($name in @('config.json','status.json','native-status.json','error.log','watch-error.log','stop')) { $file=Safe-Child ('runtime/'+$name);if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file} }
        Remove-Item -LiteralPath $markerPath
        foreach($dir in @((Safe-Child 'bundle'),$runtime,$installRoot)) {if((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force)){Remove-Item -LiteralPath $dir}}
        if(-not $NoLaunch) { $pkg=Get-AppxPackage Raycast.Raycast;if($pkg){Start-Process -FilePath (Join-Path $pkg.InstallLocation 'Raycast/Raycast.exe')} }
        Write-Host '汉化已卸载，官方 Raycast 文件始终保持原样。' -ForegroundColor Green
        exit 0
    }
    if($marker) {Write-Host '汉化已经安装。更新前请先卸载旧版。';exit 0}
    if(Test-Path -LiteralPath $installRoot) {
        $existing=@(Get-ChildItem -LiteralPath $installRoot -Recurse -Force)
        if(@($existing | Where-Object {-not $_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)}).Count -gt 0){throw '目标目录已有文件但没有有效安装标记，请检查目录后再安装。'}
    }
    if(Get-Process Raycast -ErrorAction SilentlyContinue){throw '请先从 Raycast 托盘菜单选择 Quit／退出，然后安装。'}
    if((Get-ItemProperty -LiteralPath $runKey -Name 'Raycast-zh-CN' -ErrorAction SilentlyContinue).'Raycast-zh-CN'){throw '同名后台启动配置已存在，未覆盖。'}
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
    $files=@('manifest.json','inject.js','agent.mjs','launch.ps1','setup.ps1','watch.ps1','webview-admin.ps1','plugin-patcher.cjs','plugin-transform.cjs','plugin-scopes.cjs','plugin-dictionary.json','acorn.cjs','Acorn-LICENSE.txt','extensions.json','使用说明.md','THIRD-PARTY-NOTICES.md')
    $port=0
    for($attempt=0;$attempt -lt 30;$attempt++){
        $candidate=Get-Random -Minimum 40000 -Maximum 60001
        $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$candidate)
        try{$listener.Start();$port=$candidate;break}catch{}finally{$listener.Stop()}
    }
    if(-not $port){throw '没有找到可用的本机加载端口。'}
    $record=@{product=$product;version=$manifest.patchVersion;nativeHook=$false;originalEntry=$false;userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;port=$port;files=@($files|ForEach-Object{'bundle/'+$_})+@('bundle/node.exe')}
    Write-Utf8 $markerPath ($record|ConvertTo-Json -Depth 5)
    try {
        foreach($file in $files){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $bundle $file)}
        # MSIX does not allow external processes to execute its private Node.
        # Copy the user's existing runtime locally; it is not shipped in the ZIP.
        Copy-Item -LiteralPath (Join-Path $root 'backend/node.exe') -Destination (Join-Path $bundle 'node.exe')
        $runtime=Join-Path $installRoot 'runtime';New-Item -ItemType Directory -Path $runtime -Force|Out-Null
        Write-Utf8 (Join-Path $runtime 'config.json') (@{bundle=$bundle;appRoot=$root;port=$port;resident=$true}|ConvertTo-Json)
        WebView-Admin 'install' $record
        $record.originalEntry=$true;Write-Utf8 $markerPath ($record|ConvertTo-Json -Depth 5)
        $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        if(-not(Test-Path -LiteralPath $runKey)){New-Item -Path $runKey -Force|Out-Null}
        New-ItemProperty -LiteralPath $runKey -Name 'Raycast-zh-CN' -Value ('"'+$powershell+'" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $bundle 'watch.ps1')+'" -NoPause') -PropertyType String -Force|Out-Null
        New-Item -Path $uninstallKey -Force | Out-Null
        $values=@{DisplayName='Raycast 简体中文组件';DisplayVersion=$manifest.patchVersion;Publisher='zwjtano';InstallLocation=$installRoot;
            UninstallString='"'+$powershell+'" -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $bundle 'setup.ps1')+'" -Action uninstall'}
        foreach($key in $values.Keys){New-ItemProperty -LiteralPath $uninstallKey -Name $key -Value $values[$key] -PropertyType String -Force|Out-Null}
    } catch {
        # The marker records partial installs too, so the same uninstaller can recover.
        throw ('安装未完成，可运行卸载工具清理。原因：'+$_.Exception.Message)
    }
    $global:LASTEXITCODE=0; & (Join-Path $bundle 'watch.ps1') -NoPause
    if($LASTEXITCODE -ne 0){throw '后台组件启动失败，请检查状态。'}
    Write-Host '安装完成。以后直接从原版 Raycast 图标启动，不创建中文快捷方式。' -ForegroundColor Green
    if(-not $NoLaunch){ $global:LASTEXITCODE=0; & (Join-Path $bundle 'launch.ps1') -NoPause; if($LASTEXITCODE -ne 0){exit 1} }
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
