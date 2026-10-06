#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [string]$ComposeFile = '',
    [string]$BaseUrl = 'http://localhost:8080/api/v1',
    [string]$AdminEmail = 'admin@bugboard.local',
    [string]$PasswordFile = '',
    [string]$ImageFile = '',
    [string]$ReportFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) { $EnvFile = Join-Path $workspace 'deploy/.env' }
if (-not $ComposeFile) { $ComposeFile = Join-Path $workspace 'deploy/compose.yaml' }
if (-not $ImageFile) { $ImageFile = Join-Path $workspace 'frontend/tests/e2e/fixtures/issue-image.png' }
if (-not $ReportFile) { $ReportFile = Join-Path $workspace 'output/reports/runtime-verification.json' }
$environmentPath = (Resolve-Path -LiteralPath $EnvFile).Path
$composePath = (Resolve-Path -LiteralPath $ComposeFile).Path
$imageBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $ImageFile).Path)
$password = if ($PasswordFile) { [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PasswordFile).Path).TrimEnd("`r", "`n") } else { $env:BUGBOARD_RUNTIME_ADMIN_PASSWORD }
if ([string]::IsNullOrEmpty($password)) { throw 'Supply PasswordFile or BUGBOARD_RUNTIME_ADMIN_PASSWORD; credentials are never included in the report.' }
$baseUri = [Uri]($BaseUrl.TrimEnd('/') + '/')
if (-not $baseUri.IsLoopback -or $baseUri.Scheme -ne 'http') { throw 'Runtime verification requires an explicit local HTTP deployment.' }
$started = [DateTimeOffset]::UtcNow
$requests = [Collections.Generic.List[object]]::new()
$checks = [Collections.Generic.List[string]]::new()
$sensitive = [Collections.Generic.List[string]]::new()
$sensitive.Add($password)
$sensitive.Add($AdminEmail)
$sensitive.Add([Convert]::ToBase64String($imageBytes))
$marker = [Guid]::NewGuid().ToString('N')
$bodyMarker = 'RUNTIME_PRIVATE_BODY_' + $marker
$queryMarker = 'RUNTIME_PRIVATE_QUERY_' + $marker
$sensitive.Add($bodyMarker)
$sensitive.Add($queryMarker)
$script:RuntimeCsrf = $null
$cookies = [Net.CookieContainer]::new()
$handler = [Net.Http.HttpClientHandler]::new()
$handler.CookieContainer = $cookies
$handler.AllowAutoRedirect = $false
$script:RuntimeHttp = [Net.Http.HttpClient]::new($handler)
$script:RuntimeHttp.Timeout = [TimeSpan]::FromSeconds(45)
$anonymousHandler = [Net.Http.HttpClientHandler]::new()
$anonymousHandler.AllowAutoRedirect = $false
$anonymousHandler.UseCookies = $false
$anonymous = [Net.Http.HttpClient]::new($anonymousHandler)
$anonymous.Timeout = [TimeSpan]::FromSeconds(45)
$restoreRequired = $false
$report = [ordered]@{ schemaVersion = 1; startedAt = $started.ToString('o'); baseUrl = $BaseUrl; result = 'FAIL'; checks = @(); requests = @(); scriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant(); composeSha256 = (Get-FileHash -LiteralPath $composePath -Algorithm SHA256).Hash.ToLowerInvariant() }

function Invoke-RuntimeDocker([string[]]$Arguments) {
    $info = [Diagnostics.ProcessStartInfo]::new('docker')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($info)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $outputText = $stdout.GetAwaiter().GetResult()
    $errorText = $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'Docker operation failed; private container output was not printed.' }
    $process.Dispose()
    return [pscustomobject]@{ Out = $outputText; Error = $errorText }
}

function Invoke-RuntimeCompose([string[]]$Arguments) {
    return Invoke-RuntimeDocker (@('compose', '--env-file', $environmentPath, '-f', $composePath) + $Arguments)
}

