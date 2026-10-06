package it.unina.bugboard26.reporting.domain;

import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public final class MetricsCalculator {
    public ResolutionSummary summarize(List<ResolutionCycleSnapshot> cycles, ReportPeriod period,
                                        UUID userId) {
        Objects.requireNonNull(cycles, "cycles");
        Objects.requireNonNull(period, "period");
        long count = 0;
        double seconds = 0;
        Set<UUID> issues = new HashSet<>();
        for (ResolutionCycleSnapshot cycle : cycles) {
            Objects.requireNonNull(cycle, "cycle");
            if (!cycle.resolvedAt().isBefore(period.startInclusive())
                    && cycle.resolvedAt().isBefore(period.endExclusive())
                    && (userId == null || userId.equals(cycle.creditedAssigneeId()))) {
                Duration duration = Duration.between(cycle.startedAt(), cycle.resolvedAt());
                seconds += duration.getSeconds() + duration.getNano() / 1_000_000_000.0;
                count++;
                issues.add(cycle.issueId());
            }
        }
        if (!Double.isFinite(seconds)) {
            throw new IllegalArgumentException("Resolution duration sum is not finite");
        }
        return new ResolutionSummary(count, issues.size(), count == 0 ? null : seconds / count);
    }
}
