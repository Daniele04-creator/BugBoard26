package it.unina.bugboard26.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.api.LoginRequestException;
import it.unina.bugboard26.auth.persistence.LoginAttemptRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
@Import(LoginAttemptRepositoryIntegrationTest.TimeConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LoginAttemptRepositoryIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    private static final Instant START = Instant.parse("2026-02-10T12:00:00Z");
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_rate_test").withUsername("bugboard_owner").withPassword(PASSWORD)
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

    @Autowired private LoginAttemptRepository attempts;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private MutableClock clock;

    @BeforeEach
    void reset() {
        jdbc.update("delete from login_attempts");
        clock.set(START);
    }

    @Test
    void unknownEmailsAreHashedAndShareSameFailureThreshold() {
        String email = attempts.emailKey("unknown@example.test");
        String ip = attempts.ipKey("192.0.2.10");
        assertTrue(email.matches("[0-9a-f]{64}"));
        assertTrue(ip.matches("[0-9a-f]{64}"));
        assertNotEquals(email, ip);
        for (int index = 0; index < 4; index++) {
            attempts.failure(email, ip);
            assertDoesNotThrow(() -> attempts.check(email, ip));
        }
        attempts.failure(email, ip);
        LoginRequestException error = assertThrows(LoginRequestException.class, () -> attempts.check(email, ip));
        assertEquals(429, error.status());
        assertEquals("RATE_LIMITED", error.code());
        assertEquals(900, error.retryAfter());
        clock.set(START.plusSeconds(899));
        assertEquals(1, assertThrows(LoginRequestException.class, () -> attempts.check(email, ip)).retryAfter());
        clock.set(START.plusSeconds(900));
        assertDoesNotThrow(() -> attempts.check(email, ip));
    }

    @Test
    void ipThresholdAggregatesAcrossEmailsAndSuccessDoesNotClearIpHistory() {
        String ip = attempts.ipKey("192.0.2.20");
        for (int index = 0; index < 29; index++) {
            String email = attempts.emailKey("unknown" + index + "@example.test");
            attempts.failure(email, ip);
            attempts.success(email);
        }
        assertDoesNotThrow(() -> attempts.check(attempts.emailKey("fresh@example.test"), ip));
        String finalEmail = attempts.emailKey("last@example.test");
        attempts.failure(finalEmail, ip);
        attempts.success(finalEmail);
        assertEquals(30, failures(ip));
        assertEquals(1, jdbc.queryForObject("select count(*) from login_attempts", Integer.class));
        assertEquals(429, assertThrows(LoginRequestException.class,
                () -> attempts.check(attempts.emailKey("another@example.test"), ip)).status());
    }

    @Test
    void bucketBoundaryResetsCountAndRetentionRemainsTwentyFourHours() {
        String email = attempts.emailKey("bucket@example.test");
        String ip = attempts.ipKey("192.0.2.30");
        attempts.failure(email, ip);
        clock.set(START.plusSeconds(899));
        attempts.failure(email, ip);
        assertEquals(2, failures(email));
        clock.set(START.plusSeconds(900));
        attempts.failure(email, ip);
        assertEquals(1, failures(email));
        assertEquals(START.plusSeconds(900), jdbc.queryForObject(
                "select window_started_at from login_attempts where scope_hash=?",
                java.sql.Timestamp.class, email).toInstant());
        assertEquals(START.plusSeconds(900 + 86_400), jdbc.queryForObject(
                "select expires_at from login_attempts where scope_hash=?", java.sql.Timestamp.class, email).toInstant());
    }

    @Test
    void failureCounterCommitsEvenWhenOuterBusinessTransactionRollsBack() {
        String email = attempts.emailKey("rollback@example.test");
        String ip = attempts.ipKey("192.0.2.40");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            attempts.failure(email, ip);
            status.setRollbackOnly();
        });
        assertEquals(1, failures(email));
        assertEquals(1, failures(ip));
    }

    @Test
    void concurrentFailuresAreCountedWithoutLostUpdatesOrDeadlocks() throws Exception {
        String email = attempts.emailKey("parallel@example.test");
        String ip = attempts.ipKey("192.0.2.50");
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Future<?>> results = new ArrayList<>();
            for (int index = 0; index < 40; index++) {
                results.add(executor.submit(() -> {
                    assertTrue(start.await(10, TimeUnit.SECONDS));
                    attempts.failure(email, ip);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> result : results) { result.get(30, TimeUnit.SECONDS); }
        }
        assertEquals(40, failures(email));
        assertEquals(40, failures(ip));
        assertEquals(429, assertThrows(LoginRequestException.class, () -> attempts.check(email, ip)).status());
    }

    @Test
    void privateIpSaltIsRequiredAndChangesTheStoredKey() {
        LoginAttemptRepository invalid = new LoginAttemptRepository(jdbc, clock, "short");
        assertThrows(IllegalArgumentException.class, invalid::validateConfiguration);
        LoginAttemptRepository distinct = new LoginAttemptRepository(jdbc, clock, "different-private-test-salt-at-least-32");
        assertDoesNotThrow(distinct::validateConfiguration);
        assertNotEquals(attempts.ipKey("192.0.2.60"), distinct.ipKey("192.0.2.60"));
        assertNotEquals(attempts.ipKey("192.0.2.60"), attempts.ipKey("192.0.2.61"));
    }

    private int failures(String key) {
        return jdbc.queryForObject("select failure_count from login_attempts where scope_hash=?", Integer.class, key);
    }

    @TestConfiguration
    static class TimeConfiguration {
        @Bean @Primary MutableClock rateTestClock() { return new MutableClock(); }
    }

    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(START);
        void set(Instant instant) { now.set(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now.get(), zone); }
        @Override public Instant instant() { return now.get(); }
    }
}
