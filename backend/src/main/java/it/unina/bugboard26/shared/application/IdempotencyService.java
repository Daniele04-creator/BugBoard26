package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IdempotencyService {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    private final Clock clock;
    private final ActorAccess actors;

    public IdempotencyService(JdbcTemplate jdbc, JsonMapper mapper, Clock clock, ActorAccess actors) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
        this.actors = actors;
    }

    // The caller locks and authorizes the account before replay, within this same transaction.
    @Transactional(propagation = Propagation.MANDATORY)
    public <T> T execute(Actor actor, UUID key, String operation, String requestHash,
                         Class<T> responseType, Supplier<T> action) {
        if (key == null || operation.length() > 160 || !requestHash.matches("[0-9a-f]{64}")) {
            throw new DomainException(400, "VALIDATION_ERROR", "Chiave di idempotenza o richiesta non valida.");
        }
        Actor fresh = actors.current();
        if (!fresh.id().equals(actor.id()) || fresh.mustChangePassword()) {
            throw new DomainException(403, "FORBIDDEN", "Operazione non consentita.");
        }
        long lockKey = ByteBuffer.wrap(digest(actor.id() + ":" + key)).getLong();
        jdbc.query("SELECT pg_advisory_xact_lock(?)", statement -> statement.setLong(1, lockKey), rows -> null);
        java.time.OffsetDateTime now = clock.instant().atOffset(java.time.ZoneOffset.UTC);
        jdbc.update("DELETE FROM idempotency_records WHERE actor_id = ? AND key = ? AND expires_at <= ?", actor.id(), key, now);
        Stored existing = jdbc.query("SELECT operation, request_hash, response_body::text FROM idempotency_records WHERE actor_id = ? AND key = ?",
                (row, index) -> new Stored(row.getString(1), row.getString(2), row.getString(3)), actor.id(), key)
                .stream().findFirst().orElse(null);
        if (existing != null) {
            if (!existing.operation().equals(operation) || !existing.hash().equals(requestHash)) {
                throw new DomainException(409, "IDEMPOTENCY_KEY_REUSED", "Questa chiave è già associata a una richiesta diversa.");
            }
            return mapper.readValue(existing.body(), responseType);
        }
        T response = action.get();
        String json = mapper.writeValueAsString(response);
        UUID resourceId = UUID.fromString(mapper.readTree(json).get("id").asString());
        jdbc.update("INSERT INTO idempotency_records(actor_id,key,operation,request_hash,response_status,response_body,resource_id,created_at,expires_at) "
                + "VALUES (?,?,?,?,201,?::jsonb,?,?,?)", actor.id(), key, operation, requestHash, json, resourceId, now,
                clock.instant().plusSeconds(86_400).atOffset(java.time.ZoneOffset.UTC));
        return response;
    }

    public static String hash(String canonicalPayload) {
        return HexFormat.of().formatHex(digest(canonicalPayload));
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private record Stored(String operation, String hash, String body) { }
}
