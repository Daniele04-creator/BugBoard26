package it.unina.bugboard26.issues;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.api.IssueFilter;
import it.unina.bugboard26.issues.application.CommentService;
import it.unina.bugboard26.issues.application.IssueQueryService;
import it.unina.bugboard26.issues.application.IssueService;
import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Transactional
@Import(IssueTestClock.class)
class IssueProductIntegrationTest {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_issues_test").withUsername("bugboard_owner").withPassword("UserLifecycleIntegrationOnly")
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
    @Autowired IssueRepository issueRepository;
    @Autowired EntityManager entityManager;
    @Autowired CommentService comments;
    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @MockitoSpyBean JdbcTemplate jdbc;
    @Autowired UserService userService;
    private UserAccount admin;
    private UserAccount member;
    private UserAccount other;
    private UserAccount viewer;

    @BeforeEach
    void prepare() {
        admin = account("Admin", UserRole.ADMIN); member = account("Member", UserRole.MEMBER);
        other = account("Other", UserRole.MEMBER); viewer = account("Viewer", UserRole.VIEWER);
        authenticate(admin);
    }
    @AfterEach void clearSecurity() { SecurityContextHolder.clearContext(); }

    @Test
    void creationIsNormalizedTypedAndIdempotentAndConflictDoesNotCreateAnotherIssue() {
        UUID key = UUID.randomUUID();
        var input = new IssueDtos.CreateIssue("  Cafe\u0301 problem  ", "  Detailed reproduction steps  ", IssueType.QUESTION, null, null);
        var created = service.create(input, null, key);
        assertEquals("Café problem", created.title()); assertEquals(Priority.MEDIUM, created.priority());
        assertEquals(IssueStatus.TODO, created.status()); assertEquals(0, created.version());
        assertNull(created.assignee()); assertFalse(created.archived());
        var replay = service.create(input, null, key); assertEquals(created, replay);
        assertEquals(1, count("issues")); assertEquals(1, count("issue_events"));
        var invalid = assertThrows(DomainException.class, () -> service.create(new IssueDtos.CreateIssue("Different title",
                "Detailed reproduction steps", IssueType.BUG, null, null), null, key));
        assertEquals("IDEMPOTENCY_KEY_REUSED", invalid.code()); assertEquals(1, count("issues"));
    }

