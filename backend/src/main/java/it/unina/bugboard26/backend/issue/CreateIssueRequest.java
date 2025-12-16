package it.unina.bugboard26.backend.issue;

public record CreateIssueRequest(

        String title,
        String description,
        String type,        
        String priority,    
        String status,     
        Long assigneeId,    
        String image        

) {}
