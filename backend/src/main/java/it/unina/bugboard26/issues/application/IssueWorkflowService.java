package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.api.IssueDtos.IssueDetail;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueSnapshot;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.TransitionResult;
import it.unina.bugboard26.issues.domain.WorkflowPolicy;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static it.unina.bugboard26.issues.application.IssueService.change;
import static it.unina.bugboard26.issues.application.IssueService.requireVersion;

@Service
public class IssueWorkflowService {
    private static final String ASSIGNEE_FIELD = "assignee";
    private static final String ASSIGNEE_ID_FIELD = "assigneeId";
    private static final String STATUS_FIELD = "status";
    private final IssueRepository issues;
    private final IssueService commands;
    private final IssueQueryService queries;
    private final IssueEventWriter events;
    private final UserRepository users;
    private final ActorAccess actors;
    private final Clock clock;
    private final WorkflowPolicy policy = new WorkflowPolicy();
    public IssueWorkflowService(IssueRepository issues, IssueService commands, IssueQueryService queries,
                                IssueEventWriter events, UserRepository users, ActorAccess actors, Clock clock) {
        this.issues = issues; this.commands = commands; this.queries = queries; this.events = events;
        this.users = users; this.actors = actors; this.clock = clock;
    }

    @Transactional
    public IssueDetail assign(UUID id, IssueDtos.Assignment request) {
        IssueService.requireRequest(request);
        commands.requireAdminInitial();
        long version = InputValidation.expectedVersion(request.expectedVersion());
        var context = commands.lockContext(id, request.assigneeId());
        Actor actor = context.actor();
        requireAdmin(actor);
        Issue issue = issues.lock(id); IssueService.requireOpen(issue);
        IssueService.requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        if (Objects.equals(issue.assigneeId, request.assigneeId())) { return queries.detail(issue, actor); }
        UserAccount candidate = request.assigneeId() == null ? null : users.findById(request.assigneeId()).orElseThrow();
        if (candidate != null && !eligible(candidate)) {
            throw new DomainException(409, "ASSIGNEE_NOT_ELIGIBLE", "L'utente non è disponibile per l'assegnazione.");
        }
        Map<String, Object> changes = new LinkedHashMap<>();
        change(changes, ASSIGNEE_FIELD, queries.ref(issue.assigneeId), queries.ref(request.assigneeId()));
        change(changes, ASSIGNEE_ID_FIELD, issue.assigneeId, request.assigneeId());
        if (issue.status == IssueStatus.IN_PROGRESS) { change(changes, STATUS_FIELD, issue.status, IssueStatus.TODO); issue.status = IssueStatus.TODO; }
        issue.assigneeId = request.assigneeId(); commands.touch(issue); issues.save(issue);
        UUID event = events.write(issue, actor, "ASSIGNMENT_CHANGED", changes, null, issue.updatedAt);
        if (issue.assigneeId != null) { events.notify(issue.assigneeId, event, id, "ASSIGNED", issue.updatedAt); }
        return queries.detail(issue, actor);
    }

    @Transactional
    public IssueDetail state(UUID id, IssueDtos.State request) {
        IssueService.requireRequest(request);
        if (request.status() == null) { throw InputValidation.invalid(STATUS_FIELD, "Campo obbligatorio."); }
        long version = InputValidation.expectedVersion(request.expectedVersion());
        var context = commands.lockContext(id, null);
        Actor actor = context.actor();
        Issue issue = issues.lock(id);
        if (actor.role() == UserRole.VIEWER || actor.role() == UserRole.MEMBER && !actor.id().equals(issue.assigneeId)) {
            throw new DomainException(403, "FORBIDDEN", "Non puoi modificare questa issue.");
        }
        if (issue.archived || issue.status == IssueStatus.DUPLICATE && request.status() != IssueStatus.DUPLICATE) {
            IssueService.requireMutable(issue);
        }
        IssueService.requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        Instant now = clock.instant();
        TransitionResult result = policy.transition(queries.snapshot(issue), request.status(), actor, now);
        if (!result.changed()) { return queries.detail(issue, actor); }
        Map<String, Object> changes = new LinkedHashMap<>();
        IssueSnapshot after = result.snapshot();
        change(changes, STATUS_FIELD, issue.status, after.status()); change(changes, "resolvedAt", issue.resolvedAt, after.resolvedAt());
        change(changes, "cycleStartedAt", issue.cycleStartedAt, after.cycleStartedAt());
        change(changes, ASSIGNEE_FIELD, queries.ref(issue.assigneeId), queries.ref(after.assigneeId()));
        change(changes, ASSIGNEE_ID_FIELD, issue.assigneeId, after.assigneeId());
        issue.status = after.status(); issue.resolvedAt = after.resolvedAt(); issue.cycleStartedAt = after.cycleStartedAt();
        issue.assigneeId = after.assigneeId(); commands.touch(issue, now); issues.save(issue);
        UUID event = events.write(issue, actor, "STATE_CHANGED", changes, null, now);
        if (result.resolutionCycle() != null) { events.cycle(issue, event, actor, now); events.notify(issue.reporterId, event, id, "RESOLVED", now); }
        return queries.detail(issue, actor);
    }

