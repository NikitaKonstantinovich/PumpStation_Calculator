param([string]$ConfigPath=(Join-Path $env:LOCALAPPDATA 'PumpStationCalculator\full.json'))
$ErrorActionPreference = 'Stop'
$profileData = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$frontend = Split-Path -Parent $PSScriptRoot
foreach ($name in 'CAD_EXPORT_URL','CAD_EXPORT_TOKEN') {
    if ($profileData.$name) { [Environment]::SetEnvironmentVariable($name,[string]$profileData.$name,'Process') }
}
foreach ($name in 'PROJECT_DATABASE_URL','PROJECT_STATE_DIR','PROJECT_MODEL_LIBRARY','MODEL_CONVERTER_STATE','MODEL_CONVERTER_URL','MODEL_CONVERTER_TOKEN') {
    if (-not $profileData.$name) { throw "В профиле не задано $name" }
    [Environment]::SetEnvironmentVariable($name,[string]$profileData.$name,'Process')
}
$pg = Join-Path $profileData.PG_BIN 'pg_ctl.exe'
& $pg status -D $profileData.PG_DATA *> $null
if ($LASTEXITCODE -ne 0) {
    & $pg start -D $profileData.PG_DATA -l (Join-Path (Split-Path $profileData.PG_DATA) 'postgres.log') -o "-h 127.0.0.1 -p $($profileData.PG_PORT)"
    if ($LASTEXITCODE) { throw 'Не удалось запустить локальную базу' }
}
$converterUri=[Uri]$profileData.MODEL_CONVERTER_URL
if ($converterUri.Host -ne '127.0.0.1') { throw 'Ожидался локальный конвертер' }
if (Get-NetTCPConnection -State Listen -LocalPort $profileData.port -ErrorAction SilentlyContinue) {
    throw "Порт приложения $($profileData.port) уже занят"
}
if (Get-NetTCPConnection -State Listen -LocalPort $converterUri.Port -ErrorAction SilentlyContinue) {
    throw "Порт конвертера $($converterUri.Port) уже занят. Проверьте профиль перед повторным запуском."
}
$logRoot=Join-Path (Split-Path $profileData.PROJECT_STATE_DIR) 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$converter=Start-Process -FilePath $profileData.CAD_PYTHON -ArgumentList 'services/model-converter/server.py','--host','127.0.0.1','--port',$converterUri.Port -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'converter.log') -RedirectStandardError (Join-Path $logRoot 'converter-error.log') -PassThru
try {
    Push-Location $frontend
    & node scripts/preview-full.mjs --build-dir $profileData.buildDir --port $profileData.port
    if ($LASTEXITCODE) { throw 'Локальный сервер завершился с ошибкой' }
} finally {
    Pop-Location
    if (-not $converter.HasExited) { $converter.Kill() }
}
