package it.unina.bugboard26.shared.domain;

import it.unina.bugboard26.users.domain.UserRole;
import java.util.Objects;
import java.util.UUID;

public record Actor(UUID id, UserRole role, boolean active, boolean mustChangePassword,
                    long authVersion) {
    public Actor {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(role, "role");
        if (authVersion < 0) {
            throw new IllegalArgumentException("authVersion cannot be negative");
        }
    }

    public boolean eligible() {
        return active && !mustChangePassword;
    }
}
