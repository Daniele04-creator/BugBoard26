package it.unina.bugboard26.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.unina.bugboard26.auth.application.PasswordService;
import it.unina.bugboard26.users.domain.UserAccount;
import it.unina.bugboard26.users.domain.UserRole;
import it.unina.bugboard26.users.persistence.UserRepository;
import java.io.ByteArrayInputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(classes = it.unina.bugboard26.BugBoard26Application.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthenticationHttpTest {
    private static final String PASSWORD = "Synthetic-Initial-Password!";
    private static final String NEW_PASSWORD = "Synthetic-Replacement-Password!";
    private static final String EMAIL = "auth-tests@bugboard.local";
    private static final UUID USER_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf")
            .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("bugboard_auth_test").withUsername("bugboard_owner").withPassword("synthetic-owner-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        if (!POSTGRES.isRunning()) { POSTGRES.start(); }
        try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bugboard_runtime') THEN "
                    + "CREATE ROLE bugboard_runtime LOGIN PASSWORD 'synthetic-runtime-password' NOSUPERUSER NOBYPASSRLS; END IF; END $$");
        }
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> "synthetic-runtime-password");
        properties.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        properties.add("spring.flyway.user", POSTGRES::getUsername);
        properties.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Autowired UserRepository users;
    @Autowired PasswordService passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper mapper;
    @LocalServerPort int port;
    private CookieManager cookies;
    private HttpClient client;

    @BeforeEach
    void setup() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("SET session_replication_role=replica");
            statement.execute("TRUNCATE user_accounts, spring_session, login_attempts CASCADE");
            statement.execute("SET session_replication_role=origin");
        }
        users.saveAndFlush(new UserAccount(USER_ID, EMAIL, "Utente test", passwords.encode(PASSWORD), UserRole.ADMIN, Instant.now()));
        cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        client = HttpClient.newBuilder().cookieHandler(cookies).version(HttpClient.Version.HTTP_1_1).build();
    }

    @Test
    void loginRotatesPersistentSessionAndStoresSafePrincipal() throws Exception {
        String token = csrf();
        String oldCookie = cookie();
        HttpResponse<String> login = send("POST", "/auth/login", credentials(PASSWORD), token);
        assertEquals(200, login.statusCode(), login.body());
        assertTrue(mapper.readTree(login.body()).get("mustChangePassword").asBoolean());
        assertNotEquals(oldCookie, cookie());
        assertEquals(USER_ID.toString(), jdbc.queryForObject("SELECT principal_name FROM spring_session WHERE principal_name IS NOT NULL", String.class));
        assertEquals(200, send("GET", "/auth/me", null, null).statusCode());
        HttpClient stolen = HttpClient.newHttpClient();
        var replay = stolen.send(HttpRequest.newBuilder(uri("/auth/me")).header("Cookie", oldCookie).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(401, replay.statusCode());
        assertTrue(login.headers().allValues("set-cookie").stream().anyMatch(value ->
                value.contains("HttpOnly") && value.contains("SameSite=Lax") && value.contains("Path=/api")));
    }

    @Test
    void limitedSessionAndPasswordChangeRequireNewLogin() throws Exception {
        login();
        assertEquals(403, send("GET", "/admin/users", null, null).statusCode());
        var wrong = send("PUT", "/auth/password", mapper.writeValueAsString(Map.of("currentPassword", "incorrect",
                "newPassword", NEW_PASSWORD)), csrf());
        assertEquals(400, wrong.statusCode());
        assertEquals(200, send("GET", "/auth/me", null, null).statusCode());
        assertEquals(204, send("PUT", "/auth/password", mapper.writeValueAsString(Map.of("currentPassword", PASSWORD,
                "newPassword", NEW_PASSWORD)), csrf()).statusCode());
        assertEquals(401, send("GET", "/auth/me", null, null).statusCode());
        assertEquals(200, send("POST", "/auth/login", credentials(NEW_PASSWORD), csrf()).statusCode());
        assertEquals(200, send("GET", "/admin/users", null, null).statusCode());
        assertFalse(mapper.readTree(send("GET", "/auth/me", null, null).body()).get("mustChangePassword").asBoolean());
    }

    @Test
    void csrfProtectsBothLoginAndLogoutAndTokenChangesAfterLogin() throws Exception {
        assertEquals(403, send("POST", "/auth/login", credentials(PASSWORD), null).statusCode());
        String before = csrf();
        assertEquals(200, send("POST", "/auth/login", credentials(PASSWORD), before).statusCode());
        assertEquals(403, send("POST", "/auth/logout", null, before).statusCode());
        assertEquals(403, send("POST", "/auth/logout", null, "invalid").statusCode());
        assertEquals(204, send("POST", "/auth/logout", null, csrf()).statusCode());
        assertEquals(401, send("GET", "/auth/me", null, null).statusCode());
        assertEquals(204, send("POST", "/auth/logout", null, csrf()).statusCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "[]", "{\"email\":\"auth-tests@bugboard.local\",\"password\":null}", "{invalid"})
    void malformedLoginIsProblemInsteadOfServerError(String body) throws Exception {
        var response = send("POST", "/auth/login", body, csrf());
        assertEquals(400, response.statusCode(), response.body());
        assertEquals("VALIDATION_ERROR", mapper.readTree(response.body()).get("code").asString());
        assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("application/problem+json"));
        assertTrue(response.headers().firstValue("x-request-id").isPresent());
    }

    @Test
    void unknownFieldsAndQueriesAreRejected() throws Exception {
        var unknown = send("POST", "/auth/login", "{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\",\"role\":\"ADMIN\"}", csrf());
        assertEquals(400, unknown.statusCode());
        assertEquals("UNKNOWN_FIELD", mapper.readTree(unknown.body()).get("code").asString());
        assertEquals(400, send("GET", "/auth/csrf?unexpected=1", null, null).statusCode());
        assertEquals(400, send("POST", "/auth/login?unexpected=1", credentials(PASSWORD), csrf()).statusCode());
        login();
        assertEquals(400, send("GET", "/auth/me?unexpected=1", null, null).statusCode());
    }

    @Test
    void accountVersionRevokesSessionButDisplayNameDoesNot() throws Exception {
        login();
        jdbc.update("UPDATE user_accounts SET display_name='Nuovo nome', version=version+1 WHERE id=?", USER_ID);
        assertEquals(200, send("GET", "/auth/me", null, null).statusCode());
        jdbc.update("UPDATE user_accounts SET auth_version=auth_version+1 WHERE id=?", USER_ID);
        assertEquals(401, send("GET", "/auth/me", null, null).statusCode());
        assertEquals(401, send("GET", "/auth/me", null, null).statusCode());
    }

    @Test
    void fiveFailedAttemptsBlockEmailWithRetryAfter() throws Exception {
        String token = csrf();
        for (int attempt = 0; attempt < 5; attempt++) {
            assertEquals(401, send("POST", "/auth/login", credentials("wrong-password"), token).statusCode());
        }
        var blocked = client.send(HttpRequest.newBuilder(uri("/auth/login"))
                .header("Origin", "http://localhost:5173").header("Content-Type", "application/json")
                .header("X-CSRF-TOKEN", token).POST(HttpRequest.BodyPublishers.ofString(credentials(PASSWORD))).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(429, blocked.statusCode(), blocked.body());
        assertTrue(Long.parseLong(blocked.headers().firstValue("retry-after").orElseThrow()) > 0);
        assertTrue(blocked.headers().firstValue("access-control-expose-headers").orElseThrow().contains("Retry-After"));
    }

    @Test
    void chunkedJsonIsBoundedWithoutContentLength() throws Exception {
        byte[] oversized = ("{\"email\":\"" + "x".repeat(140_000) + "\"}").getBytes(StandardCharsets.UTF_8);
        var request = HttpRequest.newBuilder(uri("/auth/login")).header("Content-Type", "application/json")
                .header("X-CSRF-TOKEN", csrf()).POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(oversized))).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(413, response.statusCode());
        assertEquals("PAYLOAD_TOO_LARGE", mapper.readTree(response.body()).get("code").asString());
    }

    @Test
    void corsAllowsConfiguredOriginOnlyAndHealthIsPublic() throws Exception {
        var preflight = client.send(HttpRequest.newBuilder(uri("/auth/login")).header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "POST").method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals("http://localhost:5173", preflight.headers().firstValue("access-control-allow-origin").orElseThrow());
        var hostile = client.send(HttpRequest.newBuilder(uri("/auth/login")).header("Origin", "https://untrusted.invalid")
                .header("Access-Control-Request-Method", "POST").method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(403, hostile.statusCode());
        assertTrue(hostile.headers().firstValue("access-control-allow-origin").isEmpty());
        assertEquals("FORBIDDEN", mapper.readTree(hostile.body()).get("code").asString());
        assertTrue(hostile.headers().firstValue("content-type").orElseThrow().startsWith("application/problem+json"));
        assertEquals(200, send("GET", "/health/live", null, null).statusCode());
        assertEquals(200, send("GET", "/health/ready", null, null).statusCode());
        assertEquals(400, send("GET", "/health/live?private=search", null, null).statusCode());
        login();
        jdbc.update("UPDATE user_accounts SET active=false WHERE id=?", USER_ID);
        assertEquals(200, send("GET", "/health/live", null, null).statusCode());
        assertEquals(200, send("GET", "/health/ready", null, null).statusCode());
    }

    @Test
    void unsupportedMediaAndMethodReturnSafeProblems() throws Exception {
        login();
        var unsupported = client.send(HttpRequest.newBuilder(uri("/auth/password"))
                .header("Content-Type", "text/plain").header("X-CSRF-TOKEN", csrf())
                .PUT(HttpRequest.BodyPublishers.ofString("private-body-sentinel")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(415, unsupported.statusCode(), unsupported.body());
        assertEquals("UNSUPPORTED_MEDIA_TYPE", mapper.readTree(unsupported.body()).get("code").asString());
        assertFalse(unsupported.body().contains("private-body-sentinel"));
        var wrongMethod = send("DELETE", "/auth/me", null, csrf());
        assertEquals(405, wrongMethod.statusCode(), wrongMethod.body());
        assertEquals("METHOD_NOT_ALLOWED", mapper.readTree(wrongMethod.body()).get("code").asString());
        assertTrue(wrongMethod.headers().firstValue("x-request-id").isPresent());
    }

    private void login() throws Exception {
        var result = send("POST", "/auth/login", credentials(PASSWORD), csrf());
        assertEquals(200, result.statusCode(), result.body());
    }

    private String credentials(String password) {
        return mapper.writeValueAsString(Map.of("email", EMAIL, "password", password));
    }

    private String csrf() throws Exception {
        var response = send("GET", "/auth/csrf", null, null);
        assertEquals(200, response.statusCode(), response.body());
        JsonNode json = mapper.readTree(response.body());
        return json.get("token").asString();
    }

    private URI uri(String path) { return URI.create("http://localhost:" + port + "/api/v1" + path); }
    private String cookie() {
        return cookies.getCookieStore().getCookies().stream().filter(cookie -> cookie.getName().equals("BBSESSION"))
                .map(cookie -> cookie.getName() + "=" + cookie.getValue()).findFirst().orElseThrow();
    }

    private HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
        if (csrf != null) { request.header("X-CSRF-TOKEN", csrf); }
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
