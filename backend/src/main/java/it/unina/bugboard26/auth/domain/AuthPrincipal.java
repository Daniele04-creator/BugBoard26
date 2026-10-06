package it.unina.bugboard26.auth.domain;

import java.io.Serializable;
import java.util.UUID;
import org.springframework.security.core.AuthenticatedPrincipal;

public record AuthPrincipal(UUID id, long authVersion) implements AuthenticatedPrincipal, Serializable {
    private static final long serialVersionUID = 1L;

    @Override
    public String getName() {
        return id.toString();
    }
}
