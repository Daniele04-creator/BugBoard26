package it.unina.bugboard26.shared.api;

import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ProblemWriter {
    private final JsonMapper mapper;

    public ProblemWriter(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public Problem problem(HttpServletRequest request, DomainException error) {
        return new Problem("urn:bugboard:problem:" + error.code(), "Richiesta non completata",
                error.status(), error.getMessage(), request.getRequestURI(), error.code(),
                String.valueOf(request.getAttribute("requestId")), error.fields().entrySet().stream()
                    .map(entry -> new Problem.FieldError(entry.getKey(), entry.getValue())).toList());
    }

    public void write(HttpServletRequest request, HttpServletResponse response, DomainException error)
            throws IOException {
        response.setStatus(error.status());
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");
        mapper.writeValue(response.getWriter(), problem(request, error));
    }
}
