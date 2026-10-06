[CmdletBinding()]
param(
    [string]$EnvFile = '',
    [string]$DatasetFile = '',
    [string]$JarFile = '',
    [string]$OutputDirectory = '',
    [string]$PasswordFile = '',
    [ValidatePattern('^bugboard26_(performance|restore_[a-z0-9_]+)$')][string]$Database = 'bugboard26_performance',
    [int]$Port = 18080,
    [int]$WarmupSeconds = 30,
    [int]$MeasureSeconds = 120,
    [switch]$AggregationsOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Join-Path $PSScriptRoot '..') 'output/reports/performance' }
. (Join-Path $PSScriptRoot 'backup.ps1') -LibraryOnly -EnvFile $EnvFile -OutputDirectory $OutputDirectory -Database $Database
if (-not $DatasetFile) { $DatasetFile = Join-Path $script:BackupWorkspace 'output/reports/performance-dataset.json' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $script:BackupWorkspace 'output/reports/performance' }
if (-not $PasswordFile) { $PasswordFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.bugboard26/performance-password' }
if ($WarmupSeconds -lt 1 -or $MeasureSeconds -lt 1 -or $Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid measurement parameters.' }
if ($Port -ne 18080) { throw 'The dedicated benchmark deployment exposes backend port 18080.' }
$dataset = Get-Content -LiteralPath $DatasetFile -Raw | ConvertFrom-Json
if ($dataset.seed -ne 2606 -or $dataset.counts.user_accounts -ne 100 -or $dataset.counts.issues -ne 10000 -or
    $dataset.counts.comments -ne 50000 -or $dataset.counts.issue_events -ne 100000 -or $dataset.counts.notifications -ne 30000 -or $dataset.workers.Count -ne 20) {
    throw 'A complete verified seed2606 dataset is required.'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($output) | Out-Null
$compose = Join-Path $script:BackupWorkspace 'deploy/performance-compose.yaml'
$containerDb = Get-BackupContainer $EnvFile $compose
$baseline = Get-BackupManifest $containerDb $Database
foreach ($name in @('user_accounts','issues','comments','issue_events','notifications','issue_images')) {
    if ($baseline.counts.$name -ne $dataset.counts.$name) { throw ('Performance database no longer matches the pristine fixture: ' + $name) }
}
$environmentPath = (Resolve-Path -LiteralPath $EnvFile).Path
$snapshotJar = Join-Path $script:BackupWorkspace 'output/reports/performance-backend.jar'
if ($JarFile) {
    Invoke-BackupDocker -Arguments @('compose','--env-file',$environmentPath,'-f',$compose,'stop','backend','frontend') | Out-Null
    $candidate = (Resolve-Path -LiteralPath $JarFile).Path
    if ($candidate -ne [IO.Path]::GetFullPath($snapshotJar)) { Copy-Item -LiteralPath $candidate -Destination $snapshotJar -Force }
}
$jar = (Resolve-Path -LiteralPath $snapshotJar).Path
$baseUrl = 'http://127.0.0.1:' + $Port + '/api/v1'
$password = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PasswordFile).Path)

$harness = @'
using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace BugBoardPerformance {
    [DataContract] public class Csrf { [DataMember] public string token; }
    [DataContract] public class Issue {
        [DataMember] public string title; [DataMember] public string description;
        [DataMember] public string type; [DataMember] public string priority; [DataMember] public long version;
    }
    [DataContract] public class Edit {
        [DataMember] public string title; [DataMember] public string description; [DataMember] public string type;
        [DataMember] public string priority; [DataMember] public string[] labelIds; [DataMember] public long expectedVersion;
    }
    public class Sample { public long utcEpochMilliseconds; public int worker; public string endpoint; public double elapsedMs; public int status; }
    public class ExportSample { public long startEpochMilliseconds; public long endEpochMilliseconds; public double elapsedMs; public int status; public long bytes; public int rows; }
    public class Session : IDisposable {
        public HttpClient client; public string csrf; public string issueId; public Issue state;
        public void Dispose() { client.Dispose(); }
    }
    public static class Harness {
        private static T Parse<T>(string json) {
            using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json))) { return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(stream); }
        }
        private static string Json<T>(T value) {
            using (var stream = new MemoryStream()) { new DataContractJsonSerializer(typeof(T)).WriteObject(stream,value); return Encoding.UTF8.GetString(stream.ToArray()); }
        }
        public static async Task<Session> Login(string baseUrl,string email,string password,string issueId) {
            var handler = new HttpClientHandler { CookieContainer = new CookieContainer(), AllowAutoRedirect = false };
            var session = new Session { client = new HttpClient(handler), issueId = issueId };
            session.client.Timeout = TimeSpan.FromSeconds(30);
            var token = Parse<Csrf>(await session.client.GetStringAsync(baseUrl + "/auth/csrf")).token;
            using (var request = new HttpRequestMessage(HttpMethod.Post,baseUrl + "/auth/login")) {
                request.Headers.Add("X-CSRF-TOKEN",token);
                request.Content = new StringContent("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}",Encoding.UTF8,"application/json");
                using (var response = await session.client.SendAsync(request)) { if ((int)response.StatusCode!=200) { session.Dispose(); throw new InvalidOperationException("Performance login failed without exposing credentials."); } }
            }
            session.csrf = Parse<Csrf>(await session.client.GetStringAsync(baseUrl + "/auth/csrf")).token;
            if (!string.IsNullOrEmpty(issueId)) { session.state = Parse<Issue>(await session.client.GetStringAsync(baseUrl + "/issues/" + issueId)); }
            return session;
        }
        public static async Task<Sample[]> Run(Session[] sessions,string baseUrl,string[] issueIds,int warmup,int duration) {
            var samples = new ConcurrentBag<Sample>();
            long began = Stopwatch.GetTimestamp();
            long measureStart = began + warmup * Stopwatch.Frequency;
            long ended = measureStart + duration * Stopwatch.Frequency;
            var tasks = new List<Task>();
            for (int user=0;user<sessions.Length;user++) {
                int worker=user;
                tasks.Add(Worker(sessions[user],baseUrl,issueIds,worker,measureStart,ended,samples));
            }
            await Task.WhenAll(tasks);
            return samples.ToArray();
        }
        private static async Task Worker(Session session,string baseUrl,string[] issueIds,int worker,long start,long end,ConcurrentBag<Sample> samples) {
            int iteration=worker;
            while (Stopwatch.GetTimestamp()<end) {
                int operation=iteration%20; string endpoint; string path; string method="GET"; string body=null;
                if (operation<8) { endpoint="list"; path="/issues?page=" + ((iteration/20)%20) + "&size=20"; }
                else if (operation<13) { endpoint="search"; path="/issues?q=performance%20issue%20" + ((iteration*79)%10000) + "&size=20"; }
                else if (operation<18) { endpoint="detail"; path="/issues/" + issueIds[(iteration*79+worker)%8000]; }
                else if (operation==18) {
                    endpoint="edit"; path="/issues/"+session.issueId; method="PATCH";
                    body=Json(new Edit { title="Performance edit " + worker + " " + iteration, description=session.state.description,
                        type=session.state.type,priority=session.state.priority,labelIds=new string[0],expectedVersion=session.state.version });
                } else { endpoint="comment"; path="/issues/"+session.issueId+"/comments"; method="POST"; body="{\"body\":\"Performance load comment " + iteration + "\"}"; }
                long tick=Stopwatch.GetTimestamp(); long utc=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); int status=0;
                try {
                    using (var request=new HttpRequestMessage(new HttpMethod(method),baseUrl+path)) {
                        if (body!=null) { request.Content=new StringContent(body,Encoding.UTF8,"application/json"); request.Headers.Add("X-CSRF-TOKEN",session.csrf); }
                        if (endpoint=="comment") { request.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString()); }
                        using (var response=await session.client.SendAsync(request)) {
                            status=(int)response.StatusCode;
                            string payload=await response.Content.ReadAsStringAsync();
                            if (endpoint=="edit" && status==200) { session.state=Parse<Issue>(payload); }
                        }
                    }
                } catch (HttpRequestException) { status=0; } catch (TaskCanceledException) { status=0; }
                double milliseconds=(Stopwatch.GetTimestamp()-tick)*1000.0/Stopwatch.Frequency;
                if (tick>=start && tick<end) { samples.Add(new Sample { utcEpochMilliseconds=utc,worker=worker,endpoint=endpoint,elapsedMs=milliseconds,status=status }); }
                iteration++;
            }
        }
        public static async Task<Sample[]> Aggregations(Session admin,string baseUrl,string month) {
            var result=new List<Sample>();
            foreach (string endpoint in new [] {"dashboard","report"}) {
                string path=endpoint=="dashboard"?"/admin/dashboard":"/admin/reports/monthly?month="+month;
                for (int index=0;index<35;index++) {
                    long tick=Stopwatch.GetTimestamp(); long utc=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    using (var response=await admin.client.GetAsync(baseUrl+path)) {
                        await response.Content.ReadAsByteArrayAsync();
                        if (index>=5) { result.Add(new Sample { utcEpochMilliseconds=utc,worker=0,endpoint=endpoint,
                            elapsedMs=(Stopwatch.GetTimestamp()-tick)*1000.0/Stopwatch.Frequency,status=(int)response.StatusCode }); }
                        else if ((int)response.StatusCode!=200) { throw new InvalidOperationException("Aggregation warm-up failed."); }
                    }
                }
            }
            return result.ToArray();
        }
        public static async Task<ExportSample[]> Exports(Session admin,string baseUrl) {
            var result=new List<ExportSample>();
            for (int index=0;index<3;index++) {
                await Task.Delay(1100);
                long utc=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); long tick=Stopwatch.GetTimestamp();
                using (var response=await admin.client.GetAsync(baseUrl+"/issues/export?archived=all")) {
                    byte[] bytes=await response.Content.ReadAsByteArrayAsync();
                    result.Add(new ExportSample { startEpochMilliseconds=utc,endEpochMilliseconds=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        elapsedMs=(Stopwatch.GetTimestamp()-tick)*1000.0/Stopwatch.Frequency,status=(int)response.StatusCode,bytes=bytes.Length,
                        rows=Encoding.UTF8.GetString(bytes).TrimEnd('\r','\n').Split('\n').Length-1 });
                }
                await Task.Delay(1100);
            }
            return result.ToArray();
        }
    }
}
'@

