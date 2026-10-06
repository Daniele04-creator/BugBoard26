package it.unina.bugboard26.issues.domain;

import java.time.Instant;
import java.util.UUID;

public record Comment(UUID id, UUID issueId, UUID authorId, String body, Instant createdAt,
                      long sequence) { }
