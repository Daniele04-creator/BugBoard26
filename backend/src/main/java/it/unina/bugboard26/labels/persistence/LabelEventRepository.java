package it.unina.bugboard26.labels.persistence;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LabelEventRepository {
    private final JdbcTemplate jdbc;

    public LabelEventRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void insert(UUID actorId, UUID labelId, Instant now, String eventType, List<Change> changes) {
        List<Object> parameters = new ArrayList<>(List.of(UUID.randomUUID(), actorId, labelId, Timestamp.from(now), eventType));
        List<String> fields = new ArrayList<>();
        for (Change change : changes) {
            String type = change.before() instanceof Boolean || change.after() instanceof Boolean ? "boolean" : "text";
            fields.add("?,jsonb_build_object('before',cast(? as " + type + "),'after',cast(? as " + type + "))");
            parameters.add(change.field());
            parameters.add(change.before());
            parameters.add(change.after());
        }
        jdbc.update("INSERT INTO label_events(id,actor_id,label_id,occurred_at,event_type,changes) VALUES(?,?,?,?,?,jsonb_build_object("
            + String.join(",", fields) + "))", parameters.toArray());
    }

    public record Change(String field, Object before, Object after) { }
}
