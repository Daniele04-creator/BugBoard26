package it.unina.bugboard26.issues.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import it.unina.bugboard26.users.domain.UserRole;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class AssignmentAdvisorTest {
    private static final UUID A = new UUID(0, 1);
    private static final UUID B = new UUID(0, 2);
    private static final UUID C = new UUID(0, 3);
    private final AssignmentAdvisor advisor = new AssignmentAdvisor();

    static Stream<Arguments> loads() {
        return Stream.of(IssueStatus.values()).flatMap(state -> Stream.of(true, false)
                .flatMap(archived -> Stream.of(true, false)
                        .map(excluded -> Arguments.of(state, archived, excluded,
                                (state == IssueStatus.TODO || state == IssueStatus.IN_PROGRESS)
                                        && !archived && !excluded ? 1L : 0L))));
    }

    @ParameterizedTest
    @MethodSource("loads")
    void countsOnlyOpenVisibleAssignmentsExceptSource(IssueStatus state, boolean archived,
                                                      boolean excluded, long expected) {
        UUID issue = new UUID(0, 100);
        assertEquals(List.of(new AssignmentSuggestion(B, expected)), advisor.rank(List.of(candidate(B, "b@x.test")),
                List.of(new OpenIssueAssignment(issue, B, state, archived)), excluded ? issue : null));
    }

    @Test
    void ranksReferenceDatasetAndNeverMutatesInput() {
        List<AssignmentCandidate> candidates = List.of(candidate(B, "b@x.test"), candidate(C, "c@x.test"),
                candidate(A, "a@x.test"), new AssignmentCandidate(new UUID(0, 4), "viewer@x.test", true,
                        UserRole.VIEWER, false));
        List<OpenIssueAssignment> issues = List.of(
                new OpenIssueAssignment(new UUID(0, 5), B, IssueStatus.IN_PROGRESS, false),
                new OpenIssueAssignment(new UUID(0, 6), C, IssueStatus.TODO, true),
                new OpenIssueAssignment(new UUID(0, 7), null, IssueStatus.TODO, false),
                new OpenIssueAssignment(new UUID(0, 8), new UUID(0, 99), IssueStatus.TODO, false));
        List<AssignmentSuggestion> expected = List.of(new AssignmentSuggestion(A, 0),
                new AssignmentSuggestion(C, 0), new AssignmentSuggestion(B, 1));
        assertEquals(expected, advisor.rank(candidates, issues, null));
        List<AssignmentCandidate> reversed = new ArrayList<>(candidates);
        Collections.reverse(reversed);
        List<OpenIssueAssignment> reversedIssues = new ArrayList<>(issues);
        Collections.reverse(reversedIssues);
        assertEquals(expected, advisor.rank(reversed, reversedIssues, null));
        assertEquals(B, candidates.getFirst().id());
        assertThrows(UnsupportedOperationException.class, () -> advisor.rank(candidates, issues, null).clear());
    }

    @Test
    void usesNormalizedEmailThenUuidForTotalOrder() {
        List<AssignmentCandidate> candidates = List.of(candidate(C, "Z@x.test"),
                candidate(B, " a@x.test "), candidate(A, "A@x.test"));
        assertEquals(List.of(new AssignmentSuggestion(A, 0), new AssignmentSuggestion(B, 0),
                new AssignmentSuggestion(C, 0)), advisor.rank(candidates, List.of(), null));
    }

    @Test
    void handlesEmptyUnavailableAndLargeLoads() {
        assertEquals(List.of(), advisor.rank(List.of(), List.of(), null));
        List<AssignmentCandidate> unavailable = List.of(
                new AssignmentCandidate(A, "a@x.test", false, UserRole.ADMIN, false),
                new AssignmentCandidate(B, "b@x.test", true, UserRole.MEMBER, true),
                new AssignmentCandidate(C, "c@x.test", true, UserRole.VIEWER, false));
        assertEquals(List.of(), advisor.rank(unavailable, List.of(), null));
        List<OpenIssueAssignment> issues = IntStream.range(0, 10000).mapToObj(index ->
                new OpenIssueAssignment(new UUID(1, index), B, IssueStatus.TODO, false)).toList();
        assertEquals(10000, advisor.rank(List.of(candidate(B, "b@x.test")), issues, null)
                .getFirst().openIssueCount());
    }

    @Test
    void rejectsNullAndDuplicateIdentities() {
        AssignmentCandidate candidate = candidate(A, "a@x.test");
        OpenIssueAssignment issue = new OpenIssueAssignment(B, A, IssueStatus.TODO, false);
        assertThrows(NullPointerException.class, () -> advisor.rank(null, List.of(), null));
        assertThrows(NullPointerException.class, () -> advisor.rank(List.of(), null, null));
        assertThrows(NullPointerException.class, () -> advisor.rank(Collections.singletonList(null), List.of(), null));
        assertThrows(NullPointerException.class, () -> advisor.rank(List.of(), Collections.singletonList(null), null));
        assertThrows(IllegalArgumentException.class, () -> advisor.rank(List.of(candidate, candidate), List.of(), null));
        assertThrows(IllegalArgumentException.class, () -> advisor.rank(List.of(), List.of(issue, issue), null));
    }

    private AssignmentCandidate candidate(UUID id, String email) {
        return new AssignmentCandidate(id, email, true, UserRole.MEMBER, false);
    }
}
