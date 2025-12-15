package it.unina.bugboard26.backend.issue;

public record UpdateIssueRequest(

        String title,
        String description,
        String type,
        String priority,
        String status,
        String image

) {}
