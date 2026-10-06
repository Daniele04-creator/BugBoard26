package it.unina.bugboard26.reporting.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ResolutionCycleSnapshot(UUID issueId, Instant startedAt, Instant resolvedAt,
                                     UUID creditedAssigneeId) {
    public ResolutionCycleSnapshot {
        Objects.requireNonNull(issueId, "issueId");
        Objects.requireNonNull(startedAt, "startedAt");
        Objects.requireNonNull(resolvedAt, "resolvedAt");
        Objects.requireNonNull(creditedAssigneeId, "creditedAssigneeId");
        if (resolvedAt.isBefore(startedAt)) {
            throw new IllegalArgumentException("Resolution duration cannot be negative");
        }
    }
}
