package it.unina.bugboard26.auth.api;

import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationConverter;
import tools.jackson.databind.json.JsonMapper;

public class LoginConverter implements AuthenticationConverter {
    private static final String VALIDATION_ERROR = "VALIDATION_ERROR";
    private final JsonMapper mapper;

    public LoginConverter(JsonMapper mapper) { this.mapper = mapper; }

    @Override
    public Authentication convert(HttpServletRequest request) {
        if (request.getContentType() == null || !request.getContentType().startsWith("application/json")) {
            throw new LoginRequestException(400, VALIDATION_ERROR, "Invia credenziali in formato JSON.", 0);
        }
        try {
            QueryParameters.only(request);
            LoginRequest input = mapper.readValue(request.getInputStream(), LoginRequest.class);
            if (input == null) {
                throw new LoginRequestException(400, VALIDATION_ERROR, "Formato credenziali non valido.", 0);
            }
            String email = InputValidation.email(input.email());
            if (input.password() == null || input.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 512) {
                throw new LoginRequestException(400, VALIDATION_ERROR, "Credenziali non valide.", 0);
            }
            return UsernamePasswordAuthenticationToken.unauthenticated(email, input.password());
        } catch (DomainException error) {
            throw new LoginRequestException(error.status(), error.code(), error.getMessage(), 0);
        } catch (tools.jackson.databind.exc.UnrecognizedPropertyException error) {
            throw new LoginRequestException(400, "UNKNOWN_FIELD", "Campo sconosciuto nella richiesta.", 0);
        } catch (IOException | tools.jackson.core.JacksonException error) {
            throw new LoginRequestException(400, VALIDATION_ERROR, "Formato credenziali non valido.", 0);
        }
    }

    public record LoginRequest(String email, String password) { }
}
