package it.unina.bugboard26.auth.api;

import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.api.UserDtos;
import it.unina.bugboard26.users.persistence.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final ActorAccess actors;
    private final UserRepository users;

    public AuthController(ActorAccess actors, UserRepository users) {
        this.actors = actors;
        this.users = users;
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token, HttpServletRequest request) {
        QueryParameters.only(request);
        return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
    }

    @GetMapping("/me")
    public UserDtos.Me me(HttpServletRequest request) {
        QueryParameters.only(request);
        return UserDtos.me(users.findById(actors.current().id()).orElseThrow(() ->
                new DomainException(401, "AUTHENTICATION_REQUIRED", "Accedi per continuare.")));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response) {
        QueryParameters.only(request);
        new SecurityContextLogoutHandler().logout(request, response, SecurityContextHolder.getContext().getAuthentication());
        response.addHeader("Set-Cookie", "BBSESSION=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0" + (request.isSecure() ? "; Secure" : ""));
    }
}
