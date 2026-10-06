package it.unina.bugboard26.issues.domain;

import it.unina.bugboard26.users.domain.UserRole;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record IssueSnapshot(UUID id, IssueStatus status, boolean archived, UUID assigneeId,
                            UUID reporterId, long version, Instant cycleStartedAt,
                            Instant resolvedAt, boolean assigneeActive, UserRole assigneeRole,
                            boolean assigneeMustChangePassword) {
    public IssueSnapshot {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(reporterId, "reporterId");
        Objects.requireNonNull(cycleStartedAt, "cycleStartedAt");
        if (version < 0) {
            throw new IllegalArgumentException("version cannot be negative");
        }
        if (assigneeId != null) {
            Objects.requireNonNull(assigneeRole, "assigneeRole");
        }
        if (resolvedAt != null && resolvedAt.isBefore(cycleStartedAt)) {
            throw new IllegalArgumentException("resolvedAt precedes cycle start");
        }
    }

    public boolean assigneeEligible() {
        return assigneeId != null && assigneeActive && !assigneeMustChangePassword
                && assigneeRole.canBeAssigned();
    }
}
