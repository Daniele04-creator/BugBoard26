package it.unina.bugboard26.issues.api;

import it.unina.bugboard26.issues.application.IssueWorkflowService;
import it.unina.bugboard26.shared.api.QueryParameters;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/issues/{id}")
public class IssueWorkflowController {
    private final IssueWorkflowService service;
    public IssueWorkflowController(IssueWorkflowService service) { this.service = service; }
    @PutMapping("/assignment")
    public IssueDtos.IssueDetail assign(@PathVariable UUID id, @RequestBody IssueDtos.Assignment body, HttpServletRequest request) {
        QueryParameters.only(request); return service.assign(id, body);
    }
    @PutMapping("/state")
    public IssueDtos.IssueDetail state(@PathVariable UUID id, @RequestBody IssueDtos.State body, HttpServletRequest request) {
        QueryParameters.only(request); return service.state(id, body);
    }
    @PutMapping("/deadline")
    public IssueDtos.IssueDetail deadline(@PathVariable UUID id, @RequestBody IssueDtos.Deadline body, HttpServletRequest request) {
        QueryParameters.only(request); return service.deadline(id, body);
    }
    @PutMapping("/archive")
    public IssueDtos.IssueDetail archive(@PathVariable UUID id, @RequestBody IssueDtos.Archive body, HttpServletRequest request) {
        QueryParameters.only(request); return service.archive(id, body);
    }
    @PutMapping("/duplicate")
    public IssueDtos.IssueDetail duplicate(@PathVariable UUID id, @RequestBody IssueDtos.Duplicate body, HttpServletRequest request) {
        QueryParameters.only(request); return service.duplicate(id, body);
    }
}
