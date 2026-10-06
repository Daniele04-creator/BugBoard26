package it.unina.bugboard26.labels.api;

import it.unina.bugboard26.labels.application.LabelService;
import it.unina.bugboard26.shared.api.PageResponse;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/labels")
public class LabelController {
    private final LabelService labels;

    public LabelController(LabelService labels) { this.labels = labels; }

    @GetMapping
    public PageResponse<LabelDtos.Label> list(@RequestParam(required = false) String q,
            @RequestParam(defaultValue = "true") String active, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, HttpServletRequest request) {
        QueryParameters.only(request, "q", "active", "page", "size");
        if (request.getParameterMap().values().stream().anyMatch(values -> values.length != 1)) {
            throw new it.unina.bugboard26.shared.domain.DomainException(400, "INVALID_FILTER", "Parametro ripetuto non valido.");
        }
        return labels.list(q, active, page, size);
    }
}
