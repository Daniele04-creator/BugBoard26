package it.unina.bugboard26.labels.api;

import java.util.UUID;

public final class LabelDtos {
    private LabelDtos() { }

    public record Label(UUID id, String name, String color, boolean active, long version) { }
    public record CreateLabel(String name, String color) { }
    public record UpdateLabel(String name, String color, Boolean active, Long expectedVersion) { }

    public static Label label(it.unina.bugboard26.labels.domain.Label label) {
        return new Label(label.id(), label.name(), label.color(), label.active(), label.version());
    }
}
