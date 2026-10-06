package it.unina.bugboard26.shared.api;

import java.util.List;

public record Problem(String type, String title, int status, String detail, String instance,
                      String code, String requestId, List<FieldError> fieldErrors) {
    public Problem {
        fieldErrors = List.copyOf(fieldErrors);
    }
    public record FieldError(String field, String message) { }
}
