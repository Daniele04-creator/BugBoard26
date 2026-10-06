package it.unina.bugboard26.issues.domain;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class AssignmentAdvisor {
    public List<AssignmentSuggestion> rank(List<AssignmentCandidate> candidates,
                                           List<OpenIssueAssignment> openIssues,
                                           UUID excludedIssueId) {
        if (candidates == null || openIssues == null) {
            throw new IllegalArgumentException("candidates and openIssues are required");
        }
        Map<UUID, Long> loads = new HashMap<>();
        Set<UUID> candidateIds = new HashSet<>();
        for (AssignmentCandidate candidate : candidates) {
            if (candidate == null) {
                throw new IllegalArgumentException("candidate cannot be null");
            }
            if (!candidateIds.add(candidate.id())) {
                throw new IllegalArgumentException("Duplicate candidate id");
            }
        }
        Set<UUID> issueIds = new HashSet<>();
        for (OpenIssueAssignment issue : openIssues) {
            if (issue == null) {
                throw new IllegalArgumentException("issue cannot be null");
            }
            if (!issueIds.add(issue.issueId())) {
                throw new IllegalArgumentException("Duplicate issue id");
            }
            if (issue.status().isOpen() && !issue.archived() && issue.assigneeId() != null
                    && !issue.issueId().equals(excludedIssueId)) {
                loads.merge(issue.assigneeId(), 1L, Long::sum);
            }
        }
        Comparator<AssignmentCandidate> order = Comparator
                .comparingLong((AssignmentCandidate candidate) -> loads.getOrDefault(candidate.id(), 0L))
                .thenComparing(candidate -> candidate.email().trim().toLowerCase(Locale.ROOT))
                .thenComparing(candidate -> candidate.id().toString());
        return candidates.stream().filter(AssignmentCandidate::eligible).sorted(order)
                .map(candidate -> new AssignmentSuggestion(candidate.id(),
                        loads.getOrDefault(candidate.id(), 0L))).toList();
    }
}
