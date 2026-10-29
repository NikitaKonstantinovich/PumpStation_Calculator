param([ValidateSet('Start', 'StartLocal', 'Stop', 'Status')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$hosting = Join-Path $project 'work\hosting'
$caddy = Join-Path $hosting 'caddy.exe'
$config = Join-Path $project 'deployment\windows\Caddyfile'
$recordsFile = Join-Path $hosting 'processes.json'
$origin = 'https://188.242.166.168'
New-Item -ItemType Directory -Path $hosting -Force | Out-Null
$records = @{}
if (Test-Path -LiteralPath $recordsFile) {
    $saved = Get-Content -LiteralPath $recordsFile -Raw | ConvertFrom-Json
    foreach ($item in $saved.PSObject.Properties) { $records[$item.Name] = $item.Value }
}

function Save-Records { $records | ConvertTo-Json | Set-Content -LiteralPath $recordsFile -Encoding UTF8 }
function Find-OwnedProcess([string]$name) {
    if (-not $records.ContainsKey($name)) { return $null }
    $record = $records[$name]
    $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq [Int64]$record.startedTicks -and $process.Path -eq $record.path) { return $process }
    return $null
}
function Remember-Process([string]$name, $process) {
    # Start-Process can initially return a process object with an empty Path.
    # Refresh from Windows before persisting the identity used for safe stops.
    $fresh = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $fresh = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($fresh -and $fresh.Path) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $fresh -or -not $fresh.Path) { throw "Cannot identify started $name (PID $($process.Id)); inspect logs before restarting." }
    $records[$name] = @{ id = $fresh.Id; startedTicks = $fresh.StartTime.ToUniversalTime().Ticks; path = $fresh.Path }
    Save-Records
}
function Stop-OwnedProcess([string]$name) {
    $process = Find-OwnedProcess $name
    if ($process) {
        # Identity includes creation time and executable, so a reused PID is safe.
        & taskkill.exe /PID $process.Id /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not stop $name (PID $($process.Id))" }
    }
    $records.Remove($name)
    Save-Records
}

if ($Action -eq 'Stop') {
    Stop-OwnedProcess 'caddy'
    Stop-OwnedProcess 'app'
    Write-Output 'Beta processes stopped; database and certificates retained.'
    return
}
if ($Action -eq 'Status') {
    foreach ($name in @('app', 'caddy')) {
        $process = Find-OwnedProcess $name
        if ($process) { Write-Output "$name running: PID $($process.Id)" } else { Write-Output "$name stopped" }
    }
    Write-Output "Public address: $origin (verify from a mobile network)"
    Write-Output "Logs: $hosting"
    return
}

if (-not (Test-Path -LiteralPath $caddy -PathType Leaf)) { throw "Install the official Caddy binary at $caddy; see docs/beta-0.1-windows-hosting.md" }
$release = Get-Content -LiteralPath 'dist/release.json' -Raw | ConvertFrom-Json
if ($release.profile -ne 'beta') { throw 'Build beta first: npm run build:beta' }
if (-not (Test-Path -LiteralPath '.wrangler\state\v3\d1')) { throw 'Existing development database not found. Refusing to create an empty database.' }
$env:PSC_CADDY_DATA_DIR = Join-Path $hosting 'caddy-data'
$env:PSC_CADDY_LOG_FILE = Join-Path $hosting 'caddy.log'
& $caddy validate --config $config --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration is invalid' }

if (-not (Find-OwnedProcess 'app')) {
    if (Get-NetTCPConnection -State Listen -LocalPort 3005 -ErrorAction SilentlyContinue) { throw 'Port 3005 is already occupied. Stop the old beta process before starting this launcher.' }
    $node = (Get-Command node.exe).Source
    $appArgs = 'scripts/preview-beta.mjs --port 3005 --state-dir .wrangler/state --migrations skip --public-origin ' + $origin
    $appProcess = Start-Process -FilePath $node -ArgumentList $appArgs -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $hosting 'app.log') -RedirectStandardError (Join-Path $hosting 'app.err.log') -PassThru
    Remember-Process 'app' $appProcess
}
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Find-OwnedProcess 'app')) { throw 'Beta process exited; see work/hosting/app.err.log' }
    try {
        $response = Invoke-WebRequest 'http://127.0.0.1:3005/api/release' -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'Beta did not become ready; see work/hosting/app.err.log' }
if ($Action -eq 'StartLocal') {
    Write-Output 'Local beta ready: http://localhost:3005/ (HTTPS proxy not started by this command).'
    return
}

if (-not (Find-OwnedProcess 'caddy')) {
    if (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 80,443 }) { throw 'Port 80 or 443 is occupied. The local beta is running; HTTPS has not started.' }
    $caddyArgs = 'run --config "' + $config + '" --adapter caddyfile'
    $proxyProcess = Start-Process -FilePath $caddy -ArgumentList $caddyArgs -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $hosting 'caddy.out.log') -RedirectStandardError (Join-Path $hosting 'caddy.err.log') -PassThru
    Remember-Process 'caddy' $proxyProcess
    Start-Sleep -Milliseconds 1000
    if (-not (Find-OwnedProcess 'caddy')) { throw 'Caddy exited; see work/hosting/caddy.err.log and caddy.log' }
}
Write-Output 'Local beta ready: http://localhost:3005/'
Write-Output "HTTPS proxy started: $origin (certificate issuance and external connectivity still need verification)."
Write-Output "Logs and persistent certificates: $hosting"
