param([switch]$NoPause)
$ErrorActionPreference='Stop'
try {
    $bundle=$PSScriptRoot;$root=Split-Path $bundle -Parent;$runtime=Join-Path $root 'runtime'
    $manifest=Get-Content (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
    $pkg=@(Get-AppxPackage Raycast.Raycast|Where-Object {$_.Version -eq $manifest.appVersion -and $_.Architecture -eq 'X64'})
    if($pkg.Count -ne 1){throw 'Raycast 版本不匹配，请安装对应汉化包。'}
    $appRoot=Join-Path $pkg[0].InstallLocation 'Raycast'
    if((Get-FileHash (Join-Path $appRoot 'Raycast.dll')).Hash.ToLowerInvariant() -ne $manifest.hostSha256){throw '主程序指纹不匹配。'}
    $node=Join-Path $bundle 'node.exe'
    if((Get-FileHash $node).Hash.ToLowerInvariant() -ne $manifest.nodeSha256){throw '运行时指纹不匹配。'}
    $mutex=New-Object Threading.Mutex($false,'Local\Raycast-zh-CN-Watch')
    if(-not $mutex.WaitOne(0)){return}
    try{
        $statusPath=Join-Path $runtime 'status.json'
        if(Test-Path $statusPath){
            try{$status=Get-Content $statusPath -Raw -Encoding UTF8|ConvertFrom-Json}catch{$status=$null}
            if($status){$worker=Get-CimInstance Win32_Process -Filter "ProcessId=$($status.pid)" -ErrorAction SilentlyContinue;if($worker -and $worker.CommandLine.Contains((Join-Path $bundle 'agent.mjs'))){return}}
        }
        $config=Join-Path $runtime 'config.json'
        $settings=Get-Content $config -Raw -Encoding UTF8|ConvertFrom-Json
        if($settings.bundle -ne $bundle -or $settings.appRoot -ne $appRoot){throw '后台配置不匹配，请重新安装。'}
        Remove-Item -LiteralPath (Join-Path $runtime 'stop') -ErrorAction SilentlyContinue
        $process=Start-Process -FilePath $node -ArgumentList @('"'+(Join-Path $bundle 'agent.mjs')+'"','"'+$config+'"') -WindowStyle Hidden -RedirectStandardError (Join-Path $runtime 'error.log') -PassThru
        for($i=0;$i -lt 30;$i++){
            Start-Sleep -Milliseconds 200
            if($process.HasExited){throw '后台组件启动失败，请查看 error.log。'}
            if(Test-Path $statusPath){try{$status=Get-Content $statusPath -Raw -Encoding UTF8|ConvertFrom-Json;if($status.pid -eq $process.Id){return}}catch{}}
        }
        throw '后台组件未完成初始化。'
    }finally{$mutex.ReleaseMutex();$mutex.Dispose()}
}catch{
    if(Test-Path $runtime){[IO.File]::WriteAllText((Join-Path $runtime 'watch-error.log'),$_.Exception.Message)}
    if(-not $NoPause){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Raycast 汉化')|Out-Null}
    exit 1
}
