param([Parameter(Mandatory)]$ProfileData)
$ErrorActionPreference = 'Stop'
$endpoint = [Uri]$ProfileData.CAD_EXPORT_URL
if ($endpoint.Scheme -ne 'http' -or $endpoint.Host -ne '127.0.0.1' -or $endpoint.AbsolutePath -ne '/') { throw 'Expected a loopback CAD endpoint' }
foreach ($name in 'CAD_PYTHON','CAD_EXPORT_SERVER','CAD_EXPORT_RUNNER','CAD_EXPORT_ASSEMBLY_TEMPLATE','CAD_EXPORT_PART_TEMPLATE') {
    if (-not (Test-Path -LiteralPath $ProfileData.$name -PathType Leaf)) { throw "Missing $name" }
}
if ($ProfileData.CAD_EXPORT_TOKEN.Length -lt 24) { throw 'CAD export token is missing' }
$env:CAD_EXPORT_TOKEN = $ProfileData.CAD_EXPORT_TOKEN
$headers = @{Authorization="Bearer $env:CAD_EXPORT_TOKEN";'X-Cad-Owner'='local-service-health'}
function Test-CadReady {
    try {
        $r=Invoke-RestMethod -Uri "$($endpoint.AbsoluteUri)v1/jobs?projectId=health" -Headers $headers -TimeoutSec 3
        return ($r.PSObject.Properties.Name -contains 'job')
    } catch { return $false }
}
if (Test-CadReady) { return }
if (Get-NetTCPConnection -State Listen -LocalPort $endpoint.Port -ErrorAction SilentlyContinue) { throw 'CAD port is occupied by another service' }
$cadLogs=Join-Path (Split-Path $ProfileData.CAD_EXPORT_STATE) 'logs'
New-Item -ItemType Directory -Path $cadLogs -Force | Out-Null
$cadArgs = @($ProfileData.CAD_EXPORT_SERVER,'--root',$ProfileData.CAD_EXPORT_ROOT,'--state',$ProfileData.CAD_EXPORT_STATE,'--runner',$ProfileData.CAD_EXPORT_RUNNER,'--template',$ProfileData.CAD_EXPORT_ASSEMBLY_TEMPLATE,'--part-template',$ProfileData.CAD_EXPORT_PART_TEMPLATE,'--host','127.0.0.1','--port',[string]$endpoint.Port)
$quoted = foreach ($arg in $cadArgs) { if ($arg.Contains('"')) { throw 'Invalid CAD path' }; '"'+$arg+'"' }
$proc=Start-Process -FilePath $ProfileData.CAD_PYTHON -ArgumentList $quoted -WorkingDirectory $ProfileData.CAD_EXPORT_ROOT -WindowStyle Hidden -RedirectStandardOutput (Join-Path $cadLogs 'cad-export.log') -RedirectStandardError (Join-Path $cadLogs 'cad-export-error.log') -PassThru
for ($i=0;$i -lt 25;$i++) {
    if (Test-CadReady) { return }
    if ($proc.HasExited) { throw 'CAD worker exited during startup' }
    Start-Sleep -Milliseconds 250
}
throw 'CAD worker did not become ready'
