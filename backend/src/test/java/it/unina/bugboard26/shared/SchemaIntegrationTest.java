package it.unina.bugboard26.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.stream.Stream;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Database contracts are exercised against the release PostgreSQL image, never H2. */
@Testcontainers
class SchemaIntegrationTest {
    private static final String OWNER = "bugboard_owner";
    private static final String RUNTIME = "bugboard_runtime";
    private static final String TEST_PASSWORD = "SchemaIntegrationOnly123";
    private static final String USER = "10000000-0000-0000-0000-000000000001";
    private static final String ISSUE = "20000000-0000-0000-0000-000000000001";
    private static final String EVENT = "30000000-0000-0000-0000-000000000001";
    private static final String LABEL = "40000000-0000-0000-0000-000000000001";
    private static final String MISSING = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    private static final String IMMUTABLE_INSERTS = """
        INSERT INTO issue_events VALUES ('30000000-0000-0000-0000-000000000001', DEFAULT,
            '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
            '2026-01-02Z', 'STATE_CHANGED', 1, '{}', NULL, '2026-01-02Z');
        INSERT INTO resolution_cycles VALUES ('50000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
            '2026-01-01Z', '2026-01-02Z', '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', 86400);
        INSERT INTO account_events VALUES (gen_random_uuid(), NULL,
            '10000000-0000-0000-0000-000000000001', '2026-01-01Z', 'BOOTSTRAPPED', '{}');
        INSERT INTO label_events VALUES (gen_random_uuid(),
            '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
            '2026-01-01Z', 'CREATED', '{}');
        INSERT INTO comments VALUES (gen_random_uuid(), '20000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', 'Discussione immutabile', '2026-01-01Z', DEFAULT);
        INSERT INTO notifications VALUES ('60000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001', 'RESOLVED', '2026-01-02Z', NULL);
        """;

    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
        "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf")
        .asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("bugboard26_schema_test")
        .withUsername(OWNER)
        .withPassword(TEST_PASSWORD);

    @BeforeAll
    static void migrateAndSeed() throws SQLException {
        execute(OWNER, "CREATE ROLE bugboard_runtime LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '"
            + TEST_PASSWORD + "'");
        Flyway flyway = Flyway.configure().dataSource(DATABASE.getJdbcUrl(), OWNER, TEST_PASSWORD)
            .locations("classpath:db/migration").load();
        assertEquals(4, flyway.migrate().migrationsExecuted);
        assertEquals(0, flyway.migrate().migrationsExecuted);
        flyway.validate();
        execute(RUNTIME, """
            INSERT INTO user_accounts VALUES ('10000000-0000-0000-0000-000000000001',
                'admin@bugboard.local', 'Admin', 'test-hash', 'ADMIN', true, false, 0, 0,
                '2026-01-01Z', '2026-01-01Z');
            INSERT INTO issues (id, title, description, title_search, description_search, type,
                priority, status, reporter_id, cycle_started_at, created_at, updated_at, last_activity_at)
            VALUES ('20000000-0000-0000-0000-000000000001', 'Primo bug', 'Descrizione completa',
                'primo bug', 'descrizione completa', 'BUG', 'MEDIUM', 'TODO',
                '10000000-0000-0000-0000-000000000001', '2026-01-01Z', '2026-01-01Z',
                '2026-01-01Z', '2026-01-01Z');
            INSERT INTO labels VALUES ('40000000-0000-0000-0000-000000000001', 'Backend',
                'backend', 'blue', true, 0, '2026-01-01Z', '2026-01-01Z');
            """);
        execute(RUNTIME, IMMUTABLE_INSERTS);
    }

    @Test
    void migratesAllTablesAndSearchIndexesOnTheRequiredServer() throws SQLException {
        assertEquals("180006", scalar(OWNER, "SHOW server_version_num"));
        assertEquals("16", scalar(OWNER,
            "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"));
        assertEquals("2", scalar(OWNER,
            "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%USING gin%'"));
        assertEquals("1", scalar(OWNER, "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'"));
        assertEquals("5", scalar(OWNER,
            "SELECT count(*) FROM information_schema.triggers WHERE event_manipulation = 'UPDATE' AND trigger_schema = 'public'"));
    }

    @ParameterizedTest
    @MethodSource("invalidIssueUpdates")
    void rejectsInvalidIssueInvariants(String assignment) throws SQLException {
        assertSqlState("23514", "UPDATE issues SET " + assignment + " WHERE id = '" + ISSUE + "'");
    }

    static Stream<String> invalidIssueUpdates() {
        return Stream.of(
            "title = 'ab'", "title = ''", "description = 'too short'",
            "description = repeat('x', 10001)", "title_search = ''", "description_search = ''",
            "type = 'OTHER'", "priority = 'URGENT'", "status = 'CLOSED'", "version = -1", "number = 0",
            "status = 'DUPLICATE'", "duplicate_of_id = id", "status = 'RESOLVED'",
            "resolved_at = '2026-01-02Z'", "status = 'IN_PROGRESS'", "archived = true",
            "archived_at = '2026-01-02Z'", "archived_by = reporter_id",
            "archived = true, archived_at = '2026-01-02Z'", "archived = true, archived_by = reporter_id",
            "archived = true, archived_by = reporter_id, archived_at = '2025-12-31Z'",
            "status = 'RESOLVED', resolved_at = '2025-12-31Z'",
            "updated_at = '2025-12-31Z'", "last_activity_at = '2025-12-31Z'",
            "cycle_started_at = '2025-12-31Z'", "due_date = '2101-01-01'"
        );
    }

    @ParameterizedTest
    @MethodSource("invalidAccountUpdates")
    void rejectsInvalidAccountInvariants(String assignment) throws SQLException {
        assertSqlState("23514", "UPDATE user_accounts SET " + assignment + " WHERE id = '" + USER + "'");
    }

    static Stream<String> invalidAccountUpdates() {
        return Stream.of("email = 'ADMIN@BUGBOARD.LOCAL'", "email = ' admin@bugboard.local'",
            "email = 'a'", "display_name = 'A'", "password_hash = ''", "role = 'ROOT'",
            "version = -1", "auth_version = -1", "updated_at = '2025-12-31Z'");
    }

    @ParameterizedTest
    @MethodSource("invalidLabelUpdates")
    void rejectsInvalidLabelInvariants(String assignment) throws SQLException {
        assertSqlState("23514", "UPDATE labels SET " + assignment + " WHERE id = '" + LABEL + "'");
    }

    static Stream<String> invalidLabelUpdates() {
        return Stream.of("name = ''", "normalized_name = ''", "color = 'orange'", "version = -1",
            "updated_at = '2025-12-31Z'");
    }

    @ParameterizedTest
    @MethodSource("immutableMutations")
    void ownerCannotAccidentallyRewriteOrTruncateHistory(String sql) throws SQLException {
        assertSqlState("55000", sql);
    }

    static Stream<String> immutableMutations() {
        return immutableTables().stream().flatMap(table -> Stream.of(
            "UPDATE " + table + " SET id = id", "DELETE FROM " + table, "TRUNCATE " + table + " CASCADE"));
    }

    @Test
    void runtimeHasOnlyAppendPermissionsAndCannotCreateSchemaObjects() throws SQLException {
        for (String table : immutableTables()) {
            assertEquals("true", scalar(OWNER, "SELECT has_table_privilege('bugboard_runtime', '"
                + table + "', 'SELECT')"));
            assertEquals("true", scalar(OWNER, "SELECT has_table_privilege('bugboard_runtime', '"
                + table + "', 'INSERT')"));
            for (String privilege : List.of("UPDATE", "DELETE", "TRUNCATE", "TRIGGER")) {
                assertEquals("false", scalar(OWNER, "SELECT has_table_privilege('bugboard_runtime', '"
                    + table + "', '" + privilege + "')"));
            }
            assertEquals("42501", assertThrows(SQLException.class,
                () -> execute(RUNTIME, "DELETE FROM " + table)).getSQLState());
        }
        assertEquals("false", scalar(OWNER,
            "SELECT has_schema_privilege('bugboard_runtime', 'public', 'CREATE')"));
        assertEquals("42501", assertThrows(SQLException.class,
            () -> execute(RUNTIME, "CREATE TABLE forbidden_object (id integer)")).getSQLState());
        assertEquals("42501", assertThrows(SQLException.class,
            () -> execute(RUNTIME, "ALTER TABLE issues ADD COLUMN forbidden_column integer")).getSQLState());
        assertEquals("42501", assertThrows(SQLException.class,
            () -> execute(RUNTIME, "UPDATE notifications SET type = 'ASSIGNED'")).getSQLState());
        execute(RUNTIME, "UPDATE notifications SET read_at = '2026-01-03Z'");
        execute(RUNTIME, "UPDATE notifications SET read_at = NULL");
    }

    @Test
    void sessionFrameworkSchemaSupportsAttributesAndCascadeCleanup() throws SQLException {
        execute(RUNTIME, """
            INSERT INTO spring_session VALUES ('70000000-0000-0000-0000-000000000001',
                '70000000-0000-0000-0000-000000000002', 1, 1, 1800, 1800001,
                '10000000-0000-0000-0000-000000000001');
            INSERT INTO spring_session_attributes VALUES ('70000000-0000-0000-0000-000000000001',
                'SPRING_SECURITY_CONTEXT', decode('010203', 'hex'));
            DELETE FROM spring_session WHERE primary_id = '70000000-0000-0000-0000-000000000001';
            """);
        assertEquals("0", scalar(OWNER, "SELECT count(*) FROM spring_session_attributes"));
    }

    @Test
    void enforcesEventsCyclesImagesCommentsAndNotifications() throws SQLException {
        String eventPrefix = "INSERT INTO issue_events (id, issue_id, actor_id, occurred_at, event_type, "
            + "issue_version, changes, snapshot, created_at) VALUES (gen_random_uuid(), '" + ISSUE + "', '"
            + USER + "', '2026-01-01Z', ";
        for (String payload : List.of("'ISSUE_CREATED', 0, '{}', NULL", "'STATE_CHANGED', 0, '{}', '{}'",
            "'UNKNOWN', 0, '{}', NULL", "'STATE_CHANGED', -1, '{}', NULL", "'STATE_CHANGED', 0, '[]', NULL")) {
            assertSqlState("23514", eventPrefix + payload + ", '2026-01-01Z')");
        }
        execute(RUNTIME, eventPrefix + "'ISSUE_CREATED', 0, '{}', '{}', '2026-01-01Z')");
        String cyclePrefix = "INSERT INTO resolution_cycles VALUES (gen_random_uuid(), '" + ISSUE
            + "', (SELECT id FROM issue_events WHERE event_type = 'ISSUE_CREATED' LIMIT 1), ";
        assertSqlState("23514", cyclePrefix + "'2026-01-02Z', '2026-01-01Z', '" + USER + "', '" + USER + "', -86400)");
        assertSqlState("23514", cyclePrefix + "'2026-01-01Z', '2026-01-02Z', '" + USER + "', '" + USER + "', 1)");
        assertSqlState("23514", "INSERT INTO comments VALUES (gen_random_uuid(), '" + ISSUE + "', '"
            + USER + "', '', '2026-01-01Z', DEFAULT)");
        assertSqlState("23514", "INSERT INTO comments VALUES (gen_random_uuid(), '" + ISSUE + "', '"
            + USER + "', repeat('x', 5001), '2026-01-01Z', DEFAULT)");
        assertSqlState("23514", "UPDATE notifications SET read_at = '2026-01-01Z'");
        String imagePrefix = "INSERT INTO issue_images VALUES ('" + ISSUE
            + "', gen_random_uuid(), 'test.png', ";
        String hashAndTime = ", repeat('a', 64), '2026-01-01Z')";
        for (String properties : List.of("'image/gif', decode('01', 'hex'), 1, 1, 1",
            "'image/png', decode('01', 'hex'), 2, 1, 1", "'image/png', decode('01', 'hex'), 1, 4097, 1",
            "'image/png', decode('01', 'hex'), 1, 4096, 4096", "'image/png', decode('01', 'hex'), 1, 0, 1",
            "'image/png', decode('01', 'hex'), 5242881, 1, 1")) {
            assertSqlState("23514", imagePrefix + properties + hashAndTime);
        }
        execute(RUNTIME, imagePrefix + "'image/png', decode('01', 'hex'), 1, 1, 1" + hashAndTime);
        execute(RUNTIME, "DELETE FROM issue_images WHERE issue_id = '" + ISSUE + "'");
        assertSqlState("23514", "INSERT INTO account_events VALUES (gen_random_uuid(), NULL, '"
            + USER + "', '2026-01-01Z', 'PASSWORD_CHANGED', '{\"passwordHash\":\"secret\"}')");
    }

    @Test
    void foreignKeysAndNaturalKeysProtectReferences() throws SQLException {
        assertSqlState("23503", "UPDATE issues SET reporter_id = '" + MISSING + "'");
        assertSqlState("23503", "UPDATE issues SET assignee_id = '" + MISSING + "'");
        assertSqlState("23503", "UPDATE issues SET status = 'DUPLICATE', duplicate_of_id = '" + MISSING + "'");
        assertSqlState("23503", "INSERT INTO issue_labels VALUES ('" + ISSUE + "', '" + MISSING + "')");
        assertSqlState("23503", "INSERT INTO issue_labels VALUES ('" + MISSING + "', '" + LABEL + "')");
        assertSqlState("23001", "DELETE FROM user_accounts WHERE id = '" + USER + "'");
        assertSqlState("23001", "DELETE FROM issues WHERE id = '" + ISSUE + "'");
        assertSqlState("23505", "INSERT INTO user_accounts SELECT gen_random_uuid(), email, display_name, "
            + "password_hash, role, active, must_change_password, version, auth_version, created_at, updated_at "
            + "FROM user_accounts WHERE id = '" + USER + "'");
        assertSqlState("23505", "INSERT INTO labels SELECT gen_random_uuid(), name, normalized_name, color, "
            + "active, version, created_at, updated_at FROM labels WHERE id = '" + LABEL + "'");
        assertSqlState("23505", "INSERT INTO notifications SELECT gen_random_uuid(), recipient_id, event_id, "
            + "issue_id, type, created_at, read_at FROM notifications");
        execute(RUNTIME, "INSERT INTO issue_labels VALUES ('" + ISSUE + "', '" + LABEL + "')");
        assertSqlState("23505", "INSERT INTO issue_labels VALUES ('" + ISSUE + "', '" + LABEL + "')");
        execute(RUNTIME, "DELETE FROM issue_labels WHERE issue_id = '" + ISSUE + "'");
    }

    @Test
    void idempotencyAndRateLimitsHaveBoundedValidatedRetention() throws SQLException {
        String record = "INSERT INTO idempotency_records VALUES ('" + USER
            + "', '80000000-0000-0000-0000-000000000001', 'POST /api/issues', repeat('a', 64), ";
        assertSqlState("23514", record + "500, '{}', '" + ISSUE + "', '2026-01-01Z', '2026-01-02Z')");
        assertSqlState("23514", record + "201, '{}', '" + ISSUE + "', '2026-01-01Z', '2026-01-01Z')");
        execute(RUNTIME, record + "201, '{}', '" + ISSUE + "', '2026-01-01Z', '2026-01-02Z')");
        assertSqlState("23505", record + "201, '{}', '" + ISSUE + "', '2026-01-01Z', '2026-01-02Z')");
        execute(RUNTIME, "DELETE FROM idempotency_records");
        assertSqlState("23514", "INSERT INTO login_attempts VALUES (repeat('a',64), 'EMAIL', "
            + "'2026-01-01Z', -1, NULL, '2026-01-02Z')");
        assertSqlState("23514", "INSERT INTO login_attempts VALUES (repeat('a',64), 'OTHER', "
            + "'2026-01-01Z', 1, NULL, '2026-01-02Z')");
        execute(RUNTIME, "INSERT INTO login_attempts VALUES (repeat('a',64), 'EMAIL', "
            + "'2026-01-01Z', 1, NULL, '2026-01-02Z')");
        execute(RUNTIME, "UPDATE login_attempts SET failure_count = 2");
        execute(RUNTIME, "DELETE FROM login_attempts");
    }

    @Test
    void transactionFailureRollsBackDomainAuditAndNotification() throws SQLException {
        try (Connection connection = connection(RUNTIME); Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.execute("UPDATE issues SET title = 'Una modifica', title_search = 'una modifica'");
            statement.execute("INSERT INTO issue_events (id, issue_id, actor_id, occurred_at, event_type, "
                + "changes, created_at) VALUES ('90000000-0000-0000-0000-000000000001', '" + ISSUE
                + "', '" + USER + "', now(), 'FIELDS_UPDATED', '{}', now())");
            SQLException failure = assertThrows(SQLException.class, () -> statement.execute(
                "INSERT INTO notifications VALUES (gen_random_uuid(), '" + MISSING
                    + "', '90000000-0000-0000-0000-000000000001', '" + ISSUE + "', 'ASSIGNED', now(), NULL)"));
            assertEquals("23503", failure.getSQLState());
            connection.rollback();
        }
        assertEquals("Primo bug", scalar(OWNER, "SELECT title FROM issues WHERE id = '" + ISSUE + "'"));
        assertEquals("0", scalar(OWNER,
            "SELECT count(*) FROM issue_events WHERE id = '90000000-0000-0000-0000-000000000001'"));
    }

    private static List<String> immutableTables() {
        return List.of("issue_events", "account_events", "label_events", "resolution_cycles", "comments");
    }

    private static Connection connection(String user) throws SQLException {
        return DriverManager.getConnection(DATABASE.getJdbcUrl(), user, TEST_PASSWORD);
    }

    private static void execute(String user, String sql) throws SQLException {
        try (Connection connection = connection(user); Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private static String scalar(String user, String sql) throws SQLException {
        try (Connection connection = connection(user); Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            assertTrue(result.next());
            String value = String.valueOf(result.getObject(1));
            assertFalse(result.next());
            return value;
        }
    }

    private static void assertSqlState(String expected, String sql) throws SQLException {
        assertEquals(expected, assertThrows(SQLException.class, () -> execute(OWNER, sql)).getSQLState(), sql);
    }
}
