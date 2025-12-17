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

        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("Title required");
        }
        if (request.description() == null || request.description().isBlank()) {
            throw new IllegalArgumentException("Description required");
        }

        String type = normalizeType(request.type());
        String priority = normalizePriority(request.priority());

        String status = "TODO";

        Issue issue;
        if (request.image() == null || request.image().isBlank()) {
            issue = Issue.create(
                    request.title().trim(),
                    request.description().trim(),
                    type,
                    priority,
                    status,
                    assignee
            );
        } else {
            issue = Issue.createWithImage(
                    request.title().trim(),
                    request.description().trim(),
                    type,
                    priority,
                    status,
                    assignee,
                    request.image().trim()
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
        if (request.title() != null) existing.setTitle(request.title().trim());
        if (request.description() != null) existing.setDescription(request.description().trim());

        if (request.type() != null) {
            existing.setType(normalizeType(request.type()));
        }

        if (request.priority() != null) {
            existing.setPriority(normalizePriority(request.priority()));
        }

        if (request.status() != null) {
            existing.setStatus(normalizeStatus(request.status()));
        }

        if (request.image() != null) {
            String img = request.image().trim();
            existing.setImage(img.isBlank() ? null : img);
        }

        return issueRepository.save(existing);
    }

    public void deleteIssue(Issue issue) {
        issueRepository.delete(issue);
    }

    private String normalizeType(String raw) {
        if (raw == null || raw.isBlank()) return "Bug";
        String v = raw.trim().toLowerCase();
        return switch (v) {
            case "question" -> "Question";
            case "bug" -> "Bug";
            case "documentation" -> "Documentation";
            case "feature" -> "Feature";
            default -> throw new IllegalArgumentException("Invalid type");
        };
    }

    private String normalizePriority(String raw) {
        if (raw == null || raw.isBlank()) return "Media";
        String v = raw.trim().toLowerCase();
        return switch (v) {
            case "bassa", "low" -> "Bassa";
            case "media", "medium" -> "Media";
            case "alta", "high" -> "Alta";
            default -> throw new IllegalArgumentException("Invalid priority");
        };
    }

    private String normalizeStatus(String raw) {
        if (raw == null || raw.isBlank()) return "TODO";
        String v = raw.trim().toUpperCase();
        return switch (v) {
            case "TODO" -> "TODO";
            case "DOING" -> "DOING";
            case "DONE" -> "DONE";
            default -> throw new IllegalArgumentException("Invalid status");
        };
    }
}
