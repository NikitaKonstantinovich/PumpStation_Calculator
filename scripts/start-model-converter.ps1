param(
    [string]$ConfigPath=(Join-Path $env:LOCALAPPDATA 'PumpStationCalculator\full.json'),
    [string]$DatabaseName,
    [int]$DatabasePort=0,
    [string]$StateDirectory,
    [string]$CatalogPath,
    [string]$SourceRoot
)
$ErrorActionPreference='Stop'
$frontend=Split-Path -Parent $PSScriptRoot
$profileData=Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
foreach($name in 'PROJECT_DATABASE_URL','PROJECT_MODEL_LIBRARY','MODEL_CONVERTER_STATE','MODEL_CONVERTER_URL','MODEL_CONVERTER_TOKEN') {
    if(-not $profileData.$name) { throw "В профиле не задано $name" }
    [Environment]::SetEnvironmentVariable($name,[string]$profileData.$name,'Process')
}
if($DatabaseName -or $DatabasePort) {
    $database=[UriBuilder]$env:PROJECT_DATABASE_URL
    if($DatabaseName) { $database.Path=$DatabaseName }
    if($DatabasePort) { $database.Port=$DatabasePort }
    $env:PROJECT_DATABASE_URL=$database.Uri.AbsoluteUri
    if(-not $StateDirectory) { throw 'Для отдельной базы укажите отдельный StateDirectory' }
}
if($StateDirectory) { $env:MODEL_CONVERTER_STATE=[IO.Path]::GetFullPath($StateDirectory) }
if($CatalogPath) {
    if(-not (Test-Path -LiteralPath $CatalogPath -PathType Leaf)) { throw 'Каталог насосов не найден' }
    $env:NODE_PUMP_CATALOG_PATH=[IO.Path]::GetFullPath($CatalogPath)
}
if(-not $SourceRoot) { $SourceRoot=Split-Path -Parent $frontend }
$endpoint=[Uri]$env:MODEL_CONVERTER_URL
if($endpoint.Host -ne '127.0.0.1') { throw 'Ожидался локальный адрес конвертера' }
if(Get-NetTCPConnection -State Listen -LocalPort $endpoint.Port -ErrorAction SilentlyContinue) { throw 'Порт конвертера уже занят; второй процесс не запущен' }
& $profileData.CAD_PYTHON -c 'import OCP, psycopg'
if($LASTEXITCODE) { throw 'В CAD_PYTHON недоступны OCP или psycopg' }
New-Item -ItemType Directory -Path $env:MODEL_CONVERTER_STATE -Force | Out-Null
$arguments=@('services/model-converter/server.py','--host','127.0.0.1','--port',[string]$endpoint.Port,'--root',$SourceRoot)
$quoted=$arguments | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }
$process=Start-Process -FilePath $profileData.CAD_PYTHON -ArgumentList $quoted -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:MODEL_CONVERTER_STATE 'converter.log') -RedirectStandardError (Join-Path $env:MODEL_CONVERTER_STATE 'converter-error.log') -PassThru
$headers=@{Authorization="Bearer $env:MODEL_CONVERTER_TOKEN";'X-Model-Owner'='service-startup-check'}
for($attempt=0;$attempt -lt 30;$attempt++) {
    if($process.HasExited) { throw 'Конвертер завершился при запуске; проверьте converter-error.log' }
    try {
        $response=Invoke-WebRequest -Uri ($endpoint.AbsoluteUri.TrimEnd('/')+'/v1/jobs?projectId=startup-check') -Headers $headers -TimeoutSec 2
        if($response.StatusCode -eq 200) { Write-Output "Конвертер готов: порт $($endpoint.Port), PID $($process.Id)"; exit 0 }
    } catch { Start-Sleep -Milliseconds 250 }
}
throw 'Конвертер запущен, но проверка готовности не завершилась; проверьте журнал'
