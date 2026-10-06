package it.unina.bugboard26.users.domain;

public enum UserRole {
    ADMIN, MEMBER, VIEWER;

    public boolean canBeAssigned() {
        return this == ADMIN || this == MEMBER;
    }
}
