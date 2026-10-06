[CmdletBinding()]
param([string]$OutputDirectory = 'output/reports/versioning')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $taskRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$rows = & git -C $taskRoot log --format='%H%x09%an%x09%aI%x09%s'
if ($LASTEXITCODE -ne 0) { throw 'Cronologia Git non disponibile.' }
$commits = @($rows | ForEach-Object {
    $fields = $_ -split "`t", 4
    [PSCustomObject]@{ Hash=$fields[0]; Author=$fields[1]; Date=$fields[2]; Subject=$fields[3] }
})
$commits | Export-Csv -LiteralPath (Join-Path $destination 'commits.csv') -NoTypeInformation -Encoding utf8
$summary = [ordered]@{
    MeasuredAt=[DateTime]::UtcNow.ToString('o')
    Revision=(& git -C $taskRoot rev-parse HEAD)
    CommitCount=$commits.Count
    AuthorCount=@($commits.Author | Sort-Object -Unique).Count
    FirstCommit=($commits | Select-Object -Last 1).Date
    LastCommit=($commits | Select-Object -First 1).Date
    WeeklyFrequency=@($commits | Group-Object {
        $commitDay = ([DateTimeOffset]::Parse($_.Date)).UtcDateTime.Date
        $daysSinceMonday = ([int]$commitDay.DayOfWeek + 6) % 7
        $commitDay.AddDays(-$daysSinceMonday).ToString('yyyy-MM-dd')
    } | Sort-Object Name | ForEach-Object {
        [ordered]@{ WeekStartingMondayUtc=$_.Name; Count=$_.Count }
    })
}
$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'summary.json') -Encoding utf8
Write-Host "Report Git reale: $($commits.Count) commit."
