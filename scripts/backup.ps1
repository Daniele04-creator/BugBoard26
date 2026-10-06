[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [string]$OutputDirectory = '',
    [string]$KeyFile = '',
    [string]$Database = '',
    [string]$ComposeFile = '',
    [switch]$LibraryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:BackupWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $EnvFile) { $EnvFile = Join-Path $script:BackupWorkspace 'deploy/.env' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $script:BackupWorkspace 'backups' }
if (-not $KeyFile) { $KeyFile = if ($env:BUGBOARD_BACKUP_KEY_FILE) { $env:BUGBOARD_BACKUP_KEY_FILE } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.bugboard26/backup.key' } }

function Invoke-BackupDocker {
    param([string[]]$Arguments)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = 'docker'; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    if ($start.PSObject.Properties.Name -contains 'ArgumentList') {
        foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    } else { $start.Arguments = ($Arguments | ForEach-Object { ConvertTo-BackupNativeArgument $_ }) -join ' ' }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        $process.Start() | Out-Null
        $output = $process.StandardOutput.ReadToEndAsync(); $errors = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw ('Docker operation failed: ' + $errors.Result.Trim()) }
        return $output.Result.TrimEnd().Split([char]10) | ForEach-Object { $_.TrimEnd([char]13) }
    } finally { $process.Dispose() }
}

function Get-BackupContainer {
    param([string]$EnvironmentFile, [string]$ComposeFile = '')
    $resolvedEnv = (Resolve-Path -LiteralPath $EnvironmentFile).Path
    $compose = if ($ComposeFile) { (Resolve-Path -LiteralPath $ComposeFile).Path } else { Join-Path $script:BackupWorkspace 'deploy/compose.yaml' }
    $container = (Invoke-BackupDocker -Arguments @('compose', '--env-file', $resolvedEnv, '-f', $compose, 'ps', '-q', 'db') | Out-String).Trim()
    if ($container -notmatch '^[a-f0-9]{12,64}$') { throw 'The configured PostgreSQL container is not running.' }
    return $container
}

function Protect-BackupPath {
    param([string]$Path)
    if ($env:OS -eq 'Windows_NT') {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $Path '/inheritance:r' '/grant:r' ($identity + ':(F)') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict backup path permissions.' }
    } else {
        & chmod 600 $Path
        if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict backup file permissions.' }
    }
}

function Get-BackupKey {
    param([string]$Path, [switch]$Create)
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute.StartsWith($script:BackupWorkspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The backup key must be stored outside the repository workspace.'
    }
    if (-not [IO.File]::Exists($absolute)) {
        if (-not $Create) { throw 'The private backup key file does not exist.' }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute)) | Out-Null
        $generated = New-Object byte[] 64
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $random.GetBytes($generated); [IO.File]::WriteAllBytes($absolute, $generated) }
        finally { $random.Dispose(); [Array]::Clear($generated, 0, $generated.Length) }
        Protect-BackupPath $absolute
    }
    $key = [IO.File]::ReadAllBytes($absolute)
    if ($key.Length -ne 64) { throw 'The private backup key must contain exactly 64 random bytes.' }
    return ,$key
}

function ConvertTo-BackupNativeArgument {
    param([string]$Value)
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}

