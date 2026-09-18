param([switch]$NoPause)
$ErrorActionPreference = 'Stop'
try {
    $bundle = $PSScriptRoot
    $manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pkg = @(Get-AppxPackage Raycast.Raycast | Where-Object { $_.Version -eq $manifest.appVersion -and $_.Architecture -eq 'X64' })
    if ($pkg.Count -ne 1) { throw '未找到适配的 Raycast 2.4.0.0 x64。请安装对应版本的汉化包。' }
    $appRoot = Join-Path $pkg[0].InstallLocation 'Raycast'
    if ((Get-FileHash -LiteralPath (Join-Path $appRoot 'Raycast.dll')).Hash.ToLowerInvariant() -ne $manifest.hostSha256) { throw 'Raycast 主程序指纹不匹配，已停止加载。' }
    if ((Get-FileHash -LiteralPath (Join-Path $appRoot 'backend/index.mjs')).Hash.ToLowerInvariant() -ne $manifest.backendSha256) { throw 'Raycast 后端指纹不匹配，已停止加载。' }
    foreach ($property in $manifest.files.PSObject.Properties) {
        if ((Get-FileHash -LiteralPath (Join-Path $appRoot ('frontend/' + $property.Name))).Hash.ToLowerInvariant() -ne $property.Value.sha256) { throw ('资源指纹不匹配：' + $property.Name) }
    }
    $runtime = Join-Path (Split-Path $bundle -Parent) 'runtime'
    $nativeRoot=Join-Path $env:LOCALAPPDATA 'Packages/Raycast.Raycast_qypenmj9wpt2a/LocalState/Raycast-zh-CN'
    $hook=Join-Path $nativeRoot 'NativeMenuHook.dll'
    if((Get-FileHash -LiteralPath $hook).Hash.ToLowerInvariant() -ne $manifest.nativeHookSha256){throw '原生菜单模块指纹不匹配。'}
    foreach($file in $manifest.pluginFiles.PSObject.Properties){
        if((Get-FileHash -LiteralPath (Join-Path $bundle $file.Name)).Hash.ToLowerInvariant() -ne $file.Value){throw ('插件汉化模块指纹不匹配：'+$file.Name)}
    }
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $mutex = New-Object Threading.Mutex($false, 'Local\Raycast-zh-CN-Launcher')
    if (-not $mutex.WaitOne(0)) { throw '另一个汉化启动器正在运行，请稍后再试。' }
    try {
        $statusPath = Join-Path $runtime 'status.json'
        if (Test-Path -LiteralPath $statusPath) {
            $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$($status.pid)" -ErrorAction SilentlyContinue
            if ($status.state -eq 'active' -and $worker -and $worker.CommandLine.Contains((Join-Path $bundle 'agent.mjs'))) {
                Start-Process -FilePath (Join-Path $appRoot 'Raycast.exe')
                return
            }
        }
        # Request the host's graceful shutdown; never force-kill user sessions.
        $oldConfig=Join-Path $runtime 'config.json'
        if(Test-Path -LiteralPath $oldConfig) { $quitRequested=(& (Join-Path $bundle 'node.exe') (Join-Path $bundle 'agent.mjs') --quit $oldConfig 2>$null) -eq 'requested' }
        foreach ($process in @(Get-Process Raycast -ErrorAction SilentlyContinue)) {
            if($quitRequested){if(-not $process.WaitForExit(30000)){throw 'Raycast 正在退出，请稍后重试。'};continue}
            if(-not $process.WaitForExit(3000)) {
                if (-not $process.CloseMainWindow()) { throw '请先从托盘退出 Raycast，再打开“Raycast（简体中文）”。' }
                if (-not $process.WaitForExit(20000)) { throw 'Raycast 尚未退出。请保存当前内容并退出后再试。' }
            }
        }
        Set-Content -LiteralPath (Join-Path $runtime 'stop') -Value 'stop' -Encoding ASCII
        Start-Sleep -Milliseconds 1000
        Remove-Item -LiteralPath (Join-Path $runtime 'stop') -ErrorAction SilentlyContinue
        $node=Join-Path $bundle 'node.exe'
        if((Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant() -ne $manifest.nodeSha256){throw '汉化组件的运行时指纹不匹配，请重新安装。'}
        & $node (Join-Path $bundle 'plugin-patcher.cjs') apply (Split-Path $bundle -Parent) | Out-Null
        if($LASTEXITCODE -ne 0){throw '插件汉化失败，已保留备份。请查看组件目录。'}
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
        $listener.Start(); $port=$listener.LocalEndpoint.Port; $listener.Stop()
        $previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
        $previousHooks = $env:DOTNET_STARTUP_HOOKS
        $previousNativeStatus = $env:RAYCAST_ZH_NATIVE_STATUS
        if ($previousArguments -match 'remote-debugging') { throw '当前环境已有 WebView2 调试参数，请先移除冲突参数后重试。' }
        try {
            $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "$previousArguments --remote-debugging-port=$port --remote-debugging-address=127.0.0.1"
            $env:DOTNET_STARTUP_HOOKS = if($previousHooks){$previousHooks+';'+$hook}else{$hook}
            $env:RAYCAST_ZH_NATIVE_STATUS = Join-Path $nativeRoot 'native-status.json'
            Start-Process -FilePath (Join-Path $appRoot 'Raycast.exe')
        } finally { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments; $env:DOTNET_STARTUP_HOOKS = $previousHooks; $env:RAYCAST_ZH_NATIVE_STATUS = $previousNativeStatus }
        $ready=$false
        for($i=0;$i -lt 40;$i++) {
            Start-Sleep -Milliseconds 500
            try { $null=Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 1; $ready=$true;break } catch {}
        }
        if (-not $ready) { throw 'Raycast 未开放本机加载接口。已保留官方文件，请退出后重试。' }
        $main = @(Get-Process Raycast -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $appRoot 'Raycast.exe') })
        if ($main.Count -ne 1) { throw '无法唯一识别 Raycast 进程。' }
        $config = @{bundle=$bundle;appRoot=$appRoot;appPid=$main[0].Id;port=$port}
        $configPath=Join-Path $runtime 'config.json'
        [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
        $node=Join-Path $bundle 'node.exe'
        if((Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant() -ne $manifest.nodeSha256){throw '汉化组件的运行时指纹不匹配，请重新安装。'}
        $worker=Start-Process -FilePath $node -ArgumentList @('"'+(Join-Path $bundle 'agent.mjs')+'"','"'+$configPath+'"') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $runtime 'error.log')
        $active=$false
        for($i=0;$i -lt 30;$i++) {
            Start-Sleep -Milliseconds 500
            if ($worker.HasExited) { break }
            if (Test-Path -LiteralPath $statusPath) {
                $status=Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($status.pid -eq $worker.Id -and $status.state -eq 'active' -and $status.intercepted -gt 0) { $active=$true;break }
            }
        }
        if (-not $active) { throw ('中文加载未通过检查。查看日志：'+(Join-Path $runtime 'error.log')) }
        Write-Host '汉化已加载。以后请通过“Raycast（简体中文）”启动。' -ForegroundColor Green
    } finally { $mutex.ReleaseMutex();$mutex.Dispose() }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (-not $NoPause) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Raycast 汉化启动失败') | Out-Null
    }
    exit 1
}
