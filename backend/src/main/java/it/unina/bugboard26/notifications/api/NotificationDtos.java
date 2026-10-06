package it.unina.bugboard26.notifications.api;

import java.time.Instant;
import java.util.UUID;

public final class NotificationDtos {
    private NotificationDtos() { }

    public static Notification notification(it.unina.bugboard26.notifications.domain.Notification value) {
        return new Notification(value.id(), value.type(),
                new IssueRef(value.issueId(), value.issueNumber(), value.issueTitle()),
                value.eventId(), value.createdAt(), value.readAt());
    }

    public record IssueRef(UUID id, long number, String title) { }
    public record Notification(UUID id, String type, IssueRef issue, UUID eventId, Instant createdAt, Instant readAt) { }
    public record UnreadCount(long count) { }
    public record ReadAllResult(long changedCount) { }
}
