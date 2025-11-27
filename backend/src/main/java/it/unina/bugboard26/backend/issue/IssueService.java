package it.unina.bugboard26.backend.issue;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class IssueService {

    private final IssueRepository issueRepository;

    public IssueService(IssueRepository issueRepository) {
        this.issueRepository = issueRepository;
    }

    public Issue createIssue(Issue issue) {

        issue.setId(null); // sicurezza, ignora eventuale id passato dal client

        if (issue.getStatus() == null || issue.getStatus().isBlank()) {
            issue.setStatus("TODO");
        }

        if (issue.getAssignee() == null || issue.getAssignee().isBlank()) {
            // per ora assegniamo all'admin (o metti una default fissa)
            issue.setAssignee("admin@bugboard.com");
        }

        issue.setCreatedAt(LocalDateTime.now());

        return issueRepository.save(issue);
    }

    public List<Issue> getAllIssues() {
        return issueRepository.findAll();
    }
}
