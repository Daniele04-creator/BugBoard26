package it.unina.bugboard26.auth.persistence;

import it.unina.bugboard26.auth.api.LoginRequestException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class LoginAttemptRepository {
    private static final int MINIMUM_SECRET_LENGTH = 32;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final String secret;

    public LoginAttemptRepository(JdbcTemplate jdbc, Clock clock,
            @Value("${app.auth-ip-hash-secret}") String secret) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.secret = secret;
    }

    @jakarta.annotation.PostConstruct
    public void validateConfiguration() {
        if (secret.length() < MINIMUM_SECRET_LENGTH) {
            throw new IllegalArgumentException("AUTH_IP_HASH_SECRET requires at least 32 characters");
        }
    }

    public String emailKey(String email) { return digest("EMAIL:" + email); }
    public String ipKey(String address) { return digest("IP:" + secret + ":" + address); }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void check(String emailKey, String ipKey) {
        Instant now = clock.instant();
        List<Instant> blocks = jdbc.query("SELECT blocked_until FROM login_attempts WHERE scope_hash IN (?, ?) AND blocked_until > ?",
                (row, index) -> row.getTimestamp(1).toInstant(), emailKey, ipKey, java.sql.Timestamp.from(now));
        long retry = blocks.stream().mapToLong(until -> Math.max(1, Duration.between(now, until).toSeconds())).max().orElse(0);
        if (retry > 0) {
            throw new LoginRequestException(429, "RATE_LIMITED", "Troppi tentativi. Riprova più tardi.", retry);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failure(String emailKey, String ipKey) {
        Instant now = clock.instant();
        List<String> keys = List.of(emailKey, ipKey).stream().sorted().toList();
        for (String key : keys) {
            String scope = key.equals(emailKey) ? "EMAIL" : "IP";
            int threshold = scope.equals("EMAIL") ? 5 : 30;
            jdbc.update("INSERT INTO login_attempts(scope_hash, scope, window_started_at, failure_count, expires_at) "
                    + "VALUES (?, ?, ?, 0, ?) ON CONFLICT (scope_hash) DO NOTHING", key, scope,
                    java.sql.Timestamp.from(now), java.sql.Timestamp.from(now.plusSeconds(86_400)));
            Attempt previous = jdbc.queryForObject("SELECT window_started_at, failure_count, blocked_until FROM login_attempts "
                    + "WHERE scope_hash = ? FOR UPDATE", (row, index) -> new Attempt(
                        row.getTimestamp(1).toInstant(), row.getInt(2), row.getTimestamp(3) == null ? null : row.getTimestamp(3).toInstant()), key);
            if (previous == null) { throw new IllegalStateException("Missing rate limit row"); }
            boolean expired = !now.isBefore(previous.started().plusSeconds(900));
            int failures = expired ? 1 : previous.failures() + 1;
            Instant block = failures >= threshold ? now.plusSeconds(900) : previous.blocked();
            jdbc.update("UPDATE login_attempts SET window_started_at = ?, failure_count = ?, blocked_until = ?, expires_at = ? WHERE scope_hash = ?",
                    java.sql.Timestamp.from(expired ? now : previous.started()), failures,
                    block == null ? null : java.sql.Timestamp.from(block), java.sql.Timestamp.from(now.plusSeconds(86_400)), key);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void success(String emailKey) {
        jdbc.update("DELETE FROM login_attempts WHERE scope_hash = ?", emailKey);
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private record Attempt(Instant started, int failures, Instant blocked) { }
}
