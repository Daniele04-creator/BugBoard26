package it.unina.bugboard26.issues.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.users.api.UserDtos.UserRef;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// A namespace for transport records; there is intentionally no public utility API.
@SuppressWarnings("PMD.MissingStaticMethodInNonInstantiatableClass")
public final class IssueDtos {
    private IssueDtos() { }
    public record LabelRef(UUID id, String name, String color, boolean active, long version) { }
    public record DuplicateRef(UUID id, long number, String title) { }
    public record ImageRef(UUID id, String originalName, String contentType, int byteSize,
                           int width, int height, String sha256) { }
    public record Permissions(boolean canEdit, boolean canComment, boolean canChangeState,
                              boolean canAssign, boolean canSetDeadline, boolean canDuplicate,
                              boolean canUndoDuplicate, boolean canArchive, boolean canRestore,
                              List<IssueStatus> allowedStateTargets) {
        public Permissions { allowedStateTargets = List.copyOf(allowedStateTargets); }
    }
    public record IssueSummary(UUID id, long number, String title, IssueType type, IssueStatus status,
                               Priority priority, UserRef reporter, UserRef assignee, List<LabelRef> labels,
                               LocalDate dueDate, boolean archived, Instant createdAt, Instant updatedAt,
                               Instant lastActivityAt, Instant resolvedAt, DuplicateRef duplicateOf,
                               boolean hasImage, long version, Instant archivedAt, UserRef archivedBy) {
        public IssueSummary { labels = List.copyOf(labels); }
    }
    public record IssueDetail(UUID id, long number, String title, IssueType type, IssueStatus status,
                              Priority priority, UserRef reporter, UserRef assignee, List<LabelRef> labels,
                              LocalDate dueDate, boolean archived, Instant createdAt, Instant updatedAt,
                              Instant lastActivityAt, Instant resolvedAt, DuplicateRef duplicateOf,
                              boolean hasImage, long version, Instant archivedAt, UserRef archivedBy,
                              String description, Instant cycleStartedAt, ImageRef image,
                              Permissions permissions) {
        public IssueDetail { labels = List.copyOf(labels); }
    }
    public record CreateIssue(String title, String description, IssueType type, Priority priority,
                              List<UUID> labelIds) {
        public CreateIssue {
            if (labelIds != null) { labelIds = labelIds.stream().toList(); }
        }
        @Override public List<UUID> labelIds() { return labelIds == null ? null : labelIds.stream().toList(); }
    }
    public record UpdateIssue(String title, String description, IssueType type, Priority priority,
                              List<UUID> labelIds, Long expectedVersion) {
        public UpdateIssue {
            if (labelIds != null) { labelIds = labelIds.stream().toList(); }
        }
        @Override public List<UUID> labelIds() { return labelIds == null ? null : labelIds.stream().toList(); }
    }
    public record Assignment(@JsonProperty(required = true) UUID assigneeId, Long expectedVersion) { }
    public record State(IssueStatus status, Long expectedVersion) { }
    public record Deadline(@JsonProperty(required = true) LocalDate dueDate, Long expectedVersion) { }
    public record Archive(Boolean archived, Long expectedVersion) { }
    public record Duplicate(@JsonProperty(required = true) UUID targetIssueId, Long expectedVersion) { }
    public record CreateComment(String body) { }
    public record CommentRef(UUID id, UUID issueId, UserRef author, String body, Instant createdAt,
                             long sequence) { }
    public record IssueEvent(UUID id, long eventSequence, UUID issueId, UserRef actor, Instant occurredAt,
                             String eventType, Long issueVersion, Map<String, Object> changes,
                             Map<String, Object> snapshot) {
        public IssueEvent {
            changes = immutableMap(changes);
            if (snapshot != null) { snapshot = immutableMap(snapshot); }
        }
        @Override public Map<String, Object> changes() { return immutableMap(changes); }
        @Override public Map<String, Object> snapshot() { return snapshot == null ? null : immutableMap(snapshot); }
    }

    private static Map<String, Object> immutableMap(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        source.forEach((key, value) -> copy.put(key, immutableValue(value)));
        return Collections.unmodifiableMap(copy);
    }

    private static Object immutableValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<Object, Object> copy = new LinkedHashMap<>();
            map.forEach((key, nested) -> copy.put(key, immutableValue(nested)));
            return Collections.unmodifiableMap(copy);
        }
        if (value instanceof List<?> list) { return list.stream().map(IssueDtos::immutableValue).toList(); }
        return value;
    }
}