function Assert-Runtime([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Invoke-RuntimeRequest([string]$Method, [string]$Path, [int[]]$Expected,
    [object]$Body = $null, [string]$Key = '', [Net.Http.HttpContent]$Content = $null,
    [Net.Http.HttpClient]$Client = $script:RuntimeHttp, [bool]$Chunked = $false) {
    $requestId = [Guid]::NewGuid().ToString()
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), [Uri]::new($baseUri, $Path.TrimStart('/')))
    $request.Headers.Add('X-Request-ID', $requestId)
    if ($Chunked) { $request.Headers.TransferEncodingChunked = $true }
    if ($Key) { $request.Headers.Add('Idempotency-Key', $Key) }
    if ($Method -ne 'GET' -and $script:RuntimeCsrf -and $Client -eq $script:RuntimeHttp) { $request.Headers.Add($script:RuntimeCsrf.headerName, $script:RuntimeCsrf.token) }
    if ($Content) { $request.Content = $Content }
    elseif ($null -ne $Body) { $request.Content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Depth 40 -Compress), [Text.Encoding]::UTF8, 'application/json') }
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    try {
        $status = [int]$response.StatusCode
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $returnedId = if ($response.Headers.Contains('X-Request-ID')) { @($response.Headers.GetValues('X-Request-ID'))[0] } else { '' }
        $requests.Add([pscustomobject]@{ method = $Method; route = ($Path -split '\?')[0]; status = $status; requestId = $requestId })
        Assert-Runtime ($returnedId -eq $requestId) 'Correlation ID is missing or changed.'
        Assert-Runtime ($Expected -contains $status) ('Unexpected HTTP status for ' + $Method + ' ' + ($Path -split '\?')[0] + ': expected ' + ($Expected -join ',') + ', received ' + $status)
        $json = $null
        if ($response.Content.Headers.ContentType -and $response.Content.Headers.ContentType.MediaType -in @('application/json', 'application/problem+json')) {
            $json = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -Depth 50
        }
        return [pscustomobject]@{ Json = $json; Bytes = $bytes; Status = $status }
    } finally { $response.Dispose(); $request.Dispose() }
}

function Wait-RuntimeReady {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(180)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $probe = Invoke-RuntimeRequest GET 'health/ready' @(200, 503) -Client $anonymous
        if ($probe.Status -eq 200) { Assert-Runtime ($probe.Json.status -eq 'UP') 'Readiness response is invalid.'; return }
        Assert-Runtime ($probe.Json.status -eq 'DOWN') 'Unavailable readiness response is invalid.'
        Start-Sleep -Milliseconds 1000
    }
    throw 'Backend readiness did not recover within 180 seconds.'
}

