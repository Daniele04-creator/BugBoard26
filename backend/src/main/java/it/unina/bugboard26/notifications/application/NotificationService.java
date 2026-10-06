package it.unina.bugboard26.notifications.application;

import it.unina.bugboard26.notifications.api.NotificationDtos;
import it.unina.bugboard26.notifications.domain.Notification;
import it.unina.bugboard26.notifications.persistence.NotificationRepository;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.application.ActorAccess;
import it.unina.bugboard26.shared.domain.Actor;
import it.unina.bugboard26.shared.domain.DomainException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final NotificationRepository notifications;
    private final ActorAccess actors;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, ActorAccess actors, Clock clock) {
        this.notifications = notifications;
        this.actors = actors;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<NotificationDtos.Notification> list(boolean unreadOnly, int page, int size) {
        Actor actor = ready(actors.current());
        QueryParameters.pagination(page, size);
        long total = notifications.count(actor.id(), unreadOnly);
        return PageResponse.of(notifications.list(actor.id(), unreadOnly, page, size).stream().map(NotificationDtos::notification).toList(), page, size, total);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public NotificationDtos.UnreadCount unreadCount() {
        Actor actor = ready(actors.current());
        return new NotificationDtos.UnreadCount(notifications.count(actor.id(), true));
    }

    @Transactional
    public NotificationDtos.Notification read(UUID id) {
        Actor actor = ready(actors.lockCurrent());
        Notification notification = notifications.lock(actor.id(), id).orElseThrow(() ->
            new DomainException(404, "NOT_FOUND", "Notifica non trovata."));
        if (notification.readAt() != null) { return NotificationDtos.notification(notification); }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        notifications.markRead(actor.id(), id, now);
        return NotificationDtos.notification(notification.markRead(now));
    }

    @Transactional
    public NotificationDtos.ReadAllResult readAll() {
        Actor actor = ready(actors.lockCurrent());
        return new NotificationDtos.ReadAllResult(notifications.markAllRead(actor.id(), clock.instant().truncatedTo(ChronoUnit.MICROS)));
    }

    private static Actor ready(Actor actor) {
        if (actor.mustChangePassword()) {
            throw new DomainException(403, "PASSWORD_CHANGE_REQUIRED", "Cambia prima la password temporanea.");
        }
        return actor;
    }

}
