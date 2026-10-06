package it.unina.bugboard26.issues;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.application.IssueEventWriter;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.application.LabelDirectory;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(IssueTestClock.class)
class IssueConcurrencyIntegrationTest {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_issues_concurrent").withUsername("bugboard_owner").withPassword("UserLifecycleIntegrationOnly")
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
    @Autowired UserService userService;
    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean IssueEventWriter events;
    @MockitoSpyBean LabelDirectory labels;
    private UserAccount firstAdmin;
    private UserAccount secondAdmin;
    private UserAccount member;
    private UserAccount other;

    @BeforeEach
    void setup() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("SET session_replication_role=replica"); statement.execute("TRUNCATE user_accounts,labels,spring_session,login_attempts CASCADE");
            statement.execute("SET session_replication_role=origin");
        }
        firstAdmin = account("First Admin", UserRole.ADMIN); secondAdmin = account("Second Admin", UserRole.ADMIN);
        member = account("Member", UserRole.MEMBER); other = account("Other", UserRole.MEMBER);
        authenticate(firstAdmin);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void twoAdministratorsAssigningSameVersionProduceOneWinnerOneConflict() throws Exception {
        var issue = create(); CyclicBarrier start = new CyclicBarrier(2);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> concurrent(firstAdmin, start,
                    () -> workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L))));
            var second = executor.submit(() -> concurrent(secondAdmin, start,
                    () -> workflow.assign(issue.id(), new IssueDtos.Assignment(other.getId(), 0L))));
            List<Object> results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter(IssueDtos.IssueDetail.class::isInstance).count());
            assertEquals(1, results.stream().filter(value -> value instanceof DomainException exception && exception.code().equals("VERSION_CONFLICT")).count());
        }
        assertEquals(1, queries.detail(issue.id()).version()); assertEquals(2, count("issue_events")); assertEquals(1, count("notifications"));
    }

    @Test
    void sameActorSameKeyConcurrentCreationReturnsExactlyOneIssue() throws Exception {
        UUID key = UUID.randomUUID(); CyclicBarrier start = new CyclicBarrier(2);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> concurrent(firstAdmin, start, () -> create(key)));
            var second = executor.submit(() -> concurrent(firstAdmin, start, () -> create(key)));
            assertEquals(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(1, count("issues")); assertEquals(1, count("issue_events")); assertEquals(1, count("idempotency_records"));
    }

    @Test
    void oppositeDuplicateCommandsCannotCreateCycleOrChain() throws Exception {
        var firstIssue = create(); var secondIssue = create(); CyclicBarrier start = new CyclicBarrier(2);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> concurrent(firstAdmin, start,
                    () -> workflow.duplicate(firstIssue.id(), new IssueDtos.Duplicate(secondIssue.id(), 0L))));
            var second = executor.submit(() -> concurrent(secondAdmin, start,
                    () -> workflow.duplicate(secondIssue.id(), new IssueDtos.Duplicate(firstIssue.id(), 0L))));
            List<Object> results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter(IssueDtos.IssueDetail.class::isInstance).count());
            assertEquals(1, results.stream().filter(value -> value instanceof DomainException exception && exception.code().equals("DUPLICATE_CONFLICT")).count());
        }
        assertEquals(1, jdbc.queryForObject("select count(*) from issues where status='DUPLICATE'", Long.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from issues a join issues b on a.duplicate_of_id=b.id where b.duplicate_of_id is not null", Long.class));
        assertEquals(3, count("issue_events")); assertEquals(0, count("resolution_cycles"));
    }

    @Test
    void assignmentAndDeactivationSerializeWithoutIneligibleOpenAssignee() throws Exception {
        var issue = create(); CyclicBarrier start = new CyclicBarrier(2);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var assignment = executor.submit(() -> concurrent(firstAdmin, start,
                    () -> workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L))));
            var deactivation = executor.submit(() -> concurrent(secondAdmin, start,
                    () -> userService.update(member.getId(), new UserDtos.UpdateUser(member.getDisplayName(), UserRole.MEMBER, false, member.getVersion()))));
            Object assigned = assignment.get(10, TimeUnit.SECONDS); Object disabled = deactivation.get(10, TimeUnit.SECONDS);
            if (assigned instanceof IssueDtos.IssueDetail) {
                assertTrue(disabled instanceof DomainException exception && exception.code().equals("OPEN_ASSIGNMENTS_EXIST"));
            } else {
                assertTrue(assigned instanceof DomainException exception && exception.code().equals("ASSIGNEE_NOT_ELIGIBLE"));
                assertTrue(disabled instanceof UserDtos.UserAdmin);
            }
        }
        assertEquals(0, jdbc.queryForObject("select count(*) from issues i join user_accounts u on u.id=i.assignee_id where not i.archived and i.status in ('TODO','IN_PROGRESS') and not u.active", Long.class));
    }

    @Test
    void reassignmentHeldBeforeAuditRevokesFormerAssigneeEditPermissionUnderLock() throws Exception {
        var created = create(); var assigned = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        CountDownLatch entered = new CountDownLatch(1); CountDownLatch release = new CountDownLatch(1);
        pauseBeforeEvent("ASSIGNMENT_CHANGED", entered, release);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var assignment = executor.submit(() -> runAs(firstAdmin,
                    () -> workflow.assign(assigned.id(), new IssueDtos.Assignment(other.getId(), 1L))));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            var editing = executor.submit(() -> runAs(member, () -> service.update(assigned.id(), update(1L))));
            release.countDown(); assertTrue(assignment.get(10, TimeUnit.SECONDS) instanceof IssueDtos.IssueDetail);
            Object denied = editing.get(10, TimeUnit.SECONDS);
            assertTrue(denied instanceof DomainException exception && exception.code().equals("FORBIDDEN"));
        } finally { release.countDown(); }
        assertEquals("Concurrent issue", queries.detail(assigned.id()).title()); assertEquals(other.getId(), queries.detail(assigned.id()).assignee().id());
    }

    @Test
    void editHeldBeforeAuditMakesConcurrentOldAssignmentVersionConflict() throws Exception {
        var created = create(); var assigned = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        CountDownLatch entered = new CountDownLatch(1); CountDownLatch release = new CountDownLatch(1);
        pauseBeforeEvent("FIELDS_UPDATED", entered, release);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var editing = executor.submit(() -> runAs(member, () -> service.update(assigned.id(), update(1L))));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            var assignment = executor.submit(() -> runAs(firstAdmin,
                    () -> workflow.assign(assigned.id(), new IssueDtos.Assignment(other.getId(), 1L))));
            release.countDown(); assertTrue(editing.get(10, TimeUnit.SECONDS) instanceof IssueDtos.IssueDetail);
            Object denied = assignment.get(10, TimeUnit.SECONDS);
            assertTrue(denied instanceof DomainException exception && exception.code().equals("VERSION_CONFLICT"));
        } finally { release.countDown(); }
        assertEquals("Edited concurrent issue", queries.detail(assigned.id()).title()); assertEquals(member.getId(), queries.detail(assigned.id()).assignee().id());
        assertEquals(3, count("issue_events")); assertEquals(1, count("notifications"));
    }

    @Test
    void predictedVersionCannotValidateStaleLabelAndAccountLockSnapshot() throws Exception {
        UUID oldLabel = label("Old label"); UUID newLabel = label("New label");
        var issue = service.create(new IssueDtos.CreateIssue("Concurrent labels", "Detailed concurrent label instructions", IssueType.BUG, Priority.MEDIUM,
                List.of(oldLabel)), null, UUID.randomUUID());
        CountDownLatch entered = new CountDownLatch(1); CountDownLatch release = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicBoolean first = new java.util.concurrent.atomic.AtomicBoolean(true);
        LabelDirectory labelSpy = AopTestUtils.getUltimateTargetObject(labels);
        doAnswer(invocation -> {
            if (first.compareAndSet(true, false)) { entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); }
            return invocation.callRealMethod();
        }).when(labelSpy).lock(anyList(), anyList());
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var stale = executor.submit(() -> runAs(firstAdmin, () -> service.update(issue.id(), new IssueDtos.UpdateIssue(
                    issue.title(), issue.description(), issue.type(), issue.priority(), List.of(oldLabel), 1L))));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            var valid = executor.submit(() -> runAs(secondAdmin, () -> service.update(issue.id(), new IssueDtos.UpdateIssue(
                    issue.title(), issue.description(), issue.type(), issue.priority(), List.of(newLabel), 0L))));
            assertTrue(valid.get(10, TimeUnit.SECONDS) instanceof IssueDtos.IssueDetail);
            release.countDown();
            Object rejected = stale.get(10, TimeUnit.SECONDS);
            assertTrue(rejected instanceof DomainException exception && exception.code().equals("VERSION_CONFLICT"));
        } finally { release.countDown(); }
        var current = queries.detail(issue.id()); assertEquals(1, current.version());
        assertEquals(List.of(newLabel), current.labels().stream().map(IssueDtos.LabelRef::id).toList()); assertEquals(2, count("issue_events"));
    }

    private void pauseBeforeEvent(String type, CountDownLatch entered, CountDownLatch release) {
        doAnswer(invocation -> {
            entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return invocation.callRealMethod();
        }).when(events).write(any(Issue.class), any(Actor.class), eq(type), anyMap(), nullable(Map.class), any(Instant.class));
    }
    private Object concurrent(UserAccount account, CyclicBarrier barrier, Supplier<?> action) throws Exception {
        barrier.await(10, TimeUnit.SECONDS); return runAs(account, action);
    }
    private Object runAs(UserAccount account, Supplier<?> action) {
        authenticate(account);
        try { return action.get(); } catch (DomainException exception) { return exception; }
        finally { SecurityContextHolder.clearContext(); }
    }
    private IssueDtos.IssueDetail create() { return create(UUID.randomUUID()); }
    private IssueDtos.IssueDetail create(UUID key) {
        return service.create(new IssueDtos.CreateIssue("Concurrent issue", "Detailed concurrency reproduction", IssueType.BUG, Priority.MEDIUM, List.of()), null, key);
    }
    private IssueDtos.UpdateIssue update(long version) {
        return new IssueDtos.UpdateIssue("Edited concurrent issue", "Detailed edited concurrent instructions", IssueType.BUG, Priority.HIGH, List.of(), version);
    }
    private UserAccount account(String name, UserRole role) {
        UserAccount user = new UserAccount(UUID.randomUUID(), UUID.randomUUID() + "@example.test", name,
                passwords.encode("Synthetic password 2026"), role, Instant.parse("2026-01-01T00:00:00Z"));
        user.replacePassword(user.getPasswordHash(), false, Instant.parse("2026-01-01T00:01:00Z")); return users.saveAndFlush(user);
    }
    private void authenticate(UserAccount account) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
    }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    private UUID label(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into labels(id,name,normalized_name,color,active,version,created_at,updated_at) values(?,?,?,'blue',true,0,?::timestamptz,?::timestamptz)",
                id, name, name.toLowerCase(java.util.Locale.ROOT), "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"); return id;
    }
}
