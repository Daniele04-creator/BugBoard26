package it.unina.bugboard26.shared.api;

import it.unina.bugboard26.shared.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;

public final class QueryParameters {
    private QueryParameters() { }

    public static void only(HttpServletRequest request, String... names) {
        Set<String> allowed = Set.of(names);
        if (request.getParameterMap().keySet().stream().anyMatch(name -> !allowed.contains(name))) {
            throw new DomainException(400, "INVALID_FILTER", "Parametro di ricerca sconosciuto.");
        }
    }

    public static void pagination(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new DomainException(400, "INVALID_FILTER", "Pagina o dimensione non valida.");
        }
    }
}
