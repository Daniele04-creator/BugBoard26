package it.unina.bugboard26.users.application;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.auth.persistence.SessionRevocationService;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
    private static final String DISPLAY_NAME = "displayName";
    private static final String ROLE = "role";
    private static final String ACTIVE = "active";
    private static final String MUST_CHANGE_PASSWORD = "mustChangePassword";
    public static final long LIFECYCLE_LOCK = 2606001L;
    private final UserRepository users;
    private final ActorAccess actors;
    private final PasswordService passwords;
    private final SessionRevocationService sessions;
    private final AssignmentLookup assignments;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public UserService(UserRepository users, ActorAccess actors, PasswordService passwords,
                       SessionRevocationService sessions, AssignmentLookup assignments,
                       JdbcTemplate jdbc, Clock clock) {
        this.users = users;
        this.actors = actors;
        this.passwords = passwords;
        this.sessions = sessions;
        this.assignments = assignments;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<UserDtos.UserRef> directory(String query, int page, int size) {
        requireReady(actors.current());
        return page(query, null, null, false, false, page, size, UserDtos::ref);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<UserDtos.UserAdmin> list(String query, UserRole role, Boolean active, int page, int size) {
        assertAdmin(actors.current());
        return page(query, role, active, true, false, page, size, UserDtos::admin);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<UserDtos.UserRef> candidates(String query, int page, int size) {
        assertAdmin(actors.current());
        return page(query, null, true, true, true, page, size, UserDtos::ref);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public UserDtos.UserAdmin get(UUID id) {
        assertAdmin(actors.current());
        return UserDtos.admin(users.findById(id).orElseThrow(UserService::notFound));
    }

    @Transactional
    public UserDtos.UserAdmin create(UserDtos.CreateUser command) {
        String email = InputValidation.email(command.email());
        String name = InputValidation.text(command.displayName(), DISPLAY_NAME, 2, 80, false);
        InputValidation.password(command.password());
        requireRole(command.role());
        lifecycleLock();
        Actor actor = actors.requireAdmin();
        assertAdmin(actor);
        if (users.findByEmail(email).isPresent()) {
            throw emailConflict();
        }
        Instant now = clock.instant();
        UserAccount account = new UserAccount(UUID.randomUUID(), email, name, passwords.encode(command.password()), command.role(), now);
        try {
            users.saveAndFlush(account);
        } catch (DataIntegrityViolationException exception) {
            throw emailConflict();
        }
        audit(actor.id(), account.getId(), now, "ACCOUNT_CREATED",
                List.of(new Change(DISPLAY_NAME, null, name), new Change(ROLE, null, command.role().name()),
                        new Change(ACTIVE, null, true), new Change(MUST_CHANGE_PASSWORD, null, true)));
        return UserDtos.admin(account);
    }

    @Transactional
    public UserDtos.UserAdmin update(UUID id, UserDtos.UpdateUser command) {
        String name = InputValidation.text(command.displayName(), DISPLAY_NAME, 2, 80, false);
        requireRole(command.role());
        if (command.active() == null) {
            throw InputValidation.invalid(ACTIVE, "Campo obbligatorio.");
        }
        long expected = InputValidation.expectedVersion(command.expectedVersion());
        lifecycleLock();
        UUID actorId = actors.current().id();
        actors.lockAccounts(List.of(actorId, id));
        Actor actor = actors.requireAdmin();
        assertAdmin(actor);
        UserAccount account = users.findById(id).orElseThrow(UserService::notFound);
        checkVersion(account, expected);
        List<Change> changes = new ArrayList<>();
        changed(changes, DISPLAY_NAME, account.getDisplayName(), name);
        changed(changes, ROLE, account.getRole().name(), command.role().name());
        changed(changes, ACTIVE, account.isActive(), command.active());
        if (changes.isEmpty()) {
            return UserDtos.admin(account);
        }
        boolean securityChanged = account.getRole() != command.role() || account.isActive() != command.active();
        if (account.getRole() == UserRole.ADMIN && account.isActive()
                && (command.role() != UserRole.ADMIN || !command.active())
                && users.countByRoleAndActiveTrue(UserRole.ADMIN) <= 1) {
            throw new DomainException(409, "LAST_ADMIN_REQUIRED", "Deve restare almeno un amministratore attivo.");
        }
        if ((!command.active() || command.role() == UserRole.VIEWER) && assignments.hasOpenAssignments(id)) {
            throw new DomainException(409, "OPEN_ASSIGNMENTS_EXIST", "Riassegna prima le issue aperte di questo utente.");
        }
        Instant now = clock.instant();
        account.update(name, command.role(), command.active(), now);
        users.flush();
        audit(actor.id(), id, now, "ACCOUNT_UPDATED", changes);
        if (securityChanged) {
            sessions.revoke(id);
        }
        return UserDtos.admin(account);
    }

    @Transactional
    public UserDtos.Me profile(UserDtos.Profile command) {
        String name = InputValidation.text(command.displayName(), DISPLAY_NAME, 2, 80, false);
        long expected = InputValidation.expectedVersion(command.expectedVersion());
        Actor actor = actors.lockCurrent();
        requireReady(actor);
        UserAccount account = users.findById(actor.id()).orElseThrow(UserService::notFound);
        checkVersion(account, expected);
        if (!account.getDisplayName().equals(name)) {
            Instant now = clock.instant();
            String before = account.getDisplayName();
            account.rename(name, now);
            users.flush();
            audit(actor.id(), actor.id(), now, "PROFILE_UPDATED", List.of(new Change(DISPLAY_NAME, before, name)));
        }
        return UserDtos.me(account);
    }

    @Transactional
    public void resetPassword(UUID id, UserDtos.ResetPassword command) {
        validatePassword(command.temporaryPassword(), "temporaryPassword");
        long expected = InputValidation.expectedVersion(command.expectedVersion());
        lifecycleLock();
        UUID actorId = actors.current().id();
        actors.lockAccounts(List.of(actorId, id));
        Actor actor = actors.requireAdmin();
        assertAdmin(actor);
        if (actor.id().equals(id)) {
            throw new DomainException(403, "FORBIDDEN", "Per la tua password usa il cambio con la password corrente.");
        }
        UserAccount account = users.findById(id).orElseThrow(UserService::notFound);
        checkVersion(account, expected);
        if (passwords.matches(command.temporaryPassword(), account.getPasswordHash())) {
            throw InputValidation.invalid("temporaryPassword", "La nuova password deve essere diversa dalla corrente.");
        }
        Instant now = clock.instant();
        boolean previous = account.isMustChangePassword();
        account.replacePassword(passwords.encode(command.temporaryPassword()), true, now);
        users.flush();
        audit(actor.id(), id, now, "PASSWORD_RESET", List.of(new Change(MUST_CHANGE_PASSWORD, previous, true)));
        sessions.revoke(id);
    }

    @Transactional
    public void changePassword(UserDtos.ChangePassword command) {
        validatePassword(command.newPassword(), "newPassword");
        Actor actor = actors.lockCurrent();
        UserAccount account = users.findById(actor.id()).orElseThrow(UserService::notFound);
        if (!passwords.matches(command.currentPassword(), account.getPasswordHash())) {
            throw InputValidation.invalid("currentPassword", "La password corrente non è corretta.");
        }
        if (passwords.matches(command.newPassword(), account.getPasswordHash())) {
            throw InputValidation.invalid("newPassword", "La nuova password deve essere diversa dalla corrente.");
        }
        Instant now = clock.instant();
        boolean previous = account.isMustChangePassword();
        account.replacePassword(passwords.encode(command.newPassword()), false, now);
        users.flush();
        audit(actor.id(), actor.id(), now, "PASSWORD_CHANGED", List.of(new Change(MUST_CHANGE_PASSWORD, previous, false)));
        sessions.revoke(actor.id());
    }

    public void lifecycleLock() {
        jdbc.query("select pg_advisory_xact_lock(?)", statement -> statement.setLong(1, LIFECYCLE_LOCK), result -> null);
    }

    private <T> PageResponse<T> page(String query, UserRole role, Boolean active, boolean searchEmail,
                                    boolean eligible, int page, int size, Function<UserAccount, T> mapper) {
        QueryParameters.pagination(page, size);
        String search = query == null ? "" : InputValidation.text(query, "q", 0, 100, false);
        String escaped = InputValidation.searchKey(search).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        Specification<UserAccount> filter = (root, criteria, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (!escaped.isEmpty()) {
                Predicate name = builder.like(builder.lower(root.get(DISPLAY_NAME)), "%" + escaped + "%", '\\');
                predicates.add(searchEmail ? builder.or(name, builder.like(root.get("email"), "%" + escaped + "%", '\\')) : name);
            }
            if (role != null) { predicates.add(builder.equal(root.get(ROLE), role)); }
            if (active != null) { predicates.add(builder.equal(root.get(ACTIVE), active)); }
            if (eligible) {
                predicates.add(builder.isFalse(root.get(MUST_CHANGE_PASSWORD)));
                predicates.add(root.get(ROLE).in(UserRole.ADMIN, UserRole.MEMBER));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        Page<UserAccount> result = users.findAll(filter, PageRequest.of(page, size, Sort.by(DISPLAY_NAME, "id")));
        return PageResponse.of(result.getContent().stream().map(mapper).toList(), page, size, result.getTotalElements());
    }

    private static void requireRole(UserRole role) {
        if (role == null) { throw InputValidation.invalid(ROLE, "Campo obbligatorio."); }
    }

    private static void validatePassword(String password, String field) {
        try {
            InputValidation.password(password);
        } catch (DomainException exception) {
            throw InputValidation.invalid(field, exception.fields().getOrDefault("password", exception.getMessage()));
        }
    }

    private static void checkVersion(UserAccount account, long expected) {
        if (account.getVersion() != expected) {
            throw new DomainException(409, "VERSION_CONFLICT", "L'account è stato modificato. Ricarica i dati.",
                    Map.of("currentVersion", Long.toString(account.getVersion())));
        }
    }

    private static void assertAdmin(Actor actor) {
        requireReady(actor);
        if (actor.role() != UserRole.ADMIN) { throw new DomainException(403, "FORBIDDEN", "Operazione riservata agli amministratori."); }
    }

    private static void requireReady(Actor actor) {
        if (actor.mustChangePassword()) { throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia prima la password temporanea."); }
    }

    private static DomainException notFound() {
        return new DomainException(404, "NOT_FOUND", "Utente non trovato.");
    }

    private static DomainException emailConflict() {
        return new DomainException(409, "EMAIL_ALREADY_EXISTS", "Esiste già un account con questa email.");
    }

    private static void changed(List<Change> changes, String field, Object before, Object after) {
        if (!java.util.Objects.equals(before, after)) { changes.add(new Change(field, before, after)); }
    }

    private void audit(UUID actorId, UUID subjectId, Instant now, String eventType, List<Change> changes) {
        List<Object> parameters = new ArrayList<>(List.of(UUID.randomUUID(), subjectId, java.sql.Timestamp.from(now), eventType));
        parameters.add(1, actorId);
        List<String> fields = new ArrayList<>();
        for (Change change : changes) {
            String cast = change.before() instanceof Boolean || change.after() instanceof Boolean ? "boolean" : "text";
            fields.add("?,jsonb_build_object('before',cast(? as " + cast + "),'after',cast(? as " + cast + "))");
            parameters.add(change.field());
            parameters.add(change.before());
            parameters.add(change.after());
        }
        String sql = "insert into account_events(id,actor_id,subject_id,occurred_at,event_type,changes) values(?,?,?,?,?,jsonb_build_object("
                + String.join(",", fields) + "))";
        jdbc.update(sql, parameters.toArray());
    }

    private record Change(String field, Object before, Object after) { }
}
