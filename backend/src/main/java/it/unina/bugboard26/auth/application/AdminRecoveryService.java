package it.unina.bugboard26.auth.application;

import it.unina.bugboard26.auth.persistence.SessionRevocationService;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminRecoveryService {
    private final UserRepository users;
    private final PasswordService passwords;
    private final SessionRevocationService sessions;
    private final JdbcTemplate jdbc;
    private final EntityManager entityManager;
    private final Clock clock;

    public AdminRecoveryService(UserRepository users, PasswordService passwords, SessionRevocationService sessions,
                                JdbcTemplate jdbc, EntityManager entityManager, Clock clock) {
        this.users = users; this.passwords = passwords; this.sessions = sessions;
        this.jdbc = jdbc; this.entityManager = entityManager; this.clock = clock;
    }

    @Transactional
    public void recover(String email, String temporaryPassword, String reason) {
        String normalizedEmail = InputValidation.email(email);
        InputValidation.password(temporaryPassword);
        String normalizedReason = InputValidation.text(reason, "reason", 1, 500, false);
        jdbc.query("select pg_advisory_xact_lock(?)", statement -> statement.setLong(1, UserService.LIFECYCLE_LOCK), result -> null);
        UserAccount found = users.findByEmail(normalizedEmail).orElseThrow(AdminRecoveryService::unavailable);
        UserAccount account = users.lockById(found.getId()).orElseThrow(AdminRecoveryService::unavailable);
        entityManager.refresh(account, LockModeType.PESSIMISTIC_WRITE);
        if (!account.isActive() || account.getRole() != UserRole.ADMIN) { throw unavailable(); }
        if (passwords.matches(temporaryPassword, account.getPasswordHash())) {
            throw InputValidation.invalid("temporaryPassword", "La nuova password deve essere diversa dalla corrente.");
        }
        Instant now = clock.instant();
        boolean before = account.isMustChangePassword();
        account.replacePassword(passwords.encode(temporaryPassword), true, now);
        users.flush();
        jdbc.update("""
                insert into account_events(id,actor_id,subject_id,occurred_at,event_type,changes)
                values(?,null,?,?,'ACCOUNT_PASSWORD_RESET',jsonb_build_object(
                'mustChangePassword',jsonb_build_object('before',cast(? as boolean),'after',true),
                'reason',jsonb_build_object('before',null,'after',cast(? as text))))
                """, UUID.randomUUID(), account.getId(), now.atOffset(ZoneOffset.UTC), before, normalizedReason);
        sessions.revoke(account.getId());
    }

    private static DomainException unavailable() {
        return new DomainException(403, "ADMIN_RECOVERY_REJECTED", "Il recupero richiede un amministratore esistente e attivo.");
    }
}
