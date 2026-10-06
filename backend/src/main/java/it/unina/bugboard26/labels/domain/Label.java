package it.unina.bugboard26.labels.domain;

import java.time.Instant;
import java.util.UUID;

public record Label(UUID id, String name, String normalizedName, String color, boolean active,
                    long version, Instant createdAt, Instant updatedAt) { }
