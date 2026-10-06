[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ManifestFile,
    [Parameter(Mandatory = $true)][ValidatePattern('^bugboard26_restore_[a-z0-9_]+$')][string]$DestinationDatabase,
    [string]$EnvFile = '',
    [string]$KeyFile = '',
    [string]$ComposeFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup.ps1') -LibraryOnly -EnvFile $EnvFile -KeyFile $KeyFile -ComposeFile $ComposeFile
if ($DestinationDatabase.Length -gt 63) { throw 'Database identifiers cannot exceed 63 characters.' }
$container = Get-BackupContainer $EnvFile $ComposeFile
$manifestPath = (Resolve-Path -LiteralPath $ManifestFile).Path
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($DestinationDatabase -eq $manifest.database) { throw 'Restore must target a distinct database.' }
if ([IO.Path]::GetFileName($manifest.dumpFile) -ne $manifest.dumpFile) { throw 'Invalid dump filename in manifest.' }
$encrypted = Join-Path ([IO.Path]::GetDirectoryName($manifestPath)) $manifest.dumpFile
if ((Get-FileHash -LiteralPath $encrypted -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.ciphertextSha256) { throw 'Encrypted backup SHA256 does not match the manifest.' }
$key = Get-BackupKey $KeyFile
$plain = Join-Path ([IO.Path]::GetDirectoryName($manifestPath)) ('.restore-' + [Guid]::NewGuid().ToString('N') + '.dump')
$containerDump = '/tmp/bugboard26-restore-' + [Guid]::NewGuid().ToString('N') + '.dump'
$timer = [Diagnostics.Stopwatch]::StartNew()
try {
    Unprotect-BackupDump $encrypted $plain $key
    if ((Get-FileHash -LiteralPath $plain -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.plaintextSha256) { throw 'Decrypted backup SHA256 does not match the manifest.' }
    $active = (Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', 'printf %s "$POSTGRES_DB"') | Out-String).Trim()
    if ($DestinationDatabase -eq $active) { throw 'The active application database cannot be a restore target.' }
    $exists = (Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', ('PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_database WHERE datname=''' + $DestinationDatabase + '''"')) | Out-String).Trim()
    if ($exists -eq '0') {
        Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', ('PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ' + $DestinationDatabase + ' OWNER bugboard_owner"')) | Out-Null
    }
    $empty = (Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', ('PGPASSWORD="$MIGRATION_PASSWORD" psql -U bugboard_owner -d ' + $DestinationDatabase + ' -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN (''pg_catalog'',''information_schema'')"')) | Out-String).Trim()
    if ($empty -ne '0') { throw 'Restore target is not empty; no existing tables will be overwritten.' }
    $writers = (Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', ('PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_stat_activity WHERE datname=''' + $DestinationDatabase + '''"')) | Out-String).Trim()
    if ($writers -ne '0') { throw 'Restore target has connected clients. Stop destination writers before restoring.' }
    Invoke-BackupDocker -Arguments @('cp', $plain, ($container + ':' + $containerDump)) | Out-Null
    Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', ('PGPASSWORD="$MIGRATION_PASSWORD" pg_restore -U bugboard_owner --dbname=' + $DestinationDatabase + ' --single-transaction --exit-on-error ' + $containerDump)) | Out-Null
    $restored = Get-BackupManifest $container $DestinationDatabase
    foreach ($property in $manifest.counts.PSObject.Properties) {
        if ($restored.counts.($property.Name) -ne $property.Value) { throw ('Restored count mismatch: ' + $property.Name) }
    }
    if ($restored.invalidConstraints -ne 0 -or $restored.migrationVersion -ne $manifest.migrationVersion) { throw 'Restored schema constraints/migration history do not match.' }
    $beforeImages = @($manifest.images | ForEach-Object { $_.imageId + ':' + $_.sha256 + ':' + $_.computedSha256 + ':' + $_.byteSize })
    $afterImages = @($restored.images | ForEach-Object { $_.imageId + ':' + $_.sha256 + ':' + $_.computedSha256 + ':' + $_.byteSize })
    if (($beforeImages -join '|') -ne ($afterImages -join '|')) { throw 'Restored image hashes do not match.' }
    $timer.Stop()
    $report = [ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); database = $DestinationDatabase; elapsedSeconds = $timer.Elapsed.TotalSeconds;
        countsAndImageHashes = 'PASS'; fifteenMinuteTarget = ($timer.Elapsed.TotalSeconds -le 900); applicationLogin = 'NOT_EXECUTED';
        sourceManifest = [IO.Path]::GetFileName($manifestPath); migrationVersion = $restored.migrationVersion }
    $reportPath = [IO.Path]::ChangeExtension($manifestPath, ('.restore-' + $DestinationDatabase + '.json'))
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    Protect-BackupPath $reportPath
    Write-Output $reportPath
} finally {
    if ([IO.File]::Exists($plain)) { [IO.File]::Delete($plain) }
    [Array]::Clear($key, 0, $key.Length)
    try { Invoke-BackupDocker -Arguments @('exec', $container, 'rm', '-f', $containerDump) | Out-Null }
    catch { Write-Warning 'Container restore temporary cleanup could not be confirmed.' }
}
