package it.unina.bugboard26.issues;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(IssueTestClock.class)
class IssueAtomicityIntegrationTest {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_issues_atomic").withUsername("bugboard_owner").withPassword("UserLifecycleIntegrationOnly")
            .withInitScript("users-init.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> "UserLifecycleIntegrationOnly");
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", DATABASE::getUsername);
        properties.add("spring.flyway.password", DATABASE::getPassword);
    }
    @Autowired IssueService service;
    @Autowired IssueWorkflowService workflow;
    @Autowired IssueQueryService queries;
    @Autowired CommentService comments;
    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @Autowired JdbcTemplate jdbc;
    private UserAccount admin;
    private UserAccount member;

    @BeforeEach
    void setup() throws Exception {
        owner("SET session_replication_role=replica; TRUNCATE user_accounts,labels,spring_session,login_attempts CASCADE; SET session_replication_role=origin");
        admin = account("Admin", UserRole.ADMIN); member = account("Member", UserRole.MEMBER);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(admin.getId(), admin.getAuthVersion()), null, List.of()));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void auditInsertFailureRollsBackCreateAndIdempotencyRecord() throws Exception {
        fault("issue_events");
        try { assertThrows(DataAccessException.class, this::create); }
        finally { removeFault("issue_events"); }
        assertEquals(0, count("issues")); assertEquals(0, count("issue_events")); assertEquals(0, count("idempotency_records"));
    }

    @Test
    void notificationInsertFailureRollsBackAssignmentAndInsertedEvent() throws Exception {
        var before = create(); fault("notifications");
        try { assertThrows(DataAccessException.class, () -> workflow.assign(before.id(), new IssueDtos.Assignment(member.getId(), 0L))); }
        finally { removeFault("notifications"); }
        assertEquals(before, queries.detail(before.id())); assertEquals(1, count("issue_events")); assertEquals(0, count("notifications"));
    }

    @Test
    void cycleInsertFailureRollsBackResolvedStateAuditAndNotification() throws Exception {
        var created = create(); var before = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        fault("resolution_cycles");
        try { assertThrows(DataAccessException.class, () -> workflow.state(before.id(), new IssueDtos.State(IssueStatus.RESOLVED, 1L))); }
        finally { removeFault("resolution_cycles"); }
        assertEquals(before, queries.detail(before.id())); assertEquals(0, count("resolution_cycles")); assertEquals(2, count("issue_events")); assertEquals(1, count("notifications"));
    }

    @Test
    void notificationFailureAfterCycleRollsBackCycleAndResolutionTogether() throws Exception {
        var created = create(); var before = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        fault("notifications");
        try { assertThrows(DataAccessException.class, () -> workflow.state(before.id(), new IssueDtos.State(IssueStatus.RESOLVED, 1L))); }
        finally { removeFault("notifications"); }
        assertEquals(before, queries.detail(before.id())); assertEquals(0, count("resolution_cycles")); assertEquals(2, count("issue_events")); assertEquals(1, count("notifications"));
    }

    @Test
    void auditFailureRollsBackCommentAndImageIncludingActivityVersion() throws Exception {
        var before = create(); fault("issue_events");
        try {
            assertThrows(DataAccessException.class, () -> comments.create(before.id(), new IssueDtos.CreateComment("Atomic comment"), UUID.randomUUID()));
            assertEquals(before, queries.detail(before.id()));
            IssueImage image = new IssueImage(UUID.randomUUID(), "capture.png", "image/png", new byte[]{1, 2, 3}, 1, 1, "a".repeat(64));
            assertThrows(DataAccessException.class, () -> service.image(before.id(), image, 0L));
        } finally { removeFault("issue_events"); }
        assertEquals(before, queries.detail(before.id())); assertEquals(0, count("comments")); assertEquals(0, count("issue_images"));
        assertEquals(1, count("issue_events")); assertEquals(1, count("idempotency_records"));
    }

    @Test
    void auditFailureRollsBackDeadlineArchiveAndDuplicateLinks() throws Exception {
        var before = create(); var target = create(); fault("issue_events");
        try {
            assertThrows(DataAccessException.class, () -> workflow.deadline(before.id(), new IssueDtos.Deadline(java.time.LocalDate.of(2026, 2, 11), 0L)));
            assertThrows(DataAccessException.class, () -> workflow.archive(before.id(), new IssueDtos.Archive(true, 0L)));
            assertThrows(DataAccessException.class, () -> workflow.duplicate(before.id(), new IssueDtos.Duplicate(target.id(), 0L)));
        } finally { removeFault("issue_events"); }
        assertEquals(before, queries.detail(before.id())); assertEquals(2, count("issue_events")); assertEquals(0, count("resolution_cycles"));
    }

    private IssueDtos.IssueDetail create() {
        return service.create(new IssueDtos.CreateIssue("Atomic issue", "Detailed rollback instructions", IssueType.BUG, Priority.MEDIUM, List.of()), null, UUID.randomUUID());
    }
    private UserAccount account(String name, UserRole role) {
        UserAccount user = new UserAccount(UUID.randomUUID(), UUID.randomUUID() + "@example.test", name,
                passwords.encode("Synthetic password 2026"), role, Instant.parse("2026-01-01T00:00:00Z"));
        user.replacePassword(user.getPasswordHash(), false, Instant.parse("2026-01-01T00:01:00Z")); return users.saveAndFlush(user);
    }
    private void fault(String table) throws Exception {
        owner("CREATE OR REPLACE FUNCTION fail_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic insertion failure' USING ERRCODE='23514'; END $$");
        owner("CREATE TRIGGER synthetic_failure BEFORE INSERT ON " + table + " FOR EACH ROW EXECUTE FUNCTION fail_test_insert()");
    }
    private void removeFault(String table) throws Exception { owner("DROP TRIGGER synthetic_failure ON " + table); }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    private void owner(String sql) throws Exception {
        try (var connection = java.sql.DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
