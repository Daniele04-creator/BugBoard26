package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.users.application.AssignmentLookup;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AssignmentLookupAdapter implements AssignmentLookup {
    private final JdbcTemplate jdbc;

    public AssignmentLookupAdapter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public boolean hasOpenAssignments(UUID userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from issues where assignee_id = ? and archived = false
                and status in ('TODO', 'IN_PROGRESS'))
                """, Boolean.class, userId));
    }
}
