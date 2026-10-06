package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.BugBoard26Application;
import it.unina.bugboard26.auth.application.BootstrapService;
import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.application.ImageService;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

/** Explicit operator CLI. No HTTP seed endpoint and no direct domain/event inserts. */
@Component
@Profile("performance-seed")
public class PerformanceSeeder implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(PerformanceSeeder.class);
    private static final String ADMIN_EMAIL = "perf-admin@bugboard.local";
    private static final String TEMPORARY_PASSWORD = "Performance temporary password 2606";
    private static final int IMAGE_BYTES = 100 * 1024;
    private static final String PRODUCTION_PROFILE = "prod";
    private static final int RESOLUTION_ISSUES = 1000;
    private static final int ARCHIVE_FROM = 8000;
    private static final int REOPENS_PER_ISSUE = 8;
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final UserService accounts;
    private final PasswordService passwords;
    private final IssueService issues;
    private final IssueWorkflowService workflow;
    private final CommentService comments;
    private final ImageService images;
    private final TransactionTemplate transactions;
    private final SeedingClock clock;
    private final JsonMapper mapper;

    public PerformanceSeeder(JdbcTemplate jdbc, UserRepository users, UserService accounts, PasswordService passwords,
            IssueService issues, IssueWorkflowService workflow, CommentService comments, ImageService images,
            org.springframework.transaction.PlatformTransactionManager transactionManager, SeedingClock clock, JsonMapper mapper) {
        this.jdbc = jdbc; this.users = users; this.accounts = accounts; this.passwords = passwords;
        this.issues = issues; this.workflow = workflow; this.comments = comments; this.images = images;
        this.transactions = new TransactionTemplate(transactionManager); this.clock = clock; this.mapper = mapper;
    }

    public static void main(String[] arguments) {
        if (PRODUCTION_PROFILE.equals(System.getenv("APP_PROFILE"))) {
            throw new IllegalStateException("Performance seeding is unavailable in production.");
        }
        SpringApplication application = new SpringApplication(BugBoard26Application.class, SeedConfiguration.class);
        application.setAdditionalProfiles("performance-seed");
        application.addInitializers(context -> context.getEnvironment().getPropertySources().addFirst(
            new org.springframework.core.env.MapPropertySource("performanceOperatorLimits", Map.of(
                "server.address", "127.0.0.1", "server.port", "0", "app.bootstrap-enabled", "false", "app.demo-seed", "false"))));
        try (ConfigurableApplicationContext context = application.run(arguments)) {
            if (!context.isActive()) { throw new IllegalStateException("Seed context did not start."); }
        }
    }

    @Override
    public void run(ApplicationArguments arguments) throws IOException {
        String database = jdbc.queryForObject("SELECT current_database()", String.class);
        if (!"bugboard26_performance".equals(database)) {
            throw new IllegalStateException("Seeder only accepts the isolated bugboard26_performance database.");
        }
        String password = System.getenv("BUGBOARD_PERFORMANCE_PASSWORD");
        if (password == null || password.isBlank()) { throw new IllegalStateException("Private BUGBOARD_PERFORMANCE_PASSWORD is required."); }
        if (users.count() != 0 || queryCount("SELECT count(*) FROM issues") != 0) {
            throw new IllegalStateException("Performance seeding requires an empty domain database; existing work will not be deleted.");
        }
        long started = System.nanoTime();
        try {
            List<UserAccount> members = createAccounts(password);
            UserAccount admin = users.findByEmail(ADMIN_EMAIL).orElseThrow();
            authenticate(admin);
            IssueImage image = createImage();
            Map<UUID, UUID> writableIssues = new LinkedHashMap<>();
            List<UUID> issueIds = new ArrayList<>();
            SplittableRandom random = new SplittableRandom(2606);
            for (int index = 0; index < 10000; index++) {
                final int issueIndex = index;
                IssueDtos.IssueDetail issue = command(() -> issues.create(new IssueDtos.CreateIssue(
                    "Performance issue " + issueIndex, "Deterministic performance description for issue " + issueIndex,
                    IssueType.values()[issueIndex % IssueType.values().length], Priority.values()[random.nextInt(Priority.values().length)], List.of()),
                    issueIndex < 100 ? copyImage(image) : null, key("create", issueIndex, 0)));
                issueIds.add(issue.id());
                UUID issueId = issue.id();
                for (int commentIndex = 0; commentIndex < 5; commentIndex++) {
                    final int commentNumber = commentIndex;
                    command(() -> comments.create(issueId, new IssueDtos.CreateComment("Performance comment " + commentNumber), key("comment", issueIndex, commentNumber)));
                }
                issue = commandAssignment(issue, members.get(index % 79).getId());
                issue = commandAssignment(issue, members.get((index + 1) % 79).getId());
                if (index < RESOLUTION_ISSUES) {
                    issue = commandAssignment(issue, members.get((index + 2) % 79).getId());
                    for (int cycle = 0; cycle < 9; cycle++) {
                        issue = commandState(issue, IssueStatus.RESOLVED);
                        if (cycle < REOPENS_PER_ISSUE) { issue = commandState(issue, IssueStatus.TODO); }
                    }
                }
                if (index >= ARCHIVE_FROM) {
                    IssueDtos.IssueDetail current = issue;
                    issue = command(() -> workflow.archive(current.id(), new IssueDtos.Archive(true, current.version())));
                } else if (index >= RESOLUTION_ISSUES) { writableIssues.putIfAbsent(issue.assignee().id(), issue.id()); }
                if (index % 100 == 0) { LOG.info("Performance seed progress: {} of 10000 issues", index); }
            }
            verifyExactDataset();
            List<Map<String, Object>> workers = members.stream().limit(20).map(member -> Map.<String, Object>of(
                "id", member.getId(), "email", member.getEmail(), "writeIssueId", writableIssues.get(member.getId()))).toList();
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("seed", 2606); report.put("database", database); report.put("issueIds", issueIds); report.put("workers", workers);
            report.put("adminEmail", ADMIN_EMAIL); report.put("month", "2026-01"); report.put("imageBytes", IMAGE_BYTES);
            report.put("counts", counts()); report.put("asOf", clock.instant()); report.put("elapsedSeconds", (System.nanoTime() - started) / 1_000_000_000.0);
            report.put("construction", "Real UserService, IssueService, CommentService and IssueWorkflowService commands; no SQL domain/event inserts");
            String reportPath = System.getenv("BUGBOARD_PERFORMANCE_REPORT");
            Files.writeString(Path.of(reportPath == null ? "/tmp/bugboard26-performance-dataset.json" : reportPath), mapper.writeValueAsString(report));
            LOG.info("Performance seed complete: exact dataset validated");
        } finally { SecurityContextHolder.clearContext(); }
    }

    private List<UserAccount> createAccounts(String password) {
        BootstrapService bootstrap = new BootstrapService(users, passwords, jdbc, clock, "demo", ADMIN_EMAIL, TEMPORARY_PASSWORD, true);
        transactions.executeWithoutResult(status -> bootstrap.run(null));
        UserAccount admin = users.findByEmail(ADMIN_EMAIL).orElseThrow();
        authenticate(admin);
        command(() -> { accounts.changePassword(new UserDtos.ChangePassword(TEMPORARY_PASSWORD, password)); return true; });
        admin = users.findByEmail(ADMIN_EMAIL).orElseThrow();
        List<UserAccount> members = new ArrayList<>();
        for (int index = 1; index <= 99; index++) {
            authenticate(admin);
            UserRole role = index <= 79 ? UserRole.MEMBER : UserRole.VIEWER;
            String email = "perf-" + role.name().toLowerCase(java.util.Locale.ROOT) + "-" + String.format(java.util.Locale.ROOT, "%03d", index) + "@bugboard.local";
            UserDtos.UserAdmin created = command(() -> accounts.create(new UserDtos.CreateUser(email, "Performance user " + email, TEMPORARY_PASSWORD, role)));
            UserAccount account = users.findById(created.id()).orElseThrow();
            authenticate(account);
            command(() -> { accounts.changePassword(new UserDtos.ChangePassword(TEMPORARY_PASSWORD, password)); return true; });
            if (role == UserRole.MEMBER) { members.add(users.findById(created.id()).orElseThrow()); }
        }
        return members;
    }

    private IssueDtos.IssueDetail commandAssignment(IssueDtos.IssueDetail issue, UUID assignee) {
        return command(() -> workflow.assign(issue.id(), new IssueDtos.Assignment(assignee, issue.version())));
    }

    private IssueDtos.IssueDetail commandState(IssueDtos.IssueDetail issue, IssueStatus status) {
        return command(() -> workflow.state(issue.id(), new IssueDtos.State(status, issue.version())));
    }

    private <T> T command(Supplier<T> operation) { clock.advance(); return operation.get(); }

    private static void authenticate(UserAccount account) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
    }

    private static UUID key(String operation, int issue, int index) {
        return UUID.nameUUIDFromBytes(("2606/" + operation + "/" + issue + "/" + index).getBytes(StandardCharsets.UTF_8));
    }

    private static IssueImage copyImage(IssueImage image) {
        return new IssueImage(UUID.randomUUID(), image.originalName(), image.contentType(), image.content(), image.width(), image.height(), image.sha256());
    }

    private IssueImage createImage() throws IOException {
        BufferedImage image = new BufferedImage(256, 134, BufferedImage.TYPE_INT_RGB);
        SplittableRandom random = new SplittableRandom(2606);
        int[] noise = new int[256 * 134];
        for (int index = 0; index < noise.length; index++) { noise[index] = random.nextInt(0x1000000); }
        int lower = 0; int upper = noise.length;
        while (lower <= upper) {
            int filled = (lower + upper) / 2;
            byte[] candidate = encodeImage(image, noise, filled);
            if (candidate.length < IMAGE_BYTES) { lower = filled + 1; } else { upper = filled - 1; }
        }
        for (int distance = 0; distance < 100; distance++) {
            for (int offset : new int[] {distance, -distance}) {
                int filled = lower + offset;
                if (filled < 1 || filled >= noise.length) { continue; }
                for (int variation = 0; variation < 64; variation++) {
                    noise[filled - 1] = random.nextInt(0x1000000);
                    byte[] candidate = encodeImage(image, noise, filled);
                    if (candidate.length == IMAGE_BYTES) {
                        IssueImage validated = images.validate(new MemoryImage(candidate));
                        if (validated.content().length == IMAGE_BYTES) { return validated; }
                    }
                }
            }
        }
        throw new IllegalStateException("Could not generate an exact 100 KiB validated PNG; dataset will not be claimed valid.");
    }

    private static byte[] encodeImage(BufferedImage image, int[] noise, int filled) throws IOException {
        for (int index = 0; index < noise.length; index++) { image.setRGB(index % 256, index / 256, index < filled ? noise[index] : 0); }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, "png", output)) { throw new IllegalStateException("PNG encoder unavailable"); }
        return output.toByteArray();
    }

    private void verifyExactDataset() {
        Map<String, Long> expected = Map.of("user_accounts", 100L, "issues", 10000L, "comments", 50000L,
            "issue_events", 100000L, "notifications", 30000L, "resolution_cycles", 9000L, "issue_images", 100L);
        if (!counts().equals(expected)) { throw new IllegalStateException("Performance dataset counts mismatch: " + counts()); }
        if (queryCount("SELECT count(*) FROM issues WHERE NOT archived") != ARCHIVE_FROM
            || queryCount("SELECT count(*) FROM issue_images WHERE byte_size<>?", IMAGE_BYTES) != 0
            || queryCount("SELECT count(*) FROM user_accounts WHERE NOT active OR must_change_password") != 0) {
            throw new IllegalStateException("Performance dataset state/image/account invariant mismatch.");
        }
        Map<String, Long> eventCounts = new LinkedHashMap<>();
        jdbc.query("SELECT event_type,count(*) AS count FROM issue_events GROUP BY event_type", row -> {
            eventCounts.put(row.getString(1), row.getLong(2));
        });
        if (!eventCounts.equals(Map.of("ISSUE_CREATED", 10000L, "COMMENT_ADDED", 50000L, "ASSIGNMENT_CHANGED", 21000L,
            "STATE_CHANGED", 17000L, "ARCHIVED", 2000L))) { throw new IllegalStateException("Performance event composition mismatch."); }
        if (queryCount("SELECT count(*) FROM notifications WHERE type='ASSIGNED'") != 21000
            || queryCount("SELECT count(*) FROM notifications WHERE type='RESOLVED'") != 9000) {
            throw new IllegalStateException("Performance notification composition mismatch.");
        }
    }

    private Map<String, Long> counts() {
        Map<String, Long> result = new LinkedHashMap<>();
        for (String table : List.of("user_accounts", "issues", "comments", "issue_events", "notifications", "resolution_cycles", "issue_images")) {
            result.put(table, queryCount("SELECT count(*) FROM " + table));
        }
        return result;
    }

    private long queryCount(String sql, Object... arguments) {
        Long result = jdbc.queryForObject(sql, Long.class, arguments);
        if (result == null) { throw new IllegalStateException("Performance count query returned null."); }
        return result;
    }

    @Configuration
    @Profile("performance-seed")
    public static class SeedConfiguration {
        @Bean @Primary public SeedingClock performanceClock() { return new SeedingClock(); }
    }

    public static final class SeedingClock extends Clock {
        private final AtomicLong seconds = new AtomicLong(Instant.parse("2026-01-01T00:00:00Z").getEpochSecond());
        public void advance() { seconds.incrementAndGet(); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        @Override public Instant instant() { return Instant.ofEpochSecond(seconds.get()); }
    }

    private record MemoryImage(byte[] bytes) implements MultipartFile {
        private MemoryImage { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
        @Override public String getName() { return "image"; }
        @Override public String getOriginalFilename() { return "performance.png"; }
        @Override public String getContentType() { return "image/png"; }
        @Override public boolean isEmpty() { return false; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes.clone(); }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), bytes); }
    }

    /** Operator-only launch wrapper: samples actual JVM heap and records allocation/GC events. */
    public static final class MeasurementMain {
        private MeasurementMain() { }

        public static void main(String[] arguments) throws IOException, InterruptedException {
            Files.deleteIfExists(measurementFile("bugboard26-performance-finish"));
            Files.deleteIfExists(measurementFile("bugboard26-performance.jfr"));
            java.util.concurrent.CountDownLatch shutdownRequested = new java.util.concurrent.CountDownLatch(1);
            try (ConfigurableApplicationContext context = SpringApplication.run(BugBoard26Application.class, arguments);
                    java.io.BufferedWriter writer = Files.newBufferedWriter(measurementFile("bugboard26-performance-heap.csv"), StandardCharsets.UTF_8);
                    java.util.concurrent.ScheduledExecutorService sampler = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(task -> {
                        Thread thread = new Thread(task, "performance-heap-probe"); thread.setDaemon(true); return thread;
                    });
                    jdk.jfr.Recording recording = new jdk.jfr.Recording()) {
                if (!context.isActive()) { throw new IllegalStateException("Measurement context did not start."); }
                writer.write("utcEpochMilliseconds,usedBytes,committedBytes,maxBytes\n");
                java.lang.management.MemoryMXBean memory = java.lang.management.ManagementFactory.getMemoryMXBean();
                recording.enable("jdk.ObjectAllocationInNewTLAB").withStackTrace();
                recording.enable("jdk.ObjectAllocationOutsideTLAB").withStackTrace();
                recording.enable("jdk.GarbageCollection"); recording.enable("jdk.GCHeapSummary");
                recording.setToDisk(true);
                recording.start();
                sampler.scheduleAtFixedRate(() -> {
                    java.lang.management.MemoryUsage heap = memory.getHeapMemoryUsage();
                    try {
                        writer.write(System.currentTimeMillis() + "," + heap.getUsed() + "," + heap.getCommitted() + "," + heap.getMax() + "\n");
                        writer.flush();
                    } catch (IOException exception) { LOG.error("Performance heap sample could not be written"); }
                }, 0, 25, java.util.concurrent.TimeUnit.MILLISECONDS);
                sampler.scheduleWithFixedDelay(() -> {
                    if (Files.exists(measurementFile("bugboard26-performance-finish"))) { shutdownRequested.countDown(); }
                }, 1, 1, java.util.concurrent.TimeUnit.SECONDS);
                shutdownRequested.await();
                sampler.shutdown();
                if (!sampler.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) { sampler.shutdownNow(); }
                recording.stop();
                // Sequential writes also work when the container filesystem rejects positional writes.
                try (java.io.InputStream input = recording.getStream(null, null);
                        java.io.OutputStream output = Files.newOutputStream(measurementFile("bugboard26-performance.jfr"))) {
                    if (input == null) { throw new IOException("Flight recording contains no data."); }
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); }
                }
            }
        }

        private static Path measurementFile(String name) {
            return Path.of(System.getProperty("java.io.tmpdir")).resolve(name);
        }
    }
}
