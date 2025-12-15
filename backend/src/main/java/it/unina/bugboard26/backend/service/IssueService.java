package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class IssueService {

    private final IssueRepository issueRepository;

    public IssueService(IssueRepository issueRepository) {
        this.issueRepository = issueRepository;
    }

    public Issue createIssue(CreateIssueRequest request, User assignee) {
    Issue issue = new Issue();
    issue.setTitle(request.title());
    issue.setDescription(request.description());
    issue.setType(request.type());
    issue.setPriority(request.priority());
    issue.setStatus(
        request.status() == null || request.status().isBlank()
            ? "TODO"
            : request.status()
    );
    issue.setAssignee(assignee);
    issue.setCreatedAt(LocalDateTime.now());
    issue.setImage(request.image());

    return issueRepository.save(issue);
}


    public List<Issue> getAllIssues() {
        return issueRepository.findAll();
    }

    public Optional<Issue> getIssueById(Long id) {
        return issueRepository.findById(id);
    }

    public Issue updateIssue(Issue existing, UpdateIssueRequest request) {

        if (request.title() != null) existing.setTitle(request.title());
        if (request.description() != null) existing.setDescription(request.description());
        if (request.type() != null) existing.setType(request.type());
        if (request.priority() != null) existing.setPriority(request.priority());
        if (request.status() != null) existing.setStatus(request.status());
        if (request.image() != null) existing.setImage(request.image());

        return issueRepository.save(existing);
    }

    public void deleteIssue(Issue issue) {
        issueRepository.delete(issue);
    }
}
