package it.unina.bugboard26.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.application.IdempotencyService;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
@Import(IdempotencyIntegrationTest.TimeConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class IdempotencyIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    private static final String OPERATION = "POST /api/v1/issues";
    private static final Instant START = Instant.parse("2026-02-10T12:00:00Z");
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_idempotency_test").withUsername("bugboard_owner").withPassword(PASSWORD)
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

    @Autowired private IdempotencyService service;
    @Autowired private ActorAccess actors;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private MutableClock clock;
    private Actor actor;

    @BeforeEach
    void account() {
        clock.set(START);
        actor = new Actor(UUID.randomUUID(), UserRole.MEMBER, true, false, 0);
        insertAccount(actor.id());
        authenticate(actor.id(), 0);
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void requestHashMatchesKnownSha256ReferenceAndChangesWithPayload() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                IdempotencyService.hash("abc"));
        assertNotEquals(IdempotencyService.hash("title=one"), IdempotencyService.hash("title=two"));
    }

    @Test
    void requiresTransactionAndRejectsInvalidIdentityKeyAndRequestHash() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("payload");
        assertThrows(IllegalTransactionStateException.class,
                () -> service.execute(actor, key, OPERATION, hash, TestResponse.class, () -> createIssue(actor.id())));
        for (String invalidHash : List.of("", "not-a-hash", "A".repeat(64))) {
            assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                    () -> execute(key, OPERATION, invalidHash, () -> createIssue(actor.id()))).code());
        }
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                () -> execute(null, OPERATION, hash, () -> createIssue(actor.id()))).code());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                () -> execute(key, "x".repeat(161), hash, () -> createIssue(actor.id()))).code());
    }

    @Test
    void replayReturnsOriginalResponseAndDoesNotRepeatBusinessWrite() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        TestResponse first = execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        TestResponse replay = execute(key, OPERATION, hash, () -> { throw new AssertionError("Replay ran action"); });
        assertEquals(first, replay);
        assertEquals(1, issueCount(actor.id()));
        assertEquals(1, recordCount(actor.id(), key));
        assertEquals(201, jdbc.queryForObject("select response_status from idempotency_records where actor_id=? and key=?",
                Integer.class, actor.id(), key));
        assertEquals(first.id(), jdbc.queryForObject("select resource_id from idempotency_records where actor_id=? and key=?",
                UUID.class, actor.id(), key));
    }

    @Test
    void conflictingPayloadOrOperationNeverWritesAnotherIssue() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("original request");
        execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        assertEquals("IDEMPOTENCY_KEY_REUSED", assertThrows(DomainException.class,
                () -> execute(key, OPERATION, IdempotencyService.hash("different request"),
                        () -> createIssue(actor.id()))).code());
        assertEquals("IDEMPOTENCY_KEY_REUSED", assertThrows(DomainException.class,
                () -> execute(key, "POST /api/v1/issues/comments", hash, () -> createIssue(actor.id()))).code());
        assertEquals(1, issueCount(actor.id()));
        assertEquals(1, recordCount(actor.id(), key));
    }

    @Test
    void keyScopeIsPerUserAndAuthenticationPrecedesReplay() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        TestResponse first = execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        Actor original = actor;
        UUID other = UUID.randomUUID();
        insertAccount(other);
        authenticate(other, 0);
        actor = new Actor(other, UserRole.MEMBER, true, false, 0);
        TestResponse second = execute(key, OPERATION, hash, () -> createIssue(other));
        assertNotEquals(first.id(), second.id());
        actor = original;
        assertEquals("FORBIDDEN", assertThrows(DomainException.class,
                () -> new TransactionTemplate(transactionManager).execute(status -> service.execute(original, key,
                        OPERATION, hash, TestResponse.class, () -> { throw new AssertionError("Unauthorized replay"); }))).code());
        authenticate(original.id(), 0);
        jdbc.update("update user_accounts set auth_version=auth_version+1 where id=?", original.id());
        assertEquals("AUTHENTICATION_REQUIRED", assertThrows(DomainException.class,
                () -> execute(key, OPERATION, hash, () -> { throw new AssertionError("Revoked replay"); })).code());
    }

    @Test
    void passwordChangeRequiredBlocksEvenExistingReplay() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        jdbc.update("update user_accounts set must_change_password=true where id=?", actor.id());
        assertEquals("FORBIDDEN", assertThrows(DomainException.class,
                () -> execute(key, OPERATION, hash, () -> { throw new AssertionError("Restricted replay"); })).code());
        assertEquals(1, issueCount(actor.id()));
    }

    @Test
    void expiryBoundaryReusesKeyOnlyAfterTwentyFourHours() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        TestResponse first = execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        clock.set(START.plusSeconds(86_400).minusNanos(1_000));
        assertEquals(first, execute(key, OPERATION, hash, () -> { throw new AssertionError("Premature expiry"); }));
        clock.set(START.plusSeconds(86_400));
        TestResponse next = execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        assertNotEquals(first.id(), next.id());
        assertEquals(2, issueCount(actor.id()));
        assertEquals(1, recordCount(actor.id(), key));
    }

    @Test
    void businessFailureRollsBackResourceAndKeyThenAllowsSuccessfulRetry() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        assertThrows(IllegalStateException.class, () -> execute(key, OPERATION, hash, () -> {
            createIssue(actor.id());
            throw new IllegalStateException("Synthetic failure after business insert");
        }));
        assertEquals(0, issueCount(actor.id()));
        assertEquals(0, recordCount(actor.id(), key));
        execute(key, OPERATION, hash, () -> createIssue(actor.id()));
        assertEquals(1, issueCount(actor.id()));
        assertEquals(1, recordCount(actor.id(), key));
    }

    @Test
    void laterTransactionFailureRollsBackStoredReplayAndBusinessResource() {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("same request");
        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).execute(status -> {
            actors.lockCurrent();
            service.execute(actor, key, OPERATION, hash, TestResponse.class, () -> createIssue(actor.id()));
            throw new IllegalStateException("Synthetic failure after idempotency insert");
        }));
        assertEquals(0, issueCount(actor.id()));
        assertEquals(0, recordCount(actor.id(), key));
    }

    @Test
    void parallelSameKeyIsSerializedByAdvisoryLockAndReplayedOnce() throws Exception {
        UUID key = UUID.randomUUID();
        String hash = IdempotencyService.hash("parallel request");
        Actor stableActor = actor;
        CountDownLatch firstAction = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        AtomicInteger actions = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                authenticate(stableActor.id(), 0);
                try {
                    return new TransactionTemplate(transactionManager).execute(status -> service.execute(stableActor,
                            key, OPERATION, hash, TestResponse.class, () -> {
                                actions.incrementAndGet();
                                firstAction.countDown();
                                await(releaseFirst);
                                return createIssue(stableActor.id());
                            }));
                } finally { SecurityContextHolder.clearContext(); }
            });
            assertTrue(firstAction.await(10, TimeUnit.SECONDS));
            var second = executor.submit(() -> {
                authenticate(stableActor.id(), 0);
                secondStarted.countDown();
                try {
                    // Account data is stable in this fixture; isolate the service's advisory serialization.
                    return new TransactionTemplate(transactionManager).execute(status -> service.execute(stableActor,
                            key, OPERATION, hash, TestResponse.class, () -> {
                                actions.incrementAndGet();
                                return createIssue(stableActor.id());
                            }));
                } finally { SecurityContextHolder.clearContext(); }
            });
            assertTrue(secondStarted.await(10, TimeUnit.SECONDS));
            awaitAdvisoryWaiter();
            releaseFirst.countDown();
            assertEquals(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
        } finally { releaseFirst.countDown(); }
        assertEquals(1, actions.get());
        assertEquals(1, issueCount(actor.id()));
        assertEquals(1, recordCount(actor.id(), key));
    }

    private TestResponse execute(UUID key, String operation, String hash, Supplier<TestResponse> action) {
        return new TransactionTemplate(transactionManager).execute(status -> {
            actors.lockCurrent();
            return service.execute(actor, key, operation, hash, TestResponse.class, action);
        });
    }

    private TestResponse createIssue(UUID reporter) {
        UUID id = UUID.randomUUID();
        java.sql.Timestamp now = java.sql.Timestamp.from(clock.instant());
        jdbc.update("insert into issues(id,title,description,title_search,description_search,type,priority,status,reporter_id,"
                + "cycle_started_at,created_at,updated_at,last_activity_at) values(?, 'Test issue', 'Test description',"
                + "'test issue', 'test description', 'BUG', 'MEDIUM', 'TODO',?,?,?,?,?)", id, reporter, now, now, now, now);
        return new TestResponse(id, "Test issue");
    }

    private void insertAccount(UUID id) {
        java.sql.Timestamp now = java.sql.Timestamp.from(START);
        jdbc.update("insert into user_accounts(id,email,display_name,password_hash,role,active,must_change_password,created_at,updated_at) "
                + "values(?,?,'Idempotency member','synthetic test hash','MEMBER',true,false,?,?)",
                id, id + "@example.test", now, now);
    }

    private long issueCount(UUID reporter) {
        return jdbc.queryForObject("select count(*) from issues where reporter_id=?", Long.class, reporter);
    }

    private long recordCount(UUID user, UUID key) {
        return jdbc.queryForObject("select count(*) from idempotency_records where actor_id=? and key=?", Long.class, user, key);
    }

    private static void authenticate(UUID id, long authVersion) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(id, authVersion), null, List.of()));
    }

    private static void await(CountDownLatch latch) {
        try {
            assertTrue(latch.await(10, TimeUnit.SECONDS));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError(error);
        }
    }

    private void awaitAdvisoryWaiter() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (jdbc.queryForObject("select count(*) from pg_locks where locktype='advisory' and not granted", Integer.class) > 0) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Second request did not wait for the idempotency advisory lock");
    }

    public record TestResponse(UUID id, String title) { }

    @TestConfiguration
    static class TimeConfiguration {
        @Bean @Primary MutableClock idempotencyTestClock() { return new MutableClock(); }
    }

    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(START);
        void set(Instant instant) { now.set(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now.get(), zone); }
        @Override public Instant instant() { return now.get(); }
    }
}
