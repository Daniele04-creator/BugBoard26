package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

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

        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Issue existing = opt.get();

        boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
        boolean isAssignee = existing.getAssignee() != null &&
                existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

        if (!isAdmin && !isAssignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Issue updated = issueService.updateIssue(existing, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIssue(
            @PathVariable Long id,
            @RequestHeader("X-User-Email") String userEmail,
            @RequestHeader("X-User-Role") String userRole
    ) {

        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Issue existing = opt.get();

        boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
        boolean isAssignee = existing.getAssignee() != null &&
                existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

        if (!isAdmin && !isAssignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        issueService.deleteIssue(existing);
        return ResponseEntity.noContent().build();
    }
}
