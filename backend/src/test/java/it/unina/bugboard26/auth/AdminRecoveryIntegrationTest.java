package it.unina.bugboard26.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.application.AdminRecoveryCommand;
import it.unina.bugboard26.auth.application.AdminRecoveryService;
import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class AdminRecoveryIntegrationTest {
    private static final String DATABASE_PASSWORD = "UserLifecycleIntegrationOnly";
    private static final String ORIGINAL_PASSWORD = "Recovery original 2026";
    private static final String TEMPORARY_PASSWORD = "Recovery replacement 2026";
    private static final String ADMIN_EMAIL = "recovery-admin@example.test";
    private static final String REASON = "Credenziali amministrative smarrite";
    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_admin_recovery_test").withUsername("bugboard_owner").withPassword(DATABASE_PASSWORD)
            .withInitScript("users-init.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> DATABASE_PASSWORD);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", () -> "bugboard_owner");
        properties.add("spring.flyway.password", () -> DATABASE_PASSWORD);
        properties.add("spring.session.jdbc.cleanup-cron", () -> "-");
    }
    @Autowired private AdminRecoveryService recovery;
    @Autowired private UserRepository users;
    @Autowired private PasswordService passwords;
    @Autowired private JdbcTemplate jdbc;
    @TempDir private Path privateDirectory;

    @BeforeEach
    void reset() throws Exception {
        SecurityContextHolder.clearContext();
        owner("drop function if exists reject_recovery_session_delete() cascade");
        owner("set session_replication_role=replica; truncate user_accounts,spring_session,login_attempts cascade");
    }
    @AfterEach
    void clear() throws Exception {
        SecurityContextHolder.clearContext();
        owner("drop function if exists reject_recovery_session_delete() cascade");
    }

    @Test
    void recoversExistingAdminWithNoAuthenticatedPrincipalAndSafeAudit() {
        UserAccount account = account(UserRole.ADMIN, true, false);
        UserAccount other = users.saveAndFlush(new UserAccount(UUID.randomUUID(), "other@example.test", "Other user",
                passwords.encode(ORIGINAL_PASSWORD), UserRole.VIEWER, START));
        session(account); session(account); session(other);
        recovery.recover("  RECOVERY-ADMIN@EXAMPLE.TEST  ", TEMPORARY_PASSWORD, "  Recupero cafe\u0301  ");
        UserAccount current = users.findById(account.getId()).orElseThrow();
        assertTrue(passwords.matches(TEMPORARY_PASSWORD, current.getPasswordHash()));
        assertTrue(current.isActive()); assertEquals(UserRole.ADMIN, current.getRole());
        assertTrue(current.isMustChangePassword());
        assertEquals(account.getAuthVersion() + 1, current.getAuthVersion());
        assertEquals(account.getVersion() + 1, current.getVersion());
        assertEquals(0, sessions(account)); assertEquals(1, sessions(other));
        assertEquals(1, events());
        assertNull(jdbc.queryForObject("select actor_id from account_events", UUID.class));
        assertEquals("ACCOUNT_PASSWORD_RESET", jdbc.queryForObject("select event_type from account_events", String.class));
        assertEquals("Recupero café", jdbc.queryForObject("select changes->'reason'->>'after' from account_events", String.class));
        assertEquals("false", jdbc.queryForObject("select changes->'mustChangePassword'->>'before' from account_events", String.class));
        String audit = jdbc.queryForObject("select changes::text from account_events", String.class);
        assertFalse(audit.contains(TEMPORARY_PASSWORD)); assertFalse(audit.contains(current.getPasswordHash()));
        assertFalse(audit.contains("passwordHash"));
    }

    @Test
    void recoversSelfAdminEvenWhenInitialPasswordChangeIsPending() {
        UserAccount account = account(UserRole.ADMIN, true, true);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
        recovery.recover(ADMIN_EMAIL, TEMPORARY_PASSWORD, REASON);
        assertTrue(users.findById(account.getId()).orElseThrow().isMustChangePassword());
        assertNull(jdbc.queryForObject("select actor_id from account_events", UUID.class));
        assertEquals(1, events());
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"MEMBER", "VIEWER"})
    void rejectsOtherRolesWithoutChanges(UserRole role) {
        UserAccount account = account(role, true, false); session(account);
        assertEquals("ADMIN_RECOVERY_REJECTED", assertThrows(DomainException.class,
                () -> recovery.recover(ADMIN_EMAIL, TEMPORARY_PASSWORD, REASON)).code());
        unchanged(account);
    }

    @Test
    void rejectsInactiveAdminWithoutReactivatingIt() {
        UserAccount account = account(UserRole.ADMIN, false, false); session(account);
        assertThrows(DomainException.class, () -> recovery.recover(ADMIN_EMAIL, TEMPORARY_PASSWORD, REASON));
        unchanged(account);
        assertFalse(users.findById(account.getId()).orElseThrow().isActive());
    }

    @Test
    void emptyDatabaseNeverBootstrapsAnAccount() {
        assertThrows(DomainException.class, () -> recovery.recover(ADMIN_EMAIL, TEMPORARY_PASSWORD, REASON));
        assertEquals(0, users.count()); assertEquals(0, events());
    }

    @ParameterizedTest
    @MethodSource("invalidInputs")
    void rejectsInvalidCredentialsAndReasons(String password, String reason) {
        UserAccount account = account(UserRole.ADMIN, true, false); session(account);
        assertThrows(DomainException.class, () -> recovery.recover(ADMIN_EMAIL, password, reason));
        unchanged(account);
    }
    static Stream<Arguments> invalidInputs() {
        return Stream.of(Arguments.of("short", REASON), Arguments.of(null, REASON),
                Arguments.of(TEMPORARY_PASSWORD, null), Arguments.of(TEMPORARY_PASSWORD, "   "),
                Arguments.of(TEMPORARY_PASSWORD, "first\nsecond"), Arguments.of(TEMPORARY_PASSWORD, "x".repeat(501)));
    }

    @Test
    void rejectsCurrentPasswordWithoutRevokingSessions() {
        UserAccount account = account(UserRole.ADMIN, true, false); session(account);
        assertThrows(DomainException.class, () -> recovery.recover(ADMIN_EMAIL, ORIGINAL_PASSWORD, REASON));
        unchanged(account);
    }

    @Test
    void sessionRevocationFailureRollsBackPasswordVersionsAndAudit() throws Exception {
        UserAccount account = account(UserRole.ADMIN, true, false); session(account);
        owner("""
                create function reject_recovery_session_delete() returns trigger language plpgsql as $$
                begin raise exception 'Recovery session deletion fixture failure'; end $$;
                create trigger reject_recovery_session_delete before delete on spring_session
                for each row execute function reject_recovery_session_delete()
                """);
        assertThrows(DataAccessException.class, () -> recovery.recover(ADMIN_EMAIL, TEMPORARY_PASSWORD, REASON));
        unchanged(account);
    }

    @Test
    @ResourceLock("SYSTEM_PROPERTIES")
    void launcherCommitsUsingTheConfiguredDatabaseAndForcedSafeProperties() throws Exception {
        UserAccount account = account(UserRole.ADMIN, true, false); session(account);
        Path input = privateDirectory.resolve("recovery.json");
        Files.writeString(input, "{\"email\":\"" + ADMIN_EMAIL + "\",\"temporaryPassword\":\"" + TEMPORARY_PASSWORD
                + "\",\"reason\":\"" + REASON + "\"}");
        Map<String, String> values = Map.of("spring.datasource.url", DATABASE.getJdbcUrl(),
                "spring.datasource.username", "bugboard_runtime", "spring.datasource.password", DATABASE_PASSWORD,
                "app.auth-ip-hash-secret", "RecoveryTestIpHashSecretPrivate2026", "server.port", "8080",
                "server.address", "0.0.0.0", "app.bootstrap-enabled", "true", "spring.flyway.enabled", "true");
        Map<String, String> previous = new HashMap<>();
        values.forEach((key, value) -> { previous.put(key, System.getProperty(key)); System.setProperty(key, value); });
        try { assertEquals(0, AdminRecoveryCommand.execute(input.toString())); }
        finally { previous.forEach((key, value) -> { if (value == null) { System.clearProperty(key); } else { System.setProperty(key, value); } }); }
        assertTrue(passwords.matches(TEMPORARY_PASSWORD, users.findById(account.getId()).orElseThrow().getPasswordHash()));
        assertEquals(1, events()); assertEquals(0, sessions(account));
    }

    @Test
    void launcherRejectsMissingAndUnknownInputWithoutStartingBootstrap() throws Exception {
        assertEquals(1, AdminRecoveryCommand.execute(null));
        Path input = privateDirectory.resolve("invalid-recovery.json");
        Files.writeString(input, "{\"email\":\"" + ADMIN_EMAIL + "\",\"temporaryPassword\":\"" + TEMPORARY_PASSWORD
                + "\",\"reason\":\"" + REASON + "\",\"unexpected\":true}");
        assertEquals(1, AdminRecoveryCommand.execute(input.toString()));
        assertEquals(0, users.count()); assertEquals(0, events());
    }

    private UserAccount account(UserRole role, boolean active, boolean temporary) {
        UserAccount account = new UserAccount(UUID.randomUUID(), ADMIN_EMAIL, "Recovery admin",
                passwords.encode(ORIGINAL_PASSWORD), role, START);
        account.update(account.getDisplayName(), role, active, START);
        account.replacePassword(account.getPasswordHash(), temporary, START);
        return users.saveAndFlush(account);
    }
    private void unchanged(UserAccount before) {
        UserAccount after = users.findById(before.getId()).orElseThrow();
        assertEquals(before.getPasswordHash(), after.getPasswordHash()); assertEquals(before.getAuthVersion(), after.getAuthVersion());
        assertEquals(before.getVersion(), after.getVersion()); assertEquals(before.isMustChangePassword(), after.isMustChangePassword());
        assertEquals(0, events()); assertEquals(1, sessions(before));
    }
    private int events() { return jdbc.queryForObject("select count(*) from account_events", Integer.class); }
    private int sessions(UserAccount account) {
        return jdbc.queryForObject("select count(*) from spring_session where principal_name=?", Integer.class, account.getId().toString());
    }
    private void session(UserAccount account) {
        long now = System.currentTimeMillis();
        jdbc.update("""
                insert into spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time,principal_name)
                values(?,?,?,?,?,?,?)
                """, UUID.randomUUID().toString(), UUID.randomUUID().toString(), now, now, 1800, now + 1800000, account.getId().toString());
    }
    private void owner(String sql) throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", DATABASE_PASSWORD);
             var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
