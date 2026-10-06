package it.unina.bugboard26.auth.persistence;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SessionRevocationService {
    private final JdbcTemplate jdbc;

    public SessionRevocationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void revoke(UUID userId) {
        jdbc.update("delete from spring_session where principal_name = ?", userId.toString());
    }
}