function New-RuntimeMultipart([object]$Fields) {
    $form = [Net.Http.MultipartFormDataContent]::new()
    $form.Add([Net.Http.StringContent]::new(($Fields | ConvertTo-Json -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json'), 'issue')
    $image = [Net.Http.ByteArrayContent]::new($imageBytes)
    $image.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new('image/png')
    $form.Add($image, 'image', 'runtime-image.png')
    return ,$form
}

function Get-RuntimeSnapshot([string]$IssueId) {
    $detail = (Invoke-RuntimeRequest GET ('issues/' + $IssueId) 200).Json
    $comments = (Invoke-RuntimeRequest GET ('issues/' + $IssueId + '/comments?size=100') 200).Json
    $events = (Invoke-RuntimeRequest GET ('issues/' + $IssueId + '/history?size=100') 200).Json
    $inbox = (Invoke-RuntimeRequest GET 'notifications?size=100' 200).Json
    $image = (Invoke-RuntimeRequest GET ('issues/' + $IssueId + '/image') 200).Bytes
    $encodedImage = [Convert]::ToBase64String($image)
    if (-not $sensitive.Contains($encodedImage)) { $sensitive.Add($encodedImage) }
    $notificationRows = @($inbox.items | Where-Object { $_.issue.id -eq $IssueId })
    return [ordered]@{
        detail = ($detail | ConvertTo-Json -Depth 40 -Compress)
        comments = ($comments | ConvertTo-Json -Depth 40 -Compress)
        events = ($events | ConvertTo-Json -Depth 40 -Compress)
        notifications = ($notificationRows | ConvertTo-Json -Depth 40 -Compress)
        imageSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($image)).ToLowerInvariant()
    }
}

function Assert-RuntimeSnapshot([object]$Before, [object]$After) {
    foreach ($property in @('detail', 'comments', 'events', 'notifications', 'imageSha256')) {
        Assert-Runtime ($Before[$property] -ceq $After[$property]) ('Persisted snapshot changed: ' + $property)
    }
}

function Assert-RuntimeLogStream([string]$Logs, [string]$Source, [bool]$AllowJvmStartup) {
    foreach ($privateValue in $sensitive) {
        Assert-Runtime (-not $Logs.Contains($privateValue, [StringComparison]::Ordinal)) ('A forbidden private value occurred in ' + $Source + ' logs.')
    }
    $loggedIds = [Collections.Generic.HashSet[string]]::new()
    $requestLogCount = 0
    $jvmStartupLines = 0
    foreach ($line in ($Logs -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($AllowJvmStartup -and $line.StartsWith('Picked up JAVA_TOOL_OPTIONS:')) { $jvmStartupLines++; continue }
        Assert-Runtime ($line.TrimStart().StartsWith('{')) ('An application log line is not JSON in ' + $Source + '.')
        $entry = $line | ConvertFrom-Json -Depth 60
        if ($entry.message -ne 'http_request') { continue }
        foreach ($property in @('requestId', 'method', 'route', 'status', 'durationMs')) {
            Assert-Runtime ($null -ne $entry.PSObject.Properties[$property]) ('Structured HTTP log lacks ' + $property)
        }
        $parsedGuid = [Guid]::Empty
        Assert-Runtime ([Guid]::TryParse([string]$entry.requestId, [ref]$parsedGuid)) 'A structured log correlation ID is invalid.'
        [void]$loggedIds.Add([string]$entry.requestId)
        $requestLogCount++
    }
    foreach ($request in $requests) { Assert-Runtime ($loggedIds.Contains($request.requestId)) ('An HTTP request is missing from ' + $Source + ' structured logs.') }
    return [pscustomobject]@{ source = $Source; requestCount = $requestLogCount; excludedJvmStartupLines = $jvmStartupLines }
}

try {
    Invoke-RuntimeRequest GET 'health/ready' 200 -Client $anonymous | Out-Null
    $script:RuntimeCsrf = (Invoke-RuntimeRequest GET 'auth/csrf' 200).Json
    $sensitive.Add($script:RuntimeCsrf.token)
    Invoke-RuntimeRequest POST 'auth/login' 200 @{ email = $AdminEmail; password = $password } | Out-Null
    $script:RuntimeCsrf = (Invoke-RuntimeRequest GET 'auth/csrf' 200).Json
    $sensitive.Add($script:RuntimeCsrf.token)
    $me = (Invoke-RuntimeRequest GET 'auth/me' 200).Json
    Assert-Runtime ($me.role -eq 'ADMIN' -and -not $me.mustChangePassword) 'An active administrator with a changed password is required.'
    $sessionCookie = @($cookies.GetCookies($baseUri) | Where-Object Name -eq 'BBSESSION')[0].Value
    $sensitive.Add($sessionCookie)
    try {
        $decodedSessionId = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($sessionCookie))
        $sessionGuid = [Guid]::Empty
        if ([Guid]::TryParse($decodedSessionId, [ref]$sessionGuid)) { $sensitive.Add($decodedSessionId) }
    } catch [FormatException] { # Opaque cookies need no base64 decoding.
    }
    $checks.Add('real_session_and_csrf')

    $createKey = [Guid]::NewGuid().ToString()
    $commentKey = [Guid]::NewGuid().ToString()
    $fields = @{ title = $bodyMarker; description = 'Synthetic runtime persistence and privacy check ' + $bodyMarker; type = 'BUG'; priority = 'HIGH'; labelIds = @() }
    $created = (Invoke-RuntimeRequest POST 'issues' 201 -Key $createKey -Content (New-RuntimeMultipart $fields)).Json
    $issueId = $created.id
    $report.issueId = $issueId
    $commentBody = @{ body = 'Synthetic runtime comment ' + $bodyMarker }
    $comment = (Invoke-RuntimeRequest POST ('issues/' + $issueId + '/comments') 201 $commentBody $commentKey).Json
    $assigned = (Invoke-RuntimeRequest PUT ('issues/' + $issueId + '/assignment') 200 @{ expectedVersion = $created.version; assigneeId = $me.id }).Json
    $progress = (Invoke-RuntimeRequest PUT ('issues/' + $issueId + '/state') 200 @{ expectedVersion = $assigned.version; status = 'IN_PROGRESS' }).Json
    $resolved = (Invoke-RuntimeRequest PUT ('issues/' + $issueId + '/state') 200 @{ expectedVersion = $progress.version; status = 'RESOLVED' }).Json
    Assert-Runtime ($resolved.status -eq 'RESOLVED' -and $resolved.version -eq 3) 'Resolve workflow produced an unexpected state.'
    $privateQueryResult = (Invoke-RuntimeRequest GET ('issues?q=' + [Uri]::EscapeDataString($queryMarker)) 200).Json
    Assert-Runtime ($privateQueryResult.totalElements -eq 0) 'The independent query sentinel unexpectedly matched an issue.'
    Invoke-RuntimeRequest PUT ('issues/' + $issueId + '/state') 409 @{ expectedVersion = $resolved.version; status = 'IN_PROGRESS' } | Out-Null
    Invoke-RuntimeRequest POST ('issues/' + $issueId + '/comments') 413 @{ body = $bodyMarker + ('x' * 131072) } ([Guid]::NewGuid().ToString()) -Chunked $true | Out-Null
    Invoke-RuntimeRequest GET 'issues' 401 -Client $anonymous | Out-Null
    $before = Get-RuntimeSnapshot $issueId
    Assert-Runtime ($before.imageSha256 -eq $created.image.sha256) 'Stored image hash differs from the HTTP download.'
    $initialComments = $before.comments | ConvertFrom-Json
    $initialEvents = $before.events | ConvertFrom-Json -Depth 50
    $initialNotifications = @($before.notifications | ConvertFrom-Json)
    Assert-Runtime ($initialComments.totalElements -eq 1 -and $initialComments.items[0].id -eq $comment.id) 'The comment was not persisted exactly once.'
    Assert-Runtime ($initialEvents.totalElements -eq 5) 'The workflow does not have five atomic audit events.'
    Assert-Runtime ($initialNotifications.Count -eq 2 -and (@($initialNotifications.type | Sort-Object) -join ',') -eq 'ASSIGNED,RESOLVED') 'The workflow notifications are missing.'
    $checks.Add('create_comment_assignment_resolution_image')

    $restoreRequired = $true
    Invoke-RuntimeCompose @('stop', 'backend') | Out-Null
    Invoke-RuntimeCompose @('restart', 'db') | Out-Null
    Invoke-RuntimeCompose @('up', '-d', '--wait', '--wait-timeout', '180', 'db') | Out-Null
    Invoke-RuntimeCompose @('up', '-d', '--wait', '--wait-timeout', '180', 'backend', 'frontend') | Out-Null
    Wait-RuntimeReady
    $after = Get-RuntimeSnapshot $issueId
    Assert-RuntimeSnapshot $before $after
    Assert-Runtime (@($cookies.GetCookies($baseUri) | Where-Object Name -eq 'BBSESSION')[0].Value -ceq $sessionCookie) 'The persistent JDBC session changed across restart.'
    $replayedIssue = (Invoke-RuntimeRequest POST 'issues' 201 -Key $createKey -Content (New-RuntimeMultipart $fields)).Json
    $replayedComment = (Invoke-RuntimeRequest POST ('issues/' + $issueId + '/comments') 201 $commentBody $commentKey).Json
    Assert-Runtime ($replayedIssue.id -eq $issueId -and $replayedComment.id -eq $comment.id) 'Idempotent replay created a different object.'
    $matches = (Invoke-RuntimeRequest GET ('issues?q=' + [Uri]::EscapeDataString($bodyMarker)) 200).Json
    Assert-Runtime ($matches.totalElements -eq 1 -and $matches.items[0].id -eq $issueId) 'The create replay left an extra issue.'
    Assert-RuntimeSnapshot $before (Get-RuntimeSnapshot $issueId)
    $checks.Add('backend_database_restart_preserves_snapshot_and_jdbc_session')
    $checks.Add('create_comment_retry_is_unique')

    Invoke-RuntimeCompose @('stop', 'db') | Out-Null
    $ready = (Invoke-RuntimeRequest GET 'health/ready' 503 -Client $anonymous).Json
    $live = (Invoke-RuntimeRequest GET 'health/live' 200 -Client $anonymous).Json
    Assert-Runtime ($ready.status -eq 'DOWN' -and $live.status -eq 'UP') 'Liveness/readiness does not distinguish the database outage.'
    $authenticatedReady = (Invoke-RuntimeRequest GET 'health/ready' 503).Json
    $authenticatedLive = (Invoke-RuntimeRequest GET 'health/live' 200).Json
    Assert-Runtime ($authenticatedReady.status -eq 'DOWN' -and $authenticatedLive.status -eq 'UP') 'Health checks with a persistent session depend on authentication storage.'
    $readFailure = (Invoke-RuntimeRequest GET ('issues/' + $issueId) 503).Json
    $failedKey = [Guid]::NewGuid().ToString()
    $writeFailure = (Invoke-RuntimeRequest POST ('issues/' + $issueId + '/comments') 503 @{ body = 'Synthetic failed database write ' + $bodyMarker } $failedKey).Json
    Assert-Runtime ($readFailure.code -eq 'SERVICE_UNAVAILABLE' -and $writeFailure.code -eq 'SERVICE_UNAVAILABLE') 'Database outage did not return the defined safe problem.'
    Invoke-RuntimeCompose @('up', '-d', '--wait', '--wait-timeout', '180', 'db') | Out-Null
    Wait-RuntimeReady
    Assert-RuntimeSnapshot $before (Get-RuntimeSnapshot $issueId)
    $checks.Add('database_outage_ready_503_live_200_reads_writes_503_no_mutation')

    $containerId = (Invoke-RuntimeCompose @('ps', '-q', 'backend')).Out.Trim()
    Assert-Runtime (-not [string]::IsNullOrEmpty($containerId)) 'Backend container is missing.'
    $report.backendImageId = (Invoke-RuntimeDocker @('inspect', '--format', '{{.Image}}', $containerId)).Out.Trim()
    $databaseContainerId = (Invoke-RuntimeCompose @('ps', '-q', 'db')).Out.Trim()
    $report.databaseImageId = (Invoke-RuntimeDocker @('inspect', '--format', '{{.Image}}', $databaseContainerId)).Out.Trim()
    $captured = Invoke-RuntimeDocker @('logs', '--since', $started.ToString('o'), $containerId)
    $consoleResult = Assert-RuntimeLogStream ($captured.Out + $captured.Error) 'container_console' $true
    $fileLog = Invoke-RuntimeDocker @('exec', $containerId, 'cat', '/app/logs/bugboard26.log')
    $fileResult = Assert-RuntimeLogStream $fileLog.Out 'application_file' $false
    $report.logStreams = @($consoleResult, $fileResult)
    $checks.Add('json_logs_correlation_ids_and_no_password_cookie_body_query')
    $report.result = 'PASS'
} catch {
    # Only our own safe diagnostic is written. HTTP bodies and native stderr stay private.
    $safeFailure = $_.Exception.Message
    foreach ($privateValue in $sensitive) { $safeFailure = $safeFailure.Replace($privateValue, '[REDACTED]', [StringComparison]::Ordinal) }
    $report.failure = $safeFailure
} finally {
    if ($restoreRequired) {
        try { Invoke-RuntimeCompose @('up', '-d', '--wait', '--wait-timeout', '180', 'db', 'backend', 'frontend') | Out-Null }
        catch { $report.result = 'FAIL'; $report.recoveryFailure = 'Compose recovery failed; start db, backend and frontend before continuing.' }
    }
    $script:RuntimeHttp.Dispose()
    $anonymous.Dispose()
    $report.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $report.checks = $checks.ToArray()
    $report.requests = $requests.ToArray()
    $reportPath = [IO.Path]::GetFullPath($ReportFile)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportPath)) | Out-Null
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Write-Output ('Runtime verification: ' + $report.result + '; checks=' + $checks.Count + '; report=' + $reportPath)
}
if ($report.result -ne 'PASS') { throw 'Runtime verification failed. See the sanitized report; services were recovered in finally.' }
