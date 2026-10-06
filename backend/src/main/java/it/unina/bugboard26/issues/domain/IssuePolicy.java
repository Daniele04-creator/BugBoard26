package it.unina.bugboard26.issues.domain;

import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.users.domain.UserRole;
import java.util.Objects;

public final class IssuePolicy {
    public boolean canEdit(Actor actor, IssueSnapshot issue) {
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(issue, "issue");
        if (!actor.eligible() || issue.archived() || issue.status() == IssueStatus.DUPLICATE) {
            return false;
        }
        return actor.role() == UserRole.ADMIN
                || actor.role() == UserRole.MEMBER && actor.id().equals(issue.assigneeId());
    }
}
