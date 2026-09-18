param([ValidateSet('install','uninstall')][string]$Action,[ValidatePattern('^S-1-[0-9-]+$')][string]$UserSid,[ValidateRange(40000,60000)][int]$Port)
$ErrorActionPreference='Stop'
$key='Registry::HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$names=@('Raycast.Raycast_qypenmj9wpt2a!Raycast','Raycast.exe')
$arguments='--remote-debugging-port='+$Port+' --remote-debugging-address=127.0.0.1'
try {
    if(-not([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw '需要管理员权限。'}
    $existing=Get-Item -LiteralPath $key -ErrorAction SilentlyContinue
    foreach($name in $names){
        $value=if($existing){$existing.GetValue($name,$null)}else{$null}
        if($null -ne $value -and $value -ne $arguments){throw 'Raycast 已有其他 WebView2 配置，未覆盖。'}
    }
    if($Action -eq 'install'){
        New-Item -Path $key -Force|Out-Null
        foreach($name in $names){New-ItemProperty -LiteralPath $key -Name $name -Value $arguments -PropertyType String -Force|Out-Null}
    }else{
        foreach($name in $names){if($existing -and $null -ne $existing.GetValue($name,$null)){Remove-ItemProperty -LiteralPath $key -Name $name}}
        $legacy='Registry::HKEY_USERS\'+$UserSid+'\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
        $legacyKey=Get-Item -LiteralPath $legacy -ErrorAction SilentlyContinue
        foreach($name in $names){if($legacyKey -and $legacyKey.GetValue($name,$null) -eq $arguments){Remove-ItemProperty -LiteralPath $legacy -Name $name}}
    }
    exit 0
}catch{Write-Host $_.Exception.Message;exit 1}
