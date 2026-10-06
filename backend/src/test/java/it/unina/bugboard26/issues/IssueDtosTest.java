package it.unina.bugboard26.issues;

import it.unina.bugboard26.issues.api.IssueDtos;
import it.unina.bugboard26.issues.domain.IssueType;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class IssueDtosTest {
    @Test
    void requestLabelsCopyCallerStateAndPreserveInvalidNullForValidation() {
        UUID label = UUID.randomUUID();
        List<UUID> input = new ArrayList<>();
        input.add(label);
        input.add(null);
        var create = new IssueDtos.CreateIssue("Title", "Description", IssueType.BUG, null, input);
        var update = new IssueDtos.UpdateIssue("Title", "Description", IssueType.BUG, null, input, 0L);
        input.clear();
        assertEquals(2, create.labelIds().size());
        assertEquals(2, update.labelIds().size());
        assertNull(create.labelIds().get(1));
        assertNull(update.labelIds().get(1));
        assertThrows(UnsupportedOperationException.class, () -> create.labelIds().clear());
        assertThrows(UnsupportedOperationException.class, () -> update.labelIds().add(label));
        assertNull(new IssueDtos.CreateIssue("Title", "Description", IssueType.BUG, null, null).labelIds());
        assertNull(new IssueDtos.UpdateIssue("Title", "Description", IssueType.BUG, null, null, 0L).labelIds());
    }

    @Test
    void eventCopiesNestedJsonCollectionsWithoutDroppingNullValues() {
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("before", null);
        delta.put("after", "Title");
        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("title", delta);
        List<Object> labels = new ArrayList<>();
        labels.add(delta);
        labels.add(null);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("labels", labels);
        snapshot.put("assignee", null);
        var event = new IssueDtos.IssueEvent(UUID.randomUUID(), 1L, UUID.randomUUID(), null, null,
                "CREATED", 0L, changes, snapshot);
        delta.clear();
        labels.clear();
        changes.clear();
        snapshot.clear();
        assertEquals("Title", ((Map<?, ?>) event.changes().get("title")).get("after"));
        List<?> recordedLabels = (List<?>) event.snapshot().get("labels");
        assertEquals(2, recordedLabels.size());
        assertNull(recordedLabels.get(1));
        assertTrue(((Map<?, ?>) recordedLabels.get(0)).containsKey("before"));
        assertTrue(event.snapshot().containsKey("assignee"));
        assertThrows(UnsupportedOperationException.class, () -> event.snapshot().clear());
        assertThrows(UnsupportedOperationException.class, recordedLabels::clear);
        assertThrows(UnsupportedOperationException.class, () -> ((Map<?, ?>) recordedLabels.get(0)).clear());
        assertNull(new IssueDtos.IssueEvent(UUID.randomUUID(), 1L, UUID.randomUUID(), null, null,
                "COMMENT_ADDED", null, Map.of(), null).snapshot());
    }
}
