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
        issue.setId(null);

        if (issue.getStatus() == null || issue.getStatus().isBlank()) {
            issue.setStatus("TODO");
        }

        if (issue.getAssignee() == null || issue.getAssignee().isBlank()) {
            issue.setAssignee("admin@bugboard.com");
        }

        issue.setCreatedAt(LocalDateTime.now());

        return issueRepository.save(issue);
    }

    public List<Issue> getAllIssues() {
        return issueRepository.findAll();
    }

    // 👇 Punto 9: update con controllo permessi fatto nel controller
    public Issue updateIssue(Issue existing, Issue updatedData) {
        existing.setTitle(updatedData.getTitle());
        existing.setPriority(updatedData.getPriority());
        existing.setStatus(updatedData.getStatus());
        // se vuoi, permetti di cambiare anche type, description ecc.
        return issueRepository.save(existing);
    }

    public void deleteIssue(Issue issue) {
        issueRepository.delete(issue);
    }
}
