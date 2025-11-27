package it.unina.bugboard26.backend.user;

public record CreateUserRequest(
        String email,
        String password,
        String role // "ADMIN" oppure "USER"
) {}