function New-BackupSnapshot {
    param([string]$Container, [string]$DatabaseName = '')
    if ($DatabaseName -and $DatabaseName -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Invalid source database identifier.' }
    $target = if ($DatabaseName) { $DatabaseName } else { '"$POSTGRES_DB"' }
    $arguments = @('exec', '-i', $Container, 'sh', '-c', ('PGPASSWORD="$MIGRATION_PASSWORD" exec psql -U bugboard_owner -d ' + $target + ' -At -v ON_ERROR_STOP=1'))
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = 'docker'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    if ($start.PSObject.Properties.Name -contains 'ArgumentList') {
        foreach ($argument in $arguments) { $start.ArgumentList.Add($argument) }
    } else { $start.Arguments = ($arguments | ForEach-Object { ConvertTo-BackupNativeArgument $_ }) -join ' ' }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $process.Start() | Out-Null
    $errors = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();')
    $process.StandardInput.Flush()
    $lineTask = $process.StandardOutput.ReadLineAsync()
    if (-not $lineTask.Wait(15000)) { $process.Kill(); throw 'Timed out obtaining the database snapshot.' }
    $line = $lineTask.Result
    if ($line -eq 'BEGIN') { $line = $process.StandardOutput.ReadLine() }
    if ($line -notmatch '^[0-9A-Fa-f-]+$') { $process.Kill(); throw 'Could not obtain a valid PostgreSQL snapshot.' }
    return @{ Process = $process; Errors = $errors; Snapshot = $line }
}

function Get-BackupManifestSql {
    $tables = @('user_accounts', 'issues', 'labels', 'issue_labels', 'issue_images', 'comments', 'issue_events',
        'resolution_cycles', 'notifications', 'account_events', 'label_events', 'idempotency_records',
        'login_attempts', 'spring_session', 'spring_session_attributes', 'flyway_schema_history')
    $counts = ($tables | ForEach-Object { "'$_',(SELECT count(*) FROM $_)" }) -join ','
    return "SELECT jsonb_build_object('database',current_database(),'postgresVersion',current_setting('server_version')," +
        "'counts',jsonb_build_object($counts),'invalidConstraints',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated)," +
        "'images',COALESCE((SELECT jsonb_agg(jsonb_build_object('imageId',image_id,'issueId',issue_id,'sha256',sha256,'computedSha256',encode(sha256(content),'hex'),'byteSize',byte_size) ORDER BY image_id) FROM issue_images),'[]'::jsonb)," +
        "'migrationVersion',(SELECT version FROM flyway_schema_history WHERE success AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1));"
}

function Get-BackupManifest {
    param([string]$Container, [string]$Database)
    if ($Database -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Invalid database identifier.' }
    $sql = Get-BackupManifestSql
    $result = Invoke-BackupDocker -Arguments @('exec', $Container, 'sh', '-c', ('PGPASSWORD="$MIGRATION_PASSWORD" exec psql -U bugboard_owner -d ' + $Database + ' -At -v ON_ERROR_STOP=1 -c "$1"'), 'backup-query', $sql)
    return (($result | Out-String).Trim() | ConvertFrom-Json)
}

function Protect-BackupDump {
    param([string]$PlainFile, [string]$EncryptedFile, [byte[]]$Key)
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256; $aes.Mode = [Security.Cryptography.CipherMode]::CBC; $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $Key[0..31]; $aes.GenerateIV()
    $output = [IO.File]::Open($EncryptedFile, [IO.FileMode]::CreateNew)
    try {
        $magic = [Text.Encoding]::ASCII.GetBytes('BB26AES1')
        $output.Write($magic, 0, $magic.Length); $output.Write($aes.IV, 0, 16)
        $cipher = New-Object Security.Cryptography.CryptoStream($output, $aes.CreateEncryptor(), [Security.Cryptography.CryptoStreamMode]::Write, $true)
        try { $input = [IO.File]::OpenRead($PlainFile); try { $input.CopyTo($cipher) } finally { $input.Dispose() }; $cipher.FlushFinalBlock() }
        finally { $cipher.Dispose() }
    } finally { $output.Dispose(); $aes.Dispose() }
    $hmac = New-Object Security.Cryptography.HMACSHA256(,$Key[32..63])
    try {
        $input = [IO.File]::OpenRead($EncryptedFile)
        try { $tag = $hmac.ComputeHash($input) } finally { $input.Dispose() }
        $output = [IO.File]::Open($EncryptedFile, [IO.FileMode]::Append)
        try { $output.Write($tag, 0, $tag.Length) } finally { $output.Dispose() }
    } finally { $hmac.Dispose() }
    Protect-BackupPath $EncryptedFile
}

function Unprotect-BackupDump {
    param([string]$EncryptedFile, [string]$PlainFile, [byte[]]$Key)
    $input = [IO.File]::OpenRead($EncryptedFile)
    try {
        if ($input.Length -lt 72) { throw 'Invalid encrypted backup length.' }
        $signedLength = $input.Length - 32
        $hmac = New-Object Security.Cryptography.HMACSHA256(,$Key[32..63])
        try {
            $buffer = New-Object byte[] 65536
            $remaining = $signedLength
            while ($remaining -gt 0) {
                $read = $input.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
                if ($read -le 0) { throw 'Truncated backup.' }
                $hmac.TransformBlock($buffer, 0, $read, $buffer, 0) | Out-Null
                $remaining -= $read
            }
            $hmac.TransformFinalBlock((New-Object byte[] 0), 0, 0) | Out-Null
            $tag = New-Object byte[] 32; $input.Read($tag, 0, 32) | Out-Null
            $difference = 0
            for ($index = 0; $index -lt 32; $index++) { $difference = $difference -bor ($tag[$index] -bxor $hmac.Hash[$index]) }
            if ($difference -ne 0) { throw 'Backup authentication failed: wrong key or modified data.' }
        } finally { $hmac.Dispose() }
        $input.Position = 0
        $magic = New-Object byte[] 8; $input.Read($magic, 0, 8) | Out-Null
        if ([Text.Encoding]::ASCII.GetString($magic) -ne 'BB26AES1') { throw 'Unsupported backup format.' }
        $iv = New-Object byte[] 16; $input.Read($iv, 0, 16) | Out-Null
        $aes = [Security.Cryptography.Aes]::Create()
        $aes.Key = $Key[0..31]; $aes.IV = $iv; $aes.Mode = [Security.Cryptography.CipherMode]::CBC
        $output = [IO.File]::Open($PlainFile, [IO.FileMode]::CreateNew)
        try {
            $cipher = New-Object Security.Cryptography.CryptoStream($output, $aes.CreateDecryptor(), [Security.Cryptography.CryptoStreamMode]::Write, $true)
            try {
                $remaining = $signedLength - 24
                while ($remaining -gt 0) {
                    $read = $input.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
                    if ($read -le 0) { throw 'Truncated encrypted data.' }
                    $cipher.Write($buffer, 0, $read); $remaining -= $read
                }
                $cipher.FlushFinalBlock()
            } finally { $cipher.Dispose() }
        } finally { $output.Dispose(); $aes.Dispose() }
    } finally { $input.Dispose() }
    Protect-BackupPath $PlainFile
}

if ($LibraryOnly) { return }
$container = Get-BackupContainer $EnvFile $ComposeFile
[IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($OutputDirectory)) | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$base = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) ('bugboard26-' + $timestamp)
$plain = $base + '.plain.dump'
$encrypted = $base + '.dump.aes'
$containerDump = '/tmp/bugboard26-backup-' + [Guid]::NewGuid().ToString('N') + '.dump'
$key = Get-BackupKey $KeyFile -Create
$snapshot = $null
try {
    $snapshot = New-BackupSnapshot $container $Database
    $snapshot.Process.StandardInput.WriteLine((Get-BackupManifestSql)); $snapshot.Process.StandardInput.Flush()
    $manifest = $snapshot.Process.StandardOutput.ReadLine() | ConvertFrom-Json
    if ($manifest.invalidConstraints -ne 0) { throw 'Database has unvalidated constraints.' }
    foreach ($image in $manifest.images) { if ($image.sha256 -ne $image.computedSha256) { throw 'An image hash is inconsistent.' } }
    $source = if ($Database) { $Database } else { '"$POSTGRES_DB"' }
    $dumpCommand = 'umask 077; PGPASSWORD="$MIGRATION_PASSWORD" pg_dump -U bugboard_owner -d ' + $source + ' --format=custom --snapshot=' + $snapshot.Snapshot + ' --file=' + $containerDump
    Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', $dumpCommand) | Out-Null
    $snapshot.Process.StandardInput.WriteLine('COMMIT;'); $snapshot.Process.StandardInput.Close()
    $snapshot.Process.WaitForExit()
    if ($snapshot.Process.ExitCode -ne 0) { throw 'The consistent backup snapshot failed.' }
    Invoke-BackupDocker -Arguments @('cp', ($container + ':' + $containerDump), $plain) | Out-Null
    Protect-BackupPath $plain
    $plainHash = (Get-FileHash -LiteralPath $plain -Algorithm SHA256).Hash.ToLowerInvariant()
    Protect-BackupDump $plain $encrypted $key
    $manifest | Add-Member -NotePropertyName utc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    $manifest | Add-Member -NotePropertyName encryption -NotePropertyValue 'AES-256-CBC-PKCS7+HMAC-SHA256 encrypt-then-MAC'
    $manifest | Add-Member -NotePropertyName dumpFile -NotePropertyValue ([IO.Path]::GetFileName($encrypted))
    $manifest | Add-Member -NotePropertyName plaintextSha256 -NotePropertyValue $plainHash
    $manifest | Add-Member -NotePropertyName ciphertextSha256 -NotePropertyValue ((Get-FileHash -LiteralPath $encrypted -Algorithm SHA256).Hash.ToLowerInvariant())
    [IO.File]::WriteAllText(($base + '.manifest.json'), ($manifest | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    Protect-BackupPath ($base + '.manifest.json')
    Write-Output ($base + '.manifest.json')
} finally {
    if ($snapshot -and -not $snapshot.Process.HasExited) { $snapshot.Process.Kill() }
    if ($snapshot) { $snapshot.Process.Dispose() }
    if ([IO.File]::Exists($plain)) { [IO.File]::Delete($plain) }
    [Array]::Clear($key, 0, $key.Length)
    try { Invoke-BackupDocker -Arguments @('exec', $container, 'rm', '-f', $containerDump) | Out-Null }
    catch { Write-Warning 'Container backup temporary cleanup could not be confirmed.' }
}
