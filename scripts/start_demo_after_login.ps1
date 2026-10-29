$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot "infra\docker-compose.yml"
$tunnelScript = Join-Path $PSScriptRoot "start_demo_tunnel.ps1"
$logDirectory = Join-Path $env:LOCALAPPDATA "OSV-PC\logs"
$logFile = Join-Path $logDirectory "demo-autostart.log"
$transcriptStarted = $false

function Write-AutoStartLog {
    param([string]$Message)
    Write-Host "[osv-pc-autostart] $Message"
}

function Test-Endpoint {
    param([string]$Url)
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-Endpoint {
    param(
        [string]$Url,
        [int]$Attempts = 120,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        if (Test-Endpoint $Url) {
            return $true
        }
        Start-Sleep -Seconds $DelaySeconds
    }

    return $false
}

try {
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    Start-Transcript -Path $logFile -Append | Out-Null
    $transcriptStarted = $true

    Set-Location $repoRoot
    Write-AutoStartLog "Waiting for Docker Desktop..."

    $dockerCommand = Get-Command docker -ErrorAction Stop
    $dockerPath = $dockerCommand.Source
    $dockerDesktopCandidates = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe")
    )

    $dockerReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & $dockerPath info *> $null
        if ($LASTEXITCODE -eq 0) {
            $dockerReady = $true
            break
        }

        if ($attempt -eq 0) {
            $dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
            if ($dockerDesktop) {
                Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
            }
        }
        Start-Sleep -Seconds 5
    }

    if (-not $dockerReady) {
        throw "Docker Desktop did not become ready within five minutes."
    }

    Write-AutoStartLog "Starting the OSV-PC Compose stack..."
    & $dockerPath compose -f $composeFile up -d
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up -d failed."
    }

    Write-AutoStartLog "Waiting for backend and AI health..."
    if (-not (Wait-Endpoint "http://127.0.0.1:8000/api/health")) {
        throw "Backend health did not become ready. See Docker logs."
    }
    if (-not (Wait-Endpoint "http://127.0.0.1:8010/ai/health")) {
        throw "AI-service health did not become ready. See Docker logs."
    }

    $nginxHealthy = Test-Endpoint "http://127.0.0.1:8081/api/health"
    if (-not $nginxHealthy) {
        Write-AutoStartLog "Refreshing nginx upstream addresses..."
        & $dockerPath compose -f $composeFile restart nginx
        if ($LASTEXITCODE -ne 0) {
            throw "Could not restart nginx."
        }
        $nginxHealthy = Wait-Endpoint "http://127.0.0.1:8081/api/health" -Attempts 15 -DelaySeconds 2
    }

    if (-not $nginxHealthy) {
        throw "nginx API health did not become ready. See Docker logs."
    }

    Write-AutoStartLog "Starting the trycloudflare tunnel and syncing its URL..."
    & $tunnelScript -Push
    Write-AutoStartLog "Startup completed."
} catch {
    Write-AutoStartLog "ERROR: $($_.Exception.Message)"
    throw
} finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
