package it.unina.bugboard26.labels.persistence;

import it.unina.bugboard26.labels.domain.Label;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LabelRepository {
    private final JdbcTemplate jdbc;

    public LabelRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Optional<Label> lock(UUID id) {
        return jdbc.query("SELECT * FROM labels WHERE id = ? FOR UPDATE", LabelRepository::map, id).stream().findFirst();
    }

    public List<Label> list(String escapedQuery, Boolean active, int page, int size) {
        Filter filter = filter(escapedQuery, active);
        List<Object> parameters = new ArrayList<>(filter.parameters());
        parameters.add(size);
        parameters.add((long) page * size);
        return jdbc.query("SELECT * FROM labels" + filter.sql()
            + " ORDER BY normalized_name COLLATE \"C\", id LIMIT ? OFFSET ?", LabelRepository::map, parameters.toArray());
    }

    public long count(String escapedQuery, Boolean active) {
        Filter filter = filter(escapedQuery, active);
        Long total = jdbc.queryForObject("SELECT count(*) FROM labels" + filter.sql(), Long.class, filter.parameters().toArray());
        return total == null ? 0 : total;
    }

    public void insert(Label label) {
        jdbc.update("INSERT INTO labels(id,name,normalized_name,color,active,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            label.id(), label.name(), label.normalizedName(), label.color(), label.active(), label.version(),
            Timestamp.from(label.createdAt()), Timestamp.from(label.updatedAt()));
    }

    public void update(Label label) {
        jdbc.update("UPDATE labels SET name=?,normalized_name=?,color=?,active=?,version=?,updated_at=? WHERE id=?",
            label.name(), label.normalizedName(), label.color(), label.active(), label.version(),
            Timestamp.from(label.updatedAt()), label.id());
    }

    private static Filter filter(String escapedQuery, Boolean active) {
        List<Object> parameters = new ArrayList<>();
        List<String> conditions = new ArrayList<>();
        if (!escapedQuery.isEmpty()) {
            conditions.add("normalized_name LIKE ? ESCAPE E'\\\\'");
            parameters.add("%" + escapedQuery + "%");
        }
        if (active != null) {
            conditions.add("active = ?");
            parameters.add(active);
        }
        return new Filter(conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions), parameters);
    }

    private static Label map(ResultSet row, int index) throws SQLException {
        return new Label(row.getObject("id", UUID.class), row.getString("name"), row.getString("normalized_name"),
            row.getString("color"), row.getBoolean("active"), row.getLong("version"),
            row.getTimestamp("created_at").toInstant(), row.getTimestamp("updated_at").toInstant());
    }

    private record Filter(String sql, List<Object> parameters) { }
}
