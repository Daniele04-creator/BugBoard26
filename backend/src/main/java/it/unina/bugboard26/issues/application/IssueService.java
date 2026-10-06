package it.unina.bugboard26.issues.application;

import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.api.IssueDtos.IssueDetail;
import it.unina.bugboard26.issues.domain.Issue;
import it.unina.bugboard26.issues.domain.IssueImage;
import it.unina.bugboard26.issues.domain.IssuePolicy;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.issues.persistence.IssueRepository;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.application.IdempotencyService;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import it.unina.bugboard26.users.domain.UserRole;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IssueService {
    private static final int SINGLE_FIELD_CHANGE_COUNT = 1;
    private final IssueRepository issues;
    private final IssueQueryService queries;
    private final IssueEventWriter events;
    private final ActorAccess actors;
    private final LabelDirectory labels;
    private final IdempotencyService idempotency;
    private final JsonMapper mapper;
    private final Clock clock;
    private final IssuePolicy policy = new IssuePolicy();

    public IssueService(IssueRepository issues, IssueQueryService queries, IssueEventWriter events,
                        ActorAccess actors, LabelDirectory labels, IdempotencyService idempotency,
                        JsonMapper mapper, Clock clock) {
        this.issues = issues; this.queries = queries; this.events = events; this.actors = actors;
        this.labels = labels; this.idempotency = idempotency; this.mapper = mapper; this.clock = clock;
    }

    @Transactional
    public IssueDetail create(IssueDtos.CreateIssue request, IssueImage image, UUID key) {
        requireRequest(request);
        String title = InputValidation.text(request.title(), "title", 3, 160, false);
        String description = InputValidation.text(request.description(), "description", 10, 10000, true);
        if (request.type() == null) { throw InputValidation.invalid("type", "Campo obbligatorio."); }
        Priority priority = request.priority() == null ? Priority.MEDIUM : request.priority();
        List<UUID> ids = validateIds(request.labelIds() == null ? List.of() : request.labelIds());
        Actor actor = actors.lockCurrent();
        requireCreator(actor);
        String operation = "POST /api/v1/issues";
        List<Object> canonical = List.of(operation, title, description, request.type(), priority, ids.stream().sorted().toList(),
                image == null ? "" : image.sha256(), image == null ? "" : image.originalName());
        return idempotency.execute(actor, key, operation, IdempotencyService.hash(mapper.writeValueAsString(canonical)), IssueDetail.class, () -> {
            labels.lockAndValidate(ids, List.of());
            Instant now = clock.instant();
            Issue issue = new Issue(UUID.randomUUID(), title, description, request.type(), priority, actor.id(), now);
            issues.create(issue); issues.replaceLabels(issue.id, ids);
            if (image != null) { issues.saveImage(issue.id, image, now); }
            IssueDetail detail = queries.detail(issue, actor);
            Map<String, Object> snapshot = mapper.convertValue(detail, new tools.jackson.core.type.TypeReference<>() { });
            snapshot.remove("permissions");
            snapshot.put("reporterId", actor.id()); snapshot.put("assigneeId", null); snapshot.put("duplicateOfId", null);
            events.write(issue, actor, "ISSUE_CREATED", Map.of(), snapshot, now);
            return detail;
        });
    }

    @Transactional
    public IssueDetail update(UUID id, IssueDtos.UpdateIssue request) {
        requireRequest(request);
        String title = InputValidation.text(request.title(), "title", 3, 160, false);
        String description = InputValidation.text(request.description(), "description", 10, 10000, true);
        if (request.type() == null || request.priority() == null || request.labelIds() == null) {
            throw InputValidation.invalid("issue", "Tutti i campi sono obbligatori.");
        }
        long version = InputValidation.expectedVersion(request.expectedVersion());
        List<UUID> ids = validateIds(request.labelIds());
        IssueCommandContext context = lockContext(id, null);
        Actor actor = context.actor();
        List<UUID> currentLabels = issues.labelIds(id);
        var lockedLabels = labels.lock(ids, currentLabels);
        Issue issue = issues.lock(id);
        requireEdit(actor, issue); requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        labels.validateAssociation(lockedLabels, ids, currentLabels);
        Map<String, Object> changes = new LinkedHashMap<>();
        change(changes, "title", issue.title, title); change(changes, "description", issue.description, description);
        change(changes, "type", issue.type, request.type()); change(changes, "priority", issue.priority, request.priority());
        if (!currentLabels.stream().sorted().toList().equals(ids.stream().sorted().toList())) {
            List<IssueDtos.LabelRef> before = queries.labels(id);
            issues.replaceLabels(id, ids); change(changes, "labels", before, queries.labels(id));
        }
        if (changes.isEmpty()) { return queries.detail(issue, actor); }
        issue.title = title; issue.description = description; issue.type = request.type(); issue.priority = request.priority();
        touch(issue); issues.save(issue);
        String eventType = changes.size() == SINGLE_FIELD_CHANGE_COUNT && changes.containsKey("labels") ? "LABELS_CHANGED" : "FIELDS_UPDATED";
        events.write(issue, actor, eventType, changes, null, issue.updatedAt);
        return queries.detail(issue, actor);
    }

    @Transactional
    public IssueDetail image(UUID id, IssueImage replacement, Long expectedVersion) {
        long version = InputValidation.expectedVersion(expectedVersion);
        IssueCommandContext context = lockContext(id, null);
        Actor actor = context.actor();
        Issue issue = issues.lock(id); requireEdit(actor, issue);
        requireObservedVersion(issue, context.observedVersion()); requireVersion(issue, version);
        IssueImage current = issues.image(id);
        if (current == null && replacement == null || current != null && replacement != null
                && current.sha256().equals(replacement.sha256()) && current.originalName().equals(replacement.originalName())) {
            return queries.detail(issue, actor);
        }
        touch(issue); issues.saveImage(id, replacement, issue.updatedAt); issues.save(issue);
        Map<String, Object> changes = new LinkedHashMap<>();
        change(changes, "image", IssueQueryService.imageRef(current), IssueQueryService.imageRef(replacement));
        events.write(issue, actor, "IMAGE_CHANGED", changes, null, issue.updatedAt);
        return queries.detail(issue, actor);
    }

    public record IssueCommandContext(Actor actor, long observedVersion) { }

    public IssueCommandContext lockContext(UUID issueId, UUID additional) {
        Actor initial = queries.requireReadable();
        Issue issue = issues.find(issueId);
        List<UUID> accountIds = new ArrayList<>(List.of(initial.id()));
        if (issue.assigneeId != null) { accountIds.add(issue.assigneeId); }
        if (additional != null) { accountIds.add(additional); }
        actors.lockAccounts(accountIds);
        return new IssueCommandContext(queries.requireReadable(), issue.version);
    }

    public Actor requireAdminInitial() {
        Actor actor = queries.requireReadable();
        if (actor.role() != UserRole.ADMIN) { throw forbidden(); }
        return actor;
    }

    public void requireEdit(Actor actor, Issue issue) {
        if (actor.role() == UserRole.VIEWER || actor.role() == UserRole.MEMBER && !actor.id().equals(issue.assigneeId)) {
            throw forbidden();
        }
        requireMutable(issue);
        if (!policy.canEdit(actor, queries.snapshot(issue))) { throw forbidden(); }
    }

    public static void requireVersion(Issue issue, long expected) {
        if (issue.version != expected) {
            throw new DomainException(409, "VERSION_CONFLICT", "La issue è stata modificata. Ricarica i dati.", Map.of("currentVersion", Long.toString(issue.version)));
        }
    }
    public static void requireObservedVersion(Issue issue, long observed) {
        requireVersion(issue, observed);
    }
    public static void requireMutable(Issue issue) {
        if (issue.archived || issue.status == IssueStatus.DUPLICATE) {
            throw new DomainException(409, "ISSUE_READ_ONLY", "La issue è in sola lettura.");
        }
    }
    public static void requireOpen(Issue issue) {
        requireMutable(issue);
        if (!issue.status.isOpen()) { throw new DomainException(409, "INVALID_TRANSITION", "Riapri la issue prima di modificarla."); }
    }
    public void touch(Issue issue) {
        touch(issue, clock.instant());
    }
    public void touch(Issue issue, Instant now) {
        issue.updatedAt = now; issue.lastActivityAt = now; issue.version++;
    }
    public static void change(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            Map<String, Object> delta = new LinkedHashMap<>(); delta.put("before", before); delta.put("after", after); changes.put(field, delta);
        }
    }
    public static void requireRequest(Object request) {
        if (request == null) { throw InputValidation.invalid("request", "Richiesta obbligatoria."); }
    }
    private void requireCreator(Actor actor) {
        if (actor.mustChangePassword()) { throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password per continuare."); }
        if (actor.role() == UserRole.VIEWER) { throw forbidden(); }
    }
    private List<UUID> validateIds(List<UUID> ids) {
        if (ids.size() > 20 || ids.stream().anyMatch(Objects::isNull) || ids.stream().distinct().count() != ids.size()) {
            throw InputValidation.invalid("labelIds", "Usa al massimo 20 etichette distinte.");
        }
        return List.copyOf(ids);
    }
    private static DomainException forbidden() { return new DomainException(403, "FORBIDDEN", "Non puoi modificare questa issue."); }
}
