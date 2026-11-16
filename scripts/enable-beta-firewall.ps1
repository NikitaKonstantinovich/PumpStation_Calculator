#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$caddy = Join-Path $project 'work\hosting\caddy.exe'
if (-not (Test-Path -LiteralPath $caddy -PathType Leaf)) { throw "Caddy is missing: $caddy" }
$ruleName = 'PumpStation-Beta-Caddy-HTTPS'
# Limit the exception to this executable and the two forwarded TCP ports.
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any -Program $caddy -Protocol TCP -LocalPort 80,443
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'PumpStation beta HTTPS (Caddy)' -Direction Inbound -Action Allow -Enabled True -Profile Any -Program $caddy -Protocol TCP -LocalPort 80,443 | Out-Null
}
Write-Output 'Allowed Caddy TCP 80 and 443. The application on 3005 stays on loopback.'
