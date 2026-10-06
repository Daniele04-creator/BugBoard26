package it.unina.bugboard26.shared.api;

import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component("bugboardRequestContextFilter")
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestContextFilter extends OncePerRequestFilter {
    private static final int MAXIMUM_JSON_BYTES = 131_072;
    private static final int MAXIMUM_CAUSE_DEPTH = 16;
    private static final Logger LOG = LoggerFactory.getLogger(RequestContextFilter.class);
    private final ProblemWriter problems;

    public RequestContextFilter(ProblemWriter problems) {
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        String supplied = request.getHeader("X-Request-ID");
        if (supplied != null && supplied.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) {
            requestId = UUID.fromString(supplied).toString();
        }
        request.setAttribute("requestId", requestId);
        response.setHeader("X-Request-ID", requestId);
        response.setHeader("Cache-Control", "no-store");
        long started = System.nanoTime();
        try {
            HttpServletRequest effectiveRequest = request;
            if (request.getContentType() != null && request.getContentType().startsWith("application/json")) {
                byte[] content = request.getInputStream().readNBytes(MAXIMUM_JSON_BYTES + 1);
                if (content.length > MAXIMUM_JSON_BYTES) {
                    problems.write(request, response, new DomainException(413, "PAYLOAD_TOO_LARGE", "Richiesta JSON troppo grande."));
                    return;
                }
                effectiveRequest = new BufferedJsonRequest(request, content);
            }
            chain.doFilter(effectiveRequest, response);
        } catch (RuntimeException | ServletException error) {
            if (response.isCommitted()) { throw error; }
            response.resetBuffer();
            DomainException problem = databaseUnavailable(error)
                    ? new DomainException(503, "SERVICE_UNAVAILABLE", "Servizio temporaneamente non disponibile.")
                    : new DomainException(500, "INTERNAL_ERROR", "Errore interno. Riprova indicando il codice richiesta.");
            problems.write(request, response, problem);
        } finally {
            Object route = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            LOG.atInfo().addKeyValue("requestId", requestId).addKeyValue("method", request.getMethod())
                    .addKeyValue("route", route == null ? "unmapped" : route)
                    .addKeyValue("actorId", request.getAttribute("actorId"))
                    .addKeyValue("status", response.getStatus())
                    .addKeyValue("durationMs", (System.nanoTime() - started) / 1_000_000).log("http_request");
        }
    }

    private static boolean databaseUnavailable(Throwable error) {
        Throwable cause = error;
        for (int depth = 0; cause != null && depth < MAXIMUM_CAUSE_DEPTH; depth++) {
            if (cause instanceof org.springframework.dao.DataAccessException
                    || cause instanceof org.springframework.transaction.CannotCreateTransactionException) { return true; }
            cause = cause.getCause();
        }
        return false;
    }
}
