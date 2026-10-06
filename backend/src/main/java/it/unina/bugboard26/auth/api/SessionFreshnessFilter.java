package it.unina.bugboard26.auth.api;

import it.unina.bugboard26.shared.api.ProblemWriter;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.time.Clock;
import java.util.Set;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionFreshnessFilter extends OncePerRequestFilter {
    private static final Set<String> LIMITED = Set.of("/api/v1/auth/me", "/api/v1/auth/csrf",
            "/api/v1/auth/password", "/api/v1/auth/logout");
    private final ActorAccess actors;
    private final ProblemWriter problems;
    private final Clock clock;

    public SessionFreshnessFilter(ActorAccess actors, ProblemWriter problems, Clock clock) {
        this.actors = actors;
        this.problems = problems;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && !(authentication instanceof AnonymousAuthenticationToken)) {
            try {
                HttpSession session = request.getSession(false);
                if (session == null || clock.millis() - session.getCreationTime() >= 28_800_000) {
                    throw new DomainException(401, "AUTHENTICATION_REQUIRED", "La sessione è scaduta.");
                }
                Actor actor = actors.current();
                request.setAttribute("actorId", actor.id().toString());
                if (actor.mustChangePassword() && !LIMITED.contains(request.getRequestURI())) {
                    throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password iniziale per continuare.");
                }
            } catch (DomainException error) {
                if (error.status() == org.springframework.http.HttpStatus.UNAUTHORIZED.value()) {
                    HttpSession session = request.getSession(false);
                    if (session != null) { session.invalidate(); }
                    SecurityContextHolder.clearContext();
                }
                problems.write(request, response, error);
                return;
            } catch (org.springframework.dao.DataAccessException | org.springframework.transaction.CannotCreateTransactionException error) {
                problems.write(request, response, new DomainException(503, "SERVICE_UNAVAILABLE", "Servizio temporaneamente non disponibile."));
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
