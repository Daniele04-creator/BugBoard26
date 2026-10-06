package it.unina.bugboard26.shared.api;

import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/v1/health/live")
    public Map<String, String> live(HttpServletRequest request) {
        QueryParameters.only(request);
        return Map.of("status", "UP");
    }

    @GetMapping("/api/v1/health/ready")
    public ResponseEntity<Map<String, String>> ready(HttpServletRequest request) {
        QueryParameters.only(request);
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (DataAccessException error) {
            return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
        }
    }
}
