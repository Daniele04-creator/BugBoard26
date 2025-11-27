package it.unina.bugboard26.backend.issue;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

import java.util.List;

@RestController
@RequestMapping("/api/issues")
@CrossOrigin(origins = "*")
public class IssueController {

    private final IssueService issueService;

    public IssueController(IssueService issueService) {
        this.issueService = issueService;
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
}
