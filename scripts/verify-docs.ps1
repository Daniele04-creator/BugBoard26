param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-technical-documents.ps1') -Python $Python -VerifyOnly
if ($LASTEXITCODE -ne 0) { throw 'Public documentation verification failed.' }
