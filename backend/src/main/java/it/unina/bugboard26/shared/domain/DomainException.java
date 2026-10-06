package it.unina.bugboard26.shared.domain;

import java.util.Map;
import java.util.Objects;

public final class DomainException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final int status;
    private final String code;
    private final Map<String, String> fields;

    public DomainException(int status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public DomainException(int status, String code, String message, Map<String, String> fields) {
        super(Objects.requireNonNull(message, "message"));
        this.status = status;
        this.code = Objects.requireNonNull(code, "code");
        this.fields = Map.copyOf(fields);
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, String> fields() {
        return fields;
    }
}
