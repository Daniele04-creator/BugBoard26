package it.unina.bugboard26.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.application.BootstrapService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Instant;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
@Transactional
class UserLifecycleIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    private static final String INITIAL_PASSWORD = "Original password 2026";
    private static final String NEW_PASSWORD = "Replacement password 2026";
    private static final String MEMBER_EMAIL = "member@example.test";
    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");

    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_users_test").withUsername("bugboard_owner").withPassword(PASSWORD)
            .withInitScript("users-init.sql");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", () -> "bugboard_owner");
        properties.add("spring.flyway.password", () -> PASSWORD);
    }

    @Autowired private UserService service;
    @Autowired private UserRepository repository;
    @Autowired private PasswordService passwords;
    @Autowired private JdbcTemplate jdbc;
    private UserAccount admin;
    private UserAccount member;

    @BeforeEach
    void accounts() {
        admin = account("admin@example.test", "Admin", UserRole.ADMIN);
        member = account(MEMBER_EMAIL, "Member", UserRole.MEMBER);
        authenticate(admin);
    }

    @AfterEach
    void clearSecurityContext() { SecurityContextHolder.clearContext(); }

    @Test
    void createsNormalizedAccountWithTemporaryPasswordAndSafeAudit() {
        UserDtos.UserAdmin created = service.create(new UserDtos.CreateUser("  NEW@EXAMPLE.TEST ", "  New user  ", NEW_PASSWORD, UserRole.VIEWER));
        UserAccount persisted = repository.findById(created.id()).orElseThrow();
        assertEquals("new@example.test", persisted.getEmail());
        assertEquals("New user", created.displayName());
        assertTrue(created.mustChangePassword());
        assertTrue(passwords.matches(NEW_PASSWORD, persisted.getPasswordHash()));
        String audit = jdbc.queryForObject("select changes::text from account_events where subject_id = ?", String.class, created.id());
        assertFalse(audit.contains(NEW_PASSWORD));
        assertFalse(audit.contains("passwordHash"));
        assertEquals(1, countEvents(created.id()));
    }

    @Test
    void duplicateEmailIsConflictAndCreatesNoSecondAccount() {
        DomainException failure = assertThrows(DomainException.class, () -> service.create(
                new UserDtos.CreateUser(" MEMBER@EXAMPLE.TEST ", "Other user", NEW_PASSWORD, UserRole.MEMBER)));
        assertEquals("EMAIL_ALREADY_EXISTS", failure.code());
        assertEquals(2, repository.count());
    }

    @Test
    void profileRenameChangesEditingVersionAndPreservesAuthenticatedSession() {
        authenticate(member);
        session(member);
        long authVersion = member.getAuthVersion();
        long version = member.getVersion();
        UserDtos.Me changed = service.profile(new UserDtos.Profile("Renamed member", version));
        assertEquals(version + 1, changed.version());
        assertEquals(authVersion, member.getAuthVersion());
        assertEquals(1, countSessions(member.getId()));
        assertEquals("Renamed member", service.directory(null, 0, 20).items().stream()
                .filter(user -> user.id().equals(member.getId())).findFirst().orElseThrow().displayName());
        assertEquals(1, countEvents(member.getId()));
    }

    @Test
    void identicalProfileIsNoOpButStaleVersionStillConflicts() {
        authenticate(member);
        Instant previous = member.getUpdatedAt();
        long version = member.getVersion();
        service.profile(new UserDtos.Profile("Member", version));
        assertEquals(version, member.getVersion());
        assertEquals(previous, member.getUpdatedAt());
        assertEquals(0, countEvents(member.getId()));
        DomainException conflict = assertThrows(DomainException.class, () -> service.profile(new UserDtos.Profile("Member", version + 1)));
        assertEquals("VERSION_CONFLICT", conflict.code());
    }

    @Test
    void resettingOtherAccountPreservesAssignmentsButRevokesSessionsAndEligibility() {
        openIssue(member);
        session(member);
        long previousAuth = member.getAuthVersion();
        service.resetPassword(member.getId(), new UserDtos.ResetPassword(NEW_PASSWORD, member.getVersion()));
        assertTrue(member.isMustChangePassword());
        assertEquals(previousAuth + 1, member.getAuthVersion());
        assertEquals(0, countSessions(member.getId()));
        assertEquals(1, jdbc.queryForObject("select count(*) from issues where assignee_id = ?", Integer.class, member.getId()));
        assertFalse(service.candidates(null, 0, 20).items().stream().anyMatch(candidate -> candidate.id().equals(member.getId())));
        assertTrue(passwords.matches(NEW_PASSWORD, member.getPasswordHash()));
    }

    @Test
    void changingPasswordFromTemporaryAccountAllowsRecoveryAndRevokesAllSessions() {
        member.replacePassword(passwords.encode(INITIAL_PASSWORD), true, START);
        repository.flush();
        authenticate(member);
        session(member);
        long oldAuth = member.getAuthVersion();
        service.changePassword(new UserDtos.ChangePassword(INITIAL_PASSWORD, NEW_PASSWORD));
        assertFalse(member.isMustChangePassword());
        assertEquals(oldAuth + 1, member.getAuthVersion());
        assertEquals(0, countSessions(member.getId()));
        assertTrue(passwords.matches(NEW_PASSWORD, member.getPasswordHash()));
    }

    @Test
    void wrongCurrentPasswordPreservesSessionAndAccount() {
        authenticate(member);
        session(member);
        long authVersion = member.getAuthVersion();
        DomainException failure = assertThrows(DomainException.class, () -> service.changePassword(
                new UserDtos.ChangePassword("Incorrect password", NEW_PASSWORD)));
        assertEquals("VALIDATION_ERROR", failure.code());
        assertTrue(failure.fields().containsKey("currentPassword"));
        assertEquals(authVersion, member.getAuthVersion());
        assertEquals(1, countSessions(member.getId()));
        assertEquals(0, countEvents(member.getId()));
    }

    @Test
    void ownAdministrativeResetIsForbidden() {
        DomainException failure = assertThrows(DomainException.class, () -> service.resetPassword(
                admin.getId(), new UserDtos.ResetPassword(NEW_PASSWORD, admin.getVersion())));
        assertEquals("FORBIDDEN", failure.code());
        assertEquals(0, countEvents(admin.getId()));
    }

    @Test
    void lastActiveAdministratorCannotBeDisabledOrDemoted() {
        DomainException failure = assertThrows(DomainException.class, () -> service.update(admin.getId(),
                new UserDtos.UpdateUser("Admin", UserRole.MEMBER, true, admin.getVersion())));
        assertEquals("LAST_ADMIN_REQUIRED", failure.code());
        assertEquals(UserRole.ADMIN, admin.getRole());
    }

    @Test
    void openAssignmentsPreventDeactivationAndViewerDemotion() {
        openIssue(member);
        DomainException failure = assertThrows(DomainException.class, () -> service.update(member.getId(),
                new UserDtos.UpdateUser("Member", UserRole.VIEWER, true, member.getVersion())));
        assertEquals("OPEN_ASSIGNMENTS_EXIST", failure.code());
        assertEquals(UserRole.MEMBER, member.getRole());
        assertTrue(member.isActive());
    }

    @Test
    void roleChangeRevokesSessionsAndMakesStalePrincipalUnauthorized() {
        session(member);
        long oldAuth = member.getAuthVersion();
        service.update(member.getId(), new UserDtos.UpdateUser("Member", UserRole.VIEWER, true, member.getVersion()));
        assertEquals(oldAuth + 1, member.getAuthVersion());
        assertEquals(0, countSessions(member.getId()));
        authenticate(member.getId(), oldAuth);
        DomainException failure = assertThrows(DomainException.class, () -> service.directory(null, 0, 20));
        assertEquals(401, failure.status());
    }

    @Test
    void publicDirectoryIncludesInactiveAccountsButAdministratorEmailSearchIsPrivate() {
        service.update(member.getId(), new UserDtos.UpdateUser("Member", UserRole.MEMBER, false, member.getVersion()));
        assertEquals(2, service.directory(null, 0, 20).totalElements());
        assertEquals(1, service.list(MEMBER_EMAIL, null, null, 0, 20).totalElements());
        assertEquals(0, service.directory(MEMBER_EMAIL, 0, 20).totalElements());
        UserAccount viewer = account("viewer@example.test", "Viewer", UserRole.VIEWER);
        authenticate(viewer);
        assertEquals(3, service.directory(null, 0, 20).totalElements());
        assertEquals("FORBIDDEN", assertThrows(DomainException.class, () -> service.list(null, null, null, 0, 20)).code());
    }

    @Test
    void bootstrapOnExistingDatabaseDoesNotRecreateOrResetAccounts() {
        long version = admin.getVersion();
        String previousHash = admin.getPasswordHash();
        BootstrapService bootstrap = new BootstrapService(repository, passwords, jdbc, Clock.systemUTC(),
                "demo", "bootstrap@example.test", NEW_PASSWORD, true);
        bootstrap.run(null);
        assertEquals(2, repository.count());
        assertEquals(previousHash, admin.getPasswordHash());
        assertEquals(version, admin.getVersion());
        assertEquals(0, countEvents(admin.getId()));
    }

    @Test
    void identicalAdminUpdatePreservesBothVersionsAndSessions() {
        session(member);
        long editingVersion = member.getVersion();
        long authVersion = member.getAuthVersion();
        Instant updated = member.getUpdatedAt();
        service.update(member.getId(), new UserDtos.UpdateUser("Member", UserRole.MEMBER, true, editingVersion));
        assertEquals(editingVersion, member.getVersion());
        assertEquals(authVersion, member.getAuthVersion());
        assertEquals(updated, member.getUpdatedAt());
        assertEquals(1, countSessions(member.getId()));
        assertEquals(0, countEvents(member.getId()));
    }

    @Test
    void administratorCanDemoteTheirAccountWhenAnotherActiveAdministratorExists() {
        account("other-admin@example.test", "Other Admin", UserRole.ADMIN);
        session(admin);
        service.update(admin.getId(), new UserDtos.UpdateUser("Admin", UserRole.MEMBER, true, admin.getVersion()));
        assertEquals(UserRole.MEMBER, admin.getRole());
        assertEquals(1, repository.countByRoleAndActiveTrue(UserRole.ADMIN));
        assertEquals(0, countSessions(admin.getId()));
    }

    @Test
    void samePasswordIsRejectedWithoutAuditOrRevocation() {
        authenticate(member);
        session(member);
        DomainException failure = assertThrows(DomainException.class, () -> service.changePassword(
                new UserDtos.ChangePassword(INITIAL_PASSWORD, INITIAL_PASSWORD)));
        assertEquals("VALIDATION_ERROR", failure.code());
        assertTrue(failure.fields().containsKey("newPassword"));
        assertEquals(1, countSessions(member.getId()));
        assertEquals(0, countEvents(member.getId()));
    }

    @Test
    void temporaryAccountsCannotUseDirectoryBeforeChangingPassword() {
        member.replacePassword(member.getPasswordHash(), true, START);
        repository.flush();
        authenticate(member);
        assertEquals("PASSWORD_CHANGE_REQUIRED", assertThrows(DomainException.class,
                () -> service.directory(null, 0, 20)).code());
    }

    @Test
    void listEscapesSubstringWildcardsAndReportsEmptyPagesWithCorrectTotal() {
        assertEquals(0, service.list("%", null, null, 0, 20).totalElements());
        assertEquals(0, service.directory("_", 0, 20).totalElements());
        var page = service.directory(null, 10, 20);
        assertEquals(2, page.totalElements());
        assertTrue(page.items().isEmpty());
        assertEquals(1, page.totalPages());
    }

    private UserAccount account(String email, String name, UserRole role) {
        UserAccount account = new UserAccount(UUID.randomUUID(), email, name, passwords.encode(INITIAL_PASSWORD), role, START);
        account.replacePassword(account.getPasswordHash(), false, START);
        return repository.saveAndFlush(account);
    }

    private void authenticate(UserAccount account) { authenticate(account.getId(), account.getAuthVersion()); }

    private void authenticate(UUID id, long authVersion) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(id, authVersion), null, List.of()));
    }

    private int countEvents(UUID id) {
        return jdbc.queryForObject("select count(*) from account_events where subject_id = ?", Integer.class, id);
    }

    private int countSessions(UUID id) {
        return jdbc.queryForObject("select count(*) from spring_session where principal_name = ?", Integer.class, id.toString());
    }

    private void session(UserAccount account) {
        long now = System.currentTimeMillis();
        jdbc.update("""
                insert into spring_session(primary_id,session_id,creation_time,last_access_time,
                max_inactive_interval,expiry_time,principal_name) values(?,?,?,?,?,?,?)
                """, UUID.randomUUID().toString(), UUID.randomUUID().toString(), now, now, 1800, now + 1800000,
                account.getId().toString());
    }

    private void openIssue(UserAccount assignee) {
        jdbc.update("""
                insert into issues(id,title,description,title_search,description_search,type,priority,status,
                reporter_id,assignee_id,cycle_started_at,created_at,updated_at,last_activity_at)
                values(?,'Assigned issue','Assignment lifecycle test','assigned issue','assignment lifecycle test',
                'BUG','MEDIUM','TODO',?,?,now(),now(),now(),now())
                """, UUID.randomUUID(), admin.getId(), assignee.getId());
    }
}
