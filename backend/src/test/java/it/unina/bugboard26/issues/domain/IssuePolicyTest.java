package it.unina.bugboard26.issues.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class IssuePolicyTest {
    private static final UUID ACTOR = new UUID(0, 1);
    private static final UUID OTHER = new UUID(0, 2);
    private final IssuePolicy policy = new IssuePolicy();

    static Stream<Arguments> permissionMatrix() {
        List<Arguments> arguments = new ArrayList<>();
        for (UserRole role : UserRole.values()) {
            for (boolean active : List.of(true, false)) {
                for (boolean change : List.of(true, false)) {
                    for (boolean archived : List.of(true, false)) {
                        for (IssueStatus state : IssueStatus.values()) {
                            for (UUID assignee : new UUID[] {ACTOR, OTHER, null}) {
                                for (UUID reporter : new UUID[] {ACTOR, OTHER}) {
                                    boolean allowedIdentity = active && !change;
                                    boolean allowedIssue = !archived && state != IssueStatus.DUPLICATE;
                                    boolean allowedRole = switch (role) {
                                        case ADMIN -> true;
                                        case MEMBER -> ACTOR.equals(assignee);
                                        case VIEWER -> false;
                                    };
                                    arguments.add(Arguments.of(role, active, change, archived, state,
                                            assignee, reporter, allowedIdentity && allowedIssue && allowedRole));
                                }
                            }
                        }
                    }
                }
            }
        }
        return arguments.stream();
    }

    @ParameterizedTest
    @MethodSource("permissionMatrix")
    void enforcesAllPermissionDimensions(UserRole role, boolean active, boolean change,
                                         boolean archived, IssueStatus state, UUID assignee,
                                         UUID reporter, boolean expected) {
        IssueSnapshot issue = new IssueSnapshot(new UUID(0, 3), state, archived, assignee, reporter,
                0, Instant.EPOCH, null, true, UserRole.MEMBER, false);
        assertEquals(expected, policy.canEdit(new Actor(ACTOR, role, active, change, 0), issue));
    }

    @Test
    void requiresValidInputs() {
        Actor actor = new Actor(ACTOR, UserRole.ADMIN, true, false, 0);
        IssueSnapshot issue = new IssueSnapshot(OTHER, IssueStatus.TODO, false, null, ACTOR,
                0, Instant.EPOCH, null, false, null, false);
        assertThrows(NullPointerException.class, () -> policy.canEdit(null, issue));
        assertThrows(NullPointerException.class, () -> policy.canEdit(actor, null));
        assertThrows(NullPointerException.class, () -> new Actor(null, UserRole.ADMIN, true, false, 0));
        assertThrows(NullPointerException.class, () -> new IssueSnapshot(null, IssueStatus.TODO,
                false, null, ACTOR, 0, Instant.EPOCH, null, false, null, false));
    }
}
