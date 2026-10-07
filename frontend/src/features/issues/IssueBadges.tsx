import {
  IconBug,
  IconHelpCircle,
  IconFileText,
  IconChartBarPopular,
  IconCircle,
  IconCircleDot,
  IconCircleCheck,
  IconCopy,
  IconChevronDown,
  IconMinus,
  IconChevronUp,
  IconChevronsUp,
} from "@tabler/icons-react";
import type { IssueSummary } from "../../api/types";
import { priorityNames, statusNames, typeNames } from "./issuePresentation";

const typeIcons = {
  BUG: IconBug,
  QUESTION: IconHelpCircle,
  DOCUMENTATION: IconFileText,
  FEATURE: IconChartBarPopular,
};
const statusIcons = {
  TODO: IconCircle,
  IN_PROGRESS: IconCircleDot,
  RESOLVED: IconCircleCheck,
  DUPLICATE: IconCopy,
};
const priorityIcons = {
  LOW: IconChevronDown,
  MEDIUM: IconMinus,
  HIGH: IconChevronUp,
  CRITICAL: IconChevronsUp,
};

export function IssueTypeIcon({
  type,
  size = 24,
}: {
  type: IssueSummary["type"];
  size?: number;
}) {
  const Icon = typeIcons[type];
  return (
    <Icon
      size={size}
      stroke={2}
      aria-hidden="true"
      className={`issue-type-icon issue-type-${type.toLowerCase()}`}
    />
  );
}
export function IssueStatusBadge({
  status,
}: {
  status: IssueSummary["status"];
}) {
  const Icon = statusIcons[status];
  return (
    <span className={`issue-badge issue-status-${status.toLowerCase()}`}>
      <Icon size={16} stroke={2} aria-hidden="true" />
      {statusNames[status]}
    </span>
  );
}
export function IssuePriorityBadge({
  priority,
}: {
  priority: IssueSummary["priority"];
}) {
  const Icon = priorityIcons[priority];
  return (
    <span className={`issue-badge issue-priority-${priority.toLowerCase()}`}>
      <Icon size={16} stroke={2} aria-hidden="true" />
      {priorityNames[priority]}
    </span>
  );
}
export function IssueLabels({ issue }: { issue: IssueSummary }) {
  return (
    <span className="issue-labels">
      {issue.labels.map((label) => (
        <span
          key={label.id}
          className={`badge badge-${label.color.toLowerCase()}`}
        >
          {label.name}
          {label.active ? "" : " · Inattiva"}
        </span>
      ))}
    </span>
  );
}
export function IssueBadges({ issue }: { issue: IssueSummary }) {
  return (
    <div className="badge-group">
      <span className={`issue-badge issue-type-${issue.type.toLowerCase()}`}>
        <IssueTypeIcon type={issue.type} size={20} />
        {typeNames[issue.type]}
      </span>
      <IssueStatusBadge status={issue.status} />
      <IssuePriorityBadge priority={issue.priority} />
      <IssueLabels issue={issue} />
    </div>
  );
}
