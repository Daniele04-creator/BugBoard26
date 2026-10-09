package it.unina.bugboard26.issues.persistence;

import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class IssueRepository {
    private static final int EXPECTED_UPDATE_COUNT = 1;
    private final JdbcTemplate jdbc;
    public IssueRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Issue find(UUID id) { return load(id, false); }
    public Issue lock(UUID id) { return load(id, true); }
    private Issue load(UUID id, boolean lock) {
        List<Issue> rows = jdbc.query("select * from issues where id=?" + (lock ? " for update" : ""), mapper(), id);
        if (rows.isEmpty()) { throw new DomainException(404, "NOT_FOUND", "Issue non trovata."); }
        return rows.getFirst();
    }

    public void create(Issue issue) {
        Long number = jdbc.queryForObject("""
                insert into issues(id,title,description,title_search,description_search,type,priority,status,
                  reporter_id,archived,cycle_started_at,created_at,updated_at,last_activity_at,version)
                values(?,?,?,?,?,?,?,'TODO',?,false,?,?,?,?,0) returning number
                """, Long.class, issue.id, issue.title, issue.description, InputValidation.searchKey(issue.title),
                InputValidation.searchKey(issue.description), issue.type.name(), issue.priority.name(), issue.reporterId,
                timestamp(issue.cycleStartedAt), timestamp(issue.createdAt), timestamp(issue.updatedAt), timestamp(issue.lastActivityAt));
        issue.number = number == null ? 0 : number;
    }

    public void save(Issue issue) {
        int changed = jdbc.update("""
                update issues set title=?,description=?,title_search=?,description_search=?,type=?,priority=?,
                  status=?,assignee_id=?,due_date=?,duplicate_of_id=?,archived=?,archived_at=?,archived_by=?,
                  cycle_started_at=?,resolved_at=?,updated_at=?,last_activity_at=?,version=? where id=? and version=?
                """, issue.title, issue.description, InputValidation.searchKey(issue.title),
                InputValidation.searchKey(issue.description), issue.type.name(), issue.priority.name(), issue.status.name(),
                issue.assigneeId, issue.dueDate, issue.duplicateOfId, issue.archived, timestamp(issue.archivedAt),
                issue.archivedBy, timestamp(issue.cycleStartedAt), timestamp(issue.resolvedAt), timestamp(issue.updatedAt),
                timestamp(issue.lastActivityAt), issue.version, issue.id, issue.version - 1);
        if (changed != EXPECTED_UPDATE_COUNT) { throw new DomainException(409, "VERSION_CONFLICT", "La issue è stata modificata. Ricarica i dati."); }
    }

    public List<UUID> labelIds(UUID issueId) {
        return jdbc.query("select label_id from issue_labels where issue_id=? order by label_id",
                (rs, row) -> rs.getObject(1, UUID.class), issueId);
    }

    public void replaceLabels(UUID issueId, List<UUID> ids) {
        jdbc.update("delete from issue_labels where issue_id=?", issueId);
        ids.forEach(id -> jdbc.update("insert into issue_labels(issue_id,label_id) values(?,?)", issueId, id));
    }

    public IssueImage image(UUID id) {
        List<IssueImage> rows = jdbc.query("select * from issue_images where issue_id=?", (rs, row) ->
                new IssueImage(rs.getObject("image_id", UUID.class), rs.getString("original_name"),
                        rs.getString("content_type"), rs.getBytes("content"), rs.getInt("width"),
                        rs.getInt("height"), rs.getString("sha256")), id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void saveImage(UUID issueId, IssueImage image, Instant now) {
        if (image == null) { jdbc.update("delete from issue_images where issue_id=?", issueId); return; }
        jdbc.update("""
                insert into issue_images(issue_id,image_id,original_name,content_type,content,byte_size,width,height,sha256,created_at)
                values(?,?,?,?,?,?,?,?,?,?) on conflict(issue_id) do update set image_id=excluded.image_id,
                  original_name=excluded.original_name,content_type=excluded.content_type,content=excluded.content,
                  byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,sha256=excluded.sha256,created_at=excluded.created_at
                """, issueId, image.id(), image.originalName(), image.contentType(), image.content(), image.byteSize(),
                image.width(), image.height(), image.sha256(), timestamp(now));
    }

    public boolean hasIncomingDuplicates(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from issues where duplicate_of_id=?)", Boolean.class, id));
    }

    public static OffsetDateTime timestamp(Instant value) { return value == null ? null : value.atOffset(ZoneOffset.UTC); }
    public static Instant instant(ResultSet rs, String name) throws SQLException {
        OffsetDateTime timestamp = rs.getObject(name, OffsetDateTime.class);
        return timestamp == null ? null : timestamp.toInstant();
    }
    private RowMapper<Issue> mapper() {
        return (rs, index) -> {
            Issue issue = new Issue(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("description"),
                    IssueType.valueOf(rs.getString("type")), Priority.valueOf(rs.getString("priority")),
                    rs.getObject("reporter_id", UUID.class), instant(rs, "created_at"));
            issue.number = rs.getLong("number");
            issue.status = IssueStatus.valueOf(rs.getString("status")); issue.reporterId = rs.getObject("reporter_id", UUID.class);
            issue.assigneeId = rs.getObject("assignee_id", UUID.class); issue.dueDate = rs.getObject("due_date", LocalDate.class);
            issue.duplicateOfId = rs.getObject("duplicate_of_id", UUID.class); issue.archived = rs.getBoolean("archived");
            issue.archivedAt = instant(rs, "archived_at"); issue.archivedBy = rs.getObject("archived_by", UUID.class);
            issue.cycleStartedAt = instant(rs, "cycle_started_at"); issue.resolvedAt = instant(rs, "resolved_at");
            issue.createdAt = instant(rs, "created_at"); issue.updatedAt = instant(rs, "updated_at");
            issue.lastActivityAt = instant(rs, "last_activity_at"); issue.version = rs.getLong("version");
            return issue;
        };
    }
}