    @Test
    void reporterCannotEditButAssignedMemberCanAndStaleWritesHaveNoEffects() {
        authenticate(member); var issue = create(); UUID issueId = issue.id();
        var update = new IssueDtos.UpdateIssue("Edited title", "Edited detailed description", IssueType.FEATURE, Priority.HIGH, List.of(), 0L);
        assertEquals("FORBIDDEN", assertThrows(DomainException.class, () -> service.update(issueId, update)).code());
        authenticate(admin); issue = workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L));
        authenticate(member);
        var edited = service.update(issue.id(), new IssueDtos.UpdateIssue("Edited title", "Edited detailed description", IssueType.FEATURE, Priority.HIGH, List.of(), 1L));
        assertEquals(2, edited.version()); assertEquals(IssueType.FEATURE, edited.type());
        long events = count("issue_events");
        UUID id = edited.id();
        assertEquals("VERSION_CONFLICT", assertThrows(DomainException.class, () -> service.update(id, update)).code());
        assertEquals(events, count("issue_events")); assertEquals("Edited title", queries.detail(id).title());
        var noOp = service.update(id, new IssueDtos.UpdateIssue(edited.title(), edited.description(), edited.type(), edited.priority(), List.of(), 2L));
        assertEquals(2, noOp.version()); assertEquals(events, count("issue_events"));
        authenticate(viewer);
        assertEquals("FORBIDDEN", assertThrows(DomainException.class, this::create).code());
        assertFalse(queries.detail(id).permissions().canEdit());
    }

    @Test
    void assignmentWorkflowCreditingNotificationsAndReopenAreAtomic() {
        var issue = create(); UUID id = issue.id();
        assertEquals("INVALID_TRANSITION", assertThrows(DomainException.class,
                () -> workflow.state(id, new IssueDtos.State(IssueStatus.IN_PROGRESS, 0L))).code());
        issue = workflow.assign(id, new IssueDtos.Assignment(member.getId(), 0L));
        assertEquals(1, count("notifications"));
        workflow.assign(id, new IssueDtos.Assignment(member.getId(), 1L)); assertEquals(1, count("notifications"));
        issue = workflow.state(id, new IssueDtos.State(IssueStatus.IN_PROGRESS, 1L));
        Instant cycle = issue.cycleStartedAt();
        issue = workflow.assign(id, new IssueDtos.Assignment(other.getId(), 2L));
        assertEquals(IssueStatus.TODO, issue.status()); assertEquals(cycle, issue.cycleStartedAt());
        issue = workflow.state(id, new IssueDtos.State(IssueStatus.RESOLVED, 3L));
        assertEquals(1, count("resolution_cycles")); assertEquals(3, count("notifications"));
        assertEquals(other.getId(), jdbc.queryForObject("select credited_assignee_id from resolution_cycles", UUID.class));
        assertEquals(admin.getId(), jdbc.queryForObject("select resolved_by_id from resolution_cycles", UUID.class));
        assertTrue(jdbc.queryForObject("select duration_seconds>=0 from resolution_cycles", Boolean.class));
        workflow.state(id, new IssueDtos.State(IssueStatus.RESOLVED, 4L)); assertEquals(1, count("resolution_cycles"));
        issue = workflow.state(id, new IssueDtos.State(IssueStatus.TODO, 4L)); assertNull(issue.resolvedAt());
        workflow.state(id, new IssueDtos.State(IssueStatus.RESOLVED, 5L)); assertEquals(2, count("resolution_cycles"));
        assertEquals(4, count("notifications"));
    }

    @Test
    void commentsPreserveVersionAndLastActivityAndAreIdempotentForAnyMember() {
        var issue = create(); authenticate(other); UUID key = UUID.randomUUID();
        var comment = comments.create(issue.id(), new IssueDtos.CreateComment("  Useful investigation  "), key);
        assertEquals("Useful investigation", comment.body());
        assertEquals(comment, comments.create(issue.id(), new IssueDtos.CreateComment("Useful investigation"), key));
        assertEquals(0, queries.detail(issue.id()).version()); assertEquals(1, count("comments")); assertEquals(2, count("issue_events"));
        assertEquals(1, comments.comments(issue.id(), 0, 20).totalElements());
        assertEquals(2, comments.history(issue.id(), 0, 20).totalElements());
        authenticate(admin); workflow.archive(issue.id(), new IssueDtos.Archive(true, 0L));
        authenticate(other);
        assertEquals(comment, comments.create(issue.id(), new IssueDtos.CreateComment("Useful investigation"), key));
        assertEquals(1, count("comments")); assertEquals(3, count("issue_events"));
        assertEquals("ISSUE_READ_ONLY", assertThrows(DomainException.class,
                () -> comments.create(issue.id(), new IssueDtos.CreateComment("Archived discussion"), UUID.randomUUID())).code());
    }

    @Test
    void commentPagesPreserveChronologyAndCurrentAuthorsWithoutPerAuthorQueries() {
        var discussion = discussionWithThreeAuthors();
        List<IssueDtos.CommentRef> expected = discussion.comments();
        assertEquals(1, expected.stream().map(IssueDtos.CommentRef::createdAt).distinct().count());
        assertEquals(expected.stream().map(IssueDtos.CommentRef::sequence).sorted().toList(),
                expected.stream().map(IssueDtos.CommentRef::sequence).toList());

        var first = readDiscussionPage(() -> comments.comments(discussion.issueId(), 0, 1));
        assertEquals(List.of(expected.getFirst()), first.items()); assertEquals(3, first.totalElements());
        assertEquals(0, first.page()); assertEquals(1, first.size()); assertEquals(3, first.totalPages());
        var complete = readDiscussionPage(() -> comments.comments(discussion.issueId(), 0, 20));
        assertEquals(expected, complete.items()); assertEquals(3, complete.totalElements());
        assertEquals(1, complete.totalPages());
        var next = readDiscussionPage(() -> comments.comments(discussion.issueId(), 1, 2));
        assertEquals(List.of(expected.getLast()), next.items()); assertEquals(3, next.totalElements());
        assertEquals(1, next.page()); assertEquals(2, next.size()); assertEquals(2, next.totalPages());
        var empty = readDiscussionPage(() -> comments.comments(discussion.issueId(), 3, 1));
        assertTrue(empty.items().isEmpty()); assertEquals(3, empty.totalElements());
        authenticate(admin); var withoutComments = create(); authenticate(viewer);
        var noMatches = readDiscussionPage(() -> comments.comments(withoutComments.id(), 0, 20));
        assertTrue(noMatches.items().isEmpty()); assertEquals(0, noMatches.totalElements());
    }

    @Test
    void historyPagesPreserveChronologyJsonAndCurrentActorsWithoutPerActorQueries() {
        var discussion = discussionWithThreeAuthors();
        var complete = readDiscussionPage(() -> comments.history(discussion.issueId(), 0, 20));
        List<IssueDtos.IssueEvent> expected = complete.items();
        assertEquals(4, complete.totalElements()); assertEquals(4, expected.size());
        assertEquals(1, expected.stream().map(IssueDtos.IssueEvent::occurredAt).distinct().count());
        assertEquals(expected.stream().map(IssueDtos.IssueEvent::eventSequence).sorted().toList(),
                expected.stream().map(IssueDtos.IssueEvent::eventSequence).toList());
        var created = expected.getFirst();
        assertEquals("ISSUE_CREATED", created.eventType()); assertEquals(0L, created.issueVersion());
        assertEquals(UserDtos.ref(admin), created.actor()); assertEquals(discussion.issueId(), created.issueId());
        assertEquals("Product issue", created.snapshot().get("title"));
        assertEquals(admin.getId().toString(), created.snapshot().get("reporterId"));
        assertNull(created.snapshot().get("assigneeId"));
        for (int index = 0; index < discussion.comments().size(); index++) {
            var comment = discussion.comments().get(index); var event = expected.get(index + 1);
            assertEquals(comment.author(), event.actor()); assertEquals("COMMENT_ADDED", event.eventType());
            assertEquals(comment.createdAt(), event.occurredAt()); assertEquals(discussion.issueId(), event.issueId());
            assertNull(event.issueVersion()); assertNull(event.snapshot());
            Map<String, Object> change = new java.util.LinkedHashMap<>();
            change.put("before", null); change.put("after", comment.id().toString());
            assertEquals(Map.of("commentId", change), event.changes());
        }
        var first = readDiscussionPage(() -> comments.history(discussion.issueId(), 0, 1));
        assertEquals(List.of(expected.getFirst()), first.items()); assertEquals(4, first.totalElements());
        assertEquals(0, first.page()); assertEquals(1, first.size()); assertEquals(4, first.totalPages());
        var next = readDiscussionPage(() -> comments.history(discussion.issueId(), 1, 2));
        assertEquals(expected.subList(2, 4), next.items()); assertEquals(4, next.totalElements());
        assertEquals(1, next.page()); assertEquals(2, next.size()); assertEquals(2, next.totalPages());
        var empty = readDiscussionPage(() -> comments.history(discussion.issueId(), 4, 1));
        assertTrue(empty.items().isEmpty()); assertEquals(4, empty.totalElements());
    }

    @Test
    void duplicateRulesPreventChainsSelfReferencesAndIncomingCanonicalMutation() {
        var source = create(); var canonical = create(); var third = create();
        assertEquals("DUPLICATE_CONFLICT", assertThrows(DomainException.class,
                () -> workflow.duplicate(source.id(), new IssueDtos.Duplicate(source.id(), 0L))).code());
        var duplicate = workflow.duplicate(source.id(), new IssueDtos.Duplicate(canonical.id(), 0L));
        assertEquals(IssueStatus.DUPLICATE, duplicate.status()); assertNull(duplicate.resolvedAt()); assertEquals(0, count("resolution_cycles"));
        assertEquals("DUPLICATE_CONFLICT", assertThrows(DomainException.class,
                () -> workflow.duplicate(canonical.id(), new IssueDtos.Duplicate(third.id(), 0L))).code());
        assertEquals("DUPLICATE_CONFLICT", assertThrows(DomainException.class,
                () -> workflow.duplicate(third.id(), new IssueDtos.Duplicate(source.id(), 0L))).code());
        workflow.archive(canonical.id(), new IssueDtos.Archive(true, 0L));
        assertEquals(canonical.id(), queries.detail(source.id()).duplicateOf().id());
        var restored = workflow.duplicate(source.id(), new IssueDtos.Duplicate(null, 1L));
        assertEquals(IssueStatus.TODO, restored.status()); assertNull(restored.duplicateOf());
    }

    @Test
    void restoreRemovesIneligibleHistoricalAssigneeAndForcesTodo() {
        var issue = create(); workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L));
        workflow.state(issue.id(), new IssueDtos.State(IssueStatus.IN_PROGRESS, 1L));
        workflow.archive(issue.id(), new IssueDtos.Archive(true, 2L));
        jdbc.update("update user_accounts set active=false,auth_version=auth_version+1 where id=?", member.getId());
        var restored = workflow.archive(issue.id(), new IssueDtos.Archive(false, 3L));
        assertEquals(IssueStatus.TODO, restored.status()); assertNull(restored.assignee()); assertFalse(restored.archived());
        assertEquals(5, count("issue_events"));
    }

    @Test
    void deadlinePermissionsBoundsAndReadOnlyArchiveAreEnforced() {
        var issue = create(); LocalDate today = LocalDate.of(2026, 2, 10);
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                () -> workflow.deadline(issue.id(), new IssueDtos.Deadline(today.minusDays(1), 0L))).code());
        var due = workflow.deadline(issue.id(), new IssueDtos.Deadline(today, 0L)); assertEquals(today, due.dueDate());
        assertEquals(1, workflow.deadline(issue.id(), new IssueDtos.Deadline(today, 1L)).version());
        authenticate(member);
        assertEquals("FORBIDDEN", assertThrows(DomainException.class,
                () -> workflow.deadline(issue.id(), new IssueDtos.Deadline(null, 1L))).code());
        authenticate(admin); workflow.archive(issue.id(), new IssueDtos.Archive(true, 1L));
        assertEquals("ISSUE_READ_ONLY", assertThrows(DomainException.class,
                () -> workflow.deadline(issue.id(), new IssueDtos.Deadline(null, 2L))).code());
        authenticate(viewer); assertTrue(queries.detail(issue.id()).archived());
    }

    @Test
    void filtersEscapeWildcardsNormalizeUnicodeAndMaintainTotalsAndSort() {
        service.create(new IssueDtos.CreateIssue("Café 100% failure", "Description with literal underscore _", IssueType.BUG, Priority.CRITICAL, List.of()), null, UUID.randomUUID());
        service.create(new IssueDtos.CreateIssue("Café unrelated", "Detailed documentation request", IssueType.DOCUMENTATION, Priority.LOW, List.of()), null, UUID.randomUUID());
        assertEquals(1, queries.list(filter("q", "%")).totalElements());
        assertEquals(1, queries.list(filter("q", "_")).totalElements());
        assertEquals(2, queries.list(filter("q", "CAFE\u0301")).totalElements());
        assertEquals(0, queries.list(filter("q", "cafe")).totalElements());
        var page = queries.list(filter("page", "5", "size", "1")); assertEquals(2, page.totalElements()); assertTrue(page.items().isEmpty());
        var sorted = queries.list(filter("sort", "priority,desc")); assertEquals(Priority.CRITICAL, sorted.items().getFirst().priority());
        assertEquals(2, queries.exportRows(filter(), 10000).size());
        assertEquals("EXPORT_LIMIT_EXCEEDED", assertThrows(DomainException.class, () -> queries.exportRows(filter(), 1)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class, () -> filter("unknown", "x")).code());
    }

    @Test
    void listProjectionPreservesReferencesLabelsImagesAndUsesThreeQueriesPerPage() {
        UUID alpha = UUID.randomUUID(); UUID zeta = UUID.randomUUID();
        for (UUID id : List.of(zeta, alpha)) {
            String name = id.equals(alpha) ? "Alpha" : "Zeta";
            jdbc.update("insert into labels(id,name,normalized_name,color,active,version,created_at,updated_at) "
                            + "values(?,?,?,'blue',true,0,?::timestamptz,?::timestamptz)",
                    id, name, name.toLowerCase(java.util.Locale.ROOT), "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
        }
        var canonical = create();
        workflow.assign(canonical.id(), new IssueDtos.Assignment(member.getId(), 0L));
        workflow.state(canonical.id(), new IssueDtos.State(IssueStatus.RESOLVED, 1L));
        authenticate(member);
        var duplicate = service.create(new IssueDtos.CreateIssue("Historical duplicate", "Detailed historical reproduction",
                IssueType.FEATURE, Priority.HIGH, List.of(zeta, alpha)), null, UUID.randomUUID());
        authenticate(admin);
        workflow.assign(duplicate.id(), new IssueDtos.Assignment(other.getId(), 0L));
        workflow.deadline(duplicate.id(), new IssueDtos.Deadline(LocalDate.of(2026, 2, 11), 1L));
        service.image(duplicate.id(), new IssueImage(UUID.randomUUID(), "capture.png", "image/png",
                new byte[]{1, 2, 3}, 1, 1, "a".repeat(64)), 2L);
        workflow.duplicate(duplicate.id(), new IssueDtos.Duplicate(canonical.id(), 3L));
        UserAccount archiver = account("Historical admin", UserRole.ADMIN);
        authenticate(archiver);
        workflow.archive(duplicate.id(), new IssueDtos.Archive(true, 4L));
        authenticate(admin);
        jdbc.update("update labels set active=false,version=version+1 where id=?", alpha);
        jdbc.update("update user_accounts set active=false,auth_version=auth_version+1 where id in (?,?,?)",
                member.getId(), other.getId(), archiver.getId());
        entityManager.clear();
        var expectedDuplicate = queries.summary(issueRepository.find(duplicate.id()));
        var expectedCanonical = queries.summary(issueRepository.find(canonical.id()));
        assertFalse(expectedDuplicate.reporter().active());
        assertFalse(expectedDuplicate.assignee().active());
        assertFalse(expectedDuplicate.archivedBy().active());
        assertEquals(List.of(alpha, zeta), expectedDuplicate.labels().stream().map(IssueDtos.LabelRef::id).toList());
        assertFalse(expectedDuplicate.labels().getFirst().active());
        assertTrue(expectedDuplicate.hasImage());
        assertNotNull(expectedCanonical.resolvedAt());

        clearInvocations(jdbc);
        var first = queries.list(filter("archived", "all", "sort", "number,asc", "size", "1"));
        assertEquals(List.of(expectedCanonical), first.items()); assertEquals(2, first.totalElements());
        verify(jdbc, times(3)).query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
        clearInvocations(jdbc);
        var complete = queries.list(filter("archived", "all", "sort", "number,asc"));
        assertEquals(List.of(expectedCanonical, expectedDuplicate), complete.items());
        verify(jdbc, times(3)).query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
        assertEquals(List.of(expectedDuplicate), queries.list(filter("archived", "all", "page", "1", "size", "1",
                "sort", "number,asc")).items());
        clearInvocations(jdbc);
        var empty = queries.list(filter("archived", "all", "page", "5", "size", "1"));
        assertEquals(2, empty.totalElements()); assertTrue(empty.items().isEmpty());
        verify(jdbc, times(2)).query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
        var noMatches = queries.list(filter("q", "No matching issue"));
        assertEquals(0, noMatches.totalElements()); assertTrue(noMatches.items().isEmpty());
    }

    @Test
    void imageReplacementNoOpAndRemovalRespectVersions() {
        var issue = create(); byte[] bytes = new byte[]{1, 2, 3};
        assertNull(queries.detail(issue.id()).image());
        IssueImage image = new IssueImage(UUID.randomUUID(), "capture.png", "image/png", bytes, 1, 1, "a".repeat(64));
        var changed = service.image(issue.id(), image, 0L); assertTrue(changed.hasImage()); assertEquals(1, changed.version());
        assertEquals(IssueQueryService.imageRef(image), changed.image());
        assertEquals(changed.image(), queries.detail(issue.id()).image());
        assertEquals(1, service.image(issue.id(), image, 1L).version());
        assertEquals(2, service.image(issue.id(), null, 1L).version());
        assertEquals(2, service.image(issue.id(), null, 2L).version()); assertEquals(3, count("issue_events"));
        assertNull(queries.detail(issue.id()).image()); assertFalse(queries.detail(issue.id()).hasImage());
    }

    @Test
    void twentyLabelsAllowedDuplicatesRejectedAndInactiveExistingAssociationsPreserved() {
        List<UUID> ids = new java.util.ArrayList<>();
        for (int index = 0; index < 21; index++) {
            UUID id = UUID.randomUUID(); ids.add(id);
            jdbc.update("insert into labels(id,name,normalized_name,color,active,version,created_at,updated_at) values(?,?,?,'blue',true,0,?::timestamptz,?::timestamptz)",
                    id, "Label " + index, "label " + index, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
        }
        List<UUID> twenty = List.copyOf(ids.subList(0, 20));
        var issue = service.create(new IssueDtos.CreateIssue("Many labels issue", "Detailed issue with twenty labels", IssueType.FEATURE, Priority.HIGH, twenty), null, UUID.randomUUID());
        assertEquals(20, issue.labels().size());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () -> service.create(
                new IssueDtos.CreateIssue("Many labels issue", "Detailed issue with too many labels", IssueType.FEATURE, Priority.HIGH, ids), null, UUID.randomUUID())).code());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () -> service.create(
                new IssueDtos.CreateIssue("Repeated label", "Detailed issue with repeated label", IssueType.BUG, null, List.of(ids.getFirst(), ids.getFirst())), null, UUID.randomUUID())).code());
        jdbc.update("update labels set active=false,version=version+1 where id=?", ids.getFirst());
        var unchanged = service.update(issue.id(), new IssueDtos.UpdateIssue(issue.title(), issue.description(), issue.type(), issue.priority(), twenty, 0L));
        assertEquals(0, unchanged.version()); assertFalse(unchanged.labels().stream().filter(label -> label.id().equals(ids.getFirst())).findFirst().orElseThrow().active());
        jdbc.update("update labels set active=false,version=version+1 where id=?", ids.getLast());
        List<UUID> replacement = new java.util.ArrayList<>(twenty); replacement.set(0, ids.getLast());
        authenticate(other);
        assertEquals("FORBIDDEN", assertThrows(DomainException.class, () -> service.update(issue.id(),
                new IssueDtos.UpdateIssue(issue.title(), issue.description(), issue.type(), issue.priority(), replacement, 0L))).code());
        authenticate(admin);
        assertEquals("LABEL_NOT_ACTIVE", assertThrows(DomainException.class, () -> service.update(issue.id(),
                new IssueDtos.UpdateIssue(issue.title(), issue.description(), issue.type(), issue.priority(), replacement, 0L))).code());
        assertEquals(1, count("issue_events")); assertEquals(20, queries.detail(issue.id()).labels().size());
    }

    @Test
    void resetPreservesExistingAssignmentAndSameAssignmentNoOpWithoutAllowingNewWork() {
        var issue = create(); var assigned = workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L));
        userService.resetPassword(member.getId(), new UserDtos.ResetPassword("Synthetic replacement password", member.getVersion()));
        long eventCount = count("issue_events"); long notificationCount = count("notifications");
        var noOp = workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 1L));
        assertEquals(assigned.version(), noOp.version()); assertEquals(assigned.updatedAt(), noOp.updatedAt());
        assertEquals(member.getId(), noOp.assignee().id()); assertTrue(noOp.permissions().allowedStateTargets().isEmpty());
        assertEquals(eventCount, count("issue_events")); assertEquals(notificationCount, count("notifications"));
        assertEquals("VERSION_CONFLICT", assertThrows(DomainException.class,
                () -> workflow.assign(issue.id(), new IssueDtos.Assignment(member.getId(), 0L))).code());
        var unassigned = create();
        assertEquals("ASSIGNEE_NOT_ELIGIBLE", assertThrows(DomainException.class,
                () -> workflow.assign(unassigned.id(), new IssueDtos.Assignment(member.getId(), 0L))).code());
    }

    private Discussion discussionWithThreeAuthors() {
        var issue = create(); List<IssueDtos.CommentRef> created = new java.util.ArrayList<>();
        for (UserAccount author : List.of(admin, member, other)) {
            authenticate(author);
            created.add(comments.create(issue.id(), new IssueDtos.CreateComment("Investigation by " + author.getDisplayName()), UUID.randomUUID()));
        }
        jdbc.update("update user_accounts set display_name='Renamed author',role='VIEWER',active=false,auth_version=auth_version+1 where id=?", other.getId());
        authenticate(viewer);
        List<IssueDtos.CommentRef> expected = created.stream().map(comment -> new IssueDtos.CommentRef(comment.id(),
                comment.issueId(), comment.author().id().equals(other.getId())
                        ? new UserDtos.UserRef(other.getId(), "Renamed author", UserRole.VIEWER, false) : comment.author(),
                comment.body(), comment.createdAt(), comment.sequence())).toList();
        return new Discussion(issue.id(), expected);
    }

    private <T> T readDiscussionPage(Supplier<T> read) {
        entityManager.clear();
        Statistics statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled(); statistics.setStatisticsEnabled(true); statistics.clear();
        clearInvocations(jdbc);
        try {
            T page = read.get();
            assertEquals(1, statistics.getPrepareStatementCount(), "Only the authenticated user needs an ORM lookup");
            verify(jdbc, times(3)).query(any(PreparedStatementCreator.class), any(PreparedStatementSetter.class), any(ResultSetExtractor.class));
            return page;
        } finally { statistics.setStatisticsEnabled(enabled); }
    }

    private record Discussion(UUID issueId, List<IssueDtos.CommentRef> comments) { }

    private IssueDtos.IssueDetail create() {
        return service.create(new IssueDtos.CreateIssue("Product issue", "Detailed reproduction instructions", IssueType.BUG, Priority.MEDIUM, List.of()), null, UUID.randomUUID());
    }
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
    private IssueFilter filter(String... parameters) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        for (int i = 0; i < parameters.length; i += 2) { request.addParameter(parameters[i], parameters[i + 1]); }
        return IssueFilter.parse(request, admin.getId(), true);
    }
}
