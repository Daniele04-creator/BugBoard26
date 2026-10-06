package it.unina.bugboard26.reporting.api;

import it.unina.bugboard26.reporting.application.AssignmentSuggestionService;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AssignmentSuggestionController {
    private final AssignmentSuggestionService suggestions;
    public AssignmentSuggestionController(AssignmentSuggestionService suggestions) { this.suggestions = suggestions; }
    @GetMapping("/api/v1/issues/{id}/assignment-suggestions")
    public ReportingDtos.Suggestions suggestions(@PathVariable UUID id, HttpServletRequest request) {
        QueryParameters.only(request); return suggestions.suggestions(id);
    }
}
