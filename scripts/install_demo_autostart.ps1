param(
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName = "OSV-PC Demo Auto Start"

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task: $taskName"
    exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "start_demo_after_login.ps1"
$powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path $runnerPath)) {
    throw "Startup runner not found: $runnerPath"
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity -RandomDelay (New-TimeSpan -Seconds 30)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Starts OSV-PC Docker services and refreshes the quick tunnel after Windows sign-in." `
    -Force | Out-Null

Write-Host "Installed scheduled task: $taskName"
Write-Host "It will run after you sign in to Windows and wait for Docker Desktop."
Write-Host "Startup log: $(Join-Path $env:LOCALAPPDATA 'OSV-PC\logs\demo-autostart.log')"
Write-Host "Remove it with: .\scripts\install_demo_autostart.ps1 -Remove"
Write-Host "Install only; it does not restart the tunnel now."
