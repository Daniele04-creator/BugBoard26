package it.unina.bugboard26.reporting.persistence;

import it.unina.bugboard26.issues.domain.AssignmentCandidate;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.OpenIssueAssignment;
import it.unina.bugboard26.reporting.api.ReportingDtos;
import it.unina.bugboard26.users.api.UserDtos.UserRef;
import it.unina.bugboard26.users.domain.UserRole;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReportQueryRepository {
    private static final String OPEN = "not archived and status in ('TODO','IN_PROGRESS')";
    private static final Comparator<UserRef> USER_ORDER = Comparator.comparing((UserRef user) ->
            user.displayName().toLowerCase(Locale.ROOT)).thenComparing(user -> user.id().toString());
    private static final String MONTHLY = """
            with initial as materialized (
              select distinct on(issue_id) issue_id,snapshot->>'status' as status,
                (snapshot->>'archived')::boolean as archived,(snapshot->>'assigneeId')::uuid as assignee_id
              from issue_events where event_type='ISSUE_CREATED' and occurred_at < :asOf
              order by issue_id,occurred_at,event_sequence
            ), latest_status as (
              select distinct on(issue_id) issue_id,changes->'status'->>'after' as status
              from issue_events where occurred_at < :asOf and jsonb_exists(changes,'status')
              order by issue_id,occurred_at desc,event_sequence desc
            ), latest_archived as (
              select distinct on(issue_id) issue_id,(changes->'archived'->>'after')::boolean as archived
              from issue_events where occurred_at < :asOf and jsonb_exists(changes,'archived')
              order by issue_id,occurred_at desc,event_sequence desc
            ), latest_assignee as (
              select distinct on(issue_id) issue_id,(changes->'assigneeId'->>'after')::uuid as assignee_id
              from issue_events where occurred_at < :asOf and jsonb_exists(changes,'assigneeId')
              order by issue_id,occurred_at desc,event_sequence desc
            ), historical as materialized (
              select i.issue_id,coalesce(s.status,i.status) as status,coalesce(a.archived,i.archived,false) as archived,
                case when u.issue_id is null then i.assignee_id else u.assignee_id end as assignee_id
              from initial i left join latest_status s using(issue_id) left join latest_archived a using(issue_id)
              left join latest_assignee u using(issue_id)
            ), period_events as materialized (
              select issue_id,actor_id,event_type,
                event_type='STATE_CHANGED' and changes->'status'->>'before'='RESOLVED'
                  and changes->'status'->>'after'='TODO' as reopened
              from issue_events where occurred_at >= :start and occurred_at < :asOf
            ), period_cycles as materialized (
              select issue_id,credited_assignee_id,duration_seconds from resolution_cycles
              where resolved_at >= :start and resolved_at < :asOf
            ), event_totals as (
              select count(*) filter(where event_type='ISSUE_CREATED') as total_created,
                count(*) filter(where event_type='DUPLICATE_MARKED') as total_duplicated,
                count(*) filter(where reopened) as total_reopened,
                count(*) filter(where event_type='DUPLICATE_UNDONE') as total_duplicate_undone from period_events
            ), handled_pairs as materialized (
              select actor_id,issue_id from period_events where event_type<>'ISSUE_CREATED' group by actor_id,issue_id
            ), handled_totals as (
              select count(*) as total_handled from (select issue_id from handled_pairs group by issue_id) unique_issues
            ), handled_users as (
              select actor_id,count(*) as handled_count from handled_pairs group by actor_id
            ), cycle_totals as (
              select count(*) as total_cycles,count(distinct issue_id) as total_resolved,
                avg(duration_seconds) as total_average from period_cycles
            ), open_counts as materialized (
              select assignee_id,count(*) as n from historical where not archived and status in ('TODO','IN_PROGRESS')
              group by assignee_id
            ), open_totals as (
              select coalesce(sum(n),0)::bigint as total_open,
                coalesce(sum(n) filter(where assignee_id is null),0)::bigint as unassigned_open from open_counts
            ), event_users as (
              select actor_id,count(*) filter(where event_type='ISSUE_CREATED') as created_count
              from period_events group by actor_id
            ), cycle_users as (
              select credited_assignee_id,count(*) as resolved_cycles,count(distinct issue_id) as resolved_issues,
                avg(duration_seconds) as average_seconds from period_cycles group by credited_assignee_id
            ), monthly_users as (
              select u.id,u.display_name,u.role,u.active,coalesce(e.created_count,0) as created_count,
                coalesce(h.handled_count,0) as handled_count,coalesce(c.resolved_cycles,0) as resolved_cycles,
                coalesce(c.resolved_issues,0) as resolved_issues,c.average_seconds,coalesce(o.n,0) as open_end
              from user_accounts u left join event_users e on e.actor_id=u.id
              left join handled_users h on h.actor_id=u.id left join cycle_users c on c.credited_assignee_id=u.id left join open_counts o on o.assignee_id=u.id
              where u.created_at < :asOf
            )
            select e.*,h.*,c.*,o.*,u.* from event_totals e cross join handled_totals h cross join cycle_totals c cross join open_totals o
            left join monthly_users u on true
            """;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    public ReportQueryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc; this.named = new NamedParameterJdbcTemplate(jdbc);
    }

    public ReportingDtos.Dashboard dashboard(Instant asOf, LocalDate today) {
        long[] counts = jdbc.queryForObject("""
                select count(*) filter(where not archived),
                  count(*) filter(where not archived and status in ('TODO','IN_PROGRESS')),
                  count(*) filter(where not archived and status='IN_PROGRESS'),
                  count(*) filter(where not archived and status='RESOLVED'),
                  count(*) filter(where not archived and status='DUPLICATE'),
                  count(*) filter(where not archived and status in ('TODO','IN_PROGRESS') and assignee_id is null),
                  count(*) filter(where not archived and status in ('TODO','IN_PROGRESS') and due_date < ?)
                from issues
                """, (rs, row) -> new long[] {rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4),
                        rs.getLong(5), rs.getLong(6), rs.getLong(7)}, today);
        if (counts == null) { throw new IllegalStateException("Missing aggregate row"); }
        Sample sample = jdbc.queryForObject("""
                select count(*),avg(c.duration_seconds) from resolution_cycles c join issues i on i.id=c.issue_id
                where not i.archived
                """, (rs, row) -> new Sample(rs.getLong(1), average(rs, 2)));
        if (sample == null) { throw new IllegalStateException("Missing resolution aggregate"); }
        List<ReportingDtos.AssigneeLoad> assignees = jdbc.query("""
                select u.id,u.display_name,u.role,u.active,count(i.id) as open_count from user_accounts u
                left join issues i on i.assignee_id=u.id and not i.archived and i.status in ('TODO','IN_PROGRESS')
                group by u.id
                having (u.active and not u.must_change_password and u.role in ('ADMIN','MEMBER')) or count(i.id)>0
                """, (rs, row) -> new ReportingDtos.AssigneeLoad(user(rs), rs.getLong("open_count")));
        java.util.ArrayList<ReportingDtos.AssigneeLoad> loads = new java.util.ArrayList<>(assignees.stream()
                .sorted(Comparator.comparing(ReportingDtos.AssigneeLoad::user, USER_ORDER)).toList());
        loads.add(new ReportingDtos.AssigneeLoad(null, counts[5]));
        List<ReportingDtos.AssigneeResolution> resolutions = jdbc.query("""
                select u.id,u.display_name,u.role,u.active,count(*) as resolution_count,avg(c.duration_seconds) as average_seconds
                from resolution_cycles c join issues i on i.id=c.issue_id join user_accounts u on u.id=c.credited_assignee_id
                where not i.archived group by u.id
                """, (rs, row) -> new ReportingDtos.AssigneeResolution(user(rs), rs.getLong("resolution_count"),
                        average(rs, "average_seconds"))).stream()
                .sorted(Comparator.comparing(ReportingDtos.AssigneeResolution::user, USER_ORDER)).toList();
        return new ReportingDtos.Dashboard(asOf, ReportingDtos.TIMEZONE, counts[0], counts[1], counts[2], counts[3],
                counts[4], counts[5], counts[6], sample.count(), sample.average(),
                groups("type", List.of("QUESTION", "BUG", "DOCUMENTATION", "FEATURE")),
                groups("priority", List.of("LOW", "MEDIUM", "HIGH", "CRITICAL")), loads, resolutions);
    }

    public MonthlyData monthly(Instant start, Instant asOf) {
        return named.query(MONTHLY, period(start, asOf), rs -> {
            if (!rs.next()) { throw new IllegalStateException("Missing monthly aggregate row"); }
            ReportingDtos.Totals totals = new ReportingDtos.Totals(rs.getLong("total_created"),
                    rs.getLong("total_cycles"), rs.getLong("total_resolved"), rs.getLong("total_handled"),
                    rs.getLong("total_duplicated"), rs.getLong("total_reopened"), rs.getLong("total_duplicate_undone"),
                    average(rs, "total_average"), rs.getLong("total_open"));
            long unassigned = rs.getLong("unassigned_open");
            java.util.ArrayList<ReportingDtos.UserMonthly> users = new java.util.ArrayList<>();
            do {
                if (rs.getObject("id", UUID.class) != null) {
                    users.add(new ReportingDtos.UserMonthly(user(rs), rs.getLong("created_count"),
                            rs.getLong("handled_count"), rs.getLong("resolved_cycles"), rs.getLong("resolved_issues"),
                            average(rs, "average_seconds"), rs.getLong("open_end")));
                }
            } while (rs.next());
            users.sort(Comparator.comparing(ReportingDtos.UserMonthly::user, USER_ORDER));
            return new MonthlyData(totals, users, unassigned);
        });
    }

    public record MonthlyData(ReportingDtos.Totals totals, List<ReportingDtos.UserMonthly> perUser, long unassigned) {
        public MonthlyData { perUser = List.copyOf(perUser); }
    }
    public List<AssignmentCandidate> candidates() {
        return jdbc.query("select id,email,active,role,must_change_password from user_accounts", (rs, row) ->
                new AssignmentCandidate(rs.getObject("id", UUID.class), rs.getString("email"), rs.getBoolean("active"),
                        UserRole.valueOf(rs.getString("role")), rs.getBoolean("must_change_password")));
    }

    public List<OpenIssueAssignment> openAssignments() {
        return jdbc.query("select id,assignee_id,status,archived from issues where " + OPEN, (rs, row) ->
                new OpenIssueAssignment(rs.getObject("id", UUID.class), rs.getObject("assignee_id", UUID.class),
                        IssueStatus.valueOf(rs.getString("status")), rs.getBoolean("archived")));
    }

    public Map<UUID, UserRef> candidateRefs() {
        Map<UUID, UserRef> values = new LinkedHashMap<>();
        jdbc.query("select id,display_name,role,active from user_accounts", (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
            UserRef ref = user(rs); values.put(ref.id(), ref);
        });
        return Map.copyOf(values);
    }

    private Map<String, Long> groups(String column, List<String> categories) {
        if (!List.of("type", "priority").contains(column)) { throw new IllegalArgumentException("Invalid grouping"); }
        Map<String, Long> values = new LinkedHashMap<>(); categories.forEach(key -> values.put(key, 0L));
        jdbc.query("""
                select case when ?='type' then type else priority end as category,count(*) from issues
                where not archived and status in ('TODO','IN_PROGRESS') group by 1
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> values.put(rs.getString(1), rs.getLong(2)), column);
        return Map.copyOf(values);
    }
    private MapSqlParameterSource period(Instant start, Instant asOf) {
        return new MapSqlParameterSource("start", Timestamp.from(start)).addValue("asOf", Timestamp.from(asOf));
    }
    private UserRef user(ResultSet rs) throws SQLException {
        return new UserRef(rs.getObject("id", UUID.class), rs.getString("display_name"),
                UserRole.valueOf(rs.getString("role")), rs.getBoolean("active"));
    }
    private Double average(ResultSet rs, String name) throws SQLException { return seconds(rs.getBigDecimal(name)); }
    private Double average(ResultSet rs, int index) throws SQLException { return seconds(rs.getBigDecimal(index)); }
    private Double seconds(java.math.BigDecimal value) {
        if (value == null) { return null; }
        double result = value.doubleValue();
        if (!Double.isFinite(result)) { throw new IllegalStateException("Resolution average must be finite"); }
        return result;
    }
    private record Sample(long count, Double average) { }
}
