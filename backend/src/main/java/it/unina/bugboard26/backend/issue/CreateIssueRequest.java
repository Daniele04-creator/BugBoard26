package it.unina.bugboard26.backend.issue;

public record CreateIssueRequest(

        String title,
        String description,
        String type,        // BUG, FEATURE, DOCUMENTATION, QUESTION
        String priority,    // BASSA, MEDIA, ALTA
        String status,      // opzionale (default: TODO)
        Long assigneeId,    // ID dello user a cui assegnare la issue
        String image        // opzionale

) {}
