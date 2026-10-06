[CmdletBinding()]
param([switch]$Test, [switch]$ConfigureOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $taskRoot 'deploy/.env'

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $envFile)) {
    $configuration = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'deploy/.env.example')
    foreach ($key in @('DATABASE_PASSWORD', 'MIGRATION_PASSWORD', 'POSTGRES_ADMIN_PASSWORD', 'AUTH_IP_HASH_SECRET')) {
        $configuration = [regex]::Replace($configuration, "(?m)^$key=\s*$", "$key=$(New-LocalSecret)")
    }
    [IO.File]::WriteAllText($envFile, $configuration, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Configurazione locale privata creata in deploy/.env.'
}
if ($ConfigureOnly) { exit 0 }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
$ports = if ($Test) { @(55434, 8081, 8089) } else {
    @([int]$settings.DB_HOST_PORT, [int]$settings.SERVER_PORT, [int]$settings.FRONTEND_PORT)
}
$arguments = @('compose', '--env-file', $envFile, '-f', (Join-Path $taskRoot 'deploy/compose.yaml'))
if ($Test) { $arguments += @('-f', (Join-Path $taskRoot 'deploy/compose.test.yaml')) }
$existing = & docker @arguments ps --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose non disponibile.' }
if (-not $existing) {
    foreach ($port in $ports) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try { $listener.Start() } catch { throw "Porta $port occupata. Configura porte diverse in deploy/.env; nessun processo è stato arrestato." }
        finally { $listener.Stop() }
    }
}
$arguments += @('up', '--build', '-d', '--wait', '--wait-timeout', '180')
& docker @arguments
if ($LASTEXITCODE -ne 0) { throw 'Avvio non riuscito. Controlla docker compose logs senza condividere credenziali.' }
$uiPort = if ($Test) { 8089 } else { [int]$settings.FRONTEND_PORT }
Write-Host "BugBoard26 disponibile su http://localhost:$uiPort"
