package it.unina.bugboard26.labels;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import it.unina.bugboard26.BugBoard26Application;
import it.unina.bugboard26.auth.domain.AuthPrincipal;
import it.unina.bugboard26.issues.application.LabelDirectory;
import it.unina.bugboard26.labels.api.LabelDtos;
import it.unina.bugboard26.labels.application.LabelService;
import it.unina.bugboard26.labels.persistence.LabelEventRepository;
import it.unina.bugboard26.shared.domain.DomainException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(classes = BugBoard26Application.class)
@ActiveProfiles("test")
@Testcontainers
@Transactional
class LabelIntegrationTest {
    private static final String PASSWORD = "UserLifecycleIntegrationOnly";
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
        "postgres:18.6@sha256:fc973eb97c9fd04bfa1840e0f510719a584ccb3be8debfe6a4144637a9dfe8cf").asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("bugboard_labels_test").withUsername("bugboard_owner").withPassword(PASSWORD).withInitScript("users-init.sql");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "bugboard_runtime");
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("spring.flyway.url", DATABASE::getJdbcUrl);
        properties.add("spring.flyway.user", () -> "bugboard_owner");
        properties.add("spring.flyway.password", () -> PASSWORD);
    }

    @Autowired private LabelService service;
    @Autowired private LabelDirectory directory;
    @Autowired private JdbcTemplate jdbc;
    @MockitoSpyBean private LabelEventRepository events;
    private UUID actorId;

    @BeforeEach
    void authenticate() {
        actorId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO user_accounts VALUES (?,?,'Test Admin','test-hash','ADMIN',true,false,0,0,now(),now())
            """, actorId, actorId + "@example.test");
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            new AuthPrincipal(actorId, 0), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void normalizesNamesAndPersistsSafeAudit() {
        LabelDtos.Label label = service.create(new LabelDtos.CreateLabel("  Cafe\u0301  ", "blue"));
        assertEquals("Café", label.name());
        assertEquals("café", jdbc.queryForObject("SELECT normalized_name FROM labels WHERE id=?", String.class, label.id()));
        assertEquals(0, label.version());
        assertTrue(label.active());
        String changes = jdbc.queryForObject("SELECT changes::text FROM label_events WHERE label_id=?", String.class, label.id());
        assertTrue(changes.contains("Café"));
        assertFalse(changes.contains("test-hash"));
        assertEquals("LABEL_ALREADY_EXISTS", assertThrows(DomainException.class, () ->
            service.create(new LabelDtos.CreateLabel("CAFÉ", "red"))).code());
    }

    @Test
    void updatesOneVersionAndKeepsHistoricNamesAndColors() {
        LabelDtos.Label label = service.create(new LabelDtos.CreateLabel("Old name", "blue"));
        LabelDtos.Label changed = service.update(label.id(), new LabelDtos.UpdateLabel("New name", "green", false, 0L));
        assertEquals(1, changed.version());
        assertFalse(changed.active());
        assertEquals(2, countEvents(label.id()));
        String changes = jdbc.queryForObject("SELECT changes::text FROM label_events WHERE label_id=? AND event_type='LABEL_UPDATED'", String.class, label.id());
        assertTrue(changes.contains("Old name"));
        assertTrue(changes.contains("New name"));
        assertTrue(changes.contains("blue"));
        assertTrue(changes.contains("green"));
    }

    @Test
    void identicalUpdateIsNoOpButStillChecksVersion() {
        LabelDtos.Label label = service.create(new LabelDtos.CreateLabel("Same", "gray"));
        String updatedAt = jdbc.queryForObject("SELECT updated_at::text FROM labels WHERE id=?", String.class, label.id());
        assertEquals(label, service.update(label.id(), new LabelDtos.UpdateLabel(" Same ", "gray", true, 0L)));
        assertEquals(updatedAt, jdbc.queryForObject("SELECT updated_at::text FROM labels WHERE id=?", String.class, label.id()));
        assertEquals(1, countEvents(label.id()));
        assertEquals("VERSION_CONFLICT", assertThrows(DomainException.class, () ->
            service.update(label.id(), new LabelDtos.UpdateLabel("Same", "gray", true, 1L))).code());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "x\nx", "x\u0000x", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"})
    void rejectsInvalidNames(String name) {
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () ->
            service.create(new LabelDtos.CreateLabel(name, "blue"))).code());
    }

    @ParameterizedTest
    @ValueSource(strings = {"BLUE", "orange", "", " Blue "})
    void rejectsColorsOutsideExactPalette(String color) {
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () ->
            service.create(new LabelDtos.CreateLabel("Valid name", color))).code());
    }

    @Test
    void acceptsUnicodeCodePointBoundaryAndLiteralSearch() {
        String name = "😀".repeat(32);
        service.create(new LabelDtos.CreateLabel(name, "purple"));
        service.create(new LabelDtos.CreateLabel("100%_\\ ready", "amber"));
        assertEquals(1, service.list("%_\\", "true", 0, 20).totalElements());
        assertEquals(1, service.list(name, "true", 0, 20).totalElements());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () ->
            service.create(new LabelDtos.CreateLabel("😀".repeat(33), "blue"))).code());
    }

    @Test
    void activeFilterPaginationAndMissingIdsAreDeterministic() {
        LabelDtos.Label beta = service.create(new LabelDtos.CreateLabel("Beta", "blue"));
        service.create(new LabelDtos.CreateLabel("Alpha", "gray"));
        service.update(beta.id(), new LabelDtos.UpdateLabel("Beta", "blue", false, 0L));
        assertEquals("Alpha", service.list(null, "all", 0, 1).items().getFirst().name());
        assertEquals(2, service.list(null, "all", 5, 1).totalElements());
        assertTrue(service.list(null, "all", 5, 1).items().isEmpty());
        assertEquals(1, service.list(null, "true", 0, 20).totalElements());
        assertEquals(1, service.list(null, "false", 0, 20).totalElements());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class, () -> service.list(null, "yes", 0, 20)).code());
        assertEquals("INVALID_FILTER", assertThrows(DomainException.class, () -> service.list(null, "all", 0, 101)).code());
        assertEquals("NOT_FOUND", assertThrows(DomainException.class, () ->
            service.update(UUID.randomUUID(), new LabelDtos.UpdateLabel("Other", "red", true, 0L))).code());
    }

    @Test
    void inactiveExistingLabelsRemainButCannotBeNewlyAssociated() {
        LabelDtos.Label label = service.create(new LabelDtos.CreateLabel("Inactive", "red"));
        service.update(label.id(), new LabelDtos.UpdateLabel("Inactive", "red", false, 0L));
        assertFalse(directory.lockAndValidate(List.of(label.id()), List.of(label.id())).getFirst().active());
        assertTrue(directory.lockAndValidate(List.of(), List.of(label.id())).isEmpty());
        assertEquals("LABEL_NOT_ACTIVE", assertThrows(DomainException.class, () ->
            directory.lockAndValidate(List.of(label.id()), List.of())).code());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () ->
            directory.lockAndValidate(List.of(label.id(), label.id()), List.of())).code());
        assertEquals("VALIDATION_ERROR", assertThrows(DomainException.class, () ->
            directory.lockAndValidate(java.util.stream.Stream.generate(UUID::randomUUID).limit(21).toList(), List.of())).code());
        assertEquals("NOT_FOUND", assertThrows(DomainException.class, () ->
            directory.lockAndValidate(List.of(UUID.randomUUID()), List.of())).code());
    }

    @Test
    void acceptsTwentyDistinctActiveLabelsAndEmptySelection() {
        List<UUID> ids = java.util.stream.IntStream.range(0, 20)
            .mapToObj(index -> service.create(new LabelDtos.CreateLabel("Label " + index, "gray")).id()).toList();
        assertEquals(20, directory.lockAndValidate(ids, List.of()).size());
        assertTrue(directory.lockAndValidate(List.of(), List.of()).isEmpty());
    }

    @Test
    void renameCannotCollideWithAnotherNormalizedName() {
        service.create(new LabelDtos.CreateLabel("Existing", "gray"));
        LabelDtos.Label other = service.create(new LabelDtos.CreateLabel("Other", "blue"));
        assertEquals("LABEL_ALREADY_EXISTS", assertThrows(DomainException.class, () ->
            service.update(other.id(), new LabelDtos.UpdateLabel(" EXISTING ", "blue", true, 0L))).code());
    }

    @Test
    void auditFailureRollsBackLabelCreation() {
        doThrow(new DataAccessResourceFailureException("Synthetic audit failure")).when(events).insert(any(), any(), any(), anyString(), anyList());
        assertThrows(DataAccessResourceFailureException.class, () -> service.create(new LabelDtos.CreateLabel("Rollback label", "blue")));
        TestTransaction.end();
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM labels WHERE name='Rollback label'", Integer.class));
    }

    @Test
    void viewerReadsLabelsAndCannotManageCatalog() {
        service.create(new LabelDtos.CreateLabel("Readable", "gray"));
        UUID viewer = UUID.randomUUID();
        jdbc.update("INSERT INTO user_accounts VALUES (?,?,'Viewer','test-hash','VIEWER',true,false,0,0,now(),now())", viewer, viewer + "@example.test");
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(viewer, 0), null, List.of()));
        assertEquals(1, service.list(null, "true", 0, 20).totalElements());
        assertEquals("FORBIDDEN", assertThrows(DomainException.class, () -> service.create(new LabelDtos.CreateLabel("Forbidden", "blue"))).code());
    }

    private int countEvents(UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM label_events WHERE label_id=?", Integer.class, id);
    }
}
