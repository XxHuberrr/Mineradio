$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Mineradio.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\start-mineradio.vbs"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
$Shortcut.IconLocation = "$PSScriptRoot\build\icon.ico"
$Shortcut.Save()
Write-Host "Shortcut updated to use VBS (no terminal window)"
