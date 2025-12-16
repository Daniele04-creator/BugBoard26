package it.unina.bugboard26.backend.issue;

import it.unina.bugboard26.backend.user.User;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class IssueService {

    private final IssueRepository issueRepository;

    public IssueService(IssueRepository issueRepository) {
        this.issueRepository = issueRepository;
    }

    public Issue createIssue(CreateIssueRequest request, User assignee) {
        String status = (request.status() == null || request.status().isBlank()) ? "TODO" : request.status();

        Issue issue;
        if (request.image() == null || request.image().isBlank()) {
            issue = Issue.create(
                    request.title(),
                    request.description(),
                    request.type(),
                    request.priority(),
                    status,
                    assignee
            );
        } else {
            issue = Issue.createWithImage(
                    request.title(),
                    request.description(),
                    request.type(),
                    request.priority(),
                    status,
                    assignee,
                    request.image()
            );
        }

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
