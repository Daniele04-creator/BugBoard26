package it.unina.bugboard26.issues;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.api.IssueFilter;
import it.unina.bugboard26.issues.application.AssignmentLookupAdapter;
import it.unina.bugboard26.issues.application.IssueEventWriter;
import it.unina.bugboard26.issues.application.IssueExportService;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.labels.application.LabelService;
import it.unina.bugboard26.labels.persistence.LabelEventRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
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
class IssueVerificationGapsIntegrationTest {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_issue_verification_gaps").withUsername("bugboard_owner")
            .withPassword("UserLifecycleIntegrationOnly").withInitScript("users-init.sql");

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
    @Autowired IssueExportService exports;
    @Autowired UserService userService;
    @Autowired LabelService labelService;
    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @MockitoSpyBean IssueEventWriter events;
    @MockitoSpyBean AssignmentLookupAdapter assignments;
    @MockitoSpyBean LabelEventRepository labelEvents;
    @MockitoSpyBean JdbcTemplate jdbc;
    private UserAccount admin;
    private UserAccount secondAdmin;
    private UserAccount member;
    private UserAccount other;

    @BeforeEach
    void setup() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("SET session_replication_role=replica");
            statement.execute("TRUNCATE user_accounts,labels,spring_session,login_attempts CASCADE");
            statement.execute("SET session_replication_role=origin");
        }
        admin = account("First admin", UserRole.ADMIN);
        secondAdmin = account("Second admin", UserRole.ADMIN);
        member = account("Member", UserRole.MEMBER);
        other = account("Other member", UserRole.MEMBER);
        authenticate(admin);
    }

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void formerAssigneeCannotResolveAfterReassignmentCommits() throws Exception {
        var created = create();
        var assigned = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        Gate gate = pauseIssueEvent("ASSIGNMENT_CHANGED");
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Object> reassigned = submit(executor, admin,
                    () -> workflow.assign(assigned.id(), new IssueDtos.Assignment(other.getId(), 1L)));
            gate.awaitEntered();
            Future<Object> resolved = submit(executor, member,
                    () -> workflow.state(assigned.id(), new IssueDtos.State(IssueStatus.RESOLVED, 1L)));
            awaitDatabaseWaiter();
            gate.release();
            assertInstanceOf(IssueDtos.IssueDetail.class, result(reassigned));
            assertProblem(result(resolved), 403, "FORBIDDEN");
        } finally { gate.release(); }
        var current = queries.detail(assigned.id());
        assertEquals(other.getId(), current.assignee().id());
        assertEquals(IssueStatus.TODO, current.status());
        assertEquals(2, current.version());
        assertEquals(0, count("resolution_cycles"));
        assertEquals(3, count("issue_events"));
        assertEquals(2, count("notifications"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void assignmentAndDeactivationProveBothLockOrders(boolean assignmentFirst) throws Exception {
        var created = create();
        Gate gate = assignmentFirst ? pauseIssueEvent("ASSIGNMENT_CHANGED") : pauseAssignmentCheck();
        Supplier<?> assign = () -> workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        Supplier<?> deactivate = () -> userService.update(member.getId(),
                new UserDtos.UpdateUser(member.getDisplayName(), UserRole.MEMBER, false, member.getVersion()));
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Object> first = submit(executor, assignmentFirst ? admin : secondAdmin, assignmentFirst ? assign : deactivate);
            gate.awaitEntered();
            Future<Object> second = submit(executor, assignmentFirst ? secondAdmin : admin, assignmentFirst ? deactivate : assign);
            awaitDatabaseWaiter();
            gate.release();
            Object winner = result(first);
            if (assignmentFirst) { assertInstanceOf(IssueDtos.IssueDetail.class, winner); }
            else { assertInstanceOf(UserDtos.UserAdmin.class, winner); }
            assertProblem(result(second), 409, assignmentFirst ? "OPEN_ASSIGNMENTS_EXIST" : "ASSIGNEE_NOT_ELIGIBLE");
        } finally { gate.release(); }
        var current = queries.detail(created.id());
        assertEquals(assignmentFirst ? member.getId() : null, current.assignee() == null ? null : current.assignee().id());
        assertEquals(assignmentFirst, users.findById(member.getId()).orElseThrow().isActive());
        assertEquals(assignmentFirst ? 1 : 0, current.version());
        assertEquals(assignmentFirst ? 2 : 1, count("issue_events"));
        assertEquals(assignmentFirst ? 1 : 0, count("notifications"));
        assertEquals(0, jdbc.queryForObject("select count(*) from issues i join user_accounts u on u.id=i.assignee_id "
                + "where not i.archived and i.status in ('TODO','IN_PROGRESS') and not u.active", Integer.class));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void archiveAndEditProveBothLockOrders(boolean archiveFirst) throws Exception {
        var created = create();
        var assigned = workflow.assign(created.id(), new IssueDtos.Assignment(member.getId(), 0L));
        Gate gate = pauseIssueEvent(archiveFirst ? "ARCHIVED" : "FIELDS_UPDATED");
        Supplier<?> archive = () -> workflow.archive(assigned.id(), new IssueDtos.Archive(true, 1L));
        Supplier<?> edit = () -> service.update(assigned.id(), update(assigned, List.of(), 1L));
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Object> first = submit(executor, archiveFirst ? admin : member, archiveFirst ? archive : edit);
            gate.awaitEntered();
            Future<Object> second = submit(executor, archiveFirst ? member : admin, archiveFirst ? edit : archive);
            awaitDatabaseWaiter();
            gate.release();
            assertInstanceOf(IssueDtos.IssueDetail.class, result(first));
            assertProblem(result(second), 409, archiveFirst ? "ISSUE_READ_ONLY" : "VERSION_CONFLICT");
        } finally { gate.release(); }
        var current = queries.detail(assigned.id());
        assertEquals(archiveFirst, current.archived());
        assertEquals(archiveFirst ? created.title() : "Edited verification issue", current.title());
        assertEquals(2, current.version());
        assertEquals(3, count("issue_events"));
        assertEquals(1, count("notifications"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void labelDeactivationAndNewAssociationProveBothLockOrders(boolean associationFirst) throws Exception {
        var created = create();
        var label = labelService.create(new LabelDtos.CreateLabel("Race label", "blue"));
        Gate gate = associationFirst ? pauseIssueEvent("FIELDS_UPDATED") : pauseLabelEvent();
        Supplier<?> associate = () -> service.update(created.id(), update(created, List.of(label.id()), 0L));
        Supplier<?> deactivate = () -> labelService.update(label.id(), new LabelDtos.UpdateLabel(label.name(), label.color(), false, 0L));
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Object> first = submit(executor, associationFirst ? admin : secondAdmin, associationFirst ? associate : deactivate);
            gate.awaitEntered();
            Future<Object> second = submit(executor, associationFirst ? secondAdmin : admin, associationFirst ? deactivate : associate);
            awaitDatabaseWaiter();
            gate.release();
            Object winner = result(first);
            if (associationFirst) { assertInstanceOf(IssueDtos.IssueDetail.class, winner); }
            else { assertInstanceOf(LabelDtos.Label.class, winner); }
            if (associationFirst) { assertInstanceOf(LabelDtos.Label.class, result(second)); }
            else { assertProblem(result(second), 409, "LABEL_NOT_ACTIVE"); }
        } finally { gate.release(); }
        var current = queries.detail(created.id());
        assertEquals(associationFirst ? List.of(label.id()) : List.of(), current.labels().stream().map(IssueDtos.LabelRef::id).toList());
        assertFalse(jdbc.queryForObject("select active from labels where id=?", Boolean.class, label.id()));
        assertEquals(associationFirst ? 1 : 0, current.version());
        assertEquals(associationFirst ? 2 : 1, count("issue_events"));
        assertEquals(2, count("label_events"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void listAndExportKeepOneSnapshotWhenArchiveCommitsAfterCount(boolean export) throws Exception {
        var created = create();
        Gate gate = new Gate();
        AtomicReference<Thread> reader = new AtomicReference<>();
        AtomicBoolean firstCount = new AtomicBoolean(true);
        doAnswer(invocation -> {
            Object value = invocation.callRealMethod();
            if (Thread.currentThread() == reader.get() && value instanceof List<?> rows
                    && rows.size() == 1 && rows.getFirst() instanceof Long && firstCount.compareAndSet(true, false)) {
                gate.pause();
            }
            return value;
        }).when(jdbc).query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Object> response = submit(executor, secondAdmin, () -> {
                reader.set(Thread.currentThread());
                return export ? exports.export(filter()) : queries.list(filter());
            });
            gate.awaitEntered();
            Future<Object> archive = submit(executor, admin, () -> workflow.archive(created.id(), new IssueDtos.Archive(true, 0L)));
            assertInstanceOf(IssueDtos.IssueDetail.class, result(archive));
            gate.release();
            Object snapshot = result(response);
            if (export) {
                var file = assertInstanceOf(IssueExportService.ExportFile.class, snapshot);
                String csv = new String(file.bytes(), StandardCharsets.UTF_8);
                assertEquals(3, csv.split("\r\n", -1).length);
                assertTrue(csv.contains("\"Verification issue\""));
                assertTrue(csv.contains("\"false\",\"\"\r\n"));
            } else {
                var page = assertInstanceOf(PageResponse.class, snapshot);
                assertEquals(1, page.totalElements());
                assertEquals(1, page.items().size());
                var row = assertInstanceOf(IssueDtos.IssueSummary.class, page.items().getFirst());
                assertEquals(created.id(), row.id());
                assertFalse(row.archived());
                assertEquals(0, row.version());
            }
        } finally { gate.release(); }
        assertTrue(queries.detail(created.id()).archived());
        assertEquals(0, queries.list(filter()).totalElements());
    }

    private Gate pauseIssueEvent(String type) {
        Gate gate = new Gate();
        doAnswer(invocation -> { gate.pause(); return invocation.callRealMethod(); }).when(events)
                .write(any(Issue.class), any(Actor.class), eq(type), anyMap(), nullable(Map.class), any(Instant.class));
        return gate;
    }

    private Gate pauseAssignmentCheck() {
        Gate gate = new Gate();
        doAnswer(invocation -> { gate.pause(); return invocation.callRealMethod(); }).when(assignments).hasOpenAssignments(member.getId());
        return gate;
    }

    private Gate pauseLabelEvent() {
        Gate gate = new Gate();
        doAnswer(invocation -> { gate.pause(); return invocation.callRealMethod(); }).when(labelEvents)
                .insert(any(UUID.class), any(UUID.class), any(Instant.class), eq("LABEL_UPDATED"), anyList());
        return gate;
    }

    private void awaitDatabaseWaiter() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() "
                    + "and wait_event_type='Lock'", Integer.class) > 0) { return; }
            Thread.yield();
        }
        fail("The second real database transaction did not reach the held lock");
    }

    private Future<Object> submit(ExecutorService executor, UserAccount actor, Supplier<?> command) {
        return executor.submit(() -> {
            authenticate(actor);
            try { return command.get(); }
            catch (DomainException exception) { return exception; }
            finally { SecurityContextHolder.clearContext(); }
        });
    }

    private Object result(Future<Object> task) throws Exception { return task.get(10, TimeUnit.SECONDS); }
    private void assertProblem(Object value, int status, String code) {
        DomainException problem = assertInstanceOf(DomainException.class, value);
        assertEquals(status, problem.status()); assertEquals(code, problem.code());
    }
    private IssueDtos.IssueDetail create() {
        return service.create(new IssueDtos.CreateIssue("Verification issue", "Detailed verification instructions",
                IssueType.BUG, Priority.MEDIUM, List.of()), null, UUID.randomUUID());
    }
    private IssueDtos.UpdateIssue update(IssueDtos.IssueDetail issue, List<UUID> labels, long version) {
        return new IssueDtos.UpdateIssue("Edited verification issue", issue.description(), issue.type(), issue.priority(), labels, version);
    }
    private IssueFilter filter() { return IssueFilter.parse(new MockHttpServletRequest(), admin.getId(), true); }
    private UserAccount account(String name, UserRole role) {
        UserAccount account = new UserAccount(UUID.randomUUID(), UUID.randomUUID() + "@example.test", name,
                passwords.encode("Synthetic password 2026"), role, Instant.parse("2026-01-01T00:00:00Z"));
        account.replacePassword(account.getPasswordHash(), false, Instant.parse("2026-01-01T00:01:00Z"));
        return users.saveAndFlush(account);
    }
    private void authenticate(UserAccount account) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AuthPrincipal(account.getId(), account.getAuthVersion()), null, List.of()));
    }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }

    private static final class Gate {
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);
        void pause() throws InterruptedException { entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); }
        void awaitEntered() throws InterruptedException { assertTrue(entered.await(10, TimeUnit.SECONDS)); }
        void release() { release.countDown(); }
    }
}
