package it.unina.bugboard26.notifications.api;

import it.unina.bugboard26.notifications.application.NotificationService;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) { this.notifications = notifications; }

    @GetMapping
    public PageResponse<NotificationDtos.Notification> list(@RequestParam(defaultValue = "false") String unreadOnly,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size, HttpServletRequest request) {
        QueryParameters.only(request, "unreadOnly", "page", "size");
        if (request.getParameterMap().values().stream().anyMatch(values -> values.length != 1)
            || !("true".equals(unreadOnly) || "false".equals(unreadOnly))) {
            throw new DomainException(400, "INVALID_FILTER", "Filtro notifiche non valido.");
        }
        return notifications.list("true".equals(unreadOnly), page, size);
    }

    @GetMapping("/unread-count")
    public NotificationDtos.UnreadCount unreadCount(HttpServletRequest request) {
        QueryParameters.only(request);
        return notifications.unreadCount();
    }

    @PutMapping("/{id}/read")
    public NotificationDtos.Notification read(@PathVariable UUID id, HttpServletRequest request) {
        QueryParameters.only(request);
        return notifications.read(id);
    }

    @PutMapping("/read-all")
    public NotificationDtos.ReadAllResult readAll(HttpServletRequest request) {
        QueryParameters.only(request);
        return notifications.readAll();
    }
}
