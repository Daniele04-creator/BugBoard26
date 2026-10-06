package it.unina.bugboard26.notifications.domain;

import java.time.Instant;
import java.util.UUID;

public record Notification(UUID id, UUID recipientId, UUID issueId, long issueNumber, String issueTitle,
                           UUID eventId, String type, Instant createdAt, Instant readAt) {
    public Notification markRead(Instant now) {
        return readAt == null ? new Notification(id, recipientId, issueId, issueNumber, issueTitle, eventId, type, createdAt, now) : this;
    }
}
