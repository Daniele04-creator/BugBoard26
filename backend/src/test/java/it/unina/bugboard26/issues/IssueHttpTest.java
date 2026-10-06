package it.unina.bugboard26.issues;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(classes = it.unina.bugboard26.BugBoard26Application.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(IssueTestClock.class)
class IssueHttpTest {
    private static final String PASSWORD = "Synthetic-Issues-Password!";
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_issue_http").withUsername("bugboard_owner").withPassword("UserLifecycleIntegrationOnly")
            .withInitScript("users-init.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> "UserLifecycleIntegrationOnly");
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", DATABASE::getUsername);
        properties.add("spring.flyway.password", DATABASE::getPassword);
    }
    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper mapper;
    @LocalServerPort int port;
    private Session admin;
    private Session member;
    private Session reporter;
    private Session viewer;
    private UUID memberId;

    @BeforeEach
    void setup() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("SET session_replication_role=replica");
            statement.execute("TRUNCATE user_accounts,labels,spring_session,login_attempts CASCADE");
            statement.execute("SET session_replication_role=origin");
        }
        account("admin", UserRole.ADMIN); memberId = account("member", UserRole.MEMBER);
        account("reporter", UserRole.MEMBER); account("viewer", UserRole.VIEWER);
        admin = new Session("admin"); member = new Session("member"); reporter = new Session("reporter"); viewer = new Session("viewer");
    }

    @Test
    void multipartCreationDefaultsValidationIdempotencyAndReservedFields() throws Exception {
        for (String type : List.of("QUESTION", "BUG", "DOCUMENTATION", "FEATURE")) {
            UUID key = UUID.randomUUID(); var response = member.create(payload(type), null, key);
            assertEquals(201, response.statusCode(), response.body());
            var issue = json(response); assertEquals(type, issue.get("type").asString());
            assertEquals("MEDIUM", issue.get("priority").asString()); assertEquals("TODO", issue.get("status").asString());
            assertEquals(0, issue.get("version").asLong()); assertTrue(issue.get("assignee").isNull());
            assertTrue(response.headers().firstValue("location").orElseThrow().endsWith(issue.get("id").asString()));
            assertEquals(issue, json(member.create(payload(type), null, key)));
        }
        assertEquals(4, count("issues")); assertEquals(4, count("issue_events"));
        for (String field : List.of("priority", "labelIds")) {
            var explicitNull = new LinkedHashMap<>(payload("BUG")); explicitNull.put(field, null);
            assertCode(member.create(explicitNull, null, UUID.randomUUID()), 400, "VALIDATION_ERROR");
            assertEquals(4, count("issues")); assertEquals(4, count("issue_events"));
        }
        var omittedLabels = new LinkedHashMap<>(payload("BUG")); omittedLabels.remove("labelIds");
        var defaultResponse = member.create(omittedLabels, null, UUID.randomUUID());
        assertEquals(201, defaultResponse.statusCode(), defaultResponse.body());
        var defaults = json(defaultResponse);
        assertEquals("MEDIUM", defaults.get("priority").asString()); assertEquals(0, defaults.get("labels").size());
        var invalid = new LinkedHashMap<>(payload("BUG")); invalid.put("reporterId", memberId);
        assertCode(member.create(invalid, null, UUID.randomUUID()), 400, "UNKNOWN_FIELD");
        invalid.remove("reporterId"); invalid.put("title", "ab");
        assertCode(member.create(invalid, null, UUID.randomUUID()), 400, "VALIDATION_ERROR");
        invalid.put("title", "a".repeat(160)); invalid.put("description", "x".repeat(10000));
        assertEquals(201, member.create(invalid, null, UUID.randomUUID()).statusCode());
        invalid.put("description", "x".repeat(10001));
        assertCode(member.create(invalid, null, UUID.randomUUID()), 400, "VALIDATION_ERROR");
        assertCode(viewer.create(payload("BUG"), null, UUID.randomUUID()), 403, "FORBIDDEN");
    }

    @Test
    void realRoleAssignmentResolutionAuditCycleAndPrivateNotification() throws Exception {
        JsonNode created = json(reporter.create(payload("BUG"), null, UUID.randomUUID())); String id = created.get("id").asString();
        assertCode(reporter.send("PATCH", "/issues/" + id, update(0)), 403, "FORBIDDEN");
        var assigned = admin.send("PUT", "/issues/" + id + "/assignment", Map.of("assigneeId", memberId, "expectedVersion", 0));
        assertEquals(200, assigned.statusCode(), assigned.body()); assertEquals(1, json(assigned).get("version").asLong());
        assertEquals(1, json(member.send("GET", "/notifications/unread-count", null)).get("count").asLong());
        assertEquals(0, json(viewer.send("GET", "/notifications/unread-count", null)).get("count").asLong());
        assertEquals(200, member.send("PUT", "/issues/" + id + "/state", Map.of("status", "IN_PROGRESS", "expectedVersion", 1)).statusCode());
        assertEquals(200, member.send("PUT", "/issues/" + id + "/state", Map.of("status", "RESOLVED", "expectedVersion", 2)).statusCode());
        assertEquals(1, count("resolution_cycles")); assertEquals(2, count("notifications"));
        assertEquals(memberId, jdbc.queryForObject("select credited_assignee_id from resolution_cycles", UUID.class));
        JsonNode history = json(viewer.send("GET", "/issues/" + id + "/history", null));
        assertEquals(4, history.get("totalElements").asLong());
        assertTrue(history.get("items").get(0).get("snapshot").get("assigneeId").isNull());
        var last = history.get("items").get(3); assertEquals("RESOLVED", last.get("changes").get("status").get("after").asString());
        assertEquals(1, json(reporter.send("GET", "/notifications/unread-count", null)).get("count").asLong());
        assertCode(admin.send("PUT", "/issues/" + id + "/state", Map.of("status", "IN_PROGRESS", "expectedVersion", 3)), 409, "INVALID_TRANSITION");
        assertCode(admin.send("PUT", "/issues/" + id + "/state", Map.of("status", "DUPLICATE", "expectedVersion", 3)), 409, "INVALID_TRANSITION");
        assertEquals(3, json(admin.send("PUT", "/issues/" + id + "/state", Map.of("status", "RESOLVED", "expectedVersion", 3))).get("version").asLong());
        assertEquals(4, count("issue_events"));
    }

    @Test
    void staleVersionUnknownNullAndOmittedNullableFieldsReturnDefinedProblems() throws Exception {
        String id = json(admin.create(payload("BUG"), null, UUID.randomUUID())).get("id").asString();
        assertEquals(200, admin.send("PATCH", "/issues/" + id, update(0)).statusCode());
        assertCode(admin.send("PATCH", "/issues/" + id, update(0)), 409, "VERSION_CONFLICT");
        assertCode(admin.raw("PATCH", "/issues/" + id, "null", null), 400, "VALIDATION_ERROR");
        assertCode(admin.send("PUT", "/issues/" + id + "/assignment", Map.of("expectedVersion", 1)), 400, "VALIDATION_ERROR");
        assertCode(admin.send("PUT", "/issues/" + id + "/deadline", Map.of("expectedVersion", 1)), 400, "VALIDATION_ERROR");
        assertCode(admin.send("PUT", "/issues/" + id + "/duplicate", Map.of("expectedVersion", 1)), 400, "VALIDATION_ERROR");
        var fields = new LinkedHashMap<String, Object>(); fields.put("assigneeId", null); fields.put("expectedVersion", 1);
        assertEquals(200, admin.send("PUT", "/issues/" + id + "/assignment", fields).statusCode());
        assertCode(admin.send("PUT", "/issues/" + id + "/assignment", Map.of("assigneeId", UUID.randomUUID(), "expectedVersion", 1)), 404, "NOT_FOUND");
        for (String version : List.of("1.5", "\"1\"")) {
            assertCode(admin.raw("PUT", "/issues/" + id + "/assignment", "{\"assigneeId\":null,\"expectedVersion\":" + version + "}", null), 400, "VALIDATION_ERROR");
        }
        assertCode(admin.send("PUT", "/issues/" + id + "/state", Map.of("status", 0, "expectedVersion", 1)), 400, "VALIDATION_ERROR");
        var numeric = new LinkedHashMap<String, Object>(update(1)); numeric.put("type", 1);
        assertCode(admin.send("PATCH", "/issues/" + id, numeric), 400, "VALIDATION_ERROR");
        numeric.put("type", "BUG"); numeric.put("priority", 1);
        assertCode(admin.send("PATCH", "/issues/" + id, numeric), 400, "VALIDATION_ERROR");
        assertEquals(2, count("issue_events"));
    }

    @Test
    void commentsReplayWithoutVersionChangeAndReadonlyUsersStillReadHistory() throws Exception {
        String id = json(admin.create(payload("BUG"), null, UUID.randomUUID())).get("id").asString(); UUID key = UUID.randomUUID();
        var comment = reporter.raw("POST", "/issues/" + id + "/comments", "{\"body\":\" Useful clue \"}", key);
        assertEquals(201, comment.statusCode(), comment.body()); assertFalse(comment.headers().firstValue("location").isPresent());
        assertEquals(json(comment), json(reporter.raw("POST", "/issues/" + id + "/comments", "{\"body\":\"Useful clue\"}", key)));
        assertCode(reporter.raw("POST", "/issues/" + id + "/comments", "{\"body\":\"Changed clue\"}", key), 409, "IDEMPOTENCY_KEY_REUSED");
        assertCode(viewer.raw("POST", "/issues/" + id + "/comments", "{\"body\":\"Readonly clue\"}", UUID.randomUUID()), 403, "FORBIDDEN");
        assertEquals(0, json(viewer.send("GET", "/issues/" + id, null)).get("version").asLong());
        assertEquals(1, json(viewer.send("GET", "/issues/" + id + "/comments", null)).get("totalElements").asLong());
        assertEquals(405, admin.send("DELETE", "/issues/" + id, null).statusCode());
        assertEquals(1, count("comments"));
        assertEquals(200, admin.send("PUT", "/issues/" + id + "/archive", Map.of("archived", true, "expectedVersion", 0)).statusCode());
        var replay = reporter.raw("POST", "/issues/" + id + "/comments", "{\"body\":\"Useful clue\"}", key);
        assertEquals(201, replay.statusCode(), replay.body()); assertEquals(json(comment), json(replay));
        assertCode(reporter.raw("POST", "/issues/" + id + "/comments", "{\"body\":\"New archived clue\"}", UUID.randomUUID()), 409, "ISSUE_READ_ONLY");
        assertEquals(1, count("comments")); assertEquals(3, count("issue_events"));
    }

    @Test
    void imageUploadDownloadSanitizationAndInvalidCreateAreAtomic() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 7, BufferedImage.TYPE_INT_RGB), "png", output);
        String id = json(member.create(payload("BUG"), output.toByteArray(), UUID.randomUUID())).get("id").asString();
        JsonNode detail = json(viewer.send("GET", "/issues/" + id, null));
        assertTrue(detail.get("hasImage").asBoolean()); assertEquals(8, detail.get("image").get("width").asLong());
        var bytes = viewer.client.send(HttpRequest.newBuilder(uri("/issues/" + id + "/image")).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, bytes.statusCode()); assertEquals("image/png", bytes.headers().firstValue("content-type").orElseThrow());
        assertNotNull(ImageIO.read(new java.io.ByteArrayInputStream(bytes.body())));
        assertTrue(bytes.headers().firstValue("content-disposition").orElseThrow().contains("capture.png"));
        assertCode(admin.create(payload("BUG"), new byte[]{1, 2, 3}, UUID.randomUUID()), 400, "INVALID_IMAGE");
        assertEquals(1, count("issues")); assertEquals(1, count("issue_images"));
        assertCode(admin.create(payload("BUG"), new byte[5 * 1024 * 1024 + 1], UUID.randomUUID()), 413, "PAYLOAD_TOO_LARGE");
        var anonymous = HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/issues/" + id + "/image")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertCode(anonymous, 401, "AUTHENTICATION_REQUIRED");
        assertCode(member.send("DELETE", "/issues/" + id + "/image?expectedVersion=0", null), 403, "FORBIDDEN");
        assertEquals(0, json(admin.replaceImage(id, output.toByteArray(), "capture.png", 0)).get("version").asLong());
        var renamed = admin.replaceImage(id, output.toByteArray(), "renamed.png", 0);
        assertEquals(200, renamed.statusCode(), renamed.body()); assertEquals(1, json(renamed).get("version").asLong());
        assertEquals("renamed.png", json(renamed).get("image").get("originalName").asString());
        assertEquals(200, admin.send("DELETE", "/issues/" + id + "/image?expectedVersion=1", null).statusCode());
        assertCode(viewer.send("GET", "/issues/" + id + "/image", null), 404, "NOT_FOUND");
    }

    @Test
    void duplicateArchiveRestoreAndCurrentListsRemainConsistent() throws Exception {
        String source = json(admin.create(payload("BUG"), null, UUID.randomUUID())).get("id").asString();
        String target = json(admin.create(payload("FEATURE"), null, UUID.randomUUID())).get("id").asString();
        assertCode(admin.send("PUT", "/issues/" + source + "/duplicate", Map.of("targetIssueId", source, "expectedVersion", 0)), 409, "DUPLICATE_CONFLICT");
        assertEquals(200, admin.send("PUT", "/issues/" + source + "/duplicate", Map.of("targetIssueId", target, "expectedVersion", 0)).statusCode());
        assertCode(admin.raw("POST", "/issues/" + source + "/comments", "{\"body\":\"Should not write\"}", UUID.randomUUID()), 409, "ISSUE_READ_ONLY");
        assertEquals(200, admin.send("PUT", "/issues/" + target + "/archive", Map.of("archived", true, "expectedVersion", 0)).statusCode());
        assertEquals(1, json(viewer.send("GET", "/issues", null)).get("totalElements").asLong());
        assertEquals(1, json(viewer.send("GET", "/issues?archived=true", null)).get("totalElements").asLong());
        assertEquals(target, json(viewer.send("GET", "/issues/" + source, null)).get("duplicateOf").get("id").asString());
        var undo = new LinkedHashMap<String, Object>(); undo.put("targetIssueId", null); undo.put("expectedVersion", 1);
        assertEquals("TODO", json(admin.send("PUT", "/issues/" + source + "/duplicate", undo)).get("status").asString());
        assertEquals(200, admin.send("PUT", "/issues/" + target + "/archive", Map.of("archived", false, "expectedVersion", 1)).statusCode());
        assertEquals(2, json(viewer.send("GET", "/issues", null)).get("totalElements").asLong());
        assertEquals(0, count("resolution_cycles")); assertEquals(0, count("notifications"));
    }

    @Test
    void filtersCsvPrivacyAndUnknownParametersMatchList() throws Exception {
        var value = new LinkedHashMap<>(payload("BUG")); value.put("title", "=SUM(1,2) failure"); value.put("description", "A literal % and _ failure\nSecond line");
        admin.create(value, null, UUID.randomUUID()); admin.create(payload("FEATURE"), null, UUID.randomUUID());
        var list = viewer.send("GET", "/issues?q=%25&type=BUG&sort=number,asc", null);
        assertEquals(1, json(list).get("totalElements").asLong());
        var csv = viewer.send("GET", "/issues/export?q=%25&type=BUG&sort=number,asc", null);
        assertEquals(200, csv.statusCode(), csv.body()); assertTrue(csv.body().startsWith("\ufeff\"number\""));
        assertTrue(csv.body().contains("\"'=SUM(1,2) failure\"")); assertTrue(csv.body().contains("\r\n"));
        assertFalse(csv.body().contains("@bugboard.local"));
        assertCode(viewer.send("GET", "/issues/export?page=0", null), 400, "INVALID_FILTER");
        assertCode(viewer.send("GET", "/issues?sort=unknown,asc", null), 400, "INVALID_FILTER");
        assertCode(viewer.send("GET", "/issues?unexpected=1", null), 400, "INVALID_FILTER");
        assertCode(viewer.send("GET", "/issues?size=101", null), 400, "INVALID_FILTER");
        assertEquals(0, json(viewer.send("GET", "/issues?page=5", null)).get("items").size());
    }

    private Map<String, Object> payload(String type) {
        return Map.of("title", "Issue HTTP test", "description", "Detailed instructions for reproduction", "type", type);
    }
    private Map<String, Object> update(long version) {
        return Map.of("title", "Edited HTTP issue", "description", "Edited detailed reproduction", "type", "BUG",
                "priority", "HIGH", "labelIds", List.of(), "expectedVersion", version);
    }
    private UUID account(String name, UserRole role) {
        UserAccount account = new UserAccount(UUID.randomUUID(), name + "@bugboard.local", name,
                passwords.encode(PASSWORD), role, Instant.parse("2026-01-01T00:00:00Z"));
        account.replacePassword(account.getPasswordHash(), false, Instant.parse("2026-01-01T00:01:00Z"));
        return users.saveAndFlush(account).getId();
    }
    private JsonNode json(HttpResponse<String> response) { return mapper.readTree(response.body()); }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    private URI uri(String path) { return URI.create("http://localhost:" + port + "/api/v1" + path); }
    private void assertCode(HttpResponse<String> response, int status, String code) {
        assertEquals(status, response.statusCode(), response.body()); assertEquals(code, json(response).get("code").asString());
        assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("application/problem+json"));
    }
    private final class Session {
        private final HttpClient client;
        private Session(String account) throws Exception {
            client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
            var login = send("POST", "/auth/login", Map.of("email", account + "@bugboard.local", "password", PASSWORD));
            assertEquals(200, login.statusCode(), login.body());
        }
        private String csrf() throws Exception {
            var response = client.send(HttpRequest.newBuilder(uri("/auth/csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
            return json(response).get("token").asString();
        }
        private HttpResponse<String> send(String method, String path, Object body) throws Exception {
            return raw(method, path, body == null ? null : mapper.writeValueAsString(body), null);
        }
        private HttpResponse<String> raw(String method, String path, String body, UUID key) throws Exception {
            HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
            if (!method.equals("GET")) { request.header("X-CSRF-TOKEN", csrf()); }
            if (key != null) { request.header("Idempotency-Key", key.toString()); }
            request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
        private HttpResponse<String> create(Map<String, Object> issue, byte[] image, UUID key) throws Exception {
            String boundary = "BugBoardBoundary" + UUID.randomUUID(); ByteArrayOutputStream output = new ByteArrayOutputStream();
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"issue\"\r\nContent-Type: application/json\r\n\r\n"
                    + mapper.writeValueAsString(issue) + "\r\n").getBytes(StandardCharsets.UTF_8));
            if (image != null) {
                output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"capture.png\"\r\n"
                        + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8)); output.write(image); output.write("\r\n".getBytes(StandardCharsets.UTF_8));
            }
            output.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            HttpRequest request = HttpRequest.newBuilder(uri("/issues")).header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .header("X-CSRF-TOKEN", csrf()).header("Idempotency-Key", key.toString()).POST(HttpRequest.BodyPublishers.ofByteArray(output.toByteArray())).build();
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
        private HttpResponse<String> replaceImage(String id, byte[] image, String name, long version) throws Exception {
            String boundary = "BugBoardBoundary" + UUID.randomUUID(); ByteArrayOutputStream output = new ByteArrayOutputStream();
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"expectedVersion\"\r\n\r\n" + version + "\r\n")
                    .getBytes(StandardCharsets.UTF_8));
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"" + name + "\"\r\n"
                    + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8)); output.write(image);
            output.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            HttpRequest request = HttpRequest.newBuilder(uri("/issues/" + id + "/image"))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary).header("X-CSRF-TOKEN", csrf())
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(output.toByteArray())).build();
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
