package it.unina.bugboard26.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class ConcurrentAdministratorsIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";

    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf")
            .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_last_admin_test").withUsername("bugboard_owner").withPassword(PASSWORD)
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

    @Test
    void concurrentSelfDemotionsCannotRemoveBothRemainingAdministrators() throws Exception {
        String hash = passwords.encode("Concurrent admin password 2026");
        UserAccount first = readyAdmin("first-admin@example.test", hash);
        UserAccount second = readyAdmin("second-admin@example.test", hash);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstResult = executor.submit(() -> demote(first, ready, start));
            var secondResult = executor.submit(() -> demote(second, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS), "Both callers must be ready before the race.");
            start.countDown();
            List<String> results = List.of(firstResult.get(20, TimeUnit.SECONDS), secondResult.get(20, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter("SUCCESS"::equals).count());
            assertEquals(1, results.stream().filter("LAST_ADMIN_REQUIRED"::equals).count());
        }
        assertEquals(1, repository.countByRoleAndActiveTrue(UserRole.ADMIN));
        assertEquals(1, jdbc.queryForObject("select count(*) from account_events where event_type = 'ACCOUNT_UPDATED'", Integer.class));
        assertEquals(1L, repository.findAll().stream().filter(user -> user.getRole() == UserRole.MEMBER).count());
    }

    private UserAccount readyAdmin(String email, String hash) {
        Instant now = Instant.now();
        UserAccount account = new UserAccount(UUID.randomUUID(), email, "Concurrent Admin", hash, UserRole.ADMIN, now);
        account.replacePassword(hash, false, now);
        return repository.saveAndFlush(account);
    }

    private String demote(UserAccount account, CountDownLatch ready, CountDownLatch start) throws InterruptedException {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) { throw new IllegalStateException("Concurrent test barrier timed out."); }
        try {
            service.update(account.getId(), new UserDtos.UpdateUser(account.getDisplayName(), UserRole.MEMBER, true, account.getVersion()));
            return "SUCCESS";
        } catch (DomainException exception) {
            return exception.code();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
