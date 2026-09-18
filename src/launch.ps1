param([switch]$NoPause)
$ErrorActionPreference='Stop'
try {
    & (Join-Path $PSScriptRoot 'watch.ps1') -NoPause
    Start-Process explorer.exe -ArgumentList 'shell:AppsFolder\Raycast.Raycast_qypenmj9wpt2a!Raycast'
    $root=Split-Path $PSScriptRoot -Parent;$active=$false
    for($i=0;$i -lt 60;$i++){
        Start-Sleep -Milliseconds 500
        $file=Join-Path $root 'runtime/status.json'
        if(Test-Path $file){try{$status=Get-Content $file -Raw -Encoding UTF8|ConvertFrom-Json}catch{continue};if($status.state -eq 'active' -and $status.pages -gt 0 -and $status.intercepted -gt 0){$active=$true;break}}
    }
    if(-not $active){throw '原版已启动，但中文加载尚未通过检查。请查看组件状态。'}
    Write-Host '汉化已加载。以后直接从原版 Raycast 启动。' -ForegroundColor Green
}catch{
    Write-Host $_.Exception.Message -ForegroundColor Red
    if(-not $NoPause){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Raycast 汉化')|Out-Null}
    exit 1
}
