package it.unina.bugboard26.issues.domain;

import java.util.Objects;
import java.util.UUID;

public record OpenIssueAssignment(UUID issueId, UUID assigneeId, IssueStatus status,
                                  boolean archived) {
    public OpenIssueAssignment {
        Objects.requireNonNull(issueId, "issueId");
        Objects.requireNonNull(status, "status");
    }
}
