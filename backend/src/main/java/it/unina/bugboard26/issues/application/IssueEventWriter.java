package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.shared.domain.Actor;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import static it.unina.bugboard26.issues.persistence.IssueRepository.timestamp;

@Component
public class IssueEventWriter {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    public IssueEventWriter(JdbcTemplate jdbc, JsonMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

    public UUID write(Issue issue, Actor actor, String type, Map<String, Object> changes,
                      Map<String, Object> snapshot, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into issue_events(id,issue_id,actor_id,occurred_at,event_type,issue_version,changes,snapshot,created_at)
                values(?,?,?,?,?,?,?::jsonb,?::jsonb,?)
                """, id, issue.id, actor.id(), timestamp(now), type,
                type.equals("COMMENT_ADDED") ? null : issue.version, mapper.writeValueAsString(changes),
                snapshot == null ? null : mapper.writeValueAsString(snapshot), timestamp(now));
        return id;
    }

    public void notify(UUID recipient, UUID eventId, UUID issueId, String type, Instant now) {
        jdbc.update("insert into notifications(id,recipient_id,event_id,issue_id,type,created_at) values(?,?,?,?,?,?)",
                UUID.randomUUID(), recipient, eventId, issueId, type, timestamp(now));
    }

    public void cycle(Issue issue, UUID eventId, Actor actor, Instant now) {
        jdbc.update("""
                insert into resolution_cycles(id,issue_id,resolved_event_id,started_at,resolved_at,resolved_by_id,credited_assignee_id,duration_seconds)
                values(?,?,?,?,?,?,?,extract(epoch from ?::timestamptz - ?::timestamptz))
                """, UUID.randomUUID(), issue.id, eventId, timestamp(issue.cycleStartedAt), timestamp(now),
                actor.id(), issue.assigneeId, timestamp(now), timestamp(issue.cycleStartedAt));
    }
}
