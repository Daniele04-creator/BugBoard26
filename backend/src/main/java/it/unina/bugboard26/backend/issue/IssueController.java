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

    private boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    private User currentUserOrUnauthorized(Authentication auth) {
        if (auth == null || auth.getName() == null || auth.getName().isBlank()) {
            return null;
        }
        String email = auth.getName().trim().toLowerCase();
        return userRepository.findByEmail(email).orElse(null);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateIssueRequest request, Authentication auth) {
        User currentUser = currentUserOrUnauthorized(auth);
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        User assignee = currentUser;

        if (request.assigneeId() != null) {
            Optional<User> assigneeOpt = userRepository.findById(request.assigneeId());
            if (assigneeOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Assignee non trovato");
            }
            assignee = assigneeOpt.get();
        }

        try {
            Issue issue = issueService.createIssue(request, assignee);
            return ResponseEntity.status(HttpStatus.CREATED).body(issue);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ex.getMessage());
        }
    }

    @GetMapping
    public ResponseEntity<List<Issue>> list(Authentication auth) {
        if (currentUserOrUnauthorized(auth) == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(issueService.getAllIssues());
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateIssue(@PathVariable Long id, @RequestBody UpdateIssueRequest request, Authentication auth) {
        User currentUser = currentUserOrUnauthorized(auth);
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        Issue existing = opt.get();

        boolean admin = isAdmin(auth);
        boolean assignee =
                existing.getAssignee() != null &&
                existing.getAssignee().getEmail() != null &&
                existing.getAssignee().getEmail().equalsIgnoreCase(currentUser.getEmail());

        if (!admin && !assignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            Issue updated = issueService.updateIssue(existing, request);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteIssue(@PathVariable Long id, Authentication auth) {
        User currentUser = currentUserOrUnauthorized(auth);
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Issue> opt = issueService.getIssueById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        Issue existing = opt.get();

        boolean admin = isAdmin(auth);
        boolean assignee =
                existing.getAssignee() != null &&
                existing.getAssignee().getEmail() != null &&
                existing.getAssignee().getEmail().equalsIgnoreCase(currentUser.getEmail());

        if (!admin && !assignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        issueService.deleteIssue(existing);
        return ResponseEntity.noContent().build();
    }
}
