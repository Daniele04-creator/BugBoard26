package it.unina.bugboard26.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.BugBoard26Application;
import it.unina.bugboard26.auth.application.PasswordService;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(classes = BugBoard26Application.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
class NotificationHttpTest {
    private static final String DATABASE_PASSWORD = "UserLifecycleIntegrationOnly";
    private static final String PASSWORD = "Notification account password";
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
        "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("bugboard_notifications_test").withUsername("bugboard_owner").withPassword(DATABASE_PASSWORD).withInitScript("users-init.sql");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> DATABASE_PASSWORD);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", () -> "bugboard_owner");
        properties.add("spring.flyway.password", () -> DATABASE_PASSWORD);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordService passwords;
    @Autowired private JsonMapper mapper;
    @LocalServerPort private int port;
    private HttpClient client;
    private UUID viewerId;
    private UUID otherId;
    private UUID issueId;
    private UUID ownNotification;
    private UUID otherNotification;

    @BeforeEach
    void seedAndLogin() throws Exception {
        viewerId = UUID.randomUUID();
        otherId = UUID.randomUUID();
        issueId = UUID.randomUUID();
        String hash = passwords.encode(PASSWORD);
        for (UUID id : java.util.List.of(viewerId, otherId)) {
            jdbc.update("INSERT INTO user_accounts VALUES (?,?,'Viewer',?,'VIEWER',true,false,0,0,now(),now())",
                id, id + "@example.test", hash);
        }
        jdbc.update("""
            INSERT INTO issues (id,title,description,title_search,description_search,type,priority,status,reporter_id,
                cycle_started_at,created_at,updated_at,last_activity_at)
            VALUES (?,'Notification issue','Complete description','notification issue','complete description',
                'BUG','MEDIUM','TODO',?,now(),now(),now(),now())
            """, issueId, viewerId);
        ownNotification = notification(viewerId, "2026-01-01T00:00:00Z");
        otherNotification = notification(otherId, "2026-01-02T00:00:00Z");
        client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        HttpResponse<String> login = send("POST", "/auth/login", mapper.writeValueAsString(Map.of("email", viewerId + "@example.test", "password", PASSWORD)), csrf());
        assertEquals(200, login.statusCode(), login.body());
    }

    @Test
    void inboxIsPrivatePaginatedAndSafeForViewer() throws Exception {
        JsonNode page = json(send("GET", "/notifications", null, null), 200);
        assertEquals(1, page.get("totalElements").asInt());
        assertEquals(ownNotification.toString(), page.get("items").get(0).get("id").asString());
        assertEquals("Notification issue", page.get("items").get(0).get("issue").get("title").asString());
        assertFalse(page.toString().contains("@example.test"));
        JsonNode empty = json(send("GET", "/notifications?page=10&size=1", null, null), 200);
        assertEquals(1, empty.get("totalElements").asInt());
        assertTrue(empty.get("items").isEmpty());
        assertEquals(1, json(send("GET", "/notifications/unread-count", null, null), 200).get("count").asInt());
    }

    @Test
    void readingIsIdempotentAndOtherRecipientsAreHidden() throws Exception {
        JsonNode first = json(send("PUT", "/notifications/" + ownNotification + "/read", null, csrf()), 200);
        String readAt = first.get("readAt").asString();
        JsonNode second = json(send("PUT", "/notifications/" + ownNotification + "/read", null, csrf()), 200);
        assertEquals(readAt, second.get("readAt").asString());
        assertEquals(0, json(send("GET", "/notifications/unread-count", null, null), 200).get("count").asInt());
        assertEquals(0, json(send("GET", "/notifications?unreadOnly=true", null, null), 200).get("totalElements").asInt());
        assertEquals("NOT_FOUND", json(send("PUT", "/notifications/" + otherNotification + "/read", null, csrf()), 404).get("code").asString());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notifications WHERE id=? AND read_at IS NOT NULL", Integer.class, otherNotification));
        assertEquals(0, jdbc.queryForObject("SELECT version FROM issues WHERE id=?", Integer.class, issueId));
    }

    @Test
    void readAllTouchesOnlyOwnUnreadNotifications() throws Exception {
        notification(viewerId, "2026-01-03T00:00:00Z");
        assertEquals(2, json(send("PUT", "/notifications/read-all", null, csrf()), 200).get("changedCount").asInt());
        assertEquals(0, json(send("PUT", "/notifications/read-all", null, csrf()), 200).get("changedCount").asInt());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id=? AND read_at IS NULL", Integer.class, otherId));
        assertEquals(0, jdbc.queryForObject("SELECT version FROM issues WHERE id=?", Integer.class, issueId));
    }

    @ParameterizedTest
    @ValueSource(strings = {"?unreadOnly=yes", "?unreadOnly=TRUE", "?unreadOnly=true&unreadOnly=false", "?extra=1", "?page=-1", "?size=0", "?size=101"})
    void queryFiltersAreStrict(String query) throws Exception {
        assertEquals(400, send("GET", "/notifications" + query, null, null).statusCode());
    }

    @Test
    void mutationsRequireCsrfAndRevokedSessionCannotReadOrMutate() throws Exception {
        assertEquals("CSRF_INVALID", json(send("PUT", "/notifications/" + ownNotification + "/read", null, null), 403).get("code").asString());
        jdbc.update("UPDATE user_accounts SET auth_version=auth_version+1 WHERE id=?", viewerId);
        assertEquals(401, send("GET", "/notifications", null, null).statusCode());
        assertEquals(401, send("PUT", "/notifications/" + ownNotification + "/read", null, csrf()).statusCode());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM notifications WHERE id=? AND read_at IS NULL", Integer.class, ownNotification));
    }

    private UUID notification(UUID recipientId, String createdAt) {
        UUID eventId = UUID.randomUUID();
        UUID notificationId = UUID.randomUUID();
        jdbc.update("INSERT INTO issue_events(id,issue_id,actor_id,occurred_at,event_type,changes,created_at) VALUES(?,?,?,?::timestamptz,'ASSIGNMENT_CHANGED','{}',?::timestamptz)",
            eventId, issueId, viewerId, createdAt, createdAt);
        jdbc.update("INSERT INTO notifications(id,recipient_id,event_id,issue_id,type,created_at) VALUES(?,?,?,?,'ASSIGNED',?::timestamptz)",
            notificationId, recipientId, eventId, issueId, createdAt);
        return notificationId;
    }

    private String csrf() throws Exception { return json(send("GET", "/auth/csrf", null, null), 200).get("token").asString(); }

    private JsonNode json(HttpResponse<String> response, int status) {
        assertEquals(status, response.statusCode(), response.body());
        return mapper.readTree(response.body());
    }

    private HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1" + path)).header("Content-Type", "application/json");
        if (csrf != null) { request.header("X-CSRF-TOKEN", csrf); }
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
