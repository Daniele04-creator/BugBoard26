package it.unina.bugboard26.issues.domain;

import it.unina.bugboard26.reporting.domain.ResolutionCycleSnapshot;
import java.util.Objects;
import java.util.UUID;

public record TransitionResult(IssueSnapshot snapshot, boolean changed,
                               ResolutionCycleSnapshot resolutionCycle,
                               UUID resolvedBy, boolean notifyReporter) {
    public TransitionResult {
        Objects.requireNonNull(snapshot, "snapshot");
    }
}
