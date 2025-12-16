package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
    public ResponseEntity<Issue> create(@RequestBody CreateIssueRequest request, Authentication auth) {
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
            Authentication auth
    ) {
        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Issue existing = opt.get();

        boolean isAdmin = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));

        String userEmail = (auth != null) ? auth.getName() : null;

        boolean isAssignee = userEmail != null
                && existing.getAssignee() != null
                && existing.getAssignee().getEmail() != null
                && existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

        if (!isAdmin && !isAssignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Issue updated = issueService.updateIssue(existing, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIssue(@PathVariable Long id, Authentication auth) {
        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Issue existing = opt.get();

        boolean isAdmin = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));

        String userEmail = (auth != null) ? auth.getName() : null;

        boolean isAssignee = userEmail != null
                && existing.getAssignee() != null
                && existing.getAssignee().getEmail() != null
                && existing.getAssignee().getEmail().equalsIgnoreCase(userEmail);

        if (!isAdmin && !isAssignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        issueService.deleteIssue(existing);
        return ResponseEntity.noContent().build();
    }
}
