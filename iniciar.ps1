$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw 'Python local não encontrado. Siga a instalação no README.md.'
}
Write-Host 'EduPlan: abra http://localhost:8000. Use Ctrl+C para encerrar.'
& $pythonExe -m uvicorn app:app --host 127.0.0.1 --port 8000
