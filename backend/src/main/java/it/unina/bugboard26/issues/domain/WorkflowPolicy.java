package it.unina.bugboard26.issues.domain;

import it.unina.bugboard26.reporting.domain.ResolutionCycleSnapshot;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Instant;
import java.util.UUID;

public final class WorkflowPolicy {
    public TransitionResult transition(IssueSnapshot issue, IssueStatus target, Actor actor,
                                       Instant now) {
        if (issue == null || target == null || actor == null || now == null) {
            throw new IllegalArgumentException("issue, target, actor and now are required");
        }
        requireAuthority(actor, issue);
        if (issue.archived()) {
            throw new DomainException(409, "ISSUE_READ_ONLY", "La issue è archiviata.");
        }
        if (target == IssueStatus.DUPLICATE || issue.status() == IssueStatus.DUPLICATE) {
            throw invalidTransition();
        }
        if (issue.status() == target) {
            return new TransitionResult(issue, false, null, null, false);
        }
        if (issue.status() == IssueStatus.RESOLVED && target != IssueStatus.TODO) {
            throw invalidTransition();
        }
        if (now.isBefore(issue.cycleStartedAt())) {
            throw new DomainException(400, "VALIDATION_ERROR", "L'istante precede il ciclo corrente.");
        }
        if ((target == IssueStatus.IN_PROGRESS || target == IssueStatus.RESOLVED)
                && !issue.assigneeEligible()) {
            throw new DomainException(409, "INVALID_TRANSITION",
                    "È necessario un assegnatario disponibile.");
        }
        boolean reopening = issue.status() == IssueStatus.RESOLVED;
        UUID assignee = reopening && !issue.assigneeEligible() ? null : issue.assigneeId();
        boolean resolving = target == IssueStatus.RESOLVED;
        IssueSnapshot result = new IssueSnapshot(issue.id(), target, false, assignee,
                issue.reporterId(), issue.version() + 1,
                reopening ? now : issue.cycleStartedAt(), resolving ? now : null,
                assignee != null && issue.assigneeActive(),
                assignee == null ? null : issue.assigneeRole(),
                assignee != null && issue.assigneeMustChangePassword());
        ResolutionCycleSnapshot cycle = resolving
                ? new ResolutionCycleSnapshot(issue.id(), issue.cycleStartedAt(), now, assignee) : null;
        return new TransitionResult(result, true, cycle, resolving ? actor.id() : null, resolving);
    }

    private void requireAuthority(Actor actor, IssueSnapshot issue) {
        if (actor.mustChangePassword()) {
            throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Devi cambiare la password.");
        }
        if (!actor.active() || actor.role() == UserRole.VIEWER
                || actor.role() == UserRole.MEMBER && !actor.id().equals(issue.assigneeId())) {
            throw new DomainException(403, "FORBIDDEN", "Non puoi modificare questa issue.");
        }
    }

    private DomainException invalidTransition() {
        return new DomainException(409, "INVALID_TRANSITION", "Cambio di stato non consentito.");
    }
}
