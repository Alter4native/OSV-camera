param(
    [string]$OriginUrl = "http://127.0.0.1:8081",
    [string]$CloudflaredPath = "C:\tmp\cloudflared.exe",
    [string]$VercelConfigPath = ".\frontend\vercel.json",
    [switch]$Push
)

$ErrorActionPreference = "Stop"
$ComposeFile = ".\infra\docker-compose.yml"

function Write-Step {
    param([string]$Message)
    Write-Host "[osv-pc] $Message"
}

if (-not (Test-Path $CloudflaredPath)) {
    Write-Step "cloudflared not found. Downloading..."
    New-Item -ItemType Directory -Force -Path (Split-Path $CloudflaredPath) | Out-Null
    Invoke-WebRequest `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $CloudflaredPath
}

Write-Step "Checking local nginx at $OriginUrl..."
try {
    Invoke-WebRequest -UseBasicParsing "$OriginUrl/api/health" -TimeoutSec 10 | Out-Null
} catch {
    $composeStatus = ""
    try {
        $composeStatus = docker compose -f $ComposeFile ps 2>&1 | Out-String
    } catch {
        $composeStatus = ""
    }

    if ($composeStatus -match '\bUp\b') {
        Write-Error "Docker Compose is running, but $OriginUrl/api/health is not reachable. Check the backend and nginx container logs."
    }

    Write-Error "Local API is not reachable at $OriginUrl/api/health. Start the demo stack with: docker compose -f $ComposeFile up -d --build"
}

$outFile = "C:\tmp\osv-pc-cloudflared.out"
$errFile = "C:\tmp\osv-pc-cloudflared.err"
Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

Write-Step "Starting Cloudflare Tunnel..."
$process = Start-Process `
    -FilePath $CloudflaredPath `
    -ArgumentList "tunnel --url $OriginUrl" `
    -RedirectStandardOutput $outFile `
    -RedirectStandardError $errFile `
    -WindowStyle Hidden `
    -PassThru

$tunnelUrl = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path $errFile) {
        $log += Get-Content $errFile -Raw
    }
    if (Test-Path $outFile) {
        $log += Get-Content $outFile -Raw
    }

    $match = [regex]::Match($log, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
        $tunnelUrl = $match.Value
        break
    }

    if ($process.HasExited) {
        Write-Error "cloudflared stopped before creating tunnel. Check $errFile"
    }
}

if (-not $tunnelUrl) {
    Write-Error "Tunnel URL not found. Check $errFile"
}

Write-Step "Tunnel ready: $tunnelUrl"

$configPath = Resolve-Path $VercelConfigPath
$config = Get-Content $configPath -Raw | ConvertFrom-Json

foreach ($rewrite in $config.rewrites) {
    if ($rewrite.source -eq "/api/:path*") {
        $rewrite.destination = "$tunnelUrl/api/:path*"
    }
    if ($rewrite.source -eq "/ai/:path*") {
        $rewrite.destination = "$tunnelUrl/ai/:path*"
    }
}

$json = $config | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, $utf8NoBom)
Write-Step "Updated frontend/vercel.json"

Write-Host ""
Write-Host "Use in Vercel Environment Variables:"
Write-Host "VITE_API_BASE_URL=/api"
Write-Host "VITE_AI_BASE_URL=/ai"
Write-Host ""
Write-Host "Test tunnel:"
Write-Host "$tunnelUrl/api/health"
Write-Host "$tunnelUrl/ai/health"
Write-Host ""

if ($Push) {
    Write-Step "Committing and pushing tunnel URL..."
    git add frontend/vercel.json
    git commit -m "Update demo tunnel URL"
    git push origin main
    Write-Step "Pushed. Vercel should start deploy."
} else {
    Write-Host "Next:"
    Write-Host "git add frontend/vercel.json"
    Write-Host "git commit -m `"Update demo tunnel URL`""
    Write-Host "git push origin main"
}

Write-Host ""
Write-Host "Keep this PowerShell window/process alive for demo."
Write-Host "cloudflared PID: $($process.Id)"
