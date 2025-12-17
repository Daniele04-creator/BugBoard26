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

        String status = "TODO";

        String type = normalizeTypeOrNull(request.type());
        String priority = normalizePriorityOrNull(request.priority());
        String image = normalizeImageOrNull(request.image());

        Issue issue = new Issue();
        issue.setTitle(request.title().trim());
        issue.setDescription(request.description().trim());
        issue.setType(type);
        issue.setPriority(priority);
        issue.setStatus(status);
        issue.setAssignee(assignee);
        if (image != null) {
            issue.setImage(image);
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

        if (request.title() != null) {
            String t = request.title().trim();
            if (t.isBlank()) throw new IllegalArgumentException("Title cannot be blank");
            existing.setTitle(t);
        }

        if (request.description() != null) {
            String d = request.description().trim();
            if (d.isBlank()) throw new IllegalArgumentException("Description cannot be blank");
            existing.setDescription(d);
        }

        if (request.type() != null) {
            existing.setType(normalizeTypeOrNull(request.type()));
        }

        if (request.priority() != null) {
            existing.setPriority(normalizePriorityOrNull(request.priority()));
        }

        if (request.status() != null) {
            existing.setStatus(normalizeStatus(request.status()));
        }

        if (request.image() != null) {
            existing.setImage(normalizeImageOrNull(request.image()));
        }

        return issueRepository.save(existing);
    }

    public void deleteIssue(Issue issue) {
        issueRepository.delete(issue);
    }

    private String normalizeTypeOrNull(String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isBlank()) return null;

        String low = v.toLowerCase();
        return switch (low) {
            case "question" -> "Question";
            case "bug" -> "Bug";
            case "documentation" -> "Documentation";
            case "feature" -> "Feature";
            default -> throw new IllegalArgumentException("Invalid type");
        };
    }

    private String normalizePriorityOrNull(String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isBlank()) return null;

        String low = v.toLowerCase();
        return switch (low) {
            case "bassa", "low" -> "Bassa";
            case "media", "medium" -> "Media";
            case "alta", "high" -> "Alta";
            default -> throw new IllegalArgumentException("Invalid priority");
        };
    }

    private String normalizeStatus(String raw) {
        if (raw == null) throw new IllegalArgumentException("Invalid status");
        String v = raw.trim().toUpperCase();
        return switch (v) {
            case "TODO" -> "TODO";
            case "DOING" -> "DOING";
            case "DONE" -> "DONE";
            default -> throw new IllegalArgumentException("Invalid status");
        };
    }

    private String normalizeImageOrNull(String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        return v.isBlank() ? null : v;
    }
}
