[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [string]$JarFile = '',
    [string]$ReportFile = '',
    [string]$PasswordFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup.ps1') -LibraryOnly -EnvFile $EnvFile
if (-not $JarFile) { $JarFile = Join-Path $script:BackupWorkspace 'backend/target/bugboard26-0.1.0-SNAPSHOT.jar' }
if (-not $ReportFile) { $ReportFile = Join-Path $script:BackupWorkspace 'output/reports/performance-dataset.json' }
if (-not $PasswordFile) { $PasswordFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.bugboard26/performance-password' }
$passwordPath = [IO.Path]::GetFullPath($PasswordFile)
if ($passwordPath.StartsWith($script:BackupWorkspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Performance passwords must remain outside the repository workspace.'
}
if (-not [IO.File]::Exists($passwordPath)) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($passwordPath)) | Out-Null
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 24
    try { $random.GetBytes($bytes); [IO.File]::WriteAllText($passwordPath, [Convert]::ToBase64String($bytes), (New-Object Text.UTF8Encoding($false))) }
    finally { $random.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
    Protect-BackupPath $passwordPath
}
$environmentPath = (Resolve-Path -LiteralPath $EnvFile).Path
$compose = Join-Path $script:BackupWorkspace 'deploy/performance-compose.yaml'
Invoke-BackupDocker -Arguments @('compose','--env-file',$environmentPath,'-f',$compose,'up','-d','--wait','db') | Out-Null
$container = Get-BackupContainer $EnvFile $compose
$tables = (Invoke-BackupDocker -Arguments @('exec',$container,'sh','-c','PGPASSWORD="$MIGRATION_PASSWORD" psql -U bugboard_owner -d bugboard26_performance -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname=''public''"') | Out-String).Trim()
if ($tables -ne '0') { throw 'Dedicated performance database already contains tables. Existing data will not be overwritten.' }
$jar = (Resolve-Path -LiteralPath $JarFile).Path
$snapshotJar = Join-Path $script:BackupWorkspace 'output/reports/performance-backend.jar'
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($snapshotJar)) | Out-Null
Copy-Item -LiteralPath $jar -Destination $snapshotJar -Force
$report = [IO.Path]::GetFullPath($ReportFile)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($report)) | Out-Null
$network = (Invoke-BackupDocker -Arguments @('inspect',$container,'--format','{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{end}}') | Out-String).Trim()
if ($network -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Cannot identify dedicated performance Docker network.' }
$backend = 'bugboard26-performance-seed-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$containerReport = '/tmp/bugboard26-performance-dataset.json'
$previousPassword = $env:BUGBOARD_PERFORMANCE_PASSWORD
$started = $false
try {
    $env:BUGBOARD_PERFORMANCE_PASSWORD = [IO.File]::ReadAllText($passwordPath)
    Invoke-BackupDocker -Arguments @('run','--detach','--name',$backend,'--label','io.bugboard26.performance=true','--network',$network,
        '--cpus','4','--cpuset-cpus','0-3','--memory','2g','--env-file',$environmentPath,'-e','BUGBOARD_PERFORMANCE_PASSWORD',
        '-e','DATABASE_URL=jdbc:postgresql://db:5432/bugboard26_performance','-e','DATABASE_USERNAME=bugboard_runtime',
        '-e','MIGRATION_USERNAME=bugboard_owner','-e','BOOTSTRAP_ENABLED=false','-e','DEMO_SEED=false','-e','APP_PROFILE=demo',
        '--mount',('type=bind,source=' + $snapshotJar + ',target=/measurement/app.jar,readonly'),'--entrypoint','java',
        'bugboard26-backend','-Xmx1g','-Dloader.main=it.unina.bugboard26.shared.application.PerformanceSeeder',
        '-cp','/measurement/app.jar','org.springframework.boot.loader.launch.PropertiesLauncher') | Out-Null
    $started = $true
    $exitCode = (Invoke-BackupDocker -Arguments @('wait',$backend) | Out-String).Trim()
    $log = Invoke-BackupDocker -Arguments @('logs',$backend)
    [IO.File]::WriteAllText(([IO.Path]::ChangeExtension($report,'.seed.log')),($log -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
    if ($exitCode -ne '0') { throw ('Performance seeding failed. Inspect ' + [IO.Path]::ChangeExtension($report,'.seed.log')) }
    Invoke-BackupDocker -Arguments @('cp',($backend + ':' + $containerReport),$report) | Out-Null
    $data = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
    $data | Add-Member -NotePropertyName jarSha256 -NotePropertyValue ((Get-FileHash -LiteralPath $snapshotJar -Algorithm SHA256).Hash.ToLowerInvariant())
    $data | Add-Member -NotePropertyName verificationUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    [IO.File]::WriteAllText($report,($data | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
    if ($data.counts.user_accounts -ne 100 -or $data.counts.issues -ne 10000 -or $data.counts.comments -ne 50000 -or
        $data.counts.issue_events -ne 100000 -or $data.counts.notifications -ne 30000 -or $data.counts.issue_images -ne 100) {
        throw 'The performance dataset was not verified at its full required size.'
    }
    Write-Output $report
} finally {
    $env:BUGBOARD_PERFORMANCE_PASSWORD = $previousPassword
    if ($started) { Invoke-BackupDocker -Arguments @('rm',$backend) | Out-Null }
}
