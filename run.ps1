$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

# logs
if (-not (Test-Path ".\logs")) { New-Item -ItemType Directory -Path ".\logs" | Out-Null }
$ts  = Get-Date -Format "yyyy-MM-dd_HHmmss"
$log = ".\logs\run_$ts.log"

"=== START $(Get-Date) ===" | Out-File $log -Encoding utf8

$python = "C:\Users\moise\AppData\Local\Programs\Python\Python313\python.exe"

& $python "$PSScriptRoot\main.py" --mode update *>> $log

"ExitCode=$LASTEXITCODE" | Out-File $log -Encoding utf8 -Append
"=== END $(Get-Date) ==="   | Out-File $log -Encoding utf8 -Append

exit $LASTEXITCODE
