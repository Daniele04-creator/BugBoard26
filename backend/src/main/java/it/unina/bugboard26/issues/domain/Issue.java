package it.unina.bugboard26.issues.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.Objects;

/** A locked issue aggregate loaded and persisted by the JDBC repository. */
public final class Issue {
    public UUID id;
    public long number;
    public String title;
    public String description;
    public IssueType type;
    public Priority priority;
    public IssueStatus status;
    public UUID reporterId;
    public UUID assigneeId;
    public LocalDate dueDate;
    public UUID duplicateOfId;
    public boolean archived;
    public Instant archivedAt;
    public UUID archivedBy;
    public Instant cycleStartedAt;
    public Instant resolvedAt;
    public Instant createdAt;
    public Instant updatedAt;
    public Instant lastActivityAt;
    public long version;

    public Issue(UUID id, String title, String description, IssueType type, Priority priority,
                 UUID reporterId, Instant createdAt) {
        this.id = Objects.requireNonNull(id, "id");
        this.title = Objects.requireNonNull(title, "title");
        this.description = Objects.requireNonNull(description, "description");
        this.type = Objects.requireNonNull(type, "type");
        this.priority = Objects.requireNonNull(priority, "priority");
        this.reporterId = Objects.requireNonNull(reporterId, "reporterId");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.status = IssueStatus.TODO;
        this.updatedAt = createdAt; this.lastActivityAt = createdAt; this.cycleStartedAt = createdAt;
    }
}
