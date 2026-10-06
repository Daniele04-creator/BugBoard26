package it.unina.bugboard26.issues;

import it.unina.bugboard26.issues.api.IssueFilter;
import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.shared.domain.DomainException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;

class IssueFilterTest {
    private final UUID actor = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");

    @Test
    void repeatedFiltersAreSetsAndAssignedMeUsesServerIdentity() {
        var request = request("type", "BUG", "type", "BUG", "status", "TODO", "status", "IN_PROGRESS",
                "assignedTo", "me", "archived", "all", "overdue", "false", "q", " CAFE\u0301 ", "sort", "dueDate,asc");
        var filter = IssueFilter.parse(request, actor, true);
        assertEquals(java.util.Set.of(IssueType.BUG), filter.types());
        assertEquals(java.util.Set.of(IssueStatus.TODO, IssueStatus.IN_PROGRESS), filter.statuses());
        assertEquals(actor, filter.assigneeId()); assertEquals("CAFÉ", filter.q()); assertEquals(false, filter.overdue());
        assertEquals("all", filter.archived()); assertEquals("dueDate", filter.sortField());
        assertThrows(UnsupportedOperationException.class, () -> filter.types().add(IssueType.FEATURE));
    }

    @ParameterizedTest
    @CsvSource({"type,UNKNOWN", "status,closed", "priority,urgent", "assignedTo,invalid", "reporterId,invalid",
            "overdue,yes", "archived,yes", "sort,createdAt", "page,-1", "page,abc", "size,0", "size,101"})
    void invalidValuesAreFilterProblems(String name, String value) {
        var failure = assertThrows(DomainException.class, () -> IssueFilter.parse(request(name, value), actor, true));
        assertEquals(400, failure.status()); assertEquals("INVALID_FILTER", failure.code());
    }

    @Test
    void canonicalIdsUnknownDuplicateScalarAndArrayLimitsAreEnforced() {
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("reporterId", actor.toString().toUpperCase(java.util.Locale.ROOT)), actor, true)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("q", "one", "q", "two"), actor, true)).code());
        var many = new MockHttpServletRequest();
        for (int index = 0; index < 21; index++) { many.addParameter("labelId", UUID.randomUUID().toString()); }
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class, () -> IssueFilter.parse(many, actor, true)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("labelId", "not-a-uuid"), actor, true)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("sort", "title,unknown"), actor, true)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("unexpected", "1"), actor, true)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("page", "0"), actor, false)).code());
    }

    @Test
    void unassignedDirectAccountAndEmptySearchAreValid() {
        var unassigned = IssueFilter.parse(request("assignedTo", "unassigned", "q", "   "), actor, true);
        assertTrue(unassigned.unassigned()); assertNull(unassigned.assigneeId()); assertEquals("", unassigned.q());
        assertNull(unassigned.overdue());
        var direct = IssueFilter.parse(request("assignedTo", actor.toString(), "reporterId", actor.toString(), "overdue", "true"), actor, true);
        assertEquals(actor, direct.assigneeId()); assertEquals(actor, direct.reporterId()); assertTrue(direct.overdue());
        assertEquals(0, direct.page()); assertEquals(20, direct.size()); assertEquals("createdAt", direct.sortField());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class,
                () -> IssueFilter.parse(request("q", "x".repeat(101)), actor, true)).code());
    }
    private MockHttpServletRequest request(String... parameters) {
        var request = new MockHttpServletRequest();
        for (int index = 0; index < parameters.length; index += 2) { request.addParameter(parameters[index], parameters[index + 1]); }
        return request;
    }
}
