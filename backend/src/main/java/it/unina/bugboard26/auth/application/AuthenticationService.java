package it.unina.bugboard26.auth.application;

import it.unina.bugboard26.auth.domain.LoginUserDetails;
import it.unina.bugboard26.auth.persistence.LoginAttemptRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;

public class AuthenticationService implements AuthenticationManager {
    private final AuthenticationManager delegate;
    private final LoginAttemptRepository attempts;
    private final HttpServletRequest request;

    public AuthenticationService(AuthenticationManager delegate, LoginAttemptRepository attempts, HttpServletRequest request) {
        this.delegate = delegate;
        this.attempts = attempts;
        this.request = request;
    }

    @Override
    public Authentication authenticate(Authentication input) {
        try {
            return authenticateAvailable(input);
        } catch (org.springframework.dao.DataAccessException error) {
            throw new it.unina.bugboard26.auth.api.LoginRequestException(503, "SERVICE_UNAVAILABLE",
                    "Servizio temporaneamente non disponibile.", 0);
        }
    }

    private Authentication authenticateAvailable(Authentication input) {
        String emailKey = attempts.emailKey(input.getName());
        String ipKey = attempts.ipKey(request.getRemoteAddr());
        attempts.check(emailKey, ipKey);
        Authentication authenticated;
        try {
            authenticated = java.util.Objects.requireNonNull(delegate.authenticate(input), "Authentication result");
        } catch (AuthenticationException error) {
            attempts.failure(emailKey, ipKey);
            throw error;
        }
        attempts.success(emailKey);
        LoginUserDetails details = (LoginUserDetails) java.util.Objects.requireNonNull(authenticated.getPrincipal(), "Login principal");
        return UsernamePasswordAuthenticationToken.authenticated(details.principal(), null, details.getAuthorities());
    }
}
