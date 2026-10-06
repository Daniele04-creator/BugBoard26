package it.unina.bugboard26.issues.domain;

import it.unina.bugboard26.users.domain.UserRole;
import java.util.Objects;
import java.util.UUID;

public record AssignmentCandidate(UUID id, String email, boolean active, UserRole role,
                                  boolean mustChangePassword) {
    public AssignmentCandidate {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(email, "email");
        Objects.requireNonNull(role, "role");
    }

    public boolean eligible() {
        return active && !mustChangePassword && role.canBeAssigned();
    }
}
