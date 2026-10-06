[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$PasswordFile,
    [Parameter(Mandatory = $true)][string]$Reason,
    [string]$EnvFile = '',
    [string]$ComposeFile = '',
    [string]$JarFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Admin recovery requires PowerShell 7.' }
. (Join-Path $PSScriptRoot 'backup.ps1') -LibraryOnly -EnvFile $EnvFile -ComposeFile $ComposeFile
$passwordPath = (Resolve-Path -LiteralPath $PasswordFile).Path
if ($passwordPath.StartsWith($script:BackupWorkspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The private password file must remain outside the repository workspace.'
}
if ((Get-Item -LiteralPath $passwordPath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'The private password file must not be a symbolic link.'
}
Protect-BackupPath $passwordPath
if (-not $JarFile) { $JarFile = Join-Path $script:BackupWorkspace 'backend/target/bugboard26-0.1.0-SNAPSHOT.jar' }
$jar = (Resolve-Path -LiteralPath $JarFile).Path
$environmentPath = (Resolve-Path -LiteralPath $EnvFile).Path
$container = Get-BackupContainer $EnvFile $ComposeFile
$database = (Invoke-BackupDocker -Arguments @('exec', $container, 'sh', '-c', 'printf %s "$POSTGRES_DB"') | Out-String).Trim()
if ($database -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Cannot identify the configured database.' }
$network = (Invoke-BackupDocker -Arguments @('inspect', $container, '--format', '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{end}}') | Out-String).Trim()
if ($network -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Cannot identify the configured Docker network.' }
$inputPath = Join-Path ([IO.Path]::GetDirectoryName($passwordPath)) ('admin-recovery-' + [Guid]::NewGuid().ToString('N') + '.json')
$runAs = @()
if ($env:OS -ne 'Windows_NT') {
    $localUid = (& id -u).Trim(); $localGid = (& id -g).Trim()
    if ($localUid -notmatch '^\d+$' -or $localGid -notmatch '^\d+$') { throw 'Cannot identify the local file owner.' }
    $runAs = @('--user', ($localUid + ':' + $localGid))
}
try {
    $privateFile = [IO.File]::Open($inputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $privateFile.Dispose()
    Protect-BackupPath $inputPath
    $inputData = @{ email = $Email; temporaryPassword = [IO.File]::ReadAllText($passwordPath, [Text.Encoding]::UTF8); reason = $Reason }
    [IO.File]::WriteAllText($inputPath, ($inputData | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    $arguments = @('run', '--rm', '--network', $network, '--env-file', $environmentPath) + $runAs + @(
        '-e', ('DATABASE_URL=jdbc:postgresql://db:5432/' + $database), '-e', 'DATABASE_USERNAME=bugboard_runtime',
        '-e', 'BUGBOARD_ADMIN_RECOVERY_FILE=/recovery/input.json', '-e', 'LOG_FILE=/tmp/bugboard26-admin-recovery.log',
        '--mount', ('type=bind,source=' + $inputPath + ',target=/recovery/input.json,readonly'),
        '--mount', ('type=bind,source=' + $jar + ',target=/recovery/app.jar,readonly'), '--entrypoint', 'java',
        'bugboard26-backend', '-Dloader.main=it.unina.bugboard26.auth.application.AdminRecoveryCommand',
        '-cp', '/recovery/app.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher')
    Invoke-BackupDocker -Arguments $arguments | Out-Null
    Write-Output 'Admin recovery committed. Use the temporary password, then change it.'
} finally {
    if ([IO.File]::Exists($inputPath)) { [IO.File]::Delete($inputPath) }
    if (Get-Variable -Name inputData -ErrorAction SilentlyContinue) { $inputData.Clear() }
}