    @Transactional
    public IssueDetail deadline(UUID id, IssueDtos.Deadline request) {
        IssueService.requireRequest(request);
        commands.requireAdminInitial();
        long version = InputValidation.expectedVersion(request.expectedVersion());
        LocalDate date = request.dueDate();
        if (date != null && (date.isBefore(LocalDate.now(clock.withZone(ZoneId.of("Europe/Rome"))))
                || date.isAfter(LocalDate.of(2100, 12, 31)))) { throw InputValidation.invalid("dueDate", "Usa una data da oggi fino al 31/12/2100."); }
        var context = commands.lockContext(id, null); Actor actor = context.actor(); requireAdmin(actor);
        Issue issue = issues.lock(id); IssueService.requireOpen(issue);
        IssueService.requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        if (Objects.equals(issue.dueDate, date)) { return queries.detail(issue, actor); }
        Map<String, Object> changes = new LinkedHashMap<>(); change(changes, "dueDate", issue.dueDate, date);
        issue.dueDate = date; commands.touch(issue); issues.save(issue);
        events.write(issue, actor, "DEADLINE_CHANGED", changes, null, issue.updatedAt);
        return queries.detail(issue, actor);
    }

    @Transactional
    // Restoring explicitly clears nullable archive metadata and an unavailable assignee (DOM-08).
    @SuppressWarnings("PMD.NullAssignment")
    public IssueDetail archive(UUID id, IssueDtos.Archive request) {
        IssueService.requireRequest(request);
        commands.requireAdminInitial();
        if (request.archived() == null) { throw InputValidation.invalid("archived", "Campo obbligatorio."); }
        long version = InputValidation.expectedVersion(request.expectedVersion());
        var context = commands.lockContext(id, null); Actor actor = context.actor(); requireAdmin(actor);
        Issue issue = issues.lock(id);
        IssueService.requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        if (issue.archived == request.archived()) { return queries.detail(issue, actor); }
        Map<String, Object> changes = new LinkedHashMap<>();
        change(changes, "archived", issue.archived, request.archived());
        Instant now = clock.instant();
        change(changes, "archivedAt", issue.archivedAt, request.archived() ? now : null);
        change(changes, "archivedBy", queries.ref(issue.archivedBy), request.archived() ? queries.ref(actor.id()) : null);
        issue.archived = request.archived(); issue.archivedAt = issue.archived ? now : null; issue.archivedBy = issue.archived ? actor.id() : null;
        if (!issue.archived && issue.status.isOpen() && issue.assigneeId != null && !queries.snapshot(issue).assigneeEligible()) {
            change(changes, ASSIGNEE_FIELD, queries.ref(issue.assigneeId), null); change(changes, ASSIGNEE_ID_FIELD, issue.assigneeId, null);
            change(changes, STATUS_FIELD, issue.status, IssueStatus.TODO); issue.assigneeId = null; issue.status = IssueStatus.TODO;
        }
        commands.touch(issue, now); issues.save(issue);
        events.write(issue, actor, issue.archived ? "ARCHIVED" : "RESTORED", changes, null, now);
        return queries.detail(issue, actor);
    }

