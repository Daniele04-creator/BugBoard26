package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.api.IssueDtos.IssueDetail;
import it.unina.bugboard26.issues.api.IssueDtos.IssueSummary;
import it.unina.bugboard26.issues.api.IssueFilter;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssuePolicy;
import it.unina.bugboard26.issues.domain.IssueSnapshot;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.issues.domain.WorkflowPolicy;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IssueQueryService {
    private static final String PRIORITY = "priority";
    private final IssueRepository issues;
    private final UserRepository users;
    private final ActorAccess actors;
    private final Clock clock;
    private final NamedParameterJdbcTemplate named;
    private final JdbcTemplate jdbc;
    private final IssuePolicy policy = new IssuePolicy();
    private final WorkflowPolicy workflow = new WorkflowPolicy();

    public IssueQueryService(IssueRepository issues, UserRepository users, ActorAccess actors, Clock clock, JdbcTemplate jdbc) {
        this.issues = issues; this.users = users; this.actors = actors; this.clock = clock;
        this.jdbc = jdbc; this.named = new NamedParameterJdbcTemplate(jdbc);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<IssueSummary> list(IssueFilter filter) {
        requireReadable();
        Query query = query(filter);
        Long total = named.queryForObject("select count(*) from issues i " + query.where(), query.parameters(), Long.class);
        query.parameters().addValue("limit", filter.size()).addValue("offset", (long) filter.page() * filter.size());
        List<IssueSummary> page = named.query("""
                select i.id,i.number,i.title,i.type,i.status,i.priority,i.due_date,i.archived,
                  i.created_at,i.updated_at,i.last_activity_at,i.resolved_at,i.version,i.archived_at,
                  r.id reporter_id,r.display_name reporter_name,r.role reporter_role,r.active reporter_active,
                  a.id assignee_id,a.display_name assignee_name,a.role assignee_role,a.active assignee_active,
                  b.id archived_by_id,b.display_name archived_by_name,b.role archived_by_role,b.active archived_by_active,
                  d.id duplicate_id,d.number duplicate_number,d.title duplicate_title,
                  exists(select 1 from issue_images image where image.issue_id=i.id) has_image
                from issues i join user_accounts r on r.id=i.reporter_id
                  left join user_accounts a on a.id=i.assignee_id
                  left join user_accounts b on b.id=i.archived_by
                  left join issues d on d.id=i.duplicate_of_id
                """ + query.where() + query.order() + " limit :limit offset :offset", query.parameters(),
                (rs, row) -> listSummary(rs));
        Map<UUID, List<IssueDtos.LabelRef>> labelsByIssue = pageLabels(page);
        List<IssueSummary> summaries = page.stream()
                .map(issue -> withLabels(issue, labelsByIssue.getOrDefault(issue.id(), List.of()))).toList();
        return PageResponse.of(summaries, filter.page(), filter.size(), total == null ? 0 : total);
    }

    private IssueSummary listSummary(ResultSet rs) throws SQLException {
        UUID duplicateId = rs.getObject("duplicate_id", UUID.class);
        IssueDtos.DuplicateRef duplicate = duplicateId == null ? null
                : new IssueDtos.DuplicateRef(duplicateId, rs.getLong("duplicate_number"), rs.getString("duplicate_title"));
        return new IssueSummary(rs.getObject("id", UUID.class), rs.getLong("number"), rs.getString("title"),
                IssueType.valueOf(rs.getString("type")), IssueStatus.valueOf(rs.getString("status")),
                Priority.valueOf(rs.getString(PRIORITY)), listUserRef(rs, "reporter"), listUserRef(rs, "assignee"),
                List.of(), rs.getObject("due_date", LocalDate.class), rs.getBoolean("archived"),
                IssueRepository.instant(rs, "created_at"), IssueRepository.instant(rs, "updated_at"),
                IssueRepository.instant(rs, "last_activity_at"), IssueRepository.instant(rs, "resolved_at"), duplicate,
                rs.getBoolean("has_image"), rs.getLong("version"), IssueRepository.instant(rs, "archived_at"),
                listUserRef(rs, "archived_by"));
    }

    private UserDtos.UserRef listUserRef(ResultSet rs, String prefix) throws SQLException {
        UUID id = rs.getObject(prefix + "_id", UUID.class);
        return id == null ? null : new UserDtos.UserRef(id, rs.getString(prefix + "_name"),
                UserRole.valueOf(rs.getString(prefix + "_role")), rs.getBoolean(prefix + "_active"));
    }

    private Map<UUID, List<IssueDtos.LabelRef>> pageLabels(List<IssueSummary> page) {
        Map<UUID, List<IssueDtos.LabelRef>> labelsByIssue = new HashMap<>();
        if (page.isEmpty()) { return labelsByIssue; }
        named.query("""
                select il.issue_id,l.id,l.name,l.color,l.active,l.version
                from issue_labels il join labels l on l.id=il.label_id
                where il.issue_id in (:ids) order by l.normalized_name collate "C",l.id
                """, new MapSqlParameterSource("ids", page.stream().map(IssueSummary::id).toList()), rs -> {
                    UUID issueId = rs.getObject("issue_id", UUID.class);
                    labelsByIssue.computeIfAbsent(issueId, ignored -> new ArrayList<>()).add(new IssueDtos.LabelRef(
                            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("color"),
                            rs.getBoolean("active"), rs.getLong("version")));
                });
        return labelsByIssue;
    }

    private IssueSummary withLabels(IssueSummary issue, List<IssueDtos.LabelRef> labels) {
        return new IssueSummary(issue.id(), issue.number(), issue.title(), issue.type(), issue.status(), issue.priority(),
                issue.reporter(), issue.assignee(), labels, issue.dueDate(), issue.archived(), issue.createdAt(),
                issue.updatedAt(), issue.lastActivityAt(), issue.resolvedAt(), issue.duplicateOf(), issue.hasImage(),
                issue.version(), issue.archivedAt(), issue.archivedBy());
    }

    public record CsvIssueRow(List<String> values) {
        public CsvIssueRow { values = List.copyOf(values); }
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<CsvIssueRow> exportRows(IssueFilter filter, int maximum) {
        requireReadable();
        Query query = query(filter);
        Long count = named.queryForObject("select count(*) from issues i " + query.where(), query.parameters(), Long.class);
        if (count != null && count > maximum) { throw new DomainException(422, "EXPORT_LIMIT_EXCEEDED", "L'esportazione supera 10000 issue. Restringi i filtri."); }
        return named.query("""
                select i.number,i.title,i.description,i.type,i.status,i.priority,r.display_name reporter,
                  a.display_name assignee,coalesce((select string_agg(l.name,' | ' order by l.normalized_name collate "C",l.id)
                  from issue_labels il join labels l on l.id=il.label_id where il.issue_id=i.id),'') labels,
                  i.due_date,i.created_at,i.updated_at,i.resolved_at,i.archived,d.number duplicate_number
                from issues i join user_accounts r on r.id=i.reporter_id left join user_accounts a on a.id=i.assignee_id
                  left join issues d on d.id=i.duplicate_of_id
                """ + query.where() + query.order(), query.parameters(), (rs, index) -> {
                    List<String> values = new ArrayList<>();
                    values.add(Long.toString(rs.getLong("number")));
                    for (String field : List.of("title", "description", "type", "status", PRIORITY, "reporter", "assignee", "labels")) {
                        values.add(rs.getString(field) == null ? "" : rs.getString(field));
                    }
                    values.add(rs.getObject("due_date") == null ? "" : rs.getObject("due_date").toString());
                    for (String field : List.of("created_at", "updated_at", "resolved_at")) {
                        java.time.Instant instant = IssueRepository.instant(rs, field); values.add(instant == null ? "" : instant.toString());
                    }
                    values.add(Boolean.toString(rs.getBoolean("archived")));
                    values.add(rs.getObject("duplicate_number") == null ? "" : Long.toString(rs.getLong("duplicate_number")));
                    return new CsvIssueRow(values);
                });
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public IssueDetail detail(UUID id) { return detail(issues.find(id), requireReadable()); }

    public IssueDetail detail(Issue issue, Actor actor) {
        IssueSummary summary = summary(issue);
        IssueDtos.ImageRef image = imageMetadata(issue.id);
        IssueSnapshot snapshot = snapshot(issue);
        boolean admin = actor.role() == UserRole.ADMIN;
        boolean mutable = !issue.archived && issue.status != IssueStatus.DUPLICATE;
        boolean edit = policy.canEdit(actor, snapshot);
        List<IssueStatus> targets = new ArrayList<>();
        for (IssueStatus target : List.of(IssueStatus.TODO, IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED)) {
            if (target == issue.status) { continue; }
            try { if (workflow.transition(snapshot, target, actor, clock.instant()).changed()) { targets.add(target); } }
            catch (DomainException ignored) { /* An unavailable transition is omitted from the contract. */ }
        }
        IssueDtos.Permissions permissions = new IssueDtos.Permissions(edit,
                mutable && actor.role() != UserRole.VIEWER, !targets.isEmpty(),
                admin && mutable && issue.status.isOpen(), admin && mutable && issue.status.isOpen(),
                admin && mutable && !issues.hasIncomingDuplicates(issue.id),
                admin && !issue.archived && issue.status == IssueStatus.DUPLICATE,
                admin && !issue.archived, admin && issue.archived, targets);
        return new IssueDetail(summary.id(), summary.number(), summary.title(), summary.type(), summary.status(),
                summary.priority(), summary.reporter(), summary.assignee(), summary.labels(), summary.dueDate(),
                summary.archived(), summary.createdAt(), summary.updatedAt(), summary.lastActivityAt(), summary.resolvedAt(),
                summary.duplicateOf(), summary.hasImage(), summary.version(), summary.archivedAt(), summary.archivedBy(),
                issue.description, issue.cycleStartedAt, image, permissions);
    }

    private IssueDtos.ImageRef imageMetadata(UUID issueId) {
        return jdbc.query("""
                select image_id,original_name,content_type,byte_size,width,height,sha256
                from issue_images where issue_id=?
                """, (rs, row) -> new IssueDtos.ImageRef(rs.getObject("image_id", UUID.class), rs.getString("original_name"),
                rs.getString("content_type"), rs.getInt("byte_size"), rs.getInt("width"), rs.getInt("height"),
                rs.getString("sha256")), issueId).stream().findFirst().orElse(null);
    }

    public IssueSnapshot snapshot(Issue issue) {
        UserAccount assignee = issue.assigneeId == null ? null : users.findById(issue.assigneeId).orElseThrow();
        return new IssueSnapshot(issue.id, issue.status, issue.archived, issue.assigneeId, issue.reporterId,
                issue.version, issue.cycleStartedAt, issue.resolvedAt, assignee != null && assignee.isActive(),
                assignee == null ? null : assignee.getRole(), assignee != null && assignee.isMustChangePassword());
    }

    public IssueSummary summary(Issue issue) {
        IssueDtos.DuplicateRef duplicate = null;
        if (issue.duplicateOfId != null) {
            Issue canonical = issues.find(issue.duplicateOfId);
            duplicate = new IssueDtos.DuplicateRef(canonical.id, canonical.number, canonical.title);
        }
        Boolean hasImage = jdbc.queryForObject("select exists(select 1 from issue_images where issue_id=?)", Boolean.class, issue.id);
        return new IssueSummary(issue.id, issue.number, issue.title, issue.type, issue.status, issue.priority,
                ref(issue.reporterId), ref(issue.assigneeId), labels(issue.id), issue.dueDate, issue.archived,
                issue.createdAt, issue.updatedAt, issue.lastActivityAt, issue.resolvedAt, duplicate,
                Boolean.TRUE.equals(hasImage), issue.version, issue.archivedAt, ref(issue.archivedBy));
    }

    public List<IssueDtos.LabelRef> labels(UUID issueId) {
        return jdbc.query("""
                select l.* from labels l join issue_labels il on il.label_id=l.id
                where il.issue_id=? order by l.normalized_name collate "C",l.id
                """, (rs, row) -> new IssueDtos.LabelRef(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("color"), rs.getBoolean("active"), rs.getLong("version")), issueId);
    }

    public UserDtos.UserRef ref(UUID id) { return id == null ? null : UserDtos.ref(users.findById(id).orElseThrow()); }

    public Actor requireReadable() {
        Actor actor = actors.current();
        if (actor.mustChangePassword()) { throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password per continuare."); }
        return actor;
    }

    public static IssueDtos.ImageRef imageRef(IssueImage image) {
        return image == null ? null : new IssueDtos.ImageRef(image.id(), image.originalName(), image.contentType(),
                image.byteSize(), image.width(), image.height(), image.sha256());
    }

    private Query query(IssueFilter filter) {
        List<String> predicates = new ArrayList<>();
        MapSqlParameterSource parameters = new MapSqlParameterSource();
        if (!filter.archived().equals("all")) { predicates.add("i.archived=:archived"); parameters.addValue("archived", Boolean.valueOf(filter.archived())); }
        if (!filter.q().isEmpty()) {
            predicates.add("(i.title_search like :q escape '\\' or i.description_search like :q escape '\\')");
            String q = InputValidation.searchKey(filter.q()).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            parameters.addValue("q", "%" + q + "%");
        }
        addEnums(predicates, parameters, "type", filter.types());
        addEnums(predicates, parameters, "status", filter.statuses());
        addEnums(predicates, parameters, PRIORITY, filter.priorities());
        if (!filter.labelIds().isEmpty()) { predicates.add("exists(select 1 from issue_labels il where il.issue_id=i.id and il.label_id in (:labels))"); parameters.addValue("labels", filter.labelIds()); }
        if (filter.unassigned()) { predicates.add("i.assignee_id is null"); }
        else if (filter.assigneeId() != null) { predicates.add("i.assignee_id=:assignee"); parameters.addValue("assignee", filter.assigneeId()); }
        if (filter.reporterId() != null) { predicates.add("i.reporter_id=:reporter"); parameters.addValue("reporter", filter.reporterId()); }
        if (filter.overdue() != null) {
            predicates.add((filter.overdue() ? "" : "not ") + "(not i.archived and i.status in ('TODO','IN_PROGRESS') and coalesce(i.due_date < :today,false))");
            parameters.addValue("today", LocalDate.now(clock.withZone(ZoneId.of("Europe/Rome"))));
        }
        String column = Map.of("createdAt", "i.created_at", "updatedAt", "i.updated_at", "lastActivityAt", "i.last_activity_at",
                "dueDate", "i.due_date", "title", "i.title_search collate \"C\"", "number", "i.number", PRIORITY,
                "case i.priority when 'LOW' then 0 when 'MEDIUM' then 1 when 'HIGH' then 2 else 3 end").get(filter.sortField());
        return new Query(predicates.isEmpty() ? "" : "where " + String.join(" and ", predicates), parameters,
                " order by " + column + " " + filter.sortDirection() + " nulls last,i.id asc");
    }

    private void addEnums(List<String> predicates, MapSqlParameterSource parameters, String name, java.util.Set<? extends Enum<?>> values) {
        if (!values.isEmpty()) { predicates.add("i." + name + " in (:" + name + ")"); parameters.addValue(name, values.stream().map(Enum::name).toList()); }
    }
    private record Query(String where, MapSqlParameterSource parameters, String order) { }
}
