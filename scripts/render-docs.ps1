param([string]$Python = 'python', [switch]$RefreshUml, [string]$Poppler = 'pdftoppm')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($RefreshUml) {
    $manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'public-artifacts/manifest.json') -Raw | ConvertFrom-Json
    $toolDirectory = Join-Path $projectRoot 'tmp/documentation-tools'
    New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
    $jar = Join-Path $toolDirectory ('plantuml-' + $manifest.plantuml.version + '.jar')
    if (-not (Test-Path -LiteralPath $jar)) { Invoke-WebRequest -Uri $manifest.plantuml.url -OutFile $jar }
    if ((Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.plantuml.sha256) { throw 'PlantUML SHA256 mismatch.' }
    $models = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public-artifacts/uml') -Filter '*.puml'
    foreach ($model in $models) {
        & java '-Djava.awt.headless=true' -jar $jar -charset UTF-8 -tsvg $model.FullName
        if ($LASTEXITCODE -ne 0) { throw ('PlantUML rendering failed: ' + $model.Name) }
    }
}
& (Join-Path $PSScriptRoot 'build-technical-documents.ps1') -Python $Python
$renderDirectory = Join-Path $projectRoot 'tmp/pdfs/rendered'
New-Item -ItemType Directory -Path $renderDirectory -Force | Out-Null
& $Poppler -r 85 -png (Join-Path $projectRoot 'output/documentation/BugBoard26-documentazione.pdf') (Join-Path $renderDirectory 'page')
if ($LASTEXITCODE -ne 0) { throw 'PDF page rendering failed; install Poppler or specify -Poppler.' }
Write-Output ('Rendered PDF pages: ' + $renderDirectory + '. Visual inspection remains required.')
