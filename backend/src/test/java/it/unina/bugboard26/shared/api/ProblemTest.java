package it.unina.bugboard26.shared.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProblemTest {
    @Test
    void fieldErrorsAreDefensivelyCopiedAndCannotBeChangedByConsumers() {
        Problem.FieldError field = new Problem.FieldError("title", "Titolo troppo breve.");
        List<Problem.FieldError> source = new ArrayList<>(List.of(field));
        Problem problem = new Problem("urn:bugboard:problem:VALIDATION_ERROR", "Richiesta non completata", 400,
                "Controlla i campi indicati.", "/api/v1/issues", "VALIDATION_ERROR", "request-id", source);
        source.clear();
        assertEquals(List.of(field), problem.fieldErrors());
        assertThrows(UnsupportedOperationException.class, () -> problem.fieldErrors().clear());
        assertEquals("title", field.field());
        assertEquals(400, problem.status());
        assertEquals("request-id", problem.requestId());
    }
}
