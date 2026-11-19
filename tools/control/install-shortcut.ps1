# Puts a "PPB Control" shortcut on the desktop that opens ppb-control.ps1 without a console window.
$target = Join-Path $PSScriptRoot 'ppb-control.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'PPB Control.lnk'))
$lnk.TargetPath = (Get-Command powershell.exe).Source
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,21"
$lnk.Description = 'Start, stop and check the Protein Purification Bench manager'
$lnk.Save()
Write-Host "Made 'PPB Control' on your desktop. Double-click it to open."
