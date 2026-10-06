package it.unina.bugboard26.issues.api;

import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.shared.api.QueryParameters;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.domain.InputValidation;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record IssueFilter(String q, Set<IssueType> types, Set<IssueStatus> statuses,
                          Set<Priority> priorities, Set<UUID> labelIds, UUID assigneeId,
                          boolean unassigned, UUID reporterId, Boolean overdue, String archived,
                          String sortField, String sortDirection, int page, int size) {
    private static final String PRIORITY = "priority";
    private static final String ASSIGNED_TO = "assignedTo";
    private static final String REPORTER_ID = "reporterId";
    private static final String OVERDUE = "overdue";
    private static final String ARCHIVED = "archived";
    private static final String SORT = "sort";
    private static final int MAXIMUM_LABEL_FILTERS = 20;
    public IssueFilter {
        types = Set.copyOf(types); statuses = Set.copyOf(statuses);
        priorities = Set.copyOf(priorities); labelIds = Set.copyOf(labelIds);
    }
    private static final Set<String> SORT_FIELDS = Set.of("createdAt", "updatedAt", "lastActivityAt",
            PRIORITY, "dueDate", "title", "number");

    public static IssueFilter parse(HttpServletRequest request, UUID actorId, boolean pagination) {
        if (pagination) {
            QueryParameters.only(request, "q", "type", "status", PRIORITY, "labelId", ASSIGNED_TO,
                    REPORTER_ID, OVERDUE, ARCHIVED, SORT, "page", "size");
        } else {
            QueryParameters.only(request, "q", "type", "status", PRIORITY, "labelId", ASSIGNED_TO,
                    REPORTER_ID, OVERDUE, ARCHIVED, SORT);
        }
        for (String name : List.of("q", ASSIGNED_TO, REPORTER_ID, OVERDUE, ARCHIVED, SORT, "page", "size")) {
            String[] values = request.getParameterValues(name);
            if (values != null && values.length != 1) { throw invalid(); }
        }
        String q = InputValidation.text(value(request, "q", ""), "q", 0, 100, false);
        String assigned = request.getParameter(ASSIGNED_TO);
        UUID assignee = assigned == null || assigned.equals("unassigned") ? null
                : assigned.equals("me") ? actorId : uuid(assigned);
        String archive = value(request, ARCHIVED, "false");
        if (!Set.of("true", "false", "all").contains(archive)) { throw invalid(); }
        String[] sort = value(request, SORT, "createdAt,desc").split(",", -1);
        if (sort.length != 2 || !SORT_FIELDS.contains(sort[0]) || !Set.of("asc", "desc").contains(sort[1])) {
            throw invalid();
        }
        int page = integer(value(request, "page", "0"));
        int size = integer(value(request, "size", "20"));
        QueryParameters.pagination(page, size);
        String overdue = request.getParameter(OVERDUE);
        return new IssueFilter(q, enums(request, "type", IssueType.class),
                enums(request, "status", IssueStatus.class), enums(request, PRIORITY, Priority.class),
                ids(request), assignee, "unassigned".equals(assigned),
                request.getParameter(REPORTER_ID) == null ? null : uuid(request.getParameter(REPORTER_ID)),
                overdue == null ? null : booleanValue(overdue), archive, sort[0], sort[1], page, size);
    }

    private static Set<UUID> ids(HttpServletRequest request) {
        String[] values = request.getParameterValues("labelId");
        if (values == null) { return Set.of(); }
        if (values.length > MAXIMUM_LABEL_FILTERS) { throw invalid(); }
        return new LinkedHashSet<>(Arrays.stream(values).map(IssueFilter::uuid).toList());
    }

    private static <E extends Enum<E>> Set<E> enums(HttpServletRequest request, String name, Class<E> type) {
        String[] values = request.getParameterValues(name);
        if (values == null) { return Set.of(); }
        try { return new LinkedHashSet<>(Arrays.stream(values).map(value -> Enum.valueOf(type, value)).toList()); }
        catch (IllegalArgumentException exception) { throw invalid(); }
    }

    private static UUID uuid(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equals(value)) { throw invalid(); }
            return id;
        } catch (IllegalArgumentException exception) { throw invalid(); }
    }

    private static boolean booleanValue(String value) {
        if (!Set.of("true", "false").contains(value)) { throw invalid(); }
        return Boolean.valueOf(value);
    }

    private static int integer(String value) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException exception) { throw invalid(); }
    }
    private static String value(HttpServletRequest request, String name, String fallback) {
        return request.getParameter(name) == null ? fallback : request.getParameter(name);
    }
    private static DomainException invalid() {
        return new DomainException(400, "INVALID_FILTER", "Filtro o ordinamento non valido.");
    }
}
