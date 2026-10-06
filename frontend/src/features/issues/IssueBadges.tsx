import type { IssueSummary } from "../../api/types";
import { priorityNames, statusNames, typeNames } from "./issuePresentation";
export function IssueBadges({ issue }: { issue: IssueSummary }) {
  const statusColor = {
    TODO: "gray",
    IN_PROGRESS: "blue",
    RESOLVED: "green",
    DUPLICATE: "purple",
  }[issue.status];
  const priorityColor = {
    LOW: "gray",
    MEDIUM: "blue",
    HIGH: "amber",
    CRITICAL: "red",
  }[issue.priority];
  return (
    <div className="badge-group">
      <span className={`badge badge-${statusColor}`}>
        {statusNames[issue.status]}
      </span>
      <span className={`badge badge-${priorityColor}`}>
        {priorityNames[issue.priority]}
      </span>
      <span className="badge badge-gray">{typeNames[issue.type]}</span>
      {issue.labels.map((label) => (
        <span
          key={label.id}
          className={`badge badge-${label.color.toLowerCase()}`}
        >
          {label.name}
          {label.active ? "" : " · Inattiva"}
        </span>
      ))}
    </div>
  );
}