    @Transactional
    // Duplicate undo explicitly clears the canonical link and closed-state timestamp (DOM-09).
    @SuppressWarnings("PMD.NullAssignment")
    public IssueDetail duplicate(UUID id, IssueDtos.Duplicate request) {
        IssueService.requireRequest(request);
        Actor initial = commands.requireAdminInitial();
        long version = InputValidation.expectedVersion(request.expectedVersion());
        Issue before = issues.find(id);
        List<UUID> accountIds = new ArrayList<>(List.of(initial.id()));
        if (before.assigneeId != null) { accountIds.add(before.assigneeId); }
        actors.lockAccounts(accountIds); Actor actor = queries.requireReadable(); requireAdmin(actor);
        Map<UUID, Issue> locked = new LinkedHashMap<>();
        List<UUID> issueIds = new ArrayList<>(List.of(id));
        if (request.targetIssueId() != null) { issueIds.add(request.targetIssueId()); }
        issueIds.stream().distinct().sorted().forEach(issueId -> locked.put(issueId, issues.lock(issueId)));
        Issue issue = locked.get(id);
        if (issue.archived) { throw new DomainException(409, "ISSUE_READ_ONLY", "La issue è archiviata."); }
        IssueService.requireObservedVersion(issue, before.version); requireVersion(issue, version);
        UUID targetId = request.targetIssueId();
        if (issue.status == IssueStatus.DUPLICATE && Objects.equals(issue.duplicateOfId, targetId)) { return queries.detail(issue, actor); }
        if (targetId == null && issue.status != IssueStatus.DUPLICATE) { return queries.detail(issue, actor); }
        if (targetId != null) {
            if (issue.status == IssueStatus.DUPLICATE) { throw new DomainException(409, "ISSUE_READ_ONLY", "Annulla prima la duplicazione corrente."); }
            Issue target = locked.get(targetId);
            if (targetId.equals(id) || target.archived || target.status == IssueStatus.DUPLICATE || issues.hasIncomingDuplicates(id)) {
                throw new DomainException(409, "DUPLICATE_CONFLICT", "Scegli una issue canonica valida, senza catene o cicli.");
            }
        }
        Map<String, Object> changes = new LinkedHashMap<>();
        change(changes, "duplicateOfId", issue.duplicateOfId, targetId);
        change(changes, "duplicateOf", duplicateRef(issue.duplicateOfId), duplicateRef(targetId));
        IssueStatus targetState = targetId == null ? IssueStatus.TODO : IssueStatus.DUPLICATE;
        change(changes, STATUS_FIELD, issue.status, targetState); change(changes, "resolvedAt", issue.resolvedAt, null);
        issue.status = targetState; issue.resolvedAt = null; issue.duplicateOfId = targetId;
        Instant now = clock.instant();
        if (targetId == null) {
            change(changes, "cycleStartedAt", issue.cycleStartedAt, now); issue.cycleStartedAt = now;
            if (issue.assigneeId != null && !queries.snapshot(issue).assigneeEligible()) {
                change(changes, ASSIGNEE_FIELD, queries.ref(issue.assigneeId), null); change(changes, ASSIGNEE_ID_FIELD, issue.assigneeId, null); issue.assigneeId = null;
            }
        }
        commands.touch(issue, now); issues.save(issue);
        events.write(issue, actor, targetId == null ? "DUPLICATE_UNDONE" : "DUPLICATE_MARKED", changes, null, issue.updatedAt);
        return queries.detail(issue, actor);
    }

    private IssueDtos.DuplicateRef duplicateRef(UUID id) {
        if (id == null) { return null; }
        Issue issue = issues.find(id); return new IssueDtos.DuplicateRef(issue.id, issue.number, issue.title);
    }
    private boolean eligible(UserAccount account) { return account.isActive() && !account.isMustChangePassword() && account.getRole().canBeAssigned(); }
    private void requireAdmin(Actor actor) {
        if (actor.role() != UserRole.ADMIN) { throw new DomainException(403, "FORBIDDEN", "Operazione riservata all'amministratore."); }
    }
}
