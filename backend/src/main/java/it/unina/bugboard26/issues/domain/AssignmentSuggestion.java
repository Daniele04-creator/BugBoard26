package it.unina.bugboard26.issues.domain;

import java.util.Objects;
import java.util.UUID;

public record AssignmentSuggestion(UUID userId, long openIssueCount) {
    public AssignmentSuggestion {
        Objects.requireNonNull(userId, "userId");
        if (openIssueCount < 0) {
            throw new IllegalArgumentException("openIssueCount cannot be negative");
        }
    }
}
