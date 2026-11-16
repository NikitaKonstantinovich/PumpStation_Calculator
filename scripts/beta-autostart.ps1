# User-logon entry point. No elevation or global execution-policy change needed.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$hosting = Join-Path $project 'work\hosting'
New-Item -ItemType Directory -Path $hosting -Force | Out-Null
$log = Join-Path $hosting 'autostart.log'
$launcher = Join-Path $PSScriptRoot 'beta-server.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

Add-Content -LiteralPath $log -Value "`r`n[$([DateTimeOffset]::Now.ToString('o'))] Starting PumpStation beta"
for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
        # A child shell isolates native stderr messages from this error handler.
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '" -Action Start'
        $result = Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $hosting 'autostart-launch.log') -RedirectStandardError (Join-Path $hosting 'autostart-launch.err.log') -PassThru
        # Wait only for the launcher: Start-Process -Wait also waits for its
        # long-running server children and would keep autostart open forever.
        $result.WaitForExit()
        if ($result.ExitCode -ne 0) { throw "Launcher exit code $($result.ExitCode); see autostart-launch.err.log" }
        Add-Content -LiteralPath $log -Value "[$([DateTimeOffset]::Now.ToString('o'))] Started successfully"
        exit 0
    } catch {
        Add-Content -LiteralPath $log -Value "[$([DateTimeOffset]::Now.ToString('o'))] Attempt ${attempt}: $($_.Exception.Message)"
        if ($attempt -lt 3) { Start-Sleep -Seconds 10 }
    }
}
exit 1
