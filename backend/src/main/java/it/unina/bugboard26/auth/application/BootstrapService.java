package it.unina.bugboard26.auth.application;

import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.application.UserService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class BootstrapService implements ApplicationRunner {
    private final UserRepository users;
    private final PasswordService passwords;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final String profile;
    private final String email;
    private final String password;
    private final boolean enabled;

    public BootstrapService(UserRepository users, PasswordService passwords, JdbcTemplate jdbc, Clock clock,
            @Value("${app.profile:demo}") String profile,
            @Value("${app.bootstrap-admin-email:admin@bugboard.local}") String email,
            @Value("${app.bootstrap-admin-password:BugBoard26-ChangeMe!}") String password,
            @Value("${app.bootstrap-enabled:true}") boolean enabled) {
        this.users = users;
        this.passwords = passwords;
        this.jdbc = jdbc;
        this.clock = clock;
        this.profile = profile;
        this.email = email;
        this.password = password;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        if (!enabled) { return; }
        jdbc.query("select pg_advisory_xact_lock(?)", statement -> statement.setLong(1, UserService.LIFECYCLE_LOCK), result -> null);
        if (users.count() != 0) { return; }
        String normalizedEmail = InputValidation.email(email);
        if ("prod".equals(profile) && ("admin@bugboard.local".equals(normalizedEmail)
                || "BugBoard26-ChangeMe!".equals(password) || password.isBlank())) {
            throw new IllegalStateException("Il primo avvio in produzione richiede credenziali bootstrap private.");
        }
        Instant now = clock.instant();
        UserAccount account = new UserAccount(UUID.randomUUID(), normalizedEmail, "Amministratore",
                passwords.encode(password), UserRole.ADMIN, now);
        users.saveAndFlush(account);
        jdbc.update("""
                insert into account_events(id,actor_id,subject_id,occurred_at,event_type,changes)
                values(?,null,?,?, 'ACCOUNT_BOOTSTRAPPED', jsonb_build_object(
                'role',jsonb_build_object('before',null,'after','ADMIN'),
                'active',jsonb_build_object('before',null,'after',true),
                'mustChangePassword',jsonb_build_object('before',null,'after',true)))
                """, UUID.randomUUID(), account.getId(), java.sql.Timestamp.from(now));
    }
}
