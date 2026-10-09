package it.unina.bugboard26.shared.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles({"test", "demo-data"})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class DemoDataServiceTest {
    private static final String DATABASE_PASSWORD = "UserLifecycleIntegrationOnly";
    private static final List<String> TABLES = List.of("user_accounts", "issues", "comments", "labels", "issue_events",
            "account_events", "label_events", "notifications", "resolution_cycles", "idempotency_records", "spring_session");
    private static final List<String> IMMUTABLE_TABLES = List.of("comments", "issue_events", "account_events",
            "label_events", "resolution_cycles");

    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard26").withUsername("bugboard_owner").withPassword(DATABASE_PASSWORD)
            .withInitScript("users-init.sql");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", DATABASE::getUsername);
        properties.add("spring.flyway.password", DATABASE::getPassword);
        properties.add("spring.session.jdbc.cleanup-cron", () -> "-");
        properties.add("app.profile", () -> "demo");
    }

    @Autowired private DemoDataService service;
    @Autowired private PasswordService passwords;
    @Autowired private IssueService issues;
    @Autowired private CommentService comments;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    private UUID adminId;
    private Map<String, Object> originalAdmin;

    @BeforeEach
    void reset() {
        SecurityContextHolder.clearContext();
        removeFailureTrigger();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            IMMUTABLE_TABLES.forEach(table -> jdbc.execute("ALTER TABLE " + table + " DISABLE TRIGGER " + table + "_immutable"));
            jdbc.execute("TRUNCATE user_accounts, labels, spring_session, login_attempts RESTART IDENTITY CASCADE");
            IMMUTABLE_TABLES.forEach(table -> jdbc.execute("ALTER TABLE " + table + " ENABLE TRIGGER " + table + "_immutable"));
        });
        adminId = account("administrator@example.test", "Amministratore", "ADMIN");
        session(adminId);
        originalAdmin = jdbc.queryForMap("SELECT * FROM user_accounts WHERE id=?", adminId);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        removeFailureTrigger();
    }

    @Test
    void replacesOldDataPreservesAdministratorAndDoesNotDuplicateOnRerun() {
        ExistingData previous = existingData();

        assertTrue(service.load(true).contains("committed"));
        assertImmutableTriggersEnabled();

        assertEquals(7, count("user_accounts"));
        assertEquals(24, count("issues"));
        assertEquals(48, count("comments"));
        assertEquals(6, count("labels"));
        assertEquals(6, count("resolution_cycles"));
        assertEquals(10, issueCount("status='TODO'"));
        assertEquals(8, issueCount("status='IN_PROGRESS'"));
        assertEquals(6, issueCount("status='RESOLVED'"));
        assertEquals(2, issueCount("archived"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE NOT active OR must_change_password", Integer.class));
        assertEquals(1, count("spring_session"));
        assertFalse(exists("user_accounts", previous.userId()));
        assertFalse(exists("issues", previous.issueId()));
        assertFalse(exists("comments", previous.commentId()));
        assertFalse(exists("issue_events", previous.eventId()));
        assertAdministratorUnchanged();
        assertEquals(0, jdbc.queryForObject("""
                SELECT count(*) FROM (
                    SELECT title AS content FROM issues UNION ALL SELECT description FROM issues
                    UNION ALL SELECT body FROM comments UNION ALL SELECT display_name FROM user_accounts
                ) text_rows WHERE content ~* '(e2e|performance issue|test issue)'
                """, Integer.class));
        Map<String, Integer> loadedCounts = counts();

        assertTrue(service.load(false).contains("already loaded"));

        assertEquals(loadedCounts, counts());
        assertAdministratorUnchanged();
        assertImmutableTriggersEnabled();
    }

    @Test
    void rejectsExistingDataWithoutExplicitReplacementAndPreservesEveryRow() {
        ExistingData previous = existingData();
        Map<String, Integer> before = counts();

        assertThrows(IllegalStateException.class, () -> service.load(false));

        assertEquals(before, counts());
        assertPreviousDataPreserved(previous);
        assertAdministratorUnchanged();
    }

    @Test
    void lateLabelFailureRollsBackDeletionAndNewAccounts() {
        ExistingData previous = existingData();
        Map<String, Integer> before = counts();
        jdbc.execute("""
                CREATE FUNCTION reject_demo_label() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.name = 'Prestazioni' THEN RAISE EXCEPTION 'Demo label insertion failure'; END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER reject_demo_label BEFORE INSERT ON labels
                FOR EACH ROW EXECUTE FUNCTION reject_demo_label()
                """);
        try {
            assertThrows(DataAccessException.class, () -> service.load(true));
        } finally {
            removeFailureTrigger();
        }

        assertEquals(before, counts());
        assertPreviousDataPreserved(previous);
        assertAdministratorUnchanged();
        assertImmutableTriggersEnabled();
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE email LIKE '%@bugboard.demo.example.test'", Integer.class));
    }

    private ExistingData existingData() {
        UUID userId = account("elena.marino@example.test", "Elena Marino", "MEMBER");
        session(userId);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(userId, 0), null, List.of()));
        IssueDtos.IssueDetail issue = issues.create(new IssueDtos.CreateIssue("Recuperare le bozze salvate",
                "Conservare il contenuto della segnalazione quando si chiude il browser.", IssueType.FEATURE,
                Priority.MEDIUM, List.of()), null, UUID.randomUUID());
        UUID commentId = comments.create(issue.id(), new IssueDtos.CreateComment("La bozza deve essere visibile al prossimo accesso."), UUID.randomUUID()).id();
        UUID eventId = jdbc.queryForObject("SELECT id FROM issue_events WHERE issue_id=? AND event_type='ISSUE_CREATED'", UUID.class, issue.id());
        SecurityContextHolder.clearContext();
        return new ExistingData(userId, issue.id(), commentId, eventId,
                jdbc.queryForMap("SELECT * FROM user_accounts WHERE id=?", userId),
                jdbc.queryForMap("SELECT * FROM issues WHERE id=?", issue.id()),
                jdbc.queryForMap("SELECT * FROM comments WHERE id=?", commentId),
                jdbc.queryForMap("SELECT * FROM issue_events WHERE id=?", eventId));
    }

    private UUID account(String email, String name, String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO user_accounts(id,email,display_name,password_hash,role,active,must_change_password,
                    version,auth_version,created_at,updated_at)
                VALUES(?,?,?,?,?,true,false,0,0,current_timestamp,current_timestamp)
                """, id, email, name, passwords.encode("Private fixture password 2026"), role);
        return id;
    }

    private void session(UUID accountId) {
        long now = System.currentTimeMillis();
        jdbc.update("""
                INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time,principal_name)
                VALUES(?,?,?,?,?,?,?)
                """, UUID.randomUUID().toString(), UUID.randomUUID().toString(), now, now, 1800, now + 1800000, accountId.toString());
    }

    private void assertAdministratorUnchanged() {
        assertEquals(originalAdmin, jdbc.queryForMap("SELECT * FROM user_accounts WHERE id=?", adminId));
    }

    private void assertPreviousDataPreserved(ExistingData previous) {
        assertEquals(previous.user(), jdbc.queryForMap("SELECT * FROM user_accounts WHERE id=?", previous.userId()));
        assertEquals(previous.issue(), jdbc.queryForMap("SELECT * FROM issues WHERE id=?", previous.issueId()));
        assertEquals(previous.comment(), jdbc.queryForMap("SELECT * FROM comments WHERE id=?", previous.commentId()));
        assertEquals(previous.event(), jdbc.queryForMap("SELECT * FROM issue_events WHERE id=?", previous.eventId()));
    }

    private Map<String, Integer> counts() {
        Map<String, Integer> result = new LinkedHashMap<>();
        TABLES.forEach(table -> result.put(table, count(table)));
        return result;
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }

    private int issueCount(String condition) {
        return jdbc.queryForObject("SELECT count(*) FROM issues WHERE " + condition, Integer.class);
    }

    private boolean exists(String table, UUID id) {
        return jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM " + table + " WHERE id=?)", Boolean.class, id);
    }

    private void removeFailureTrigger() {
        jdbc.execute("DROP FUNCTION IF EXISTS reject_demo_label() CASCADE");
    }

    private void assertImmutableTriggersEnabled() {
        assertEquals(5, jdbc.queryForObject("""
                SELECT count(*) FROM pg_trigger WHERE tgenabled='O' AND tgname IN (
                    'comments_immutable', 'issue_events_immutable', 'account_events_immutable',
                    'label_events_immutable', 'resolution_cycles_immutable')
                """, Integer.class));
    }

    private record ExistingData(UUID userId, UUID issueId, UUID commentId, UUID eventId,
            Map<String, Object> user, Map<String, Object> issue, Map<String, Object> comment, Map<String, Object> event) { }
}
