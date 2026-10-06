package it.unina.bugboard26.shared.api;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import it.unina.bugboard26.shared.domain.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;

class QueryParametersTest {
    @Test
    void acceptsKnownParametersAndRejectsUnknownNamesEvenWhenEmpty() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        assertDoesNotThrow(() -> QueryParameters.only(request));
        request.addParameter("q", "literal%_");
        request.addParameter("page", "0");
        assertDoesNotThrow(() -> QueryParameters.only(request, "q", "page"));
        request.addParameter("admin", "");
        DomainException error = assertThrows(DomainException.class, () -> QueryParameters.only(request, "q", "page"));
        assertEquals(400, error.status());
        assertEquals("INVALID_FILTER", error.code());
    }

    @ParameterizedTest
    @CsvSource({"0,1,true", "0,100,true", "2147483647,20,true", "-1,20,false", "0,0,false",
            "0,101,false", "0,-1,false"})
    void paginationHonorsBothBounds(int page, int size, boolean valid) {
        if (valid) {
            assertDoesNotThrow(() -> QueryParameters.pagination(page, size));
        } else {
            assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                    () -> QueryParameters.pagination(page, size)).code());
        }
    }
}
