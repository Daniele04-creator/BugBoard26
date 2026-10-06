package it.unina.bugboard26.issues.domain;

public enum IssueStatus {
    TODO, IN_PROGRESS, RESOLVED, DUPLICATE;

    public boolean isOpen() {
        return this == TODO || this == IN_PROGRESS;
    }
}
