param([Parameter(Mandatory=$true)][string]$TaskFile, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
[void][Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-Result($Operation, [Type]$ResultType) {
 $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation)); $task.Wait(); return $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language 'en-US'))
$taskImages = Get-Content -LiteralPath $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
$taskNumber = 0
foreach ($taskImage in $taskImages) {
 $outputPath=Join-Path $OutputDirectory ($taskImage.id+'.json')
 if(Test-Path -LiteralPath $outputPath){continue}
 try {
  $file=Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($taskImage.path)) ([Windows.Storage.StorageFile])
  $stream=Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder=Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result=Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines=foreach($line in $result.Lines){[ordered]@{text=$line.Text;words=@(foreach($word in $line.Words){[ordered]@{text=$word.Text;x=$word.BoundingRect.X;y=$word.BoundingRect.Y;width=$word.BoundingRect.Width;height=$word.BoundingRect.Height}})}}
  [ordered]@{id=$taskImage.id;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;lines=@($lines)} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8
 } catch {Write-Output ($taskImage.id+': '+$_.Exception.Message)}
 finally {if($bitmap){$bitmap.Dispose();$bitmap=$null};if($stream){$stream.Dispose();$stream=$null}}
 $taskNumber++
 if($taskNumber%100 -eq 0){Write-Output "Recognized $taskNumber drawings"}
}
