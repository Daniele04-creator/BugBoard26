package it.unina.bugboard26.issues.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class WorkflowPolicyTest {
    private static final UUID ADMIN = new UUID(0, 1);
    private static final UUID MEMBER = new UUID(0, 2);
    private static final UUID REPORTER = new UUID(0, 3);
    private static final Instant START = Instant.parse("2026-02-01T09:00:00Z");
    private final WorkflowPolicy policy = new WorkflowPolicy();

    static Stream<Arguments> transitions() {
        return Stream.of(IssueStatus.values()).flatMap(source -> Stream.of(IssueStatus.values())
                .flatMap(target -> Stream.of(UserRole.ADMIN, UserRole.MEMBER)
                        .map(role -> Arguments.of(source, target, role))));
    }

    @ParameterizedTest
    @MethodSource("transitions")
    void checksCompleteTransitionTable(IssueStatus source, IssueStatus target, UserRole role) {
        IssueSnapshot original = snapshot(source, true, UserRole.MEMBER, false, false, MEMBER);
        Actor actor = new Actor(role == UserRole.ADMIN ? ADMIN : MEMBER, role, true, false, 0);
        boolean legal = source != IssueStatus.DUPLICATE && target != IssueStatus.DUPLICATE
                && (source != IssueStatus.RESOLVED || target == IssueStatus.RESOLVED || target == IssueStatus.TODO);
        if (!legal) {
            DomainException failure = assertThrows(DomainException.class,
                    () -> policy.transition(original, target, actor, START.plusSeconds(100)));
            assertEquals(409, failure.status());
            assertEquals("INVALID_TRANSITION", failure.code());
            return;
        }
        TransitionResult result = policy.transition(original, target, actor, START.plusSeconds(100));
        if (source == target) {
            assertSame(original, result.snapshot());
            assertFalse(result.changed());
            assertFalse(result.notifyReporter());
            assertNull(result.resolutionCycle());
            assertNull(result.resolvedBy());
            return;
        }
        assertTrue(result.changed());
        assertEquals(target, result.snapshot().status());
        assertEquals(original.version() + 1, result.snapshot().version());
        assertEquals(original.reporterId(), result.snapshot().reporterId());
        assertEquals(MEMBER, result.snapshot().assigneeId());
        assertEquals(source == IssueStatus.RESOLVED ? START.plusSeconds(100) : START,
                result.snapshot().cycleStartedAt());
        if (target == IssueStatus.RESOLVED) {
            assertTrue(result.notifyReporter());
            assertEquals(actor.id(), result.resolvedBy());
            assertEquals(MEMBER, result.resolutionCycle().creditedAssigneeId());
            assertEquals(START, result.resolutionCycle().startedAt());
            assertEquals(START.plusSeconds(100), result.resolutionCycle().resolvedAt());
            assertEquals(START.plusSeconds(100), result.snapshot().resolvedAt());
        } else {
            assertNull(result.snapshot().resolvedAt());
            assertNull(result.resolutionCycle());
            assertNull(result.resolvedBy());
            assertFalse(result.notifyReporter());
        }
    }

    static Stream<Arguments> assigneeAvailability() {
        return Stream.of(UserRole.values()).flatMap(role -> List.of(true, false).stream()
                .flatMap(active -> List.of(true, false).stream()
                        .flatMap(change -> Stream.of(IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED)
                                .map(target -> Arguments.of(role, active, change, target)))));
    }

    @ParameterizedTest
    @MethodSource("assigneeAvailability")
    void requiresEligibleAssigneeToAdvance(UserRole role, boolean active, boolean change,
                                          IssueStatus target) {
        IssueSnapshot original = snapshot(IssueStatus.TODO, active, role, change, false, MEMBER);
        boolean eligible = active && !change && role != UserRole.VIEWER;
        if (eligible) {
            assertEquals(target, policy.transition(original, target, admin(), START).snapshot().status());
        } else {
            assertEquals("ASSIGNEE_NOT_ELIGIBLE", assertThrows(DomainException.class,
                    () -> policy.transition(original, target, admin(), START)).code());
        }
    }

    @Test
    void missingAssigneeCannotAdvance() {
        for (IssueStatus target : List.of(IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED)) {
            assertEquals("ASSIGNEE_NOT_ELIGIBLE", assertThrows(DomainException.class,
                    () -> policy.transition(snapshot(IssueStatus.TODO, false, null, false, false, null),
                            target, admin(), START)).code());
        }
    }

    @ParameterizedTest
    @MethodSource("assigneeAvailability")
    void reopeningClearsOnlyUnavailableAssignee(UserRole role, boolean active, boolean change,
                                               IssueStatus ignoredTarget) {
        IssueSnapshot original = snapshot(IssueStatus.RESOLVED, active, role, change, false, MEMBER);
        TransitionResult result = policy.transition(original, IssueStatus.TODO, admin(), START.plusSeconds(10));
        boolean eligible = active && !change && role != UserRole.VIEWER;
        assertEquals(eligible ? MEMBER : null, result.snapshot().assigneeId());
        assertEquals(START.plusSeconds(10), result.snapshot().cycleStartedAt());
        assertNull(result.snapshot().resolvedAt());
        assertNull(result.resolutionCycle());
        assertFalse(result.notifyReporter());
    }

    @Test
    void allowsSuspensionDuringPasswordReset() {
        IssueSnapshot original = snapshot(IssueStatus.IN_PROGRESS, true, UserRole.MEMBER, true, false, MEMBER);
        TransitionResult result = policy.transition(original, IssueStatus.TODO, admin(), START);
        assertEquals(MEMBER, result.snapshot().assigneeId());
        assertEquals(START, result.snapshot().cycleStartedAt());
    }

    @Test
    void enforcesAuthorityBeforeIssueInvariants() {
        IssueSnapshot original = snapshot(IssueStatus.TODO, true, UserRole.MEMBER, false, false, MEMBER);
        for (Actor denied : List.of(new Actor(REPORTER, UserRole.MEMBER, true, false, 0),
                new Actor(MEMBER, UserRole.VIEWER, true, false, 0),
                new Actor(ADMIN, UserRole.ADMIN, false, false, 0))) {
            assertEquals("FORBIDDEN", assertThrows(DomainException.class,
                    () -> policy.transition(original, IssueStatus.TODO, denied, START)).code());
        }
        Actor reset = new Actor(ADMIN, UserRole.ADMIN, true, true, 0);
        assertEquals("PASSWORD_CHANGE_REQUIRED", assertThrows(DomainException.class,
                () -> policy.transition(original, IssueStatus.TODO, reset, START)).code());
        IssueSnapshot archived = snapshot(IssueStatus.TODO, true, UserRole.MEMBER, false, true, MEMBER);
        assertEquals("ISSUE_READ_ONLY", assertThrows(DomainException.class,
                () -> policy.transition(archived, IssueStatus.TODO, admin(), START)).code());
    }

    @Test
    void usesSuppliedClockAndValidatesItsBoundary() {
        IssueSnapshot original = snapshot(IssueStatus.TODO, true, UserRole.MEMBER, false, false, MEMBER);
        for (Instant now : List.of(START, START.plusSeconds(1))) {
            TransitionResult result = policy.transition(original, IssueStatus.RESOLVED, admin(), now);
            assertEquals(now, result.snapshot().resolvedAt());
            assertEquals(now, result.resolutionCycle().resolvedAt());
        }
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                () -> policy.transition(original, IssueStatus.RESOLVED, admin(), START.minusNanos(1))).code());
        assertThrows(NullPointerException.class, () -> policy.transition(null, IssueStatus.TODO, admin(), START));
        assertThrows(NullPointerException.class, () -> policy.transition(original, null, admin(), START));
        assertThrows(NullPointerException.class, () -> policy.transition(original, IssueStatus.TODO, null, START));
        assertThrows(NullPointerException.class, () -> policy.transition(original, IssueStatus.TODO, admin(), null));
    }

    private Actor admin() {
        return new Actor(ADMIN, UserRole.ADMIN, true, false, 0);
    }

    private IssueSnapshot snapshot(IssueStatus status, boolean active, UserRole role, boolean change,
                                   boolean archived, UUID assignee) {
        return new IssueSnapshot(new UUID(0, 10), status, archived, assignee, REPORTER, 7, START,
                status == IssueStatus.RESOLVED ? START.plusSeconds(1) : null, active, role, change);
    }
}
