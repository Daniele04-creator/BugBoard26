package it.unina.bugboard26.backend.issue;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

import java.util.List;

@RestController
@RequestMapping("/api/issues")
@CrossOrigin(origins = "*")
public class IssueController {

    private final IssueService issueService;
    private final IssueRepository issueRepository;

    public IssueController(IssueService issueService, IssueRepository issueRepository) {
        this.issueService = issueService;
        this.issueRepository = issueRepository;
    }

    // CREATE
    @PostMapping
    public ResponseEntity<Issue> create(@RequestBody Issue issue) {
        Issue saved = issueService.createIssue(issue);
        return ResponseEntity.ok(saved);
    }

    // LIST
    @GetMapping
    public ResponseEntity<List<Issue>> list() {
        return ResponseEntity.ok(issueService.getAllIssues());
    }

    // 👇 UPDATE (Punto 9)
    @PutMapping("/{id}")
    public ResponseEntity<?> updateIssue(
            @PathVariable Long id,
            @RequestBody Issue updated,
            @RequestHeader("X-User-Email") String userEmail,
            @RequestHeader("X-User-Role") String userRole
    ) {
        return issueRepository.findById(id)
                .map(existing -> {

                    boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
                    boolean isAssignee = existing.getAssignee() != null &&
                            existing.getAssignee().equalsIgnoreCase(userEmail);

                    if (!isAdmin && !isAssignee) {
                        // Punto 9: non puoi modificare issue non tua
                        return ResponseEntity.status(403).body("Non hai i permessi per modificare questa issue");
                    }

                    Issue saved = issueService.updateIssue(existing, updated);
                    return ResponseEntity.ok(saved);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // 👇 DELETE (facoltativo ma coerente col Punto 9)
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteIssue(
            @PathVariable Long id,
            @RequestHeader("X-User-Email") String userEmail,
            @RequestHeader("X-User-Role") String userRole
    ) {
        return issueRepository.findById(id)
                .map(existing -> {
                    boolean isAdmin = "ADMIN".equalsIgnoreCase(userRole);
                    boolean isAssignee = existing.getAssignee() != null &&
                            existing.getAssignee().equalsIgnoreCase(userEmail);

                    if (!isAdmin && !isAssignee) {
                        return ResponseEntity.status(403).body("Non hai i permessi per eliminare questa issue");
                    }

                    issueService.deleteIssue(existing);
                    return ResponseEntity.noContent().build();
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
