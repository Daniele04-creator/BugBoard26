package it.unina.bugboard26.shared.application;

import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@EnableScheduling
public class ExpiredRecordCleanup {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ExpiredRecordCleanup(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "UTC")
    @Transactional
    public void cleanup() {
        java.time.OffsetDateTime now = clock.instant().atOffset(java.time.ZoneOffset.UTC);
        jdbc.update("DELETE FROM idempotency_records WHERE expires_at <= ?", now);
        jdbc.update("DELETE FROM login_attempts WHERE expires_at <= ?", now);
    }
}
