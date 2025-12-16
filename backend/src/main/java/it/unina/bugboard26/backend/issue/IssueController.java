package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/issues")
public class IssueController {

    private final IssueService issueService;
    private final UserRepository userRepository;

    public IssueController(IssueService issueService, UserRepository userRepository) {
        this.issueService = issueService;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<Issue> create(@RequestBody CreateIssueRequest request) {

        Long assigneeId = (request.assigneeId() != null) ? request.assigneeId() : 1L;

        User assignee = userRepository.findById(assigneeId)
                .orElseThrow(() -> new RuntimeException("Assignee non trovato"));

        Issue issue = issueService.createIssue(request, assignee);
        return ResponseEntity.ok(issue);
    }

    @GetMapping
    public ResponseEntity<List<Issue>> list() {
        return ResponseEntity.ok(issueService.getAllIssues());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Issue> updateIssue(
            @PathVariable Long id,
            @RequestBody UpdateIssueRequest request,
            @RequestHeader("X-User-Email") String userEmail,
            @RequestHeader("X-User-Role") String userRole
    ) {
        return issueService.getIssueById(id)
                .map(existing -> {

                    boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
                    boolean isAssignee = existing.getAssignee() != null &&
                            existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

                    if (!isAdmin && !isAssignee) {
                        return ResponseEntity.<Issue>status(HttpStatus.FORBIDDEN).build();
                    }

                    Issue updated = issueService.updateIssue(existing, request);
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> ResponseEntity.<Issue>notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIssue(
            @PathVariable Long id,
            @RequestHeader("X-User-Email") String userEmail,
            @RequestHeader("X-User-Role") String userRole
    ) {
        return issueService.getIssueById(id)
                .map(existing -> {

                    boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
                    boolean isAssignee = existing.getAssignee() != null &&
                            existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

                    if (!isAdmin && !isAssignee) {
                        return ResponseEntity.<Void>status(HttpStatus.FORBIDDEN).build();
                    }

                    issueService.deleteIssue(existing);
                    return ResponseEntity.noContent().build();
                })
                .orElseGet(() -> ResponseEntity.<Void>notFound().build());
    }
}
