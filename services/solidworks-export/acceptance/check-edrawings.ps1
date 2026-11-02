param(
    [Parameter(Mandatory)][string]$Drawing,
    [ValidateRange(1, 1000000)][int]$MinimumComponents = 1,
    [string]$PreviewJpg,
    [string]$ExpectedNames,
    [string]$PublishExe,
    [string]$EDrawingsDir = "$env:ProgramFiles\SOLIDWORKS Corp\eDrawings"
)
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path -LiteralPath $Drawing).Path
if ([IO.Path]::GetExtension($path) -ine '.easm') { throw 'Expected an EASM file' }
$interop = Join-Path $EDrawingsDir 'eDrawings.Interop.EModelViewControl.dll'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dir = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ("psc-edrawings-" + [guid]::NewGuid().ToString('N')))
$exe = Join-Path $dir.FullName 'CheckDrawing.exe'
$localDll = Join-Path $dir.FullName 'eDrawings.Interop.EModelViewControl.dll'
try {
    Copy-Item -LiteralPath $interop -Destination $localDll
    & $compiler /nologo /platform:x64 /target:exe "/out:$exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$localDll" (Join-Path $PSScriptRoot 'CheckDrawing.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the eDrawings acceptance check' }
    if ($PreviewJpg -and $PublishExe) { throw 'Select one output format' }
    $options = @($path, $MinimumComponents)
    if ($ExpectedNames) { $options += @('--expected', (Resolve-Path -LiteralPath $ExpectedNames).Path) }
    if ($PreviewJpg) { $options += @('--preview', [IO.Path]::GetFullPath($PreviewJpg)) }
    if ($PublishExe) { $options += @('--exe', [IO.Path]::GetFullPath($PublishExe)) }
    & $exe @options
    if ($LASTEXITCODE -ne 0) { throw "eDrawings did not load the expected assembly ($LASTEXITCODE)" }
} finally {
    foreach ($file in $exe, $localDll) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
    [IO.Directory]::Delete($dir.FullName, $false)
}
