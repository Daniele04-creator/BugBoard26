package it.unina.bugboard26.reporting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.reporting.api.ReportingDtos;
import it.unina.bugboard26.reporting.application.AssignmentSuggestionService;
import it.unina.bugboard26.reporting.application.ReportService;
import it.unina.bugboard26.shared.domain.DomainException;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@ActiveProfiles("test")
@Import(ReportingIntegrationTest.TimeConfiguration.class)
@Testcontainers
class ReportingIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    private static final Instant NOW = Instant.parse("2026-02-10T12:00:00Z");
    private static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID C = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID V = UUID.fromString("00000000-0000-0000-0000-000000000004");
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_reports_test").withUsername("bugboard_owner").withPassword(PASSWORD)
            .withInitScript("users-init.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "bugboard_runtime");
        registry.add("spring.datasource.password", () -> PASSWORD);
        registry.add("spring.flyway.url", DATABASE::getJdbcUrl);
        registry.add("spring.flyway.user", () -> "bugboard_owner");
        registry.add("spring.flyway.password", () -> PASSWORD);
    }
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JsonMapper mapper;
    @Autowired private ReportService reports;
    @Autowired private AssignmentSuggestionService suggestions;
    @Autowired private MutableClock clock;

    @BeforeEach
    void reset() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", PASSWORD);
             var statement = connection.createStatement()) {
            // Reset only this disposable Testcontainers database; runtime protections stay enabled.
            statement.execute("set session_replication_role=replica");
            try { statement.execute("truncate user_accounts,labels,spring_session,login_attempts cascade"); }
            finally { statement.execute("set session_replication_role=origin"); }
        }
        clock.now = NOW;
        account(A, "a@example.test", "A Admin", "ADMIN"); account(B, "b@example.test", "B Member", "MEMBER");
        account(C, "c@example.test", "C Member", "MEMBER"); account(V, "v@example.test", "V Viewer", "VIEWER");
        authenticate(A);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void numericReferenceMatchesAllDashboardAndMonthlyFields() {
        reference(); ReportingDtos.Dashboard dashboard = reports.dashboard();
        assertEquals(List.of(5L, 2L, 1L, 2L, 1L, 1L, 1L, 3L), List.of(dashboard.activeIssueCount(), dashboard.openCount(),
                dashboard.inProgressCount(), dashboard.resolvedCount(), dashboard.duplicateCount(),
                dashboard.unassignedOpenCount(), dashboard.overdueOpenCount(), dashboard.resolutionCount()));
        assertEquals(115200.0, dashboard.averageResolutionSeconds());
        assertEquals(Map.of("QUESTION", 0L, "BUG", 1L, "DOCUMENTATION", 0L, "FEATURE", 1L), dashboard.openByType());
        assertEquals(Map.of("LOW", 0L, "MEDIUM", 1L, "HIGH", 1L, "CRITICAL", 0L), dashboard.openByPriority());
        assertEquals(List.of(0L, 1L, 0L, 1L), dashboard.openByAssignee().stream().map(ReportingDtos.AssigneeLoad::openCount).toList());
        assertNull(dashboard.openByAssignee().getLast().user());
        assertEquals(List.of(86400.0, 129600.0), dashboard.resolutionByAssignee().stream()
                .map(ReportingDtos.AssigneeResolution::averageResolutionSeconds).toList());
        ReportingDtos.MonthlyReport month = reports.monthly("2026-02");
        assertEquals(new ReportingDtos.Totals(6, 3, 2, 5, 1, 1, 0, 115200.0, 2), month.totals());
        assertEquals(Instant.parse("2026-01-31T23:00:00Z"), month.periodStart());
        assertEquals(Instant.parse("2026-02-28T23:00:00Z"), month.periodEnd());
        assertEquals(NOW, month.asOf()); assertTrue(month.partial()); assertEquals(1, month.unassignedOpenAtPeriodEnd());
        assertEquals(List.of(5L, 2L, 1L, 0L), month.perUser().stream().map(ReportingDtos.UserMonthly::handledIssueCount).toList());
        assertEquals(List.of(6L, 0L, 0L, 0L), month.perUser().stream().map(ReportingDtos.UserMonthly::createdCount).toList());
        assertEquals(List.of(0L, 1L, 0L, 0L), month.perUser().stream().map(ReportingDtos.UserMonthly::openAssignedAtPeriodEnd).toList());
        assertEquals(8, month.perUser().stream().mapToLong(ReportingDtos.UserMonthly::handledIssueCount).sum());
    }

    @Test
    void currentArchivingChangesDashboardSampleButKeepsHistoricalCycles() {
        reference();
        jdbc.update("update issues set archived=true,archived_at=?,archived_by=? where id=?", ts(NOW.minusSeconds(1)), A, issue(2));
        event(2, A, NOW.minusSeconds(1), "ARCHIVED", Map.of("archived", change(false, true)), null);
        assertEquals(86400.0, reports.dashboard().averageResolutionSeconds());
        assertEquals(115200.0, reports.monthly("2026-02").totals().averageResolutionSeconds());
    }

    @Test
    void historicalCreditKeepsFormerMembersAndCurrentOpenLoadsKeepPasswordResetUsers() {
        reference();
        jdbc.update("update user_accounts set role='VIEWER',active=false where id=?", C);
        jdbc.update("update user_accounts set must_change_password=true where id=?", B);
        ReportingDtos.Dashboard dashboard = reports.dashboard();
        assertEquals(1, dashboard.openByAssignee().stream().filter(item -> item.user() != null && item.user().id().equals(B))
                .findFirst().orElseThrow().openCount());
        assertEquals(129600.0, dashboard.resolutionByAssignee().stream().filter(item -> item.user().id().equals(C))
                .findFirst().orElseThrow().averageResolutionSeconds());
        ReportingDtos.UserMonthly historical = reports.monthly("2026-02").perUser().stream()
                .filter(item -> item.user().id().equals(C)).findFirst().orElseThrow();
        assertEquals(2, historical.resolvedCycleCount()); assertEquals(1, historical.handledIssueCount());
        assertFalse(historical.user().active());
        assertEquals(it.unina.bugboard26.users.domain.UserRole.VIEWER, historical.user().role());
    }

    @Test
    void eventExactlyAtAsOfIsExcludedFromHistoricalPopulation() {
        reference(); create(7, NOW.toString(), "FEATURE", "MEDIUM");
        ReportingDtos.MonthlyReport month = reports.monthly("2026-02");
        assertEquals(6, month.totals().createdCount()); assertEquals(2, month.totals().openAtPeriodEnd());
    }

    @Test
    void repeatableReadDashboardStaysInternallyConsistentDuringConcurrentArchiveWrites() throws Exception {
        reference(); java.util.concurrent.ExecutorService writer = java.util.concurrent.Executors.newSingleThreadExecutor();
        java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicBoolean writing = new java.util.concurrent.atomic.AtomicBoolean(true);
        try {
            java.util.concurrent.Future<?> writes = writer.submit(() -> {
                try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", PASSWORD);
                     var statement = connection.prepareStatement("update issues set archived=?,archived_at=?,archived_by=? where id=?")) {
                    for (int index = 0; index < 100; index++) {
                        boolean archived = index % 2 == 0; statement.setBoolean(1, archived);
                        statement.setTimestamp(2, archived ? ts(NOW.minusSeconds(1)) : null);
                        statement.setObject(3, archived ? A : null); statement.setObject(4, issue(2)); statement.executeUpdate();
                        started.countDown();
                        java.util.concurrent.locks.LockSupport.parkNanos(Duration.ofMillis(2).toNanos());
                    }
                } catch (java.sql.SQLException failure) { throw new IllegalStateException(failure); }
                finally { writing.set(false); }
            });
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS)); int overlappingReads = 0;
            for (int index = 0; index < 25; index++) {
                if (writing.get()) { overlappingReads++; }
                ReportingDtos.Dashboard snapshot = reports.dashboard();
                if (snapshot.resolvedCount() == 2) { assertEquals(3, snapshot.resolutionCount()); assertEquals(115200.0, snapshot.averageResolutionSeconds()); }
                else { assertEquals(1, snapshot.resolvedCount()); assertEquals(1, snapshot.resolutionCount()); assertEquals(86400.0, snapshot.averageResolutionSeconds()); }
            }
            assertTrue(overlappingReads > 0, "At least one dashboard snapshot must overlap active database writes");
            writes.get(15, java.util.concurrent.TimeUnit.SECONDS);
        } finally { writer.shutdownNow(); }
    }

    @Test
    void historicalEndUsesEventsBeforeBoundaryAndStableSequenceIncludingExplicitUnassignment() {
        create(1, "2026-01-05T09:00:00Z", "BUG", "MEDIUM");
        create(2, "2026-02-01T09:00:00Z", "FEATURE", "MEDIUM");
        assign(1, B, Instant.parse("2026-01-10T09:00:00Z"));
        event(1, A, Instant.parse("2026-01-10T09:00:00Z"), "ASSIGNMENT_CHANGED",
                Map.of("assigneeId", change(B.toString(), null)), null);
        event(1, A, Instant.parse("2026-01-31T23:00:00Z"), "ARCHIVED", Map.of("archived", change(false, true)), null);
        jdbc.update("update issues set status='DUPLICATE',duplicate_of_id=?,assignee_id=? where id=?", issue(2), C, issue(1));
        // The current row deliberately diverges after the historical boundary.
        ReportingDtos.MonthlyReport january = reports.monthly("2026-01");
        assertEquals(1, january.totals().createdCount()); assertEquals(1, january.totals().openAtPeriodEnd());
        assertEquals(1, january.unassignedOpenAtPeriodEnd());
        assertTrue(january.perUser().stream().allMatch(item -> item.openAssignedAtPeriodEnd() == 0));
    }

    @Test
    void timezoneUsesRealDstMonthAndRejectsInvalidOrFutureMonths() {
        clock.now = Instant.parse("2026-04-02T00:00:00Z");
        ReportingDtos.MonthlyReport march = reports.monthly("2026-03");
        assertEquals(743, Duration.between(march.periodStart(), march.periodEnd()).toHours()); assertFalse(march.partial());
        for (String value : List.of("1999-12", "2026-05", "2026-13", "2026-3", "x", "")) {
            assertEquals(400, assertThrows(DomainException.class, () -> reports.monthly(value)).status());
        }
        assertEquals(400, assertThrows(DomainException.class, () -> reports.monthly(null)).status());
    }

    @Test
    void closedMonthIncludesItsRomeStartAndExcludesNextMonthsStart() {
        create(1, "2026-01-31T23:00:00Z", "BUG", "MEDIUM");
        create(2, "2026-02-28T23:00:00Z", "BUG", "MEDIUM");
        clock.now = Instant.parse("2026-03-02T00:00:00Z");
        ReportingDtos.MonthlyReport february = reports.monthly("2026-02");
        assertEquals(1, february.totals().createdCount()); assertEquals(1, february.totals().openAtPeriodEnd());
        assertFalse(february.partial()); assertEquals(february.periodEnd(), february.asOf());
    }

    @Test
    void serializedAggregationsUseExactTypedContractAndNeverExposeEmails() {
        reference(); String dashboard = mapper.writeValueAsString(reports.dashboard());
        var dashboardJson = mapper.readTree(dashboard);
        assertEquals(15, dashboardJson.size()); assertTrue(dashboardJson.get("openByType").isObject());
        assertEquals(4, dashboardJson.get("openByPriority").size()); assertEquals("Europe/Rome", dashboardJson.get("timezone").asString());
        String monthly = mapper.writeValueAsString(reports.monthly("2026-02")); var monthlyJson = mapper.readTree(monthly);
        assertEquals(9, monthlyJson.size()); assertEquals(9, monthlyJson.get("totals").size());
        assertEquals(7, monthlyJson.get("perUser").get(0).size());
        assertFalse(dashboard.contains("@example.test")); assertFalse(monthly.contains("@example.test"));
    }

    @Test
    void emptyDatasetKeepsEveryEnumZeroAndNullMeans() {
        ReportingDtos.Dashboard dashboard = reports.dashboard(); assertEquals(0, dashboard.openCount());
        assertNull(dashboard.averageResolutionSeconds()); assertEquals(4, dashboard.openByType().size());
        assertTrue(dashboard.openByPriority().values().stream().allMatch(count -> count == 0));
        assertEquals(4, dashboard.openByAssignee().size());
        assertEquals(new ReportingDtos.Totals(0, 0, 0, 0, 0, 0, 0, null, 0), reports.monthly("2026-02").totals());
        // A month before any account existed must still retain its global aggregate row.
        ReportingDtos.MonthlyReport beforeAccounts = reports.monthly("2000-01");
        assertEquals(new ReportingDtos.Totals(0, 0, 0, 0, 0, 0, 0, null, 0), beforeAccounts.totals());
        assertTrue(beforeAccounts.perUser().isEmpty()); assertEquals(0, beforeAccounts.unassignedOpenAtPeriodEnd());
    }

    @Test
    void userOrderingUsesLowercaseThenIdIndependentlyOfDatabaseLocale() {
        jdbc.update("update user_accounts set display_name='Å Admin' where id=?", A);
        jdbc.update("update user_accounts set display_name='Zulu Member' where id=?", B);
        jdbc.update("update user_accounts set display_name='B Member' where id=?", C);
        jdbc.update("update user_accounts set display_name='Á Viewer' where id=?", V);
        assertEquals(List.of(C, B, V, A), reports.monthly("2026-02").perUser().stream().map(item -> item.user().id()).toList());
        assertEquals(List.of(C, B, A), reports.dashboard().openByAssignee().stream()
                .filter(item -> item.user() != null).map(item -> item.user().id()).toList());
        jdbc.update("update user_accounts set display_name='b member' where id=?", A);
        assertEquals(List.of(A, C, B), reports.dashboard().openByAssignee().stream()
                .filter(item -> item.user() != null).map(item -> item.user().id()).toList());
    }

    @Test
    void suggestionsExcludeSourceAndIneligibleUsersWithoutAssigning() {
        reference(); ReportingDtos.Suggestions ranked = suggestions.suggestions(issue(5));
        assertEquals(List.of(A, C, B), ranked.candidates().stream().map(item -> item.user().id()).toList());
        assertEquals(List.of(0L, 0L, 1L), ranked.candidates().stream().map(ReportingDtos.SuggestedCandidate::openIssueCount).toList());
        assertEquals(0L, suggestions.suggestions(issue(3)).candidates().stream()
                .filter(item -> item.user().id().equals(B)).findFirst().orElseThrow().openIssueCount());
        jdbc.update("update user_accounts set must_change_password=true where id=?", C);
        assertFalse(suggestions.suggestions(issue(5)).candidates().stream().anyMatch(item -> item.user().id().equals(C)));
        assertNull(jdbc.queryForObject("select assignee_id from issues where id=?", UUID.class, issue(5)));
        assertEquals(409, assertThrows(DomainException.class, () -> suggestions.suggestions(issue(1))).status());
    }

    @Test
    void reportsAndSuggestionsRejectNonAdministratorBeforeIssueLookup() {
        authenticate(V);
        assertEquals(403, assertThrows(DomainException.class, () -> reports.dashboard()).status());
        assertEquals(403, assertThrows(DomainException.class, () -> reports.monthly("2026-02")).status());
        assertEquals(403, assertThrows(DomainException.class, () -> suggestions.suggestions(UUID.randomUUID())).status());
    }

    private void reference() {
        create(1, "2026-02-01T09:00:00Z", "BUG", "MEDIUM"); create(2, "2026-02-01T10:00:00Z", "BUG", "MEDIUM");
        create(3, "2026-02-02T09:00:00Z", "BUG", "HIGH"); create(4, "2026-02-02T10:00:00Z", "QUESTION", "MEDIUM");
        create(5, "2026-02-03T09:00:00Z", "FEATURE", "MEDIUM"); create(6, "2026-02-03T10:00:00Z", "DOCUMENTATION", "MEDIUM");
        assign(1, B, Instant.parse("2026-02-01T10:00:00Z"));
        resolve(1, B, "2026-02-01T09:00:00Z", "2026-02-02T09:00:00Z");
        assign(2, C, Instant.parse("2026-02-01T11:00:00Z"));
        resolve(2, C, "2026-02-01T10:00:00Z", "2026-02-03T10:00:00Z");
        event(2, A, Instant.parse("2026-02-04T10:00:00Z"), "STATE_CHANGED", Map.of("status", change("RESOLVED", "TODO")), null);
        resolve(2, C, "2026-02-04T10:00:00Z", "2026-02-05T10:00:00Z");
        assign(3, B, Instant.parse("2026-02-02T09:10:00Z"));
        event(3, B, Instant.parse("2026-02-02T09:20:00Z"), "STATE_CHANGED", Map.of("status", change("TODO", "IN_PROGRESS")), null);
        jdbc.update("update issues set status='IN_PROGRESS',due_date=date '2026-02-09' where id=?", issue(3));
        event(3, A, Instant.parse("2026-02-02T09:25:00Z"), "DEADLINE_CHANGED", Map.of(), null);
        event(4, A, Instant.parse("2026-02-02T10:05:00Z"), "DUPLICATE_MARKED", Map.of("status", change("TODO", "DUPLICATE")), null);
        jdbc.update("update issues set status='DUPLICATE',duplicate_of_id=? where id=?", issue(1), issue(4));
        assign(6, C, Instant.parse("2026-02-03T10:10:00Z"));
        event(6, A, Instant.parse("2026-02-03T10:20:00Z"), "ARCHIVED", Map.of("archived", change(false, true)), null);
        jdbc.update("update issues set archived=true,archived_at=?,archived_by=? where id=?", ts(Instant.parse("2026-02-03T10:20:00Z")), A, issue(6));
    }
    private void account(UUID id, String email, String name, String role) {
        jdbc.update("""
                insert into user_accounts(id,email,display_name,password_hash,role,active,must_change_password,created_at,updated_at)
                values(?,?,?,'synthetic-test-hash',?,true,false,?,?)
                """, id, email, name, role, ts(Instant.parse("2026-01-01T00:00:00Z")), ts(NOW));
    }
    private void create(int number, String created, String type, String priority) {
        Instant time = Instant.parse(created);
        jdbc.update("""
                insert into issues(id,number,title,description,title_search,description_search,type,priority,status,reporter_id,
                  archived,cycle_started_at,created_at,updated_at,last_activity_at,version)
                values(?,?,?,'Reference description',?,'reference description',?,?,'TODO',?,false,?,?,?,?,0)
                """, issue(number), number, "Reference " + number, "reference " + number, type, priority, A,
                ts(time), ts(time), ts(time), ts(time));
        Map<String, Object> snapshot = new HashMap<>(); snapshot.put("status", "TODO"); snapshot.put("archived", false);
        snapshot.put("assigneeId", null); event(number, A, time, "ISSUE_CREATED", Map.of(), snapshot);
    }
    private void assign(int number, UUID user, Instant time) {
        jdbc.update("update issues set assignee_id=? where id=?", user, issue(number));
        event(number, A, time, "ASSIGNMENT_CHANGED", Map.of("assigneeId", change(null, user.toString())), null);
    }
    private void resolve(int number, UUID user, String start, String resolved) {
        Instant startedAt = Instant.parse(start); Instant resolvedAt = Instant.parse(resolved);
        UUID eventId = event(number, user, resolvedAt, "STATE_CHANGED", Map.of("status", change("TODO", "RESOLVED")), null);
        jdbc.update("update issues set status='RESOLVED',resolved_at=?,cycle_started_at=? where id=?", ts(resolvedAt), ts(startedAt), issue(number));
        jdbc.update("""
                insert into resolution_cycles(id,issue_id,resolved_event_id,started_at,resolved_at,resolved_by_id,credited_assignee_id,duration_seconds)
                values(?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(), issue(number), eventId, ts(startedAt), ts(resolvedAt), user, user,
                Duration.between(startedAt, resolvedAt).toSeconds());
    }
    private UUID event(int number, UUID actor, Instant time, String type, Map<String, Object> changes, Map<String, Object> snapshot) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into issue_events(id,issue_id,actor_id,occurred_at,event_type,issue_version,changes,snapshot,created_at)
                values(?,?,?,?,?,0,?::jsonb,?::jsonb,?)
                """, id, issue(number), actor, ts(time), type, mapper.writeValueAsString(changes),
                snapshot == null ? null : mapper.writeValueAsString(snapshot), ts(time));
        return id;
    }
    private Map<String, Object> change(Object before, Object after) {
        Map<String, Object> values = new HashMap<>(); values.put("before", before); values.put("after", after); return values;
    }
    private static UUID issue(int number) { return new UUID(0, 100 + number); }
    private static Timestamp ts(Instant instant) { return Timestamp.from(instant); }
    private static void authenticate(UUID id) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(id, 0), null, List.of()));
    }
    @TestConfiguration
    static class TimeConfiguration {
        @Bean @Primary MutableClock reportTestClock() { return new MutableClock(); }
    }
    static final class MutableClock extends Clock {
        private Instant now = NOW;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
