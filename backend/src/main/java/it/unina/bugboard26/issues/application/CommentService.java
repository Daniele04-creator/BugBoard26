package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.Comment;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.application.IdempotencyService;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.domain.UserRole;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import static it.unina.bugboard26.issues.persistence.IssueRepository.timestamp;

@Service
public class CommentService {
    private final IssueRepository issues;
    private final IssueQueryService queries;
    private final IssueEventWriter events;
    private final ActorAccess actors;
    private final IdempotencyService idempotency;
    private final JsonMapper mapper;
    private final Clock clock;
    private final JdbcTemplate jdbc;
    public CommentService(IssueRepository issues, IssueQueryService queries, IssueEventWriter events,
                          ActorAccess actors, IdempotencyService idempotency, JsonMapper mapper, Clock clock, JdbcTemplate jdbc) {
        this.issues = issues; this.queries = queries; this.events = events; this.actors = actors;
        this.idempotency = idempotency; this.mapper = mapper; this.clock = clock; this.jdbc = jdbc;
    }

    @Transactional
    public IssueDtos.CommentRef create(UUID issueId, IssueDtos.CreateComment request, UUID key) {
        IssueService.requireRequest(request);
        String body = InputValidation.text(request.body(), "body", 1, 5000, true);
        Actor actor = actors.lockCurrent();
        if (actor.mustChangePassword()) { throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password per continuare."); }
        if (actor.role() == UserRole.VIEWER) { throw new DomainException(403, "FORBIDDEN", "Non puoi aggiungere commenti."); }
        Issue issue = issues.lock(issueId);
        String operation = "POST /api/v1/issues/" + issueId + "/comments";
        return idempotency.execute(actor, key, operation, IdempotencyService.hash(mapper.writeValueAsString(List.of(operation, body))),
                IssueDtos.CommentRef.class, () -> {
                    IssueService.requireMutable(issue);
                    Instant now = clock.instant(); UUID id = UUID.randomUUID();
                    Long sequence = jdbc.queryForObject("insert into comments(id,issue_id,author_id,body,created_at) values(?,?,?,?,?) returning sequence",
                            Long.class, id, issueId, actor.id(), body, timestamp(now));
                    jdbc.update("update issues set last_activity_at=? where id=?", timestamp(now), issueId);
                    Map<String, Object> changes = new java.util.LinkedHashMap<>();
                    IssueService.change(changes, "commentId", null, id);
                    events.write(issue, actor, "COMMENT_ADDED", changes, null, now);
                    return ref(new Comment(id, issueId, actor.id(), body, now, sequence == null ? 0 : sequence));
                });
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<IssueDtos.CommentRef> comments(UUID id, int page, int size) {
        queries.requireReadable(); QueryParameters.pagination(page, size); issues.find(id);
        Long total = jdbc.queryForObject("select count(*) from comments where issue_id=?", Long.class, id);
        List<IssueDtos.CommentRef> items = jdbc.query("""
                select c.id,c.body,c.created_at,c.sequence,
                  u.id user_id,u.display_name user_name,u.role user_role,u.active user_active
                from comments c join user_accounts u on u.id=c.author_id
                where c.issue_id=? order by c.created_at,c.sequence limit ? offset ?
                """, (rs, row) -> new IssueDtos.CommentRef(rs.getObject("id", UUID.class), id, userRef(rs),
                        rs.getString("body"), IssueRepository.instant(rs, "created_at"), rs.getLong("sequence")), id, size, (long) page * size);
        return PageResponse.of(items, page, size, total == null ? 0 : total);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<IssueDtos.IssueEvent> history(UUID id, int page, int size) {
        queries.requireReadable(); QueryParameters.pagination(page, size); issues.find(id);
        Long total = jdbc.queryForObject("select count(*) from issue_events where issue_id=?", Long.class, id);
        List<IssueDtos.IssueEvent> items = jdbc.query("""
                select e.id,e.event_sequence,e.occurred_at,e.event_type,e.issue_version,e.changes,e.snapshot,
                  u.id user_id,u.display_name user_name,u.role user_role,u.active user_active
                from issue_events e join user_accounts u on u.id=e.actor_id
                where e.issue_id=? order by e.occurred_at,e.event_sequence limit ? offset ?
                """,
                (rs, row) -> new IssueDtos.IssueEvent(rs.getObject("id", UUID.class), rs.getLong("event_sequence"), id,
                        userRef(rs), IssueRepository.instant(rs, "occurred_at"), rs.getString("event_type"),
                        rs.getObject("issue_version", Long.class), mapper.readValue(rs.getString("changes"), new TypeReference<>() { }),
                        rs.getString("snapshot") == null ? null : mapper.readValue(rs.getString("snapshot"), new TypeReference<>() { })), id, size, (long) page * size);
        return PageResponse.of(items, page, size, total == null ? 0 : total);
    }
    private UserDtos.UserRef userRef(ResultSet rs) throws SQLException {
        return new UserDtos.UserRef(rs.getObject("user_id", UUID.class), rs.getString("user_name"),
                UserRole.valueOf(rs.getString("user_role")), rs.getBoolean("user_active"));
    }
    private IssueDtos.CommentRef ref(Comment comment) {
        return new IssueDtos.CommentRef(comment.id(), comment.issueId(), queries.ref(comment.authorId()), comment.body(), comment.createdAt(), comment.sequence());
    }
}
