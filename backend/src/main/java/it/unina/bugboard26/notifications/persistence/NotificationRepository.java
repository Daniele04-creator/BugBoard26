package it.unina.bugboard26.notifications.persistence;

import it.unina.bugboard26.notifications.domain.Notification;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
    private static final String SELECT = "SELECT n.*, i.number AS issue_number, i.title AS issue_title FROM notifications n JOIN issues i ON i.id=n.issue_id";
    private final JdbcTemplate jdbc;

    public NotificationRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Notification> list(UUID recipientId, boolean unreadOnly, int page, int size) {
        return jdbc.query(SELECT + " WHERE n.recipient_id=?" + unread(unreadOnly)
            + " ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?", NotificationRepository::map,
            recipientId, size, (long) page * size);
    }

    public long count(UUID recipientId, boolean unreadOnly) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM notifications n WHERE n.recipient_id=?" + unread(unreadOnly), Long.class, recipientId);
        return count == null ? 0 : count;
    }

    public Optional<Notification> lock(UUID recipientId, UUID id) {
        return jdbc.query(SELECT + " WHERE n.recipient_id=? AND n.id=? FOR UPDATE OF n", NotificationRepository::map, recipientId, id)
            .stream().findFirst();
    }

    public void markRead(UUID recipientId, UUID id, Instant now) {
        jdbc.update("UPDATE notifications SET read_at=? WHERE recipient_id=? AND id=? AND read_at IS NULL", now.atOffset(ZoneOffset.UTC), recipientId, id);
    }

    public long markAllRead(UUID recipientId, Instant now) {
        return jdbc.update("UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL", now.atOffset(ZoneOffset.UTC), recipientId);
    }

    private static String unread(boolean unreadOnly) { return unreadOnly ? " AND n.read_at IS NULL" : ""; }

    private static Notification map(ResultSet row, int index) throws SQLException {
        OffsetDateTime readAt = row.getObject("read_at", OffsetDateTime.class);
        return new Notification(row.getObject("id", UUID.class), row.getObject("recipient_id", UUID.class), row.getObject("issue_id", UUID.class),
            row.getLong("issue_number"), row.getString("issue_title"), row.getObject("event_id", UUID.class), row.getString("type"),
            row.getObject("created_at", OffsetDateTime.class).toInstant(), readAt == null ? null : readAt.toInstant());
    }
}
