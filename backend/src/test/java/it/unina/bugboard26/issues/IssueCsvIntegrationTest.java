package it.unina.bugboard26.issues;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.api.IssueExportController;
import it.unina.bugboard26.shared.domain.DomainException;
import it.unina.bugboard26.shared.api.ApiExceptionHandler;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class IssueCsvIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");
    private static final UUID ADMIN = new UUID(0, 1);
    private static final UUID MEMBER = new UUID(0, 2);
    private static final UUID VIEWER = new UUID(0, 3);
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_csv_test").withUsername("bugboard_owner").withPassword(PASSWORD)
            .withInitScript("users-init.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", () -> "bugboard_owner");
        properties.add("spring.flyway.password", () -> PASSWORD);
    }
    @Autowired private JdbcTemplate jdbc;
    @Autowired private IssueExportController controller;
    @Autowired private ApiExceptionHandler errors;

    @BeforeEach
    void fixture() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", PASSWORD);
             var statement = connection.createStatement()) {
            // Reset only this disposable Testcontainers database; runtime protections stay enabled.
            statement.execute("set session_replication_role=replica");
            try { statement.execute("truncate user_accounts,labels,spring_session,login_attempts cascade"); }
            finally { statement.execute("set session_replication_role=origin"); }
        }
        account(ADMIN, "admin-private@example.test", " +Reporter", "ADMIN");
        account(MEMBER, "member-private@example.test", "@Assignee", "MEMBER");
        account(VIEWER, "viewer-private@example.test", "Viewer", "VIEWER");
        authenticate(ADMIN);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void csvPreservesUtf8QuotesAndNewlinesAndNeutralizesEveryTextColumnWithoutEmails() {
        UUID id = create(" =SUM(1,2)", "Line one, with \"quotes\"\nΩ second line", "BUG", false);
        jdbc.update("update issues set assignee_id=? where id=?", MEMBER, id);
        UUID label = UUID.randomUUID();
        jdbc.update("insert into labels(id,name,normalized_name,color,active,created_at,updated_at) values(?,'-urgent','-urgent','red',true,?,?)",
                label, ts(START), ts(START));
        jdbc.update("insert into issue_labels(issue_id,label_id) values(?,?)", id, label);
        var response = controller.export(request()); byte[] bytes = response.getBody();
        assertTrue(bytes != null && bytes.length > 3);
        assertEquals(0xef, Byte.toUnsignedInt(bytes[0])); assertEquals(0xbb, Byte.toUnsignedInt(bytes[1])); assertEquals(0xbf, Byte.toUnsignedInt(bytes[2]));
        String csv = new String(bytes, StandardCharsets.UTF_8);
        List<List<String>> rows = parse(csv.substring(1)); assertEquals(2, rows.size()); assertEquals(15, rows.get(1).size());
        assertEquals(List.of("number", "title", "description", "type", "status", "priority", "reporter", "assignee", "labels",
                "due_date", "created_at", "updated_at", "resolved_at", "archived", "duplicate_of"), rows.getFirst());
        assertEquals("' =SUM(1,2)", rows.get(1).get(1)); assertEquals("Line one, with \"quotes\"\nΩ second line", rows.get(1).get(2));
        assertEquals("' +Reporter", rows.get(1).get(6)); assertEquals("'@Assignee", rows.get(1).get(7)); assertEquals("'-urgent", rows.get(1).get(8));
        assertFalse(csv.contains("private@example.test")); assertTrue(csv.endsWith("\r\n"));
        assertEquals("no-store", response.getHeaders().getFirst("Cache-Control"));
        assertTrue(response.getHeaders().getFirst("Content-Disposition").matches("attachment; filename=\"bugboard-issues-[0-9]{8}-[0-9]{6}\\.csv\""));
    }

    @Test
    void allReadableRolesUseTheSameFilterSortAndArchiveRules() {
        create("Ω visible", "Visible reference description", "FEATURE", false);
        create("Ω archived", "Archived reference description", "BUG", true);
        create("Other title", "Other reference description", "QUESTION", false);
        for (UUID actor : List.of(ADMIN, MEMBER, VIEWER)) {
            authenticate(actor); MockHttpServletRequest filtered = request(); filtered.addParameter("q", "Ω");
            String csv = body(controller.export(filtered).getBody()); assertTrue(csv.contains("Ω visible")); assertFalse(csv.contains("Ω archived"));
            filtered.addParameter("archived", "all"); filtered.addParameter("sort", "title,asc");
            List<List<String>> rows = parse(body(controller.export(filtered).getBody()).substring(1));
            assertEquals(3, rows.size()); assertEquals("Ω archived", rows.get(1).get(1)); assertEquals("Ω visible", rows.get(2).get(1));
        }
    }

    @Test
    void exportRejectsPaginationAndUnknownQueryParametersBeforeProducingCsv() {
        for (String parameter : List.of("page", "size", "unexpected")) {
            MockHttpServletRequest request = request(); request.addParameter(parameter, "1");
            assertEquals(400, assertThrows(DomainException.class, () -> controller.export(request)).status());
        }
    }

    @Test
    void databaseQueryFailureReturnsProblemBeforeAnyCsvResponse() throws Exception {
        create("Database failure issue", "Reference failure description", "BUG", false);
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", PASSWORD);
             var statement = connection.createStatement()) { statement.execute("revoke select on issues from bugboard_runtime"); }
        try {
            // Authentication is established by the fixture; this focused HTTP test exercises
            // the actual controller, exception advice, transaction and failing PostgreSQL query.
            var endpoint = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(errors).build();
            endpoint.perform(get("/api/v1/issues/export"))
                    .andExpect(status().isServiceUnavailable()).andExpect(content().contentType("application/problem+json"))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("SERVICE_UNAVAILABLE")));
        } finally {
            try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), "bugboard_owner", PASSWORD);
                 var statement = connection.createStatement()) { statement.execute("grant select on issues to bugboard_runtime"); }
        }
    }

    @Test
    void exactTenThousandRowsSucceedAndOneExtraFailsBeforeHttpSuccess() {
        jdbc.update("""
                insert into issues(id,title,description,title_search,description_search,type,priority,status,reporter_id,
                  archived,cycle_started_at,created_at,updated_at,last_activity_at,version)
                select gen_random_uuid(),'Generated issue','Generated reference description','generated issue',
                  'generated reference description','BUG','MEDIUM','TODO',?,false,?,?,?,?,0 from generate_series(1,10000)
                """, ADMIN, ts(START), ts(START), ts(START), ts(START));
        assertEquals(10001, parse(body(controller.export(request()).getBody()).substring(1)).size());
        create("One extra issue", "Reference extra description", "BUG", false);
        DomainException failure = assertThrows(DomainException.class, () -> controller.export(request()));
        assertEquals(422, failure.status()); assertEquals("EXPORT_LIMIT_EXCEEDED", failure.code());
    }

    @Test
    void leadingUnicodeWhitespaceAndControlCharactersAreNeutralized() {
        create("\u2003+Unicode formula", "\tPlain tab description", "BUG", false);
        create("@Another formula", "\r\nDescription with newline", "BUG", false);
        List<List<String>> rows = parse(body(controller.export(request()).getBody()).substring(1));
        assertTrue(rows.stream().skip(1).allMatch(row -> row.get(1).startsWith("'")));
        assertTrue(rows.stream().skip(1).allMatch(row -> row.get(2).startsWith("'")));
    }

    private void account(UUID id, String email, String name, String role) {
        jdbc.update("""
                insert into user_accounts(id,email,display_name,password_hash,role,active,must_change_password,created_at,updated_at)
                values(?,?,?,'synthetic-test-hash',?,true,false,?,?)
                """, id, email, name, role, ts(START), ts(START));
    }
    private UUID create(String title, String description, String type, boolean archived) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into issues(id,title,description,title_search,description_search,type,priority,status,reporter_id,
                  archived,archived_at,archived_by,cycle_started_at,created_at,updated_at,last_activity_at,version)
                values(?,?,?,?,?,?,'MEDIUM','TODO',?,?,?,?,?,?,?,?,0)
                """, id, title, description, title.toLowerCase(java.util.Locale.ROOT), description.toLowerCase(java.util.Locale.ROOT),
                type, ADMIN, archived, archived ? ts(START) : null, archived ? ADMIN : null,
                ts(START), ts(START), ts(START), ts(START));
        return id;
    }
    private MockHttpServletRequest request() { return new MockHttpServletRequest("GET", "/api/v1/issues/export"); }
    private static String body(byte[] bytes) { return new String(java.util.Objects.requireNonNull(bytes), StandardCharsets.UTF_8); }
    private static Timestamp ts(Instant value) { return Timestamp.from(value); }
    private static void authenticate(UUID id) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(id, 0), null, List.of()));
    }
    // Independent CSV reader used to verify quoting rather than reproduce the writer.
    private static List<List<String>> parse(String csv) {
        List<List<String>> rows = new ArrayList<>(); List<String> row = new ArrayList<>(); StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < csv.length(); index++) {
            char current = csv.charAt(index);
            if (current == '"') {
                if (quoted && index + 1 < csv.length() && csv.charAt(index + 1) == '"') { cell.append('"'); index++; }
                else { quoted = !quoted; }
            } else if (!quoted && current == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (!quoted && current == '\r' && index + 1 < csv.length() && csv.charAt(index + 1) == '\n') {
                row.add(cell.toString()); rows.add(List.copyOf(row)); row.clear(); cell.setLength(0); index++;
            } else { cell.append(current); }
        }
        return rows;
    }
}
