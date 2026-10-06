[CmdletBinding()]
param([string]$OutputPath = 'output/reports/nvd-feed.json')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$feedUrl = 'https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-modified.meta'
$metadata = Invoke-RestMethod -Uri $feedUrl
$fields = @{}
foreach ($line in ($metadata -split "`r?`n")) {
    if ($line -match '^([^:]+):(.*)$') { $fields[$Matches[1]] = $Matches[2] }
}
if (-not $fields.lastModifiedDate -or $fields.sha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Metadata NVD incompleti: sicurezza non verificata.'
}
$modified = [DateTimeOffset]::Parse($fields.lastModifiedDate)
$measured = [DateTimeOffset]::UtcNow
$age = ($measured - $modified).TotalDays
if ($age -gt 7 -or $age -lt -0.05) { throw 'Feed NVD obsoleto o timestamp non valido: sicurezza non verificata.' }
$destination = Join-Path $taskRoot $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
[ordered]@{Source=$feedUrl; MeasuredAt=$measured.ToString('o'); LastModified=$modified.ToString('o'); AgeDays=$age; Sha256=$fields.sha256; Status='PASS'} |
    ConvertTo-Json | Set-Content -LiteralPath $destination -Encoding utf8
Write-Host 'Freschezza del feed NVD ufficiale verificata.'
