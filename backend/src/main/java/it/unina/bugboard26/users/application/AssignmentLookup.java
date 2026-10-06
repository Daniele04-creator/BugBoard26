package it.unina.bugboard26.users.application;

import java.util.UUID;

public interface AssignmentLookup {
    boolean hasOpenAssignments(UUID userId);
}
