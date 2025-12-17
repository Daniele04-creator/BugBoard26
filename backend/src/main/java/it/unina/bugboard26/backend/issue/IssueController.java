package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import it.unina.bugboard26.backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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

    private boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    private User requireCurrentUser(Authentication auth) {
        if (auth == null || auth.getName() == null || auth.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        String email = auth.getName().trim().toLowerCase();
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private User resolveAssigneeOrBadRequest(Long assigneeId, User fallback) {
        if (assigneeId == null) return fallback;
        return userRepository.findById(assigneeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Assignee non trovato"));
    }

    private Issue requireIssue(Long id) {
        return issueService.getIssueById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void authorizeAdminOrAssignee(Authentication auth, User currentUser, Issue issue) {
        if (isAdmin(auth)) return;

        String currentEmail = currentUser.getEmail();
        String assigneeEmail = issue.getAssignee() != null ? issue.getAssignee().getEmail() : null;

        if (assigneeEmail == null || currentEmail == null || !assigneeEmail.equalsIgnoreCase(currentEmail)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    @PostMapping
    public ResponseEntity<Issue> create(@RequestBody CreateIssueRequest request, Authentication auth) {
        User currentUser = requireCurrentUser(auth);
        User assignee = resolveAssigneeOrBadRequest(request.assigneeId(), currentUser);

        try {
            Issue issue = issueService.createIssue(request, assignee);
            return ResponseEntity.status(HttpStatus.CREATED).body(issue);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }
    }

    @GetMapping
    public ResponseEntity<List<Issue>> list(Authentication auth) {
        requireCurrentUser(auth);
        return ResponseEntity.ok(issueService.getAllIssues());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Issue> updateIssue(
            @PathVariable Long id,
            @RequestBody UpdateIssueRequest request,
            Authentication auth
    ) {
        User currentUser = requireCurrentUser(auth);
        Issue existing = requireIssue(id);

        authorizeAdminOrAssignee(auth, currentUser, existing);

        try {
            Issue updated = issueService.updateIssue(existing, request);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIssue(@PathVariable Long id, Authentication auth) {
        User currentUser = requireCurrentUser(auth);
        Issue existing = requireIssue(id);

        authorizeAdminOrAssignee(auth, currentUser, existing);

        issueService.deleteIssue(existing);
        return ResponseEntity.noContent().build();
    }
}
