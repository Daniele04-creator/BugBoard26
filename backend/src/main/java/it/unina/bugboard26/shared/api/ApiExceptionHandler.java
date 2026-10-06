package it.unina.bugboard26.shared.api;

import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private final ProblemWriter problems;

    public ApiExceptionHandler(ProblemWriter problems) {
        this.problems = problems;
    }

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<Problem> domain(DomainException error, HttpServletRequest request) {
        return ResponseEntity.status(error.status()).header("Content-Type", "application/problem+json")
                .body(problems.problem(request, error));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, MissingServletRequestPartException.class,
            org.springframework.web.bind.MissingRequestHeaderException.class})
    public ResponseEntity<Problem> invalid(Exception error, HttpServletRequest request) {
        String code = error instanceof HttpMessageNotReadableException
                && error.getCause() != null && error.getCause().getClass().getSimpleName().equals("UnrecognizedPropertyException")
                ? "UNKNOWN_FIELD" : "VALIDATION_ERROR";
        return domain(new DomainException(400, code, "Formato della richiesta non valido."), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Problem> oversized(HttpServletRequest request) {
        return domain(new DomainException(413, "PAYLOAD_TOO_LARGE", "La richiesta supera il limite consentito."), request);
    }

    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Problem> methodNotSupported(HttpServletRequest request) {
        return domain(new DomainException(405, "METHOD_NOT_ALLOWED", "Metodo non consentito per questa risorsa."), request);
    }

    @ExceptionHandler(org.springframework.web.HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Problem> mediaTypeNotSupported(HttpServletRequest request) {
        return domain(new DomainException(415, "UNSUPPORTED_MEDIA_TYPE", "Formato del contenuto non supportato."), request);
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Problem> missingResource(HttpServletRequest request) {
        return domain(new DomainException(404, "NOT_FOUND", "Risorsa non trovata."), request);
    }

    @ExceptionHandler({DataAccessException.class, org.springframework.transaction.CannotCreateTransactionException.class})
    public ResponseEntity<Problem> unavailable(HttpServletRequest request) {
        return domain(new DomainException(503, "SERVICE_UNAVAILABLE", "Servizio temporaneamente non disponibile."), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Problem> unexpected(HttpServletRequest request) {
        return domain(new DomainException(500, "INTERNAL_ERROR", "Errore interno. Riprova indicando il codice richiesta."), request);
    }
}
