import { api } from "../../api/ApiClient";
import type { IssueType, Priority, UserRef } from "../../api/types";
export interface Dashboard {
  asOf: string;
  timezone: string;
  activeIssueCount: number;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  duplicateCount: number;
  unassignedOpenCount: number;
  overdueOpenCount: number;
  resolutionCount: number;
  averageResolutionSeconds: number | null;
  openByType: Record<IssueType, number>;
  openByPriority: Record<Priority, number>;
  openByAssignee: { user: UserRef | null; openCount: number }[];
  resolutionByAssignee: {
    user: UserRef;
    resolutionCount: number;
    averageResolutionSeconds: number | null;
  }[];
}
export interface MonthlyReport {
  month: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  partial: boolean;
  totals: {
    createdCount: number;
    resolvedCycleCount: number;
    resolvedIssueCount: number;
    handledIssueCount: number;
    duplicatedCount: number;
    reopenedCount: number;
    duplicateUndoneCount: number;
    averageResolutionSeconds: number | null;
    openAtPeriodEnd: number;
  };
  perUser: {
    user: UserRef;
    createdCount: number;
    handledIssueCount: number;
    resolvedCycleCount: number;
    resolvedIssueCount: number;
    averageResolutionSeconds: number | null;
    openAssignedAtPeriodEnd: number;
  }[];
  unassignedOpenAtPeriodEnd: number;
}
export const reportingApi = {
  dashboard: (signal?: AbortSignal) =>
    api.get<Dashboard>("/admin/dashboard", { signal }),
  monthly: (month: string, signal?: AbortSignal) =>
    api.get<MonthlyReport>(
      `/admin/reports/monthly?month=${encodeURIComponent(month)}`,
      { signal },
    ),
};
