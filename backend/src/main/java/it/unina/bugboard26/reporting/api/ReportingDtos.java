package it.unina.bugboard26.reporting.api;

import it.unina.bugboard26.users.api.UserDtos.UserRef;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class ReportingDtos {
    public static final String TIMEZONE = "Europe/Rome";
    private ReportingDtos() { }
    public record AssigneeLoad(UserRef user, long openCount) { }
    public record AssigneeResolution(UserRef user, long resolutionCount, Double averageResolutionSeconds) { }
    public record Dashboard(Instant asOf, String timezone, long activeIssueCount, long openCount,
                            long inProgressCount, long resolvedCount, long duplicateCount,
                            long unassignedOpenCount, long overdueOpenCount, long resolutionCount,
                            Double averageResolutionSeconds, Map<String, Long> openByType,
                            Map<String, Long> openByPriority, List<AssigneeLoad> openByAssignee,
                            List<AssigneeResolution> resolutionByAssignee) {
        public Dashboard {
            openByType = Map.copyOf(openByType); openByPriority = Map.copyOf(openByPriority);
            openByAssignee = List.copyOf(openByAssignee); resolutionByAssignee = List.copyOf(resolutionByAssignee);
        }
    }
    public record Totals(long createdCount, long resolvedCycleCount, long resolvedIssueCount,
                         long handledIssueCount, long duplicatedCount, long reopenedCount,
                         long duplicateUndoneCount, Double averageResolutionSeconds, long openAtPeriodEnd) { }
    public record UserMonthly(UserRef user, long createdCount, long handledIssueCount,
                              long resolvedCycleCount, long resolvedIssueCount,
                              Double averageResolutionSeconds, long openAssignedAtPeriodEnd) { }
    public record MonthlyReport(String month, String timezone, Instant periodStart, Instant periodEnd,
                                Instant asOf, boolean partial, Totals totals, List<UserMonthly> perUser,
                                long unassignedOpenAtPeriodEnd) {
        public MonthlyReport { perUser = List.copyOf(perUser); }
    }
    public record SuggestedCandidate(UserRef user, long openIssueCount, int rank, String reason) { }
    public record Suggestions(Instant asOf, List<SuggestedCandidate> candidates) {
        public Suggestions { candidates = List.copyOf(candidates); }
    }
}
