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

function Test-Endpoint {
    param([string]$Url)
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        # Windows can cache NXDOMAIN from its configured DNS resolver even
        # after a quick tunnel is already visible through public DNS.
        try {
            $uri = [System.Uri]$Url
        } catch {
            return $false
        }

        if ($uri.Scheme -ne "https" -or $uri.Host -notlike "*.trycloudflare.com") {
            return $false
        }
        if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
            return $false
        }

        $addresses = @()
        foreach ($dnsServer in @("1.1.1.1", "8.8.8.8")) {
            try {
                $addresses += Resolve-DnsName -Name $uri.Host -Server $dnsServer -Type A -DnsOnly -ErrorAction Stop |
                    Where-Object { $_.Type -eq "A" } |
                    ForEach-Object { $_.IPAddress }
            } catch {
                continue
            }
        }

        foreach ($address in ($addresses | Select-Object -Unique)) {
            & curl.exe --resolve "$($uri.Host):443:$address" --max-time 5 --silent --fail --output NUL $Url 2>$null
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
        }

        return $false
    }
}

if (-not (Test-Path $CloudflaredPath)) {
    Write-Step "cloudflared not found. Downloading..."
    New-Item -ItemType Directory -Force -Path (Split-Path $CloudflaredPath) | Out-Null
    Invoke-WebRequest `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $CloudflaredPath
}

Write-Step "Checking local nginx at $OriginUrl..."
$healthUrl = "$($OriginUrl.TrimEnd('/'))/api/health"
$proxyHealthy = Test-Endpoint $healthUrl
$backendHealthy = $false

if (-not $proxyHealthy) {
    # Recreated backend containers can get a new Docker IP while nginx keeps
    # the old address it resolved at startup. Refresh nginx only when the
    # default local backend is healthy directly and the failing origin is local.
    $isDefaultLocalOrigin = $OriginUrl.TrimEnd('/') -match '^https?://(?:127\.0\.0\.1|localhost):8081$'
    if ($isDefaultLocalOrigin) {
        $backendHealthy = Test-Endpoint "http://127.0.0.1:8000/api/health"
    }

    if ($backendHealthy) {
        Write-Step "Backend is healthy directly; restarting nginx to refresh its Docker upstream address..."
        try {
            docker compose -f $ComposeFile restart nginx | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Docker Compose could not restart nginx."
            }

            for ($attempt = 0; $attempt -lt 15; $attempt++) {
                Start-Sleep -Seconds 1
                if (Test-Endpoint $healthUrl) {
                    $proxyHealthy = $true
                    break
                }
            }
        } catch {
            Write-Step "Could not refresh nginx automatically: $($_.Exception.Message)"
        }
    }
}

if (-not $proxyHealthy) {
    $composeStatus = ""
    try {
        $composeStatus = docker compose -f $ComposeFile ps 2>&1 | Out-String
    } catch {
        $composeStatus = ""
    }

    if ($composeStatus -match '\b(Up|running|healthy)\b') {
        if ($backendHealthy) {
            Write-Error "Backend health succeeds directly, but nginx still cannot reach it at $healthUrl. Check nginx and backend container logs."
        }
        Write-Error "Docker Compose is running, but $healthUrl is not reachable. Check the backend and nginx container logs."
    }

    Write-Error "Local API is not reachable at $healthUrl. Start the demo stack with: docker compose -f $ComposeFile up -d --build"
}

$logDirectory = "C:\tmp"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$outFile = Join-Path $logDirectory "osv-pc-cloudflared.out"
$errFile = Join-Path $logDirectory "osv-pc-cloudflared.err"
Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

Write-Step "Starting Cloudflare Tunnel..."
$existingProcesses = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($existingProcesses) {
    Write-Step "Stopping existing cloudflared processes..."
    $existingProcesses | Stop-Process -Force
}

$process = Start-Process `
    -FilePath $CloudflaredPath `
    -ArgumentList "tunnel --protocol http2 --url $OriginUrl" `
    -RedirectStandardOutput $outFile `
    -RedirectStandardError $errFile `
    -WindowStyle Hidden `
    -PassThru

$tunnelUrl = $null
$candidateUrl = $null
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path $errFile) {
        $log += Get-Content $errFile -Raw
    }
    if (Test-Path $outFile) {
        $log += Get-Content $outFile -Raw
    }

    if (-not $candidateUrl) {
        $match = [regex]::Match($log, "https://(?!api\.)[a-zA-Z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            $candidateUrl = $match.Value
        }
    }

    if ($candidateUrl) {
        try {
            Invoke-WebRequest -UseBasicParsing "$candidateUrl/api/health" -TimeoutSec 5 | Out-Null
            $tunnelUrl = $candidateUrl
            break
        } catch {
            if ($i -eq 0 -or $i % 10 -eq 0) {
                Write-Step "Tunnel candidate is not reachable yet: $candidateUrl"
            }
        }
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
    if ($LASTEXITCODE -ne 0) {
        throw "git add frontend/vercel.json failed."
    }
    git commit -m "Update demo tunnel URL"
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed. Check the Git identity and repository status."
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw "git push origin main failed. Check network access and Git credentials."
    }
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
