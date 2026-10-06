package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class ActorAccess {
    private static final String AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED";
    private final UserRepository users;
    private final EntityManager entityManager;

    public ActorAccess(UserRepository users, EntityManager entityManager) {
        this.users = users;
        this.entityManager = entityManager;
    }

    public AuthPrincipal principal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthPrincipal principal)) {
            throw new DomainException(401, AUTHENTICATION_REQUIRED, "Accedi per continuare.");
        }
        return principal;
    }

    public Actor current() {
        AuthPrincipal principal = principal();
        return verify(users.findById(principal.id()).orElseThrow(() ->
                new DomainException(401, AUTHENTICATION_REQUIRED, "La sessione è scaduta.")), principal);
    }

    public Actor lockCurrent() {
        AuthPrincipal principal = principal();
        UserAccount account = users.lockById(principal.id()).orElseThrow(() ->
                new DomainException(401, AUTHENTICATION_REQUIRED, "La sessione è scaduta."));
        entityManager.refresh(account, LockModeType.PESSIMISTIC_WRITE);
        return verify(account, principal);
    }

    public Actor requireAdmin() {
        Actor actor = lockCurrent();
        if (actor.role() != UserRole.ADMIN) {
            throw new DomainException(403, "FORBIDDEN", "Operazione riservata all'amministratore.");
        }
        if (actor.mustChangePassword()) {
            throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password iniziale per continuare.");
        }
        return actor;
    }

    public List<UserAccount> lockAccounts(List<UUID> accountIds) {
        List<UserAccount> accounts = accountIds.stream().distinct().sorted()
                .map(id -> users.lockById(id).orElseThrow(() ->
                    new DomainException(404, "NOT_FOUND", "Utente non trovato."))).toList();
        AuthPrincipal principal = principal();
        accounts.forEach(account -> entityManager.refresh(account, LockModeType.PESSIMISTIC_WRITE));
        accounts.stream().filter(account -> account.getId().equals(principal.id()))
                .findFirst().ifPresent(account -> verify(account, principal));
        return accounts;
    }

    private Actor verify(UserAccount account, AuthPrincipal principal) {
        if (!account.isActive() || account.getAuthVersion() != principal.authVersion()) {
            throw new DomainException(401, AUTHENTICATION_REQUIRED, "La sessione è scaduta. Accedi di nuovo.");
        }
        return new Actor(account.getId(), account.getRole(), account.isActive(),
                account.isMustChangePassword(), account.getAuthVersion());
    }
}
