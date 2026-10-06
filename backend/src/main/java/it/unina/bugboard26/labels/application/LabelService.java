package it.unina.bugboard26.labels.application;

import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.labels.domain.Label;
import it.unina.bugboard26.labels.persistence.LabelEventRepository;
import it.unina.bugboard26.labels.persistence.LabelEventRepository.Change;
import it.unina.bugboard26.labels.persistence.LabelRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LabelService {
    private static final String NAME_FIELD = "name";
    private static final Set<String> COLORS = Set.of("gray", "blue", "green", "amber", "red", "purple");
    private final LabelRepository labels;
    private final LabelEventRepository events;
    private final ActorAccess actors;
    private final Clock clock;

    public LabelService(LabelRepository labels, LabelEventRepository events, ActorAccess actors, Clock clock) {
        this.labels = labels;
        this.events = events;
        this.actors = actors;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<LabelDtos.Label> list(String query, String active, int page, int size) {
        requireReady(actors.current());
        QueryParameters.pagination(page, size);
        String search = query == null ? "" : InputValidation.text(query, "q", 0, 100, false);
        String escaped = InputValidation.searchKey(search).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        Boolean activeFilter = switch (active) {
            case "true" -> true;
            case "false" -> false;
            case "all" -> null;
            default -> throw new DomainException(400, "INVALID_FILTER", "Filtro active non valido.");
        };
        long total = labels.count(escaped, activeFilter);
        return PageResponse.of(labels.list(escaped, activeFilter, page, size).stream().map(LabelDtos::label).toList(), page, size, total);
    }

    @Transactional
    public LabelDtos.Label create(LabelDtos.CreateLabel command) {
        String name = InputValidation.text(command.name(), NAME_FIELD, 1, 32, false);
        String color = color(command.color());
        Actor actor = actors.requireAdmin();
        Instant now = clock.instant();
        Label label = new Label(UUID.randomUUID(), name, InputValidation.searchKey(name), color, true, 0, now, now);
        try {
            labels.insert(label);
        } catch (DuplicateKeyException exception) {
            throw nameConflict();
        }
        events.insert(actor.id(), label.id(), now, "LABEL_CREATED", List.of(
            new Change(NAME_FIELD, null, name), new Change("color", null, color), new Change("active", null, true)));
        return LabelDtos.label(label);
    }

    @Transactional
    public LabelDtos.Label update(UUID id, LabelDtos.UpdateLabel command) {
        String name = InputValidation.text(command.name(), NAME_FIELD, 1, 32, false);
        String color = color(command.color());
        if (command.active() == null) { throw InputValidation.invalid("active", "Campo obbligatorio."); }
        long expected = InputValidation.expectedVersion(command.expectedVersion());
        Actor actor = actors.requireAdmin();
        Label previous = labels.lock(id).orElseThrow(() -> new DomainException(404, "NOT_FOUND", "Etichetta non trovata."));
        if (previous.version() != expected) {
            throw new DomainException(409, "VERSION_CONFLICT", "L'etichetta è stata modificata. Ricarica i dati.",
                Map.of("currentVersion", Long.toString(previous.version())));
        }
        List<Change> changes = new ArrayList<>();
        changed(changes, NAME_FIELD, previous.name(), name);
        changed(changes, "color", previous.color(), color);
        changed(changes, "active", previous.active(), command.active());
        if (changes.isEmpty()) { return LabelDtos.label(previous); }
        Instant now = clock.instant();
        Label label = new Label(id, name, InputValidation.searchKey(name), color, command.active(),
            previous.version() + 1, previous.createdAt(), now);
        try {
            labels.update(label);
        } catch (DuplicateKeyException exception) {
            throw nameConflict();
        }
        events.insert(actor.id(), id, now, "LABEL_UPDATED", changes);
        return LabelDtos.label(label);
    }

    private static void changed(List<Change> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) { changes.add(new Change(field, before, after)); }
    }

    private static String color(String value) {
        if (!COLORS.contains(value == null ? "" : value)) { throw InputValidation.invalid("color", "Colore non valido."); }
        return value;
    }

    private static DomainException nameConflict() {
        return new DomainException(409, "LABEL_ALREADY_EXISTS", "Esiste già un'etichetta con questo nome.");
    }

    private static void requireReady(Actor actor) {
        if (actor.mustChangePassword()) {
            throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia prima la password temporanea.");
        }
    }
}