if ($PSVersionTable.PSVersion.Major -ge 6) {
    $references = [IO.Directory]::GetFiles((Join-Path $PSHOME 'ref'), '*.dll')
} else {
    Add-Type -AssemblyName System.Net.Http
    $references = @('System.dll','System.Core.dll','System.Net.Http.dll','System.Runtime.Serialization.dll','System.Xml.dll')
}
if (-not ('BugBoardPerformance.Harness' -as [type])) { Add-Type -TypeDefinition $harness -ReferencedAssemblies $references }
$sessions = New-Object 'System.Collections.Generic.List[BugBoardPerformance.Session]'
$admin = $null
$startedContainer = $false
$previousDatabase = $env:PERFORMANCE_DATABASE
try {
    $env:PERFORMANCE_DATABASE = $Database
    Invoke-BackupDocker -Arguments @('compose','--env-file',$environmentPath,'-f',$compose,'up','-d','backend','frontend') | Out-Null
    $container = (Invoke-BackupDocker -Arguments @('compose','--env-file',$environmentPath,'-f',$compose,'ps','-q','backend') | Out-String).Trim()
    $startedContainer = $true
    $deadline = [DateTime]::UtcNow.AddMinutes(2)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline -and -not $ready) {
        try { $response = Invoke-WebRequest -Uri ($baseUrl + '/health/ready') -UseBasicParsing -TimeoutSec 3; $ready = $response.StatusCode -eq 200 }
        catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'The isolated performance backend did not become ready.' }
    foreach ($worker in $(if ($AggregationsOnly) { @() } else { $dataset.workers })) {
        $session = [BugBoardPerformance.Harness]::Login($baseUrl, $worker.email, $password, $worker.writeIssueId).GetAwaiter().GetResult()
        $sessions.Add($session)
    }
    $admin = [BugBoardPerformance.Harness]::Login($baseUrl, $dataset.adminEmail, $password, '').GetAwaiter().GetResult()
    $initialStats = Invoke-BackupDocker -Arguments @('stats','--no-stream','--format','{{json .}}',$container,$containerDb)
    $samples = [BugBoardPerformance.Sample[]]@()
    if (-not $AggregationsOnly) {
        $samples = [BugBoardPerformance.Harness]::Run($sessions.ToArray(), $baseUrl, [string[]]$dataset.issueIds, $WarmupSeconds, $MeasureSeconds).GetAwaiter().GetResult()
    }
    $aggregations = [BugBoardPerformance.Harness]::Aggregations($admin, $baseUrl, $dataset.month).GetAwaiter().GetResult()
    $exports = [BugBoardPerformance.Harness]::Exports($admin, $baseUrl).GetAwaiter().GetResult()
    $sampleColumns = @('utcEpochMilliseconds','worker','endpoint',@{Name='elapsedMs';Expression={$_.elapsedMs.ToString('R',[Globalization.CultureInfo]::InvariantCulture)}},'status')
    $samples | Sort-Object utcEpochMilliseconds | Select-Object $sampleColumns | Export-Csv -LiteralPath (Join-Path $output 'api-samples.csv') -NoTypeInformation
    $aggregations | Select-Object $sampleColumns | Export-Csv -LiteralPath (Join-Path $output 'aggregation-samples.csv') -NoTypeInformation
    $exports | Select-Object startEpochMilliseconds,endEpochMilliseconds,@{Name='elapsedMs';Expression={$_.elapsedMs.ToString('R',[Globalization.CultureInfo]::InvariantCulture)}},status,bytes,rows | Export-Csv -LiteralPath (Join-Path $output 'export-samples.csv') -NoTypeInformation
    $finalStats = Invoke-BackupDocker -Arguments @('stats','--no-stream','--format','{{json .}}',$container,$containerDb)
    $javaVersion = Invoke-BackupDocker -Arguments @('exec',$container,'sh','-c','java -version 2>&1')
    $backendKernel = Invoke-BackupDocker -Arguments @('exec',$container,'uname','-a')
    Invoke-BackupDocker -Arguments @('exec',$container,'touch','/tmp/bugboard26-performance-finish') | Out-Null
    $stopDeadline = [DateTime]::UtcNow.AddSeconds(30)
    $running = 'true'
    while ($running -eq 'true' -and [DateTime]::UtcNow -lt $stopDeadline) {
        Start-Sleep -Milliseconds 250
        $running = (Invoke-BackupDocker -Arguments @('inspect',$container,'--format','{{.State.Running}}') | Out-String).Trim()
    }
    if ($running -eq 'true') { throw 'The measurement launcher did not finish recording within 30 seconds.' }
    $launcherExitCode = [int]((Invoke-BackupDocker -Arguments @('inspect',$container,'--format','{{.State.ExitCode}}') | Out-String).Trim())
    if ($launcherExitCode -ne 0) { throw ('The measurement launcher exited unsuccessfully: ' + $launcherExitCode) }
    Invoke-BackupDocker -Arguments @('cp',($container + ':/tmp/bugboard26-performance-heap.csv'),(Join-Path $output 'heap-samples.csv')) | Out-Null
    Invoke-BackupDocker -Arguments @('cp',($container + ':/tmp/bugboard26-performance.jfr'),(Join-Path $output 'allocations-gc.jfr')) | Out-Null
    $recordingPath = Join-Path $output 'allocations-gc.jfr'
    $recordingStream = [IO.File]::OpenRead($recordingPath)
    try {
        $recordingHeader = New-Object byte[] 4
        if ($recordingStream.Read($recordingHeader,0,4) -ne 4 -or $recordingHeader[0] -ne 70 -or
            $recordingHeader[1] -ne 76 -or $recordingHeader[2] -ne 82 -or $recordingHeader[3] -ne 0) {
            throw 'The allocation/GC recording is empty or has an invalid JFR header.'
        }
    } finally { $recordingStream.Dispose() }
    $heap = Import-Csv -LiteralPath (Join-Path $output 'heap-samples.csv')
    $summary = [ordered]@{}
    $measuredEndpoints = if ($AggregationsOnly) { @('dashboard','report') } else { @('list','search','detail','edit','comment','dashboard','report') }
    foreach ($endpoint in $measuredEndpoints) {
        $rows = @(@($samples) + @($aggregations) | Where-Object { $_.endpoint -eq $endpoint } | Sort-Object elapsedMs)
        if ($rows.Count -eq 0) { throw ('Missing endpoint samples: ' + $endpoint) }
        $p95 = $rows[[Math]::Ceiling($rows.Count * 0.95) - 1].elapsedMs
        $p99 = $rows[[Math]::Ceiling($rows.Count * 0.99) - 1].elapsedMs
        $expected = if ($endpoint -eq 'comment') { 201 } else { 200 }
        $unexpected = @($rows | Where-Object { $_.status -ne $expected }).Count
        $limit = if ($endpoint -in @('edit','comment')) { 800 } elseif ($endpoint -in @('dashboard','report')) { 1000 } else { 500 }
        $summary[$endpoint] = @{ count=$rows.Count; p95Ms=$p95; p99Ms=$p99; unexpectedStatusCount=$unexpected;
            thresholdPass=($p95 -le $limit -and $unexpected -eq 0 -and ($endpoint -notin @('list','search','detail') -or $p99 -le 1000)) }
    }
    $exportResults = @()
    foreach ($export in $exports) {
        $before = @($heap | Where-Object { [long]$_.utcEpochMilliseconds -lt $export.startEpochMilliseconds } | Select-Object -Last 1)
        $during = @($heap | Where-Object { [long]$_.utcEpochMilliseconds -ge $export.startEpochMilliseconds -and [long]$_.utcEpochMilliseconds -le $export.endEpochMilliseconds })
        if ($before.Count -ne 1 -or $during.Count -eq 0) { throw 'Missing JVM heap samples around an export.' }
        $peak = ($during | ForEach-Object { [long]$_.usedBytes } | Measure-Object -Maximum).Maximum
        $increase = [Math]::Max(0, $peak - [long]$before[0].usedBytes)
        $exportResults += @{ elapsedMs=$export.elapsedMs; bytes=$export.bytes; status=$export.status; rows=$export.rows; heapBaselineBytes=[long]$before[0].usedBytes;
            heapPeakBytes=$peak; heapAdditionalBytes=$increase; thresholdPass=($export.status -eq 200 -and $export.rows -eq 10000 -and $export.elapsedMs -le 5000 -and $increase -le 134217728) }
    }
    $dockerCpu = [int]((Invoke-BackupDocker -Arguments @('info','--format','{{.NCPU}}') | Out-String).Trim())
    $dockerMemory = [long]((Invoke-BackupDocker -Arguments @('info','--format','{{.MemTotal}}') | Out-String).Trim())
    $cpuLimits = @{}
    $cpuAffinity = @{}
    foreach ($service in @('db','backend','frontend')) {
        $id = (Invoke-BackupDocker -Arguments @('compose','--env-file',$environmentPath,'-f',$compose,'ps','--all','-q',$service) | Out-String).Trim()
        $cpuLimits[$service] = [long]((Invoke-BackupDocker -Arguments @('inspect',$id,'--format','{{.HostConfig.NanoCpus}}') | Out-String).Trim())
        $cpuAffinity[$service] = (Invoke-BackupDocker -Arguments @('inspect',$id,'--format','{{.HostConfig.CpusetCpus}}') | Out-String).Trim()
    }
    $report = [ordered]@{ utc=[DateTime]::UtcNow.ToString('o'); seed=2606; baselineCounts=$baseline.counts;
        workloadScope=$(if ($AggregationsOnly) { 'aggregation-export-only; NFR01 is not repeated by this run' } else { 'full-NFR01-NFR02' });
        warmupSeconds=$(if ($AggregationsOnly) { $null } else { $WarmupSeconds }); measureSeconds=$(if ($AggregationsOnly) { $null } else { $MeasureSeconds });
        virtualUsers=$(if ($AggregationsOnly) { 1 } else { 20 }); aggregationWarmupRequestsPerEndpoint=5; aggregationMeasuredRequestsPerEndpoint=30;
        percentiles='nearest-rank'; endpoints=$summary; exports=$exportResults;
        heapSampling='MemoryMXBean every25ms; maximum sampled used heap minus last sample before request; sampling can miss shorter peaks';
        jfr='allocations-gc.jfr'; os=[Environment]::OSVersion.VersionString; clientLogicalCpu=[Environment]::ProcessorCount;
        javaVersion=$javaVersion; backendKernel=$backendKernel;
        command=('pwsh -File scripts/measure-performance.ps1 -Database ' + $Database + $(if ($AggregationsOnly) { ' -AggregationsOnly' } else { ' -WarmupSeconds ' + $WarmupSeconds + ' -MeasureSeconds ' + $MeasureSeconds }));
        dockerLogicalCpu=$dockerCpu; dockerMemoryBytes=$dockerMemory; backendCpuLimit=4; backendHeapBytes=1073741824;
        databaseCpuLimit=4; frontendCpuLimit=4; databaseIsolated=$true;
        cpuEnvironmentNote='Final measurement requires DB, backend and frontend to share the same CPU affinity 0-3, limiting the entire server deployment to four logical CPUs.';
        memoryEnvironmentNote='Docker reports usable memory; 7.6 GiB usable is compatible with an 8 GiB nominal environment. Backend and DB have separate 2 GiB limits; JVM heap 1 GiB.';
        measuredCpuLimitsNano=$cpuLimits; csvRowCounting='Fixture has no embedded line breaks; line count excludes its header';
        measuredCpusetCpus=$cpuAffinity;
        sharedFourCpuAffinityMatched=(@($cpuAffinity.Values | Where-Object { $_ -ne '0-3' }).Count -eq 0);
        containerEnvironmentMatched=($dockerMemory -ge 8053063680 -and @($cpuLimits.Values | Where-Object { $_ -ne 4000000000 }).Count -eq 0 -and ($AggregationsOnly -or ($WarmupSeconds -eq 30 -and $MeasureSeconds -eq 120)));
        standardEnvironmentMatched=($dockerMemory -ge 8053063680 -and @($cpuAffinity.Values | Where-Object { $_ -ne '0-3' }).Count -eq 0 -and @($cpuLimits.Values | Where-Object { $_ -ne 4000000000 }).Count -eq 0 -and ($AggregationsOnly -or ($WarmupSeconds -eq 30 -and $MeasureSeconds -eq 120)));
        strictFourCpuHostMatched=($dockerCpu -eq 4);
        strictEightGiBUsableMemoryMatched=($dockerMemory -ge 8589934592);
        initialDockerStats=$initialStats; finalDockerStats=$finalStats; dockerStatsUsage='RSS/cgroup diagnostic only, never heap evidence';
        jarSha256=(Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash.ToLowerInvariant(); seedingJarSha256=$dataset.jarSha256; database=$Database;
        uiNfr03='NOT_EXECUTED; requires five real browser runs against the performance dataset';
        datasetAfterLoad=(Get-BackupManifest $containerDb $Database).counts }
    [IO.File]::WriteAllText((Join-Path $output 'summary.json'), ($report | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    Write-Output (Join-Path $output 'summary.json')
    if (@($summary.Values | Where-Object { -not $_.thresholdPass }).Count -gt 0 -or @($exportResults | Where-Object { -not $_.thresholdPass }).Count -gt 0) {
        throw 'Performance thresholds failed; inspect raw samples and summary.'
    }
} finally {
    foreach ($session in $sessions) { $session.Dispose() }
    if ($admin) { $admin.Dispose() }
    $password = $null
    $env:PERFORMANCE_DATABASE = $previousDatabase
    if ($startedContainer) { Invoke-BackupDocker -Arguments @('start',$container) | Out-Null }
}
