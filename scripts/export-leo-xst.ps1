param(
    [string]$Install = 'D:\Eventech\SPumpAloneLEOZ2024',
    [string]$Output = ''
)
# Use 32-bit Windows PowerShell. Read a workspace copy; never open the installed database for writing.
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) { throw 'Run with C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe' }
Add-Type -AssemblyName System.Data
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $Output) { $Output = Join-Path $root 'frontend\data\pump-catalog\leo-xst-source.json' }
$source = Join-Path $Install 'DataLEOZ\SPump.mdb'
$digest = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
$snapshotDir = Join-Path $root 'database\leo-source'
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
$snapshot = Join-Path $snapshotDir 'LEOZ-SPump.mdb'
if (-not (Test-Path -LiteralPath $snapshot) -or (Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
    Copy-Item -LiteralPath $source -Destination $snapshot
}
# Ask the installed application's own connection helper for its database settings. Do not log or persist credentials.
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $Install 'SPump.OleDbDAL4Main.dll'))
$helper = $assembly.GetType('SPump.OleDbDAL.DBUtility.PubConstant', $true)
$build = $helper.GetMethod('BuildConnectString', [Reflection.BindingFlags]'Public,NonPublic,Static')
$runtimeConnection = [string]$build.Invoke($null,[object[]]@([string]$snapshot))
$builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder($runtimeConnection)
$builder['Mode'] = 'Read'
$connection = New-Object System.Data.OleDb.OleDbConnection($builder.ConnectionString)
function Read-Rows([string]$sql) {
    $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($sql,$connection)
    $table = New-Object System.Data.DataTable
    [void]$adapter.Fill($table)
    foreach ($row in $table.Rows) {
        $item = [ordered]@{}
        foreach ($column in $table.Columns) {
            $value = $row[$column.ColumnName]
            if ($value -is [DBNull]) { $value = $null }
            $item[$column.ColumnName] = $value
        }
        [PSCustomObject]$item
    }
}
function Read-ForPumps([string]$table, [string]$column, [int[]]$ids) {
    for ($offset=0; $offset -lt $ids.Count; $offset+=200) {
        $batch = @($ids[$offset..([Math]::Min($offset+199,$ids.Count-1))]) -join ','
        Read-Rows "SELECT * FROM [$table] WHERE [$column] IN ($batch) ORDER BY ID"
    }
}
try {
    $connection.Open()
    $series = @(Read-Rows "SELECT * FROM PumpSeries WHERE Name='XST' ORDER BY ID")
    if (-not $series.Count) { throw 'XST series not found.' }
    $seriesIds = @($series | ForEach-Object {[int]$_.ID}) -join ','
    $pumps = @(Read-Rows "SELECT * FROM PumpMain WHERE SeriesID IN ($seriesIds) ORDER BY ID")
    if (-not $pumps.Count) { throw 'XST models not found.' }
    $ids = @($pumps | ForEach-Object {[int]$_.ID})
    $result = [ordered]@{
        schemaVersion = 1
        source = [ordered]@{application='SPumpAloneLEOZ2024';database='DataLEOZ/SPump.mdb';sha256=$digest;sizeBytes=(Get-Item -LiteralPath $source).Length}
        series = $series
        pumps = $pumps
        groups = @(Read-Rows "SELECT * FROM PumpGroup WHERE SeriesID IN ($seriesIds) ORDER BY ID")
        parts = @(Read-ForPumps 'PartBase' 'PumpID' $ids)
        curves1 = @(Read-ForPumps 'CurveDefinePoints1' 'ID' $ids)
        curves2 = @(Read-ForPumps 'CurveDefinePoints2' 'ID' $ids)
        spectra = @(Read-ForPumps 'PumpSpectrum1' 'ID' $ids)
        properties = @(Read-Rows 'SELECT * FROM PartProp ORDER BY ID')
        structure = @(Read-Rows "SELECT * FROM PumpSeriesStruct WHERE SeriesID IN ($seriesIds) ORDER BY ID")
        documents = @(Read-Rows "SELECT * FROM PumpSeriesAttachFile WHERE SeriesID IN ($seriesIds) ORDER BY ID")
    }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) { throw 'The installed source changed during export.' }
    New-Item -ItemType Directory -Path (Split-Path $Output -Parent) -Force | Out-Null
    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Output -Encoding UTF8
    Write-Output ('XST source exported: models=' + $pumps.Count + '; parts=' + $result.parts.Count + '; primary curves=' + $result.curves1.Count + '; derived curves=' + $result.curves2.Count)
} finally { $connection.Dispose() }
