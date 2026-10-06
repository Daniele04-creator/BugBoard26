param([string]$Python = 'python', [string]$OutputPath = '', [switch]$VerifyOnly, [switch]$PublishHtml)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot 'tmp/documentation-venv'
$pythonPath = Join-Path $environmentPath 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & $Python -I -m venv $environmentPath
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create documentation Python environment.' }
}
$requirements = Join-Path $projectRoot 'public-artifacts/requirements.txt'
$dependencyHash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
$stamp = Join-Path $environmentPath 'requirements.sha256'
if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $dependencyHash) {
    & $pythonPath -I -m pip install --disable-pip-version-check -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Cannot install pinned documentation dependencies.' }
    Set-Content -LiteralPath $stamp -Value $dependencyHash -Encoding ascii
}
$arguments = @((Join-Path $PSScriptRoot 'build-technical-documents.py'))
if ($VerifyOnly) { $arguments += '--verify' }
if ($PublishHtml) { $arguments += '--publish-html' }
if ($OutputPath) { $arguments += @('--output', $OutputPath) }
& $pythonPath -I @arguments
if ($LASTEXITCODE -ne 0) { throw 'Technical document generation or verification failed.' }
