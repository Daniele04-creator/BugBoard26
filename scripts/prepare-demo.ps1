[CmdletBinding()]
param(
    [switch]$ReplaceExisting,
    [string]$PasswordFile = '',
    [string]$JarFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Demo preparation requires PowerShell 7.' }
. (Join-Path $PSScriptRoot 'backup.ps1') -LibraryOnly
$environmentPath = Join-Path $script:BackupWorkspace 'deploy/.env'
$compose = Join-Path $script:BackupWorkspace 'deploy/compose.yaml'
$settings = @{}
foreach ($line in Get-Content -LiteralPath $environmentPath) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
if ($settings.APP_PROFILE -ne 'demo') { throw 'Demo preparation is restricted to APP_PROFILE=demo.' }
if (-not $JarFile) { $JarFile = Join-Path $script:BackupWorkspace 'backend/target/bugboard26-0.1.0-SNAPSHOT.jar' }
$jar = (Resolve-Path -LiteralPath $JarFile).Path
$db = Get-BackupContainer $environmentPath $compose
if (-not $PasswordFile) { $PasswordFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.bugboard26/demo-password' }
$passwordPath = [IO.Path]::GetFullPath($PasswordFile)
if ($passwordPath.StartsWith($script:BackupWorkspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The private demo password file must remain outside the repository.'
}
if (-not (Test-Path -LiteralPath $passwordPath)) {
    if (-not $ReplaceExisting) {
        $query = 'PGPASSWORD="$MIGRATION_PASSWORD" psql -U bugboard_owner -d bugboard26 -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM user_accounts WHERE email LIKE ''%@bugboard.demo.example.test''"'
        $existing = (Invoke-BackupDocker -Arguments @('exec', $db, 'sh', '-c', $query) | Out-String).Trim()
        if ($existing -ne '0') { throw 'Demo accounts already exist, but the original private password file is missing. Recover it or reset the fictional accounts from administration.' }
    }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($passwordPath)) | Out-Null
    [IO.File]::WriteAllText($passwordPath, [Guid]::NewGuid().ToString('N'), (New-Object Text.UTF8Encoding($false)))
}
Protect-BackupPath $passwordPath
$network = (Invoke-BackupDocker -Arguments @('inspect', $db, '--format', '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{end}}') | Out-String).Trim()
if ($network -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Cannot identify the local Docker network.' }
$composeArguments = @('compose', '--env-file', $environmentPath, '-f', $compose)
$stopped = $false
try {
    if ($ReplaceExisting) {
        $stopped = $true
        Invoke-BackupDocker -Arguments ($composeArguments + @('stop', 'frontend', 'backend')) | Out-Null
        $backup = & (Join-Path $PSScriptRoot 'backup.ps1') -EnvFile $environmentPath -ComposeFile $compose
        Write-Output "Backup: $backup"
    }
    $operation = if ($ReplaceExisting) { ' --replace-existing' } else { '' }
    $launcher = 'export DATABASE_PASSWORD="$MIGRATION_PASSWORD"; exec java -Dloader.main=it.unina.bugboard26.shared.application.DemoDataCommand -cp /demo/app.jar org.springframework.boot.loader.launch.PropertiesLauncher' + $operation
    $arguments = @('run', '--rm', '--network', $network, '--env-file', $environmentPath,
        '-e', 'DATABASE_URL=jdbc:postgresql://db:5432/bugboard26', '-e', 'DATABASE_USERNAME=bugboard_owner',
        '-e', 'BUGBOARD_DEMO_PASSWORD_FILE=/demo/password', '-e', 'LOG_FILE=/tmp/bugboard26-demo.log',
        '--mount', ('type=bind,source=' + $passwordPath + ',target=/demo/password,readonly'),
        '--mount', ('type=bind,source=' + $jar + ',target=/demo/app.jar,readonly'),
        '--entrypoint', 'sh', 'bugboard26-backend', '-c', $launcher)
    $output = Invoke-BackupDocker -Arguments $arguments
    $output | Where-Object { $_ -match '^Demo data ' } | Write-Output
    Write-Output "Private password for the six fictional accounts: $passwordPath"
} finally {
    if ($stopped) {
        Invoke-BackupDocker -Arguments ($composeArguments + @('up', '-d', '--wait', '--wait-timeout', '180', 'backend', 'frontend')) | Out-Null
    }
}
