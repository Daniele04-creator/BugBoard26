export type UserRole = "ADMIN" | "MEMBER" | "VIEWER";
export interface UserRef {
  id: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}
export interface Me extends UserRef {
  email: string;
  mustChangePassword: boolean;
  version: number;
}
export interface UserAdmin extends Me {
  createdAt: string;
  updatedAt: string;
}
export type LabelColor = "gray" | "blue" | "green" | "amber" | "red" | "purple";
export interface Label {
  id: string;
  name: string;
  color: LabelColor;
  active: boolean;
  version: number;
}
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface FieldError {
  field: string;
  message: string;
}
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  fieldErrors: FieldError[];
  currentVersion?: number;
}
export type IssueType = "QUESTION" | "BUG" | "DOCUMENTATION" | "FEATURE";
export type IssueStatus = "TODO" | "IN_PROGRESS" | "RESOLVED" | "DUPLICATE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: Priority;
  reporter: UserRef;
  assignee: UserRef | null;
  labels: Label[];
  dueDate: string | null;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  duplicateOf: {
    id: string;
    number: number;
    title: string;
  } | null;
  hasImage: boolean;
  version: number;
}
export interface IssuePermissions {
  canEdit: boolean;
  canComment: boolean;
  canChangeState: boolean;
  canAssign: boolean;
  canSetDeadline: boolean;
  canDuplicate: boolean;
  canUndoDuplicate: boolean;
  canArchive: boolean;
  canRestore: boolean;
  allowedStateTargets: IssueStatus[];
}
export interface IssueImage {
  id: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}
export interface IssueDetail extends IssueSummary {
  description: string;
  cycleStartedAt: string;
  image: IssueImage | null;
  permissions: IssuePermissions;
}
export interface Comment {
  id: string;
  issueId: string;
  author: UserRef;
  body: string;
  createdAt: string;
  sequence: number;
}
export interface IssueEvent {
  id: string;
  eventSequence: number;
  issueId: string;
  actor: UserRef;
  occurredAt: string;
  eventType: string;
  issueVersion: number;
  changes: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
}
export interface Notification {
  id: string;
  type: string;
  issue: {
    id: string;
    number: number;
    title: string;
  };
  eventId: string;
  createdAt: string;
  readAt: string | null;
}
